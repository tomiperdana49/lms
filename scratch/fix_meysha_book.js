import pool from '../server/db.js';

async function updateMeyshaBook() {
    try {
        const [result] = await pool.query(
            'UPDATE reading_logs SET hr_approval_status = "Draft", incentive_amount = 0 WHERE employee_id = "0202568" AND title LIKE "%Quarter Life Crisis%"'
        );
        console.log(`Updated ${result.affectedRows} records.`);
        process.exit(0);
    } catch (err) {
        console.error('Failed:', err);
        process.exit(1);
    }
}

updateMeyshaBook();
