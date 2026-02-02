const mysql = require('mysql2/promise');
require('dotenv').config({ path: './.env' }); // Adjust path if needed, assuming root

async function migrate() {
    console.log("Starting migration...");
    try {
        const connection = await mysql.createConnection({
            host: process.env.DB_HOST || 'localhost',
            user: process.env.DB_USER || 'root',
            password: process.env.DB_PASSWORD || '',
            database: process.env.DB_NAME || 'lms_db'
        });

        console.log("Connected to database.");

        try {
            await connection.query(`
                ALTER TABLE incentives 
                ADD COLUMN payment_type ENUM('One-Time', 'Recurring') DEFAULT 'Recurring';
            `);
            console.log("Migration successful: Added 'payment_type' column to 'incentives' table.");
        } catch (err) {
            if (err.code === 'ER_DUP_FIELDNAME') {
                console.log("Column 'payment_type' already exists. Skipping.");
            } else {
                console.error("Migration failed:", err.message);
            }
        }

        await connection.end();
    } catch (err) {
        console.error("Connection failed:", err.message);
    }
}

migrate();
