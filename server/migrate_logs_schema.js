import pool from './db.js';

async function migrate() {
    try {
        console.log('Starting migration to add missing columns to reading_logs...');

        const columnsToAdd = [
            { name: 'start_date', type: 'DATETIME' },
            { name: 'finish_date', type: 'DATETIME' },
            { name: 'evidence_url', type: 'VARCHAR(255)' },
            { name: 'reading_duration', type: 'INT DEFAULT 0' },
            { name: 'hr_approval_status', type: 'VARCHAR(50) DEFAULT "Pending"' },
            { name: 'incentive_amount', type: 'DECIMAL(15, 2) DEFAULT 0' },
            { name: 'rejection_reason', type: 'TEXT' }
        ];

        for (const col of columnsToAdd) {
            // Check if column exists
            const [columns] = await pool.query(`SHOW COLUMNS FROM reading_logs LIKE '${col.name}'`);

            if (columns.length === 0) {
                await pool.query(`ALTER TABLE reading_logs ADD COLUMN ${col.name} ${col.type}`);
                console.log(`✅ Added '${col.name}' column.`);
            } else {
                console.log(`ℹ️ '${col.name}' column already exists.`);
            }
        }

        console.log("Migration complete.");
        process.exit(0);
    } catch (err) {
        console.error("❌ Migration failed:", err);
        process.exit(1);
    }
}

migrate();
