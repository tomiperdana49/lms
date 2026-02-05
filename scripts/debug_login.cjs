require('dotenv').config();
const mysql = require('mysql2/promise');

const pool = mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME
});

async function simulateLogin() {
    try {
        const email = 'staff@nusa.com';
        const password = '123';
        const identifier = ''; // Empty when logging in with email

        console.log(`Simulating Login for: ${email} with password: ${password}`);

        const loginId = identifier || email;

        const sql = 'SELECT * FROM users WHERE (email = ? OR employee_id = ?) AND password = ?';
        console.log(`Query: ${sql}`);
        console.log(`Params: [${loginId}, ${loginId}, ${password}]`);

        const [users] = await pool.query(sql, [loginId, loginId, password]);

        if (users.length > 0) {
            console.log("✅ LOGIN SUCCESS! User found:");
            console.log(users[0]);
        } else {
            console.log("❌ LOGIN FAILED! No user matching criteria.");

            // Debugging: Check why it failed
            const [checkEmail] = await pool.query('SELECT * FROM users WHERE email = ?', [email]);
            if (checkEmail.length > 0) {
                console.log("   -> Email exists. Password mismatch?");
                console.log(`      Stored Password: '${checkEmail[0].password}'`);
                console.log(`      Input Password:  '${password}'`);
                console.log(`      Match: ${checkEmail[0].password == password}`);
            }
        }

    } catch (err) {
        console.error(err);
    } finally {
        await pool.end();
    }
}

simulateLogin();
