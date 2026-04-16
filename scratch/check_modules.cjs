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
        const [rows] = await connection.execute('SELECT * FROM course_modules WHERE course_id = 16');
        console.log("MODULES FOR COURSE 16:");
        console.log(JSON.stringify(rows, null, 2));
        await connection.end();
    } catch (err) {
        console.error(err);
    }
}
check();
