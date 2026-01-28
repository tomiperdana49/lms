
import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import path from 'path';

// Load Env
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '../.env') });

const pool = mysql.createPool({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    multipleStatements: true
});

const migrate = async () => {
    try {
        const connection = await pool.getConnection();
        const dbName = process.env.DB_NAME || 'lms_db';

        console.log(`Connected to database: ${dbName}`);
        await connection.query(`USE \`${dbName}\``);

        console.log("Attempting to add video_id to course_modules...");
        try {
            await connection.query("ALTER TABLE course_modules ADD COLUMN video_id VARCHAR(255)");
            console.log("SUCCESS: Added video_id column.");
        } catch (err) {
            if (err.code === 'ER_DUP_FIELDNAME') {
                console.log("INFO: video_id column already exists.");
            } else {
                console.error("ERROR adding video_id:", err.message);
            }
        }

        console.log("Attempting to add video_type to course_modules...");
        try {
            await connection.query("ALTER TABLE course_modules ADD COLUMN video_type VARCHAR(50) DEFAULT 'youtube'");
            console.log("SUCCESS: Added video_type column.");
        } catch (err) {
            if (err.code === 'ER_DUP_FIELDNAME') {
                console.log("INFO: video_type column already exists.");
            } else {
                console.error("ERROR adding video_type:", err.message);
            }
        }

        connection.release();
        console.log("Migration check complete.");
        process.exit(0);
    } catch (err) {
        console.error("Migration Failed:", err);
        process.exit(1);
    }
};

migrate();
