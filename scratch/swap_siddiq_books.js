import pool from '../server/db.js';

async function swapSiddiqBooks() {
    try {
        console.log('Swapping Siddiq\'s books...');
        
        // 1. Delete "Lainnya" version
        await pool.query("DELETE FROM reading_logs WHERE id = 441");
        console.log('Book ID 441 (Lainnya) deleted.');

        // 2. Approve "Buku Paling Diminati" version
        await pool.query(
            `UPDATE reading_logs 
             SET hr_approval_status = 'Approved', 
                 incentive_amount = 100000,
                 approved_by = 'Tomi', 
                 approved_at = NOW(), 
                 claimed_at = COALESCE(finish_date, date) 
             WHERE id = 362`
        );
        console.log('Book ID 362 (Buku Paling Diminati) approved with 100k incentive.');

        console.log('Done.');
        process.exit(0);
    } catch (err) {
        console.error('Failed:', err);
        process.exit(1);
    }
}

swapSiddiqBooks();
