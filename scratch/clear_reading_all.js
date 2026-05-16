import pool from '../server/db.js';

async function clearAllReadingRelated() {
    try {
        console.log('🗑️ Starting complete cleanup of Reading related data...');

        const tables = [
            'reading_logs',
            'books'
        ];

        for (const table of tables) {
            try {
                // First get the count
                const [countRows] = await pool.query(`SELECT COUNT(*) as count FROM ${table}`);
                const countBefore = countRows[0].count;
                
                await pool.query(`TRUNCATE TABLE ${table}`);
                
                const [countRowsAfter] = await pool.query(`SELECT COUNT(*) as count FROM ${table}`);
                const countAfter = countRowsAfter[0].count;
                
                console.log(`✅ Cleared table: ${table} (${countBefore} rows -> ${countAfter} rows)`);
            } catch (err) {
                if (err.code === 'ER_NO_SUCH_TABLE') {
                    console.log(`ℹ️ Table ${table} does not exist, skipping.`);
                } else {
                    console.error(`❌ Failed to clear ${table}:`, err.message);
                }
            }
        }

        console.log("🎉 All reading log and book data cleared successfully.");
        process.exit(0);
    } catch (err) {
        console.error("❌ Cleanup failed:", err);
        process.exit(1);
    }
}

clearAllReadingRelated();
