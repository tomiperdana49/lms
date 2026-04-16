const mysql = require('mysql2/promise');
const config = {
    host: 'dbb.nusa.net.id',
    user: 'lms',
    database: 'lms',
    password: 'd27cfd44d40d37576bbdfefa8ef30556'
};

async function check() {
    try {
        const connection = await mysql.createConnection(config);
        const [rows] = await connection.execute('SELECT * FROM progress WHERE user_id = "1775882342687" OR employee_id = "0201507"');
        console.log("USER PROGRESS:");
        console.log(JSON.stringify(rows, null, 2));
        await connection.end();
    } catch (err) {
        console.error(err);
    }
}
check();
