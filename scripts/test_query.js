
import mysql from 'mysql2/promise';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, '../.env') });

async function runQuery() {
    const connection = await mysql.createConnection({
        host: process.env.DB_HOST,
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        database: process.env.DB_NAME // 'lms' likely
    });

    try {
        console.log('Connected to DB:', process.env.DB_NAME);

        // Adapted Query: Removed 'simasset.' prefix as we are likely in the same DB or 'lms' DB contains these tables now.
        // If tables are in 'simasset' DB on the same server, we might need permission, but let's try assuming they are in current DB first
        // based on previous migration.
        const sql = `
            SELECT 
                a.asset_uuid, 
                a.code, 
                a.name, 
                ah.asset_holder_uuid, 
                ah.employee_id, 
                ah.assigned_at, 
                ah.returned_at 
            FROM assets a
            LEFT JOIN sub_categories sc ON a.sub_category_id = sc.id
            LEFT JOIN categories c ON sc.category_id = c.id 
            LEFT JOIN asset_holders ah ON a.id = ah.asset_id 
            WHERE c.name = 'Buku' 
            AND a.deleted_at IS NULL 
            AND ah.employee_id IS NOT NULL
            AND ah.assigned_at BETWEEN '2026-01-29' AND '2026-01-29'
            AND ah.employee_id = '0202601'
            AND a.name LIKE '%(Testing) Atomic Habits%'
            GROUP BY ah.asset_holder_uuid 
            LIMIT 1;
        `;

        console.log('Running Query:');
        console.log(sql);

        const [rows] = await connection.query(sql);
        console.log('Result:', rows);

    } catch (err) {
        console.error('Error executing query:', err);
    } finally {
        await connection.end();
    }
}

runQuery();
