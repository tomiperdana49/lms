import pool from '../server/db.js';

async function swapAnjelisaBooks() {
    try {
        console.log('Swapping Anjelisa\'s books...');
        
        // 1. Delete "Lainnya" version
        await pool.query("DELETE FROM reading_logs WHERE id = 417");
        console.log('Book ID 417 (Lainnya) deleted.');

        // 2. Approve "Buku Paling Diminati" version
        await pool.query(
            `UPDATE reading_logs 
             SET hr_approval_status = 'Approved', 
                 incentive_amount = 100000,
                 approved_by = 'Tomi', 
                 approved_at = NOW(), 
                 claimed_at = COALESCE(finish_date, date) 
             WHERE id = 386`
        );
        console.log('Book ID 386 (Buku Paling Diminati) approved with 100k incentive.');

        console.log('Done.');
        process.exit(0);
    } catch (err) {
        console.error('Failed:', err);
        process.exit(1);
    }
}

swapAnjelisaBooks();
