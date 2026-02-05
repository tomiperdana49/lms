
import mysql from 'mysql2/promise';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, '../.env') });

async function showSamples() {
    console.log('--- Database Sample Data ---');
    const connection = await mysql.createConnection({
        host: process.env.DB_HOST,
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        database: process.env.DB_NAME
    });

    try {
        console.log('\n[EMPLOYEES] Top 3:');
        const [employees] = await connection.query('SELECT full_name, email, job_position FROM employees LIMIT 3');
        console.table(employees);

        console.log('\n[ASSETS] Top 3:');
        const [assets] = await connection.query('SELECT name, code FROM assets LIMIT 3');
        console.table(assets);

        console.log('\n[USERS] Top 3 (Linked to Employee):');
        const [users] = await connection.query('SELECT name, email, role, employee_id FROM users WHERE employee_id IS NOT NULL LIMIT 3');
        console.table(users);

    } catch (err) {
        console.error('Error fetching samples:', err);
    } finally {
        await connection.end();
    }
}

showSamples();
