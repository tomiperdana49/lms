
const mysql = require('mysql2/promise');
require('dotenv').config();

const dbConfig = {
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'lms_db', // Adjust if needed
};

async function migrate() {
    let connection;
    try {
        console.log('Connecting to database...');
        connection = await mysql.createConnection(dbConfig);
        console.log('Connected.');

        const table = 'training_requests';

        // List of columns to check/add
        const columns = [
            { name: 'rejection_reason', type: 'TEXT' },
            { name: 'supervisor_name', type: 'VARCHAR(255)' },
            { name: 'supervisor_approved_at', type: 'DATETIME' },
            { name: 'hr_name', type: 'VARCHAR(255)' },
            { name: 'hr_approved_at', type: 'DATETIME' }
        ];

        for (const col of columns) {
            try {
                // Try to add the column. If it exists, it will fail, which we catch.
                // Using IF NOT EXISTS logic in raw SQL for columns is not standard in all MySQL versions,
                // so we just try to add and ignore dedicated error code 1060 (Duplicate column name).
                const query = `ALTER TABLE ${table} ADD COLUMN ${col.name} ${col.type}`;
                console.log(`Adding column ${col.name}...`);
                await connection.query(query);
                console.log(`Added ${col.name} successfully.`);
            } catch (err) {
                if (err.code === 'ER_DUP_FIELDNAME') {
                    console.log(`Column ${col.name} already exists. Skipping.`);
                } else {
                    console.error(`Error adding column ${col.name}:`, err.message);
                }
            }
        }

        console.log('Migration completed.');

    } catch (error) {
        console.error('Migration failed:', error);
    } finally {
        if (connection) await connection.end();
    }
}

migrate();
