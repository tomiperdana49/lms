// One-off: push existing (already-completed/paid) records to Nusawork for employees whose data
// predates the automatic sync built into server.js. Automatic sync only fires going forward on
// quiz-submit / meeting-save / external-training-process / reading-log-finish, so anything that
// happened before those hooks existed has no nusawork_id_group saved and was never pushed.
//
// This mirrors the exact push logic (category/title/date/hours/cost formulas) already used by the
// live app in server.js - kept as a separate copy here so this script stays runnable standalone
// without booting the whole Express app.
//
// Usage:
//   node server/backfill_nusawork_sync.js <employee_id>            # push everything for one employee
//   node server/backfill_nusawork_sync.js <employee_id> --dry-run  # preview only, no Nusawork calls, no DB writes
//   node server/backfill_nusawork_sync.js --dry-run                # preview EVERY employee with pending data
//   node server/backfill_nusawork_sync.js                          # push EVERY employee with pending data
//
// Example (the case this was built to demo - Tomi Perdana Putra):
//   node server/backfill_nusawork_sync.js 0201507 --dry-run
//   node server/backfill_nusawork_sync.js 0201507
//
// Omitting <employee_id> processes every employee who has at least one un-synced record - this can
// mean a lot of live Nusawork API calls (one per record), so always run --dry-run first to see the
// scale before doing the real thing.
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

// Zero means "no cost recorded" - send '-' rather than the misleading "Rp0" (matches server.js).
const formatNusaworkCost = (cost) => (Number(cost) > 0 ? `Rp ${Math.round(cost).toLocaleString('id-ID')}` : '-');

// Blank when a participant has no such record - same "empty string, not omitted" convention as the
// live app (matches formatNusaworkScore in server.js).
const formatNusaworkScore = (score) => (score === null || score === undefined || score === '' ? '' : String(score));

// --- Push one note, return its id_group ---
const pushNote = async ({ employeeId, category, title, date, hours, cost, preTest = null, postTest = null, feedback = null }) => {
    const baseUrl = process.env.NUSAWORK_BASE_URL || 'https://nusanet.app.nusawork.com';
    const categoryFieldId = process.env.NUSAWORK_NOTE_CATEGORY_ID || '201';
    const token = await getNusanetToken();

    const response = await fetch(`${baseUrl}/emp/api/client/v4/note/web/${categoryFieldId}/employee`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({
            employee_id: employeeId,
            fields: {
                category, title, date, hours: String(hours), cost: formatNusaworkCost(cost),
                pre_test: formatNusaworkScore(preTest), post_test: formatNusaworkScore(postTest), feedback: formatNusaworkScore(feedback)
            }
        })
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
        throw new Error(`Nusawork rejected the note (${response.status}): ${JSON.stringify(data)}`);
    }
    return data?.data?.id_group || null;
};

// --- Category 1: Online Modules (course completions) ---
async function backfillOnlineModules(empId) {
    console.log('\n=== Online Modules ===');
    // An employee can have multiple passing POST rows for the same course (retakes). Only the
    // earliest one is the "real" completion - matches the live app's passCount === 1 rule in
    // /api/quiz/submit. Also skip the course entirely if ANY of its passing rows already has an
    // id_group, so a retake doesn't get pushed a second time just because a different attempt-row
    // happens to be the one missing it.
    const [rows] = await pool.query(
        `SELECT qr.id as quiz_result_id, qr.course_id, qr.date, qr.score,
                c.title as course_title, c.duration as course_duration
         FROM quiz_results qr
         JOIN courses c ON c.id = qr.course_id
         WHERE qr.employee_id = ? AND qr.module_id IS NULL AND qr.quiz_type = 'POST' AND qr.score >= 80
           AND qr.id = (
               SELECT MIN(qr2.id) FROM quiz_results qr2
               WHERE qr2.employee_id = qr.employee_id AND qr2.course_id = qr.course_id
                 AND qr2.module_id IS NULL AND qr2.quiz_type = 'POST' AND qr2.score >= 80
           )
           AND NOT EXISTS (
               SELECT 1 FROM quiz_results qr3
               WHERE qr3.employee_id = qr.employee_id AND qr3.course_id = qr.course_id
                 AND qr3.module_id IS NULL AND qr3.quiz_type = 'POST' AND qr3.score >= 80
                 AND qr3.nusawork_id_group IS NOT NULL
           )
         ORDER BY qr.date ASC`,
        [empId]
    );

    if (rows.length === 0) {
        console.log('  Nothing to backfill.');
        return;
    }

    for (const row of rows) {
        // Mirrors parseCourseTotalDurationHours() in server.js: pull the leading number out of a
        // free-text duration label like "3 hours" / "3 jam".
        const match = String(row.course_duration || '').match(/(\d+(\.\d+)?)/);
        const hours = match ? Math.round(parseFloat(match[1]) * 100) / 100 : 0;
        const date = new Date(row.date).toISOString().slice(0, 10);

        // Latest PRE-test attempt for this course, same as the preTestRows lookup in /api/quiz/submit.
        const [preRows] = await pool.query(
            `SELECT score FROM quiz_results WHERE course_id = ? AND module_id IS NULL AND quiz_type = 'PRE'
             AND employee_id = ? ORDER BY date DESC LIMIT 1`,
            [row.course_id, empId]
        );
        const preTest = preRows.length > 0 ? preRows[0].score : null;

        console.log(`  - [${row.quiz_result_id}] "${row.course_title}" on ${date}, ${hours}h, pre=${preTest ?? '-'}, post=${row.score}`);
        if (isDryRun) continue;

        const idGroup = await pushNote({ employeeId: empId, category: 'Online Modules', title: row.course_title, date, hours, cost: 0, preTest, postTest: row.score });
        if (idGroup) {
            await pool.query('UPDATE quiz_results SET nusawork_id_group = ? WHERE id = ?', [idGroup, row.quiz_result_id]);
            console.log(`    -> pushed, id_group=${idGroup}`);
        } else {
            console.log('    -> pushed, but no id_group returned - not saved, will retry next run');
        }
    }
}

// --- Category 2: Internal Training (meetings, Paid) ---
async function backfillInternalTraining(empId) {
    console.log('\n=== Internal Training ===');
    const [meetings] = await pool.query(
        `SELECT id, title, time, cost_report_json
         FROM meetings
         WHERE deleted_at IS NULL AND cost_report_json IS NOT NULL
           AND JSON_CONTAINS(cost_report_json, JSON_QUOTE(?), '$.attendee_ids')`,
        [empId]
    );

    if (meetings.length === 0) {
        console.log('  Nothing to backfill.');
        return;
    }

    for (const meeting of meetings) {
        const [[already]] = await pool.query(
            'SELECT id FROM nusawork_training_notes WHERE meeting_id = ? AND employee_id = ?',
            [meeting.id, empId]
        );
        if (already) continue;

        let costReport = null;
        try { costReport = JSON.parse(meeting.cost_report_json); } catch (e) { /* ignore */ }
        if (!costReport?.isPaid) continue;

        let hours = 0;
        if (meeting.time) {
            const parts = meeting.time.split('-');
            if (parts.length === 2) {
                const parseTime = (t) => { const [h, m] = t.split(':').map(Number); return (h || 0) + (m || 0) / 60; };
                const startH = parseTime(parts[0].trim());
                const endH = parseTime(parts[1].trim());
                if (endH > startH) hours = endH - startH;
            }
        }
        hours = Math.round(hours * 100) / 100;

        let cost = 0;
        const participantsCount = costReport.participantsCount || 0;
        if (participantsCount > 0) {
            const tInc = Number(costReport.trainerIncentive ?? costReport.trainer) || 0;
            const sCost = Number(costReport.snackCost ?? costReport.snack) || 0;
            const lCost = Number(costReport.lunchCost ?? costReport.lunch) || 0;
            const oCost = Number(costReport.otherCost ?? costReport.other) || 0;
            cost = Math.round((tInc + sCost + lCost + oCost) / participantsCount);
        }

        // No stored meeting date column read here beyond what's needed - reuse today if absent isn't
        // right, so pull it explicitly.
        const [[dateRow]] = await pool.query('SELECT date FROM meetings WHERE id = ?', [meeting.id]);
        const date = new Date(dateRow.date).toISOString().slice(0, 10);

        // Best PRE/POST score and feedback rating for this employee on this meeting - same "keep the
        // best score" rule as computeLearningStats / getMeetingParticipantScores in server.js.
        const [quizRows] = await pool.query(
            `SELECT quiz_type, score FROM quiz_results WHERE meeting_id = ? AND module_id IS NULL AND employee_id = ?`,
            [meeting.id, empId]
        );
        let preTest = null, postTest = null;
        for (const q of quizRows) {
            if ((q.quiz_type || 'POST').toUpperCase() === 'PRE') {
                if (preTest === null || q.score > preTest) preTest = q.score;
            } else if (postTest === null || q.score > postTest) {
                postTest = q.score;
            }
        }
        const [feedbackRows] = await pool.query(
            `SELECT feedback_data FROM course_feedback WHERE meeting_id = ? AND employee_id = ?`,
            [meeting.id, empId]
        );
        let feedback = null;
        if (feedbackRows.length > 0) {
            try {
                const data = typeof feedbackRows[0].feedback_data === 'string' ? JSON.parse(feedbackRows[0].feedback_data) : feedbackRows[0].feedback_data;
                if (data && data.rating !== undefined) feedback = data.rating;
            } catch (e) { /* ignore */ }
        }

        console.log(`  - [meeting ${meeting.id}] "${meeting.title}" on ${date}, ${hours}h, ${formatNusaworkCost(cost)}, pre=${preTest ?? '-'}, post=${postTest ?? '-'}, feedback=${feedback ?? '-'}`);
        if (isDryRun) continue;

        const idGroup = await pushNote({ employeeId: empId, category: 'Internal Training', title: meeting.title, date, hours, cost, preTest, postTest, feedback });
        if (idGroup) {
            await pool.query(
                'INSERT INTO nusawork_training_notes (meeting_id, employee_id, id_group) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE id_group = VALUES(id_group)',
                [meeting.id, empId, idGroup]
            );
            console.log(`    -> pushed, id_group=${idGroup}`);
        } else {
            console.log('    -> pushed, but no id_group returned - not saved, will retry next run');
        }
    }
}

// --- Category 3: External Training (Processed) ---
async function backfillExternalTraining(empId) {
    console.log('\n=== External Training ===');
    const [rows] = await pool.query(
        `SELECT id, title, start_date, end_date, learning_hours,
                registration_fee, travel_flight_cost, accommodation_cost, miscellaneous_cost
         FROM external_training_requests
         WHERE employee_id = ? AND status = 'Processed' AND deleted_at IS NULL AND nusawork_id_group IS NULL`,
        [empId]
    );

    if (rows.length === 0) {
        console.log('  Nothing to backfill.');
        return;
    }

    for (const row of rows) {
        let hours = 0;
        if (row.learning_hours != null) {
            hours = Number(row.learning_hours) || 0;
        } else if (row.start_date && row.end_date) {
            const diffMs = new Date(row.end_date).getTime() - new Date(row.start_date).getTime();
            if (diffMs > 0) hours = diffMs / (1000 * 60 * 60);
        }
        hours = Math.round(hours * 100) / 100;

        const cost = Math.round(
            (Number(row.registration_fee) || 0) + (Number(row.travel_flight_cost) || 0) +
            (Number(row.accommodation_cost) || 0) + (Number(row.miscellaneous_cost) || 0)
        );
        const date = new Date(row.start_date).toISOString().slice(0, 10);

        console.log(`  - [${row.id}] "${row.title}" on ${date}, ${hours}h, ${formatNusaworkCost(cost)}`);
        if (isDryRun) continue;

        const idGroup = await pushNote({ employeeId: empId, category: 'External Training', title: row.title, date, hours, cost });
        if (idGroup) {
            await pool.query('UPDATE external_training_requests SET nusawork_id_group = ? WHERE id = ?', [idGroup, row.id]);
            console.log(`    -> pushed, id_group=${idGroup}`);
        } else {
            console.log('    -> pushed, but no id_group returned - not saved, will retry next run');
        }
    }
}

// --- Category 4: Reading Log (Finished) ---
function getReadingLogHours(category, incentiveAmount) {
    if (category === 'Buku Fiksi/Novel' || category === 'Majalah') return 0;
    if (category === 'Komik Bisnis/Non Fiksi') return 3;
    if ([
        'Buku Biografi dan Sejarah', 'Buku Bisnis dan Manajemen', 'Buku Paling Diminati',
        'Buku Pengembangan Diri', 'Buku Religi dan Hubungan', 'Buku Sales dan Marketing',
        'Buku Teknologi', 'Buku Terlaris', 'Buku Wajib Baca'
    ].includes(category)) return 15;
    const incentive = Number(incentiveAmount) || 0;
    if (incentive === 100000) return 15;
    if (incentive === 50000) return 3;
    if (incentive > 0) return (incentive / 100000) * 15;
    return 0;
}

async function backfillReadingLog(empId) {
    console.log('\n=== Reading Log ===');
    const [rows] = await pool.query(
        `SELECT id, title, category, date, finish_date, incentive_amount
         FROM reading_logs
         WHERE employee_id = ? AND status = 'Finished' AND nusawork_id_group IS NULL`,
        [empId]
    );

    if (rows.length === 0) {
        console.log('  Nothing to backfill.');
        return;
    }

    for (const row of rows) {
        const hours = getReadingLogHours(row.category, row.incentive_amount);
        const cost = Math.round(Number(row.incentive_amount) || 0);
        const dateSource = row.finish_date || row.date;
        const date = new Date(dateSource).toISOString().slice(0, 10);

        console.log(`  - [${row.id}] "${row.title}" on ${date}, ${hours}h, ${formatNusaworkCost(cost)}`);
        if (isDryRun) continue;

        const idGroup = await pushNote({ employeeId: empId, category: 'Reading Log', title: row.title, date, hours, cost });
        if (idGroup) {
            await pool.query('UPDATE reading_logs SET nusawork_id_group = ? WHERE id = ?', [idGroup, row.id]);
            console.log(`    -> pushed, id_group=${idGroup}`);
        } else {
            console.log('    -> pushed, but no id_group returned - not saved, will retry next run');
        }
    }
}

// Discovers every employee_id with at least one un-synced record, across all four categories - used
// when no <employee_id> argument is given so the whole backfill can run unattended.
async function findEmployeesWithPendingWork() {
    const ids = new Set();

    const [quizRows] = await pool.query(
        `SELECT DISTINCT employee_id FROM quiz_results
         WHERE employee_id IS NOT NULL AND module_id IS NULL AND quiz_type = 'POST'
           AND score >= 80 AND nusawork_id_group IS NULL`
    );
    quizRows.forEach(r => ids.add(r.employee_id));

    const [extRows] = await pool.query(
        `SELECT DISTINCT employee_id FROM external_training_requests
         WHERE employee_id IS NOT NULL AND status = 'Processed' AND deleted_at IS NULL AND nusawork_id_group IS NULL`
    );
    extRows.forEach(r => ids.add(r.employee_id));

    const [logRows] = await pool.query(
        `SELECT DISTINCT employee_id FROM reading_logs
         WHERE employee_id IS NOT NULL AND status = 'Finished' AND nusawork_id_group IS NULL`
    );
    logRows.forEach(r => ids.add(r.employee_id));

    // Internal Training attendees live inside cost_report_json, not a plain column - parse in JS.
    const [meetings] = await pool.query(
        `SELECT id, cost_report_json FROM meetings WHERE deleted_at IS NULL AND cost_report_json IS NOT NULL`
    );
    if (meetings.length > 0) {
        const [trackedRows] = await pool.query('SELECT meeting_id, employee_id FROM nusawork_training_notes');
        const tracked = new Set(trackedRows.map(r => `${r.meeting_id}:${r.employee_id}`));
        for (const meeting of meetings) {
            let costReport = null;
            try { costReport = JSON.parse(meeting.cost_report_json); } catch (e) { continue; }
            if (!costReport?.isPaid) continue;
            for (const empId of costReport.attendee_ids || []) {
                if (!tracked.has(`${meeting.id}:${empId}`)) ids.add(empId);
            }
        }
    }

    return Array.from(ids).sort();
}

async function runForEmployee(empId) {
    await backfillOnlineModules(empId);
    await backfillInternalTraining(empId);
    await backfillExternalTraining(empId);
    await backfillReadingLog(empId);
}

async function main() {
    try {
        if (employeeIdArg) {
            console.log(`Backfilling Nusawork sync for employee_id=${employeeIdArg}${isDryRun ? ' (DRY RUN - no Nusawork calls, no DB writes)' : ''}`);
            await runForEmployee(employeeIdArg);
        } else {
            console.log(`No employee_id given - scanning for every employee with pending data${isDryRun ? ' (DRY RUN - no Nusawork calls, no DB writes)' : ''}...`);
            const employeeIds = await findEmployeesWithPendingWork();
            console.log(`Found ${employeeIds.length} employee(s) with at least one un-synced record.`);
            for (let i = 0; i < employeeIds.length; i++) {
                console.log(`\n############ [${i + 1}/${employeeIds.length}] employee_id=${employeeIds[i]} ############`);
                await runForEmployee(employeeIds[i]);
            }
        }
        console.log('\nDone.');
        process.exit(0);
    } catch (err) {
        console.error('\nBackfill failed:', err.message);
        process.exit(1);
    }
}

main();
