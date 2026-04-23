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

async function clearAllOnlineModuleData() {
    try {
        console.log('Connecting to database...');
        
        // 1. Clear user progress
        await pool.query('DELETE FROM progress');
        console.log('Cleared all user progress.');
        
        // 2. Clear quiz results
        await pool.query('DELETE FROM quiz_results');
        console.log('Cleared all quiz results.');
        
        // 3. Clear feedback
        try { await pool.query('DELETE FROM course_feedback'); } catch(e) {}
        console.log('Cleared all course feedback.');
        
        // 4. Clear course modules (optional due to cascade, but safe)
        const [modules] = await pool.query('DELETE FROM course_modules');
        console.log(`Deleted ${modules.affectedRows} course modules.`);

        // 5. Clear courses
        const [courses] = await pool.query('DELETE FROM courses');
        console.log(`Deleted ${courses.affectedRows} courses.`);

        console.log('All Online Module data (courses and progress) has been completely wiped.');
        process.exit(0);
    } catch (error) {
        console.error('Error clearing data:', error);
        process.exit(1);
    }
}

clearAllOnlineModuleData();
