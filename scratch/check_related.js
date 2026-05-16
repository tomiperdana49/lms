import pool from '../server/db.js';

async function checkRelated() {
    try {
        const ids = [4, 5];
        for (const id of ids) {
            const [feedback] = await pool.query('SELECT count(*) as count FROM course_feedback WHERE meeting_id = ?', [id]);
            const [results] = await pool.query('SELECT count(*) as count FROM quiz_results WHERE meeting_id = ?', [id]);
            console.log(`Meeting ${id}: Feedback count = ${feedback[0].count}, Quiz results count = ${results[0].count}`);
        }
        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

checkRelated();
