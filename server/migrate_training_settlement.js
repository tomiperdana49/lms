
import pool from './db.js';

async function migrate() {
    try {
        console.log("Migrating training_requests schema (Settlement)...");

        const queries = [
            "ALTER TABLE training_requests ADD COLUMN IF NOT EXISTS additional_cost DECIMAL(15, 2) DEFAULT 0;",
            "ALTER TABLE training_requests ADD COLUMN IF NOT EXISTS settlement_note TEXT;"
        ];

        for (const q of queries) {
            try {
                await pool.query(q);
                console.log("Executed:", q);
            } catch (err) {
                console.log("Skipping/Error:", err.message);
            }
        }

        console.log("Migration complete.");
        process.exit(0);
    } catch (err) {
        console.error("Migration failed:", err);
        process.exit(1);
    }
}

migrate();
