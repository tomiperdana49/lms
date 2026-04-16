import pool from '../server/db.js';

async function addCol() {
    try {
        await pool.query("ALTER TABLE reading_logs ADD COLUMN cancelled_at DATETIME");
        console.log("Success");
        process.exit(0);
    } catch (err) {
        console.error('Error:', err);
        process.exit(1);
    }
}

addCol();
