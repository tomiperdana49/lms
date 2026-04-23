import pool from './db.js';

async function clearReadingLogs() {
    try {
        console.log('🗑️ Starting cleanup of Reading Logs data...');

        const tables = [
            'reading_logs'
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

        console.log("🎉 Reading Logs data cleared successfully.");
        process.exit(0);
    } catch (err) {
        console.error("❌ Cleanup failed:", err);
        process.exit(1);
    }
}

clearReadingLogs();
