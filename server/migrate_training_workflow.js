
import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load .env from project root
dotenv.config({ path: path.join(__dirname, '../.env') });

const migrate = async () => {
    try {
        const pool = mysql.createPool({
            host: process.env.DB_HOST,
            user: process.env.DB_USER,
            password: process.env.DB_PASSWORD,
            database: process.env.DB_NAME,
            multipleStatements: true
        });

        console.log('Migrating training_requests table...');

        // Add columns if they don't exist
        const columns = [
            "ADD COLUMN IF NOT EXISTS supervisor_name VARCHAR(255)",
            "ADD COLUMN IF NOT EXISTS supervisor_approved_at DATETIME",
            "ADD COLUMN IF NOT EXISTS hr_name VARCHAR(255)",
            "ADD COLUMN IF NOT EXISTS hr_approved_at DATETIME"
        ];

        for (const col of columns) {
            try {
                await pool.query(`ALTER TABLE training_requests ${col}`);
                console.log(`Executed: ${col}`);
            } catch (e) {
                // Ignore if exists (though IF NOT EXISTS handles it in newer MySQL/MariaDB)
                console.log(`Skipped/Error: ${col}`);
            }
        }

        console.log('Migration successful!');
        process.exit(0);
    } catch (err) {
        console.error('Migration failed:', err);
        process.exit(1);
    }
};

migrate();
