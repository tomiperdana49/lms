import pool from './db.js';

const migrate = async () => {
    console.log("Starting Schema Migration v2...");
    const connection = await pool.getConnection();
    try {
        // 1. Add video columns to course_modules
        try {
            await connection.query(`ALTER TABLE course_modules ADD COLUMN video_id VARCHAR(255)`);
            console.log("Added video_id to course_modules");
        } catch (e) {
            if (e.code !== 'ER_DUP_FIELDNAME') console.log("video_id might already exist or error:", e.message);
        }

        try {
            await connection.query(`ALTER TABLE course_modules ADD COLUMN video_type VARCHAR(50) DEFAULT 'youtube'`);
            console.log("Added video_type to course_modules");
        } catch (e) {
            if (e.code !== 'ER_DUP_FIELDNAME') console.log("video_type might already exist or error:", e.message);
        }

        try {
            await connection.query(`ALTER TABLE course_modules ADD COLUMN quiz_data JSON`);
            console.log("Added quiz_data to course_modules");
        } catch (e) {
            if (e.code !== 'ER_DUP_FIELDNAME') console.log("quiz_data might already exist or error:", e.message);
        }

        // 2. Add assessment_data to courses
        try {
            await connection.query(`ALTER TABLE courses ADD COLUMN assessment_data JSON`);
            console.log("Added assessment_data to courses");
        } catch (e) {
            if (e.code !== 'ER_DUP_FIELDNAME') console.log("assessment_data might already exist or error:", e.message);
        }

        console.log("Migration complete.");
    } catch (err) {
        console.error("Migration failed:", err);
    } finally {
        connection.release();
        process.exit();
    }
};

migrate();
