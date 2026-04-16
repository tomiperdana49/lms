const mysql = require('mysql2/promise');
const config = {
    host: 'localhost',
    user: 'root',
    database: 'lms_db',
    password: ''
};

async function check() {
    try {
        const connection = await mysql.createConnection(config);
        const [rows] = await connection.execute('SELECT * FROM quiz_results ORDER BY id DESC LIMIT 5');
        console.log("LAST 5 RESULTS:");
        console.log(JSON.stringify(rows, null, 2));
        await connection.end();
    } catch (err) {
        console.error(err);
    }
}
check();
