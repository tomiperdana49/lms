import pool from '../server/db.js';

async function approveEligibleDrafts() {
    try {
        console.log('Fetching approved counts per employee...');
        const [approvedRows] = await pool.query(
            'SELECT employee_id, COUNT(*) as count FROM reading_logs WHERE hr_approval_status = "Approved" GROUP BY employee_id'
        );
        const approvedCounts = {};
        approvedRows.forEach(r => approvedCounts[r.employee_id] = r.count);

        console.log('Fetching finished logs in Draft status...');
        const [drafts] = await pool.query(
            'SELECT id, employee_id, title, date, finish_date FROM reading_logs WHERE status = "Finished" AND hr_approval_status = "Draft" ORDER BY employee_id, COALESCE(finish_date, date) ASC'
        );

        console.log(`Found ${drafts.length} finished drafts. Checking eligibility...`);

        const toApprove = [];
        for (const draft of drafts) {
            const currentCount = approvedCounts[draft.employee_id] || 0;
            if (currentCount < 5) {
                toApprove.push(draft.id);
                approvedCounts[draft.employee_id] = currentCount + 1;
            }
        }

        if (toApprove.length > 0) {
            console.log(`Approving ${toApprove.length} eligible logs...`);
            await pool.query(
                `UPDATE reading_logs 
                 SET hr_approval_status = "Approved", 
                     approved_by = "Tomi", 
                     approved_at = NOW(), 
                     claimed_at = COALESCE(finish_date, date)
                 WHERE id IN (?)`,
                [toApprove]
            );
        } else {
            console.log('No eligible logs found for approval.');
        }

        console.log('Done.');
        process.exit(0);
    } catch (err) {
        console.error('Process failed:', err);
        process.exit(1);
    }
}

approveEligibleDrafts();
