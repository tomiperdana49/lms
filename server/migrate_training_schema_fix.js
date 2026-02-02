
import pool from './db.js';

async function migrate() {
    try {
        console.log("Migrating training_requests schema...");

        const alterQuestions = [
            "ALTER TABLE training_requests ADD COLUMN IF NOT EXISTS justification TEXT;",
            "ALTER TABLE training_requests ADD COLUMN IF NOT EXISTS evidence_url VARCHAR(255);"
        ];

        for (const q of alterQuestions) {
            try {
                await pool.query(q);
                console.log("Executed:", q);
            } catch (err) {
                // Ignore if duplicate or error, just log
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
