import pool from './db.js';

const migrateIncentives = async () => {
    try {
        const connection = await pool.getConnection();
        console.log("Checking incentives table schema...");

        // Check columns
        const [columns] = await connection.query("SHOW COLUMNS FROM incentives");
        const hasApprovedDate = columns.some(c => c.Field === 'approved_date');

        if (!hasApprovedDate) {
            console.log("Adding approved_date column...");
            await connection.query("ALTER TABLE incentives ADD COLUMN approved_date DATETIME");
            console.log("Column added successfully.");
        } else {
            console.log("Column approved_date already exists.");
        }

        connection.release();
        process.exit(0);
    } catch (err) {
        console.error("Migration failed:", err);
        process.exit(1);
    }
};

migrateIncentives();
