import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '../.env') });

const pool = mysql.createPool({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'lms_db',
    multipleStatements: true
});

async function clearData() {
    console.log('Connecting to database...');
    const conn = await pool.getConnection();
    try {
        console.log('Starting data wipe...');

        // Disable foreign key checks to avoid issues with CASCADE or constraints
        await conn.query('SET FOREIGN_KEY_CHECKS = 0');

        // 1. Clear Reading Logs
        console.log('Clearing reading_logs...');
        await conn.query('TRUNCATE TABLE reading_logs');

        // 2. Clear Meetings (Internal Training)
        console.log('Clearing meetings...');
        await conn.query('TRUNCATE TABLE meetings');

        // 3. Clear related Quiz Results
        console.log('Clearing quiz_results related to meetings...');
        await conn.query('DELETE FROM quiz_results WHERE meeting_id IS NOT NULL');

        // 4. Clear related Course Feedback
        console.log('Clearing course_feedback related to meetings...');
        await conn.query('DELETE FROM course_feedback WHERE meeting_id IS NOT NULL');

        // 5. Clear incentives (if any)
        // Usually, in this project, incentives are for reading logs or courses.
        // We'll clear the whole table if it's considered "reading log and training internal" data.
        // However, to be safe, we'll only clear if the description mentions reading log or if it's related to meetings.
        console.log('Clearing incentives...');
        await conn.query('TRUNCATE TABLE incentives');

        await conn.query('SET FOREIGN_KEY_CHECKS = 1');

        console.log('Data wipe completed successfully!');
    } catch (err) {
        console.error('Error during data wipe:', err);
    } finally {
        conn.release();
        await pool.end();
    }
}

clearData();
