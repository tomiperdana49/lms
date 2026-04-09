import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '../.env') });

async function grantMassAccess() {
    const pool = mysql.createPool({
        host: process.env.DB_HOST,
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        database: process.env.DB_NAME
    });

    console.log(`Connecting to ${process.env.DB_HOST}...`);
    try {
        // 1. Get all employees
        const [employees] = await pool.query('SELECT id_employee, full_name, email, job_level, branch_id FROM employees');
        
        // 2. Get all existing user employee_ids
        const [users] = await pool.query('SELECT employee_id FROM users WHERE employee_id IS NOT NULL');
        const existingEmployeeIds = new Set(users.map(u => u.employee_id));

        console.log(`Initial: ${employees.length} employees, ${existingEmployeeIds.size} users.`);

        let createdCount = 0;
        for (const emp of employees) {
            if (!existingEmployeeIds.has(emp.id_employee)) {
                // Determine branch name from branch_id mapping if possible,
                // but we can just leave it as 'Headquarters' or NULL if we don't have a lookup.
                // For simplicity, we'll try to find the branch name from branches table.
                
                const id = Date.now().toString() + Math.floor(Math.random() * 1000);
                const role = 'STAFF';
                const avatar = `https://ui-avatars.com/api/?name=${emp.full_name}&background=random`;

                await pool.query(
                    'INSERT INTO users (id, email, password, name, role, avatar, employee_id) VALUES (?, ?, ?, ?, ?, ?, ?)',
                    [id, emp.email, 'nusanet-oauth-placeholder', emp.full_name, role, avatar, emp.id_employee]
                );
                createdCount++;
            }
        }

        console.log(`Mass access grant complete! Created ${createdCount} new accounts.`);
    } catch (err) {
        console.error('Operation failed:', err.message);
    } finally {
        await pool.end();
    }
}

grantMassAccess();
