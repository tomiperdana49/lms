import pool from '../server/db.js';

async function fixAmelfiIncentive() {
    try {
        const [result] = await pool.query('UPDATE reading_logs SET incentive_amount = 100000 WHERE id = 393');
        console.log(`Updated ${result.affectedRows} records.`);
        process.exit(0);
    } catch (err) {
        console.error('Failed:', err);
        process.exit(1);
    }
}

fixAmelfiIncentive();
