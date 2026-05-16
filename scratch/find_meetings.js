import pool from '../server/db.js';

async function findMeetings() {
    try {
        const [rows] = await pool.query('SELECT id, host, title, date FROM meetings WHERE host IN ("Tomi Perdana Putra", "M. Al Faiyad")');
        console.log(JSON.stringify(rows, null, 2));
        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

findMeetings();
