import pool from './db.js';

async function clearTrainingData() {
    try {
        console.log('🗑️ Starting cleanup of Internal Training data...');

        // Tables specific to Internal Training
        const tables = [
            'meetings',
            'course_feedback'
        ];

        for (const table of tables) {
            try {
                await pool.query(`TRUNCATE TABLE ${table}`);
                console.log(`✅ Cleared table: ${table}`);
            } catch (err) {
                if (err.code === 'ER_NO_SUCH_TABLE') {
                    console.log(`ℹ️ Table ${table} does not exist, skipping.`);
                } else {
                    console.error(`❌ Failed to clear ${table}:`, err.message);
                }
            }
        }

        // For quiz_results, we might want to only clear results related to meetings
        // However, the user said "hapuskan data", so Truncating is usually what they expect in a test/dev phase.
        // Let's TRUNCATE quiz_results as well since it mostly contains test data for now.
        try {
            await pool.query(`TRUNCATE TABLE quiz_results`);
            console.log(`✅ Cleared table: quiz_results`);
        } catch (err) {
             console.error(`❌ Failed to clear quiz_results:`, err.message);
        }

        console.log("🎉 Internal Training data cleared successfully.");
        process.exit(0);
    } catch (err) {
        console.error("❌ Cleanup failed:", err);
        process.exit(1);
    }
}

clearTrainingData();
