import pool from '../server/db.js';

async function cleanupAndEnforceLimits() {
    try {
        console.log('Fetching all approved logs...');
        const [allLogs] = await pool.query(
            'SELECT id, employee_id, title, hr_approval_status, incentive_amount, date, finish_date, source FROM reading_logs WHERE hr_approval_status = "Approved" ORDER BY employee_id, COALESCE(finish_date, date) ASC, id ASC'
        );

        console.log(`Analyzing ${allLogs.length} logs...`);

        const employeeLogs = {};
        const duplicatesToDelete = [];
        const updates = [];

        // Group by employee and check for duplicates by Title
        for (const log of allLogs) {
            if (!employeeLogs[log.employee_id]) employeeLogs[log.employee_id] = [];
            
            const existingIndex = employeeLogs[log.employee_id].findIndex(l => 
                l.title.toLowerCase().trim() === log.title.toLowerCase().trim()
            );

            if (existingIndex !== -1) {
                // Duplicate found!
                const existing = employeeLogs[log.employee_id][existingIndex];
                console.log(`Duplicate found for ${log.employee_id}: "${log.title}"`);
                
                // Keep the one with source SIMAS if available, or just keep the first one
                if (existing.source !== 'SIMAS' && log.source === 'SIMAS') {
                    duplicatesToDelete.push(existing.id);
                    employeeLogs[log.employee_id][existingIndex] = log;
                } else {
                    duplicatesToDelete.push(log.id);
                }
            } else {
                employeeLogs[log.employee_id].push(log);
            }
        }

        console.log(`Removing ${duplicatesToDelete.length} duplicates...`);
        if (duplicatesToDelete.length > 0) {
            await pool.query('DELETE FROM reading_logs WHERE id IN (?)', [duplicatesToDelete]);
        }

        // Now enforce the 5-book limit and milestone bonus
        console.log('Enforcing 5-book limit and milestone bonus...');
        let bonusApplied = 0;
        let limitEnforced = 0;

        for (const empId in employeeLogs) {
            const logs = employeeLogs[empId];
            for (let i = 0; i < logs.length; i++) {
                const seq = i + 1;
                const log = logs[i];
                let targetIncentive = 0;

                if (seq < 5) {
                    // Books 1-4: 100k (or 50k for comics)
                    targetIncentive = log.title.toLowerCase().includes('keluarga super irit') ? 50000 : 100000;
                } else if (seq === 5) {
                    // Book 5: 100k + 500k = 600k
                    const base = log.title.toLowerCase().includes('keluarga super irit') ? 50000 : 100000;
                    targetIncentive = base + 500000;
                    bonusApplied++;
                } else {
                    // Book 6 onwards: 0k
                    targetIncentive = 0;
                    limitEnforced++;
                }

                if (parseFloat(log.incentive_amount) !== targetIncentive) {
                    updates.push({ id: log.id, amount: targetIncentive });
                }
            }
        }

        console.log(`Updating ${updates.length} records with correct incentives...`);
        for (const u of updates) {
            await pool.query('UPDATE reading_logs SET incentive_amount = ? WHERE id = ?', [u.amount, u.id]);
        }

        console.log('Cleanup and Enforcement finished.');
        console.log(`- Duplicates removed: ${duplicatesToDelete.length}`);
        console.log(`- Milestone bonuses (Book 5): ${bonusApplied}`);
        console.log(`- 5-book limits enforced (Book 6+ set to 0): ${limitEnforced}`);
        
        process.exit(0);
    } catch (err) {
        console.error('Process failed:', err);
        process.exit(1);
    }
}

cleanupAndEnforceLimits();
