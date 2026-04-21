const mysql = require('mysql2/promise');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.join(__dirname, '../.env') });

async function cleanup() {
    const email = 'tomi@nusa.net.id';
    console.log(`Starting cleanup for ${email}...`);

    const pool = mysql.createPool({
        host: process.env.DB_HOST,
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        database: process.env.DB_NAME,
        connectionLimit: 1
    });

    try {
        const [users] = await pool.query('SELECT id, employee_id FROM users WHERE email = ?', [email]);
        if (users.length === 0) {
            console.log('User not found in users table.');
            return;
        }

        const userId = users[0].id;
        const employeeId = users[0].employee_id;
        console.log(`Found User: ID=${userId}, EmployeeID=${employeeId}`);

        // Tables to clean
        const tables = [
            { name: 'quiz_results', col: 'student_id' },
            { name: 'progress', col: 'user_id' },
            { name: 'reading_logs', col: 'employee_id' },
            { name: 'training_requests', col: 'employee_id' },
            { name: 'incentives', col: 'employee_id' },
            { name: 'meetings', col: 'employee_id' }
        ];

        for (const table of tables) {
            try {
                const idToUse = table.col === 'student_id' ? userId : employeeId;
                if (!idToUse) continue;
                
                const [result] = await pool.query(`DELETE FROM ${table.name} WHERE ${table.col} = ? OR ${table.col} = ?`, [userId, employeeId]);
                console.log(`Deleted from ${table.name}: ${result.affectedRows} rows`);
            } catch (e) {
                console.error(`Error deleting from ${table.name}:`, e.message);
            }
        }

        // Finally delete the user
        await pool.query('DELETE FROM users WHERE email = ?', [email]);
        console.log('Deleted user record.');

    } catch (err) {
        console.error('Cleanup failed:', err);
    } finally {
        await pool.end();
    }
}

cleanup();
