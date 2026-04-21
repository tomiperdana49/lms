import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '../.env') });

const config = {
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME
};

async function clearData() {
    console.log(`Connecting to ${config.host} / ${config.database}...`);
    const connection = await mysql.createConnection(config);

    try {
        console.log("Clearing Quiz results...");
        await connection.query("TRUNCATE TABLE quiz_results");

        console.log("Clearing User Progress...");
        await connection.query("TRUNCATE TABLE progress");

        console.log("Disabling foreign key checks to clear courses...");
        await connection.query("SET FOREIGN_KEY_CHECKS = 0");
        
        console.log("Clearing Course Modules...");
        await connection.query("TRUNCATE TABLE course_modules");

        console.log("Clearing Online Modules (courses)...");
        await connection.query("TRUNCATE TABLE courses");

        await connection.query("SET FOREIGN_KEY_CHECKS = 1");

        console.log("SUCCESS: All online module data and quiz reports have been cleared.");
    } catch (error) {
        console.error("ERROR clearing data:", error);
    } finally {
        await connection.end();
    }
}

clearData();
