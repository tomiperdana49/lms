// Companion to backfill_nusawork_sync.js: deletes Nusawork notes for records that already have a
// nusawork_id_group saved, then clears that marker locally so the record is treated as "not synced"
// again (e.g. before re-running the backfill after a cost-format fix, or to undo a mistaken push).
//
// This does NOT delete anything from the LMS database itself (courses, meetings, reading logs, ...)
// - it only removes the Nusawork note and forgets the id_group that pointed to it.
//
// Usage:
//   node server/delete_nusawork_sync.js <employee_id>            # delete everything synced for one employee
//   node server/delete_nusawork_sync.js <employee_id> --dry-run  # preview only, no Nusawork calls, no DB writes
//   node server/delete_nusawork_sync.js --dry-run                # preview EVERY employee with a synced note
//   node server/delete_nusawork_sync.js                          # delete for EVERY employee with a synced note
//
// Example (the case this was built to demo - Tomi Perdana Putra):
//   node server/delete_nusawork_sync.js 0201507 --dry-run
//   node server/delete_nusawork_sync.js 0201507
//
// Omitting <employee_id> processes every employee who has at least one synced note - this can mean a
// lot of live Nusawork API calls (one per note), so always run --dry-run first to see the scale
// before doing the real thing.
//
// Not run automatically - run manually when you're ready.

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import pool from './db.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const cliArgs = process.argv.slice(2);
const isDryRun = cliArgs.includes('--dry-run');
const employeeIdArg = cliArgs.find(a => !a.startsWith('--')) || null;

// --- Nusawork auth (same cache file / client_credentials flow as server.js) ---
const TOKEN_FILE = path.join(__dirname, '../tmp/nusanet_token.json');
let cachedToken = null;

const loadCachedToken = () => {
    if (cachedToken) return cachedToken;
    try {
        if (fs.existsSync(TOKEN_FILE)) {
            const data = JSON.parse(fs.readFileSync(TOKEN_FILE, 'utf8'));
            if (Date.now() - data.savedAt < 86400000) {
                cachedToken = data.token;
                return cachedToken;
            }
        }
    } catch (e) { /* ignore */ }
    return null;
};

const getNusanetToken = async () => {
    const cached = loadCachedToken();
    if (cached) return cached;

    const baseUrl = process.env.NUSAWORK_BASE_URL || 'https://nusanet.app.nusawork.com';
    const authUrl = process.env.NUSANET_AUTH_URL || `${baseUrl}/auth/api/oauth/token`;
    const clientId = process.env.NUSAWORK_CLIENT_ID || '4';
    const clientSecret = process.env.NUSAWORK_CLIENT_SECRET || '';
    const grantType = process.env.NUSAWORK_GRANT_TYPE || 'client_credentials';

    const response = await fetch(authUrl, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'Accept': 'application/json',
            'Authorization': 'Basic ' + Buffer.from(`${clientId}:${clientSecret}`).toString('base64')
        },
        body: new URLSearchParams({ grant_type: grantType, client_id: clientId, client_secret: clientSecret })
    });
    const data = await response.json();
    if (!response.ok || !data.access_token) {
        throw new Error(`Failed to obtain Nusawork token: ${JSON.stringify(data)}`);
    }
    cachedToken = data.access_token;
    try {
        fs.writeFileSync(TOKEN_FILE, JSON.stringify({ token: cachedToken, savedAt: Date.now() }), 'utf8');
    } catch (e) { /* ignore cache-write failure, token still usable this run */ }
    return cachedToken;
};

// --- Delete one note. A 404 ("Group field not found") means it's already gone on Nusawork's side -
// treated as success here since the end state (no note, no local marker) is the same either way. ---
const deleteNote = async (employeeId, idGroup) => {
    const baseUrl = process.env.NUSAWORK_BASE_URL || 'https://nusanet.app.nusawork.com';
    const categoryFieldId = process.env.NUSAWORK_NOTE_CATEGORY_ID || '201';
    const token = await getNusanetToken();

    const url = `${baseUrl}/emp/api/client/v4/note/web/${categoryFieldId}/employee?employee_id=${encodeURIComponent(employeeId)}&id_group=${encodeURIComponent(idGroup)}`;
    const response = await fetch(url, { method: 'DELETE', headers: { 'Authorization': `Bearer ${token}` } });
    const data = await response.json().catch(() => ({}));
    if (!response.ok && response.status !== 404) {
        throw new Error(`Nusawork rejected the delete (${response.status}): ${JSON.stringify(data)}`);
    }
    return { alreadyGone: response.status === 404 };
};

// --- Category 1: Online Modules (course completions) ---
async function deleteOnlineModules(empId) {
    console.log('\n=== Online Modules ===');
    // LEFT JOIN (not JOIN) - a note can still be tracked even after its course was deleted, and
    // deletion shouldn't depend on the course still existing to find it.
    const [rows] = await pool.query(
        `SELECT qr.id as quiz_result_id, qr.nusawork_id_group, COALESCE(c.title, CONCAT('Course #', qr.course_id)) as course_title
         FROM quiz_results qr
         LEFT JOIN courses c ON c.id = qr.course_id
         WHERE qr.employee_id = ? AND qr.nusawork_id_group IS NOT NULL`,
        [empId]
    );

    if (rows.length === 0) {
        console.log('  Nothing to delete.');
        return;
    }

    for (const row of rows) {
        console.log(`  - [${row.quiz_result_id}] "${row.course_title}", id_group=${row.nusawork_id_group}`);
        if (isDryRun) continue;

        const { alreadyGone } = await deleteNote(empId, row.nusawork_id_group);
        await pool.query('UPDATE quiz_results SET nusawork_id_group = NULL WHERE id = ?', [row.quiz_result_id]);
        console.log(`    -> ${alreadyGone ? 'already gone on Nusawork, ' : ''}cleared locally`);
    }
}

// --- Category 2: Internal Training (meetings) ---
async function deleteInternalTraining(empId) {
    console.log('\n=== Internal Training ===');
    const [rows] = await pool.query(
        `SELECT ntn.id as tracking_id, ntn.meeting_id, ntn.id_group, m.title
         FROM nusawork_training_notes ntn
         JOIN meetings m ON m.id = ntn.meeting_id
         WHERE ntn.employee_id = ?`,
        [empId]
    );

    if (rows.length === 0) {
        console.log('  Nothing to delete.');
        return;
    }

    for (const row of rows) {
        console.log(`  - [meeting ${row.meeting_id}] "${row.title}", id_group=${row.id_group}`);
        if (isDryRun) continue;

        const { alreadyGone } = await deleteNote(empId, row.id_group);
        await pool.query('DELETE FROM nusawork_training_notes WHERE id = ?', [row.tracking_id]);
        console.log(`    -> ${alreadyGone ? 'already gone on Nusawork, ' : ''}cleared locally`);
    }
}

// --- Category 3: External Training ---
async function deleteExternalTraining(empId) {
    console.log('\n=== External Training ===');
    const [rows] = await pool.query(
        `SELECT id, title, nusawork_id_group FROM external_training_requests
         WHERE employee_id = ? AND nusawork_id_group IS NOT NULL`,
        [empId]
    );

    if (rows.length === 0) {
        console.log('  Nothing to delete.');
        return;
    }

    for (const row of rows) {
        console.log(`  - [${row.id}] "${row.title}", id_group=${row.nusawork_id_group}`);
        if (isDryRun) continue;

        const { alreadyGone } = await deleteNote(empId, row.nusawork_id_group);
        await pool.query('UPDATE external_training_requests SET nusawork_id_group = NULL WHERE id = ?', [row.id]);
        console.log(`    -> ${alreadyGone ? 'already gone on Nusawork, ' : ''}cleared locally`);
    }
}

// --- Category 4: Reading Log ---
async function deleteReadingLog(empId) {
    console.log('\n=== Reading Log ===');
    const [rows] = await pool.query(
        `SELECT id, title, nusawork_id_group FROM reading_logs
         WHERE employee_id = ? AND nusawork_id_group IS NOT NULL`,
        [empId]
    );

    if (rows.length === 0) {
        console.log('  Nothing to delete.');
        return;
    }

    for (const row of rows) {
        console.log(`  - [${row.id}] "${row.title}", id_group=${row.nusawork_id_group}`);
        if (isDryRun) continue;

        const { alreadyGone } = await deleteNote(empId, row.nusawork_id_group);
        await pool.query('UPDATE reading_logs SET nusawork_id_group = NULL WHERE id = ?', [row.id]);
        console.log(`    -> ${alreadyGone ? 'already gone on Nusawork, ' : ''}cleared locally`);
    }
}

// Discovers every employee_id with at least one synced note, across all four categories - used when
// no <employee_id> argument is given so the whole cleanup can run unattended.
async function findEmployeesWithSyncedNotes() {
    const ids = new Set();

    const [quizRows] = await pool.query(
        `SELECT DISTINCT employee_id FROM quiz_results WHERE employee_id IS NOT NULL AND nusawork_id_group IS NOT NULL`
    );
    quizRows.forEach(r => ids.add(r.employee_id));

    const [trainingRows] = await pool.query(`SELECT DISTINCT employee_id FROM nusawork_training_notes`);
    trainingRows.forEach(r => ids.add(r.employee_id));

    const [extRows] = await pool.query(
        `SELECT DISTINCT employee_id FROM external_training_requests WHERE employee_id IS NOT NULL AND nusawork_id_group IS NOT NULL`
    );
    extRows.forEach(r => ids.add(r.employee_id));

    const [logRows] = await pool.query(
        `SELECT DISTINCT employee_id FROM reading_logs WHERE employee_id IS NOT NULL AND nusawork_id_group IS NOT NULL`
    );
    logRows.forEach(r => ids.add(r.employee_id));

    return Array.from(ids).sort();
}

async function runForEmployee(empId) {
    await deleteOnlineModules(empId);
    await deleteInternalTraining(empId);
    await deleteExternalTraining(empId);
    await deleteReadingLog(empId);
}

async function main() {
    try {
        if (employeeIdArg) {
            console.log(`Deleting Nusawork sync for employee_id=${employeeIdArg}${isDryRun ? ' (DRY RUN - no Nusawork calls, no DB writes)' : ''}`);
            await runForEmployee(employeeIdArg);
        } else {
            console.log(`No employee_id given - scanning for every employee with a synced note${isDryRun ? ' (DRY RUN - no Nusawork calls, no DB writes)' : ''}...`);
            const employeeIds = await findEmployeesWithSyncedNotes();
            console.log(`Found ${employeeIds.length} employee(s) with at least one synced note.`);
            for (let i = 0; i < employeeIds.length; i++) {
                console.log(`\n############ [${i + 1}/${employeeIds.length}] employee_id=${employeeIds[i]} ############`);
                await runForEmployee(employeeIds[i]);
            }
        }
        console.log('\nDone.');
        process.exit(0);
    } catch (err) {
        console.error('\nDelete failed:', err.message);
        process.exit(1);
    }
}

main();
