import pool from '../server/db.js';

async function bulkSwapIkigai() {
    try {
        console.log('Bulk swapping Ikigai books for 4 users...');
        
        const toDelete = [434, 435, 444, 450];
        const toApprove = [114, 226, 351, 343];

        // 1. Delete "Ikigai" versions
        if (toDelete.length > 0) {
            await pool.query('DELETE FROM reading_logs WHERE id IN (?)', [toDelete]);
            console.log(`Deleted ${toDelete.length} Ikigai records.`);
        }

        // 2. Approve "IKIGAI:Rahasia hidup bahagia" versions
        if (toApprove.length > 0) {
            await pool.query(
                `UPDATE reading_logs 
                 SET hr_approval_status = 'Approved', 
                     incentive_amount = 100000,
                     approved_by = 'Tomi', 
                     approved_at = NOW(), 
                     claimed_at = COALESCE(finish_date, date) 
                 WHERE id IN (?)`,
                [toApprove]
            );
            console.log(`Approved ${toApprove.length} detailed Ikigai records.`);
        }

        console.log('Done.');
        process.exit(0);
    } catch (err) {
        console.error('Failed:', err);
        process.exit(1);
    }
}

bulkSwapIkigai();
