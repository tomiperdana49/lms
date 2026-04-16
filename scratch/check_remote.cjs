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
        const [rows] = await connection.execute('SELECT * FROM quiz_results ORDER BY id DESC LIMIT 10');
        console.log("LAST 10 RESULTS:");
        console.log(JSON.stringify(rows, null, 2));
        await connection.end();
    } catch (err) {
        console.error(err);
    }
}
check();
