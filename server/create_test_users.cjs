const mysql = require('mysql2/promise');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const pool = mysql.createPool({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'lms_db',
    multipleStatements: true
});

const createUsers = async () => {
    try {
        const connection = await pool.getConnection();
        console.log("Connected to database...");

        const users = [
            { id: '90001', email: 'test.staff@nusa.net.id', password: '123', name: 'Test Staff', role: 'STAFF', branch: 'Medan-HO' },
            { id: '90002', email: 'test.spv@nusa.net.id', password: '123', name: 'Test Supervisor', role: 'SUPERVISOR', branch: 'Medan-HO' },
            { id: '90003', email: 'test.hr@nusa.net.id', password: '123', name: 'Test HR', role: 'HR', branch: 'Headquarters' }
        ];

        console.log("Inserting users...");

        for (const u of users) {
            // Check if user exists first to avoid duplicates/errors
            const [existing] = await connection.query('SELECT * FROM users WHERE email = ?', [u.email]);
            if (existing.length > 0) {
                console.log(`User ${u.email} already exists. Updating password...`);
                await connection.query('UPDATE users SET password = ?, role = ?, name = ?, branch = ? WHERE email = ?', [u.password, u.role, u.name, u.branch, u.email]);
            } else {
                await connection.query('INSERT INTO users (id, email, password, name, role, branch) VALUES (?, ?, ?, ?, ?, ?)',
                    [u.id, u.email, u.password, u.name, u.role, u.branch]);
                console.log(`User ${u.email} created.`);
            }
        }

        console.log("All test users created successfully.");
        connection.release();
        process.exit(0);
    } catch (err) {
        console.error("Error creating users:", err);
        process.exit(1);
    }
};

createUsers();
