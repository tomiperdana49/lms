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
        const [rows] = await connection.execute('SELECT id, title, quiz_data, pre_quiz_data FROM course_modules');
        console.log("ALL MODULES QUIZ DATA:");
        rows.forEach(r => {
            console.log(`- ID ${r.id}: ${r.title}`);
            console.log(`  Quiz: ${r.quiz_data ? (JSON.parse(r.quiz_data).questions?.length || 0) : 0} questions`);
            console.log(`  Pre: ${r.pre_quiz_data ? (JSON.parse(r.pre_quiz_data).questions?.length || 0) : 0} questions`);
        });
        await connection.end();
    } catch (err) {
        console.error(err);
    }
}
check();
