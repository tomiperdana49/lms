require('dotenv').config();
const mysql = require('mysql2/promise');

const pool = mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME
});

async function checkDemoUsers() {
    try {
        const demoEmails = ['staff@nusa.com', 'hr@nusa.com', 'spv@nusa.com'];
        console.log("Checking Demo Users...");

        for (const email of demoEmails) {
            const [rows] = await pool.query('SELECT * FROM users WHERE email = ?', [email]);
            if (rows.length > 0) {
                console.log(`✅ FOUND: ${email} | Password: ${rows[0].password}`);
            } else {
                console.log(`❌ MISSING: ${email}`);
            }
        }
    } catch (err) {
        console.error(err);
    } finally {
        await pool.end();
    }
}

checkDemoUsers();
