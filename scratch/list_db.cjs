const mysql = require('mysql2/promise');
const config = {
    host: 'localhost',
    user: 'root',
    database: 'mysql',
    password: ''
};

async function check() {
    try {
        const connection = await mysql.createConnection(config);
        const [rows] = await connection.execute('SHOW DATABASES');
        console.log(JSON.stringify(rows, null, 2));
        await connection.end();
    } catch (err) {
        console.error(err);
    }
}
check();
