import pool from './db.js';

async function clearData() {
    try {
        console.log('🚀 Starting data clearing process...');

        // 1. Clear Reading Logs
        console.log('📖 Clearing Reading Logs...');
        await pool.query('DELETE FROM reading_logs');
        await pool.query('ALTER TABLE reading_logs AUTO_INCREMENT = 1');
        console.log('✅ Reading Logs cleared.');

        // 2. Clear Online Modules (Courses and Modules)
        console.log('🎓 Clearing Online Modules...');
        
        // Use DELETE instead of TRUNCATE to avoid foreign key issues if not handled by ON DELETE CASCADE
        // Order matters if there are constraints
        await pool.query('DELETE FROM progress');
        await pool.query('ALTER TABLE progress AUTO_INCREMENT = 1');
        
        // Delete only quiz results related to courses/modules (preserving internal training)
        await pool.query('DELETE FROM quiz_results WHERE course_id IS NOT NULL OR module_id IS NOT NULL');
        
        // Check if course_feedback exists and clear it
        try {
            await pool.query('DELETE FROM course_feedback WHERE course_id IS NOT NULL');
            console.log('✅ Course Feedback cleared.');
        } catch (e) {
            console.log('ℹ️ course_feedback table not found or empty, skipping.');
        }

        await pool.query('DELETE FROM course_modules');
        await pool.query('ALTER TABLE course_modules AUTO_INCREMENT = 1');

        await pool.query('DELETE FROM courses');
        await pool.query('ALTER TABLE courses AUTO_INCREMENT = 1');

        console.log('✅ Online Modules data cleared.');

        console.log('🎉 All requested data has been successfully cleared.');
        process.exit(0);
    } catch (err) {
        console.error('❌ Error clearing data:', err);
        process.exit(1);
    }
}

clearData();
