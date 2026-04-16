const mysql = require('mysql2/promise');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

async function run() {
    const pool = mysql.createPool({
        host: process.env.DB_HOST,
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        database: process.env.DB_NAME,
        waitForConnections: true,
        connectionLimit: 10,
        queueLimit: 0
    });

    try {
        const email = 'tomi@nusa.net.id';
        console.log(`Starting cleanup for email: ${email}`);

        // 1. Get User
        const [users] = await pool.query('SELECT * FROM users WHERE email = ?', [email]);
        if (users.length === 0) {
            console.log("User not found in 'users' table.");
            return;
        }

        const user = users[0];
        const empId = user.employee_id;
        console.log(`Found User: ${user.name}, Employee ID: ${empId}`);

        if (!empId) {
            console.log("Error: User has no employee_id. Aborting to be safe.");
            return;
        }

        // 2. Delete Progress
        console.log("Deleting from 'progress'...");
        const [progRes] = await pool.query('DELETE FROM progress WHERE employee_id = ? OR user_id = ?', [empId, user.id]);
        console.log(`Deleted ${progRes.affectedRows} progress records.`);

        // 3. Delete Quiz Results
        console.log("Deleting from 'quiz_results'...");
        const [quizRes] = await pool.query('DELETE FROM quiz_results WHERE employee_id = ? OR student_id = ?', [empId, user.id]);
        console.log(`Deleted ${quizRes.affectedRows} quiz records.`);

        console.log("Cleanup finished successfully.");

    } catch (e) {
        console.error("Error during cleanup:", e);
    } finally {
        await pool.end();
    }
}

run();
