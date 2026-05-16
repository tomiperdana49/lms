import pool from '../server/db.js';

async function swapAdhityaBooks() {
    try {
        console.log('Swapping Adhitya\'s books...');
        
        // 1. Demote "How To Win Friends & Influence People"
        await pool.query(
            "UPDATE reading_logs SET hr_approval_status = 'Draft', incentive_amount = 0, approved_by = NULL, approved_at = NULL WHERE id = 413"
        );
        console.log('Book ID 413 demoted to Draft.');

        // 2. Approve "How To Win Friends & Influence People In The Digital Age"
        await pool.query(
            `UPDATE reading_logs 
             SET hr_approval_status = 'Approved', 
                 approved_by = 'Tomi', 
                 approved_at = NOW(), 
                 claimed_at = COALESCE(finish_date, date) 
             WHERE id = 330`
        );
        console.log('Book ID 330 approved.');

        console.log('Done.');
        process.exit(0);
    } catch (err) {
        console.error('Failed:', err);
        process.exit(1);
    }
}

swapAdhityaBooks();
