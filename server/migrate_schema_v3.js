
import pool from './db.js';

async function migrate() {
    console.log("Migrating Schema V3 (Adding Branch)...");
    try {
        const connection = await pool.getConnection();
        await connection.query(`
            ALTER TABLE users 
            ADD COLUMN IF NOT EXISTS branch VARCHAR(255) DEFAULT 'Headquarters';
        `);
        connection.release();
        console.log("Done.");
        process.exit(0);
    } catch (err) {
        console.error("Migration failed:", err);
        process.exit(1);
    }
}

migrate();
