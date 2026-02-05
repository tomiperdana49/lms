require('dotenv').config();
const mysql = require('mysql2/promise');

const pool = mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME
});

async function checkUser() {
    try {
        const empId = '0202601';
        console.log(`Checking for Employee ID: ${empId}`);

        // Check Employees Table
        const [employees] = await pool.query('SELECT * FROM employees WHERE employee_id = ?', [empId]);
        if (employees.length > 0) {
            console.log("✅ Found in 'employees' table (SimAsset Data):");
            console.log(employees[0]);
        } else {
            console.log("❌ NOT FOUND in 'employees' table.");
        }

        // Check Users Table
        const [users] = await pool.query('SELECT * FROM users WHERE employee_id = ?', [empId]);
        if (users.length > 0) {
            console.log("✅ Found in 'users' table (LMS Account):");
            console.log(users[0]);
        } else {
            console.log("❌ NOT FOUND in 'users' table. This user cannot login to LMS.");
        }

    } catch (err) {
        console.error(err);
    } finally {
        await pool.end();
    }
}

checkUser();
