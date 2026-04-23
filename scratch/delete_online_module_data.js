import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '../.env') });

const pool = mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME
});

async function clearOnlineModuleData() {
    try {
        console.log('Connecting to database...');
        
        // 1. Clear user progress
        const [progressResult] = await pool.query('DELETE FROM progress');
        console.log(`Deleted ${progressResult.affectedRows} progress records.`);
        
        // 2. Clear quiz results
        const [quizResult] = await pool.query('DELETE FROM quiz_results');
        console.log(`Deleted ${quizResult.affectedRows} quiz result records.`);
        
        // 3. Clear feedback
        // Use a try-catch for course_feedback as it might not have data or the table might be different in name slightly
        try {
            const [feedbackResult] = await pool.query('DELETE FROM course_feedback');
            console.log(`Deleted ${feedbackResult.affectedRows} feedback records.`);
        } catch (e) {
            console.log('No course_feedback records deleted (table may be empty or missing).');
        }

        console.log('Online Module user data cleared successfully.');
        process.exit(0);
    } catch (error) {
        console.error('Error clearing data:', error);
        process.exit(1);
    }
}

clearOnlineModuleData();
