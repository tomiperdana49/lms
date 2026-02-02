
const mysql = require('mysql2/promise');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.join(__dirname, '../.env') });

const dbConfig = {
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'lms_db',
};

async function migrate() {
    let connection;
    try {
        console.log('Connecting to database...');
        connection = await mysql.createConnection(dbConfig);
        console.log('Connected.');

        console.log('Adding "cost_report_json" column to meetings table...');

        // Check if column exists first to avoid error
        const [columns] = await connection.execute(
            "SHOW COLUMNS FROM meetings LIKE 'cost_report_json'"
        );

        if (columns.length === 0) {
            await connection.execute(
                "ALTER TABLE meetings ADD COLUMN cost_report_json JSON AFTER guests_json"
            );
            console.log('Column "cost_report_json" added.');
        } else {
            console.log('Column "cost_report_json" already exists.');
        }

    } catch (error) {
        console.error('Migration failed:', error);
    } finally {
        if (connection) await connection.end();
    }
}

migrate();
