import pool from '../server/db.js';

async function swapFikriBooks() {
    try {
        console.log('Swapping M Rozi Fikri\'s books...');
        
        // 1. Delete "Ikigai" version
        await pool.query("DELETE FROM reading_logs WHERE id = 429");
        console.log('Book ID 429 (Ikigai) deleted.');

        // 2. Approve "IKIGAI:Rahasia hidup bahagia" version
        await pool.query(
            `UPDATE reading_logs 
             SET hr_approval_status = 'Approved', 
                 incentive_amount = 100000,
                 approved_by = 'Tomi', 
                 approved_at = NOW(), 
                 claimed_at = COALESCE(finish_date, date) 
             WHERE id = 305`
        );
        console.log('Book ID 305 (IKIGAI:Rahasia hidup bahagia) approved with 100k incentive.');

        console.log('Done.');
        process.exit(0);
    } catch (err) {
        console.error('Failed:', err);
        process.exit(1);
    }
}

swapFikriBooks();
