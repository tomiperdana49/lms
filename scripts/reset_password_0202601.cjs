require('dotenv').config();
const mysql = require('mysql2/promise');

const pool = mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME
});

async function resetPassword() {
    try {
        const empId = '0202601';
        console.log(`Resetting password for Employee ID: ${empId} to '123'`);

        await pool.query("UPDATE users SET password = '123' WHERE employee_id = ?", [empId]);
        console.log("✅ Password updated successfully.");

    } catch (err) {
        console.error(err);
    } finally {
        await pool.end();
    }
}

resetPassword();
