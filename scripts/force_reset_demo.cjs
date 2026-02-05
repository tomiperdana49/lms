require('dotenv').config();
const mysql = require('mysql2/promise');

const pool = mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME
});

async function forceResetPasswords() {
    try {
        const demoAccounts = [
            'staff@nusa.com',
            'hr@nusa.com',
            'spv@nusa.com'
        ];

        console.log("Force Resetting Demo Passwords to '123'...");

        for (const email of demoAccounts) {
            // TRIM() ensures no hidden spaces in DB
            const [result] = await pool.query("UPDATE users SET password = '123' WHERE email = ?", [email]);
            console.log(`Updated ${email}: ${result.changedRows} rows changed.`);
        }

    } catch (err) {
        console.error(err);
    } finally {
        await pool.end();
    }
}

forceResetPasswords();
