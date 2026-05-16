import pool from '../server/db.js';

async function checkResults() {
    try {
        const [rows] = await pool.query('SELECT * FROM quiz_results WHERE meeting_id = 6');
        console.log(JSON.stringify(rows, null, 2));
        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

checkResults();
