import pool from '../server/db.js';

async function listAll() {
    try {
        const [rows] = await pool.query('SELECT * FROM meetings');
        console.log(JSON.stringify(rows, null, 2));
        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

listAll();
