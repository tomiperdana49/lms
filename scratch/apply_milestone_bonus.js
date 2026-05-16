import pool from '../server/db.js';

async function applyMilestoneBonus() {
    try {
        console.log('Fetching unique employees with approved logs...');
        const [employees] = await pool.query(
            'SELECT DISTINCT employee_id FROM reading_logs WHERE hr_approval_status = "Approved"'
        );

        console.log(`Processing ${employees.length} employees...`);

        let bonusCount = 0;
        let updateCount = 0;

        for (const emp of employees) {
            // MATCH FRONTEND LOGIC: Use COALESCE(finish_date, date) for sequencing
            const [logs] = await pool.query(
                `SELECT id, incentive_amount, title, date, finish_date 
                 FROM reading_logs 
                 WHERE employee_id = ? AND hr_approval_status = "Approved"
                 ORDER BY COALESCE(finish_date, date) ASC, id ASC`,
                [emp.employee_id]
            );

            for (let i = 0; i < logs.length; i++) {
                const sequenceNumber = i + 1;
                const currentLog = logs[i];
                const currentAmount = Math.round(parseFloat(currentLog.incentive_amount));
                
                let targetAmount = currentAmount;

                // Milestone is every 5th book
                if (sequenceNumber % 5 === 0) {
                    // It's a milestone book.
                    // If it doesn't have the bonus yet, add it.
                    // If it's the 5th book but amount is only 50k or 100k, it needs 500k more.
                    if (currentAmount <= 100000) {
                        targetAmount = currentAmount + 500000;
                        bonusCount++;
                    } else {
                        // Already has bonus, just clean up
                        targetAmount = Math.round(currentAmount / 1000) * 1000;
                    }
                } else {
                    // NOT a milestone book.
                    // If it accidentally has a bonus (maybe from previous run with different sorting), remove it.
                    if (currentAmount > 500000) {
                        targetAmount = currentAmount - 500000;
                    } else {
                        targetAmount = Math.round(currentAmount / 1000) * 1000;
                    }
                }

                if (targetAmount !== parseFloat(currentLog.incentive_amount)) {
                    await pool.query(
                        'UPDATE reading_logs SET incentive_amount = ? WHERE id = ?',
                        [targetAmount, currentLog.id]
                    );
                    updateCount++;
                }
            }
        }

        console.log(`Milestone bonus application finished.`);
        console.log(`- New bonuses applied: ${bonusCount}`);
        console.log(`- Total records updated/cleaned: ${updateCount}`);
        process.exit(0);
    } catch (err) {
        console.error('Process failed:', err);
        process.exit(1);
    }
}

applyMilestoneBonus();
