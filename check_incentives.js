import pool from './server/db.js';

const check = async () => {
    try {
        const [rows] = await pool.query("SELECT * FROM incentives");
        console.log(JSON.stringify(rows, null, 2));
        process.exit(0);
    } catch (e) {
        console.error(e);
        process.exit(1);
    }
};

check();
