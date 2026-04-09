import mysql from 'mysql2/promise';
import dotenv from 'dotenv';

dotenv.config();

async function testConnection() {
    console.log(`Connecting to ${process.env.DB_HOST}...`);
    try {
        const connection = await mysql.createConnection({
            host: process.env.DB_HOST,
            user: process.env.DB_USER,
            password: process.env.DB_PASSWORD,
            database: process.env.DB_NAME,
            port: 3306
        });
        console.log('Connection successful!');
        await connection.end();
    } catch (err) {
        console.error('Connection failed:', err.message);
    }
}

testConnection();
