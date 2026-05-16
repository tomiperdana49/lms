import pool from '../server/db.js';

async function swapAmelfiBooks() {
    try {
        console.log('Swapping Amelfi\'s books...');
        
        // 1. Delete "Lainnya" version
        await pool.query("DELETE FROM reading_logs WHERE id = 414");
        console.log('Book ID 414 (Lainnya) deleted.');

        // 2. Approve "Buku Religi dan Hubungan" version
        await pool.query(
            `UPDATE reading_logs 
             SET hr_approval_status = 'Approved', 
                 approved_by = 'Tomi', 
                 approved_at = NOW(), 
                 claimed_at = COALESCE(finish_date, date) 
             WHERE id = 393`
        );
        console.log('Book ID 393 (Buku Religi dan Hubungan) approved.');

        console.log('Done.');
        process.exit(0);
    } catch (err) {
        console.error('Failed:', err);
        process.exit(1);
    }
}

swapAmelfiBooks();
