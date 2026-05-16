import pool from '../server/db.js';

async function swapZailaniBooks() {
    try {
        console.log('Swapping Zailani\'s books...');
        
        // 1. Delete "Lainnya" version
        await pool.query("DELETE FROM reading_logs WHERE id = 451");
        console.log('Book ID 451 (Lainnya) deleted.');

        // 2. Approve "Buku Religi dan Hubungan" version
        await pool.query(
            `UPDATE reading_logs 
             SET hr_approval_status = 'Approved', 
                 incentive_amount = 100000,
                 approved_by = 'Tomi', 
                 approved_at = NOW(), 
                 claimed_at = COALESCE(finish_date, date) 
             WHERE id = 366`
        );
        console.log('Book ID 366 (Buku Religi dan Hubungan) approved with 100k incentive.');

        console.log('Done.');
        process.exit(0);
    } catch (err) {
        console.error('Failed:', err);
        process.exit(1);
    }
}

swapZailaniBooks();
