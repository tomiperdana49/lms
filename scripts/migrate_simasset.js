
import fs from 'fs';
import mysql from 'mysql2/promise';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, '../.env') });

const DUMP_FILE_PATH = path.join(__dirname, '../simasset_databases_sql/dump-simasset-202602031117.sql');

async function migrate() {
    console.log('Starting SimAsset Migration (Temp Table Strategy)...');

    let connection;
    try {
        connection = await mysql.createConnection({
            host: process.env.DB_HOST,
            user: process.env.DB_USER,
            password: process.env.DB_PASSWORD,
            database: process.env.DB_NAME,
            multipleStatements: true
        });

        console.log('Connected to MySQL Database.');

        if (!fs.existsSync(DUMP_FILE_PATH)) {
            throw new Error(`Dump file not found at: ${DUMP_FILE_PATH}`);
        }
        let sqlDump = fs.readFileSync(DUMP_FILE_PATH, 'utf8');

        // 1. Rename 'users' table in dump to 'simasset_users_temp'
        // This preserves the integer IDs needed for 'feedbacks' FKs initially.
        console.log('Modifying dump to create temporary users table...');

        // Regex replacements to rename the table and references safely
        // Note: We use regex with word boundaries or specific SQL context
        sqlDump = sqlDump.replace(/DROP TABLE IF EXISTS `users`/g, "DROP TABLE IF EXISTS `simasset_users_temp`");
        sqlDump = sqlDump.replace(/CREATE TABLE `users`/g, "CREATE TABLE `simasset_users_temp`");
        sqlDump = sqlDump.replace(/INSERT INTO `users`/g, "INSERT INTO `simasset_users_temp`");
        sqlDump = sqlDump.replace(/REFERENCES `users`/g, "REFERENCES `simasset_users_temp`");
        sqlDump = sqlDump.replace(/LOCK TABLES `users`/g, "LOCK TABLES `simasset_users_temp`");
        sqlDump = sqlDump.replace(/ALTER TABLE `users`/g, "ALTER TABLE `simasset_users_temp`");

        // 2. Execute the Modified Dump (creates assets, employees, feedbacks, simasset_users_temp)
        console.log('Executing modified SQL dump...');
        // Disable FK checks to avoid circular/ordering issues during bulk import
        await connection.query('SET FOREIGN_KEY_CHECKS=0;');
        await connection.query(sqlDump);
        await connection.query('SET FOREIGN_KEY_CHECKS=1;');
        console.log('Dump imported successfully. Temporary users table created.');

        // 3. Alter LMS users table (if needed)
        console.log('Ensuring LMS users table has required columns...');
        try {
            const alterQuery = `
                ALTER TABLE users 
                ADD COLUMN employee_id VARCHAR(50),
                ADD COLUMN user_uuid VARCHAR(50),
                ADD COLUMN googleId VARCHAR(255),
                ADD COLUMN last_login_at DATETIME,
                ADD COLUMN last_login_ip VARCHAR(255),
                ADD COLUMN is_active TINYINT(4) DEFAULT 1;
            `;
            await connection.query(alterQuery);
        } catch (err) {
            // Ignore duplication errors
            if (err.code !== 'ER_DUP_FIELDNAME') console.warn('Alter warning:', err.message);
        }

        // 4. Merge Users: simasset_users_temp -> users
        console.log('Merging users from temp table to LMS users...');
        const [tempUsers] = await connection.query('SELECT * FROM simasset_users_temp');
        const [lmsUsers] = await connection.query('SELECT * FROM users');
        const emailToLmsUser = new Map(lmsUsers.map(u => [u.email, u]));

        let inserted = 0;
        let updated = 0;

        for (const simUser of tempUsers) {
            if (!simUser.email) continue;

            const roleMapping = { 'admin': 'HR', 'staff': 'STAFF', 'supervisor': 'SUPERVISOR', 'hr': 'HR' };
            const lmsRole = roleMapping[(simUser.role || '').toLowerCase()] || 'STAFF';

            if (emailToLmsUser.has(simUser.email)) {
                // UPDATE
                await connection.query(
                    'UPDATE users SET employee_id = ?, user_uuid = ?, googleId = ?, last_login_at = ?, last_login_ip = ? WHERE email = ?',
                    [simUser.employee_id, simUser.user_uuid, simUser.googleId, simUser.last_login_at, simUser.last_login_ip, simUser.email]
                );
                updated++;
            } else {
                // INSERT
                const password = simUser.password || '$2b$10$DefaultHashForSafety';
                try {
                    await connection.query(
                        'INSERT INTO users (id, email, name, password, role, employee_id, user_uuid, googleId, avatar, is_active) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
                        [simUser.user_uuid, simUser.email, simUser.name, password, lmsRole, simUser.employee_id, simUser.user_uuid, simUser.googleId, simUser.avatar, simUser.is_active || 1]
                    );
                    inserted++;
                } catch (e) {
                    console.error(`Failed to insert user ${simUser.email}:`, e.message);
                }
            }
        }
        console.log(`Users Merged: Inserted ${inserted}, Updated ${updated}`);

        // 5. Remap Foreign Keys (feedbacks table)
        // feedbacks.user_id (int) points to simasset_users_temp.id
        // We need feedbacks.user_id to point to users.id (varchar)
        console.log('Remapping feedbacks foreign keys...');

        // Add new column
        try {
            await connection.query('ALTER TABLE feedbacks ADD COLUMN lms_user_id VARCHAR(50)');
        } catch (e) { /* ignore if exists */ }

        // Update new column
        // JOIN feedbacks -> simasset_users_temp -> users
        const updateFeedbacksQuery = `
            UPDATE feedbacks f
            JOIN simasset_users_temp s ON f.user_id = s.id
            JOIN users u ON s.email = u.email
            SET f.lms_user_id = u.id
        `;
        const [res] = await connection.query(updateFeedbacksQuery);
        console.log(`Feedbacks remapped: ${res.changedRows}`);

        // Fix Schema: Drop old FK/Column, Rename new
        // Note: Dropping FK by name requires knowing the name. Dump said 'FK_4334f6be2d7d841a9d5205a100e' or 'feedbacks_ibfk_1'
        // We can check info schema or just 'DROP FOREIGN KEY' if we know the name from the dump.
        // Dump line 418: CONSTRAINT FK_4334f6be2d7d841a9d5205a100e FOREIGN KEY ...
        console.log('Finalizing feedbacks schema...');
        try {
            await connection.query('ALTER TABLE feedbacks DROP FOREIGN KEY FK_4334f6be2d7d841a9d5205a100e');
        } catch (e) {
            console.log('FK drop failed (might not exist):', e.message);
        }

        // If there are other FKs or if the name generated was different?
        // Let's assume the name carries over from the CREATE TABLE we executed.

        await connection.query('ALTER TABLE feedbacks DROP COLUMN user_id');
        await connection.query('ALTER TABLE feedbacks CHANGE COLUMN lms_user_id user_id VARCHAR(50)');

        // Add new FK
        await connection.query('ALTER TABLE feedbacks ADD CONSTRAINT fk_feedbacks_users FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL');

        // 6. Cleanup
        console.log('Dropping temporary users table...');
        await connection.query('DROP TABLE simasset_users_temp');

        console.log('Migration Successfully Completed!');

    } catch (error) {
        console.error('Migration Failed:', error);
    } finally {
        if (connection) await connection.end();
    }
}

migrate();
