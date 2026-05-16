import pool from '../server/db.js';

async function swapAnggiBooks() {
    try {
        console.log('Swapping Anggi Saputra\'s books...');
        
        // 1. Delete "Ikigai" version
        await pool.query("DELETE FROM reading_logs WHERE id = 416");
        console.log('Book ID 416 (Ikigai) deleted.');

        // 2. Approve "IKIGAI:Rahasia hidup bahagia" version
        await pool.query(
            `UPDATE reading_logs 
             SET hr_approval_status = 'Approved', 
                 incentive_amount = 100000,
                 approved_by = 'Tomi', 
                 approved_at = NOW(), 
                 claimed_at = COALESCE(finish_date, date) 
             WHERE id = 24`
        );
        console.log('Book ID 24 (IKIGAI:Rahasia hidup bahagia) approved with 100k incentive.');

        console.log('Done.');
        process.exit(0);
    } catch (err) {
        console.error('Failed:', err);
        process.exit(1);
    }
}

swapAnggiBooks();
