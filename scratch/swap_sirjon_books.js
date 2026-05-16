import pool from '../server/db.js';

async function swapSirjonBooks() {
    try {
        console.log('Swapping Sirjon\'s books...');
        
        // 1. Delete "How To Win Friends & Influence People"
        await pool.query("DELETE FROM reading_logs WHERE id = 442");
        console.log('Book ID 442 deleted.');

        // 2. Approve "How To Win Friends & Influence People In The Digital Age"
        await pool.query(
            `UPDATE reading_logs 
             SET hr_approval_status = 'Approved', 
                 incentive_amount = 100000,
                 approved_by = 'Tomi', 
                 approved_at = NOW(), 
                 claimed_at = COALESCE(finish_date, date) 
             WHERE id = 73`
        );
        console.log('Book ID 73 approved with 100k incentive.');

        console.log('Done.');
        process.exit(0);
    } catch (err) {
        console.error('Failed:', err);
        process.exit(1);
    }
}

swapSirjonBooks();
