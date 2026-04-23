import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: './.env' });

async function checkResults() {
    const pool = mysql.createPool({
        host: process.env.DB_HOST || 'localhost',
        user: process.env.DB_USER || 'root',
        password: process.env.DB_PASSWORD || '',
        database: 'lms' 
    });

    try {
        console.log("--- QUIZ RESULTS FOR MEETING 15 ---");
        const [rows] = await pool.query('SELECT * FROM quiz_results WHERE meeting_id = 15');
        console.log(JSON.stringify(rows, null, 2));
        
        console.log("\n--- COURSE FEEDBACK FOR MEETING 15 ---");
        const [fb] = await pool.query('SELECT * FROM course_feedback WHERE meeting_id = 15');
        console.log(JSON.stringify(fb, null, 2));
    } catch (e) {
        console.error(e);
    } finally {
        await pool.end();
    }
}

checkResults();
