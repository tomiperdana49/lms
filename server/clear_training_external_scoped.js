import pool from './db.js';

async function clearExternalTrainingData() {
    try {
        console.log('🗑️ Clearing External Training data (scoped, internal training untouched)...');

        await pool.query('TRUNCATE TABLE external_training_requests');
        console.log('✅ Cleared table: external_training_requests');

        console.log('🎉 External Training data cleared successfully.');
        process.exit(0);
    } catch (err) {
        console.error('❌ Cleanup failed:', err);
        process.exit(1);
    }
}

clearExternalTrainingData();
