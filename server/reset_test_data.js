import pool from './db.js';

async function resetData() {
    try {
        console.log('🗑️ Starting cleanup of test data...');

        // List of tables to clear (Transactional data only)
        const tables = [
            'training_requests',
            'reading_logs',
            'meetings',
            'incentives',
            'quiz_results',
            // 'progress' // Optional: if we want to reset course progress too. Let's include it for a full "try again" feel.
            'progress'
        ];

        for (const table of tables) {
            try {
                await pool.query(`TRUNCATE TABLE ${table}`);
                console.log(`✅ Cleared table: ${table}`);
            } catch (err) {
                // Ignore if table doesn't exist
                if (err.code === 'ER_NO_SUCH_TABLE') {
                    console.log(`ℹ️ Table ${table} does not exist, skipping.`);
                } else {
                    console.error(`❌ Failed to clear ${table}:`, err.message);
                }
            }
        }

        console.log("🎉 Test data reset complete. Tables are empty and ready for new input.");
        process.exit(0);
    } catch (err) {
        console.error("❌ Reset failed:", err);
        process.exit(1);
    }
}

resetData();
