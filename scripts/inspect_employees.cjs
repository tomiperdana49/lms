require('dotenv').config();
const mysql = require('mysql2/promise');

const pool = mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME
});

async function inspectSchema() {
    try {
        const [columns] = await pool.query('SHOW COLUMNS FROM employees');
        console.log("Employees Table Columns:");
        columns.forEach(col => console.log(col.Field));
    } catch (err) {
        console.error(err);
    } finally {
        await pool.end();
    }
}

inspectSchema();
