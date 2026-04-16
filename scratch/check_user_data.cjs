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
        console.log(`Checking data for email: ${email}`);

        // 1. Get User
        // Note: The table might be in another database (simAssetPool) or local pool.
        // Assuming local pool based on server.js imports.
        const [users] = await pool.query('SELECT * FROM users WHERE email = ?', [email]);
        if (users.length === 0) {
            console.log("User not found in 'users' table.");
            return;
        }

        const user = users[0];
        console.log(`Found User ID: ${user.id}, Employee ID: ${user.employee_id}`);

        // 2. Count progress
        const [progress] = await pool.query('SELECT COUNT(*) as count FROM module_progress WHERE user_id = ?', [user.id]);
        console.log(`Module Progress records: ${progress[0].count}`);

        const [cProgress] = await pool.query('SELECT COUNT(*) as count FROM course_progress WHERE user_id = ?', [user.id]);
        console.log(`Course Progress records: ${cProgress[0].count}`);

        // 3. Count Quiz Results
        // Note: quiz_results might use studentId or employee_id. Let's check columns.
        const [quizResults] = await pool.query('SELECT COUNT(*) as count FROM quiz_results WHERE studentId = ? OR employee_id = ?', [user.id, user.employee_id]);
        console.log(`Quiz Results records: ${quizResults[0].count}`);

    } catch (e) {
        console.error("Error:", e);
    } finally {
        await pool.end();
    }
}

run();
