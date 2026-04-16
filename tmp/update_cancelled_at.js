import pool from '../server/db.js';

async function updateCancelledAt() {
    try {
        await pool.query("UPDATE reading_logs SET cancelled_at = NOW() WHERE status = 'Cancelled' AND cancelled_at IS NULL");
        console.log("Success");
        process.exit(0);
    } catch (err) {
        console.error('Error:', err);
        process.exit(1);
    }
}

updateCancelledAt();
