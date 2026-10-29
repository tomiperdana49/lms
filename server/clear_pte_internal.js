import pool from './db.js';

// Post Training Evaluation now only belongs to External Training. Drops every PTE link and
// response that hangs off an Internal Training meeting; External Training PTE data is untouched.
async function clearInternalPteData() {
    const conn = await pool.getConnection();
    try {
        console.log('🗑️ Clearing Internal Training PTE data (External Training PTE untouched)...');
        await conn.beginTransaction();

        const [responseResult] = await conn.query('DELETE FROM post_training_evaluation_responses WHERE meeting_id IS NOT NULL AND external_training_request_id IS NULL');
        console.log(`✅ Deleted ${responseResult.affectedRows} Internal Training PTE response(s)`);

        const [meetingResult] = await conn.query('UPDATE meetings SET pte_form_id = NULL WHERE pte_form_id IS NOT NULL');
        console.log(`✅ Unlinked the PTE form from ${meetingResult.affectedRows} meeting(s)`);

        // Forms left with no External Training request and no response were Internal-only templates.
        const [orphanForms] = await conn.query(`
            SELECT f.id FROM post_training_evaluation_forms f
            WHERE NOT EXISTS (SELECT 1 FROM external_training_requests e WHERE e.pte_form_id = f.id)
              AND NOT EXISTS (SELECT 1 FROM post_training_evaluation_responses r WHERE r.form_id = f.id)
              AND (f.meeting_id IS NOT NULL OR f.deleted_at IS NOT NULL)
        `);
        for (const { id } of orphanForms) {
            await conn.query('DELETE FROM post_training_evaluation_questions WHERE form_id = ?', [id]);
            await conn.query('DELETE FROM post_training_evaluation_forms WHERE id = ?', [id]);
        }
        console.log(`✅ Deleted ${orphanForms.length} Internal-only PTE form(s)`);

        await conn.commit();
        console.log('🎉 Internal Training PTE data cleared successfully.');
        process.exit(0);
    } catch (err) {
        await conn.rollback();
        console.error('❌ Cleanup failed, nothing was changed:', err);
        process.exit(1);
    } finally {
        conn.release();
    }
}

clearInternalPteData();
