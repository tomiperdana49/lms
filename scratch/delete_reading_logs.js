import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '../.env') });

const pool = mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME
});

async function clearReadingLogs() {
    try {
        console.log('Connecting to database...');
        const [result] = await pool.query('DELETE FROM reading_logs');
        console.log(`Successfully deleted ${result.affectedRows} reading logs.`);
        process.exit(0);
    } catch (error) {
        console.error('Error deleting reading logs:', error);
        process.exit(1);
    }
}

clearReadingLogs();
