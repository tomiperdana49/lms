import pool from '../server/db.js';

const email = 'tomi@nusa.net.id';

async function cleanup() {
    try {
        console.log(`Searching for user with email: ${email}`);
        const [users] = await pool.query('SELECT * FROM users WHERE email = ?', [email]);
        
        if (users.length === 0) {
            console.log('User not found.');
            return;
        }

        const user = users[0];
        console.log(`Found user: ${user.name} (ID: ${user.id}, EmpID: ${user.employee_id})`);

        // Delete reading logs
        console.log('Deleting reading logs...');
        const [logResult] = await pool.query('DELETE FROM reading_logs WHERE user_name = ? OR employee_id = ?', [user.name, user.employee_id]);
        console.log(`Deleted ${logResult.affectedRows} reading logs.`);

        // Delete user
        console.log('Deleting user...');
        const [userResult] = await pool.query('DELETE FROM users WHERE id = ?', [user.id]);
        console.log(`Deleted user result: ${userResult.affectedRows}`);

        console.log('Cleanup complete.');
    } catch (err) {
        console.error('Error during cleanup:', err);
    } finally {
        process.exit();
    }
}

cleanup();
