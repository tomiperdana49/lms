
import mysql from 'mysql2/promise';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, '../.env') });

async function verify() {
    console.log('Verifying SimAsset Import...');
    const connection = await mysql.createConnection({
        host: process.env.DB_HOST,
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        database: process.env.DB_NAME
    });

    try {
        const [users] = await connection.query('SELECT COUNT(*) as count FROM users');
        const [employees] = await connection.query('SELECT COUNT(*) as count FROM employees');
        const [assets] = await connection.query('SELECT COUNT(*) as count FROM assets');
        const [feedbacks] = await connection.query('SELECT COUNT(*) as count FROM feedbacks');
        const [branches] = await connection.query('SELECT COUNT(*) as count FROM branches');

        console.log('--- Database Counts ---');
        console.log(`Users: ${users[0].count}`);
        console.log(`Employees: ${employees[0].count}`);
        console.log(`Assets: ${assets[0].count}`);
        console.log(`Feedbacks: ${feedbacks[0].count}`);
        console.log(`Branches: ${branches[0].count}`);

        // Check for Users with employee_id
        const [linkedUsers] = await connection.query('SELECT COUNT(*) as count FROM users WHERE employee_id IS NOT NULL');
        console.log(`Users linked to Employees: ${linkedUsers[0].count}`);

    } catch (err) {
        console.error('Verification Error:', err);
    } finally {
        await connection.end();
    }
}

verify();
