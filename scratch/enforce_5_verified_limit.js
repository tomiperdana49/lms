import pool from '../server/db.js';

async function enforceMax5Verified() {
    try {
        console.log('Fetching all approved logs...');
        const [allLogs] = await pool.query(
            'SELECT id, employee_id, title, hr_approval_status, incentive_amount, date, finish_date FROM reading_logs WHERE hr_approval_status = "Approved" ORDER BY employee_id, COALESCE(finish_date, date) ASC, id ASC'
        );

        console.log(`Analyzing ${allLogs.length} approved logs...`);

        const employeeLogs = {};
        const demotions = [];

        for (const log of allLogs) {
            if (!employeeLogs[log.employee_id]) employeeLogs[log.employee_id] = [];
            employeeLogs[log.employee_id].push(log);
            
            if (employeeLogs[log.employee_id].length > 5) {
                demotions.push(log.id);
            }
        }

        console.log(`Demoting ${demotions.length} extra books (Book 6+) to 'Draft' status...`);
        if (demotions.length > 0) {
            await pool.query(
                "UPDATE reading_logs SET hr_approval_status = 'Draft', incentive_amount = 0, approved_by = NULL, approved_at = NULL WHERE id IN (?)",
                [demotions]
            );
        }

        console.log('Enforcement finished.');
        console.log(`- Total records demoted from Approved to Draft: ${demotions.length}`);
        
        process.exit(0);
    } catch (err) {
        console.error('Process failed:', err);
        process.exit(1);
    }
}

enforceMax5Verified();
