
import pool from './db.js';

async function checkData() {
    try {
        console.log("--- USERS ---");
        const [users] = await pool.query("SELECT id, name, email FROM users");
        console.table(users);

        console.log("\n--- QUIZ RESULTS ---");
        const [results] = await pool.query("SELECT * FROM quiz_results");
        console.table(results);

        console.log("\n--- COMPLETE REPORT QUERY ---");
        const sql = `
            SELECT 
                qr.id,
                qr.student_id,
                u.name as student_name,
                qr.score,
                qr.module_id
            FROM quiz_results qr
            LEFT JOIN users u ON qr.student_id = u.id
        `;
        const [report] = await pool.query(sql);
        console.table(report);

    } catch (err) {
        console.error(err);
    } finally {
        process.exit();
    }
}

checkData();
