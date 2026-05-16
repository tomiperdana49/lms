import pool from '../server/db.js';

async function deleteAdhityaBook() {
    try {
        const [result] = await pool.query('DELETE FROM reading_logs WHERE id = 413');
        console.log(`Deleted ${result.affectedRows} records.`);
        process.exit(0);
    } catch (err) {
        console.error('Failed:', err);
        process.exit(1);
    }
}

deleteAdhityaBook();
