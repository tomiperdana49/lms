
import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load .env from project root (one level up)
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

        console.log('Dropping old incentives table...');
        await pool.query('DROP TABLE IF EXISTS incentives');

        console.log('Creating new incentives table...');
        const createTableSQL = `
        CREATE TABLE IF NOT EXISTS incentives (
            id INT AUTO_INCREMENT PRIMARY KEY,
            employee_name VARCHAR(255) NOT NULL,
            course_name VARCHAR(255) NOT NULL,
            description TEXT,
            start_date DATE,
            end_date DATE,
            evidence_url VARCHAR(255),
            status VARCHAR(50) DEFAULT 'Pending',
            reward DECIMAL(15, 2) DEFAULT 0,
            monthly_amount DECIMAL(15, 2) DEFAULT 0
        );`;
        await pool.query(createTableSQL);

        console.log('Incentives table updated successfully!');
        process.exit(0);
    } catch (err) {
        console.error('Migration failed:', err);
        process.exit(1);
    }
};

migrate();
