// One-off: backfill approved_by on external_training_requests rows imported via bulk-import before it
// looked up the real supervisor. Uses the same id_report_to / id_report_to_value resolution as
// findReportToEmployee() in server.js.
import pool from './db.js';

async function findReportToEmployee(employeeId) {
    const [rows] = await pool.query('SELECT id_report_to, id_report_to_value FROM employees WHERE id_employee = ?', [employeeId]);
    if (rows.length === 0) return null;
    const { id_report_to, id_report_to_value } = rows[0];
    if (!id_report_to && !id_report_to_value) return null;

    const [leaderRows] = await pool.query(
        `SELECT full_name FROM employees WHERE user_id = ? OR full_name = ? OR nickname = ? LIMIT 1`,
        [
            id_report_to_value || '___INVALID___',
            id_report_to || '___INVALID___',
            id_report_to || '___INVALID___'
        ]
    );
    return leaderRows[0] || null;
}

async function backfill() {
    try {
        const [targets] = await pool.query(`SELECT id, employee_id FROM external_training_requests WHERE approved_by = 'Bulk Import'`);
        console.log(`Found ${targets.length} row(s) with placeholder approved_by = 'Bulk Import'.`);

        let updated = 0;
        let unresolved = 0;
        for (const row of targets) {
            const supervisor = await findReportToEmployee(row.employee_id);
            if (supervisor?.full_name) {
                await pool.query('UPDATE external_training_requests SET approved_by = ? WHERE id = ?', [supervisor.full_name, row.id]);
                updated++;
            } else {
                unresolved++;
                console.log(`  - No supervisor found for row id=${row.id} (employee_id=${row.employee_id}), left as 'Bulk Import'.`);
            }
        }

        console.log(`✅ Updated ${updated} row(s). ${unresolved} row(s) left unresolved (no id_report_to match in employees table).`);
        process.exit(0);
    } catch (err) {
        console.error('❌ Backfill failed:', err);
        process.exit(1);
    }
}

backfill();
