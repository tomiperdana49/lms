import pool from './db.js';

async function clearInternalTrainingData() {
    try {
        console.log('🗑️ Clearing Internal Training data (scoped, online training untouched)...');

        const [feedbackResult] = await pool.query('DELETE FROM course_feedback WHERE meeting_id IS NOT NULL');
        console.log(`✅ Deleted ${feedbackResult.affectedRows} row(s) from course_feedback`);

        const [quizResult] = await pool.query('DELETE FROM quiz_results WHERE meeting_id IS NOT NULL');
        console.log(`✅ Deleted ${quizResult.affectedRows} row(s) from quiz_results`);

        await pool.query('TRUNCATE TABLE meetings');
        console.log('✅ Cleared table: meetings');

        console.log('🎉 Internal Training data cleared successfully.');
        process.exit(0);
    } catch (err) {
        console.error('❌ Cleanup failed:', err);
        process.exit(1);
    }
}

clearInternalTrainingData();
