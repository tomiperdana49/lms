import pool from '../server/db.js';

async function syncClaimedDate() {
    try {
        console.log('Syncing Claimed date with Finish/Verified date...');
        const [result] = await pool.query(
            'UPDATE reading_logs SET claimed_at = COALESCE(finish_date, date) WHERE hr_approval_status = "Approved" AND claimed_at IS NULL'
        );
        console.log(`Updated ${result.affectedRows} records.`);
        process.exit(0);
    } catch (err) {
        console.error('Failed:', err);
        process.exit(1);
    }
}

syncClaimedDate();
