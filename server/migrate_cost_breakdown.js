import pool from './db.js';

async function migrate() {
    try {
        console.log('Starting migration to add cost breakdown columns to training_requests...');

        const columnsToAdd = [
            { name: 'cost_training', type: 'DECIMAL(15, 2) DEFAULT 0' },
            { name: 'cost_transport', type: 'DECIMAL(15, 2) DEFAULT 0' },
            { name: 'cost_accommodation', type: 'DECIMAL(15, 2) DEFAULT 0' },
            { name: 'cost_others', type: 'DECIMAL(15, 2) DEFAULT 0' }
        ];

        for (const col of columnsToAdd) {
            // Check if column exists
            const [columns] = await pool.query(`SHOW COLUMNS FROM training_requests LIKE '${col.name}'`);

            if (columns.length === 0) {
                await pool.query(`ALTER TABLE training_requests ADD COLUMN ${col.name} ${col.type}`);
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
