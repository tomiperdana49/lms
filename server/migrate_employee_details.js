import pool from './db.js';

async function migrate() {
    try {
        console.log('🚀 Starting Employee table migration...');
        
        const columns = [
            { name: 'company_group', type: 'VARCHAR(255)' },
            { name: 'company', type: 'VARCHAR(255)' },
            { name: 'band', type: 'VARCHAR(255)' },
            { name: 'directorate', type: 'VARCHAR(255)' },
            { name: 'department', type: 'VARCHAR(255)' },
            { name: 'lob', type: 'VARCHAR(255)' },
            { name: 'division_type_mapping', type: 'VARCHAR(255)' },
            { name: 'gender', type: 'VARCHAR(50)' },
            { name: 'birth_date', type: 'DATE' }
        ];

        for (const col of columns) {
            try {
                await pool.query(`ALTER TABLE employees ADD COLUMN ${col.name} ${col.type}`);
                console.log(`✅ Added column: ${col.name}`);
            } catch (err) {
                if (err.code === 'ER_DUP_COLUMN_NAME') {
                    console.log(`ℹ️ Column ${col.name} already exists, skipping.`);
                } else {
                    console.error(`❌ Failed to add ${col.name}:`, err.message);
                }
            }
        }

        console.log('🎉 Migration completed successfully.');
        process.exit(0);
    } catch (err) {
        console.error('❌ Migration failed:', err);
        process.exit(1);
    }
}

migrate();
