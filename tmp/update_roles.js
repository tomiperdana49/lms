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
    database: process.env.DB_NAME,
    waitForConnections: true,
    connectionLimit: 1,
    queueLimit: 0
});

async function updateRoles() {
    console.log(`Connecting to ${process.env.DB_HOST}...`);
    try {
        const [result] = await pool.query("UPDATE users SET role = 'STAFF' WHERE role IS NULL OR role = ''");
        console.log(`Update successful! Rows affected: ${result.affectedRows}`);
    } catch (err) {
        console.error('Update failed:', err.message);
    } finally {
        await pool.end();
    }
}

updateRoles();
