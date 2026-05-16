import pool from '../server/db.js';

async function deleteMeetings() {
    try {
        const ids = [4, 5];
        console.log(`🗑️ Deleting meetings with IDs: ${ids.join(', ')}`);
        
        const [result] = await pool.query('DELETE FROM meetings WHERE id IN (?)', [ids]);
        
        console.log(`✅ Deleted ${result.affectedRows} meetings.`);
        process.exit(0);
    } catch (err) {
        console.error('❌ Deletion failed:', err);
        process.exit(1);
    }
}

deleteMeetings();
