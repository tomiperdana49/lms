import pool from '../server/db.js';

async function deleteTomiLogs() {
    try {
        const [users] = await pool.query('SELECT * FROM users WHERE email = ?', ['tomi@nusa.net.id']);
        if (users.length === 0) {
            console.log('User tomi@nusa.net.id not found in users table.');
            process.exit(1);
        }
        const userStr = users[0];
        console.log('Found user:', userStr.name, userStr.employee_id);

        let queryParams = [];
        let queryStr = 'DELETE FROM reading_logs WHERE user_name = ?';
        queryParams.push(userStr.name);

        if (userStr.employee_id) {
            queryStr += ' OR employee_id = ?';
            queryParams.push(userStr.employee_id);
        }

        const [result] = await pool.query(queryStr, queryParams);
        console.log(`Deleted ${result.affectedRows} reading logs for tomi@nusa.net.id.`);
        process.exit(0);
    } catch (err) {
        console.error('Error:', err);
        process.exit(1);
    }
}

deleteTomiLogs();
