import pool from '../server/db.js';

async function checkCancelledAt() {
    try {
        const [rows] = await pool.query('SELECT id, status, rejection_reason, cancelled_at FROM reading_logs WHERE status = "Cancelled" ORDER BY id DESC LIMIT 5');
        console.log(rows);
        process.exit(0);
    } catch (err) {
        console.error('Error:', err);
        process.exit(1);
    }
}

checkCancelledAt();
