import express from 'express';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import multer from 'multer';
import pool, { initDB, simAssetPool } from './db.js';
import nodemailer from 'nodemailer';
import { extractGForm } from './import-gform.js';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3003;

app.use(cors());
// Increase payload limit for large JSON (guests list etc)
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// --- MAILER SETUP ---
const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'smtp.gmail.com',
    port: parseInt(process.env.SMTP_PORT || '587'),
    secure: false, // true for 465, false for other ports
    auth: {
        user: process.env.SMTP_USER, // e.g. 'user@gmail.com'
        pass: process.env.SMTP_PASS  // e.g. 'password'
    }
});

const sendMeetingInvite = async (meeting, recipients) => {
    if (!recipients || recipients.length === 0) return;
    if (!process.env.SMTP_USER) {
        console.log('Skipping email: SMTP_USER not configured in .env');
        return;
    }

    const mailOptions = {
        from: `"LMS Internal Training" <${process.env.SMTP_USER}>`,
        to: recipients.join(', '), // Send to all guests
        subject: `Invitation: ${meeting.title}`,
        html: `
            <div style="font-family: Arial, sans-serif; color: #333;">
                <h2 style="color: #4F46E5;">You are invited to: ${meeting.title}</h2>
                <p><strong>Date:</strong> ${new Date(meeting.date).toLocaleDateString()}</p>
                <p><strong>Time:</strong> ${meeting.time}</p>
                <p><strong>Host:</strong> ${meeting.host}</p>
                <p><strong>Type:</strong> ${meeting.type}</p>
                ${meeting.location ? `<p><strong>Location:</strong> ${meeting.location}</p>` : ''}
                ${meeting.meetLink ? `<p><strong>Link:</strong> <a href="${meeting.meetLink}">${meeting.meetLink}</a></p>` : ''}
                
                <hr style="border: 0; border-top: 1px solid #eee; margin: 20px 0;" />
                
                <p><strong>Description:</strong><br/>${meeting.description || 'No description provided.'}</p>
                
                <p style="margin-top: 30px; font-size: 12px; color: #888;">
                    This is an automated message from LMS Nusa.
                </p>
            </div>
        `
    };

    try {
        const info = await transporter.sendMail(mailOptions);
        console.log('Message sent: %s', info.messageId);
    } catch (error) {
        console.error('Error sending email:', error);
    }
};
const UPLOADS_DIR = path.join(__dirname, '../uploads');

// Ensure Uploads Directory Exists
if (!fs.existsSync(UPLOADS_DIR)) {
    fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

// Initialize Database
initDB().then(async () => {
    try {
        const [cols] = await pool.query('DESCRIBE courses');
        console.log('ACTUAL DATABASE COLUMNS:', cols.map(c => c.Field).join(', '));
    } catch (e) {
        console.error('Failed to describe table:', e.message);
    }

    // Runs after initDB's migrations so the meeting_id column is guaranteed to exist by now.
    // backfillPteResponseMeetingIds is defined further down this module - safe to reference here
    // since this callback only fires once the whole module has finished loading.
    await backfillPteResponseMeetingIds();

    try {
        await migrateLocalPasswords();
    } catch (e) {
        console.error('[AUTH] Password migration failed:', e.message);
    }

    // Opt-in, so a dev machine running on a copy of production data never sends real IS5 tickets.
    if (process.env.IDP_REVIEW_REMINDERS_ENABLED === 'true') {
        scheduleReminderJob('IDP GT', runIdpReviewReminders);
    }
    if (process.env.COMPETENCY_REMINDERS_ENABLED === 'true') {
        scheduleReminderJob('COMPETENCY GT', runCompetencyAssessmentReminders);
    }
    if (process.env.PTE_REMINDERS_ENABLED === 'true') {
        scheduleReminderJob('PTE GT', runPteReminders);
    }
});

// Multer Config
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, UPLOADS_DIR);
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, uniqueSuffix + path.extname(file.originalname));
    }
});
const upload = multer({ storage: storage });

// Serve Static Files
app.use('/uploads', express.static(UPLOADS_DIR));
app.use('/api/uploads', express.static(UPLOADS_DIR));

// --- AUTH POOL WRAPPERS ---
// Helper to execute query safely
const query = async (sql, params) => {
    const [results] = await pool.query(sql, params);
    return results;
};

// --- AUTHENTICATION ---
// Login issues a signed session token (HMAC-SHA256 over a small JSON payload), which the frontend
// sends as "Authorization: Bearer <token>" on every API call (see src/utils/actorFetch.ts). The
// middleware below rejects any /api request without a valid one, except the routes that must work
// logged-out. The token only carries the user id - role and profile are re-read from `users` on
// every request, so a role change or deleted account takes effect immediately.
// An impersonation token (HR signed in as another user) also carries `imp`, the HR account's id:
// requests run as `uid`, and `imp` is re-checked to still be HR on every request.
const AUTH_SECRET = process.env.AUTH_SECRET || (() => {
    console.warn('[AUTH] AUTH_SECRET is not set - using a random per-process secret. Every restart will log all users out.');
    return crypto.randomBytes(32).toString('hex');
})();
// Matches the frontend's absolute session timeout (src/App.tsx), which also enforces the 30-minute idle timeout.
const AUTH_TOKEN_TTL_MS = 8 * 60 * 60 * 1000;
const getSessionEpoch = () => process.env.SESSION_EPOCH || 'v1';

const signAuthPayload = (payload) => crypto.createHmac('sha256', AUTH_SECRET).update(payload).digest('base64url');

const issueAuthToken = (userId, impersonatorId = null) => {
    const payload = Buffer.from(JSON.stringify({
        uid: String(userId),
        ...(impersonatorId ? { imp: String(impersonatorId) } : {}),
        epoch: getSessionEpoch(),
        exp: Date.now() + AUTH_TOKEN_TTL_MS
    })).toString('base64url');
    return `${payload}.${signAuthPayload(payload)}`;
};

// Returns { uid, imp } from the token (imp only on an impersonation token), or null if it is
// malformed, tampered with, expired, or from an older session epoch.
const verifyAuthToken = (token) => {
    const [payload, signature] = String(token || '').split('.');
    if (!payload || !signature) return null;
    const expected = Buffer.from(signAuthPayload(payload));
    const actual = Buffer.from(signature);
    if (expected.length !== actual.length || !crypto.timingSafeEqual(expected, actual)) return null;
    try {
        const { uid, imp, epoch, exp } = JSON.parse(Buffer.from(payload, 'base64url').toString());
        if (!uid || epoch !== getSessionEpoch() || !(exp > Date.now())) return null;
        return { uid, imp: imp || null };
    } catch {
        return null;
    }
};

// Local passwords are stored as "scrypt$<salt>$<hash>". UNUSABLE_PASSWORD marks accounts that
// can only sign in through Nusawork or Google - it never matches, since it isn't a valid hash.
const UNUSABLE_PASSWORD = '!';
// The shared default every seeded account had - see migrateLocalPasswords below.
const SHARED_DEFAULT_PASSWORDS = new Set(['nusanet', 'nusanet-oauth-placeholder', 'google-oauth-placeholder', '123', '']);

const scryptAsync = (password, salt) => new Promise((resolve, reject) => {
    crypto.scrypt(password, salt, 64, (err, key) => err ? reject(err) : resolve(key));
});

const hashPassword = async (password) => {
    const salt = crypto.randomBytes(16);
    const key = await scryptAsync(password, salt);
    return `scrypt$${salt.toString('base64')}$${key.toString('base64')}`;
};

const verifyPassword = async (password, stored) => {
    if (!password || typeof stored !== 'string' || !stored.startsWith('scrypt$')) return false;
    const [, saltB64, keyB64] = stored.split('$');
    const expected = Buffer.from(keyB64 || '', 'base64');
    if (!saltB64 || expected.length === 0) return false;
    const actual = await scryptAsync(password, Buffer.from(saltB64, 'base64'));
    return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
};

// One-time, idempotent: hashes any plaintext password left in `users`, and disables the shared
// seeded default ("nusanet") and the OAuth placeholders instead of hashing them - those accounts
// sign in through Nusawork (their real password) or Google.
const migrateLocalPasswords = async () => {
    const rows = await query(`SELECT id, password FROM users WHERE password NOT LIKE 'scrypt$%' AND password <> ?`, [UNUSABLE_PASSWORD]);
    let disabled = 0;
    for (const row of rows) {
        if (SHARED_DEFAULT_PASSWORDS.has(row.password)) {
            await query('UPDATE users SET password = ? WHERE id = ?', [UNUSABLE_PASSWORD, row.id]);
            disabled++;
        } else {
            await query('UPDATE users SET password = ? WHERE id = ?', [await hashPassword(row.password), row.id]);
        }
    }
    if (rows.length > 0) {
        console.log(`[AUTH] Password migration: ${rows.length - disabled} hashed, ${disabled} shared/placeholder passwords disabled.`);
    }
};

// Reachable without a session: sign-in itself, what the login page needs before sign-in, public
// certificate verification (the /verify/:serial page), and the external API, which has its own
// OAuth client-credentials check (authenticateExternalApi).
const PUBLIC_API_ROUTES = [
    ['POST', /^\/api\/login$/],
    ['POST', /^\/api\/auth\/google$/],
    ['GET', /^\/api\/config$/],
    ['GET', /^\/api\/auth\/session-epoch$/],
    ['GET', /^\/api\/(internal|online)-certificates\/verify\/[^/]+$/],
    ['POST', /^\/api\/oauth\/token$/],
    [null, /^\/api\/external\//],
];

app.use(async (req, res, next) => {
    if (!req.path.startsWith('/api/') || req.method === 'OPTIONS') return next();
    if (PUBLIC_API_ROUTES.some(([method, pattern]) => (!method || method === req.method) && pattern.test(req.path))) return next();

    const header = String(req.headers.authorization || '');
    const session = header.startsWith('Bearer ') ? verifyAuthToken(header.slice(7)) : null;
    if (!session) return res.status(401).json({ success: false, message: 'Authentication required' });

    try {
        const [user] = await query('SELECT id, email, name, role, employee_id FROM users WHERE id = ?', [session.uid]);
        if (!user) return res.status(401).json({ success: false, message: 'Authentication required' });
        if (session.imp) {
            // The HR account behind an impersonation session must still exist and still be HR.
            const [impersonator] = await query('SELECT id, email, name, role, employee_id FROM users WHERE id = ?', [session.imp]);
            if (!impersonator || !isHRRole(impersonator.role)) return res.status(401).json({ success: false, message: 'Authentication required' });
            req.impersonator = impersonator;
        }
        req.user = user;
        next();
    } catch (err) {
        console.error('[AUTH] Failed to load session user:', err.message);
        res.status(500).json({ error: 'Database error' });
    }
});

const isHRRole = (role) => role === 'HR' || role === 'HR_ADMIN';

// Admin Panel only: user management, the activity log, admin tools and debug dumps.
app.use(['/api/users', '/api/admin', '/api/activity-logs', '/api/debug'], (req, res, next) => {
    if (!isHRRole(req.user?.role)) return res.status(403).json({ success: false, message: 'HR access required' });
    next();
});

// --- ACTIVITY LOG (Admin Panel > Logs) ---
// Every successful write request under /api is recorded to activity_logs, attributed to the
// signed-in user from the session token (see the auth middleware above). Rules map a route to a module/action pair
// the Logs page can filter on; `lookup` resolves a human-readable label for the affected record
// BEFORE the handler runs, so a DELETE can still name what it deleted.
const approvalAction = (status) => {
    const s = String(status || '').toLowerCase();
    if (s === 'approved') return 'approve';
    if (s === 'rejected') return 'reject';
    return 'update';
};

const ACTIVITY_RULES = [
    ['POST', /^\/api\/auth\/impersonate$/, 'auth', 'impersonate_start', { lookup: ['users', 'name'], id: (b) => b.userId }],
    ['POST', /^\/api\/auth\/impersonate\/stop$/, 'auth', 'impersonate_stop'],

    ['POST', /^\/api\/logs$/, 'reading_log', 'create', { label: (b) => b.title }],
    ['PATCH', /^\/api\/logs\/([^/]+)\/cancel$/, 'reading_log', 'cancel', { lookup: ['reading_logs', 'title'] }],
    ['DELETE', /^\/api\/logs\/([^/]+)$/, 'reading_log', 'delete', { lookup: ['reading_logs', 'title'] }],
    ['PUT', /^\/api\/logs\/([^/]+)$/, 'reading_log', (b) => {
        if (b.hrApprovalStatus === 'Pending') return 'claim_incentive';
        return b.hrApprovalStatus ? approvalAction(b.hrApprovalStatus) : 'update';
    }, { lookup: ['reading_logs', 'title'] }],
    ['POST', /^\/api\/books\/borrow$/, 'reading_log', 'borrow', { label: (b) => b.title }],
    ['POST', /^\/api\/books\/return$/, 'reading_log', 'return', { lookup: ['reading_logs', 'title'], id: (b) => b.id }],

    ['POST', /^\/api\/courses$/, 'online_module', 'create', { label: (b) => b.title }],
    ['PUT', /^\/api\/courses\/([^/]+)$/, 'online_module', 'update', { lookup: ['courses', 'title'] }],
    ['DELETE', /^\/api\/courses\/([^/]+)$/, 'online_module', 'delete', { lookup: ['courses', 'title'] }],
    ['DELETE', /^\/api\/progress\/[^/]+\/([^/]+)$/, 'online_module', 'reset_progress', { lookup: ['courses', 'title'] }],
    ['POST', /^\/api\/progress\/complete$/, 'online_module', 'complete_module', { lookup: ['courses', 'title'], id: (b) => b.courseId }],
    // One endpoint serves both Online Module quizzes (courseId) and Internal Training pre/post-tests
    // (meetingId), so the module and the table the title comes from follow whichever id was sent.
    ['POST', /^\/api\/quiz\/submit$/, (b) => b.meetingId ? 'internal_training' : 'online_module', 'submit_quiz', {
        id: (b) => b.meetingId || b.courseId,
        lookup: (b) => b.meetingId ? ['meetings', 'title'] : ['courses', 'title'],
        suffix: (b) => [b.quizType ? `${String(b.quizType).toUpperCase()}-test` : null, b.score != null ? `Nilai ${b.score}` : null].filter(Boolean).join(' · ')
    }],
    ['POST', /^\/api\/online-certificates\/issue$/, 'online_module', 'issue_certificate', { lookup: ['courses', 'title'], id: (b) => b.courseId }],

    ['POST', /^\/api\/meetings$/, 'internal_training', 'create', { label: (b) => b.title }],
    ['POST', /^\/api\/meetings\/bulk$/, 'internal_training', 'import'],
    ['PUT', /^\/api\/meetings\/([^/]+)$/, 'internal_training', 'update', { lookup: ['meetings', 'title'] }],
    ['DELETE', /^\/api\/meetings\/([^/]+)$/, 'internal_training', 'delete', { lookup: ['meetings', 'title'] }],
    ['POST', /^\/api\/internal-certificates\/issue$/, 'internal_training', 'issue_certificate', { lookup: ['meetings', 'title'], id: (b) => b.meetingId }],

    ['POST', /^\/api\/training$/, 'external_training', 'create', { label: (b) => b.title }],
    ['POST', /^\/api\/training\/([^/]+)\/approve$/, 'external_training', (b) => approvalAction(b.action === 'approve' ? 'approved' : b.action === 'reject' ? 'rejected' : b.action), { lookup: ['training_requests', 'title'] }],
    ['PUT', /^\/api\/training\/([^/]+)$/, 'external_training', 'update', { lookup: ['training_requests', 'title'] }],
    ['DELETE', /^\/api\/training\/([^/]+)$/, 'external_training', 'delete', { lookup: ['training_requests', 'title'] }],
    ['POST', /^\/api\/external-training\/request$/, 'external_training', 'create', { label: (b) => b.title }],
    ['POST', /^\/api\/external-training\/bulk-import$/, 'external_training', 'import'],
    ['POST', /^\/api\/external-training\/approve$/, 'external_training', (b) => approvalAction(b.status), { lookup: ['external_training_requests', 'title'], id: (b) => b.id }],
    ['POST', /^\/api\/external-training\/hr-process$/, 'external_training', 'process', { lookup: ['external_training_requests', 'title'], id: (b) => b.id }],
    ['POST', /^\/api\/external-training\/hr-update-details$/, 'external_training', 'update', { lookup: ['external_training_requests', 'title'], id: (b) => b.id }],
    ['POST', /^\/api\/external-training\/renew-certificate$/, 'external_training', 'renew_certificate', { lookup: ['external_training_requests', 'title'], id: (b) => b.id }],
    ['PUT', /^\/api\/external-training\/([^/]+)$/, 'external_training', 'update', { lookup: ['external_training_requests', 'title'] }],
    ['DELETE', /^\/api\/external-training\/([^/]+)$/, 'external_training', 'delete', { lookup: ['external_training_requests', 'title'] }],

    ['POST', /^\/api\/post-training-evaluations$/, 'pte', 'create', { label: (b) => b.title }],
    ['PUT', /^\/api\/post-training-evaluations\/([^/]+)$/, 'pte', 'update', { lookup: ['post_training_evaluation_forms', 'title'] }],
    ['POST', /^\/api\/post-training-evaluations\/([^/]+)\/publish$/, 'pte', 'publish', { lookup: ['post_training_evaluation_forms', 'title'] }],
    ['DELETE', /^\/api\/post-training-evaluations\/([^/]+)$/, 'pte', 'delete', { lookup: ['post_training_evaluation_forms', 'title'] }],
    ['POST', /^\/api\/post-training-evaluations\/([^/]+)\/respond$/, 'pte', 'submit_response', { lookup: ['post_training_evaluation_forms', 'title'] }],

    ['POST', /^\/api\/idp$/, 'idp', 'create', { label: (b) => b.employee_name }],
    ['POST', /^\/api\/idp\/bulk-import$/, 'idp', 'import'],
    ['PATCH', /^\/api\/idp\/action-items\/([^/]+)$/, 'idp', 'update_action_item'],
    ['PUT', /^\/api\/idp\/([^/]+)$/, 'idp', 'update', { lookup: ['idp_plans', 'employee_name'] }],
    ['POST', /^\/api\/idp\/([^/]+)\/submit$/, 'idp', 'submit', { lookup: ['idp_plans', 'employee_name'] }],
    ['POST', /^\/api\/idp\/([^/]+)\/approve$/, 'idp', (b) => approvalAction(b.status), { lookup: ['idp_plans', 'employee_name'] }],
    ['POST', /^\/api\/idp\/([^/]+)\/hr-note$/, 'idp', 'add_note', { lookup: ['idp_plans', 'employee_name'] }],
    ['POST', /^\/api\/idp\/([^/]+)\/review$/, 'idp', 'review', { lookup: ['idp_plans', 'employee_name'] }],
    ['DELETE', /^\/api\/idp\/([^/]+)$/, 'idp', 'delete', { lookup: ['idp_plans', 'employee_name'] }],

    ['POST', /^\/api\/incentives$/, 'incentive', 'create', { label: (b) => b.courseName }],
    ['PUT', /^\/api\/incentives\/([^/]+)$/, 'incentive', (b) => b.status ? approvalAction(b.status) : 'update', { lookup: ['incentives', 'course_name'] }],
    ['DELETE', /^\/api\/incentives\/([^/]+)$/, 'incentive', 'delete', { lookup: ['incentives', 'course_name'] }],

    // The request body uses the camelCase API names (competencyName/position), not the DB columns.
    ['POST', /^\/api\/competency-templates$/, 'competency', (b) => b.requesterId ? 'request_change' : 'create', { label: (b) => [b.competencyName, b.position].filter(Boolean).join(' · ') }],
    ['PUT', /^\/api\/competency-templates\/([^/]+)$/, 'competency', (b) => b.requesterId ? 'request_change' : 'update', { lookup: ['competency_templates', 'kompetensi'] }],
    ['DELETE', /^\/api\/competency-templates\/([^/]+)$/, 'competency', (b, q) => q.requesterId ? 'request_change' : 'delete', { lookup: ['competency_templates', 'kompetensi'] }],
    ['PUT', /^\/api\/competency-standard-overrides$/, 'competency', 'update_standard'],
    ['PUT', /^\/api\/competency-change-requests\/([^/]+)\/approve$/, 'competency', 'approve', { lookup: ['competency_change_requests', 'competency_name'] }],
    ['PUT', /^\/api\/competency-change-requests\/([^/]+)\/reject$/, 'competency', 'reject', { lookup: ['competency_change_requests', 'competency_name'] }],
    ['POST', /^\/api\/competency-assessments$/, 'competency', 'assess', { label: (b) => b.quarter && b.year ? `${b.employeeId} · Q${b.quarter} ${b.year}` : b.employeeId }],

    ['POST', /^\/api\/users$/, 'user', 'create', { label: (b) => b.name || b.email }],
    ['PUT', /^\/api\/users\/([^/]+)$/, 'user', 'update', { lookup: ['users', 'name'] }],
    ['DELETE', /^\/api\/users\/([^/]+)$/, 'user', 'delete', { lookup: ['users', 'name'] }],

    ['POST', /^\/api\/feedback\/submit$/, 'feedback', 'submit_feedback', { lookup: (b) => b.meetingId ? ['meetings', 'title'] : ['courses', 'title'], id: (b) => b.meetingId || b.courseId }],
    ['POST', /^\/api\/feedback$/, 'feedback', 'submit_feedback'],
    ['POST', /^\/api\/utils\/import-gform$/, 'other', 'import'],
];

// Write endpoints that aren't user activity: logins, token plumbing, heartbeats, read-only lookups sent as POST,
// and data syncs (SIMAS/Nusawork) - pages fire those automatically on load, so they'd only flood the log.
const ACTIVITY_SKIP = [
    /^\/api\/login$/, /^\/api\/auth\/google$/,
    /^\/api\/simas\/sync$/, /^\/api\/admin\/sync-all-nusawork$/, /^\/api\/external-training\/[^/]+\/sync-nusawork$/,
    /^\/api\/upload$/, /^\/api\/auth\/refresh$/, /^\/api\/oauth\/token$/, /^\/api\/progress\/time$/,
    /^\/api\/learning-stats\/bulk$/, /^\/api\/employees\/resolve$/,
];

// Columns never shown in a change diff - secrets and bookkeeping that change on every write.
// DIFF_HIDDEN_KEYS applies at any depth inside JSON columns: id lists that just shadow the names
// shown next to them. DIFF_OPAQUE_FIELDS are question banks and form definitions - far too large
// to list field by field, so the log only says they were edited.
const DIFF_IGNORED_FIELDS = new Set(['password', 'session_epoch', 'googleId', 'updated_at', 'created_at', 'user_uuid', 'nusawork_id_group', 'last_login_at', 'last_login_ip']);
const DIFF_HIDDEN_KEYS = new Set(['employee_ids', 'attendee_ids']);
const DIFF_OPAQUE_FIELDS = new Set(['pre_test_data', 'post_test_data', 'feedback_data', 'assessment_data', 'pre_assessment_data', 'entry_pre_test_data', 'payload_json', 'previous_json']);
const DIFF_VALUE_MAX = 300;

const DIFF_MAX_CHANGES = 40;
const DIFF_MAX_DEPTH = 4;

const normalizeDiffValue = (value) => {
    if (value === null || value === undefined) return null;
    if (value instanceof Date) return isNaN(value.getTime()) ? null : value.toISOString();
    if (Buffer.isBuffer(value)) return null;
    if (typeof value === 'object') return JSON.stringify(value);
    return String(value);
};

const clipDiffValue = (v) => (v != null && v.length > DIFF_VALUE_MAX ? `${v.slice(0, DIFF_VALUE_MAX)}…` : v);

// Several columns hold JSON as text (cost_report_json, guests_json...) - parse those so they diff
// field by field instead of as one unreadable blob.
const parseJsonColumn = (value) => {
    if (typeof value !== 'string') return value;
    const trimmed = value.trim();
    if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) return value;
    try { return JSON.parse(trimmed); } catch { return value; }
};

const isPlainObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v) && !(v instanceof Date) && !Buffer.isBuffer(v);

// How a list element is named in the log: a person/record by its name, otherwise its raw value.
const listItemLabel = (item) => {
    if (isPlainObject(item)) return String(item.name || item.title || item.employee_name || item.email || item.employee_id || item.id || JSON.stringify(item));
    return normalizeDiffValue(item) ?? '';
};

const listItemKey = (item) => {
    if (isPlainObject(item)) {
        const key = item.employee_id ?? item.id ?? item.email;
        if (key != null) return `k:${key}`;
    }
    return `v:${JSON.stringify(item)}`;
};

// Pushes { field, path, from, to } for scalar changes and { field, path, added, removed } for list
// membership changes. `path` segments are raw keys; list elements matched by identity appear as
// "[Name]" segments so the UI can show which participant's score changed.
const diffValues = (path, before, after, out, depth) => {
    if (out.length >= DIFF_MAX_CHANGES) return;
    const field = path.join('.');

    // A JSON column filled in for the first time (or cleared) still diffs per sub-field / list item.
    const isEmpty = (v) => v === null || v === undefined || v === '';
    if (isEmpty(before) && isEmpty(after)) return;
    if (isEmpty(before) && isPlainObject(after)) before = {};
    if (isEmpty(after) && isPlainObject(before)) after = {};
    if (isEmpty(before) && Array.isArray(after)) before = [];
    if (isEmpty(after) && Array.isArray(before)) after = [];

    if (depth < DIFF_MAX_DEPTH && isPlainObject(before) && isPlainObject(after)) {
        const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
        for (const key of keys) {
            if (DIFF_HIDDEN_KEYS.has(key)) continue;
            diffValues([...path, key], before[key], after[key], out, depth + 1);
        }
        return;
    }

    if (depth < DIFF_MAX_DEPTH && Array.isArray(before) && Array.isArray(after)) {
        if (JSON.stringify(before) === JSON.stringify(after)) return;
        const beforeByKey = new Map(before.map((item) => [listItemKey(item), item]));
        const afterByKey = new Map(after.map((item) => [listItemKey(item), item]));
        const removed = [...beforeByKey].filter(([k]) => !afterByKey.has(k)).map(([, item]) => clipDiffValue(listItemLabel(item)));
        const added = [...afterByKey].filter(([k]) => !beforeByKey.has(k)).map(([, item]) => clipDiffValue(listItemLabel(item)));
        if (added.length || removed.length) out.push({ field, path, added, removed });
        // Elements present on both sides but edited in place (e.g. a participant's test score).
        for (const [key, afterItem] of afterByKey) {
            const beforeItem = beforeByKey.get(key);
            if (beforeItem === undefined || !isPlainObject(afterItem)) continue;
            diffValues([...path, `[${listItemLabel(afterItem)}]`], beforeItem, afterItem, out, depth + 1);
        }
        return;
    }

    const from = normalizeDiffValue(before);
    const to = normalizeDiffValue(after);
    if (from === to) return;
    // A blank field being initialised to 0/false (e.g. a fresh cost report) isn't a real change.
    const isZeroish = (v) => v === '0' || v === 'false';
    if ((from === null && isZeroish(to)) || (to === null && isZeroish(from))) return;
    out.push({ field, path, from: clipDiffValue(from), to: clipDiffValue(to) });
};

const diffRows = (before, after) => {
    if (!before || !after) return [];
    const changes = [];
    for (const field of Object.keys(after)) {
        if (DIFF_IGNORED_FIELDS.has(field)) continue;
        if (DIFF_OPAQUE_FIELDS.has(field)) {
            if (normalizeDiffValue(before[field]) !== normalizeDiffValue(after[field])) changes.push({ field, path: [field], opaque: true });
            continue;
        }
        diffValues([field], parseJsonColumn(before[field]), parseJsonColumn(after[field]), changes, 0);
    }
    return changes.slice(0, DIFF_MAX_CHANGES);
};

app.use(async (req, res, next) => {
    const method = req.method.toUpperCase();
    const reqPath = req.path;
    if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(method) || !reqPath.startsWith('/api/') || ACTIVITY_SKIP.some((re) => re.test(reqPath))) {
        return next();
    }

    const body = (req.body && typeof req.body === 'object') ? req.body : {};
    let module = 'other';
    let action = method.toLowerCase();
    let targetId = null;
    let targetLabel = null;
    // Set when the matched rule points at a single row that this request edits in place - that row
    // is re-read after the handler finishes and diffed against this snapshot.
    let diffSource = null;
    let beforeRow = null;
    try {
        for (const [ruleMethod, pattern, ruleModule, ruleAction, opts = {}] of ACTIVITY_RULES) {
            if (ruleMethod !== method) continue;
            const match = reqPath.match(pattern);
            if (!match) continue;
            module = typeof ruleModule === 'function' ? ruleModule(body) : ruleModule;
            action = typeof ruleAction === 'function' ? ruleAction(body, req.query || {}) : ruleAction;
            targetId = opts.id ? opts.id(body) : (match[1] ? decodeURIComponent(match[1]) : null);
            if (opts.label) targetLabel = opts.label(body) || null;
            if (opts.lookup && targetId != null && targetId !== '') {
                const [table, column] = typeof opts.lookup === 'function' ? opts.lookup(body) : opts.lookup;
                const rows = await query(`SELECT * FROM \`${table}\` WHERE id = ? LIMIT 1`, [targetId]);
                targetLabel = rows[0]?.[column] || targetLabel;
                if (rows[0] && method !== 'DELETE' && action !== 'create' && action !== 'request_change') {
                    diffSource = { table, id: targetId };
                    beforeRow = rows[0];
                }
            }
            // Extra context after the record's name, e.g. which test and the score for a quiz.
            const suffix = opts.suffix ? opts.suffix(body) : null;
            if (suffix) targetLabel = targetLabel ? `${targetLabel} · ${suffix}` : suffix;
            break;
        }
    } catch (e) {
        console.error('[ACTIVITY LOG] Failed to resolve target:', e.message);
    }

    res.on('finish', async () => {
        if (res.statusCode >= 400) return;
        let changes = [];
        if (diffSource) {
            try {
                const afterRows = await query(`SELECT * FROM \`${diffSource.table}\` WHERE id = ? LIMIT 1`, [diffSource.id]);
                changes = diffRows(beforeRow, afterRows[0]);
            } catch (e) {
                console.error('[ACTIVITY LOG] Failed to diff:', e.message);
            }
        }
        // req.user is set by the auth middleware from the verified session token; it is absent only
        // on the public routes (e.g. login), which are logged without an actor.
        const actor = {
            id: req.user?.id ?? null,
            employeeId: req.user?.employee_id ?? null,
            name: req.user?.name ?? null,
            email: req.user?.email ?? null,
            role: req.user?.role ?? null,
        };
        const impersonator = req.impersonator || null;
        const ip = String(req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '').split(',')[0].trim();
        query(
            `INSERT INTO activity_logs (actor_user_id, actor_employee_id, actor_name, actor_email, actor_role, impersonator_user_id, impersonator_name, impersonator_email, module, action, target_id, target_label, changes, method, path, status_code, ip_address)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [actor.id, actor.employeeId, actor.name, actor.email, actor.role,
             impersonator?.id ?? null, impersonator?.name ?? null, impersonator?.email ?? null,
             module, action,
             targetId != null ? String(targetId).slice(0, 100) : null,
             targetLabel != null ? String(targetLabel).slice(0, 500) : null,
             changes.length ? JSON.stringify(changes) : null,
             method, req.originalUrl.slice(0, 500), res.statusCode, ip.slice(0, 100)]
        ).catch((e) => console.error('[ACTIVITY LOG] Failed to write:', e.message));
    });

    next();
});

// Reading-log incentive claims are capped at 5 (Approved + Pending) per calendar year per employee -
// matches the frontend's claim-button gating in ReadingLogPage.tsx. Enforced here too since the
// frontend check can't stop a direct API call from bypassing it.
const NO_INCENTIVE_CATEGORIES = ['buku fiksi/novel', 'majalah', 'fiction'];

const isIncentiveEligibleCategory = (category) => !NO_INCENTIVE_CATEGORIES.includes((category || '').trim().toLowerCase());

const isUnderIncentiveClaimLimit = async (employeeId, userName, referenceDate) => {
    const year = new Date(referenceDate || Date.now()).getFullYear();
    const identifier = employeeId || userName;
    if (!identifier) return true;
    const matchClause = employeeId ? 'employee_id = ?' : 'user_name = ?';
    const rows = await query(
        `SELECT COUNT(*) as cnt FROM reading_logs
         WHERE hr_approval_status IN ('Approved', 'Pending')
         AND status != 'Cancelled'
         AND ${matchClause}
         AND YEAR(COALESCE(finish_date, date)) = ?`,
        [identifier, year]
    );
    return (rows[0]?.cnt || 0) < 5;
};

// course_modules.duration is stored either as "mm:ss" or as a plain minute count - this converts
// either form to hours. Shared by the learning-stats aggregation and the Nusawork completion sync.
const parseModuleDuration = (dur) => {
    if (!dur) return 0;
    if (typeof dur === 'string' && dur.includes(':')) {
        const [mm, ss] = dur.split(':').map(Number);
        return ((mm || 0) + (ss || 0) / 60) / 60;
    }
    const n = Number(dur);
    return isNaN(n) ? 0 : n / 60;
};

// courses.duration is the free-text "Total Duration" label an admin sets on the course (e.g.
// "60 Hours of Learning"), not the sum of its modules' video lengths - that's what should be
// reported as the course's hours (e.g. to Nusawork), not a tally of raw video playtime.
const parseCourseTotalDurationHours = (durationLabel) => {
    if (!durationLabel) return null;
    const match = String(durationLabel).match(/[\d]+(?:[.,]\d+)?/);
    if (!match) return null;
    const n = parseFloat(match[0].replace(',', '.'));
    return isNaN(n) ? null : n;
};

// --- CERTIFICATE HELPERS ---
const ROMAN_MONTHS = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII'];

const generateCertSerial = (input) => {
    let hash = 0;
    for (let i = 0; i < input.length; i++) {
        hash = (hash * 31 + input.charCodeAt(i)) >>> 0;
    }
    return hash.toString(36).padStart(8, '0').slice(-8);
};

// Branch names are stored as "PT. Media Antar Nusa - Medan" — the certificate only wants the city/unit suffix.
// The head office ("HO") is physically located in Medan, so it's shown as "Medan" rather than the literal "HO".
const formatIssuedIn = (branchName) => {
    if (!branchName) return 'Medan';
    const parts = String(branchName).split('-');
    const last = parts[parts.length - 1].trim();
    if (!last) return 'Medan';
    if (last.toUpperCase() === 'HO') return 'Medan';
    return last;
};

/**
 * Maps snake_case keys of an object to camelCase.
 * @param {Object} obj The object to map.
 * @param {Object} mapping An object where keys are snake_case and values are camelCase.
 * @returns {Object} A new object with mapped keys.
 */
const mapObject = (obj, mapping) => {
    if (!obj) return null;
    const result = { ...obj };
    for (const [snake, camel] of Object.entries(mapping)) {
        if (obj[snake] !== undefined) {
            result[camel] = obj[snake];
        }
    }
    return result;
};

const mapTrainingRequest = (r) => {
    if (!r) return null;
    return {
        ...r,
        submittedAt: r.submitted_at,
        rejectionReason: r.rejection_reason,
        employeeName: r.employee_name,
        employee_id: r.employee_id,
        supervisorName: r.supervisor_name,
        supervisorApprovedAt: r.supervisor_approved_at,
        hrName: r.hr_name,
        hrApprovedAt: r.hr_approved_at,
        employeeRole: r.employee_role,
        costTraining: r.cost_training,
        costTransport: r.cost_transport,
        costAccommodation: r.cost_accommodation,
        costOthers: r.cost_others,
        additionalCost: r.additional_cost,
        justification: r.justification,
        evidenceUrl: r.evidence_url,
        settlementNote: r.settlement_note
    };
};

// Helper for SimAsset Queries (Secondary Database)
const querySimAsset = async (sql, params) => {
    const [results] = await simAssetPool.query(sql, params);
    return results;
};


// --- NUSANET INTEGRATION HELPERS ---
let cachedNusanetToken = null;
const TOKEN_FILE = path.join(__dirname, '../tmp/nusanet_token.json');

const saveCachedToken = (token) => {
    try {
        fs.writeFileSync(TOKEN_FILE, JSON.stringify({ token, savedAt: Date.now() }), 'utf8');
        cachedNusanetToken = token;
        console.log(`[NUSANET OAUTH] Token saved to persistent cache.`);
    } catch (e) {
        console.error(`[NUSANET OAUTH] Failed to save token cache:`, e.message);
    }
};

const loadCachedToken = () => {
    if (cachedNusanetToken) return cachedNusanetToken;
    try {
        if (fs.existsSync(TOKEN_FILE)) {
            const data = JSON.parse(fs.readFileSync(TOKEN_FILE, 'utf8'));
            // Cache token for up to 24 hours (86400000 ms)
            if (Date.now() - data.savedAt < 86400000) {
                cachedNusanetToken = data.token;
                console.log(`[NUSANET OAUTH] Loaded token from persistent cache.`);
                return cachedNusanetToken;
            }
        }
    } catch (e) {
        console.error(`[NUSANET OAUTH] Failed to load token cache:`, e.message);
    }
    return null;
};

// A cached token can go bad without the 24h TTL catching it - e.g. Nusawork revokes/changes the
// client's permissions server-side, which shows up as a 401/403 on the next call, not an expiry we
// can see locally. Clearing both the in-memory and on-disk cache forces the next getNusanetToken()
// call to request a fresh one instead of reusing the same bad token for up to 24h.
const invalidateCachedToken = () => {
    cachedNusanetToken = null;
    try {
        if (fs.existsSync(TOKEN_FILE)) fs.unlinkSync(TOKEN_FILE);
    } catch (e) {
        console.error(`[NUSANET OAUTH] Failed to clear token cache:`, e.message);
    }
};

const getNusanetToken = async (username, password) => {
    if (process.env.NUSANET_TOKEN) {
        return process.env.NUSANET_TOKEN;
    }
    const baseUrl = process.env.NUSAWORK_BASE_URL || process.env.NUSANET_BASE_URL || 'https://nusanet.app.nusawork.com';
    const authUrl = process.env.NUSANET_AUTH_URL || `${baseUrl}/auth/api/oauth/token`;
    const clientId = process.env.NUSAWORK_CLIENT_ID || process.env.NUSANET_CLIENT_ID || '4';
    const clientSecret = process.env.NUSAWORK_CLIENT_SECRET || process.env.NUSANET_CLIENT_SECRET || 'hltSSRhqOAqfA6VRsQIpa9Xfw9m3Ro8LXuTh4Omn';
    const grantType = process.env.NUSAWORK_GRANT_TYPE || 'client_credentials';

    // 1. Try to load from persistent cache first
    const cached = loadCachedToken();
    if (cached) return cached;

    // 2. Try client_credentials (ideal for background sync/Google login)
    try {
        console.log(`[NUSANET OAUTH] Requesting ${grantType} token...`);
        const response = await fetch(authUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'Accept': 'application/json',
                'Authorization': 'Basic ' + Buffer.from(`${clientId}:${clientSecret}`).toString('base64')
            },
            body: new URLSearchParams({
                grant_type: grantType,
                client_id: clientId,
                client_secret: clientSecret
            })
        });

        const data = await response.json();
        if (response.ok && data.access_token) {
            console.log(`[NUSANET OAUTH] Client credentials token obtained successfully.`);
            saveCachedToken(data.access_token);
            return data.access_token;
        } else {
            console.warn(`[NUSANET OAUTH] Client credentials grant failed:`, data);
        }
    } catch (e) {
        console.error(`[NUSANET OAUTH] Client credentials fetch error:`, e.message);
    }

    // 3. Try password grant using passed credentials
    if (username && password) {
        try {
            console.log(`[NUSANET OAUTH] Requesting password token for user ${username}...`);
            const response = await fetch(authUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                    'Accept': 'application/json',
                    'Authorization': 'Basic ' + Buffer.from(`${clientId}:${clientSecret}`).toString('base64')
                },
                body: new URLSearchParams({
                    grant_type: 'password',
                    client_id: clientId,
                    client_secret: clientSecret,
                    username: username,
                    password: password
                })
            });

            const data = await response.json();
            if (response.ok && data.access_token) {
                console.log(`[NUSANET OAUTH] Password token obtained successfully for user ${username}.`);
                saveCachedToken(data.access_token);
                return data.access_token;
            } else {
                console.warn(`[NUSANET OAUTH] Password grant failed:`, data);
            }
        } catch (e) {
            console.error(`[NUSANET OAUTH] Password fetch error:`, e.message);
        }
    }

    // 4. Try password grant using admin credentials from env if configured
    const adminEmail = process.env.NUSANET_ADMIN_EMAIL;
    const adminPassword = process.env.NUSANET_ADMIN_PASSWORD;
    if (adminEmail && adminPassword) {
        try {
            console.log(`[NUSANET OAUTH] Requesting password token for admin ${adminEmail}...`);
            const response = await fetch(authUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                    'Accept': 'application/json',
                    'Authorization': 'Basic ' + Buffer.from(`${clientId}:${clientSecret}`).toString('base64')
                },
                body: new URLSearchParams({
                    grant_type: 'password',
                    client_id: clientId,
                    client_secret: clientSecret,
                    username: adminEmail,
                    password: adminPassword
                })
            });

            const data = await response.json();
            if (response.ok && data.access_token) {
                console.log(`[NUSANET OAUTH] Password token obtained successfully for admin ${adminEmail}.`);
                saveCachedToken(data.access_token);
                return data.access_token;
            } else {
                console.warn(`[NUSANET OAUTH] Admin password grant failed:`, data);
            }
        } catch (e) {
            console.error(`[NUSANET OAUTH] Admin password fetch error:`, e.message);
        }
    }

    return null;
};

// Wraps a Nusawork note API call with automatic retry-on-bad-token: the cached token has no expiry
// we can inspect locally, so a 401/403 here is treated as "the cached token is no longer good"
// (revoked/changed permissions, or genuinely expired) - clear it, fetch a fresh one, and retry the
// same request exactly once. Used by all the note push/update/delete calls below, which previously
// grabbed the token once and never noticed a stale one until the next 24h cache expiry.
const nusaworkFetch = async (url, options = {}) => {
    const withAuth = (t) => ({ ...options, headers: { ...(options.headers || {}), 'Authorization': `Bearer ${t}` } });
    let token = await getNusanetToken();
    let response = await fetch(url, withAuth(token));
    if (response.status === 401 || response.status === 403) {
        invalidateCachedToken();
        token = await getNusanetToken();
        response = await fetch(url, withAuth(token));
    }
    return response;
};

// Pushes one employee note to Nusawork when an online course's final assessment is passed, so the
// completion (hours/scores) shows up alongside HR's own records there. Fire-and-forget from the
// caller's point of view - failures are logged but never block the quiz-submit response.
const pushOnlineModuleCompletionToNusawork = async ({ employeeId, title, date, hours, preTest, postTest, quizResultId }) => {
    if (!employeeId) {
        console.warn('[NUSAWORK ONLINE SYNC] No employee_id resolved, skipping push for course:', title);
        return;
    }
    try {
        const baseUrl = process.env.NUSAWORK_BASE_URL || 'https://nusanet.app.nusawork.com';
        const categoryFieldId = process.env.NUSAWORK_NOTE_CATEGORY_ID || '201';
        const response = await nusaworkFetch(`${baseUrl}/emp/api/client/v4/note/web/${categoryFieldId}/employee`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                employee_id: employeeId,
                fields: {
                    // Identifies which LMS feature this note came from (matches the Learning Report's
                    // section labels) - not the course's own subject-matter category (e.g. "General",
                    // "Technical"), which isn't meaningful in Nusawork's note list.
                    category: 'Online Modules',
                    title,
                    date,
                    hours: String(hours),
                    cost: '-',
                    pre_test: (preTest ?? '') === '' ? '' : String(preTest),
                    post_test: String(postTest),
                    feedback: ''
                }
            })
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
            console.error('[NUSAWORK ONLINE SYNC] Failed:', employeeId, title, response.status, data);
            return;
        }
        console.log('[NUSAWORK ONLINE SYNC] Pushed completion note:', employeeId, title);

        // Save the note's id_group so a later update/delete of this note can reference it -
        // e.g. { data: { is_group: true, id_group: 3786 } }.
        const idGroup = data?.data?.id_group;
        if (idGroup && quizResultId) {
            try {
                await query('UPDATE quiz_results SET nusawork_id_group = ? WHERE id = ?', [idGroup, quizResultId]);
                console.log('[NUSAWORK ONLINE SYNC] Saved id_group', idGroup, 'for quiz_results', quizResultId);
            } catch (dbErr) {
                console.error('[NUSAWORK ONLINE SYNC] Failed to save id_group:', dbErr.message);
            }
        }
    } catch (err) {
        console.error('[NUSAWORK ONLINE SYNC] Error:', employeeId, title, err.message);
    }
};

// Updates an already-pushed Nusawork completion note (identified by its saved id_group) when the
// course it belongs to is edited - e.g. a title/duration change should be reflected on every
// employee's note, not just future completions. Fire-and-forget, same as the create path.
const updateOnlineModuleNoteInNusawork = async ({ employeeId, idGroup, title, date, hours }) => {
    if (!employeeId || !idGroup) return;
    try {
        const baseUrl = process.env.NUSAWORK_BASE_URL || 'https://nusanet.app.nusawork.com';
        const categoryFieldId = process.env.NUSAWORK_NOTE_CATEGORY_ID || '201';
        const response = await nusaworkFetch(`${baseUrl}/emp/api/client/v4/note/web/${categoryFieldId}/employee`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                employee_id: employeeId,
                id_group: idGroup,
                fields: {
                    category: 'Online Modules',
                    title,
                    date,
                    hours: String(hours)
                }
            })
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
            console.error('[NUSAWORK ONLINE SYNC] Update failed:', employeeId, idGroup, response.status, data);
        } else {
            console.log('[NUSAWORK ONLINE SYNC] Updated completion note:', employeeId, idGroup, title);
        }
    } catch (err) {
        console.error('[NUSAWORK ONLINE SYNC] Update error:', employeeId, idGroup, err.message);
    }
};

// Removes a Nusawork note (by employee_id + id_group) - shared by online-module and internal-training
// deletion, since the delete call only ever needs those two identifiers, e.g.
// DELETE /emp/api/client/v4/note/web/201/employee?employee_id=0201507&id_group=3788.
// Fire-and-forget, same as the create/update paths.
const deleteNusaworkNote = async ({ employeeId, idGroup }) => {
    if (!employeeId || !idGroup) return;
    try {
        const baseUrl = process.env.NUSAWORK_BASE_URL || 'https://nusanet.app.nusawork.com';
        const categoryFieldId = process.env.NUSAWORK_NOTE_CATEGORY_ID || '201';
        const url = `${baseUrl}/emp/api/client/v4/note/web/${categoryFieldId}/employee?employee_id=${encodeURIComponent(employeeId)}&id_group=${encodeURIComponent(idGroup)}`;
        const response = await nusaworkFetch(url, { method: 'DELETE' });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
            console.error('[NUSAWORK SYNC] Delete failed:', employeeId, idGroup, response.status, data);
        } else {
            console.log('[NUSAWORK SYNC] Deleted note:', employeeId, idGroup);
        }
    } catch (err) {
        console.error('[NUSAWORK SYNC] Delete error:', employeeId, idGroup, err.message);
    }
};

// Zero means "no cost recorded" (e.g. a Reading Log note pushed before HR approves an incentive) -
// send '-' rather than the misleading "Rp0", matching the online-module note's own convention.
const formatNusaworkCost = (cost) => (Number(cost) > 0 ? `Rp ${Math.round(cost).toLocaleString('id-ID')}` : '-');

// Pushes one employee note to Nusawork when an Internal Training meeting is marked Paid, so the
// cost/hours show up alongside HR's own records there - mirrors pushOnlineModuleCompletionToNusawork.
// Saves the returned id_group into nusawork_training_notes for later update/delete.
// Blank pre_test/post_test/feedback strings when a participant has no such record (didn't take the
// quiz / hasn't submitted feedback yet) - same "empty string, not omitted" convention as the
// online-module note.
const formatNusaworkScore = (score) => (score === null || score === undefined || score === '' ? '' : String(score));

const pushInternalTrainingNoteToNusawork = async ({ employeeId, meetingId, title, date, hours, cost, preTest, postTest, feedback }) => {
    if (!employeeId) return;
    try {
        const baseUrl = process.env.NUSAWORK_BASE_URL || 'https://nusanet.app.nusawork.com';
        const categoryFieldId = process.env.NUSAWORK_NOTE_CATEGORY_ID || '201';
        const response = await nusaworkFetch(`${baseUrl}/emp/api/client/v4/note/web/${categoryFieldId}/employee`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                employee_id: employeeId,
                fields: {
                    category: 'Internal Training',
                    title,
                    date,
                    hours: String(hours),
                    cost: formatNusaworkCost(cost),
                    pre_test: formatNusaworkScore(preTest),
                    post_test: formatNusaworkScore(postTest),
                    feedback: formatNusaworkScore(feedback)
                }
            })
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
            console.error('[NUSAWORK TRAINING SYNC] Failed:', employeeId, title, response.status, data);
            return;
        }
        console.log('[NUSAWORK TRAINING SYNC] Pushed training note:', employeeId, title);
        const idGroup = data?.data?.id_group;
        if (idGroup) {
            try {
                await query(
                    'INSERT INTO nusawork_training_notes (meeting_id, employee_id, id_group) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE id_group = VALUES(id_group)',
                    [meetingId, employeeId, idGroup]
                );
            } catch (dbErr) {
                console.error('[NUSAWORK TRAINING SYNC] Failed to save id_group:', dbErr.message);
            }
        }
    } catch (err) {
        console.error('[NUSAWORK TRAINING SYNC] Error:', employeeId, title, err.message);
    }
};

// Updates an already-pushed Internal Training note when the meeting is edited while still Paid.
const updateInternalTrainingNoteInNusawork = async ({ employeeId, idGroup, title, date, hours, cost, preTest, postTest, feedback }) => {
    if (!employeeId || !idGroup) return;
    try {
        const baseUrl = process.env.NUSAWORK_BASE_URL || 'https://nusanet.app.nusawork.com';
        const categoryFieldId = process.env.NUSAWORK_NOTE_CATEGORY_ID || '201';
        const response = await nusaworkFetch(`${baseUrl}/emp/api/client/v4/note/web/${categoryFieldId}/employee`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                employee_id: employeeId,
                id_group: idGroup,
                fields: {
                    category: 'Internal Training',
                    title,
                    date,
                    hours: String(hours),
                    cost: formatNusaworkCost(cost),
                    pre_test: formatNusaworkScore(preTest),
                    post_test: formatNusaworkScore(postTest),
                    feedback: formatNusaworkScore(feedback)
                }
            })
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
            console.error('[NUSAWORK TRAINING SYNC] Update failed:', employeeId, idGroup, response.status, data);
        } else {
            console.log('[NUSAWORK TRAINING SYNC] Updated training note:', employeeId, idGroup, title);
        }
    } catch (err) {
        console.error('[NUSAWORK TRAINING SYNC] Update error:', employeeId, idGroup, err.message);
    }
};

// Derives the sync inputs for one meeting: attendee employee_ids, total hours (from the "HH:MM-HH:MM"
// time range), and the per-attendee cost split - same formulas computeLearningStats uses so the
// Nusawork note matches what the Learning Report shows for this training.
const getMeetingSyncData = (meetingRow) => {
    let costReport = null;
    let guests = null;
    try { if (meetingRow.cost_report_json) costReport = JSON.parse(meetingRow.cost_report_json); } catch (e) { /* ignore */ }
    try { if (meetingRow.guests_json) guests = JSON.parse(meetingRow.guests_json); } catch (e) { /* ignore */ }

    let hours = 0;
    if (meetingRow.time) {
        const parts = meetingRow.time.split('-');
        if (parts.length === 2) {
            const parseTime = (t) => {
                const [h, m] = t.split(':').map(Number);
                return (h || 0) + (m || 0) / 60;
            };
            const startH = parseTime(parts[0].trim());
            const endH = parseTime(parts[1].trim());
            if (endH > startH) hours = endH - startH;
        }
    }
    hours = Math.round(hours * 100) / 100;

    let costPerParticipant = 0;
    const participantsCount = costReport?.participantsCount || 0;
    if (costReport && participantsCount > 0) {
        const tInc = Number(costReport.trainerIncentive ?? costReport.trainer) || 0;
        const sCost = Number(costReport.snackCost ?? costReport.snack) || 0;
        const lCost = Number(costReport.lunchCost ?? costReport.lunch) || 0;
        const oCost = Number(costReport.otherCost ?? costReport.other) || 0;
        costPerParticipant = (tInc + sCost + lCost + oCost) / participantsCount;
    }

    // Actual attendance (costReport.attendee_ids) is the authoritative participant list - falls back
    // to the invited guest list only if attendance wasn't recorded.
    const employeeIds = new Set();
    (costReport?.attendee_ids || []).forEach(id => { if (id) employeeIds.add(id); });
    if (employeeIds.size === 0) {
        (guests?.employee_ids || []).forEach(id => { if (id) employeeIds.add(id); });
    }

    return {
        isPaid: !!costReport?.isPaid,
        employeeIds: Array.from(employeeIds),
        hours,
        cost: Math.round(costPerParticipant)
    };
};

// The Training Feedback form saves raw per-question answers ({ q1..q10: 1-4 scale, q11/q12: free
// text }), not a single score - so a plain `feedback_data.rating` lookup only ever matches legacy
// bulk-imported rows (which do store a flat { rating }), and silently comes up null for every real
// submission. Averages the numeric qN answers instead, same approach the HR export in
// TrainingInternalList.tsx uses for its own feedback-average column.
const computeFeedbackRating = (data) => {
    if (!data || typeof data !== 'object') return null;
    if (data.rating !== undefined && data.rating !== null) return Number(data.rating);
    const scaleScores = Object.keys(data)
        .filter(k => /^q\d+$/.test(k))
        .map(k => Number(data[k]))
        .filter(v => !isNaN(v));
    if (scaleScores.length === 0) return null;
    return Math.round((scaleScores.reduce((a, b) => a + b, 0) / scaleScores.length) * 10) / 10;
};

// Per-employee pre-test/post-test/feedback for one meeting - same source tables and "keep the best
// score" rule computeLearningStats uses, so the Nusawork note matches what the Learning Report shows.
const getMeetingParticipantScores = async (meetingId) => {
    const quizRows = await query(
        `SELECT employee_id, quiz_type, score FROM quiz_results
         WHERE meeting_id = ? AND module_id IS NULL AND employee_id IS NOT NULL`,
        [meetingId]
    );
    const feedbackRows = await query(
        `SELECT employee_id, feedback_data FROM course_feedback WHERE meeting_id = ? AND employee_id IS NOT NULL`,
        [meetingId]
    );

    const scores = {};
    for (const row of quizRows) {
        if (!scores[row.employee_id]) scores[row.employee_id] = { preTest: null, postTest: null, feedback: null };
        const key = (row.quiz_type || 'POST').toUpperCase() === 'PRE' ? 'preTest' : 'postTest';
        if (scores[row.employee_id][key] === null || row.score > scores[row.employee_id][key]) {
            scores[row.employee_id][key] = row.score;
        }
    }
    for (const row of feedbackRows) {
        if (!scores[row.employee_id]) scores[row.employee_id] = { preTest: null, postTest: null, feedback: null };
        try {
            const data = typeof row.feedback_data === 'string' ? JSON.parse(row.feedback_data) : row.feedback_data;
            scores[row.employee_id].feedback = computeFeedbackRating(data);
        } catch (e) { /* ignore */ }
    }
    return scores;
};

// Reconciles Nusawork training notes against a meeting's before/after Paid state and attendee list.
// Fire-and-forget from the PUT /api/meetings/:id handler - covers three transitions:
//   unpaid -> paid:  create a note for every current attendee
//   paid -> paid:    update notes for attendees still present, create for newly-added ones, delete
//                     for attendees who dropped off the attendance list
//   paid -> unpaid:  delete every note that was created for this meeting
const syncInternalTrainingNotes = async ({ meetingId, title, date, previous, current }) => {
    try {
        if (!previous.isPaid && !current.isPaid) return;

        const existingRows = await query(
            'SELECT employee_id, id_group FROM nusawork_training_notes WHERE meeting_id = ?',
            [meetingId]
        );
        const existingByEmployee = {};
        existingRows.forEach(row => { existingByEmployee[row.employee_id] = row.id_group; });

        if (!current.isPaid) {
            // Unmarked as Paid - retract every note this meeting had pushed.
            existingRows.forEach(row => deleteNusaworkNote({ employeeId: row.employee_id, idGroup: row.id_group }));
            if (existingRows.length > 0) {
                await query('DELETE FROM nusawork_training_notes WHERE meeting_id = ?', [meetingId]);
            }
            return;
        }

        // Paid (either newly, or still) - sync every current attendee.
        const scoresByEmployee = await getMeetingParticipantScores(meetingId);
        for (const employeeId of current.employeeIds) {
            const idGroup = existingByEmployee[employeeId];
            const s = scoresByEmployee[employeeId] || { preTest: null, postTest: null, feedback: null };
            if (idGroup) {
                updateInternalTrainingNoteInNusawork({ employeeId, idGroup, title, date, hours: current.hours, cost: current.cost, preTest: s.preTest, postTest: s.postTest, feedback: s.feedback });
            } else {
                pushInternalTrainingNoteToNusawork({ employeeId, meetingId, title, date, hours: current.hours, cost: current.cost, preTest: s.preTest, postTest: s.postTest, feedback: s.feedback });
            }
        }

        // Attendees removed since the last sync no longer belong in the note list.
        const currentSet = new Set(current.employeeIds);
        const droppedRows = existingRows.filter(row => !currentSet.has(row.employee_id));
        if (droppedRows.length > 0) {
            droppedRows.forEach(row => deleteNusaworkNote({ employeeId: row.employee_id, idGroup: row.id_group }));
            await query(
                'DELETE FROM nusawork_training_notes WHERE meeting_id = ? AND employee_id IN (?)',
                [meetingId, droppedRows.map(row => row.employee_id)]
            );
        }
    } catch (err) {
        console.error('[NUSAWORK TRAINING SYNC] Reconcile error:', meetingId, err.message);
    }
};

// Pushes/updates the Nusawork note for one External Training request - unlike Internal Training,
// this is always exactly one employee per row, so the id_group lives directly on the row instead of
// a separate tracking table.
// Returns { success, error } (like the reading log Nusawork helpers) instead of the fire-and-forget
// void the other push helpers use, so a manual "Sync Nusawork" click can report a real pass/fail
// back to the admin instead of only ever showing up in the server log.
const pushExternalTrainingNoteToNusawork = async ({ employeeId, requestId, title, date, hours, cost }) => {
    if (!employeeId) return { success: false, error: 'No employee_id resolved for this request.' };
    try {
        const baseUrl = process.env.NUSAWORK_BASE_URL || 'https://nusanet.app.nusawork.com';
        const categoryFieldId = process.env.NUSAWORK_NOTE_CATEGORY_ID || '201';
        const response = await nusaworkFetch(`${baseUrl}/emp/api/client/v4/note/web/${categoryFieldId}/employee`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                employee_id: employeeId,
                fields: {
                    category: 'External Training',
                    title,
                    date,
                    hours: String(hours),
                    cost: formatNusaworkCost(cost),
                    pre_test: '',
                    post_test: '',
                    feedback: ''
                }
            })
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
            console.error('[NUSAWORK EXTERNAL TRAINING SYNC] Failed:', employeeId, title, response.status, data);
            return { success: false, error: data?.message || `Nusawork API returned ${response.status}` };
        }
        console.log('[NUSAWORK EXTERNAL TRAINING SYNC] Pushed note:', employeeId, title);
        const idGroup = data?.data?.id_group;
        if (idGroup && requestId) {
            try {
                await query('UPDATE external_training_requests SET nusawork_id_group = ? WHERE id = ?', [idGroup, requestId]);
            } catch (dbErr) {
                console.error('[NUSAWORK EXTERNAL TRAINING SYNC] Failed to save id_group:', dbErr.message);
            }
        }
        return { success: true };
    } catch (err) {
        console.error('[NUSAWORK EXTERNAL TRAINING SYNC] Error:', employeeId, title, err.message);
        return { success: false, error: err.message };
    }
};

const updateExternalTrainingNoteInNusawork = async ({ employeeId, idGroup, title, date, hours, cost }) => {
    if (!employeeId || !idGroup) return { success: false, error: 'No employee_id or Nusawork id_group to update.' };
    try {
        const baseUrl = process.env.NUSAWORK_BASE_URL || 'https://nusanet.app.nusawork.com';
        const categoryFieldId = process.env.NUSAWORK_NOTE_CATEGORY_ID || '201';
        const response = await nusaworkFetch(`${baseUrl}/emp/api/client/v4/note/web/${categoryFieldId}/employee`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                employee_id: employeeId,
                id_group: idGroup,
                fields: {
                    category: 'External Training',
                    title,
                    date,
                    hours: String(hours),
                    cost: formatNusaworkCost(cost),
                    pre_test: '',
                    post_test: '',
                    feedback: ''
                }
            })
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
            console.error('[NUSAWORK EXTERNAL TRAINING SYNC] Update failed:', employeeId, idGroup, response.status, data);
            return { success: false, error: data?.message || `Nusawork API returned ${response.status}` };
        }
        console.log('[NUSAWORK EXTERNAL TRAINING SYNC] Updated note:', employeeId, idGroup, title);
        return { success: true };
    } catch (err) {
        console.error('[NUSAWORK EXTERNAL TRAINING SYNC] Update error:', employeeId, idGroup, err.message);
        return { success: false, error: err.message };
    }
};

// Re-reads one external_training_requests row and, if it's Processed (HR's paid/finalized state),
// pushes a new Nusawork note or updates the existing one - covers hr-process (first processing),
// hr-update-details (title/date/hours corrections), the settlement PUT (cost corrections), and the
// manual "Sync Nusawork" button (POST /api/external-training/:id/sync-nusawork) for rows that were
// never synced automatically (e.g. bulk-imported historical data). Mirrors computeLearningStats' own
// hours/cost formula so the note matches what the Learning Report shows. Returns { success, error }.
const reconcileExternalTrainingNusawork = async (requestId) => {
    try {
        const rows = await query('SELECT * FROM external_training_requests WHERE id = ?', [requestId]);
        const r = rows[0];
        if (!r) return { success: false, error: 'External training request not found.' };
        if (r.status !== 'Processed') return { success: false, error: 'Only Processed (HR-approved) requests can be synced to Nusawork.' };

        let hours = 0;
        if (r.learning_hours != null) {
            hours = Number(r.learning_hours) || 0;
        } else if (r.start_date && r.end_date) {
            const diffMs = new Date(r.end_date).getTime() - new Date(r.start_date).getTime();
            if (diffMs > 0) hours = diffMs / (1000 * 60 * 60);
        }
        hours = Math.round(hours * 100) / 100;

        const cost = Math.round(
            (Number(r.registration_fee) || 0) + (Number(r.travel_flight_cost) || 0) +
            (Number(r.accommodation_cost) || 0) + (Number(r.miscellaneous_cost) || 0)
        );

        const date = r.start_date instanceof Date ? r.start_date.toISOString().slice(0, 10) : String(r.start_date).slice(0, 10);

        if (r.nusawork_id_group) {
            return await updateExternalTrainingNoteInNusawork({ employeeId: r.employee_id, idGroup: r.nusawork_id_group, title: r.title, date, hours, cost });
        }
        return await pushExternalTrainingNoteToNusawork({ employeeId: r.employee_id, requestId: r.id, title: r.title, date, hours, cost });
    } catch (err) {
        console.error('[NUSAWORK EXTERNAL TRAINING SYNC] Reconcile error:', requestId, err.message);
        return { success: false, error: err.message };
    }
};

// Same create/update payload shape as the other Nusawork syncs, category 'Reading Log'.
// Returns { success, error } (instead of the fire-and-forget void the other Nusawork push/update
// helpers use) so reconcileReadingLogNusawork can hand a real pass/fail result back to the
// PUT /api/logs/:id handler, which surfaces it to the admin instead of leaving a sync failure
// visible only in the server log.
const pushReadingLogNoteToNusawork = async ({ employeeId, logId, title, date, hours, cost }) => {
    if (!employeeId) return { success: false, error: 'No employee_id resolved for this reading log.' };
    try {
        const baseUrl = process.env.NUSAWORK_BASE_URL || 'https://nusanet.app.nusawork.com';
        const categoryFieldId = process.env.NUSAWORK_NOTE_CATEGORY_ID || '201';
        const response = await nusaworkFetch(`${baseUrl}/emp/api/client/v4/note/web/${categoryFieldId}/employee`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                employee_id: employeeId,
                fields: {
                    category: 'Reading Log',
                    title,
                    date,
                    hours: String(hours),
                    cost: formatNusaworkCost(cost),
                    pre_test: '',
                    post_test: '',
                    feedback: ''
                }
            })
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
            console.error('[NUSAWORK READING LOG SYNC] Failed:', employeeId, title, response.status, data);
            return { success: false, error: data?.message || `Nusawork returned ${response.status}` };
        }
        console.log('[NUSAWORK READING LOG SYNC] Pushed note:', employeeId, title);
        const idGroup = data?.data?.id_group;
        if (idGroup && logId) {
            try {
                await query('UPDATE reading_logs SET nusawork_id_group = ? WHERE id = ?', [idGroup, logId]);
            } catch (dbErr) {
                console.error('[NUSAWORK READING LOG SYNC] Failed to save id_group:', dbErr.message);
            }
        }
        return { success: true };
    } catch (err) {
        console.error('[NUSAWORK READING LOG SYNC] Error:', employeeId, title, err.message);
        return { success: false, error: err.message };
    }
};

const updateReadingLogNoteInNusawork = async ({ employeeId, idGroup, title, date, hours, cost }) => {
    if (!employeeId || !idGroup) return { success: false, error: 'Missing employee_id or Nusawork id_group.' };
    try {
        const baseUrl = process.env.NUSAWORK_BASE_URL || 'https://nusanet.app.nusawork.com';
        const categoryFieldId = process.env.NUSAWORK_NOTE_CATEGORY_ID || '201';
        const response = await nusaworkFetch(`${baseUrl}/emp/api/client/v4/note/web/${categoryFieldId}/employee`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                employee_id: employeeId,
                id_group: idGroup,
                fields: {
                    category: 'Reading Log',
                    title,
                    date,
                    hours: String(hours),
                    cost: formatNusaworkCost(cost),
                    pre_test: '',
                    post_test: '',
                    feedback: ''
                }
            })
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
            console.error('[NUSAWORK READING LOG SYNC] Update failed:', employeeId, idGroup, response.status, data);
            return { success: false, error: data?.message || `Nusawork returned ${response.status}` };
        }
        console.log('[NUSAWORK READING LOG SYNC] Updated note:', employeeId, idGroup, title);
        return { success: true };
    } catch (err) {
        console.error('[NUSAWORK READING LOG SYNC] Update error:', employeeId, idGroup, err.message);
        return { success: false, error: err.message };
    }
};

// SIMAS sends its own subCategory taxonomy, which has drifted over time (English names, "&" vs "dan",
// missing "Buku " prefix, typos) and doesn't line up with LMS's official reading_logs category list.
// Storing it raw is what caused the "90 hours instead of 15" bug fixed manually in
// migrate_reading_log_categories.js - getReadingLogHours() below only recognizes the exact official
// strings, so anything else silently fell through to the cost-based fallback formula.
// This only covers straight renames/typos seen in production; genre judgment calls (e.g. a bare
// "Buku" or "Buku Pribadi" source label) aren't guessable from the string alone and are left to fall
// through to 'Buku Lainnya' with a warning, same as any other unrecognized value.
const READING_LOG_CATEGORIES = [
    'Buku Fiksi/Novel', 'Majalah', 'Komik Bisnis/Non Fiksi', 'Buku Biografi dan Sejarah',
    'Buku Bisnis dan Manajemen', 'Buku Paling Diminati', 'Buku Pengembangan Diri',
    'Buku Religi dan Hubungan', 'Buku Sales dan Marketing', 'Buku Teknologi', 'Buku Terlaris',
    'Buku Wajib Baca', 'Buku Lainnya'
];
const READING_LOG_CATEGORY_ALIASES = {
    'biography': 'Buku Biografi dan Sejarah',
    'buku biografi & sejarah': 'Buku Biografi dan Sejarah',
    'buku sales & marketing': 'Buku Sales dan Marketing',
    'business & economy': 'Buku Bisnis dan Manajemen',
    'self development': 'Buku Pengembangan Diri',
    'others': 'Buku Lainnya',
    'buku lainya': 'Buku Lainnya',
    'lainnya': 'Buku Lainnya',
    'komik self-help/non fiksi': 'Komik Bisnis/Non Fiksi'
};
const normalizeReadingLogCategory = (rawCategory, { source } = {}) => {
    const trimmed = (rawCategory || '').trim();
    if (!trimmed) return 'Buku Lainnya';

    const officialMatch = READING_LOG_CATEGORIES.find(c => c.toLowerCase() === trimmed.toLowerCase());
    if (officialMatch) return officialMatch;

    const alias = READING_LOG_CATEGORY_ALIASES[trimmed.toLowerCase()];
    if (alias) return alias;

    console.warn(`[READING LOG] Unrecognized category "${rawCategory}"${source ? ` from ${source}` : ''} - falling back to "Buku Lainnya". Add a mapping to READING_LOG_CATEGORY_ALIASES if this is a known rename.`);
    return 'Buku Lainnya';
};

// Mirrors the category -> hours lookup inside computeLearningStats' "Baca Buku" block, so the note
// matches what the Learning Report shows for this book. Kept as a separate copy rather than a shared
// helper to avoid touching the already-working report logic.
const getReadingLogHours = (category, incentiveAmount) => {
    if (category === 'Buku Fiksi/Novel' || category === 'Majalah' || category === 'Buku Lainnya') return 0;
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
};

// Re-reads one reading_logs row and reconciles its Nusawork note against `status` (not
// hr_approval_status - the note represents "this book was read", not "the incentive was approved"):
//   -> Finished:    create (first time) or update (already synced) the note. Cost is whatever
//                    incentive_amount holds right now - 0 at first, updated later once HR approves
//                    a claim and a subsequent save re-reconciles.
//   Finished -> other (Cancelled): delete the note that was created for it
// Returns { success, error, skipped } so callers that await it (the PUT /api/logs/:id handler) can
// surface a sync failure to the admin instead of it only ever showing up in the server log.
const reconcileReadingLogNusawork = async (logId) => {
    try {
        const rows = await query('SELECT * FROM reading_logs WHERE id = ?', [logId]);
        const r = rows[0];
        if (!r) return { success: false, error: 'Reading log not found.' };

        if (r.status !== 'Finished') {
            if (r.nusawork_id_group) {
                deleteNusaworkNote({ employeeId: r.employee_id, idGroup: r.nusawork_id_group });
                await query('UPDATE reading_logs SET nusawork_id_group = NULL WHERE id = ?', [logId]);
            }
            return { success: true, skipped: true };
        }

        const hours = getReadingLogHours(r.category, r.incentive_amount);
        const cost = Math.round(Number(r.incentive_amount) || 0);
        const dateSource = r.finish_date || r.date;
        const date = dateSource instanceof Date ? dateSource.toISOString().slice(0, 10) : String(dateSource).slice(0, 10);

        if (r.nusawork_id_group) {
            return await updateReadingLogNoteInNusawork({ employeeId: r.employee_id, idGroup: r.nusawork_id_group, title: r.title, date, hours, cost });
        } else {
            return await pushReadingLogNoteToNusawork({ employeeId: r.employee_id, logId: r.id, title: r.title, date, hours, cost });
        }
    } catch (err) {
        console.error('[NUSAWORK READING LOG SYNC] Reconcile error:', logId, err.message);
        return { success: false, error: err.message };
    }
};

const ensureEmployeeColumnsExist = async (employeeData) => {
    try {
        const dbName = process.env.DB_NAME || 'lms';
        const [cols] = await pool.query(
            'SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?',
            [dbName, 'employees']
        );
        const existingColumns = new Set(cols.map(c => c.COLUMN_NAME.toLowerCase()));

        for (const key of Object.keys(employeeData)) {
            const sanitizedKey = key.replace(/[^a-zA-Z0-9_]/g, '');
            if (!sanitizedKey) continue;

            const lowerKey = sanitizedKey.toLowerCase();
            if (lowerKey === 'employee_id') {
                continue;
            }

            // Skip object/array properties to keep DB clean, only store primitives
            if (employeeData[key] !== null && typeof employeeData[key] === 'object') {
                continue;
            }

            if (!existingColumns.has(lowerKey)) {
                console.log(`[DB MIGRATION] Column '${sanitizedKey}' is missing in 'employees' table. Creating it dynamically...`);
                let type = 'VARCHAR(255)';
                if (employeeData[key] && String(employeeData[key]).length > 255) {
                    type = 'TEXT';
                }

                await pool.query(`ALTER TABLE employees ADD COLUMN \`${sanitizedKey}\` ${type} NULL`);
                console.log(`[DB MIGRATION] Column '${sanitizedKey}' created successfully.`);
            }
        }
    } catch (err) {
        console.error('[DB MIGRATION] Failed to dynamically ensure columns exist:', err.message);
    }
};

const determineInitialRole = (employee) => {
    if (!employee) return 'STAFF';

    const level = (employee.job_level || '').toLowerCase();
    const position = (employee.job_position || '').toUpperCase();

    if (level === 'staff') {
        return 'STAFF';
    }

    if (position.includes('HR') && !position.includes('HRIS')) {
        return 'HR';
    }

    return 'STAFF';
};

const checkIsSupervisor = async (user) => {
    if (!user) return false;

    if (user.employee_id || user.name || user.email) {
        try {
            const subCount = await querySimAsset(
                `SELECT COUNT(*) as count FROM employees
                 WHERE (id_report_to = ?
                    OR id_report_to = ?
                    OR id_report_to LIKE ?
                    OR id_report_to = ?)
                    AND (active_status IS NULL OR active_status != 'Resign')`,
                [
                    user.employee_id || '___INVALID___',
                    user.name || '___INVALID___',
                    `%${user.email ? user.email.split('@')[0] : '___INVALID___'}%`,
                    user.email || '___INVALID___'
                ]
            );
            if (subCount[0] && subCount[0].count > 0) {
                return true;
            }
        } catch (e) {
            console.error('[DB] Failed to check supervisor status:', e.message);
        }
    }
    return false;
};

const findLocalUserByEmailOrId = async (email, employeeId) => {
    let users = [];
    if (employeeId) {
        users = await query('SELECT * FROM users WHERE employee_id = ?', [employeeId]);
        if (users.length > 0) return users[0];
    }
    if (email) {
        users = await query('SELECT * FROM users WHERE email = ?', [email]);
        if (users.length > 0) return users[0];
    }
    if (email && email.includes('@')) {
        const [username, domain] = email.toLowerCase().split('@');
        const allowedDomains = ['nusa.net.id', 'nusa.id', 'nusawork.com'];
        if (allowedDomains.includes(domain)) {
            const potentialUsers = await query('SELECT * FROM users WHERE email LIKE ?', [`${username}@%`]);
            for (const u of potentialUsers) {
                const uDomain = u.email.split('@')[1];
                if (uDomain && allowedDomains.includes(uDomain.toLowerCase())) {
                    return u;
                }
            }
        }
    }
    return null;
};

const findLocalEmployeeByEmailOrId = async (email, employeeId) => {
    let employees = [];
    if (employeeId) {
        employees = await querySimAsset('SELECT * FROM employees WHERE id_employee = ?', [employeeId]);
        if (employees.length > 0) return employees[0];
    }
    if (email) {
        employees = await querySimAsset('SELECT * FROM employees WHERE email = ?', [email]);
        if (employees.length > 0) return employees[0];
    }
    if (email && email.includes('@')) {
        const [username, domain] = email.toLowerCase().split('@');
        const allowedDomains = ['nusa.net.id', 'nusa.id', 'nusawork.com'];
        if (allowedDomains.includes(domain)) {
            const potentialEmps = await querySimAsset('SELECT * FROM employees WHERE email LIKE ?', [`${username}@%`]);
            for (const e of potentialEmps) {
                const eDomain = e.email.split('@')[1];
                if (eDomain && allowedDomains.includes(eDomain.toLowerCase())) {
                    return e;
                }
            }
        }
    }
    return null;
};

// Only 'Active', 'Resign' and NULL show up in employees.active_status (see the employee sync) - NULL
// is treated as "not known to be resigned" rather than blocked, matching every other endpoint that
// filters on this column (e.g. the team-member/directory queries: "active_status IS NULL OR != 'Resign'").
const isResignedStatus = (activeStatus) => typeof activeStatus === 'string' && activeStatus.toLowerCase() === 'resign';

// Login-time resign check, given a full employee row (not just active_status). A blank status_join
// ('', distinct from NULL/unset) shows up only on stale/orphaned records - every one of them today is
// either already active_status = 'Resign' or has no active_status at all - so it's treated as resigned
// for login purposes even when active_status alone wouldn't have caught it.
const isResignedForLogin = (employee) => {
    if (!employee) return false;
    if (isResignedStatus(employee.active_status)) return true;
    if (employee.status_join === '') return true;
    return false;
};

// Interns don't get an IDP or a competency assessment - same "no participation at all" rule already
// applied to /api/employees/directory and /api/team-members (both filter status_join = 'Internship').
const isInternStatus = (statusJoin) => typeof statusJoin === 'string' && statusJoin.toLowerCase() === 'internship';

// Looks up one employee's status_join directly by id - used to gate IDP/competency writes where we
// only have the employee_id from the request body, not a full employee row already in hand.
const isInternEmployeeId = async (employeeId) => {
    if (!employeeId) return false;
    const rows = await querySimAsset('SELECT status_join FROM employees WHERE id_employee = ?', [employeeId]);
    return rows.length > 0 && isInternStatus(rows[0].status_join);
};

// cc_employee_ids is stored as a JSON array string (or NULL); every read path needs it back as a
// real array for the frontend's CC chip list to render.
const parseExternalTrainingRow = (row) => {
    let ccEmployeeIds = [];
    try { ccEmployeeIds = row.cc_employee_ids ? JSON.parse(row.cc_employee_ids) : []; } catch (e) { ccEmployeeIds = []; }
    return { ...row, cc_employee_ids: ccEmployeeIds };
};

// Resolves the report-to (supervisor) employee row for a given employee_id.
// id_report_to_value holds the supervisor's user_id; id_report_to holds their name
// as a fallback for records where the value link wasn't populated.
const findReportToEmployee = async (employeeId) => {
    if (!employeeId) return null;
    const rows = await querySimAsset('SELECT id_report_to, id_report_to_value FROM employees WHERE id_employee = ?', [employeeId]);
    if (rows.length === 0) return null;
    const { id_report_to, id_report_to_value } = rows[0];
    if (!id_report_to && !id_report_to_value) return null;

    const leaderRows = await querySimAsset(
        `SELECT * FROM employees WHERE user_id = ? OR full_name = ? OR nickname = ? LIMIT 1`,
        [
            id_report_to_value || '___INVALID___',
            id_report_to || '___INVALID___',
            id_report_to || '___INVALID___'
        ]
    );
    return leaderRows[0] || null;
};

// Inverse of findReportToEmployee: given a leader's employee_id, returns every subordinate's
// id_employee. Same id_report_to/id_report_to_value matching originally written for
// GET /api/external-training/subordinates - shared here so Post Training Evaluation's "pending
// for my team" queue doesn't fork that matching logic.
const findSubordinateEmployeeIds = async (leaderId) => {
    if (!leaderId) return [];
    const leaderInfo = await querySimAsset('SELECT user_id, full_name, nickname FROM employees WHERE id_employee = ?', [leaderId]);
    if (leaderInfo.length === 0) return [];
    const leader = leaderInfo[0];
    const leaderUserId = leader.user_id;
    const leaderFullName = leader.full_name;
    const leaderNickName = leader.nickname || leaderFullName;

    const subordinatesResult = await querySimAsset(`
        SELECT id_employee FROM employees
        WHERE id_report_to_value = ?
           OR id_report_to = ?
           OR id_report_to = ?
           OR id_report_to LIKE ?
           OR id_report_to LIKE ?
    `, [leaderUserId, leaderFullName, leaderNickName, `${leaderFullName},%`, `%,${leaderFullName},%`]);

    return subordinatesResult.map(s => s.id_employee);
};

// Narrows a subordinate id list down to employees who haven't resigned - a leader-facing "needs
// your approval/evaluation" queue must never keep asking about someone who's already left, even if
// SimAsset's org chart hasn't been repointed yet. Same guard /api/team-members already applies.
const filterActiveEmployeeIds = async (employeeIds) => {
    if (employeeIds.length === 0) return [];
    const placeholders = employeeIds.map(() => '?').join(',');
    const rows = await querySimAsset(
        `SELECT id_employee FROM employees WHERE id_employee IN (${placeholders}) AND (active_status IS NULL OR active_status != 'Resign')`,
        employeeIds
    );
    return rows.map(r => r.id_employee);
};

// The set of every employee_id/full_name that appears as someone else's id_report_to -
// membership means "this person has at least one direct report". Shared by /api/team-members and
// /api/employees/directory so both compute isSupervisor the same way.
const getSupervisorIdentifierSet = async () => {
    const leaderRows = await querySimAsset(
        `SELECT DISTINCT id_report_to FROM employees WHERE id_report_to IS NOT NULL`
    );
    return new Set(leaderRows.map(r => r.id_report_to));
};

// Resolves the definitive ATTENDED employee_id list for a meeting row - used only by Post
// Training Evaluation, where a no-show must never be counted as someone to evaluate. Once the
// cost report is finalized, its attendee_ids/attendees are the ground truth for who actually
// showed up (guests_json is only who was invited); guests_json is used as a fallback ONLY when no
// cost report exists yet at all, so a session still awaiting its report doesn't resolve to nobody.
const getMeetingAttendeeEmployeeIds = async (meeting) => {
    let guests = null;
    let costReport = null;
    try { if (meeting.guests_json) guests = typeof meeting.guests_json === 'string' ? JSON.parse(meeting.guests_json) : meeting.guests_json; } catch (e) { }
    try { if (meeting.cost_report_json) costReport = typeof meeting.cost_report_json === 'string' ? JSON.parse(meeting.cost_report_json) : meeting.cost_report_json; } catch (e) { }

    // A cost report can exist (trainer/snack/lunch costs, photos) before the Host has actually
    // reached the "check off who attended" step in Finalize Report, so its presence alone doesn't
    // mean attendee_ids/attendees is ground truth yet - only trust it once it's actually recorded
    // someone, otherwise fall back to guests_json like the "no cost report yet" case below.
    const hasRecordedAttendance = !!costReport && (
        (costReport.attendee_ids && costReport.attendee_ids.length > 0) ||
        (costReport.attendees && costReport.attendees.length > 0)
    );
    const employeeIds = new Set(hasRecordedAttendance ? (costReport.attendee_ids || []) : (guests?.employee_ids || []));
    const emails = hasRecordedAttendance ? (costReport.attendees || []) : (guests?.emails || []);
    if (emails.length > 0) {
        const placeholders = emails.map(() => '?').join(',');
        const rows = await query(`SELECT employee_id FROM users WHERE email IN (${placeholders}) AND employee_id IS NOT NULL`, emails);
        rows.forEach(r => employeeIds.add(r.employee_id));
    }

    return [...employeeIds];
};

// A PTE form template can be reused across multiple meetings via meetings.pte_form_id (the
// "PTE Form" picker in the Internal Training modal), but the form itself only remembers the ONE
// meeting_id it was first created for. Any endpoint that needs "who is this form's audience" must
// union every meeting that points to the form either way - otherwise a reused template silently
// drops the attendees of every meeting except the one it was originally built for.
// Keeps meetings.closed_at in step with is_closed: stamped the first time a session is closed,
// cleared if it's reopened (so closing it again restarts the leader's 30-day PTE window).
const syncMeetingClosedAt = (meetingId) => query(
    'UPDATE meetings SET closed_at = IF(is_closed = 1, COALESCE(closed_at, NOW()), NULL) WHERE id = ?',
    [meetingId]
);

const getFormMeetings = async (form) => {
    const meetings = [];
    const seenIds = new Set();
    if (form.meeting_id) {
        meetings.push({
            id: form.meeting_id,
            title: form.meeting_title,
            date: form.meeting_date,
            is_closed: form.meeting_is_closed,
            guests_json: form.guests_json,
            cost_report_json: form.cost_report_json
        });
        seenIds.add(form.meeting_id);
    }
    const reusedMeetings = await query(
        'SELECT id, title, date, is_closed, guests_json, cost_report_json FROM meetings WHERE pte_form_id = ? AND deleted_at IS NULL',
        [form.id]
    );
    reusedMeetings.forEach(m => {
        if (!seenIds.has(m.id)) {
            meetings.push(m);
            seenIds.add(m.id);
        }
    });
    return meetings;
};

// External Training's equivalent of getFormMeetings above - a form template can be reused across
// many requests via external_training_requests.pte_form_id. Unlike a meeting, a request has no
// guest list to resolve: its "attendee" is always just its own employee_id.
const getFormExternalTrainingRequests = async (form) => {
    return await query(
        'SELECT * FROM external_training_requests WHERE pte_form_id = ? AND deleted_at IS NULL',
        [form.id]
    );
};

// One-time startup backfill: post_training_evaluation_responses gained a meeting_id column so a
// reused template no longer collapses one person's evaluations across different meetings into a
// single row (db.js migration above). Existing rows predate that column, so resolve each one's
// meeting by checking which of the form's meetings the evaluatee actually attended. Safe to run
// on every restart - it only ever touches rows with neither context set. External Training
// responses legitimately have a NULL meeting_id and must be left alone.
const backfillPteResponseMeetingIds = async () => {
    try {
        // Repair rows an earlier version of this backfill corrupted: it treated External Training
        // responses as orphans and stamped a meeting_id onto them, so they carried both contexts
        // and matched neither lookup (the evaluation looked unsubmitted to leader and staff alike).
        const repaired = await query('UPDATE post_training_evaluation_responses SET meeting_id = NULL WHERE meeting_id IS NOT NULL AND external_training_request_id IS NOT NULL');
        if (repaired.affectedRows > 0) console.log(`[PTE] Cleared stray meeting_id on ${repaired.affectedRows} External Training response(s).`);

        const orphanRows = await query('SELECT id, form_id, evaluatee_employee_id FROM post_training_evaluation_responses WHERE meeting_id IS NULL AND external_training_request_id IS NULL');
        if (orphanRows.length === 0) return;

        const formIds = [...new Set(orphanRows.map(r => r.form_id))];
        const placeholders = formIds.map(() => '?').join(',');
        const forms = await query(`
            SELECT f.id, f.meeting_id, m.title AS meeting_title, m.date AS meeting_date, m.guests_json, m.cost_report_json
            FROM post_training_evaluation_forms f
            LEFT JOIN meetings m ON f.meeting_id = m.id
            WHERE f.id IN (${placeholders})
        `, formIds);

        let resolvedCount = 0;
        for (const row of orphanRows) {
            const form = forms.find(f => f.id === row.form_id);
            if (!form) continue;

            const meetings = await getFormMeetings(form);
            let resolvedMeetingId = null;
            for (const meeting of meetings) {
                const attendeeIds = await getMeetingAttendeeEmployeeIds(meeting);
                if (attendeeIds.includes(row.evaluatee_employee_id)) { resolvedMeetingId = meeting.id; break; }
            }
            // Attendance couldn't pin it down (e.g. attendee data changed since submission) - fall
            // back to the form's original meeting rather than leaving it permanently unresolved.
            if (!resolvedMeetingId) resolvedMeetingId = form.meeting_id || (meetings[0] && meetings[0].id) || null;
            if (resolvedMeetingId) {
                await query('UPDATE post_training_evaluation_responses SET meeting_id = ? WHERE id = ?', [resolvedMeetingId, row.id]);
                resolvedCount++;
            }
        }
        console.log(`[PTE] Backfilled meeting_id for ${resolvedCount}/${orphanRows.length} historical response(s).`);
    } catch (e) {
        console.error('[PTE] Failed to backfill response meeting_id:', e.message);
    }
};

// Best-effort match of a free-text name (as typed in an imported spreadsheet, often shortened -
// e.g. "Indah R") against a real employee's full name. Returns the canonical full_name only when
// exactly one employee matches; returns null (caller falls back to the raw text) when there's no
// match or the match is ambiguous, so a shortened name is never silently attributed to the wrong person.
const matchEmployeeFullName = async (rawName) => {
    if (!rawName || !rawName.trim()) return null;
    const trimmed = rawName.trim();
    const exact = await querySimAsset('SELECT full_name FROM employees WHERE full_name = ? LIMIT 2', [trimmed]);
    if (exact.length === 1) return exact[0].full_name;
    if (exact.length > 1) return null;
    const partial = await querySimAsset('SELECT full_name FROM employees WHERE full_name LIKE ? LIMIT 2', [`%${trimmed}%`]);
    return partial.length === 1 ? partial[0].full_name : null;
};

// Nusawork's employee filter API restricts results to employees active within
// this window (e.g. excludes past employees who already resigned). Fixed start
// at 2026-01-01, end always follows today so resigned employees stay findable.
const getNusaworkFilterPeriods = () => {
    const today = new Date(Date.now() + 7 * 60 * 60 * 1000).toISOString().split('T')[0];
    return ['2026-01-01', today];
};

const syncEmployeeFromNusawork = async (identifier, token) => {
    if (!token) {
        console.warn(`[NUSANET SYNC] Cannot sync ${identifier}: No access token available.`);
        return null;
    }

    const baseUrl = process.env.NUSANET_BASE_URL || 'https://nusanet.app.nusawork.com';
    const filterUrl = `${baseUrl}/emp/api/v4.2/client/employee/filter?page=1`;

    try {
        console.log(`[NUSANET SYNC] Querying filter API for email/ID: ${identifier}`);
        const response = await fetch(filterUrl, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            },
            body: JSON.stringify({
                fields: {
                    active_status: ["active", "Resign"]
                },
                page_count: 999999,
                paginate: true,
                search: identifier,
                periods: getNusaworkFilterPeriods()
            })
        });

        if (!response.ok) {
            console.error(`[NUSANET SYNC] Nusawork API returned status ${response.status}: ${response.statusText}`);
            return null;
        }

        const result = await response.json();

        const extractEmpList = (resObj) => {
            if (resObj && resObj.data) {
                if (Array.isArray(resObj.data.list)) return resObj.data.list;
                if (Array.isArray(resObj.data)) return resObj.data;
                if (resObj.data.data && Array.isArray(resObj.data.data)) return resObj.data.data;
            } else if (Array.isArray(resObj)) {
                return resObj;
            }
            return [];
        };

        let empList = extractEmpList(result);

        // Self-healing fallback search queries for email/domain transitions
        if (empList.length === 0 && identifier && identifier.includes('@')) {
            const [username, domain] = identifier.toLowerCase().split('@');
            const alternatives = [];
            if (domain === 'nusa.net.id') {
                alternatives.push(`${username}@nusa.id`);
            } else if (domain === 'nusa.id') {
                alternatives.push(`${username}@nusa.net.id`);
            }
            alternatives.push(username);

            for (const altQuery of alternatives) {
                console.log(`[NUSANET SYNC] No results for ${identifier}. Trying alternative search: ${altQuery}`);
                try {
                    const altRes = await fetch(filterUrl, {
                        method: 'POST',
                        headers: {
                            'Authorization': `Bearer ${token}`,
                            'Content-Type': 'application/json',
                            'Accept': 'application/json'
                        },
                        body: JSON.stringify({
                            fields: { active_status: ["active", "Resign"] },
                            page_count: 999999,
                            paginate: true,
                            search: altQuery,
                            periods: getNusaworkFilterPeriods()
                        })
                    });
                    if (altRes.ok) {
                        const altResult = await altRes.json();
                        const altList = extractEmpList(altResult);
                        if (altList.length > 0) {
                            console.log(`[NUSANET SYNC] Found ${altList.length} potential matches for alternative search: ${altQuery}`);
                            empList = altList;
                            break;
                        }
                    }
                } catch (e) {
                    console.warn(`[NUSANET SYNC] Alternative search ${altQuery} failed:`, e.message);
                }
            }
        }

        // Find the matching employee by email, ID or username prefix
        let employee = null;
        if (empList.length > 0) {
            employee = empList.find(e =>
                (e.email && e.email.toLowerCase() === identifier.toLowerCase()) ||
                (e.id_employee && e.id_employee.toLowerCase() === identifier.toLowerCase()) ||
                (e.employee_id && e.employee_id.toLowerCase() === identifier.toLowerCase())
            );

            if (!employee && identifier.includes('@')) {
                const targetUser = identifier.toLowerCase().split('@')[0];
                employee = empList.find(e => {
                    if (e.email) {
                        const empUser = e.email.toLowerCase().split('@')[0];
                        return empUser === targetUser;
                    }
                    return false;
                });
            }

            if (!employee) {
                employee = empList[0];
            }
        }

        if (!employee) {
            console.warn(`[NUSANET SYNC] No employee found matching: ${identifier}`);
            return null;
        }

        console.log(`[NUSANET SYNC] Match found: ${employee.full_name || employee.name} (${employee.id_employee || employee.employee_id})`);

        const fullName = employee.full_name || employee.name || identifier.split('@')[0].replace('.', ' ');
        const employeeId = employee.id_employee || employee.employee_id || null;
        // Must prefer the actual branch fields over organization_name — organization_name is the
        // department (e.g. "Technical"), which never matches a row in `branches`, so putting it first
        // silently defaulted branch_id to HQ ('020') for every employee whose department name didn't
        // coincidentally collide with a branch name.
        const branchName = employee.branch_name || (employee.branch ? employee.branch.name : null) || employee.organization_name || 'Headquarters';
        const photoProfile = employee.photo_profile || employee.photo || `https://ui-avatars.com/api/?name=${fullName}&background=random`;
        const email = employee.email || identifier;

        // Resolve branch_id from branchName
        let branchId = '020'; // Default to HQ
        try {
            const branches = await querySimAsset('SELECT id_branch FROM branches WHERE name LIKE ?', [`%${branchName}%`]);
            if (branches.length > 0) {
                branchId = branches[0].id_branch;
            }
        } catch (e) {
            console.warn(`[NUSANET SYNC] Failed to query branch matching ${branchName}:`, e.message);
        }

        // Gather all primitive values from the Nusawork response dynamically
        const dbFields = {};
        for (const [key, value] of Object.entries(employee)) {
            if (value !== null && typeof value === 'object') {
                continue;
            }
            const sanitizedKey = key.replace(/[^a-zA-Z0-9_]/g, '');
            if (sanitizedKey && sanitizedKey.toLowerCase() !== 'employee_id') {
                dbFields[sanitizedKey] = value !== undefined ? value : null;
            }
        }

        // Ensure key LMS columns are present/normalized
        dbFields.full_name = fullName;
        dbFields.email = email;
        dbFields.id_employee = employeeId;
        dbFields.branch_id = branchId;
        dbFields.photo_profile = photoProfile;

        if (!dbFields.job_position) dbFields.job_position = 'Staff';
        if (!dbFields.job_level) dbFields.job_level = 'Staff';
        if (!dbFields.organization_name) dbFields.organization_name = branchName;
        if (!dbFields.status_join) dbFields.status_join = 'Permanent';

        // Check and dynamically add columns for any new/missing fields in employees table
        await ensureEmployeeColumnsExist(dbFields);

        // 1. Sync to employees table in SimAsset/LMS DB dynamically
        if (employeeId) {
            const existingEmp = await findLocalEmployeeByEmailOrId(email, employeeId);
            const cols = Object.keys(dbFields);
            const vals = Object.values(dbFields);

            if (!existingEmp) {
                console.log(`[NUSANET SYNC] Dynamically inserting employee record for ${fullName}`);
                const placeholders = cols.map(() => '?').join(', ');
                await querySimAsset(
                    `INSERT INTO employees (${cols.map(c => `\`${c}\``).join(', ')}) VALUES (${placeholders})`,
                    vals
                );
            } else {
                console.log(`[NUSANET SYNC] Dynamically updating employee record for ${fullName}`);
                const fields = cols.map(c => `\`${c}\` = ?`).join(', ');
                const empIdToUpdate = existingEmp.id_employee || employeeId;
                await querySimAsset(`UPDATE employees SET ${fields} WHERE id_employee = ?`, [...vals, empIdToUpdate]);
            }
        }

        // 2. Sync to local users table
        const localUser = await findLocalUserByEmailOrId(email, employeeId);
        if (localUser) {
            const isActive = (employee.active_status && employee.active_status.toLowerCase() === 'active') ? 1 : 0;
            if (localUser.email !== email) {
                console.log(`[NUSANET SYNC] Email change detected for employee ${employeeId}. Updating local user email from ${localUser.email} to ${email}`);
                await query(
                    'UPDATE users SET email = ?, name = ?, branch = ?, employee_id = ?, avatar = ?, is_active = ? WHERE id = ?',
                    [email, fullName, branchName, employeeId, photoProfile, isActive, localUser.id]
                );
            } else {
                await query(
                    'UPDATE users SET name = ?, branch = ?, employee_id = ?, avatar = ?, is_active = ? WHERE id = ?',
                    [fullName, branchName, employeeId, photoProfile, isActive, localUser.id]
                );
            }
            console.log(`[NUSANET SYNC] Local users table updated for ${email}. Role/Access preserved as ${localUser.role}.`);
        }

        return dbFields;
    } catch (err) {
        console.error(`[NUSANET SYNC] Exception during sync for ${identifier}:`, err);
        return null;
    }
};

// --- AUTH ROUTES ---
app.post('/api/login', async (req, res) => {
    try {
        const { identifier, password, email } = req.body;

        // 1. Trim whitespace to avoid copy-paste errors
        const loginId = (identifier || email || '').trim();
        const cleanPassword = (password || '').trim();

        console.log(`[LOGIN ATTEMPT] Value: '${loginId}'`);

        // No domain whitelist here (unlike /api/auth/google) - whether this identifier is allowed in
        // is decided below by whether it matches a local account or a real Nusawork-linked employee,
        // not by its email domain. A hardcoded @nusa.id/@nusawork.com check would otherwise lock out
        // real accounts on other domains (legacy @nusa.net.id, @gmail.com, vendor domains, etc.).

        // 2. First try: Local database check using our helper (handles email domain transitions)
        let user = await findLocalUserByEmailOrId(loginId, null);

        // Fallback for custom / demo accounts without proper email formats if not found by helper
        if (!user) {
            const localUsers = await query(
                'SELECT * FROM users WHERE email = ? OR employee_id = ?',
                [loginId, loginId]
            );
            if (localUsers.length > 0) {
                user = localUsers[0];
            }
        }

        // Accounts without a usable local password (UNUSABLE_PASSWORD) fall through to Nusawork below.
        if (user && await verifyPassword(cleanPassword, user.password)) {
            console.log(`[LOGIN SUCCESS] Local user found for ${loginId}`);

            // Sync/update user details from Nusawork in background
            try {
                let token = await getNusanetToken(user.email, cleanPassword);
                if (!token) {
                    console.log(`[LOGIN SYNC] Password token grant failed for ${user.email}. Trying client-level token...`);
                    token = await getNusanetToken();
                }
                if (token) {
                    await syncEmployeeFromNusawork(user.employee_id || user.email, token);
                }
            } catch (syncErr) {
                console.error("[LOGIN SYNC] Failed to sync user details:", syncErr.message);
            }

            // Reload user info to return updated values
            const updatedUsers = await query('SELECT * FROM users WHERE id = ?', [user.id]);
            const finalUser = updatedUsers[0] || user;

            // Block resigned employees - checked post-sync so a status change in Nusawork takes
            // effect on their very next login attempt, not only after some later background sync.
            const finalEmployee = await findLocalEmployeeByEmailOrId(finalUser.email, finalUser.employee_id);
            if (isResignedForLogin(finalEmployee)) {
                console.log(`[LOGIN BLOCKED] ${loginId} is marked Resign in employees.`);
                return res.status(403).json({ success: false, message: 'This account is no longer active (resigned). Please contact HR if this is a mistake.' });
            }

            const isSupervisor = await checkIsSupervisor(finalUser);

            return res.json({
                success: true,
                token: issueAuthToken(finalUser.id),
                user: {
                    id: finalUser.id,
                    name: finalUser.name,
                    role: finalUser.role,
                    email: finalUser.email,
                    branch: finalUser.branch,
                    employee_id: finalUser.employee_id,
                    avatar: finalUser.avatar,
                    isSupervisor,
                    isIntern: isInternStatus(finalEmployee?.status_join)
                }
            });
        }

        // 3. Second try: Nusanet OAuth API (for those not yet in LMS or using Nusanet account)
        const baseUrl = process.env.NUSANET_BASE_URL || 'https://nusanet.app.nusawork.com';
        const authUrl = process.env.NUSANET_AUTH_URL || `${baseUrl}/auth/api/oauth/token`;
        const clientId = process.env.NUSANET_CLIENT_ID || '4';
        const clientSecret = process.env.NUSANET_CLIENT_SECRET || 'hltSSRhqOAqfA6VRsQIpa9Xfw9m3Ro8LXuTh4Omn';

        try {
            console.log(`[NUSANET AUTH] Attempting for ${loginId}`);
            const authResponse = await fetch(authUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                    'Accept': 'application/json',
                    'Authorization': 'Basic ' + Buffer.from(`${clientId}:${clientSecret}`).toString('base64')
                },
                body: new URLSearchParams({
                    grant_type: 'password',
                    client_id: clientId,
                    client_secret: clientSecret,
                    username: loginId,
                    password: cleanPassword
                })
            });

            const authData = await authResponse.json();

            if (authResponse.ok && authData.access_token) {
                console.log(`[NUSANET AUTH] Success for ${loginId}`);
                const accessToken = authData.access_token;

                // Cache the token globally
                saveCachedToken(accessToken);

                // Sync and complete details via the new filter API
                await syncEmployeeFromNusawork(loginId, accessToken);

                // Find or Sync local record (it has been created or updated by syncEmployeeFromNusawork)
                const employeeHelper = await findLocalEmployeeByEmailOrId(loginId, null);
                const employeeId = employeeHelper ? employeeHelper.id_employee : null;

                if (isResignedForLogin(employeeHelper)) {
                    console.log(`[LOGIN BLOCKED] ${loginId} is marked Resign in Nusawork.`);
                    return res.status(403).json({ success: false, message: 'This account is no longer active (resigned). Please contact HR if this is a mistake.' });
                }

                let user = await findLocalUserByEmailOrId(loginId, employeeId);

                if (!user) {
                    if (!employeeHelper) {
                        // No matching employee record found in Nusawork/SIMAS -> refuse to create a ghost account
                        console.warn(`[NUSANET AUTH] No employee record found for ${loginId}. Refusing to auto-create local user.`);
                        return res.status(404).json({ success: false, message: 'Account not linked to any employee record. Please contact HR/Admin to verify your corporate email.' });
                    }

                    // Fallback create if somehow syncEmployeeFromNusawork failed to insert
                    console.log(`[NUSANET AUTH] Fallback create local user for ${loginId}`);
                    const id = Date.now().toString();
                    const fullName = employeeHelper.full_name;
                    const avatar = employeeHelper.photo_profile || `https://ui-avatars.com/api/?name=${fullName}&background=random`;
                    const branch = employeeHelper.organization_name || 'Headquarters';
                    const initialRole = determineInitialRole(employeeHelper);

                    await query('INSERT INTO users (id, email, password, name, role, avatar, branch, employee_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
                        [id, loginId, UNUSABLE_PASSWORD, fullName, initialRole, avatar, branch, employeeId]);

                    const newUsers = await query('SELECT * FROM users WHERE email = ?', [loginId]);
                    user = newUsers[0];
                }

                const isSupervisor = await checkIsSupervisor(user);

                return res.json({
                    success: true,
                    token: issueAuthToken(user.id),
                    user: {
                        id: user.id,
                        name: user.name,
                        role: user.role,
                        email: user.email,
                        branch: user.branch,
                        employee_id: user.employee_id,
                        avatar: user.avatar,
                        isSupervisor,
                        isIntern: isInternStatus(employeeHelper?.status_join)
                    }
                });
            } else {
                console.log(`[NUSANET AUTH] Failed: ${authData.message || 'Unknown error'}`);
                return res.status(401).json({ success: false, message: authData.message || 'Invalid credentials' });
            }
        } catch (authErr) {
            console.error(`[NUSANET AUTH] Error:`, authErr);
            return res.status(500).json({ error: 'Authentication service error' });
        }
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Database error' });
    }
});

// Must match the client ID the login page's Google button uses (VITE_GOOGLE_CLIENT_ID, same fallback as src/App.tsx).
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || process.env.VITE_GOOGLE_CLIENT_ID || '735607886412-vgmgsm981577uhg72etjeoh30jjp8trs.apps.googleusercontent.com';

// Verifies a Google Sign-In ID token with Google and returns its verified email, or null. The
// email must come from here, never from the request body - otherwise anyone could claim any address.
const verifyGoogleCredential = async (credential) => {
    if (!credential) return null;
    // Every rejection is logged with its reason - the login page only ever shows a generic error.
    const reject = (reason) => { console.warn(`[GOOGLE AUTH] Credential rejected: ${reason}`); return null; };
    try {
        const response = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(credential)}`);
        if (!response.ok) return reject(`Google tokeninfo answered ${response.status} (invalid or expired token)`);
        const info = await response.json();
        if (info.aud !== GOOGLE_CLIENT_ID) {
            return reject(`client ID mismatch - token is for "${info.aud}", server expects "${GOOGLE_CLIENT_ID}" (GOOGLE_CLIENT_ID / VITE_GOOGLE_CLIENT_ID must match the one the frontend was built with)`);
        }
        if (info.iss !== 'accounts.google.com' && info.iss !== 'https://accounts.google.com') return reject(`unexpected issuer "${info.iss}"`);
        if (info.email_verified !== true && info.email_verified !== 'true') return reject(`email ${info.email} is not verified by Google`);
        if (!(Number(info.exp) * 1000 > Date.now())) return reject(`token expired at ${new Date(Number(info.exp) * 1000).toISOString()} (check the server clock)`);
        return info.email || null;
    } catch (err) {
        return reject(`could not reach Google to verify the token: ${err.cause?.code || err.cause?.message || err.message}`);
    }
};

app.post('/api/auth/google', async (req, res) => {
    try {
        const email = await verifyGoogleCredential(req.body?.credential);
        if (!email) {
            return res.status(401).json({ success: false, message: 'Google sign-in could not be verified. Please try again.' });
        }
        if (!email.endsWith('@nusawork.com') && !email.endsWith('@nusa.id')) {
            return res.status(403).json({ success: false, message: 'Access Restricted: Only @nusa.id or @nusawork.com emails are allowed.' });
        }

        // 1. Try to sync/update user details from Nusawork in background
        try {
            const token = await getNusanetToken();
            if (token) {
                await syncEmployeeFromNusawork(email, token);
            } else {
                console.warn(`[GOOGLE LOGIN SYNC] Skip background sync for ${email}: No access token available. Set NUSANET_ADMIN_EMAIL and NUSANET_ADMIN_PASSWORD in .env for background syncing.`);
            }
        } catch (syncErr) {
            console.error("[GOOGLE LOGIN SYNC] Failed to sync user details:", syncErr.message);
        }

        // 2. Fetch/Create local user record
        const employeeHelper = await findLocalEmployeeByEmailOrId(email, null);
        const employeeId = employeeHelper ? employeeHelper.id_employee : null;

        let user = await findLocalUserByEmailOrId(email, employeeId);

        if (!user) {
            if (!employeeHelper) {
                // No matching employee record found in Nusawork/SIMAS -> refuse to create a ghost account
                console.warn(`[GOOGLE AUTH] No employee record found for ${email}. Refusing to auto-create local user.`);
                return res.status(404).json({ success: false, message: 'Account not linked to any employee record. Please contact HR/Admin to verify your corporate email.' });
            }

            // New User: Create with linked data
            const id = Date.now().toString();
            const name = employeeHelper.full_name;
            const avatar = employeeHelper.photo_profile || `https://ui-avatars.com/api/?name=${name}&background=random`;
            const branch = employeeHelper.organization_name || 'Headquarters';

            const initialRole = determineInitialRole(employeeHelper);

            console.log(`[GOOGLE AUTH] Creating new user ${email} with default role ${initialRole}`);
            await query('INSERT INTO users (id, email, password, name, role, avatar, branch, employee_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
                [id, email, UNUSABLE_PASSWORD, name, initialRole, avatar, branch, employeeId]);

            user = { id, email, name, role: initialRole, avatar, branch, employee_id: employeeId };
        } else {
            // Update email in users table if it has changed
            if (user.email !== email) {
                console.log(`[GOOGLE AUTH] Email change detected. Updating users table email from ${user.email} to ${email} for user ID ${user.id}`);
                await query('UPDATE users SET email = ? WHERE id = ?', [email, user.id]);
                user.email = email;
            }
            // Ensure employee link is set if found
            if (!user.employee_id && employeeHelper) {
                await query('UPDATE users SET employee_id = ? WHERE id = ?', [employeeHelper.id_employee, user.id]);
                user.employee_id = employeeHelper.id_employee;
            }
        }

        const isSupervisor = await checkIsSupervisor(user);

        res.json({
            success: true,
            token: issueAuthToken(user.id),
            user: {
                id: user.id,
                name: user.name,
                role: user.role,
                email: user.email,
                branch: user.branch,
                employee_id: user.employee_id,
                avatar: user.avatar,
                isSupervisor,
                isIntern: isInternStatus(employeeHelper?.status_join)
            }
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Database error' });
    }
});

// --- ACTIVITY LOG LISTING (Admin Panel > Logs) ---
app.get('/api/activity-logs', async (req, res) => {
    try {
        const { module, role, action, search, startDate, endDate } = req.query;
        const page = Math.max(1, parseInt(req.query.page, 10) || 1);
        const pageSize = Math.min(200, Math.max(1, parseInt(req.query.pageSize, 10) || 50));

        const where = [];
        const params = [];
        if (module) { where.push('module = ?'); params.push(module); }
        if (action) { where.push('action = ?'); params.push(action); }
        if (role === 'HR') where.push("actor_role IN ('HR', 'HR_ADMIN')");
        else if (role === 'STAFF') where.push("(actor_role IS NULL OR actor_role NOT IN ('HR', 'HR_ADMIN'))");
        if (startDate) { where.push('created_at >= ?'); params.push(`${startDate} 00:00:00`); }
        if (endDate) { where.push('created_at <= ?'); params.push(`${endDate} 23:59:59`); }
        if (search) {
            const like = `%${search}%`;
            where.push('(actor_name LIKE ? OR actor_email LIKE ? OR actor_employee_id LIKE ? OR impersonator_name LIKE ? OR target_label LIKE ?)');
            params.push(like, like, like, like, like);
        }
        const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

        const [countRow] = await query(`SELECT COUNT(*) AS total FROM activity_logs ${whereSql}`, params);
        const rows = await query(
            `SELECT id, actor_user_id, actor_employee_id, actor_name, actor_email, actor_role, impersonator_name, impersonator_email, module, action,
                    target_id, target_label, changes, method, path, ip_address, created_at
             FROM activity_logs ${whereSql}
             ORDER BY created_at DESC, id DESC
             LIMIT ? OFFSET ?`,
            [...params, pageSize, (page - 1) * pageSize]
        );
        const parsed = rows.map((r) => {
            let changes = null;
            try { changes = r.changes ? JSON.parse(r.changes) : null; } catch { changes = null; }
            return { ...r, changes };
        });
        res.json({ rows: parsed, total: countRow?.total || 0, page, pageSize });
    } catch (err) {
        console.error('[ACTIVITY LOG] List failed:', err);
        res.status(500).json({ error: err.message });
    }
});

// --- LEADERBOARD (points 1-100 per employee and per team) ---
// Every active, non-intern employee earns capped points per component for the year; leaders also
// earn points for their leader duties, measured as the share of those tasks they completed. The
// score is total / the maximum they could have earned, scaled to 1-100. A team is a leader plus
// their direct reports, scored as the average of its members.
const LEADERBOARD_CAPS = { reading: 30, module: 5, internal: 20, host: 10, external: 15, idp: 10, competency: 5, pte: 5 };
const LEADERBOARD_BASE_KEYS = ['reading', 'module', 'internal', 'host', 'external'];
const LEADERBOARD_DUTY_KEYS = ['idp', 'competency', 'pte'];
// Points for a completed module or attended training that has no post-test to score it by.
const LEADERBOARD_NO_POST_TEST_POINTS = 8;
const LEADERBOARD_CACHE_MS = 10 * 60 * 1000;
// Off unless module_leaderboard=true in .env - hides the menu (via /api/config) and the endpoint.
const isLeaderboardEnabled = () => process.env.module_leaderboard === 'true';

// Reading log points follow the incentive category (see AdminReadingLog.tsx): Rp100.000 books earn
// 10, Rp50.000 business comics 5, and fiction/magazines - no incentive - still earn 3.
const readingLogPoints = (category) => {
    const cat = (category || '').trim().toLowerCase();
    if (cat === 'buku fiksi/novel' || cat === 'majalah' || cat === 'fiction') return 3;
    if (cat.includes('komik') || cat.startsWith('comic')) return 5;
    return 10;
};

const computeLeaderboard = async (year) => {
    const today = nowInWib();
    const isCurrentYear = today.getUTCFullYear() === year;
    const lastMonth = isCurrentYear ? today.getUTCMonth() + 1 : 12;
    const lastQuarter = isCurrentYear ? Math.floor(today.getUTCMonth() / 3) + 1 : 4;
    const yearOf = (v) => v ? new Date(v).getFullYear() : null;

    const employees = (await querySimAsset(
        `SELECT id_employee, user_id, full_name, nickname, job_position, organization_name, id_report_to, id_report_to_value,
                active_status, status_join, deleted_at
         FROM employees`
    )).filter(e => e.id_employee && !e.deleted_at && isActiveNonIntern(e));
    const points = new Map(employees.map(e => [String(e.id_employee), Object.fromEntries(Object.keys(LEADERBOARD_CAPS).map(k => [k, 0]))]));
    const add = (employeeId, key, value) => { const p = points.get(String(employeeId)); if (p) p[key] += value; };

    // Reading logs - only HR-Approved ones count; Rejected/Cancelled/Pending/Draft earn nothing.
    for (const r of await query(
        `SELECT employee_id, category FROM reading_logs
         WHERE hr_approval_status = 'Approved' AND YEAR(COALESCE(finish_date, date)) = ?`, [year]
    )) add(r.employee_id, 'reading', readingLogPoints(r.category));

    // Online modules - a course counts once every module is completed: average best post-test / 10.
    const moduleCount = new Map((await query('SELECT course_id, COUNT(*) AS n FROM course_modules GROUP BY course_id')).map(r => [r.course_id, r.n]));
    const coursePostScores = new Map();
    for (const r of await query(
        `SELECT employee_id, course_id, module_id, MAX(score) AS score, MAX(date) AS date FROM quiz_results
         WHERE course_id IS NOT NULL AND quiz_type = 'POST' AND employee_id IS NOT NULL
         GROUP BY employee_id, course_id, module_id`
    )) {
        const key = `${r.employee_id}|${r.course_id}`;
        if (!coursePostScores.has(key)) coursePostScores.set(key, { scores: [], lastDate: null });
        const entry = coursePostScores.get(key);
        entry.scores.push(Number(r.score));
        if (!entry.lastDate || new Date(r.date) > new Date(entry.lastDate)) entry.lastDate = r.date;
    }
    for (const p of await query('SELECT employee_id, course_id, completed_module_ids, last_access FROM progress WHERE employee_id IS NOT NULL')) {
        let done = [];
        try { done = JSON.parse(p.completed_module_ids || '[]'); } catch { done = []; }
        const total = moduleCount.get(p.course_id) || 0;
        if (!total || new Set(done).size < total) continue;
        const post = coursePostScores.get(`${p.employee_id}|${p.course_id}`);
        // Completion has no timestamp of its own - the latest post-test (or last access) dates it.
        if (yearOf(post?.lastDate || p.last_access) !== year) continue;
        add(p.employee_id, 'module', post ? post.scores.reduce((a, b) => a + b, 0) / post.scores.length / 10 : LEADERBOARD_NO_POST_TEST_POINTS);
    }

    // Internal training - closed sessions, attendees only: their own post-test / 10, or the
    // session's average if they skipped it, or a flat 8 when the session has no post-test at all.
    // The host earns the session average too.
    const meetings = await query(
        `SELECT id, employee_id, guests_json, cost_report_json FROM meetings
         WHERE is_closed = 1 AND deleted_at IS NULL AND YEAR(date) = ?`, [year]
    );
    const meetingPostScores = new Map();
    if (meetings.length > 0) {
        for (const r of await query(
            `SELECT meeting_id, employee_id, MAX(score) AS score FROM quiz_results
             WHERE meeting_id IN (${meetings.map(() => '?').join(',')}) AND quiz_type = 'POST' AND employee_id IS NOT NULL
             GROUP BY meeting_id, employee_id`, meetings.map(m => m.id)
        )) {
            if (!meetingPostScores.has(r.meeting_id)) meetingPostScores.set(r.meeting_id, new Map());
            meetingPostScores.get(r.meeting_id).set(String(r.employee_id), Number(r.score));
        }
    }
    for (const meeting of meetings) {
        const post = meetingPostScores.get(meeting.id) || new Map();
        const sessionPoints = post.size ? [...post.values()].reduce((a, b) => a + b, 0) / post.size / 10 : LEADERBOARD_NO_POST_TEST_POINTS;
        for (const id of await getMeetingAttendeeEmployeeIds(meeting)) {
            add(id, 'internal', post.has(String(id)) ? post.get(String(id)) / 10 : sessionPoints);
        }
        if (meeting.employee_id) add(meeting.employee_id, 'host', sessionPoints);
    }

    // External training - 10 once HR has Processed (paid) it.
    for (const r of await query(
        `SELECT employee_id FROM external_training_requests
         WHERE status = 'Processed' AND deleted_at IS NULL AND YEAR(COALESCE(end_date, start_date)) = ?`, [year]
    )) add(r.employee_id, 'external', 10);

    // Teams: every active employee with at least one active direct report leads one.
    const teams = new Map();
    for (const leader of employees) {
        const members = employees.filter(e => e.id_employee !== leader.id_employee && reportsToLeader(e, leader));
        if (members.length > 0) teams.set(String(leader.id_employee), members.map(m => String(m.id_employee)));
    }
    const leadersOf = new Map();
    for (const [leaderId, members] of teams) for (const m of members) {
        if (!leadersOf.has(m)) leadersOf.set(m, []);
        leadersOf.get(m).push(leaderId);
    }

    // Leader duties as { due, done } - scored by the share completed; a duty with nothing due is
    // left out of that leader's maximum instead of counting against them.
    const duty = new Map([...teams.keys()].map(l => [l, Object.fromEntries(LEADERBOARD_DUTY_KEYS.map(k => [k, { due: 0, done: 0 }]))]));
    const task = (employeeId, key, isDone) => {
        for (const l of leadersOf.get(String(employeeId)) || []) {
            const d = duty.get(l)[key];
            d.due++;
            if (isDone) d.done++;
        }
    };

    // IDP - each month of each Approved plan, from approval to now, is one monthly review to log.
    const reviewedMonths = new Set((await query(`SELECT idp_id, DATE_FORMAT(review_date, '%Y-%m') AS ym FROM idp_reviews`)).map(r => `${r.idp_id}|${r.ym}`));
    for (const plan of await query(
        `SELECT id, employee_id, COALESCE(approved_date, created_by_date) AS start FROM idp_plans
         WHERE status = 'Approved' AND period_year = ?`, [year]
    )) {
        const firstMonth = plan.start && yearOf(plan.start) === year ? new Date(plan.start).getMonth() + 1 : 1;
        for (let m = firstMonth; m <= lastMonth; m++) task(plan.employee_id, 'idp', reviewedMonths.has(`${plan.id}|${year}-${pad2(m)}`));
    }

    // Competency - each team member, in each quarter the company has run assessments for so far.
    const assessedPairs = new Set((await query(
        'SELECT DISTINCT employee_id, quarter FROM competency_assessments WHERE year = ? AND quarter <= ?', [year, lastQuarter]
    )).map(r => `${r.employee_id}|${r.quarter}`));
    const activeQuarters = [...new Set([...assessedPairs].map(k => Number(k.split('|')[1])))];
    for (const members of teams.values()) for (const m of members) for (const qtr of activeQuarters) {
        task(m, 'competency', assessedPairs.has(`${m}|${qtr}`));
    }

    // Post Training Evaluation - the same (form, training, attendee) items the leader's PTE page lists.
    const forms = await query(
        `SELECT f.*, m.title AS meeting_title, m.date AS meeting_date, m.is_closed AS meeting_is_closed, m.guests_json, m.cost_report_json
         FROM post_training_evaluation_forms f LEFT JOIN meetings m ON f.meeting_id = m.id
         WHERE f.status = 'PUBLISHED' AND f.deleted_at IS NULL`
    );
    for (const form of forms) {
        const responses = await query(
            'SELECT meeting_id, external_training_request_id, evaluatee_employee_id FROM post_training_evaluation_responses WHERE form_id = ?', [form.id]
        );
        const submitted = new Set(responses.map(r => r.meeting_id
            ? `m${r.meeting_id}-${r.evaluatee_employee_id}`
            : `e${r.external_training_request_id}-${r.evaluatee_employee_id}`));
        for (const meeting of await getFormMeetings(form)) {
            if (!meeting.is_closed || yearOf(meeting.date) !== year) continue;
            for (const id of await getMeetingAttendeeEmployeeIds(meeting)) task(id, 'pte', submitted.has(`m${meeting.id}-${id}`));
        }
        for (const etr of await getFormExternalTrainingRequests(form)) {
            if (etr.status !== 'Processed' || yearOf(etr.end_date || etr.start_date) !== year) continue;
            task(etr.employee_id, 'pte', submitted.has(`e${etr.id}-${etr.employee_id}`));
        }
    }

    // Scores.
    const round1 = (v) => Math.round(v * 10) / 10;
    const individuals = employees.map(e => {
        const id = String(e.id_employee);
        const raw = points.get(id);
        const isLeader = teams.has(id);
        const components = {};
        let total = 0;
        let max = 0;
        for (const k of LEADERBOARD_BASE_KEYS) {
            const value = Math.min(raw[k], LEADERBOARD_CAPS[k]);
            components[k] = { points: round1(value), max: LEADERBOARD_CAPS[k] };
            total += value;
            max += LEADERBOARD_CAPS[k];
        }
        for (const k of LEADERBOARD_DUTY_KEYS) {
            const d = isLeader ? duty.get(id)[k] : null;
            if (!d || d.due === 0) continue;
            const share = d.done / d.due;
            // IDP reviews swing both ways: all months reviewed +10, half 0, none -10.
            const value = k === 'idp' ? (2 * share - 1) * LEADERBOARD_CAPS.idp : share * LEADERBOARD_CAPS[k];
            components[k] = { points: round1(value), max: LEADERBOARD_CAPS[k], done: d.done, due: d.due };
            total += value;
            max += LEADERBOARD_CAPS[k];
        }
        return {
            employeeId: id,
            name: e.full_name,
            jobPosition: e.job_position || null,
            department: e.organization_name || null,
            isLeader,
            teamLeaderIds: leadersOf.get(id) || [],
            score: Math.max(1, Math.min(100, Math.round(total / max * 100))),
            components
        };
    }).sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));

    // Standard competition ranking: equal scores share a rank (1, 2, 2, 4).
    individuals.forEach((row, i) => { row.rank = i > 0 && row.score === individuals[i - 1].score ? individuals[i - 1].rank : i + 1; });

    const scoreById = new Map(individuals.map(r => [r.employeeId, r.score]));
    const employeeById = new Map(employees.map(e => [String(e.id_employee), e]));
    const teamRows = [...teams.entries()].map(([leaderId, members]) => {
        const memberScores = [leaderId, ...members].map(id => scoreById.get(id)).filter(v => v != null);
        const leader = employeeById.get(leaderId);
        return {
            leaderId,
            leaderName: leader.full_name,
            department: leader.organization_name || null,
            size: memberScores.length,
            memberIds: [leaderId, ...members],
            score: round1(memberScores.reduce((a, b) => a + b, 0) / memberScores.length)
        };
    }).sort((a, b) => b.score - a.score || a.leaderName.localeCompare(b.leaderName));
    teamRows.forEach((row, i) => { row.rank = i > 0 && row.score === teamRows[i - 1].score ? teamRows[i - 1].rank : i + 1; });

    return { year, generatedAt: new Date().toISOString(), individuals, teams: teamRows };
};

const leaderboardCache = new Map();
const getLeaderboard = async (year, { refresh = false } = {}) => {
    const cached = leaderboardCache.get(year);
    if (!refresh && cached && cached.expiresAt > Date.now()) return cached.promise;
    // Cache the in-flight promise, so concurrent visitors share one computation.
    const promise = computeLeaderboard(year);
    leaderboardCache.set(year, { promise, expiresAt: Date.now() + LEADERBOARD_CACHE_MS });
    promise.catch(() => leaderboardCache.delete(year));
    return promise;
};

// Everyone signed in sees both rankings; the per-component breakdown is only included for the
// viewer's own row (and for everyone when HR is looking), so colleagues see scores, not details.
app.get('/api/leaderboard', async (req, res) => {
    try {
        if (!isLeaderboardEnabled()) return res.status(404).json({ error: 'Leaderboard is not enabled' });
        const currentYear = nowInWib().getUTCFullYear();
        const year = Number(req.query.year) || currentYear;
        if (year < 2020 || year > currentYear) return res.status(400).json({ error: 'Invalid year' });
        const isHR = isHRRole(req.user.role);
        const data = await getLeaderboard(year, { refresh: isHR && req.query.refresh === '1' });
        const viewerId = req.user.employee_id ? String(req.user.employee_id) : null;
        res.json({
            ...data,
            viewerEmployeeId: viewerId,
            individuals: data.individuals.map(row => (isHR || row.employeeId === viewerId) ? row : { ...row, components: undefined })
        });
    } catch (err) {
        console.error('[LEADERBOARD] Failed to compute:', err);
        res.status(500).json({ error: err.message });
    }
});

// --- APP CONFIG ENDPOINT ---
app.get('/api/config', (req, res) => {
    res.json({
        moduleInternal: process.env.module_internal === 'true',
        moduleExternal: process.env.module_external === 'true',
        moduleIncentive: process.env.module_incentive_certification === 'true',
        moduleIDP: process.env.module_IDP !== 'false',
        moduleLeaderboard: isLeaderboardEnabled()
    });
});

// --- SESSION EPOCH ENDPOINT (Force Logout Mechanism) ---
app.get('/api/auth/session-epoch', (req, res) => {
    const currentEpoch = process.env.SESSION_EPOCH || 'v1';
    res.json({ success: true, epoch: currentEpoch });
});

// --- AUTH SESSION REFRESH ENDPOINT ---
// Loads a user the way the frontend keeps it (lms_user), re-syncing name/avatar/branch/employee id
// from SIMASSET on the way. Null if the account no longer exists.
const loadSessionUser = async (userId) => {
    const users = await query('SELECT * FROM users WHERE id = ?', [userId]);
    const user = users[0];
    if (!user) return null;
    const { email } = user;

    const employees = await querySimAsset('SELECT * FROM employees WHERE email = ?', [email]);
    const employeeHelper = employees.length > 0 ? employees[0] : null;

    if (employeeHelper) {
        const name = employeeHelper.full_name;
        const avatar = employeeHelper.photo_profile || `https://ui-avatars.com/api/?name=${name}&background=random`;
        const branch = employeeHelper.organization_name || 'Headquarters';
        const employeeId = employeeHelper.id_employee;

        await query('UPDATE users SET name = ?, avatar = ?, branch = ?, employee_id = ? WHERE id = ?',
            [name, avatar, branch, employeeId, user.id]);

        user.name = name;
        user.avatar = avatar;
        user.branch = branch;
        user.employee_id = employeeId;
    }

    const isSupervisor = await checkIsSupervisor(user);

    return {
        id: user.id,
        name: user.name,
        role: user.role,
        email: user.email,
        branch: user.branch,
        employee_id: user.employee_id,
        avatar: user.avatar,
        isSupervisor,
        isIntern: isInternStatus(employeeHelper?.status_join)
    };
};

// The HR account behind an impersonation session, as the frontend shows it ("signed in as ... by ...").
const toImpersonatorInfo = (impersonator) => impersonator
    ? { id: impersonator.id, name: impersonator.name, email: impersonator.email }
    : undefined;

// Re-reads the signed-in user (from the session token, via the auth middleware) on page reload.
app.post('/api/auth/refresh', async (req, res) => {
    try {
        const user = await loadSessionUser(req.user.id);
        if (!user) {
            return res.status(404).json({ success: false, message: 'User not found' });
        }
        res.json({ success: true, user: { ...user, impersonator: toImpersonatorInfo(req.impersonator) } });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Database error' });
    }
});

// --- IMPERSONATION ---
// HR signs in as another user to see and use the LMS exactly as they do. The new token runs as
// that user but remembers the HR account (see issueAuthToken), so every write is logged with both
// and /stop can hand the HR session back without signing in again.
app.post('/api/auth/impersonate', async (req, res) => {
    try {
        if (req.impersonator) return res.status(400).json({ success: false, message: 'Already signed in as another user - switch back first' });
        if (!isHRRole(req.user.role)) return res.status(403).json({ success: false, message: 'HR access required' });
        const targetId = String(req.body?.userId || '');
        if (!targetId) return res.status(400).json({ success: false, message: 'userId is required' });
        if (targetId === String(req.user.id)) return res.status(400).json({ success: false, message: 'Cannot impersonate yourself' });

        const user = await loadSessionUser(targetId);
        if (!user) return res.status(404).json({ success: false, message: 'User not found' });
        // Only employee (STAFF) accounts - never another HR account.
        if (isHRRole(user.role)) return res.status(403).json({ success: false, message: 'Only employee accounts can be signed in as' });

        console.log(`[AUTH] ${req.user.email} started impersonating ${user.email}`);
        res.json({
            success: true,
            token: issueAuthToken(user.id, req.user.id),
            user: { ...user, impersonator: toImpersonatorInfo(req.user) }
        });
    } catch (err) {
        console.error('[AUTH] Impersonation failed:', err);
        res.status(500).json({ error: 'Database error' });
    }
});

app.post('/api/auth/impersonate/stop', async (req, res) => {
    try {
        if (!req.impersonator) return res.status(400).json({ success: false, message: 'Not signed in as another user' });
        const user = await loadSessionUser(req.impersonator.id);
        if (!user) return res.status(401).json({ success: false, message: 'Authentication required' });

        console.log(`[AUTH] ${req.impersonator.email} stopped impersonating ${req.user.email}`);
        res.json({ success: true, token: issueAuthToken(user.id), user });
    } catch (err) {
        console.error('[AUTH] Stopping impersonation failed:', err);
        res.status(500).json({ error: 'Database error' });
    }
});

// --- UPLOAD ROUTE ---
app.post('/api/upload', upload.single('file'), (req, res) => {
    if (!req.file) return res.status(400).json({ message: 'No file uploaded' });
    const fileUrl = `/api/uploads/${req.file.filename}`;
    res.json({ success: true, fileUrl });
});

// --- FEEDBACK ROUTES ---
app.post('/api/feedback', async (req, res) => {
    try {
        const { userEmail, userName, url, category, description, imageUrls } = req.body;

        // Auto-create lms_feedbacks table in LMS database if not exists (using lms_feedbacks to avoid conflicts with other apps)
        await query(`
            CREATE TABLE IF NOT EXISTS lms_feedbacks (
                id INT AUTO_INCREMENT PRIMARY KEY,
                user_email VARCHAR(255) NOT NULL,
                user_name VARCHAR(255) NOT NULL,
                url VARCHAR(255) NOT NULL,
                category VARCHAR(50) NOT NULL,
                description TEXT NOT NULL,
                image_urls TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // Insert feedback into LMS database
        const result = await query(
            'INSERT INTO lms_feedbacks (user_email, user_name, url, category, description, image_urls) VALUES (?, ?, ?, ?, ?, ?)',
            [userEmail || 'Anonymous', userName || 'Anonymous', url || '', category || 'Issue', description || '', JSON.stringify(imageUrls || [])]
        );

        // Optional sync to Google Sheets Apps Script Web App
        const sheetsScriptUrl = process.env.GOOGLE_FEEDBACK_SHEETS_URL;

        if (sheetsScriptUrl) {
            try {
                // Fetch with a short timeout to prevent blocking in case the script is slow
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), 6000);
                const hostUrl = process.env.VITE_API_BASE_URL || `http://localhost:${process.env.PORT || 8036}`;

                await fetch(sheetsScriptUrl, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        timestamp: new Date().toLocaleString('id-ID'),
                        userEmail,
                        userName,
                        url,
                        category,
                        description,
                        imageUrls: (imageUrls || []).map(url => url.startsWith('http') ? url : `${hostUrl}${url}`).join(', ')
                    }),
                    signal: controller.signal
                });
                clearTimeout(timeoutId);
                console.log("Successfully synced feedback to Google Sheets!");
            } catch (sheetErr) {
                console.error("Google Sheets sync status:", sheetErr.message);
            }
        }

        res.json({ success: true, feedbackId: result.insertId });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/feedback/history', async (req, res) => {
    try {
        const { email } = req.query;
        if (!email) return res.status(400).json({ error: 'Email is required' });

        await query(`
            CREATE TABLE IF NOT EXISTS lms_feedbacks (
                id INT AUTO_INCREMENT PRIMARY KEY,
                user_email VARCHAR(255) NOT NULL,
                user_name VARCHAR(255) NOT NULL,
                url VARCHAR(255) NOT NULL,
                category VARCHAR(50) NOT NULL,
                description TEXT NOT NULL,
                image_urls TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        const feedbacks = await query(
            'SELECT * FROM lms_feedbacks WHERE user_email = ? ORDER BY created_at DESC',
            [email]
        );
        res.json(feedbacks.map(f => ({
            id: f.id,
            userEmail: f.user_email,
            userName: f.user_name,
            url: f.url,
            category: f.category,
            description: f.description,
            imageUrls: JSON.parse(f.image_urls || '[]'),
            createdAt: f.created_at
        })));
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: err.message });
    }
});


app.post('/api/admin/sync-all-nusawork', async (req, res) => {
    console.log('[API] POST /api/admin/sync-all-nusawork - Request to bulk sync all users');
    try {
        const token = await getNusanetToken();
        if (!token) {
            return res.status(401).json({ success: false, message: 'Authentication failed: No active Nusawork session or token found. Please log out and log back in to renew your session.' });
        }

        const users = await query('SELECT email, employee_id FROM users');
        console.log(`[API] Found ${users.length} users in local DB to sync.`);

        // Respond immediately to prevent HTTP connection timeout (504 Gateway Timeout)
        res.json({
            success: true,
            message: `Synchronization started in the background for ${users.length} users. Please refresh the page in a few moments to see the updated data.`
        });

        // Execute the sync in the background
        (async () => {
            let successCount = 0;
            let failCount = 0;

            console.log(`[API SYNC] Fetching all active employees from Nusawork...`);
            const baseUrl = process.env.NUSANET_BASE_URL || 'https://nusanet.app.nusawork.com';
            const filterUrl = `${baseUrl}/emp/api/v4.2/client/employee/filter?page=1`;

            const response = await fetch(filterUrl, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json',
                    'Accept': 'application/json'
                },
                body: JSON.stringify({
                    fields: {
                        active_status: ["active", "Resign"]
                    },
                    page_count: 999999,
                    paginate: true,
                    periods: getNusaworkFilterPeriods()
                })
            });

            if (!response.ok) {
                throw new Error(`Nusawork API returned status ${response.status}: ${response.statusText}`);
            }

            const result = await response.json();
            const extractEmpList = (resObj) => {
                if (resObj && resObj.data) {
                    if (Array.isArray(resObj.data.list)) return resObj.data.list;
                    if (Array.isArray(resObj.data)) return resObj.data;
                    if (resObj.data.data && Array.isArray(resObj.data.data)) return resObj.data.data;
                } else if (Array.isArray(resObj)) {
                    return resObj;
                }
                return [];
            };

            const empList = extractEmpList(result);
            console.log(`[API SYNC] Retrieved ${empList.length} employees from Nusawork.`);

            if (empList.length === 0) {
                console.warn(`[API SYNC] Empty employee list returned from Nusawork. Aborting bulk sync.`);
                return;
            }

            // Build lookup maps
            const empByEmpId = new Map();
            const empByEmail = new Map();
            const empByUsername = new Map();

            for (const emp of empList) {
                const empId = emp.id_employee || emp.employee_id;
                if (empId) {
                    empByEmpId.set(String(empId).toLowerCase(), emp);
                }
                if (emp.email) {
                    const emailLower = emp.email.toLowerCase();
                    empByEmail.set(emailLower, emp);

                    const username = emailLower.split('@')[0];
                    empByUsername.set(username, emp);
                }
            }

            // Perform in-memory matching and database updates
            for (const user of users) {
                if (!user.email || user.email.endsWith('@nusa.com')) {
                    continue;
                }

                try {
                    let employee = null;

                    // 1. Try by employee_id
                    if (user.employee_id) {
                        employee = empByEmpId.get(String(user.employee_id).toLowerCase());
                    }
                    // 2. Try by email
                    if (!employee && user.email) {
                        employee = empByEmail.get(user.email.toLowerCase());
                    }
                    // 3. Try by username variant matching (net.id vs id)
                    if (!employee && user.email && user.email.includes('@')) {
                        const username = user.email.toLowerCase().split('@')[0];
                        employee = empByUsername.get(username);
                    }

                    if (!employee) {
                        console.log(`[API SYNC] Match not found in memory for ${user.email} (${user.employee_id}). Skipping.`);
                        failCount++;
                        continue;
                    }

                    // Extract and normalize values
                    const fullName = employee.full_name || employee.name || user.email.split('@')[0].replace('.', ' ');
                    const employeeId = employee.id_employee || employee.employee_id || null;
                    // Must prefer the actual branch fields over organization_name — organization_name is the
                    // department (e.g. "Technical"), which never matches a row in `branches`, so putting it
                    // first silently defaulted branch_id to HQ ('020') for every employee whose department
                    // name didn't coincidentally collide with a branch name.
                    const branchName = employee.branch_name || (employee.branch ? employee.branch.name : null) || employee.organization_name || 'Headquarters';
                    const photoProfile = employee.photo_profile || employee.photo || `https://ui-avatars.com/api/?name=${fullName}&background=random`;
                    const email = employee.email || user.email;

                    let branchId = '020';
                    try {
                        const branches = await querySimAsset('SELECT id_branch FROM branches WHERE name LIKE ?', [`%${branchName}%`]);
                        if (branches.length > 0) {
                            branchId = branches[0].id_branch;
                        }
                    } catch (e) {
                        console.warn(`[API SYNC] Failed to query branch matching ${branchName}:`, e.message);
                    }

                    const dbFields = {};
                    for (const [key, value] of Object.entries(employee)) {
                        if (value !== null && typeof value === 'object') {
                            continue;
                        }
                        const sanitizedKey = key.replace(/[^a-zA-Z0-9_]/g, '');
                        if (sanitizedKey && sanitizedKey.toLowerCase() !== 'employee_id') {
                            dbFields[sanitizedKey] = value !== undefined ? value : null;
                        }
                    }

                    dbFields.full_name = fullName;
                    dbFields.email = email;
                    dbFields.id_employee = employeeId;
                    dbFields.branch_id = branchId;
                    dbFields.photo_profile = photoProfile;

                    if (!dbFields.job_position) dbFields.job_position = 'Staff';
                    if (!dbFields.job_level) dbFields.job_level = 'Staff';
                    if (!dbFields.organization_name) dbFields.organization_name = branchName;
                    if (!dbFields.status_join) dbFields.status_join = 'Permanent';

                    await ensureEmployeeColumnsExist(dbFields);

                    // 1. Sync to employees table
                    if (employeeId) {
                        const existingEmp = await findLocalEmployeeByEmailOrId(email, employeeId);
                        const cols = Object.keys(dbFields);
                        const vals = Object.values(dbFields);

                        if (!existingEmp) {
                            const placeholders = cols.map(() => '?').join(', ');
                            await querySimAsset(
                                `INSERT INTO employees (${cols.map(c => `\`${c}\``).join(', ')}) VALUES (${placeholders})`,
                                vals
                            );
                        } else {
                            const fields = cols.map(c => `\`${c}\` = ?`).join(', ');
                            const empIdToUpdate = existingEmp.id_employee || employeeId;
                            await querySimAsset(`UPDATE employees SET ${fields} WHERE id_employee = ?`, [...vals, empIdToUpdate]);
                        }
                    }

                    // 2. Sync to users table
                    const localUser = await findLocalUserByEmailOrId(email, employeeId);
                    if (localUser) {
                        const isActive = (employee.active_status && employee.active_status.toLowerCase() === 'active') ? 1 : 0;
                        if (localUser.email !== email) {
                            console.log(`[API SYNC] Email change detected in bulk. Updating local user email from ${localUser.email} to ${email}`);
                            await query(
                                'UPDATE users SET email = ?, name = ?, branch = ?, employee_id = ?, avatar = ?, is_active = ? WHERE id = ?',
                                [email, fullName, branchName, employeeId, photoProfile, isActive, localUser.id]
                            );
                        } else {
                            await query(
                                'UPDATE users SET name = ?, branch = ?, employee_id = ?, avatar = ?, is_active = ? WHERE id = ?',
                                [fullName, branchName, employeeId, photoProfile, isActive, localUser.id]
                            );
                        }
                    }
                    successCount++;
                } catch (err) {
                    console.error(`[API SYNC] Error syncing user ${user.email}:`, err.message);
                    failCount++;
                }
            }
            console.log(`[API SYNC] Bulk sync completed. Success: ${successCount}, Failed: ${failCount}`);
        })().catch(err => {
            console.error('[API SYNC] Error in background bulk sync:', err);
        });

    } catch (err) {
        console.error('[API] Error in /api/admin/sync-all-nusawork:', err);
        res.status(500).json({ error: err.message });
    }
});

// --- USER ROUTES ---
// Aggregates learning hours/cost across internal training, external training, online modules, and the
// reading log for one employee, optionally bounded to a date range. Shared by /api/learning-stats and
// the IDP endpoints (which use it to auto-track the mandatory "48 jam/tahun" development action item).
const computeLearningStats = async ({ email, employee_id, startDate, endDate }) => {
    if (!email && !employee_id) throw new Error('Email or employee_id required');

    // Optional date-range filter (inclusive). When omitted, every record is included (unfiltered/all-time).
    const rangeStart = startDate ? new Date(startDate) : null;
    const rangeEnd = endDate ? new Date(`${endDate}T23:59:59.999`) : null;
    const isWithinRange = (dateStr) => {
        if (!rangeStart && !rangeEnd) return true;
        if (!dateStr) return false;
        const d = new Date(dateStr);
        if (isNaN(d.getTime())) return false;
        if (rangeStart && d < rangeStart) return false;
        if (rangeEnd && d > rangeEnd) return false;
        return true;
    };

    let targetEmail = email;
    let targetEmpId = employee_id;
    let targetUserId = null;

    // Find employee if missing
    let targetName = null;
    if (targetEmail) {
        const users = await query('SELECT id, employee_id, name FROM users WHERE email = ?', [targetEmail]);
        if (users.length > 0) {
            targetUserId = users[0].id;
            if (!targetEmpId) targetEmpId = users[0].employee_id;
            targetName = users[0].name;
        }
    }

    let jamTraining = 0;
    let biayaTraining = 0;
    let jamTrainingExternal = 0;
    let biayaTrainingExternal = 0;
    let jamOnline = 0;
    let jamBuku = 0;
    let biayaBuku = 0;
    const trainingDetails = [];
    const trainingExternalDetails = [];
    const onlineDetails = [];
    const bookDetails = [];

    // 1. Internal Training (meetings)
    const meetings = await query("SELECT id, title, date, time, guests_json, cost_report_json, host, employee_id FROM meetings WHERE type IN ('Offline', 'Online', 'Hybrid', 'Internal') AND deleted_at IS NULL");

    // Fetch this user's pre/post-test scores and feedback submissions across all meetings up front
    // (avoids N+1 queries inside the loop below).
    const userQuizResults = await query(
        `SELECT meeting_id, quiz_type, score FROM quiz_results
             WHERE meeting_id IS NOT NULL AND module_id IS NULL
               AND (student_id = ? OR (employee_id IS NOT NULL AND employee_id = ?))`,
        [targetUserId, targetEmpId]
    );
    const quizByMeeting = {};
    for (const r of userQuizResults) {
        if (!quizByMeeting[r.meeting_id]) quizByMeeting[r.meeting_id] = {};
        const quizType = (r.quiz_type || 'POST').toUpperCase();
        if (quizByMeeting[r.meeting_id][quizType] === undefined || r.score > quizByMeeting[r.meeting_id][quizType]) {
            quizByMeeting[r.meeting_id][quizType] = r.score;
        }
    }

    const userFeedback = await query(
        `SELECT meeting_id, submitted_at, feedback_data FROM course_feedback
             WHERE meeting_id IS NOT NULL
               AND (user_id = ? OR (employee_id IS NOT NULL AND employee_id = ?))`,
        [targetUserId, targetEmpId]
    );
    const feedbackByMeeting = {};
    for (const f of userFeedback) {
        let rating = null;
        try {
            const data = typeof f.feedback_data === 'string' ? JSON.parse(f.feedback_data) : f.feedback_data;
            rating = computeFeedbackRating(data);
        } catch (e) { }
        feedbackByMeeting[f.meeting_id] = { submittedAt: f.submitted_at, rating };
    }

    // This employee's Post Training Evaluation scores, across both internal meetings and external
    // training requests - fetched up front like the quiz/feedback lookups above.
    const pteByMeeting = {};
    const pteByExt = {};
    if (targetEmpId) {
        const userPteResponses = await query(
            `SELECT form_id, meeting_id, external_training_request_id, answers FROM post_training_evaluation_responses
                 WHERE evaluatee_employee_id = ?`,
            [targetEmpId]
        );
        if (userPteResponses.length > 0) {
            const pteFormIds = [...new Set(userPteResponses.map(r => r.form_id))];
            const formPlaceholders = pteFormIds.map(() => '?').join(',');
            const scaleRows = await query(
                `SELECT form_id, id FROM post_training_evaluation_questions WHERE form_id IN (${formPlaceholders}) AND type = 'SCALE'`,
                pteFormIds
            );
            const scaleIdsByForm = {};
            scaleRows.forEach(r => {
                if (!scaleIdsByForm[r.form_id]) scaleIdsByForm[r.form_id] = [];
                scaleIdsByForm[r.form_id].push(String(r.id));
            });
            userPteResponses.forEach(r => {
                let averageScore = null;
                try {
                    const answers = typeof r.answers === 'string' ? JSON.parse(r.answers) : r.answers;
                    const scaleIds = scaleIdsByForm[r.form_id] || [];
                    const scores = scaleIds.map(qId => Number(answers?.[qId])).filter(v => !isNaN(v));
                    if (scores.length > 0) averageScore = Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 10) / 10;
                } catch (e) { }
                if (averageScore === null) return;
                if (r.meeting_id) pteByMeeting[r.meeting_id] = averageScore;
                else if (r.external_training_request_id) pteByExt[r.external_training_request_id] = averageScore;
            });
        }
    }

    for (const meeting of meetings) {
        // Skip if the user is the host
        if ((targetName && meeting.host === targetName) ||
            (targetEmpId && meeting.employee_id === targetEmpId)) {
            continue;
        }

        let isAttended = false;
        let costReport = null;
        let guests = null;

        try { if (meeting.cost_report_json) costReport = JSON.parse(meeting.cost_report_json); } catch (e) { }
        try { if (meeting.guests_json) guests = JSON.parse(meeting.guests_json); } catch (e) { }

        // Check every available signal independently (don't stop at the first truthy container)
        if (costReport && costReport.attendees && targetEmail && costReport.attendees.includes(targetEmail)) isAttended = true;
        if (!isAttended && costReport && costReport.attendee_ids && targetEmpId && costReport.attendee_ids.includes(targetEmpId)) isAttended = true;
        if (!isAttended && guests && guests.emails && targetEmail && guests.emails.includes(targetEmail)) isAttended = true;
        if (!isAttended && guests && guests.employee_ids && targetEmpId && guests.employee_ids.includes(targetEmpId)) isAttended = true;

        if (isAttended && isWithinRange(meeting.date)) {
            let itemHours = 0;
            let itemCost = 0;

            // Parse duration
            if (meeting.time) {
                const parts = meeting.time.split('-');
                if (parts.length === 2) {
                    const parseTime = (t) => {
                        const [h, m] = t.split(':').map(Number);
                        return (h || 0) + (m || 0) / 60;
                    };
                    const startH = parseTime(parts[0].trim());
                    const endH = parseTime(parts[1].trim());
                    if (endH > startH) itemHours = endH - startH;
                }
            }
            jamTraining += itemHours;

            // Parse cost
            if (costReport && costReport.participantsCount > 0) {
                const tInc = Number(costReport.trainerIncentive ?? costReport.trainer) || 0;
                const sCost = Number(costReport.snackCost ?? costReport.snack) || 0;
                const lCost = Number(costReport.lunchCost ?? costReport.lunch) || 0;
                const oCost = Number(costReport.otherCost ?? costReport.other) || 0;
                const totalCost = tInc + sCost + lCost + oCost;
                itemCost = totalCost / costReport.participantsCount;
            }
            biayaTraining += itemCost;

            const meetingQuiz = quizByMeeting[meeting.id] || {};
            const feedbackEntry = feedbackByMeeting[meeting.id] || null;

            trainingDetails.push({
                title: meeting.title,
                date: meeting.date,
                hours: Math.round(itemHours * 100) / 100,
                cost: Math.round(itemCost),
                preTestScore: meetingQuiz.PRE ?? null,
                postTestScore: meetingQuiz.POST ?? null,
                feedbackSubmitted: !!feedbackEntry,
                feedbackScore: feedbackEntry ? feedbackEntry.rating : null,
                feedbackDate: feedbackEntry ? feedbackEntry.submittedAt : null,
                pteScore: pteByMeeting[meeting.id] ?? null,
                organizer: meeting.host || null
            });
        }
    }

    // 2. External Training (external_training_requests)
    if (targetEmpId) {
        const externalTrainings = await query(
            "SELECT id, title, vendor, certificate_link, start_date, end_date, registration_fee, travel_flight_cost, accommodation_cost, miscellaneous_cost, learning_hours, nusawork_id_group FROM external_training_requests WHERE employee_id = ? AND status = 'Processed' AND deleted_at IS NULL",
            [targetEmpId]
        );
        for (const ext of externalTrainings) {
            if (!isWithinRange(ext.start_date)) continue;

            let itemHours = 0;
            if (ext.learning_hours != null) {
                itemHours = Number(ext.learning_hours) || 0;
            } else if (ext.start_date && ext.end_date) {
                const diffMs = new Date(ext.end_date).getTime() - new Date(ext.start_date).getTime();
                if (diffMs > 0) itemHours = diffMs / (1000 * 60 * 60);
            }
            jamTrainingExternal += itemHours;

            const itemCost = (Number(ext.registration_fee) || 0) + (Number(ext.travel_flight_cost) || 0) +
                (Number(ext.accommodation_cost) || 0) + (Number(ext.miscellaneous_cost) || 0);
            biayaTrainingExternal += itemCost;

            trainingExternalDetails.push({
                id: ext.id,
                title: ext.title,
                date: ext.start_date,
                hours: Math.round(itemHours * 100) / 100,
                cost: Math.round(itemCost),
                organizer: ext.vendor || null,
                certificateLink: ext.certificate_link || null,
                nusaworkSynced: !!ext.nusawork_id_group,
                pteScore: pteByExt[ext.id] ?? null
            });
        }
    }

    // 3. Online Modules (progress on courses)
    if (targetEmpId || targetUserId) {
        const progressRows = await query(
            `SELECT p.course_id, p.completed_module_ids, p.last_access, c.title as course_title, c.duration as course_duration
                 FROM progress p LEFT JOIN courses c ON p.course_id = c.id
                 WHERE (p.employee_id IS NOT NULL AND p.employee_id = ?) OR p.user_id = ?`,
            [targetEmpId, targetUserId]
        );

        if (progressRows.length > 0) {
            const moduleRows = await query('SELECT id, course_id, duration FROM course_modules');
            const durationMap = {};
            const moduleCountByCourse = {};
            for (const m of moduleRows) {
                durationMap[m.id] = m.duration;
                moduleCountByCourse[m.course_id] = (moduleCountByCourse[m.course_id] || 0) + 1;
            }

            // This employee's course-level (not per-module) PRE/POST scores, fetched up front to
            // avoid N+1 queries - same "keep the best score" rule as the meetings section above.
            const courseQuizRows = await query(
                `SELECT course_id, quiz_type, score FROM quiz_results
                 WHERE course_id IS NOT NULL AND module_id IS NULL
                   AND (student_id = ? OR (employee_id IS NOT NULL AND employee_id = ?))`,
                [targetUserId, targetEmpId]
            );
            const quizByCourse = {};
            for (const r of courseQuizRows) {
                if (!quizByCourse[r.course_id]) quizByCourse[r.course_id] = {};
                const quizType = (r.quiz_type || 'POST').toUpperCase();
                if (quizByCourse[r.course_id][quizType] === undefined || r.score > quizByCourse[r.course_id][quizType]) {
                    quizByCourse[r.course_id][quizType] = r.score;
                }
            }

            for (const p of progressRows) {
                if (!isWithinRange(p.last_access)) continue;

                let completedIds = [];
                try {
                    completedIds = typeof p.completed_module_ids === 'string'
                        ? JSON.parse(p.completed_module_ids)
                        : (p.completed_module_ids || []);
                } catch (e) { }

                // Once every module in the course is done, report the admin-set "Total Duration"
                // label for the whole course instead of a tally of raw video playtime - a 2-hour
                // course made of a few short clips shouldn't read as a few minutes of learning.
                // While still in progress, fall back to the per-module tally so partial credit
                // still shows something.
                const totalModules = moduleCountByCourse[p.course_id] || 0;
                const isFullyCompleted = totalModules > 0 && completedIds.length >= totalModules;
                const labelHours = isFullyCompleted ? parseCourseTotalDurationHours(p.course_duration) : null;

                let courseHours;
                if (labelHours !== null) {
                    courseHours = labelHours;
                } else {
                    courseHours = completedIds.reduce((sum, modId) => sum + parseModuleDuration(durationMap[modId]), 0);
                }
                jamOnline += courseHours;

                if (courseHours > 0) {
                    const courseQuiz = quizByCourse[p.course_id] || {};
                    onlineDetails.push({
                        title: p.course_title || `Course #${p.course_id}`,
                        date: p.last_access,
                        hours: Math.round(courseHours * 100) / 100,
                        cost: 0,
                        preTestScore: courseQuiz.PRE ?? null,
                        postTestScore: courseQuiz.POST ?? null
                    });
                }
            }
        }
    }

    // 4. Baca Buku (reading_logs)
    // Learning hours count every book the employee actually finished reading, not just the ones HR
    // approved an incentive for - the 5-claims-per-year cap (see comment near line 111) means someone
    // who reads more than 5 books a year, or who never submitted a claim, still did the reading. Only
    // the incentive total (biayaBuku) stays gated on approval, since that's real money paid.
    if (targetEmpId) {
        const logs = await query("SELECT title, finish_date, date, incentive_amount, category, hr_approval_status FROM reading_logs WHERE employee_id = ? AND status = 'Finished'", [targetEmpId]);
        for (const log of logs) {
            if (!isWithinRange(log.finish_date || log.date)) continue;

            const isApproved = log.hr_approval_status === 'Approved';
            const incentive = Number(log.incentive_amount) || 0;
            if (isApproved) biayaBuku += incentive;

            const category = log.category || '';
            let itemHours = 0;

            if (category === 'Buku Fiksi/Novel' || category === 'Majalah' || category === 'Buku Lainnya') {
                // 0 hours
            } else if (category === 'Komik Bisnis/Non Fiksi') {
                itemHours = 3;
            } else if ([
                'Buku Biografi dan Sejarah',
                'Buku Bisnis dan Manajemen',
                'Buku Paling Diminati',
                'Buku Pengembangan Diri',
                'Buku Religi dan Hubungan',
                'Buku Sales dan Marketing',
                'Buku Teknologi',
                'Buku Terlaris',
                'Buku Wajib Baca'
            ].includes(category)) {
                itemHours = 15;
            } else {
                // Fallback to old logic just in case an old entry has no category
                if (incentive === 100000) itemHours = 15;
                else if (incentive === 50000) itemHours = 3;
                else if (incentive > 0) itemHours = (incentive / 100000) * 15;
            }

            jamBuku += itemHours;

            bookDetails.push({
                title: log.title,
                date: log.finish_date || log.date,
                hours: Math.round(itemHours * 100) / 100,
                cost: Math.round(incentive)
            });
        }
    }

    // Interns carry no learning cost - same rule the Internal Training cost report already applies
    // (an intern's per-participant share is 0). Hours still count; only the cost is zeroed, on every
    // item as well as the totals, so the detail lists add up to the Rp 0 total.
    if (await isInternEmployeeId(targetEmpId)) {
        biayaTraining = 0;
        biayaTrainingExternal = 0;
        biayaBuku = 0;
        [trainingDetails, trainingExternalDetails, bookDetails].forEach(list => list.forEach(item => { item.cost = 0; }));
    }

    const byDateAsc = (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime();
    trainingDetails.sort(byDateAsc);
    trainingExternalDetails.sort(byDateAsc);
    onlineDetails.sort(byDateAsc);
    bookDetails.sort(byDateAsc);

    return {
        jamTraining: Math.round(jamTraining * 100) / 100,
        jamTrainingExternal: Math.round(jamTrainingExternal * 100) / 100,
        jamOnline: Math.round(jamOnline * 100) / 100,
        jamBuku: Math.round(jamBuku * 100) / 100,
        biayaTraining: Math.round(biayaTraining),
        biayaTrainingExternal: Math.round(biayaTrainingExternal),
        biayaBuku: Math.round(biayaBuku),
        totalJam: Math.round((jamTraining + jamTrainingExternal + jamOnline + jamBuku) * 100) / 100,
        totalBiaya: Math.round(biayaTraining + biayaTrainingExternal + biayaBuku),
        trainingDetails,
        trainingExternalDetails,
        onlineDetails,
        bookDetails
    };
};

app.get('/api/learning-stats', async (req, res) => {
    try {
        const { email, employee_id, startDate, endDate } = req.query;
        const stats = await computeLearningStats({ email, employee_id, startDate, endDate });
        res.json(stats);
    } catch (err) {
        console.error('[API] Error in /api/learning-stats:', err);
        res.status(err.message === 'Email or employee_id required' ? 400 : 500).json({ error: err.message });
    }
});

// Combined learning stats for multiple employees at once (e.g. the Employee Learning Report's
// multi-select), so the picked group's hours/costs/details are summed into a single report
// instead of the caller stitching together N separate /api/learning-stats calls.
app.post('/api/learning-stats/bulk', async (req, res) => {
    try {
        const { employees, startDate, endDate } = req.body;
        if (!Array.isArray(employees) || employees.length === 0) {
            return res.status(400).json({ error: 'employees array required' });
        }

        const perEmployee = await Promise.all(employees.map(async (emp) => ({
            employeeId: emp.employee_id,
            name: emp.name,
            stats: await computeLearningStats({ email: emp.email, employee_id: emp.employee_id, startDate, endDate })
        })));

        const tag = (items, name) => items.map(item => ({ ...item, employeeName: name }));

        const merged = {
            jamTraining: 0, jamTrainingExternal: 0, jamOnline: 0, jamBuku: 0,
            biayaTraining: 0, biayaTrainingExternal: 0, biayaBuku: 0,
            trainingDetails: [], trainingExternalDetails: [], onlineDetails: [], bookDetails: []
        };

        for (const { name, stats } of perEmployee) {
            merged.jamTraining += stats.jamTraining;
            merged.jamTrainingExternal += stats.jamTrainingExternal;
            merged.jamOnline += stats.jamOnline;
            merged.jamBuku += stats.jamBuku;
            merged.biayaTraining += stats.biayaTraining;
            merged.biayaTrainingExternal += stats.biayaTrainingExternal;
            merged.biayaBuku += stats.biayaBuku;
            merged.trainingDetails.push(...tag(stats.trainingDetails, name));
            merged.trainingExternalDetails.push(...tag(stats.trainingExternalDetails, name));
            merged.onlineDetails.push(...tag(stats.onlineDetails, name));
            merged.bookDetails.push(...tag(stats.bookDetails, name));
        }

        const byDateAsc = (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime();
        merged.trainingDetails.sort(byDateAsc);
        merged.trainingExternalDetails.sort(byDateAsc);
        merged.onlineDetails.sort(byDateAsc);
        merged.bookDetails.sort(byDateAsc);

        merged.jamTraining = Math.round(merged.jamTraining * 100) / 100;
        merged.jamTrainingExternal = Math.round(merged.jamTrainingExternal * 100) / 100;
        merged.jamOnline = Math.round(merged.jamOnline * 100) / 100;
        merged.jamBuku = Math.round(merged.jamBuku * 100) / 100;
        merged.biayaTraining = Math.round(merged.biayaTraining);
        merged.biayaTrainingExternal = Math.round(merged.biayaTrainingExternal);
        merged.biayaBuku = Math.round(merged.biayaBuku);
        merged.totalJam = Math.round((merged.jamTraining + merged.jamTrainingExternal + merged.jamOnline + merged.jamBuku) * 100) / 100;
        merged.totalBiaya = Math.round(merged.biayaTraining + merged.biayaTrainingExternal + merged.biayaBuku);

        // Per-employee breakdown, so the UI can show/hide each employee's own detail instead of
        // one merged list.
        merged.perEmployee = perEmployee.map(({ employeeId, name, stats }) => ({ employeeId, name, stats }));

        res.json(merged);
    } catch (err) {
        console.error('[API] Error in /api/learning-stats/bulk:', err);
        res.status(500).json({ error: err.message });
    }
});

// --- EXTERNAL API (OAuth2 client_credentials) ---
// Lets other Nusa systems fetch an employee's Total Learning Hours without a human LMS login.
// Auth is a standard OAuth2 client_credentials flow: the client exchanges its CLIENT_ID/CLIENT_SECRET
// for a short-lived Bearer token at /api/oauth/token, then calls the data endpoint with that token.
// Tokens are stateless (HMAC-signed, no DB/session table) so verification needs no extra storage.
const EXTERNAL_API_TOKEN_TTL = parseInt(process.env.EXTERNAL_API_TOKEN_TTL || '3600', 10);

const base64url = (buf) => buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

const signExternalApiToken = (clientId) => {
    const payload = { cid: clientId, exp: Date.now() + EXTERNAL_API_TOKEN_TTL * 1000 };
    const payloadB64 = base64url(Buffer.from(JSON.stringify(payload)));
    const signature = base64url(crypto.createHmac('sha256', process.env.EXTERNAL_API_CLIENT_SECRET)
        .update(payloadB64).digest());
    return `${payloadB64}.${signature}`;
};

const verifyExternalApiToken = (token) => {
    if (!token || typeof token !== 'string' || !token.includes('.')) return null;
    const [payloadB64, signature] = token.split('.');
    const expectedSignature = base64url(crypto.createHmac('sha256', process.env.EXTERNAL_API_CLIENT_SECRET)
        .update(payloadB64).digest());
    const sigBuf = Buffer.from(signature);
    const expectedBuf = Buffer.from(expectedSignature);
    if (sigBuf.length !== expectedBuf.length || !crypto.timingSafeEqual(sigBuf, expectedBuf)) return null;
    try {
        const payload = JSON.parse(Buffer.from(payloadB64, 'base64').toString('utf8'));
        if (!payload.exp || payload.exp < Date.now()) return null;
        return payload;
    } catch (e) {
        return null;
    }
};

const authenticateExternalApi = (req, res, next) => {
    const authHeader = req.headers.authorization || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
    const payload = verifyExternalApiToken(token);
    if (!payload) {
        return res.status(401).json({ error: 'invalid_token', error_description: 'Missing, invalid, or expired access token' });
    }
    next();
};

// Exchange CLIENT_ID/CLIENT_SECRET for a Bearer access token (grant_type=client_credentials).
// Accepts JSON or form-urlencoded body, per the OAuth2 spec convention.
app.post('/api/oauth/token', (req, res) => {
    const { client_id, client_secret, grant_type } = req.body || {};

    if (grant_type !== 'client_credentials') {
        return res.status(400).json({ error: 'unsupported_grant_type' });
    }
    if (!process.env.EXTERNAL_API_CLIENT_ID || !process.env.EXTERNAL_API_CLIENT_SECRET) {
        return res.status(500).json({ error: 'server_error', error_description: 'External API credentials are not configured' });
    }
    if (!client_id || !client_secret) {
        return res.status(400).json({ error: 'invalid_request', error_description: 'client_id and client_secret are required' });
    }

    const idMatches = client_id.length === process.env.EXTERNAL_API_CLIENT_ID.length &&
        crypto.timingSafeEqual(Buffer.from(client_id), Buffer.from(process.env.EXTERNAL_API_CLIENT_ID));
    const secretMatches = client_secret.length === process.env.EXTERNAL_API_CLIENT_SECRET.length &&
        crypto.timingSafeEqual(Buffer.from(client_secret), Buffer.from(process.env.EXTERNAL_API_CLIENT_SECRET));
    if (!idMatches || !secretMatches) {
        return res.status(401).json({ error: 'invalid_client' });
    }

    res.json({
        access_token: signExternalApiToken(client_id),
        token_type: 'Bearer',
        expires_in: EXTERNAL_API_TOKEN_TTL
    });
});

// Total Learning Hours for one employee, for external systems (e.g. HRIS) authenticated via the
// client_credentials token above. Reuses the same computeLearningStats aggregation as the internal
// report, but the response is deliberately trimmed to hours only - no course/training titles, dates,
// or cost figures, since this endpoint is reachable by systems outside the LMS.
app.get('/api/external/v1/employees/:employeeId/learning-hours', authenticateExternalApi, async (req, res) => {
    try {
        const { employeeId } = req.params;
        const { startDate, endDate } = req.query;

        const users = await query('SELECT employee_id, name FROM users WHERE employee_id = ?', [employeeId]);
        if (users.length === 0) {
            return res.status(404).json({ error: 'not_found', error_description: `No employee found with employee_id ${employeeId}` });
        }

        const stats = await computeLearningStats({ employee_id: employeeId, startDate, endDate });

        res.json({
            employee_id: employeeId,
            name: users[0].name,
            period: { start_date: startDate || null, end_date: endDate || null },
            total_learning_hours: Math.round(stats.totalJam * 100) / 100,
            breakdown: {
                internal_training_hours: Math.round(stats.jamTraining * 100) / 100,
                external_training_hours: Math.round(stats.jamTrainingExternal * 100) / 100,
                online_module_hours: Math.round(stats.jamOnline * 100) / 100,
                reading_hours: Math.round(stats.jamBuku * 100) / 100
            }
        });
    } catch (err) {
        console.error('[API] Error in /api/external/v1/employees/:employeeId/learning-hours:', err);
        res.status(500).json({ error: 'server_error', error_description: err.message });
    }
});

// Issue (or fetch existing) internal training certificate for an attendee.
// Server-side validates the meeting is paid and the employee actually attended,
// so this cannot be used to mint certificates for arbitrary meetings/employees.
app.post('/api/internal-certificates/issue', async (req, res) => {
    try {
        const { meetingId, employeeId, employeeEmail, employeeName, role } = req.body;
        const certRole = role === 'host' ? 'host' : 'participant';
        if (!meetingId || !employeeName || (!employeeId && !employeeEmail)) {
            return res.status(400).json({ error: 'meetingId, employeeName and employeeId/employeeEmail are required' });
        }

        const meetings = await query('SELECT id, title, date, host, employee_id, cost_report_json FROM meetings WHERE id = ?', [meetingId]);
        if (meetings.length === 0) return res.status(404).json({ error: 'Meeting not found' });
        const meeting = meetings[0];

        let costReport = null;
        try { if (meeting.cost_report_json) costReport = JSON.parse(meeting.cost_report_json); } catch (e) { }

        const isEligible = certRole === 'host'
            ? !!(
                (employeeId && meeting.employee_id && employeeId === meeting.employee_id) ||
                (meeting.host && employeeName.trim().toLowerCase() === meeting.host.trim().toLowerCase())
            )
            : !!(costReport && (
                (employeeId && costReport.attendee_ids?.includes(employeeId)) ||
                (employeeEmail && costReport.attendees?.includes(employeeEmail))
            ));

        if (!costReport?.isPaid || !isEligible) {
            return res.status(403).json({ error: 'Not eligible for a certificate for this training session' });
        }

        // Idempotent: return existing certificate if one was already issued
        const existing = await query(
            'SELECT * FROM internal_certificates WHERE meeting_id = ? AND employee_id = ? AND role = ?',
            [meetingId, employeeId || null, certRole]
        );
        if (existing.length > 0) {
            const c = existing[0];
            return res.json({ certNo: c.cert_no, serial: c.serial, employeeName: c.employee_name, trainingTitle: c.training_title, trainingDate: c.training_date, issuedAt: c.issued_at, role: c.role, issuedIn: formatIssuedIn(c.branch) });
        }

        let employeeBranch = null;
        try {
            const empRows = await query(
                'SELECT branch_name FROM employees WHERE id_employee = ? OR email = ? LIMIT 1',
                [employeeId || null, employeeEmail || null]
            );
            if (empRows.length > 0) employeeBranch = empRows[0].branch_name;
        } catch (e) { /* fall back to default issuedIn */ }
        const issuedIn = formatIssuedIn(employeeBranch);

        const trainingDate = meeting.date ? new Date(meeting.date) : new Date();
        const certNo = `${String(meeting.id).padStart(3, '0')}/DIR/MAN-MDN/${ROMAN_MONTHS[trainingDate.getMonth()]}/${trainingDate.getFullYear()}`;
        const serial = generateCertSerial(`${meeting.id}-${employeeId || employeeEmail}-${certRole}`);

        await query(
            'INSERT INTO internal_certificates (meeting_id, employee_id, employee_name, training_title, training_date, cert_no, serial, role, branch) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
            [meetingId, employeeId || null, employeeName, meeting.title, meeting.date, certNo, serial, certRole, employeeBranch]
        );

        res.json({ certNo, serial, employeeName, trainingTitle: meeting.title, trainingDate: meeting.date, issuedAt: new Date(), role: certRole, issuedIn });
    } catch (err) {
        console.error('[API] Error in /api/internal-certificates/issue:', err);
        res.status(500).json({ error: err.message });
    }
});

// Public verification lookup - no auth required, used by the QR code on the certificate.
app.get('/api/internal-certificates/verify/:serial', async (req, res) => {
    try {
        const rows = await query('SELECT * FROM internal_certificates WHERE serial = ?', [req.params.serial]);
        if (rows.length === 0) return res.status(404).json({ valid: false });

        const c = rows[0];
        res.json({
            valid: true,
            employeeName: c.employee_name,
            trainingTitle: c.training_title,
            trainingDate: c.training_date,
            certNo: c.cert_no,
            serial: c.serial,
            issuedAt: c.issued_at,
            role: c.role,
            issuedIn: formatIssuedIn(c.branch),
            companyName: 'PT Media Antar Nusa'
        });
    } catch (err) {
        console.error('[API] Error in /api/internal-certificates/verify:', err);
        res.status(500).json({ error: err.message });
    }
});

// Issue (or fetch existing) online-module certificate.
// Server-side re-validates the course has a final assessment and the student passed it (score >= 80),
// so this cannot be used to mint certificates for arbitrary courses/students.
app.post('/api/online-certificates/issue', async (req, res) => {
    try {
        const { courseId, userId, employeeId, employeeName } = req.body;
        if (!courseId || !userId || !employeeName) {
            return res.status(400).json({ error: 'courseId, userId and employeeName are required' });
        }

        const courses = await query('SELECT id, title, assessment_data FROM courses WHERE id = ?', [courseId]);
        if (courses.length === 0) return res.status(404).json({ error: 'Course not found' });
        const course = courses[0];

        if (!course.assessment_data) {
            return res.status(403).json({ error: 'This course has no final assessment to certify' });
        }

        // Resolve employee_id for a robust match (quiz results may be keyed by user id or employee id)
        let resolvedEmployeeId = employeeId || null;
        if (!resolvedEmployeeId) {
            const userRows = await query('SELECT employee_id FROM users WHERE id = ?', [userId]);
            resolvedEmployeeId = userRows.length > 0 ? userRows[0].employee_id : null;
        }

        const passResults = await query(
            `SELECT date FROM quiz_results
             WHERE course_id = ? AND module_id IS NULL AND quiz_type = 'POST' AND score >= 80
               AND (student_id = ? OR (employee_id IS NOT NULL AND employee_id = ?))
             ORDER BY date DESC LIMIT 1`,
            [courseId, userId, resolvedEmployeeId]
        );
        if (passResults.length === 0) {
            return res.status(403).json({ error: 'Not eligible for a certificate for this course' });
        }
        const completionDate = passResults[0].date;

        // Idempotent: return existing certificate if one was already issued
        const existing = await query(
            'SELECT * FROM online_certificates WHERE course_id = ? AND user_id = ?',
            [courseId, userId]
        );
        if (existing.length > 0) {
            const c = existing[0];
            return res.json({ certNo: c.cert_no, serial: c.serial, employeeName: c.employee_name, courseTitle: c.course_title, completionDate: c.completion_date, issuedAt: c.issued_at, issuedIn: formatIssuedIn(c.branch) });
        }

        let employeeBranch = null;
        if (resolvedEmployeeId) {
            try {
                const empRows = await query('SELECT branch_name FROM employees WHERE id_employee = ? LIMIT 1', [resolvedEmployeeId]);
                if (empRows.length > 0) employeeBranch = empRows[0].branch_name;
            } catch (e) { /* fall back to default issuedIn */ }
        }
        const issuedIn = formatIssuedIn(employeeBranch);

        const dateObj = completionDate ? new Date(completionDate) : new Date();
        const certNo = `${String(course.id).padStart(3, '0')}/DIR/MAN-MDN/${ROMAN_MONTHS[dateObj.getMonth()]}/${dateObj.getFullYear()}`;
        const serial = generateCertSerial(`online-${course.id}-${userId}`);

        await query(
            'INSERT INTO online_certificates (course_id, user_id, employee_id, employee_name, course_title, completion_date, cert_no, serial, branch) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
            [courseId, userId, resolvedEmployeeId, employeeName, course.title, completionDate, certNo, serial, employeeBranch]
        );

        res.json({ certNo, serial, employeeName, courseTitle: course.title, completionDate, issuedAt: new Date(), issuedIn });
    } catch (err) {
        console.error('[API] Error in /api/online-certificates/issue:', err);
        res.status(500).json({ error: err.message });
    }
});

// Public verification lookup - no auth required, used by the QR code on the certificate.
app.get('/api/online-certificates/verify/:serial', async (req, res) => {
    try {
        const rows = await query('SELECT * FROM online_certificates WHERE serial = ?', [req.params.serial]);
        if (rows.length === 0) return res.status(404).json({ valid: false });

        const c = rows[0];
        res.json({
            valid: true,
            employeeName: c.employee_name,
            courseTitle: c.course_title,
            completionDate: c.completion_date,
            certNo: c.cert_no,
            serial: c.serial,
            issuedAt: c.issued_at,
            issuedIn: formatIssuedIn(c.branch),
            companyName: 'PT Media Antar Nusa'
        });
    } catch (err) {
        console.error('[API] Error in /api/online-certificates/verify:', err);
        res.status(500).json({ error: err.message });
    }
});

// Strips credentials from a users row before it leaves the server - the password column is never
// needed client-side (the edit form always starts it empty and only sends a new one).
const toPublicUser = ({ password, ...rest }) => rest;

app.get('/api/users', async (req, res) => {
    try {
        const users = await query('SELECT * FROM users');
        res.json(users.map(toPublicUser));
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// SIMASSET integration routes moved up
app.get('/api/employees/positions', async (req, res) => {
    try {
        const rows = await querySimAsset(`
            SELECT DISTINCT job_position FROM employees
            WHERE deleted_at IS NULL AND job_position IS NOT NULL AND job_position <> ''
            ORDER BY job_position ASC
        `);
        res.json(rows.map(r => r.job_position));
    } catch (err) {
        console.error("[API] Error in /api/employees/positions:", err);
        res.status(500).json({ error: err.message });
    }
});

// Positions held by active employees, grouped by organization_name ({ [organization]: position[] }).
// Competency templates only carry a position, so this lets the Competency Dictionary filter by
// organization. A position can sit in several organizations (e.g. Account Manager across sales teams).
app.get('/api/employees/organization-positions', async (req, res) => {
    try {
        const rows = await querySimAsset(`
            SELECT DISTINCT organization_name, job_position FROM employees
            WHERE deleted_at IS NULL
              AND organization_name IS NOT NULL AND organization_name <> ''
              AND job_position IS NOT NULL AND job_position <> ''
            ORDER BY organization_name ASC, job_position ASC
        `);
        const grouped = {};
        for (const r of rows) (grouped[r.organization_name] ||= []).push(r.job_position);
        res.json(grouped);
    } catch (err) {
        console.error("[API] Error in /api/employees/organization-positions:", err);
        res.status(500).json({ error: err.message });
    }
});

// Every active employee company-wide, with isSupervisor - unlike /api/team-members (which is
// scoped to one leader's subordinates), this powers HR's company-wide Competency Overview.
// Must stay registered before /api/employees/:employeeId below, or Express would match
// "directory" as an :employeeId instead.
app.get('/api/employees/directory', async (req, res) => {
    try {
        const employees = await querySimAsset(
            `SELECT id_employee, full_name, job_position FROM employees
             WHERE deleted_at IS NULL AND (active_status IS NULL OR active_status != 'Resign')
               AND (status_join IS NULL OR status_join != 'Internship')
             ORDER BY full_name ASC`
        );
        const reportToSet = await getSupervisorIdentifierSet();
        const mapped = employees.map(e => ({
            employeeId: e.id_employee,
            fullName: e.full_name,
            jobPosition: e.job_position,
            isSupervisor: reportToSet.has(e.id_employee) || reportToSet.has(e.full_name)
        }));
        res.json(mapped);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/employees/:employeeId', async (req, res) => {
    try {
        const { employeeId } = req.params;
        const rows = await querySimAsset(
            'SELECT id_employee, full_name, job_position FROM employees WHERE id_employee = ?',
            [employeeId]
        );
        if (rows.length === 0) return res.status(404).json({ error: 'Employee not found' });
        const e = rows[0];
        res.json({ employeeId: e.id_employee, fullName: e.full_name, jobPosition: e.job_position });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/employees', async (req, res) => {
    console.log("[API] GET /api/employees - Fetching data from SimAsset");
    try {
        const employees = await querySimAsset(`
            SELECT e.*, b.name as branch_name 
            FROM employees e
            LEFT JOIN branches b ON e.branch_id = b.id_branch
            WHERE e.deleted_at IS NULL
            ORDER BY e.full_name ASC
        `);
        console.log(`[API] Success: Found ${employees.length} employees`);
        res.json(employees);
    } catch (err) {
        console.error("[API] Error in /api/employees:", err);
        res.status(500).json({ error: err.message });
    }
});

// Resolve employee_ids not found in the local employees table by looking them up in Nusawork.
// Used e.g. by the Training Internal import, where imported participants may not yet be synced locally.
app.post('/api/employees/resolve', async (req, res) => {
    try {
        const employeeIds = Array.isArray(req.body.employeeIds) ? req.body.employeeIds : [];
        const uniqueIds = [...new Set(employeeIds.filter(Boolean).map(String))];
        if (uniqueIds.length === 0) return res.json({ resolved: [] });

        const placeholders = uniqueIds.map(() => '?').join(', ');
        const existing = await querySimAsset(
            `SELECT id_employee FROM employees WHERE id_employee IN (${placeholders})`,
            uniqueIds
        );
        const existingIds = new Set(existing.map(e => String(e.id_employee)));
        const missingIds = uniqueIds.filter(id => !existingIds.has(id));

        if (missingIds.length === 0) return res.json({ resolved: [] });

        const token = await getNusanetToken();
        if (!token) {
            return res.status(401).json({ error: 'Nusawork authentication unavailable', resolved: [] });
        }

        const resolved = [];
        for (const id of missingIds) {
            const emp = await syncEmployeeFromNusawork(id, token);
            if (emp) resolved.push(emp);
        }

        res.json({ resolved, missingCount: missingIds.length });
    } catch (err) {
        console.error('[API] Error in /api/employees/resolve:', err);
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/branches', async (req, res) => {
    try {
        const branches = await querySimAsset('SELECT id_branch, name FROM branches WHERE deleted_at IS NULL ORDER BY name ASC');
        res.json(branches);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/users', async (req, res) => {
    try {
        const newUser = { ...req.body, id: Date.now().toString() };
        // Check exist
        const existing = await query('SELECT * FROM users WHERE email = ?', [newUser.email]);
        if (existing.length > 0) return res.status(400).json({ message: 'User already exists' });

        // Without a password the account signs in through Nusawork or Google only.
        const storedPassword = newUser.password ? await hashPassword(newUser.password) : UNUSABLE_PASSWORD;
        await query('INSERT INTO users (id, email, password, name, role, employee_id) VALUES (?, ?, ?, ?, ?, ?)',
            [newUser.id, newUser.email, storedPassword, newUser.name, newUser.role, newUser.employee_id || null]);

        res.json(toPublicUser(newUser));
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.put('/api/users/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const updates = req.body;

        // Sanitize updates to only allowed fields
        const allowedFields = ['name', 'email', 'password', 'role', 'branch', 'avatar', 'employee_id'];
        const filteredUpdates = {};

        Object.keys(updates).forEach(key => {
            if (allowedFields.includes(key)) {
                if (key === 'password' && (!updates[key] || updates[key] === '')) {
                    return; // Skip empty passwords
                }
                filteredUpdates[key] = updates[key];
            }
        });

        if (Object.keys(filteredUpdates).length === 0) {
            return res.json({ message: 'No valid fields to update' });
        }
        if (filteredUpdates.password) {
            filteredUpdates.password = await hashPassword(filteredUpdates.password);
        }

        // Construct dynamic update query
        const fields = Object.keys(filteredUpdates).map(k => `${k} = ?`).join(', ');
        const values = Object.values(filteredUpdates);

        await query(`UPDATE users SET ${fields} WHERE id = ?`, [...values, id]);

        const updated = await query('SELECT * FROM users WHERE id = ?', [id]);
        res.json(updated[0] ? toPublicUser(updated[0]) : null);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/users/:id', async (req, res) => {
    try {
        const { id } = req.params;
        await query('DELETE FROM users WHERE id = ?', [id]);
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// --- GENERAL TICKETS (IS5) ---
// Employee IDs that follow every general ticket (HR), from IS5_TICKET_FOLLOW - comma-separated.
// Unset or empty means the ticket has no followers.
const getTicketFollowEmployeeIds = () => (process.env.IS5_TICKET_FOLLOW || '')
    .split(',')
    .map(id => id.trim())
    .filter(Boolean);

// Calendar math runs in WIB (UTC+7): these Dates are shifted by 7 hours and read with getUTC*, so
// "today" and "end of month" match Jakarta regardless of the server's own timezone.
const WIB_OFFSET_MS = 7 * 60 * 60 * 1000;
const nowInWib = () => new Date(Date.now() + WIB_OFFSET_MS);
const pad2 = (n) => String(n).padStart(2, '0');
const formatWibDate = (d) => `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`;

// A general ticket is due IS5_TICKET_EXPIRED_DAYS days after it's created (default 3), as
// "YYYY-MM-DD HH:MM:SS" in WIB.
const DEFAULT_TICKET_EXPIRED_DAYS = 3;
const getTicketExpiredDays = () => {
    const days = Number(process.env.IS5_TICKET_EXPIRED_DAYS);
    return Number.isFinite(days) && days > 0 ? days : DEFAULT_TICKET_EXPIRED_DAYS;
};
const generalTicketDueDate = () => {
    const due = new Date(nowInWib().getTime() + getTicketExpiredDays() * 24 * 60 * 60 * 1000);
    return `${formatWibDate(due)} ${pad2(due.getUTCHours())}:${pad2(due.getUTCMinutes())}:${pad2(due.getUTCSeconds())}`;
};

// Link into the LMS frontend for a ticket's comment, so the recipient lands right on the record.
// Written as an HTML anchor (opens in a new tab) for IS5's comment view.
const lmsLink = (path) => `${(process.env.APP_BASE_URL || 'https://lms.nusa.id').replace(/\/+$/, '')}${path}`;
const lmsAnchor = (path, label) => `<a href="${lmsLink(path).replace(/"/g, '&quot;')}" target="_blank" rel="noopener noreferrer">${label}</a>`;

const GENERAL_TICKET_LOG_TEXT_LIMIT = 10000;

// IS5's ticket number from a successful response - the created ticket comes back under `data`:
// { "title": "Berhasil", "message": "Berhasil membuat General Ticket", "data": { "id": 384309, "subject": ..., ... } }
// data.ticketId / a top-level ticketId are still accepted, as earlier samples of the response had them.
const extractGeneralTicketId = (data) => {
    if (!data || typeof data !== 'object') return null;
    const ticketId = data.data?.id ?? data.data?.ticketId ?? data.ticketId;
    return ticketId != null && ticketId !== '' && typeof ticketId !== 'object' ? String(ticketId).slice(0, 100) : null;
};

// Records one send attempt in general_ticket_logs. Never throws - a logging failure must not turn a
// ticket IS5 accepted into an error, or block the flow that raised it.
const logGeneralTicket = async ({ kind, reference, ticketPic, ticketId = null, subject, requestBody, status, httpStatus = null, responseBody = null, errorMessage = null }) => {
    const clip = (v) => v == null ? null : String(v).slice(0, GENERAL_TICKET_LOG_TEXT_LIMIT);
    try {
        await query(
            `INSERT INTO general_ticket_logs (kind, reference, ticket_pic, ticket_id, subject, request_body, status, http_status, response_body, error_message)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [kind, reference ? String(reference).slice(0, 100) : null, ticketPic != null ? String(ticketPic) : null, ticketId,
             subject ? String(subject).slice(0, 500) : null, clip(JSON.stringify(requestBody)), status, httpStatus,
             clip(typeof responseBody === 'string' ? responseBody : JSON.stringify(responseBody)), clip(errorMessage)]
        );
    } catch (err) {
        console.error('[GENERAL TICKET] Failed to write general_ticket_logs:', err.message);
    }
};

// Master switch for every IS5 general ticket (FITUR_GENERAL_TICKET=true in .env). Off - or unset -
// means no ticket is sent from any flow; the per-reminder *_ENABLED flags only apply when it's on.
const isGeneralTicketEnabled = () => process.env.FITUR_GENERAL_TICKET === 'true';

// Creates a General Ticket (GT) in IS5. `ticketPic` is the employee the ticket is for; the followers
// come from IS5_TICKET_FOLLOW. `kind` and `reference` only label the attempt in general_ticket_logs
// (e.g. 'idp_import' / 'idp:57'). Throws with IS5's response message if the ticket is rejected.
const createGeneralTicket = async ({ kind = 'manual', reference = null, subject, comment, timeExpired, priorityId = 1, ticketPic }) => {
    const url = process.env.IS5_GENERAL_TICKET_URL || 'https://legacy.is5.nusa.net.id/api/client/v1/general-tickets/';
    const apiKey = process.env.IS5_API_KEY;
    const requestBody = {
        subject,
        comment,
        time_expired: timeExpired,
        priority_id: priorityId,
        ticket_pic: String(ticketPic),
        ticket_follow: getTicketFollowEmployeeIds()
    };
    const log = (fields) => logGeneralTicket({ kind, reference, ticketPic, subject, requestBody, ...fields });

    // Callers check isGeneralTicketEnabled() first; this only catches one that doesn't.
    if (!isGeneralTicketEnabled()) {
        await log({ status: 'FAILED', errorMessage: 'General tickets are disabled (FITUR_GENERAL_TICKET is not true)' });
        throw new Error('General tickets are disabled (FITUR_GENERAL_TICKET is not true)');
    }
    if (!apiKey) {
        await log({ status: 'FAILED', errorMessage: 'IS5_API_KEY is not configured' });
        throw new Error('IS5_API_KEY is not configured');
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000);
    let response;
    let text = null;
    try {
        response = await fetch(url, {
            method: 'POST',
            headers: { 'X-Api-Key': apiKey, 'Content-Type': 'application/json', 'Accept': 'application/json' },
            body: JSON.stringify(requestBody),
            signal: controller.signal
        });
        text = await response.text();
    } catch (err) {
        // fetch's own message is just "fetch failed" - the cause says why (ECONNREFUSED, ENOTFOUND, ...).
        const message = err.name === 'AbortError'
            ? 'IS5 did not respond within 15 seconds'
            : `Could not reach IS5: ${err.cause?.code || err.cause?.message || err.message}`;
        await log({ status: 'FAILED', errorMessage: message });
        throw new Error(message);
    } finally {
        clearTimeout(timeoutId);
    }

    let data;
    try { data = text ? JSON.parse(text) : null; } catch { data = text; }
    if (!response.ok) {
        const message = (data && typeof data === 'object' && (data.message || data.error)) || text || response.statusText;
        const err = new Error(`IS5 rejected the general ticket (${response.status}): ${message}`);
        err.status = response.status;
        err.details = data;
        await log({ status: 'FAILED', httpStatus: response.status, responseBody: text, errorMessage: err.message });
        throw err;
    }
    const ticketId = extractGeneralTicketId(data);
    if (!ticketId) console.warn('[GENERAL TICKET] Created, but no ticket id found in the IS5 response - see general_ticket_logs.response_body.');
    await log({ status: 'SUCCESS', httpStatus: response.status, responseBody: text, ticketId });
    return data;
};

// Sends a scheduled reminder ticket at most once per (kind, recipient, period): the row in
// general_ticket_reminders is claimed first so a concurrent or repeated run skips it, and released
// again if IS5 rejects the ticket so the next run retries. Returns true only when a ticket was sent.
const sendReminderTicketOnce = async ({ kind, recipientEmployeeId, period, refIds = [], ticket }) => {
    const claim = await query(
        'INSERT IGNORE INTO general_ticket_reminders (kind, recipient_employee_id, period, ref_ids) VALUES (?, ?, ?, ?)',
        [kind, String(recipientEmployeeId), period, refIds.join(',')]
    );
    if (claim.affectedRows === 0) return false;
    try {
        await createGeneralTicket({ ...ticket, kind, reference: period, ticketPic: String(recipientEmployeeId) });
        return true;
    } catch (err) {
        await query('DELETE FROM general_ticket_reminders WHERE kind = ? AND recipient_employee_id = ? AND period = ?',
            [kind, String(recipientEmployeeId), period]);
        throw err;
    }
};

// Runs a reminder job now and then hourly. Only started when its *_ENABLED flag is "true" (see
// initDB above), so a dev machine on a copy of production data never sends real tickets.
const REMINDER_CHECK_INTERVAL_MS = 60 * 60 * 1000;
const scheduleReminderJob = (label, job) => {
    if (!isGeneralTicketEnabled()) {
        console.warn(`[${label}] Enabled, but FITUR_GENERAL_TICKET is not true - reminders are disabled.`);
        return;
    }
    if (!process.env.IS5_API_KEY) {
        console.warn(`[${label}] Enabled, but IS5_API_KEY is not set - reminders are disabled.`);
        return;
    }
    console.log(`[${label}] Reminders enabled (checked hourly).`);
    const run = () => job().catch(err => console.error(`[${label}] Reminder run failed:`, err.message));
    run();
    setInterval(run, REMINDER_CHECK_INTERVAL_MS);
};

const TICKET_DATETIME_RE = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/;

// Body: { subject, comment, time_expired?: "YYYY-MM-DD HH:MM:SS", priority_id?, ticket_pic? }
// time_expired defaults to IS5_TICKET_EXPIRED_DAYS (3) days from now, ticket_pic to the signed-in user's employee ID;
// followers always come from IS5_TICKET_FOLLOW.
app.post('/api/general-tickets', async (req, res) => {
    try {
        if (!isGeneralTicketEnabled()) {
            return res.status(503).json({ success: false, message: 'General tickets are disabled (FITUR_GENERAL_TICKET is not true)' });
        }
        const { subject, comment, time_expired, priority_id, ticket_pic } = req.body || {};
        if (!subject || !comment) {
            return res.status(400).json({ success: false, message: 'subject and comment are required' });
        }
        const timeExpired = time_expired || generalTicketDueDate();
        if (!TICKET_DATETIME_RE.test(String(timeExpired))) {
            return res.status(400).json({ success: false, message: 'time_expired must be "YYYY-MM-DD HH:MM:SS"' });
        }
        const ticketPic = ticket_pic || req.user.employee_id;
        if (!ticketPic) {
            return res.status(400).json({ success: false, message: 'ticket_pic is required (your account has no employee ID)' });
        }
        const ticket = await createGeneralTicket({
            kind: 'manual',
            reference: `user:${req.user.id}`,
            subject,
            comment,
            timeExpired,
            priorityId: Number(priority_id) || 1,
            ticketPic
        });
        res.json({ success: true, ticket });
    } catch (err) {
        console.error('[GENERAL TICKET] Failed to create:', err.message);
        res.status(err.status ? 502 : 500).json({ success: false, message: err.message, details: err.details });
    }
});

const parseFlexibleDate = (timestamp) => {
    if (!timestamp || typeof timestamp !== 'string') return null;
    try {
        const parts = timestamp.split(' ');
        const dateStr = parts[0];
        const timeStr = parts[1] || '00:00:00';

        const dateParts = dateStr.split('/');
        if (dateParts.length !== 3) return new Date(timestamp); // Fallback

        let month, day, year;
        // Detect if parts[0] is month or day (assuming D/M/YYYY or M/D/YYYY)
        if (parseInt(dateParts[0]) > 12) {
            day = dateParts[0];
            month = dateParts[1];
            year = dateParts[2];
        } else if (parseInt(dateParts[1]) > 12) {
            month = dateParts[0];
            day = dateParts[1];
            year = dateParts[2];
        } else {
            // Ambiguous, assume D/M/YYYY for SIMAS
            day = dateParts[0];
            month = dateParts[1];
            year = dateParts[2];
        }

        const isoDate = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}T${timeStr}`;
        const d = new Date(isoDate);
        return isNaN(d.getTime()) ? null : d;
    } catch (e) {
        return null;
    }
};

app.post('/api/simas/sync', async (req, res) => {
    try {
        const { employee_id, user_name } = req.body;

        const baseUrl = process.env.SIMAS_API_BASE_URL || 'https://simas.nusa.id/';
        let url = `${baseUrl}api/book/loan`;
        const apiKey = process.env.SIMAS_API_KEY || '';
        const response = await fetch(url, { headers: { 'x-api-key': apiKey } });

        if (!response.ok) return res.status(response.status).json({ error: 'Failed to fetch from SIMAS loans' });

        const dataJson = await response.json();
        if (dataJson.success && dataJson.data && dataJson.data.length > 0) {
            const simasData = dataJson.data[0];

            // Get users to sync
            let usersToSync = [];
            if (employee_id && employee_id !== 'all') {
                usersToSync.push({ employee_id, name: user_name });
            } else {
                // Sync all users from DB that have employee_id
                const allUsers = await query('SELECT employee_id, name FROM users WHERE employee_id IS NOT NULL AND employee_id != ""');
                usersToSync = allUsers;
            }

            console.log(`[SIMAS SYNC] Found ${usersToSync.length} users to potential sync. SIMAS keys: ${Object.keys(simasData).length}`);

            for (const targetUser of usersToSync) {
                const targetEid = (targetUser.employee_id || '').trim();
                const targetName = targetUser.name;

                if (targetEid && simasData[targetEid]) {
                    const empLoans = simasData[targetEid].bookLoans;
                    if (empLoans) {
                        console.log(`[SIMAS SYNC] Syncing ${targetName} (${targetEid}) - ${Object.keys(empLoans).length} books`);
                        for (const uuid of Object.keys(empLoans)) {
                            const b = empLoans[uuid];
                            if (!b.loanHistory || !b.loanHistory.loaning) continue;

                            const sn = b.code;
                            const startDateRaw = b.loanHistory.loaning.loanPeriod;
                            const startDate = parseFlexibleDate(startDateRaw);

                            if (!startDate) {
                                console.warn(`[SIMAS SYNC] Invalid date for ${targetName}: ${startDateRaw}`);
                                continue;
                            }

                            const isReturned = b.loanHistory.return && b.loanHistory.return.returnTime;
                            const finishDateRaw = isReturned ? b.loanHistory.return.returnTime : null;
                            const finishDate = finishDateRaw ? parseFlexibleDate(finishDateRaw) : null;

                            // Check if exists
                            const existing = await query('SELECT * FROM reading_logs WHERE source = ? AND employee_id = ? AND sn = ? AND start_date = ?',
                                ['SIMAS', targetEid, sn, startDate]);

                            if (existing.length === 0) {
                                console.log(`[SIMAS SYNC] Inserting new book for ${targetName}: ${b.name}`);
                                await query(
                                    'INSERT IGNORE INTO reading_logs (title, author, category, date, review, status, user_name, employee_id, evidence_url, return_evidence_url, start_date, finish_date, hr_approval_status, link, sn, location, source) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
                                    [
                                        b.name, '', normalizeReadingLogCategory(b.subCategory, { source: 'SIMAS' }), startDate,
                                        isReturned ? (b.loanHistory.return.linkReview || '') : '',
                                        isReturned ? 'Finished' : 'Reading',
                                        targetName, targetEid, b.loanHistory.loaning.loanPhoto || '',
                                        isReturned ? (b.loanHistory.return.returnPhoto || '') : '',
                                        startDate, finishDate,
                                        isReturned ? 'Draft' : null,
                                        isReturned ? (b.loanHistory.return.linkReview || '') : '',
                                        sn, 'Kantor', 'SIMAS'
                                    ]
                                );
                            } else {
                                const log = existing[0];
                                if (log.status !== 'Cancelled' && log.status === 'Reading' && isReturned) {
                                    console.log(`[SIMAS SYNC] Updating book to Finished for ${targetName}: ${b.name}`);
                                    await query(
                                        'UPDATE reading_logs SET status = ?, finish_date = ?, return_evidence_url = ?, link = ?, review = ?, hr_approval_status = ? WHERE id = ?',
                                        ['Finished', finishDate, b.loanHistory.return.returnPhoto || '', b.loanHistory.return.linkReview || '', b.loanHistory.return.linkReview || '', 'Draft', log.id]
                                    );
                                    // Update local record representation for accurate comparison afterward
                                    log.status = 'Finished';
                                    log.return_evidence_url = b.loanHistory.return.returnPhoto || '';
                                }

                                if (log.status !== 'Cancelled') {
                                    const simasEvidencePhoto = b.loanHistory.loaning.loanPhoto || '';
                                    const simasReturnEvidencePhoto = isReturned ? (b.loanHistory.return.returnPhoto || '') : '';

                                    const dbEvidencePhoto = log.evidence_url || '';
                                    const dbReturnEvidencePhoto = log.return_evidence_url || '';

                                    const updates = {};
                                    if (dbEvidencePhoto !== simasEvidencePhoto) {
                                        updates.evidence_url = simasEvidencePhoto;
                                    }
                                    if (isReturned && dbReturnEvidencePhoto !== simasReturnEvidencePhoto) {
                                        updates.return_evidence_url = simasReturnEvidencePhoto;
                                    }

                                    const updateKeys = Object.keys(updates);
                                    if (updateKeys.length > 0) {
                                        console.log(`[SIMAS SYNC] Updating photos for ${targetName} - ${b.name}:`, updates);
                                        const setClause = updateKeys.map(key => `${key} = ?`).join(', ');
                                        const params = updateKeys.map(key => updates[key]);
                                        params.push(log.id);
                                        await query(`UPDATE reading_logs SET ${setClause} WHERE id = ?`, params);
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
        res.json({ success: true });
    } catch (err) {
        console.error("[SIMAS SYNC ERROR]", err);
        res.status(500).json({ error: err.message });
    }
});

// --- READING LOGS ROUTES ---
app.get('/api/logs', async (req, res) => {
    try {
        // Migration safeguard: Check if column exists
        try {
            const columns = await query('SHOW COLUMNS FROM reading_logs LIKE "cancelled_by"');
            if (columns.length === 0) {
                console.log("[MIGRATION] Adding missing cancelled_by column...");
                await query('ALTER TABLE reading_logs ADD cancelled_by VARCHAR(255) DEFAULT NULL');
                console.log("[MIGRATION] Column added successfully!");
            }
        } catch (migErr) {
            console.error("[MIGRATION ERROR DETAILS]", migErr.message);
            // Attempt to create a test table to check permissions
            try { await query('CREATE TABLE IF NOT EXISTS migration_test (id INT)'); } catch (e) { console.error("[PERMISSION TEST] Failed to create table:", e.message); }
        }

        const logs = await query('SELECT * FROM reading_logs ORDER BY date DESC');
        // Map snake_case to camelCase
        const mappedLogs = logs.map(log => ({
            ...log,
            userName: log.user_name,
            employee_id: log.employee_id,
            readingDuration: log.reading_duration,
            startDate: log.start_date,
            finishDate: log.finish_date,
            evidenceUrl: log.evidence_url,
            returnEvidenceUrl: log.return_evidence_url,
            hrApprovalStatus: log.hr_approval_status,
            incentiveAmount: log.incentive_amount,
            rejectionReason: log.rejection_reason,
            approvedBy: log.approved_by,
            sn: log.sn,
            approvedAt: log.approved_at,
            plannedFinishDate: log.planned_finish_date,
            cancelledAt: log.cancelled_at,
            cancelledBy: log.cancelled_by,
            claimedAt: log.claimed_at
        }));
        if (logs.length > 0) {
            res.setHeader('X-Debug-Columns', Object.keys(logs[0]).join(','));
        }
        res.json(mappedLogs);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/logs', async (req, res) => {
    try {
        const log = req.body;
        console.log("[POST LOG] Received:", JSON.stringify(log, null, 2));

        if (log.hrApprovalStatus === 'Pending' && isIncentiveEligibleCategory(log.category)) {
            const withinLimit = await isUnderIncentiveClaimLimit(log.employee_id, log.userName, log.finishDate || log.date);
            if (!withinLimit) {
                return res.status(400).json({ error: 'Incentive claim limit reached (5 per year).' });
            }
        }

        const result = await query(
            'INSERT INTO reading_logs (title, author, category, date, duration, review, status, user_name, employee_id, evidence_url, start_date, finish_date, reading_duration, hr_approval_status, link, sn, planned_finish_date, location, source, claimed_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
            [
                log.title,
                log.author || '',
                log.category,
                new Date(log.date),
                log.duration || 0,
                log.review || '',
                log.status || 'Reading',
                log.userName,
                log.employee_id,
                log.evidenceUrl || '',
                log.startDate ? new Date(log.startDate) : new Date(),
                log.finishDate ? new Date(log.finishDate) : null,
                log.readingDuration || 0,
                log.hrApprovalStatus || 'Pending',
                log.link || '',
                log.sn || null,
                log.plannedFinishDate ? new Date(log.plannedFinishDate) : (log.finishDate ? new Date(log.finishDate) : null),
                log.location || '',
                log.source || '',
                log.hrApprovalStatus === 'Pending' ? new Date() : null
            ]
        );
        const newLogs = await query('SELECT * FROM reading_logs WHERE id = ?', [result.insertId]);
        const newLog = newLogs[0];
        reconcileReadingLogNusawork(newLog.id);

        // Return camelCase
        res.json({
            ...newLog,
            userName: newLog.user_name,
            readingDuration: newLog.reading_duration,
            startDate: newLog.start_date,
            finishDate: newLog.finish_date,
            evidenceUrl: newLog.evidence_url,
            hrApprovalStatus: newLog.hr_approval_status,
            incentiveAmount: newLog.incentive_amount,
            rejectionReason: newLog.rejection_reason,
            sn: newLog.sn,
            approvedAt: newLog.approved_at,
            plannedFinishDate: newLog.planned_finish_date,
            cancelledAt: newLog.cancelled_at,
            claimedAt: newLog.claimed_at
        });
    } catch (err) {
        console.error("[POST LOG ERROR]", err);
        res.status(500).json({ error: err.message });
    }
});

app.patch('/api/logs/:id/cancel', async (req, res) => {
    try {
        const { reason, cancelledBy } = req.body;
        const finalReason = reason || 'Dibatalkan oleh Admin';
        const finalBy = cancelledBy || 'System/Admin';

        console.log(`[CANCEL] ID: ${req.params.id}, Reason: ${finalReason}, By: ${finalBy}`);

        const result = await query(
            'UPDATE reading_logs SET status = "Cancelled", hr_approval_status = "Cancelled", rejection_reason = ?, cancelled_at = ?, cancelled_by = ? WHERE id = ?',
            [finalReason, new Date(), finalBy, req.params.id]
        );

        console.log(`[CANCEL] Update result:`, result);
        reconcileReadingLogNusawork(req.params.id);
        res.json({ success: true });
    } catch (err) {
        console.error("[CANCEL LOG ERROR]", err);
        res.status(500).json({ error: err.message });
    }
});

app.delete('/api/logs/:id', async (req, res) => {
    try {
        // Soft delete: status Cancelled
        await query('UPDATE reading_logs SET status = "Cancelled", hr_approval_status = "Cancelled", cancelled_at = ? WHERE id = ?', [new Date(), req.params.id]);
        reconcileReadingLogNusawork(req.params.id);
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

const getLocalTime = () => {
    const now = new Date();
    const offset = 7 * 60; // UTC+7 (Western Indonesia Time)
    const localTime = new Date(now.getTime() + offset * 60 * 1000);
    return localTime;
};


app.put('/api/logs/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const updates = req.body;

        // Manual mapping for updates if needed, or simple direct mapping if keys match
        // But keys won't match. Frontend sends camelCase.
        // We need to construct snake_case update
        const dbUpdates = {};
        if (updates.userName !== undefined) dbUpdates.user_name = updates.userName;
        if (updates.employee_id !== undefined) dbUpdates.employee_id = updates.employee_id;
        if (updates.readingDuration !== undefined) dbUpdates.reading_duration = updates.readingDuration;
        if (updates.startDate !== undefined) dbUpdates.start_date = new Date(updates.startDate);
        if (updates.finishDate !== undefined) dbUpdates.finish_date = new Date(updates.finishDate);
        if (updates.evidenceUrl !== undefined) dbUpdates.evidence_url = updates.evidenceUrl;
        if (updates.returnEvidenceUrl !== undefined) dbUpdates.return_evidence_url = updates.returnEvidenceUrl;
        if (updates.hrApprovalStatus !== undefined) dbUpdates.hr_approval_status = updates.hrApprovalStatus;
        if (updates.incentiveAmount !== undefined) dbUpdates.incentive_amount = updates.incentiveAmount;
        if (updates.rejectionReason !== undefined) dbUpdates.rejection_reason = updates.rejectionReason;
        if (updates.approvedBy !== undefined) dbUpdates.approved_by = updates.approvedBy;
        if (updates.sn !== undefined) dbUpdates.sn = updates.sn;
        if (updates.approvedAt !== undefined) dbUpdates.approved_at = new Date(updates.approvedAt);
        if (updates.plannedFinishDate !== undefined) dbUpdates.planned_finish_date = new Date(updates.plannedFinishDate);
        if (updates.cancelledAt !== undefined) dbUpdates.cancelled_at = new Date(updates.cancelledAt);
        if (updates.cancelledBy !== undefined) dbUpdates.cancelled_by = updates.cancelledBy;
        if (updates.location !== undefined) dbUpdates.location = updates.location;
        if (updates.source !== undefined) dbUpdates.source = updates.source;
        if (updates.category !== undefined) dbUpdates.category = updates.category;

        // Auto set approved_at if status changes to Approved
        if (updates.hrApprovalStatus === 'Approved') {
            dbUpdates.approved_at = new Date();
        }
        // Auto set claimed_at if status changes to Pending (Claimed)
        if (updates.hrApprovalStatus === 'Pending') {
            const currentLogs = await query('SELECT employee_id, user_name, category, finish_date, date FROM reading_logs WHERE id = ?', [id]);
            if (currentLogs.length === 0) return res.status(404).json({ error: 'Reading log not found' });
            const currentLog = currentLogs[0];
            const category = updates.category !== undefined ? updates.category : currentLog.category;
            if (isIncentiveEligibleCategory(category)) {
                const withinLimit = await isUnderIncentiveClaimLimit(currentLog.employee_id, currentLog.user_name, currentLog.finish_date || currentLog.date);
                if (!withinLimit) {
                    return res.status(400).json({ error: 'Incentive claim limit reached (5 per year).' });
                }
            }
            dbUpdates.claimed_at = new Date();
        }
        if (updates.status !== undefined) dbUpdates.status = updates.status;
        if (updates.review !== undefined) dbUpdates.review = updates.review;
        if (updates.link !== undefined) dbUpdates.link = updates.link;

        // If no valid fields, just return current
        if (Object.keys(dbUpdates).length === 0) {
            const current = await query('SELECT * FROM reading_logs WHERE id = ?', [id]);
            return res.json(current[0]); // Should map this too, but for now safe
        }

        const fields = Object.keys(dbUpdates).map(k => `${k} = ?`).join(', ');
        const values = Object.values(dbUpdates);

        console.log(`[API] Updating Reading Log ${id}:`, dbUpdates);

        await query(`UPDATE reading_logs SET ${fields} WHERE id = ?`, [...values, id]);
        // Awaited (unlike the fire-and-forget elsewhere) so a Nusawork sync failure can be reported
        // back to the admin who just clicked Save, instead of only ever showing up in the server log.
        const nusaworkSync = await reconcileReadingLogNusawork(id);

        const updatedLogs = await query('SELECT * FROM reading_logs WHERE id = ?', [id]);
        if (!updatedLogs || updatedLogs.length === 0) {
            return res.status(404).json({ error: 'Reading log not found after update' });
        }

        const updated = updatedLogs[0];

        res.json({
            ...updated,
            userName: updated.user_name,
            readingDuration: updated.reading_duration,
            startDate: updated.start_date,
            finishDate: updated.finish_date,
            evidenceUrl: updated.evidence_url,
            hrApprovalStatus: updated.hr_approval_status,
            incentiveAmount: updated.incentive_amount,
            rejectionReason: updated.rejection_reason,
            cancelledAt: updated.cancelled_at,
            cancelledBy: updated.cancelled_by,
            claimedAt: updated.claimed_at,
            nusaworkSync
        });
    } catch (err) {
        console.error(`[API ERROR] Update Reading Log ${req.params.id} Failed:`, err);
        res.status(500).json({ error: err.message });
    }
});

// --- NEW BOOKS BORROW/RETURN ENDPOINTS ---
app.post('/api/books/borrow', async (req, res) => {
    try {
        const { title, category, location, source, evidenceUrl, userName } = req.body;

        // Validation
        if (!title || !category || !userName) {
            return res.status(400).json({ error: 'Missing required fields' });
        }

        const now = new Date();
        const result = await query(
            'INSERT INTO reading_logs (title, category, location, source, user_name, employee_id, evidence_url, start_date, date, status, hr_approval_status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
            [title, category, location, source, userName, req.body.employee_id, evidenceUrl, now, now, 'Reading', 'Pending']
        );

        const newLogs = await query('SELECT * FROM reading_logs WHERE id = ?', [result.insertId]);
        const newLog = newLogs[0];

        res.json({
            ...newLog,
            userName: newLog.user_name,
            startDate: newLog.start_date,
            evidenceUrl: newLog.evidence_url,
            hrApprovalStatus: newLog.hr_approval_status
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/books/return', async (req, res) => {
    try {
        const { id, review, link, evidenceUrl, readingDuration, startDate, finishDate } = req.body;

        if (!id) return res.status(400).json({ error: 'Log ID is required' });

        const finishDateObj = finishDate ? new Date(finishDate) : new Date();

        const existingLogs = await query('SELECT employee_id, user_name, category FROM reading_logs WHERE id = ?', [id]);
        if (existingLogs.length === 0) return res.status(404).json({ error: 'Log not found' });
        const existingLog = existingLogs[0];
        if (isIncentiveEligibleCategory(existingLog.category)) {
            const withinLimit = await isUnderIncentiveClaimLimit(existingLog.employee_id, existingLog.user_name, finishDateObj);
            if (!withinLimit) {
                return res.status(400).json({ error: 'Incentive claim limit reached (5 per year).' });
            }
        }

        // Prepare SQL and params. If startDate is provided, update it too.
        let sql = 'UPDATE reading_logs SET status = ?, finish_date = ?, review = ?, link = ?, evidence_url = ?, reading_duration = ?, hr_approval_status = ?';
        const params = ['Finished', finishDateObj, review, link || '', evidenceUrl, readingDuration || 0, 'Pending'];

        if (startDate) {
            sql += ', start_date = ?';
            params.push(new Date(startDate));
        }

        sql += ' WHERE id = ?';
        params.push(id);

        await query(sql, params);
        reconcileReadingLogNusawork(id);

        const updatedLogs = await query('SELECT * FROM reading_logs WHERE id = ?', [id]);
        if (updatedLogs.length === 0) return res.status(404).json({ error: 'Log not found' });

        const updated = updatedLogs[0];

        res.json({
            ...updated,
            userName: updated.user_name,
            readingDuration: updated.reading_duration,
            startDate: updated.start_date,
            finishDate: updated.finish_date,
            evidenceUrl: updated.evidence_url,
            hrApprovalStatus: updated.hr_approval_status,
            incentiveAmount: updated.incentive_amount,
            rejectionReason: updated.rejection_reason,
            sn: updated.sn,
            approvedBy: updated.approved_by,
            approvedAt: updated.approved_at,
            plannedFinishDate: updated.planned_finish_date
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: err.message });
    }
});

// --- TRAINING REQUESTS ---
app.get('/api/training', async (req, res) => {
    try {
        const requests = await query('SELECT * FROM training_requests ORDER BY submitted_at DESC');
        // Rename rejection_reason to rejectionReason for frontend compatibility if needed, or update frontend.
        // For now, let's map in code if strictly needed, but snake_case vs camelCase might be an issue.
        // Frontend likely expects camelCase.
        // Map snake_case DB columns to camelCase for frontend
        const mapped = requests.map(mapTrainingRequest);
        res.json(mapped);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/training', async (req, res) => {
    try {
        const reqData = req.body;
        const submittedAt = new Date();
        const result = await query(
            'INSERT INTO training_requests (title, vendor, cost, date, status, submitted_at, employee_name, employee_id, employee_role, cost_training, cost_transport, cost_accommodation, cost_others, justification, evidence_url) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
            [
                reqData.title,
                reqData.vendor,
                reqData.cost,
                new Date(reqData.date),
                reqData.status || 'PENDING_SUPERVISOR',
                submittedAt,
                reqData.employeeName,
                reqData.employee_id,
                reqData.employeeRole,
                reqData.costTraining || 0,
                reqData.costTransport || 0,
                reqData.costAccommodation || 0,
                reqData.costOthers || 0,
                reqData.reason || '',
                reqData.evidenceUrl || ''
            ]
        );
        const newReq = await query('SELECT * FROM training_requests WHERE id = ?', [result.insertId]);
        const r = newReq[0];
        res.json(mapTrainingRequest(newReq[0]));
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/training/:id/approve', async (req, res) => {
    try {
        const { id } = req.params;
        const { action, reason, approverName } = req.body;

        // Fetch current status first
        const currentRows = await query('SELECT status FROM training_requests WHERE id = ?', [id]);
        if (currentRows.length === 0) return res.status(404).json({ message: 'Not found' });

        let newStatus = currentRows[0].status;
        let updateSql = '';
        let params = [];
        const now = new Date();

        if (action === 'reject') {
            newStatus = 'REJECTED';
            // We can track who rejected it based on current stage
            // If currently PENDING_SUPERVISOR, then Supervisor rejected.
            // If PENDING_HR, then HR rejected.
            if (currentRows[0].status === 'PENDING_SUPERVISOR') {
                updateSql = 'UPDATE training_requests SET status = ?, rejection_reason = ?, supervisor_name = ? WHERE id = ?';
                params = [newStatus, reason, approverName, id];
            } else {
                updateSql = 'UPDATE training_requests SET status = ?, rejection_reason = ?, hr_name = ? WHERE id = ?';
                params = [newStatus, reason, approverName, id];
            }
        } else if (action === 'approve') {
            if (newStatus === 'PENDING_SUPERVISOR') {
                newStatus = 'PENDING_HR';
                updateSql = 'UPDATE training_requests SET status = ?, supervisor_name = ?, supervisor_approved_at = ? WHERE id = ?';
                params = [newStatus, approverName, now, id];
            }
            else if (newStatus === 'PENDING_HR') {
                newStatus = 'APPROVED';

                // Check if cost updates are provided (HR editing costs)
                // We expect these in req.body: cost, costTraining, costTransport, costAccommodation, costOthers
                const { cost, costTraining, costTransport, costAccommodation, costOthers } = req.body;

                if (cost !== undefined) {
                    updateSql = 'UPDATE training_requests SET status = ?, hr_name = ?, hr_approved_at = ?, cost = ?, cost_training = ?, cost_transport = ?, cost_accommodation = ?, cost_others = ? WHERE id = ?';
                    params = [
                        newStatus,
                        approverName,
                        now,
                        cost,
                        costTraining || 0,
                        costTransport || 0,
                        costAccommodation || 0,
                        costOthers || 0,
                        id
                    ];
                } else {
                    updateSql = 'UPDATE training_requests SET status = ?, hr_name = ?, hr_approved_at = ? WHERE id = ?';
                    params = [newStatus, approverName, now, id];
                }
            }
        }

        if (updateSql) {
            await query(updateSql, params);
        }

        const updated = await query('SELECT * FROM training_requests WHERE id = ?', [id]);
        const r = updated[0];
        res.json(mapTrainingRequest(updated[0]));
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// --- MEETINGS ---
app.get('/api/meetings', async (req, res) => {
    try {
        const meetings = await query('SELECT * FROM meetings WHERE deleted_at IS NULL');
        const mapped = meetings.map(m => ({
            ...m,
            description: m.agenda, // Map agenda to description for frontend
            guests: m.guests_json ? (typeof m.guests_json === 'string' ? JSON.parse(m.guests_json) : m.guests_json) : undefined,
            costReport: m.cost_report_json ? (typeof m.cost_report_json === 'string' ? JSON.parse(m.cost_report_json) : m.cost_report_json) : undefined,
            pre_test_data: m.pre_test_data ? (typeof m.pre_test_data === 'string' ? JSON.parse(m.pre_test_data) : m.pre_test_data) : undefined,
            post_test_data: m.post_test_data ? (typeof m.post_test_data === 'string' ? JSON.parse(m.post_test_data) : m.post_test_data) : undefined,
            feedback_data: m.feedback_data ? (typeof m.feedback_data === 'string' ? JSON.parse(m.feedback_data) : m.feedback_data) : undefined
        }));
        res.json(mapped);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// Recently deleted meetings, used only to notify the host that their session was removed.
app.get('/api/meetings/deleted', async (req, res) => {
    try {
        const meetings = await query('SELECT id, title, date, host, employee_id, deleted_at FROM meetings WHERE deleted_at IS NOT NULL ORDER BY deleted_at DESC');
        res.json(meetings);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/meetings', async (req, res) => {
    try {
        const m = req.body;
        // Prepare guests JSON
        let guests = m.guests || { status: 'Awaiting', count: 0, emails: [] };
        if (!guests.emails) guests.emails = [];

        // Convert date to local YYYY-MM-DD
        const d = new Date(m.date);
        const localDate = new Date(d.getTime() + 7 * 60 * 60 * 1000).toISOString().split('T')[0];

        // A session with no pre-test/post-test has nothing left to gate the feedback form on, so it
        // opens right away instead of sitting locked until the host remembers to flip it on manually.
        const hasPreTest = Array.isArray(m.pre_test_data?.questions) && m.pre_test_data.questions.length > 0;
        const hasPostTest = Array.isArray(m.post_test_data?.questions) && m.post_test_data.questions.length > 0;
        const feedbackStartsActive = !hasPreTest && !hasPostTest;

        const result = await query(
            'INSERT INTO meetings (title, date, time, host, location, type, meetLink, agenda, guests_json, cost_report_json, employee_id, competency_type, competency_name, training_gr_type, pre_test_link, material_link, post_test_link, feedback_link, pre_test_data, post_test_data, feedback_data, is_pre_test_active, is_post_test_active, is_feedback_active, is_closed, pte_form_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
            [
                m.title,
                localDate,
                m.time,
                m.host || 'HR Team',
                m.location,
                m.type || 'Offline',
                m.meetLink || '',
                m.description || m.agenda || '',
                JSON.stringify(guests),
                null,
                m.employee_id,
                m.competency_type || null,
                m.competency_name || null,
                m.training_gr_type || null,
                m.pre_test_link || '',
                m.material_link || '',
                m.post_test_link || '',
                m.feedback_link || '',
                m.pre_test_data ? JSON.stringify(m.pre_test_data) : null,
                m.post_test_data ? JSON.stringify(m.post_test_data) : null,
                m.feedback_data ? JSON.stringify(m.feedback_data) : null,
                0,
                0,
                feedbackStartsActive ? 1 : 0,
                0,
                m.pte_form_id || null
            ]
        );

        await syncMeetingClosedAt(result.insertId);
        const newMeeting = { ...m, id: result.insertId, guests };

        if (guests.emails.length > 0) {
            sendMeetingInvite(newMeeting, guests.emails).catch(e => console.error(e));
        }

        res.json(newMeeting);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// Google Drive "view" links aren't stable for direct embedding (unofficial thumbnail endpoint
// gets rate-limited, ~429). Download the file once at import time and re-host it locally instead.
const downloadDriveImageToUploads = async (driveUrl) => {
    const match = driveUrl.match(/drive\.google\.com\/file\/d\/([a-zA-Z0-9_-]+)/) || driveUrl.match(/drive\.google\.com\/.*[?&]id=([a-zA-Z0-9_-]+)/);
    if (!match) return null;
    const fileId = match[1];

    try {
        const response = await fetch(`https://drive.google.com/uc?export=download&id=${fileId}`);
        if (!response.ok) {
            console.warn(`[DRIVE IMPORT] Failed to download Drive file ${fileId}: status ${response.status}`);
            return null;
        }
        const contentType = response.headers.get('content-type') || '';
        if (!contentType.startsWith('image/')) {
            console.warn(`[DRIVE IMPORT] Drive file ${fileId} is not an image (content-type: ${contentType}), skipping.`);
            return null;
        }
        const ext = contentType.split('/')[1]?.split(';')[0] || 'jpg';
        const filename = `${Date.now()}-${Math.round(Math.random() * 1e9)}.${ext}`;
        const buffer = Buffer.from(await response.arrayBuffer());
        fs.writeFileSync(path.join(UPLOADS_DIR, filename), buffer);
        return `/api/uploads/${filename}`;
    } catch (e) {
        console.warn(`[DRIVE IMPORT] Error downloading Drive file ${fileId}:`, e.message);
        return null;
    }
};

// Same idea as downloadDriveImageToUploads, but for certificates: unlike training photos, certificates are
// legitimately either images OR PDFs. Google's download endpoint reports both as a generic
// application/octet-stream, so the real type is read from the Content-Disposition filename instead.
const downloadDriveCertificateToUploads = async (driveUrl) => {
    const match = driveUrl.match(/drive\.google\.com\/file\/d\/([a-zA-Z0-9_-]+)/) || driveUrl.match(/drive\.google\.com\/.*[?&]id=([a-zA-Z0-9_-]+)/);
    if (!match) return null;
    const fileId = match[1];

    try {
        const response = await fetch(`https://drive.google.com/uc?export=download&id=${fileId}`);
        if (!response.ok) {
            console.warn(`[DRIVE IMPORT] Failed to download Drive certificate ${fileId}: status ${response.status}`);
            return null;
        }
        const disposition = response.headers.get('content-disposition') || '';
        const nameMatch = disposition.match(/filename="?([^";]+)"?/);
        const nameExt = nameMatch ? path.extname(nameMatch[1]).replace('.', '').toLowerCase() : '';
        const contentType = response.headers.get('content-type') || '';
        const ext = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'pdf'].includes(nameExt)
            ? nameExt
            : (contentType.startsWith('image/') ? contentType.split('/')[1]?.split(';')[0] : contentType === 'application/pdf' ? 'pdf' : null);
        if (!ext) {
            console.warn(`[DRIVE IMPORT] Drive certificate ${fileId} is not an image or PDF (content-type: ${contentType}), skipping.`);
            return null;
        }
        const filename = `${Date.now()}-${Math.round(Math.random() * 1e9)}.${ext}`;
        const buffer = Buffer.from(await response.arrayBuffer());
        fs.writeFileSync(path.join(UPLOADS_DIR, filename), buffer);
        return `/api/uploads/${filename}`;
    } catch (e) {
        console.warn(`[DRIVE IMPORT] Error downloading Drive certificate ${fileId}:`, e.message);
        return null;
    }
};

// Runs `worker` over `items` with at most `limit` in flight at once, preserving input order in the result array.
const runWithConcurrency = async (items, limit, worker) => {
    const results = new Array(items.length);
    let next = 0;
    const lanes = Array.from({ length: Math.min(limit, items.length) }, async () => {
        while (next < items.length) {
            const i = next++;
            results[i] = await worker(items[i]);
        }
    });
    await Promise.all(lanes);
    return results;
};

app.post('/api/meetings/bulk', async (req, res) => {
    try {
        const meetings = req.body.meetings;
        if (!Array.isArray(meetings)) return res.status(400).json({ error: 'Expected an array of meetings' });

        const insertOne = async (m) => {
            if (m.cost_report?.trainingPhotos?.includes('drive.google.com')) {
                const localPath = await downloadDriveImageToUploads(m.cost_report.trainingPhotos);
                if (localPath) m.cost_report.trainingPhotos = localPath;
            }

            const participants = Array.isArray(m.participants) ? m.participants : [];
            let guests = {
                status: 'Awaiting',
                count: participants.length,
                employee_ids: participants.map(p => p.employee_id).filter(Boolean),
                emails: [],
                details: participants
            };

            const d = new Date(m.date);
            let localDate;
            if (isNaN(d.getTime())) {
                localDate = new Date().toISOString().split('T')[0];
            } else {
                localDate = new Date(d.getTime() + 7 * 60 * 60 * 1000).toISOString().split('T')[0];
            }

            const result = await query(
                'INSERT INTO meetings (title, date, time, host, location, type, meetLink, agenda, guests_json, cost_report_json, employee_id, competency_type, competency_name, training_gr_type, pre_test_link, material_link, post_test_link, feedback_link, pre_test_data, post_test_data, feedback_data, is_pre_test_active, is_post_test_active, is_feedback_active, is_closed) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
                [
                    m.title || 'Untitled',
                    localDate,
                    m.time || '',
                    m.host || 'HR Team',
                    m.location || '',
                    m.type || 'Offline',
                    m.meetLink || '',
                    m.description || m.agenda || '',
                    JSON.stringify(guests),
                    m.cost_report ? JSON.stringify(m.cost_report) : null,
                    m.employee_id || null,
                    m.competency_type || null,
                    m.competency_name || null,
                    m.training_gr_type || null,
                    m.pre_test_link || '',
                    m.material_link || '',
                    m.post_test_link || '',
                    m.feedback_link || '',
                    m.pre_test_data ? JSON.stringify(m.pre_test_data) : null,
                    m.post_test_data ? JSON.stringify(m.post_test_data) : null,
                    m.feedback_data ? JSON.stringify(m.feedback_data) : null,
                    m.is_pre_test_active ? 1 : 0,
                    m.is_post_test_active ? 1 : 0,
                    m.is_feedback_active ? 1 : 0,
                    m.is_closed ? 1 : 0
                ]
            );

            const meetingId = result.insertId;

            const participantQueries = [];
            for (const p of participants) {
                if (!p.employee_id && !p.name) continue;
                const studentId = p.employee_id || `temp_${Math.random()}`;
                const studentName = p.name || 'Unknown';

                if (p.pre_test_score !== null && p.pre_test_score !== '') {
                    participantQueries.push(query('INSERT INTO quiz_results (student_id, student_name, meeting_id, score, date, quiz_type, employee_id) VALUES (?, ?, ?, ?, NOW(), "PRE", ?)', [studentId, studentName, meetingId, p.pre_test_score, p.employee_id || null]));
                }
                if (p.post_test_score !== null && p.post_test_score !== '') {
                    participantQueries.push(query('INSERT INTO quiz_results (student_id, student_name, meeting_id, score, date, quiz_type, employee_id) VALUES (?, ?, ?, ?, NOW(), "POST", ?)', [studentId, studentName, meetingId, p.post_test_score, p.employee_id || null]));
                }
                if (p.feedback_score !== null && p.feedback_score !== '') {
                    const fbData = JSON.stringify({ rating: p.feedback_score });
                    participantQueries.push(query('INSERT INTO course_feedback (user_id, employee_id, meeting_id, feedback_data, submitted_at, is_imported) VALUES (?, ?, ?, ?, NOW(), 1) ON DUPLICATE KEY UPDATE feedback_data = ?, submitted_at = NOW(), is_imported = 1', [studentId, p.employee_id || null, meetingId, fbData, fbData]));
                }
            }
            await Promise.all(participantQueries);

            return { ...m, id: meetingId };
        };

        // Bounded concurrency instead of one-row-at-a-time: on the live DB (remote host),
        // per-row network round-trip latency was multiplying out past nginx's proxy_read_timeout
        // (504 Gateway Timeout on large imports).
        const inserted = await runWithConcurrency(meetings, 5, insertOne);
        res.json({ success: true, count: inserted.length, meetings: inserted });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// Aggregate-only feedback completion counts for a meeting - no per-person answers, so this is
// safe to show any participant (unlike /api/meetings/summary/:id below, which also returns every
// participant's raw feedback/quiz text and stays host/HR-only on the client for that reason).
app.get('/api/meetings/completion-summary/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const meetings = await query('SELECT guests_json FROM meetings WHERE id = ?', [id]);
        if (meetings.length === 0) return res.status(404).json({ error: 'Meeting not found' });

        let guests = null;
        try { guests = meetings[0].guests_json ? JSON.parse(meetings[0].guests_json) : null; } catch (e) { }

        let totalParticipants = 0;
        if (Array.isArray(guests?.emails) && guests.emails.length > 0) totalParticipants = guests.emails.length;
        else if (Array.isArray(guests?.employee_ids) && guests.employee_ids.length > 0) totalParticipants = guests.employee_ids.length;
        else if (Array.isArray(guests?.details) && guests.details.length > 0) totalParticipants = guests.details.length;
        else if (guests?.count) totalParticipants = guests.count;

        const feedbackRows = await query('SELECT COUNT(*) as cnt FROM course_feedback WHERE meeting_id = ?', [id]);
        const completed = feedbackRows[0]?.cnt || 0;

        res.json({ totalParticipants, completed, notCompleted: Math.max(0, totalParticipants - completed) });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/meetings/summary/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const quizResults = await query('SELECT quiz_type, COUNT(*) as count FROM quiz_results WHERE meeting_id = ? GROUP BY quiz_type', [id]);
        const feedbackResults = await query('SELECT COUNT(*) as count FROM course_feedback WHERE meeting_id = ?', [id]);

        const allQuizResults = await query('SELECT * FROM quiz_results WHERE meeting_id = ?', [id]);
        const allFeedbackResults = await query('SELECT * FROM course_feedback WHERE meeting_id = ?', [id]);

        res.json({
            quiz: quizResults,
            feedback: feedbackResults[0]?.count || 0,
            allQuizResults,
            allFeedbackResults
        });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// New endpoint for export - get all quiz results for a meeting without user filter
app.get('/api/quiz/results/meeting-all/:meetingId', async (req, res) => {
    try {
        const { meetingId } = req.params;
        const results = await query(
            'SELECT id, student_id, student_name, meeting_id, score, date, quiz_type as quizType, employee_id FROM quiz_results WHERE meeting_id = ? ORDER BY date DESC',
            [meetingId]
        );
        res.json(results);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// New endpoint to fetch single meeting by ID (for participant auto-refresh)
app.get('/api/meetings/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const meetings = await query('SELECT * FROM meetings WHERE id = ?', [id]);

        if (!meetings || meetings.length === 0) {
            return res.status(404).json({ error: 'Meeting not found' });
        }

        const m = meetings[0];
        // Return same format as PUT endpoint for consistency
        res.json({
            ...m,
            description: m.agenda,
            guests: m.guests_json ? (typeof m.guests_json === 'string' ? JSON.parse(m.guests_json) : m.guests_json) : undefined,
            costReport: m.cost_report_json ? (typeof m.cost_report_json === 'string' ? JSON.parse(m.cost_report_json) : m.cost_report_json) : undefined,
            pre_test_data: m.pre_test_data ? (typeof m.pre_test_data === 'string' ? JSON.parse(m.pre_test_data) : m.pre_test_data) : undefined,
            post_test_data: m.post_test_data ? (typeof m.post_test_data === 'string' ? JSON.parse(m.post_test_data) : m.post_test_data) : undefined,
            feedback_data: m.feedback_data ? (typeof m.feedback_data === 'string' ? JSON.parse(m.feedback_data) : m.feedback_data) : undefined
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.put('/api/meetings/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const m = req.body;

        // This endpoint is shared by several flows that each only send the fields they own (Edit
        // Session sends just the session-detail fields; toggling a test/feedback switch or marking
        // Paid sends the full previously-loaded meeting object). Fetching the full previous row and
        // falling back to it for any key the request omits means a partial save - e.g. editing the
        // location - can never silently blank out cost_report_json/attendance/toggles it never
        // touched, which a blind "missing field -> default" UPDATE used to do.
        const previousRows = await query('SELECT * FROM meetings WHERE id = ?', [id]);
        const previousMeeting = previousRows[0];
        if (!previousMeeting) return res.status(404).json({ error: 'Meeting not found' });
        const has = (key) => Object.prototype.hasOwnProperty.call(m, key) && m[key] !== undefined;

        // Prepare guests JSON
        const guests = has('guests') ? m.guests : (previousMeeting.guests_json ? JSON.parse(previousMeeting.guests_json) : { status: 'Awaiting', count: 0, emails: [] });

        // Prepare Cost Report JSON - kept parsed (not just passed through raw) since the Paid
        // transition check below needs the object either way.
        const costReport = has('costReport') ? m.costReport : (previousMeeting.cost_report_json ? JSON.parse(previousMeeting.cost_report_json) : null);

        // Convert date to local YYYY-MM-DD, only when a new date was actually sent.
        const localDate = has('date')
            ? (() => { const d = new Date(m.date); return new Date(d.getTime() + 7 * 60 * 60 * 1000).toISOString().split('T')[0]; })()
            : previousMeeting.date;

        const wasPaid = !!(previousMeeting.cost_report_json && (() => {
            try { return JSON.parse(previousMeeting.cost_report_json)?.isPaid; } catch (e) { return false; }
        })());

        const finalPteFormId = has('pte_form_id') ? (m.pte_form_id || null) : previousMeeting.pte_form_id;

        await query(
            'UPDATE meetings SET title = ?, date = ?, time = ?, host = ?, location = ?, type = ?, meetLink = ?, agenda = ?, guests_json = ?, cost_report_json = ?, employee_id = ?, competency_type = ?, competency_name = ?, training_gr_type = ?, pre_test_link = ?, material_link = ?, post_test_link = ?, feedback_link = ?, pre_test_data = ?, post_test_data = ?, feedback_data = ?, is_pre_test_active = ?, is_post_test_active = ?, is_feedback_active = ?, is_closed = ?, pte_form_id = ? WHERE id = ?',
            [
                has('title') ? m.title : previousMeeting.title,
                localDate,
                has('time') ? m.time : previousMeeting.time,
                has('host') ? (m.host || 'HR Team') : previousMeeting.host,
                has('location') ? m.location : previousMeeting.location,
                has('type') ? (m.type || 'Offline') : previousMeeting.type,
                has('meetLink') ? (m.meetLink || '') : previousMeeting.meetLink,
                has('description') || has('agenda') ? (m.description || m.agenda || '') : previousMeeting.agenda,
                JSON.stringify(guests),
                costReport ? JSON.stringify(costReport) : null,
                has('employee_id') ? m.employee_id : previousMeeting.employee_id,
                has('competency_type') ? (m.competency_type || null) : previousMeeting.competency_type,
                has('competency_name') ? (m.competency_name || null) : previousMeeting.competency_name,
                has('training_gr_type') ? (m.training_gr_type || null) : previousMeeting.training_gr_type,
                has('pre_test_link') ? (m.pre_test_link || '') : previousMeeting.pre_test_link,
                has('material_link') ? (m.material_link || '') : previousMeeting.material_link,
                has('post_test_link') ? (m.post_test_link || '') : previousMeeting.post_test_link,
                has('feedback_link') ? (m.feedback_link || '') : previousMeeting.feedback_link,
                has('pre_test_data') ? (m.pre_test_data ? JSON.stringify(m.pre_test_data) : null) : previousMeeting.pre_test_data,
                has('post_test_data') ? (m.post_test_data ? JSON.stringify(m.post_test_data) : null) : previousMeeting.post_test_data,
                has('feedback_data') ? (m.feedback_data ? JSON.stringify(m.feedback_data) : null) : previousMeeting.feedback_data,
                has('is_pre_test_active') ? (m.is_pre_test_active ? 1 : 0) : previousMeeting.is_pre_test_active,
                has('is_post_test_active') ? (m.is_post_test_active ? 1 : 0) : previousMeeting.is_post_test_active,
                has('is_feedback_active') ? (m.is_feedback_active ? 1 : 0) : previousMeeting.is_feedback_active,
                has('is_closed') ? (m.is_closed ? 1 : 0) : previousMeeting.is_closed,
                finalPteFormId,
                id
            ]
        );
        await syncMeetingClosedAt(id);

        // The linked Post Training Evaluation template only goes live once this session is Paid.
        // Deliberately not gated on "just transitioned to Paid" (wasPaid) - HR can attach or swap
        // the PTE form via Edit Session well after a session was already marked Paid, and that
        // form must still go live, not silently stay DRAFT forever. Re-publishing an already-
        // published form is a harmless no-op, so this can safely fire on every save of a Paid
        // session that has a form linked. Fire-and-forget, same as the Nusawork sync below.
        if (costReport?.isPaid && finalPteFormId) {
            query("UPDATE post_training_evaluation_forms SET status = 'PUBLISHED' WHERE id = ? AND deleted_at IS NULL", [finalPteFormId])
                .then(() => console.log(`[PTE] Published form ${finalPteFormId} - meeting ${id} is Paid.`))
                .catch(e => console.error('[PTE] Failed to publish linked form on Paid:', e.message));
        }

        const updated = await query('SELECT * FROM meetings WHERE id = ?', [id]);
        const r = updated[0];

        // Don't block the save on Nusawork calls - reconcile Paid-status/attendee/cost changes
        // against whatever notes were already pushed for this meeting.
        if (previousMeeting) {
            const previousSync = getMeetingSyncData(previousMeeting);
            const currentSync = getMeetingSyncData(r);
            syncInternalTrainingNotes({
                meetingId: Number(id),
                title: r.title,
                date: r.date instanceof Date ? r.date.toISOString().slice(0, 10) : String(r.date).slice(0, 10),
                previous: previousSync,
                current: currentSync
            });
        }

        res.json({
            ...r,
            description: r.agenda,
            guests: r.guests_json ? (typeof r.guests_json === 'string' ? JSON.parse(r.guests_json) : r.guests_json) : undefined,
            costReport: r.cost_report_json ? (typeof r.cost_report_json === 'string' ? JSON.parse(r.cost_report_json) : r.cost_report_json) : undefined,
            pre_test_data: r.pre_test_data ? (typeof r.pre_test_data === 'string' ? JSON.parse(r.pre_test_data) : r.pre_test_data) : undefined,
            post_test_data: r.post_test_data ? (typeof r.post_test_data === 'string' ? JSON.parse(r.post_test_data) : r.post_test_data) : undefined,
            feedback_data: r.feedback_data ? (typeof r.feedback_data === 'string' ? JSON.parse(r.feedback_data) : r.feedback_data) : undefined
        });

    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/meetings/:id', async (req, res) => {
    try {
        const meetingId = req.params.id;

        // Grab any Nusawork notes pushed for this meeting (Paid Internal Training) before removing
        // the tracking rows, so they can be deleted from Nusawork too.
        const trainingNoteRows = await query(
            'SELECT employee_id, id_group FROM nusawork_training_notes WHERE meeting_id = ?',
            [meetingId]
        );

        // Meetings has no FK cascade to these tables, so clean them up explicitly
        // to avoid leaving orphaned quiz/feedback/certificate rows behind.
        await query('DELETE FROM quiz_results WHERE meeting_id = ?', [meetingId]);
        await query('DELETE FROM course_feedback WHERE meeting_id = ?', [meetingId]);
        await query('DELETE FROM internal_certificates WHERE meeting_id = ?', [meetingId]);
        await query('DELETE FROM nusawork_training_notes WHERE meeting_id = ?', [meetingId]);
        const evalFormRows = await query('SELECT id FROM post_training_evaluation_forms WHERE meeting_id = ?', [meetingId]);
        for (const f of evalFormRows) {
            await query('DELETE FROM post_training_evaluation_responses WHERE form_id = ?', [f.id]);
            await query('DELETE FROM post_training_evaluation_questions WHERE form_id = ?', [f.id]);
        }
        await query('DELETE FROM post_training_evaluation_forms WHERE meeting_id = ?', [meetingId]);
        // Soft delete: keep the row (hidden from every listing via deleted_at IS NULL filters)
        // so the host can still be notified about the removal.
        await query('UPDATE meetings SET deleted_at = ? WHERE id = ?', [new Date(), meetingId]);

        if (trainingNoteRows.length > 0) {
            console.log(`[NUSAWORK TRAINING SYNC] Meeting ${meetingId} deleted - removing ${trainingNoteRows.length} note(s) from Nusawork.`);
            trainingNoteRows.forEach(row => {
                deleteNusaworkNote({ employeeId: row.employee_id, idGroup: row.id_group });
            });
        }

        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// --- POST TRAINING EVALUATION ---
// HR builds/manages Likert-scale (1-4) evaluation form templates here. Not yet wired to any
// Internal Training meeting/attendee/supervisor flow - meeting_id and the attendee-facing
// endpoints below are dormant scaffolding for that future flow, kept so it doesn't need to be
// rebuilt from scratch once that's ready to turn on.

// 1. HR: list every form template.
app.get('/api/post-training-evaluations', async (req, res) => {
    try {
        const forms = await query(`
            SELECT f.*, m.title AS meeting_title, m.date AS meeting_date, m.guests_json, m.cost_report_json
            FROM post_training_evaluation_forms f
            LEFT JOIN meetings m ON f.meeting_id = m.id
            WHERE f.deleted_at IS NULL
            ORDER BY f.created_at DESC
        `);

        const enriched = await Promise.all(forms.map(async (f) => {
            const meetings = await getFormMeetings(f);
            const attendeeIdLists = await Promise.all(meetings.map(m => getMeetingAttendeeEmployeeIds(m)));
            const attendeeIds = [...new Set(attendeeIdLists.flat())];
            const responseCountRows = await query('SELECT COUNT(*) as cnt FROM post_training_evaluation_responses WHERE form_id = ?', [f.id]);
            return {
                id: f.id,
                meetingId: f.meeting_id,
                meetingTitle: f.meeting_title,
                meetingDate: f.meeting_date,
                category: f.category,
                title: f.title,
                status: f.status,
                createdBy: f.created_by,
                createdAt: f.created_at,
                totalAttendees: attendeeIds.length,
                responseCount: responseCountRows[0].cnt
            };
        }));

        res.json(enriched);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// Distinct competency labels used across every question so far, so the form builder can offer
// them as autocomplete suggestions instead of HR retyping "Teknikal" etc. from scratch each time.
app.get('/api/post-training-evaluations/competency-labels', async (req, res) => {
    try {
        const rows = await query(
            "SELECT DISTINCT competency_label FROM post_training_evaluation_questions WHERE competency_label IS NOT NULL AND competency_label != '' ORDER BY competency_label ASC"
        );
        res.json(rows.map(r => r.competency_label));
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// Distinct form categories used so far (e.g. "Teknikal", "Sales", "Umum"), same autocomplete
// purpose as competency-labels above but for the form-level category field.
app.get('/api/post-training-evaluations/categories', async (req, res) => {
    try {
        const rows = await query(
            "SELECT DISTINCT category FROM post_training_evaluation_forms WHERE category IS NOT NULL AND category != '' AND deleted_at IS NULL ORDER BY category ASC"
        );
        res.json(rows.map(r => r.category));
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// Every response system-wide, each pre-reduced to its average SCALE score - lets the Internal
// Training recap show an "AVG PTE" column per session/participant the same way it already shows
// AVG FEEDBACK, without the recap view needing to know how a PTE score is computed.
app.get('/api/post-training-evaluations/responses/all', async (req, res) => {
    try {
        const responses = await query('SELECT form_id, meeting_id, external_training_request_id, evaluatee_employee_id, answers, submitted_at FROM post_training_evaluation_responses');
        if (responses.length === 0) return res.json([]);

        const formIds = [...new Set(responses.map(r => r.form_id))];
        const placeholders = formIds.map(() => '?').join(',');
        const scaleRows = await query(
            `SELECT form_id, id FROM post_training_evaluation_questions WHERE form_id IN (${placeholders}) AND type = 'SCALE'`,
            formIds
        );
        const scaleIdsByForm = {};
        scaleRows.forEach(r => {
            if (!scaleIdsByForm[r.form_id]) scaleIdsByForm[r.form_id] = [];
            scaleIdsByForm[r.form_id].push(String(r.id));
        });

        const result = responses.map(r => {
            let averageScore = null;
            try {
                const answers = typeof r.answers === 'string' ? JSON.parse(r.answers) : r.answers;
                const scaleIds = scaleIdsByForm[r.form_id] || [];
                const scores = scaleIds.map(qId => Number(answers?.[qId])).filter(v => !isNaN(v));
                if (scores.length > 0) averageScore = Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 10) / 10;
            } catch (e) { }
            return {
                formId: r.form_id,
                meetingId: r.meeting_id,
                externalTrainingRequestId: r.external_training_request_id,
                evaluateeEmployeeId: r.evaluatee_employee_id,
                averageScore,
                submittedAt: r.submitted_at
            };
        });

        res.json(result);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// A supervisor's pending queue: every (published form, attendee) pair where the attendee reports
// to this leader and no response has been submitted yet. Mirrors the External Training
// /subordinates endpoint's shape (server.js findSubordinateEmployeeIds usage above).
app.get('/api/post-training-evaluations/subordinates', async (req, res) => {
    try {
        const { leader_id } = req.query;
        if (!leader_id) return res.json([]);

        const subordinateIds = await filterActiveEmployeeIds(await findSubordinateEmployeeIds(leader_id));
        if (subordinateIds.length === 0) return res.json([]);

        const forms = await query(`
            SELECT f.*, m.title AS meeting_title, m.date AS meeting_date, m.is_closed AS meeting_is_closed, m.guests_json, m.cost_report_json
            FROM post_training_evaluation_forms f
            LEFT JOIN meetings m ON f.meeting_id = m.id
            WHERE f.status = 'PUBLISHED' AND f.deleted_at IS NULL
        `);

        // Returns every (form, subordinate) pair regardless of submission status - "Active" (not yet
        // submitted) vs "Closed" (already submitted) is a client-side split on the `submitted` flag,
        // so this stays the one source of truth for both tabs.
        const items = [];
        for (const form of forms) {
            const meetings = await getFormMeetings(form);
            const externalTrainingRequests = await getFormExternalTrainingRequests(form);
            if (meetings.length === 0 && externalTrainingRequests.length === 0) continue;

            const responses = await query(
                'SELECT meeting_id, external_training_request_id, evaluatee_employee_id, submitted_at, answers FROM post_training_evaluation_responses WHERE form_id = ?',
                [form.id]
            );
            // Keyed by meeting_id + evaluatee, not evaluatee alone - a reused template means the
            // same person can have one response per meeting, and each must stay independent.
            const responseByMeetingAndEvaluatee = {};
            const responseByExtAndEvaluatee = {};
            responses.forEach(r => {
                if (r.meeting_id) responseByMeetingAndEvaluatee[`${r.meeting_id}-${r.evaluatee_employee_id}`] = r;
                else if (r.external_training_request_id) responseByExtAndEvaluatee[`${r.external_training_request_id}-${r.evaluatee_employee_id}`] = r;
            });

            // Only SCALE questions count toward the average score shown for a closed evaluation -
            // an open-text answer has no numeric value to average in.
            const scaleQuestionRows = await query(
                "SELECT id FROM post_training_evaluation_questions WHERE form_id = ? AND type = 'SCALE'",
                [form.id]
            );
            const scaleQuestionIds = scaleQuestionRows.map(q => String(q.id));
            const averageScoreOf = (response) => {
                if (!response) return null;
                try {
                    const answers = typeof response.answers === 'string' ? JSON.parse(response.answers) : response.answers;
                    const scores = scaleQuestionIds.map(qId => Number(answers?.[qId])).filter(v => !isNaN(v));
                    return scores.length > 0 ? Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 10) / 10 : null;
                } catch (e) { return null; }
            };

            // A reused form template spans multiple meetings, so each meeting's attendees are
            // resolved (and reported with that meeting's own title/date) separately - a subordinate
            // who attended two different sessions using the same template shows up as two items.
            for (const meeting of meetings) {
                // PTE3 (behavior-change evaluation) opens to the leader as soon as the training is
                // marked closed - no longer gated on a fixed 30 days from the training date, so the
                // leader isn't left waiting once the session has actually wrapped up. The leader then
                // has 30 days from here to fill it in; a separate, not-yet-built API is responsible
                // for flagging one that's gone unfilled past that window (GT).
                if (!meeting.is_closed) continue;

                const attendeeIds = await getMeetingAttendeeEmployeeIds(meeting);
                const matchingSubordinates = attendeeIds.filter(empId => subordinateIds.includes(empId));
                if (matchingSubordinates.length === 0) continue;

                const placeholders = matchingSubordinates.map(() => '?').join(',');
                const userRows = await query(`SELECT employee_id, name FROM users WHERE employee_id IN (${placeholders})`, matchingSubordinates);
                const nameByEmployeeId = {};
                userRows.forEach(u => { nameByEmployeeId[u.employee_id] = u.name; });

                matchingSubordinates.forEach(empId => {
                    const response = responseByMeetingAndEvaluatee[`${meeting.id}-${empId}`];
                    items.push({
                        formId: form.id,
                        formTitle: form.title,
                        meetingId: meeting.id,
                        meetingTitle: meeting.title,
                        meetingDate: meeting.date,
                        externalTrainingRequestId: null,
                        externalTrainingTitle: null,
                        externalTrainingDate: null,
                        evaluateeEmployeeId: empId,
                        evaluateeName: nameByEmployeeId[empId] || empId,
                        submitted: !!response,
                        submittedAt: response ? response.submitted_at : null,
                        averageScore: averageScoreOf(response)
                    });
                });
            }

            // External Training equivalent of the meeting loop above - an ETR always has exactly one
            // "attendee" (the requester), and "closed" is the request being fully Processed by HR
            // (there's no separate close step like a meeting's is_closed).
            for (const etr of externalTrainingRequests) {
                if (etr.status !== 'Processed') continue;
                if (!subordinateIds.includes(etr.employee_id)) continue;

                const response = responseByExtAndEvaluatee[`${etr.id}-${etr.employee_id}`];
                items.push({
                    formId: form.id,
                    formTitle: form.title,
                    meetingId: null,
                    meetingTitle: null,
                    meetingDate: null,
                    externalTrainingRequestId: etr.id,
                    externalTrainingTitle: etr.title,
                    externalTrainingDate: etr.end_date,
                    evaluateeEmployeeId: etr.employee_id,
                    evaluateeName: etr.employee_name || etr.employee_id,
                    submitted: !!response,
                    submittedAt: response ? response.submitted_at : null,
                    averageScore: averageScoreOf(response)
                });
            }
        }

        res.json(items);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// --- POST TRAINING EVALUATION REMINDERS (IS5 general tickets) ---
// A leader has PTE_FILL_WINDOW_DAYS from when a training closes (meeting closed_at / external request
// processed_at) to evaluate their attendees; PTE_REMINDER_DAYS_BEFORE_DEADLINE before that runs out,
// every leader who still has someone unevaluated gets ONE ticket per training naming them. Same
// forms, attendees and "submitted" rule as GET /api/post-training-evaluations/subordinates.
const PTE_FILL_WINDOW_DAYS = 30;
const PTE_REMINDER_DAYS_BEFORE_DEADLINE = 7;
const DAY_MS = 24 * 60 * 60 * 1000;

const runPteReminders = async () => {
    const remindAfterMs = (PTE_FILL_WINDOW_DAYS - PTE_REMINDER_DAYS_BEFORE_DEADLINE) * DAY_MS;
    const isDueForReminder = (startedAt) => startedAt && Date.now() - new Date(startedAt).getTime() >= remindAfterMs;

    const forms = await query(`
        SELECT f.*, m.title AS meeting_title, m.date AS meeting_date, m.is_closed AS meeting_is_closed, m.guests_json, m.cost_report_json
        FROM post_training_evaluation_forms f
        LEFT JOIN meetings m ON f.meeting_id = m.id
        WHERE f.status = 'PUBLISHED' AND f.deleted_at IS NULL
    `);

    // Every training still awaiting evaluations whose reminder point has passed.
    const trainings = [];
    for (const form of forms) {
        const meetings = (await getFormMeetings(form)).filter(m => m.is_closed);
        const closedAtById = new Map();
        if (meetings.length > 0) {
            const rows = await query(`SELECT id, closed_at FROM meetings WHERE id IN (${meetings.map(() => '?').join(',')})`, meetings.map(m => m.id));
            rows.forEach(r => closedAtById.set(r.id, r.closed_at));
        }
        const externalTrainingRequests = (await getFormExternalTrainingRequests(form)).filter(etr => etr.status === 'Processed');

        const responses = await query(
            'SELECT meeting_id, external_training_request_id, evaluatee_employee_id FROM post_training_evaluation_responses WHERE form_id = ?',
            [form.id]
        );
        const submitted = new Set(responses.map(r => r.meeting_id
            ? `m${r.meeting_id}-${r.evaluatee_employee_id}`
            : `e${r.external_training_request_id}-${r.evaluatee_employee_id}`));

        for (const meeting of meetings) {
            const closedAt = closedAtById.get(meeting.id);
            if (!isDueForReminder(closedAt)) continue;
            const pending = (await getMeetingAttendeeEmployeeIds(meeting)).filter(id => !submitted.has(`m${meeting.id}-${id}`));
            if (pending.length > 0) {
                trainings.push({ key: `f${form.id}-m${meeting.id}`, title: meeting.title, date: meeting.date, startedAt: closedAt, evaluateeIds: pending });
            }
        }
        for (const etr of externalTrainingRequests) {
            if (!isDueForReminder(etr.processed_at) || submitted.has(`e${etr.id}-${etr.employee_id}`)) continue;
            trainings.push({ key: `f${form.id}-e${etr.id}`, title: etr.title, date: etr.end_date, startedAt: etr.processed_at, evaluateeIds: [etr.employee_id] });
        }
    }
    if (trainings.length === 0) return;

    const employees = await querySimAsset(
        `SELECT id_employee, user_id, full_name, nickname, id_report_to, id_report_to_value, active_status, status_join, deleted_at
         FROM employees`
    );
    const employeeById = new Map(employees.map(e => [String(e.id_employee), e]));
    const leaders = employees.filter(l => l.id_employee && !l.deleted_at && isActiveNonIntern(l));

    for (const training of trainings) {
        // Resigned evaluatees drop out, same as filterActiveEmployeeIds on the leader's PTE page.
        const evaluatees = training.evaluateeIds
            .map(id => employeeById.get(String(id)))
            .filter(e => e && e.active_status !== 'Resign');

        const byLeader = new Map();
        for (const evaluatee of evaluatees) {
            for (const leader of leaders) {
                if (leader.id_employee === evaluatee.id_employee || !reportsToLeader(evaluatee, leader)) continue;
                if (!byLeader.has(leader.id_employee)) byLeader.set(leader.id_employee, { leader, evaluatees: [] });
                byLeader.get(leader.id_employee).evaluatees.push(evaluatee);
            }
        }

        const deadlineLabel = formatIndoDate(new Date(new Date(training.startedAt).getTime() + PTE_FILL_WINDOW_DAYS * DAY_MS));
        const trainingDateLabel = formatIndoDate(training.date) || '-';
        for (const [leaderId, { leader, evaluatees: pending }] of byLeader) {
            const names = pending.map(e => `- ${e.full_name} (${e.id_employee})`);
            try {
                const sent = await sendReminderTicketOnce({
                    kind: 'pte',
                    recipientEmployeeId: leaderId,
                    period: training.key,
                    refIds: pending.map(e => e.id_employee),
                    ticket: {
                        subject: `Pengingat Post Training Evaluation: ${training.title}`,
                        comment: `Halo ${leader.full_name}, Post Training Evaluation untuk training "${training.title}" (${trainingDateLabel}) belum Anda isi untuk anggota tim berikut:\n${names.join('\n')}\n\nBatas pengisian ${deadlineLabel}. Mohon isi di LMS (menu Post Training Evaluation Tim).\n\n${lmsAnchor('/training/pte-team', 'Buka Post Training Evaluation Tim')}`,
                        timeExpired: generalTicketDueDate(),
                        priorityId: 1
                    }
                });
                if (sent) console.log(`[PTE GT] Reminder sent to ${leader.full_name} for "${training.title}" (${names.length} employee(s)).`);
            } catch (err) {
                console.error(`[PTE GT] Reminder for ${leader.full_name} ("${training.title}") failed:`, err.message);
            }
        }
    }
};

// Staff self-service: every (form, meeting) pair where the caller was themselves an attendee -
// mirrors /subordinates above but scoped to one employee_id instead of a leader's whole team, and
// never returns other attendees' answers/scores.
app.get('/api/post-training-evaluations/mine', async (req, res) => {
    try {
        const { employee_id } = req.query;
        if (!employee_id) return res.json([]);

        const forms = await query(`
            SELECT f.*, m.title AS meeting_title, m.date AS meeting_date, m.is_closed AS meeting_is_closed, m.guests_json, m.cost_report_json
            FROM post_training_evaluation_forms f
            LEFT JOIN meetings m ON f.meeting_id = m.id
            WHERE f.status = 'PUBLISHED' AND f.deleted_at IS NULL
        `);

        const items = [];
        for (const form of forms) {
            const meetings = await getFormMeetings(form);
            const externalTrainingRequests = await getFormExternalTrainingRequests(form);
            if (meetings.length === 0 && externalTrainingRequests.length === 0) continue;

            const responses = await query(
                'SELECT meeting_id, external_training_request_id, submitted_at, answers FROM post_training_evaluation_responses WHERE form_id = ? AND evaluatee_employee_id = ?',
                [form.id, employee_id]
            );
            const responseByMeeting = {};
            const responseByExt = {};
            responses.forEach(r => {
                if (r.meeting_id) responseByMeeting[r.meeting_id] = r;
                else if (r.external_training_request_id) responseByExt[r.external_training_request_id] = r;
            });

            const scaleQuestionRows = await query(
                "SELECT id FROM post_training_evaluation_questions WHERE form_id = ? AND type = 'SCALE'",
                [form.id]
            );
            const scaleQuestionIds = scaleQuestionRows.map(q => String(q.id));
            const averageScoreOf = (response) => {
                if (!response) return null;
                try {
                    const answers = typeof response.answers === 'string' ? JSON.parse(response.answers) : response.answers;
                    const scores = scaleQuestionIds.map(qId => Number(answers?.[qId])).filter(v => !isNaN(v));
                    return scores.length > 0 ? Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 10) / 10 : null;
                } catch (e) { return null; }
            };

            for (const meeting of meetings) {
                // Same "opens once closed" gate as /subordinates - the evaluation doesn't exist yet
                // from anyone's perspective until the leader is eligible to fill it.
                if (!meeting.is_closed) continue;

                const attendeeIds = await getMeetingAttendeeEmployeeIds(meeting);
                if (!attendeeIds.includes(employee_id)) continue;

                const response = responseByMeeting[meeting.id];
                items.push({
                    formId: form.id,
                    formTitle: form.title,
                    meetingId: meeting.id,
                    meetingTitle: meeting.title,
                    meetingDate: meeting.date,
                    externalTrainingRequestId: null,
                    externalTrainingTitle: null,
                    externalTrainingDate: null,
                    submitted: !!response,
                    submittedAt: response ? response.submitted_at : null,
                    averageScore: averageScoreOf(response)
                });
            }

            // External Training equivalent - same "closed" gate as /subordinates (status Processed).
            for (const etr of externalTrainingRequests) {
                if (etr.status !== 'Processed') continue;
                if (etr.employee_id !== employee_id) continue;

                const response = responseByExt[etr.id];
                items.push({
                    formId: form.id,
                    formTitle: form.title,
                    meetingId: null,
                    meetingTitle: null,
                    meetingDate: null,
                    externalTrainingRequestId: etr.id,
                    externalTrainingTitle: etr.title,
                    externalTrainingDate: etr.end_date,
                    submitted: !!response,
                    submittedAt: response ? response.submitted_at : null,
                    averageScore: averageScoreOf(response)
                });
            }
        }

        res.json(items);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// Full detail for HR: questions + per-attendee response status ("who's done").
app.get('/api/post-training-evaluations/:id', async (req, res) => {
    try {
        const { id } = req.params;
        // Optional: scope attendees to one meeting - a reused template's attendee list otherwise
        // spans every meeting that ever used it (fine for HR's admin overview, but the Internal
        // Training detail view only wants the meeting it has open).
        const { meetingId } = req.query;
        const forms = await query(`
            SELECT f.*, m.title AS meeting_title, m.date AS meeting_date, m.guests_json, m.cost_report_json
            FROM post_training_evaluation_forms f
            LEFT JOIN meetings m ON f.meeting_id = m.id
            WHERE f.id = ? AND f.deleted_at IS NULL
        `, [id]);
        if (forms.length === 0) return res.status(404).json({ error: 'Evaluation form not found' });
        const form = forms[0];

        const questions = await query(
            'SELECT * FROM post_training_evaluation_questions WHERE form_id = ? ORDER BY order_index ASC',
            [id]
        );

        const responses = await query('SELECT meeting_id, evaluatee_employee_id, answers, submitted_at FROM post_training_evaluation_responses WHERE form_id = ?', [id]);
        // Keyed by meeting_id + evaluatee - the same person can have one response per meeting.
        const responseByMeetingAndEvaluatee = {};
        responses.forEach(r => { responseByMeetingAndEvaluatee[`${r.meeting_id}-${r.evaluatee_employee_id}`] = r; });

        let meetings = await getFormMeetings(form);
        if (meetingId) meetings = meetings.filter(m => String(m.id) === String(meetingId));

        const attendees = [];
        for (const meeting of meetings) {
            const attendeeIds = await getMeetingAttendeeEmployeeIds(meeting);
            if (attendeeIds.length === 0) continue;
            const placeholders = attendeeIds.map(() => '?').join(',');
            const userRows = await query(`SELECT employee_id, name FROM users WHERE employee_id IN (${placeholders})`, attendeeIds);
            const nameByEmployeeId = {};
            userRows.forEach(u => { nameByEmployeeId[u.employee_id] = u.name; });
            attendeeIds.forEach(empId => {
                const response = responseByMeetingAndEvaluatee[`${meeting.id}-${empId}`];
                let answers = null;
                if (response) {
                    try { answers = typeof response.answers === 'string' ? JSON.parse(response.answers) : response.answers; } catch (e) { }
                }
                attendees.push({
                    employeeId: empId,
                    name: nameByEmployeeId[empId] || empId,
                    meetingId: meeting.id,
                    meetingTitle: meeting.title,
                    meetingDate: meeting.date,
                    submitted: !!response,
                    submittedAt: response ? response.submitted_at : null,
                    answers
                });
            });
        }

        res.json({
            id: form.id,
            meetingId: form.meeting_id,
            meetingTitle: form.meeting_title,
            meetingDate: form.meeting_date,
            category: form.category,
            title: form.title,
            description: form.description,
            scaleMinLabel: form.scale_min_label,
            scaleMaxLabel: form.scale_max_label,
            status: form.status,
            createdBy: form.created_by,
            createdAt: form.created_at,
            questions,
            attendees
        });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// A single participant's own submitted PTE answer - scoped to one evaluatee (unlike the HR detail
// endpoint above, which returns every attendee's answers) so a plain participant's browser never
// receives what was written about their coworkers. Mirrors /api/feedback/meeting/:userId/:meetingId.
app.get('/api/post-training-evaluations/:id/response/:employeeId', async (req, res) => {
    try {
        const { id, employeeId } = req.params;
        // A reused template can hold one response per meeting (or per external training request)
        // for the same person - without this, an ambiguous row could be picked and show the wrong
        // context's answer to the participant.
        const { meetingId, externalTrainingRequestId } = req.query;
        const forms = await query(
            'SELECT id, title, description, scale_min_label, scale_max_label FROM post_training_evaluation_forms WHERE id = ? AND deleted_at IS NULL',
            [id]
        );
        if (forms.length === 0) return res.status(404).json({ error: 'Evaluation form not found' });
        const form = forms[0];

        const questions = await query(
            'SELECT id, type, competency_label, question_text FROM post_training_evaluation_questions WHERE form_id = ? ORDER BY order_index ASC',
            [id]
        );

        let responseRows;
        if (meetingId) {
            responseRows = await query(
                'SELECT answers, submitted_at FROM post_training_evaluation_responses WHERE form_id = ? AND evaluatee_employee_id = ? AND meeting_id = ?',
                [id, employeeId, meetingId]
            );
        } else if (externalTrainingRequestId) {
            responseRows = await query(
                'SELECT answers, submitted_at FROM post_training_evaluation_responses WHERE form_id = ? AND evaluatee_employee_id = ? AND external_training_request_id = ?',
                [id, employeeId, externalTrainingRequestId]
            );
        } else {
            responseRows = await query(
                'SELECT answers, submitted_at FROM post_training_evaluation_responses WHERE form_id = ? AND evaluatee_employee_id = ?',
                [id, employeeId]
            );
        }
        const response = responseRows[0] || null;
        let answers = null;
        if (response) {
            try { answers = typeof response.answers === 'string' ? JSON.parse(response.answers) : response.answers; } catch (e) { }
        }

        res.json({
            formId: form.id,
            title: form.title,
            description: form.description,
            scaleMinLabel: form.scale_min_label,
            scaleMaxLabel: form.scale_max_label,
            questions,
            submitted: !!response,
            submittedAt: response ? response.submitted_at : null,
            answers
        });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// 2. HR: create a new form (DRAFT by default).
app.post('/api/post-training-evaluations', async (req, res) => {
    try {
        const { title, category, description, scale_min_label, scale_max_label, questions, created_by } = req.body;
        if (!title) return res.status(400).json({ error: 'title is required' });

        const result = await query(
            'INSERT INTO post_training_evaluation_forms (title, category, description, scale_min_label, scale_max_label, created_by) VALUES (?, ?, ?, ?, ?, ?)',
            [title, category || null, description || null, scale_min_label || null, scale_max_label || null, created_by || null]
        );
        const formId = result.insertId;

        if (Array.isArray(questions)) {
            for (let i = 0; i < questions.length; i++) {
                const q = questions[i];
                await query(
                    'INSERT INTO post_training_evaluation_questions (form_id, order_index, type, competency_label, question_text) VALUES (?, ?, ?, ?, ?)',
                    [formId, i, q.type === 'TEXT' ? 'TEXT' : 'SCALE', q.competency_label || null, q.question_text]
                );
            }
        }

        res.json({ success: true, id: formId });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// HR: edit title/labels/questions. Replaces the whole question set - simplest option given
// responses reference a question only loosely (by id, inside the answers JSON blob) and this is
// a low-stakes internal tool, not a system where past responses need to stay tied to edited text.
app.put('/api/post-training-evaluations/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { title, category, description, scale_min_label, scale_max_label, questions } = req.body;

        await query(
            'UPDATE post_training_evaluation_forms SET title = ?, category = ?, description = ?, scale_min_label = ?, scale_max_label = ? WHERE id = ?',
            [title, category || null, description || null, scale_min_label || null, scale_max_label || null, id]
        );

        if (Array.isArray(questions)) {
            await query('DELETE FROM post_training_evaluation_questions WHERE form_id = ?', [id]);
            for (let i = 0; i < questions.length; i++) {
                const q = questions[i];
                await query(
                    'INSERT INTO post_training_evaluation_questions (form_id, order_index, type, competency_label, question_text) VALUES (?, ?, ?, ?, ?)',
                    [id, i, q.type === 'TEXT' ? 'TEXT' : 'SCALE', q.competency_label || null, q.question_text]
                );
            }
        }

        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// HR: publish - this is what makes it appear in supervisors' pending queues.
app.post('/api/post-training-evaluations/:id/publish', async (req, res) => {
    try {
        await query("UPDATE post_training_evaluation_forms SET status = 'PUBLISHED' WHERE id = ?", [req.params.id]);
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/post-training-evaluations/:id', async (req, res) => {
    try {
        await query('UPDATE post_training_evaluation_forms SET deleted_at = ? WHERE id = ?', [new Date(), req.params.id]);
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// 3. Supervisor submits (or re-submits) their evaluation of one subordinate for one form.
app.post('/api/post-training-evaluations/:id/respond', async (req, res) => {
    try {
        const { id } = req.params;
        const { evaluatee_employee_id, evaluator_employee_id, meeting_id, external_training_request_id, answers } = req.body;
        if (!evaluatee_employee_id || !evaluator_employee_id || (!meeting_id && !external_training_request_id) || !answers) {
            return res.status(400).json({ error: 'evaluatee_employee_id, evaluator_employee_id, one of meeting_id/external_training_request_id, and answers are required' });
        }
        // A response belongs to exactly one context - accepting both would silently corrupt the row
        // (it would stop matching either context's lookup, appearing submitted to neither side).
        if (meeting_id && external_training_request_id) {
            return res.status(400).json({ error: 'meeting_id and external_training_request_id are mutually exclusive' });
        }

        const now = new Date();
        // Unique on (form_id, meeting_id, evaluatee_employee_id) or (form_id,
        // external_training_request_id, evaluatee_employee_id) - a reused template evaluated for the
        // same person across two different meetings/requests must not collapse into one response.
        // Exactly one of meeting_id/external_training_request_id is set per row, so only the
        // matching unique key ever conflicts.
        await query(
            `INSERT INTO post_training_evaluation_responses (form_id, meeting_id, external_training_request_id, evaluatee_employee_id, evaluator_employee_id, answers, submitted_at)
             VALUES (?, ?, ?, ?, ?, ?, ?)
             ON DUPLICATE KEY UPDATE evaluator_employee_id = ?, answers = ?, submitted_at = ?`,
            [id, meeting_id || null, external_training_request_id || null, evaluatee_employee_id, evaluator_employee_id, JSON.stringify(answers), now, evaluator_employee_id, JSON.stringify(answers), now]
        );

        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// --- COURSES ---
// Serve static courses.json if needed
app.get('/api/courses-json', (req, res) => {
    try {
        const coursesPath = path.join(__dirname, 'courses.json');
        if (fs.existsSync(coursesPath)) {
            const courses = fs.readFileSync(coursesPath, 'utf8');
            res.json(JSON.parse(courses));
        } else {
            res.status(404).json({ message: 'Courses file not found' });
        }
    } catch (err) {
        res.status(500).json({ error: 'Failed to load courses' });
    }
});

const mapCourse = (c, modules, completionCounts) => {
    if (!c) return null;

    // Helper to parse JSON safely
    const parseJSON = (data) => {
        if (!data) return undefined;
        if (typeof data === 'object') return data;
        try {
            return JSON.parse(data);
        } catch (e) {
            console.warn("Failed to parse JSON column:", e.message);
            return undefined;
        }
    };

    const courseId = Number(c.id);

    // EXPLICIT MAPPING: Only return what the frontend needs
    // This prevents snake_case columns from conflicting with camelCase properties
    return {
        id: courseId,
        title: c.title,
        category: c.category,
        description: c.description,
        duration: c.duration,
        assessment: parseJSON(c.assessment_data),
        preAssessment: parseJSON(c.entry_pre_test_data || c.pre_assessment_data),
        completedCount: completionCounts?.[courseId] || 0,
        modules: (modules || [])
            .filter(m => Number(m.course_id) === courseId)
            .map(m => ({
                id: Number(m.id),
                courseId: Number(m.course_id),
                title: m.title,
                duration: m.duration,
                locked: !!m.is_locked,
                videoId: m.video_id,
                videoType: m.video_type || 'youtube',
                quiz: parseJSON(m.quiz_data),
                preQuiz: parseJSON(m.pre_quiz_data)
            }))
    };
};

app.get('/api/courses', async (req, res) => {
    try {
        const courses = await query('SELECT * FROM courses');
        const modules = await query('SELECT * FROM course_modules');
        // An employee has "completed" a module once they've passed its final assessment -
        // same criteria used to trigger the Nusawork completion sync (module_id IS NULL POST >= 80).
        // Count distinct employees (falling back to student_id when employee_id is unset) so retakes
        // don't inflate the number.
        const completionRows = await query(
            `SELECT course_id, COUNT(DISTINCT COALESCE(employee_id, student_id)) as cnt
             FROM quiz_results
             WHERE module_id IS NULL AND quiz_type = 'POST' AND score >= 80
             GROUP BY course_id`
        );
        const completionCounts = {};
        completionRows.forEach(row => { completionCounts[row.course_id] = row.cnt; });
        const combined = courses.map(c => mapCourse(c, modules, completionCounts));
        res.json(combined);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// Per-employee detail behind the "N Completed" badge on the Online Modules Management card:
// name plus the pre-/post-test scores from the attempt that satisfied completion (module_id IS
// NULL POST >= 80) - the same criteria used for the count above and the Nusawork sync.
app.get('/api/courses/:id/completions', async (req, res) => {
    try {
        const { id } = req.params;
        const rows = await query(
            `SELECT student_id, employee_id, student_name, score, date, quiz_type
             FROM quiz_results
             WHERE course_id = ? AND module_id IS NULL
             ORDER BY date ASC`,
            [id]
        );

        const state = {};
        for (const row of rows) {
            const identifier = row.employee_id || row.student_id;
            if (!identifier) continue;
            if (!state[identifier]) {
                state[identifier] = { employeeId: row.employee_id, studentId: row.student_id, name: row.student_name, latestPre: null, completion: null };
            }
            const s = state[identifier];
            if (row.student_name) s.name = row.student_name;
            if (row.quiz_type === 'PRE') {
                s.latestPre = row.score;
            } else if (row.quiz_type === 'POST' && row.score >= 80 && !s.completion) {
                // First passing post-test only - matches the "count this completion once" rule.
                s.completion = { preTest: s.latestPre, postTest: row.score, date: row.date };
            }
        }

        const completedEntries = Object.values(state).filter(s => s.completion);

        // Prefer the canonical employee name over whatever was cached on the quiz_results row at
        // submit time (student_name can be stale after a name change in Nusawork).
        const employeeIds = completedEntries.map(s => s.employeeId).filter(Boolean);
        let nameByEmployeeId = {};
        if (employeeIds.length > 0) {
            const empRows = await query('SELECT id_employee, full_name FROM employees WHERE id_employee IN (?)', [employeeIds]);
            empRows.forEach(e => { nameByEmployeeId[e.id_employee] = e.full_name; });
        }

        const result = completedEntries
            .map(s => ({
                employeeId: s.employeeId,
                studentId: s.studentId,
                name: nameByEmployeeId[s.employeeId] || s.name || s.employeeId || s.studentId,
                preTest: s.completion.preTest,
                postTest: s.completion.postTest,
                date: s.completion.date
            }))
            .sort((a, b) => String(a.name).localeCompare(String(b.name)));

        res.json(result);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/courses', async (req, res) => {
    try {
        const c = req.body;
        console.log("CREATING NEW COURSE:", c.title);

        const preAssessmentJSON = c.preAssessment ? JSON.stringify(c.preAssessment) : null;
        const assessmentJSON = c.assessment ? JSON.stringify(c.assessment) : null;

        const result = await query(
            'INSERT INTO courses (title, category, description, duration, assessment_data, entry_pre_test_data) VALUES (?, ?, ?, ?, ?, ?)',
            [c.title, c.category || 'General', c.description || '', c.duration || '', assessmentJSON, preAssessmentJSON]
        );
        const courseId = result.insertId;
        console.log("CREATED COURSE ID:", courseId);

        // Insert modules if any
        if (c.modules && c.modules.length > 0) {
            for (const mod of c.modules) {
                await query(
                    'INSERT INTO course_modules (course_id, title, duration, video_id, video_type, is_locked, quiz_data, pre_quiz_data) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
                    [
                        courseId,
                        mod.title,
                        mod.duration,
                        mod.videoId || '',
                        mod.videoType || 'youtube',
                        mod.locked ? 1 : 0,
                        mod.quiz ? JSON.stringify(mod.quiz) : null,
                        mod.preQuiz ? JSON.stringify(mod.preQuiz) : null
                    ]
                );
            }
        }

        // Return full object
        const newCourseData = await query('SELECT * FROM courses WHERE id=?', [courseId]);
        const newModulesData = await query('SELECT * FROM course_modules WHERE course_id=?', [courseId]);
        res.json(mapCourse(newCourseData[0], newModulesData));
    } catch (err) {
        console.error("ERROR CREATING COURSE:", err);
        res.status(500).json({ error: err.message });
    }
});

app.put('/api/courses/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const c = req.body;

        // CLEANUP: Ensure we use the proper camelCase objects and IGNORE snake_case strings from DB
        const preAssessmentObj = c.preAssessment;
        const assessmentObj = c.assessment;

        const preAssessmentJSON = preAssessmentObj ? JSON.stringify(preAssessmentObj) : null;
        const assessmentJSON = assessmentObj ? JSON.stringify(assessmentObj) : null;

        console.log(`[SAVE] Course ${id}: Pre-Test length ${preAssessmentJSON ? preAssessmentJSON.length : 0}`);

        // Snapshot before overwriting, so we can tell afterwards whether title/duration actually
        // changed - only then do already-completed employees' Nusawork notes need updating.
        const previousCourseRows = await query('SELECT title, duration FROM courses WHERE id = ?', [id]);
        const previousCourse = previousCourseRows[0];

        // 1. Update Course details
        const updateParams = [
            c.title,
            c.category || 'General',
            c.description || '',
            c.duration || '',
            assessmentJSON,
            preAssessmentJSON,
            Number(id)
        ];

        const updateResult = await query(
            'UPDATE courses SET title = ?, category = ?, description = ?, duration = ?, assessment_data = ?, entry_pre_test_data = ? WHERE id = ?',
            updateParams
        );

        console.log(`[UPDATE] Course ID ${id} result:`, updateResult.affectedRows, "rows affected");

        if (updateResult.affectedRows === 0) {
            console.error(`[CRITICAL] Baris kursus dengan ID ${id} tidak ditemukan di DB!`);
        }

        // 2. Update Modules (Syncing Logic to preserve IDs)
        const incomingModules = c.modules || [];
        const existingModules = await query('SELECT id FROM course_modules WHERE course_id = ?', [id]);
        const existingIds = existingModules.map(m => m.id);
        const incomingIds = incomingModules.map(m => m.id).filter(id => typeof id === 'number' && id < 1000000000000); // Filter out frontend-only IDs (Date.now)

        // a. Delete modules that are no longer present
        const idsToDelete = existingIds.filter(eid => !incomingIds.includes(eid));
        if (idsToDelete.length > 0) {
            await query('DELETE FROM course_modules WHERE id IN (?)', [idsToDelete]);
        }

        // b. Update or Insert
        for (const mod of incomingModules) {
            const isExisting = typeof mod.id === 'number' && existingIds.includes(mod.id);

            if (isExisting) {
                // UPDATE
                await query(
                    'UPDATE course_modules SET title = ?, duration = ?, video_id = ?, video_type = ?, is_locked = ?, quiz_data = ?, pre_quiz_data = ? WHERE id = ?',
                    [
                        mod.title,
                        mod.duration,
                        mod.videoId || '',
                        mod.videoType || 'youtube',
                        mod.locked ? 1 : 0,
                        mod.quiz ? JSON.stringify(mod.quiz) : null,
                        mod.preQuiz ? JSON.stringify(mod.preQuiz) : null,
                        mod.id
                    ]
                );
            } else {
                // INSERT
                await query(
                    'INSERT INTO course_modules (course_id, title, duration, video_id, video_type, is_locked, quiz_data, pre_quiz_data) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
                    [
                        id,
                        mod.title,
                        mod.duration,
                        mod.videoId || '',
                        mod.videoType || 'youtube',
                        mod.locked ? 1 : 0,
                        mod.quiz ? JSON.stringify(mod.quiz) : null,
                        mod.preQuiz ? JSON.stringify(mod.preQuiz) : null
                    ]
                );
            }
        }

        // Propagate a title/duration change to every employee already marked "Completed" for this
        // course, so their Nusawork note stays in sync with what the module is now called/worth.
        const titleChanged = previousCourse && previousCourse.title !== c.title;
        const durationChanged = previousCourse && previousCourse.duration !== (c.duration || '');
        if (previousCourse && (titleChanged || durationChanged)) {
            const completedRows = await query(
                'SELECT employee_id, nusawork_id_group, date FROM quiz_results WHERE course_id = ? AND nusawork_id_group IS NOT NULL',
                [id]
            );
            if (completedRows.length > 0) {
                const totalHours = parseCourseTotalDurationHours(c.duration);
                const hours = totalHours !== null ? Math.round(totalHours * 100) / 100 : 0;
                console.log(`[NUSAWORK ONLINE SYNC] Course ${id} title/duration changed - updating ${completedRows.length} completion note(s).`);
                completedRows.forEach(row => {
                    updateOnlineModuleNoteInNusawork({
                        employeeId: row.employee_id,
                        idGroup: row.nusawork_id_group,
                        title: c.title,
                        date: new Date(row.date).toISOString().slice(0, 10),
                        hours
                    });
                });
            }
        }

        // Return updated
        const updatedCourseData = await query('SELECT * FROM courses WHERE id = ?', [id]);
        const updatedModulesData = await query('SELECT * FROM course_modules WHERE course_id = ?', [id]);
        const completionCountRows = await query(
            `SELECT COUNT(DISTINCT COALESCE(employee_id, student_id)) as cnt
             FROM quiz_results
             WHERE course_id = ? AND module_id IS NULL AND quiz_type = 'POST' AND score >= 80`,
            [id]
        );
        const completionCounts = { [id]: completionCountRows[0]?.cnt || 0 };

        const mapped = mapCourse(updatedCourseData[0], updatedModulesData, completionCounts);
        console.log("SENDING BACK MAPPED COURSE:", mapped.title, "PreAssessment:", !!mapped.preAssessment);
        res.json(mapped);
    } catch (err) {
        console.error("ERROR SAVING COURSE:", err);
        res.status(500).json({ error: err.message });
    }
});

app.delete('/api/courses/:id', async (req, res) => {
    try {
        const { id } = req.params;

        // Grab every completed employee's Nusawork note reference before the course's quiz_results
        // rows are cleaned up below.
        const completedRows = await query(
            'SELECT employee_id, nusawork_id_group FROM quiz_results WHERE course_id = ? AND nusawork_id_group IS NOT NULL',
            [id]
        );

        await query('DELETE FROM courses WHERE id = ?', [id]);

        // Without this, quiz_results/progress rows outlive the course and show up as
        // "Unknown Course" in Quiz Report and similar views.
        await query('DELETE FROM quiz_results WHERE course_id = ?', [id]);
        await query('DELETE FROM progress WHERE course_id = ?', [id]);

        if (completedRows.length > 0) {
            console.log(`[NUSAWORK ONLINE SYNC] Course ${id} deleted - removing ${completedRows.length} completion note(s) from Nusawork.`);
            completedRows.forEach(row => {
                deleteNusaworkNote({ employeeId: row.employee_id, idGroup: row.nusawork_id_group });
            });
        }

        res.json({ success: true, message: 'Course deleted successfully' });
    } catch (err) {
        console.error("ERROR DELETING COURSE:", err);
        res.status(500).json({ error: err.message });
    }
});

// --- PROGRESS ---
app.get('/api/progress/:userId/:courseId', async (req, res) => {
    try {
        const { userId, courseId } = req.params;

        // 1. Find user's employee_id for better lookup
        const userRows = await query('SELECT employee_id FROM users WHERE id = ? OR employee_id = ?', [userId, userId]);
        const employeeId = userRows.length > 0 ? userRows[0].employee_id : null;

        // 2. Search using BOTH identifiers
        const rows = await query(
            'SELECT * FROM progress WHERE (user_id = ? OR (employee_id IS NOT NULL AND employee_id = ?)) AND course_id = ?',
            [userId, employeeId, courseId]
        );

        if (rows.length === 0) {
            return res.json({ userId, courseId, completedModuleIds: [] });
        }

        const record = rows[0];
        // Parse JSON
        const completedModuleIds = typeof record.completed_module_ids === 'string'
            ? JSON.parse(record.completed_module_ids)
            : record.completed_module_ids;

        res.json({
            userId: record.user_id,
            courseId: record.course_id,
            completedModuleIds: completedModuleIds || [],
            moduleProgress: typeof record.module_progress === 'string' ? JSON.parse(record.module_progress) : record.module_progress || {},
            lastAccess: record.last_access
        });
    } catch (err) {
        console.error("GET PROGRESS ERROR:", err);
        res.status(500).json({ error: err.message });
    }
});

app.delete('/api/progress/:userId/:courseId', async (req, res) => {
    try {
        const { userId, courseId } = req.params;

        // Robust Lookup: Find employee_id to ensure we clear all variations of the user's ID
        const userRows = await query('SELECT employee_id FROM users WHERE id = ? OR employee_id = ?', [userId, userId]);
        const employeeId = userRows.length > 0 ? userRows[0].employee_id : null;

        console.log(`[PROGRESS] Cancelling progress for user ${userId} / course ${courseId}`);

        // 1. Delete matching progress records
        await query(
            'DELETE FROM progress WHERE (user_id = ? OR (employee_id IS NOT NULL AND employee_id = ?)) AND course_id = ?',
            [userId, employeeId, courseId]
        );

        // 2. Delete matching quiz results
        await query(
            'DELETE FROM quiz_results WHERE (student_id = ? OR (employee_id IS NOT NULL AND employee_id = ?)) AND course_id = ?',
            [userId, employeeId, courseId]
        );

        res.json({ success: true, message: 'Progress and quiz results cleared.' });
    } catch (err) {
        console.error("CANCEL PROGRESS ERROR:", err);
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/progress/complete', async (req, res) => {
    try {
        const { userId, courseId, moduleId, employee_id } = req.body;

        // --- NEW: STRICT VALIDATION ---
        // 1. Fetch module configuration to see if it has Pre/Post tests
        const moduleRows = await query('SELECT quiz_data, pre_quiz_data FROM course_modules WHERE id = ?', [moduleId]);
        if (moduleRows.length > 0) {
            const mod = moduleRows[0];
            const hasPost = mod.quiz_data && JSON.parse(mod.quiz_data).questions && JSON.parse(mod.quiz_data).questions.length > 0;
            const hasPre = mod.pre_quiz_data && JSON.parse(mod.pre_quiz_data).questions && JSON.parse(mod.pre_quiz_data).questions.length > 0;

            if (hasPost || hasPre) {
                // Fetch passing scores from results
                // Using a robust query that checks both studentId (LMS ID) and studentId (can be employee_id)
                const results = await query(
                    'SELECT quiz_type, MAX(score) as maxScore FROM quiz_results WHERE (student_id = ? OR student_id = (SELECT employee_id FROM users WHERE id = ?)) AND module_id = ? GROUP BY quiz_type',
                    [userId, userId, moduleId]
                );

                const maxPost = results.find(r => r.quiz_type === 'POST')?.maxScore || 0;
                const hasPreResult = results.some(r => r.quiz_type === 'PRE');

                if (hasPost && maxPost < 80) {
                    return res.status(400).json({ error: 'Anda harus lulus Post-Test (Nilai >= 80) sebelum menyelesaikan modul ini.' });
                }
                if (hasPre && !hasPreResult) {
                    return res.status(400).json({ error: 'Anda harus mengerjakan kuis Pre-Test sebelum menyelesaikan modul ini.' });
                }

            }
        }
        // --- END STRICT VALIDATION ---

        // Verify if we have an employeeId from users table if not provided
        let effectiveEmpId = employee_id;
        if (!effectiveEmpId) {
            const userRows = await query('SELECT employee_id FROM users WHERE id = ?', [userId]);
            if (userRows.length > 0) effectiveEmpId = userRows[0].employee_id;
        }

        // Search using BOTH
        const rows = await query(
            'SELECT * FROM progress WHERE (user_id = ? OR (employee_id IS NOT NULL AND employee_id = ?)) AND course_id = ?',
            [userId, effectiveEmpId, courseId]
        );

        let completedModuleIds = [];
        let recordId = null;

        if (rows.length > 0) {
            recordId = rows[0].id;
            completedModuleIds = typeof rows[0].completed_module_ids === 'string'
                ? JSON.parse(rows[0].completed_module_ids)
                : rows[0].completed_module_ids || [];
        }

        if (!completedModuleIds.includes(moduleId)) {
            completedModuleIds.push(moduleId);
        }

        const jsonIds = JSON.stringify(completedModuleIds);
        const now = new Date();

        console.log(`[PROGRESS] Marking module ${moduleId} as complete for user ${userId} / course ${courseId}`);
        if (recordId) {
            await query('UPDATE progress SET completed_module_ids = ?, last_access = ?, employee_id = ? WHERE id = ?',
                [jsonIds, now, effectiveEmpId, recordId]);
        } else {
            await query('INSERT INTO progress (user_id, course_id, completed_module_ids, last_access, employee_id) VALUES (?, ?, ?, ?, ?)',
                [userId, courseId, jsonIds, now, effectiveEmpId]);
        }

        res.json({ success: true, completedModuleIds });
    } catch (err) {
        console.error("COMPLETE PROGRESS ERROR:", err);
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/progress/time', async (req, res) => {
    try {
        const { userId, courseId, moduleId, timestamp } = req.body;

        // Robust Lookup
        const userRows = await query('SELECT employee_id FROM users WHERE id = ? OR employee_id = ?', [userId, userId]);
        const employeeId = userRows.length > 0 ? userRows[0].employee_id : null;

        const rows = await query(
            'SELECT * FROM progress WHERE (user_id = ? OR (employee_id IS NOT NULL AND employee_id = ?)) AND course_id = ?',
            [userId, employeeId, courseId]
        );
        let moduleProgress = {};
        let recordId = null;

        if (rows.length > 0) {
            recordId = rows[0].id;
            moduleProgress = typeof rows[0].module_progress === 'string'
                ? JSON.parse(rows[0].module_progress)
                : rows[0].module_progress || {};
        }

        moduleProgress[moduleId] = timestamp;
        const jsonProgress = JSON.stringify(moduleProgress);
        const now = new Date();

        if (recordId) {
            await query('UPDATE progress SET module_progress = ?, last_access = ?, employee_id = ? WHERE id = ?',
                [jsonProgress, now, employeeId, recordId]);
        } else {
            await query('INSERT INTO progress (user_id, course_id, module_progress, last_access, employee_id) VALUES (?, ?, ?, ?, ?)',
                [userId, courseId, jsonProgress, now, employeeId]);
        }

        res.json({ success: true });
    } catch (err) {
        console.error("TIME LOG ERROR:", err);
        res.status(500).json({ error: err.message });
    }
});

// --- QUIZ & ASSESSMENT ---
app.post('/api/quiz/submit', async (req, res) => {
    try {
        const { studentId, studentName, courseId, moduleId, score, quizType = 'POST' } = req.body;
        const now = new Date();
        console.log(`[QUIZ SUBMIT] User ${studentId} submitted ${quizType} quiz for module ${moduleId}. Score: ${score}`);

        // Find user's employee_id for robust storage
        const userRows = await query('SELECT employee_id FROM users WHERE id = ? OR employee_id = ?', [studentId, studentId]);
        const employeeId = userRows.length > 0 ? userRows[0].employee_id : null;

        // 1. Save Result
        // answers: the Internal Training quiz's per-question review snapshot (see quiz_results.answers_json).
        const answersJson = Array.isArray(req.body.answers) ? JSON.stringify(req.body.answers) : null;
        const insertResult = await query(
            'INSERT INTO quiz_results (student_id, student_name, course_id, module_id, meeting_id, score, date, quiz_type, employee_id, answers_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
            [studentId, studentName, courseId || null, moduleId || null, req.body.meetingId || null, score, now, quizType, employeeId, answersJson]
        );
        const quizResultId = insertResult.insertId;

        // 2. If Passed (>= 80) and it was a POST test, mark module as complete
        if (score >= 80 && moduleId && quizType === 'POST') {
            // --- NEW: Verify Pre-Test if exists ---
            const moduleRows = await query('SELECT pre_quiz_data FROM course_modules WHERE id = ?', [moduleId]);
            if (moduleRows.length > 0) {
                const mod = moduleRows[0];
                const hasPre = mod.pre_quiz_data && JSON.parse(mod.pre_quiz_data).questions && JSON.parse(mod.pre_quiz_data).questions.length > 0;
                if (hasPre) {
                    const preResults = await query(
                        'SELECT COUNT(*) as count FROM quiz_results WHERE (student_id = ? OR student_id = (SELECT employee_id FROM users WHERE id = ?)) AND module_id = ? AND quiz_type = "PRE"',
                        [studentId, studentId, moduleId]
                    );
                    if (preResults[0].count === 0) {
                        console.log(`[QUIZ SUBMIT] Post-Test passed by ${studentName} but Pre-Test has not been taken for module ${moduleId}`);
                        return res.json({ success: true, message: 'Post-test passed, but kuis Pre-test harus dikerjakan terlebih dahulu.' });
                    }
                }
            }
            // --- END PRE-TEST VERIFICATION ---

            // Find user's employee_id for better lookup
            const userRows = await query('SELECT employee_id FROM users WHERE id = ? OR employee_id = ?', [studentId, studentId]);
            const employeeId = userRows.length > 0 ? userRows[0].employee_id : null;

            // Find progress robustly
            const rows = await query(
                'SELECT * FROM progress WHERE (user_id = ? OR (employee_id IS NOT NULL AND employee_id = ?)) AND course_id = ?',
                [studentId, employeeId, courseId]
            );

            let completedModuleIds = [];
            let recordId = null;

            if (rows.length > 0) {
                recordId = rows[0].id;
                completedModuleIds = typeof rows[0].completed_module_ids === 'string'
                    ? JSON.parse(rows[0].completed_module_ids)
                    : rows[0].completed_module_ids || [];
            }

            if (!completedModuleIds.includes(moduleId)) {
                completedModuleIds.push(moduleId);
                const jsonIds = JSON.stringify(completedModuleIds);
                if (recordId) {
                    await query('UPDATE progress SET completed_module_ids = ?, last_access = ?, employee_id = ? WHERE id = ?',
                        [jsonIds, now, employeeId, recordId]);
                } else {
                    await query('INSERT INTO progress (user_id, course_id, completed_module_ids, last_access, employee_id) VALUES (?, ?, ?, ?, ?)',
                        [studentId, courseId, jsonIds, now, employeeId]);
                }
            }
        } else if (score >= 80 && !moduleId && courseId && quizType === 'POST') {
            // Final course assessment passed (no moduleId - a per-module quiz is handled above).
            // Push a Nusawork completion note, but only the first time this course is passed -
            // the row inserted above is included in this count, so exactly 1 means this is it.
            const passCount = await query(
                `SELECT COUNT(*) as cnt FROM quiz_results WHERE course_id = ? AND module_id IS NULL AND quiz_type = 'POST' AND score >= 80
                 AND (student_id = ? OR (employee_id IS NOT NULL AND employee_id = ?))`,
                [courseId, studentId, employeeId]
            );
            if ((passCount[0]?.cnt || 0) === 1) {
                const courseRows = await query('SELECT title, duration FROM courses WHERE id = ?', [courseId]);
                const course = courseRows[0];
                const totalHours = parseCourseTotalDurationHours(course?.duration);
                const preTestRows = await query(
                    `SELECT score FROM quiz_results WHERE course_id = ? AND module_id IS NULL AND quiz_type = 'PRE'
                     AND (student_id = ? OR (employee_id IS NOT NULL AND employee_id = ?)) ORDER BY date DESC LIMIT 1`,
                    [courseId, studentId, employeeId]
                );
                // Don't block the quiz-submit response on an external API call.
                pushOnlineModuleCompletionToNusawork({
                    employeeId,
                    title: course?.title || `Course #${courseId}`,
                    date: now.toISOString().slice(0, 10),
                    hours: totalHours !== null ? Math.round(totalHours * 100) / 100 : 0,
                    preTest: preTestRows.length > 0 ? preTestRows[0].score : '',
                    postTest: score,
                    quizResultId
                });
            }
        }

        res.json({ success: true, score });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/quiz/results/:userId/:courseId', async (req, res) => {
    try {
        const { userId, courseId } = req.params;

        // Find user's employee_id for better lookup
        const userRows = await query('SELECT employee_id FROM users WHERE id = ? OR employee_id = ?', [userId, userId]);
        const employeeId = userRows.length > 0 ? userRows[0].employee_id : null;

        const results = await query(
            'SELECT id, student_id, student_name, course_id, module_id as moduleId, meeting_id as meetingId, score, date, quiz_type as quizType FROM quiz_results WHERE (student_id = ? OR (employee_id IS NOT NULL AND employee_id = ?)) AND course_id = ? ORDER BY date DESC',
            [userId, employeeId, courseId]
        );
        const mapped = results.map(r => ({
            ...r,
            studentId: r.student_id,
            studentName: r.student_name,
            courseId: r.course_id,
        }));
        res.json(mapped);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/quiz/results/all', async (req, res) => {
    try {
        const results = await query(
            'SELECT id, student_id as studentId, employee_id as employeeId, student_name as studentName, meeting_id as meetingId, score, date, quiz_type as quizType FROM quiz_results'
        );
        res.json(results);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/quiz/results/meeting/:userId/:meetingId', async (req, res) => {
    try {
        const { userId, meetingId } = req.params;
        const userRows = await query('SELECT employee_id FROM users WHERE id = ? OR employee_id = ?', [userId, userId]);
        const employeeId = userRows.length > 0 ? userRows[0].employee_id : null;

        const results = await query(
            'SELECT id, student_id, student_name, course_id, module_id as moduleId, meeting_id as meetingId, score, date, quiz_type as quizType, answers_json FROM quiz_results WHERE (student_id = ? OR (employee_id IS NOT NULL AND employee_id = ?)) AND meeting_id = ? ORDER BY date DESC',
            [userId, employeeId, meetingId]
        );
        const mapped = results.map(({ answers_json, ...r }) => {
            let answers = null;
            try { answers = answers_json ? JSON.parse(answers_json) : null; } catch (e) { answers = null; }
            return {
                ...r,
                studentId: r.student_id,
                studentName: r.student_name,
                courseId: r.course_id,
                answers
            };
        });
        res.json(mapped);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/feedback/submit', async (req, res) => {
    try {
        const { userId, meetingId, courseId, feedbackData } = req.body;
        let { employeeId } = req.body;
        const now = new Date();

        // Ensure we have employee_id for better tracking
        if (!employeeId && userId) {
            const userRows = await query('SELECT employee_id FROM users WHERE id = ? OR email = ? OR employee_id = ?', [userId, userId, userId]);
            if (userRows.length > 0) employeeId = userRows[0].employee_id;
        }

        // We use ON DUPLICATE KEY UPDATE to allow users to update their feedback
        // The unique keys are (user_id, course_id) and (user_id, meeting_id)
        await query(
            'INSERT INTO course_feedback (user_id, employee_id, course_id, meeting_id, feedback_data, submitted_at, is_imported) VALUES (?, ?, ?, ?, ?, ?, 0) ON DUPLICATE KEY UPDATE feedback_data = ?, submitted_at = ?, is_imported = 0',
            [userId, employeeId || null, courseId || null, meetingId || null, JSON.stringify(feedbackData), now, JSON.stringify(feedbackData), now]
        );

        console.log(`[FEEDBACK] Saved for user ${userId}, meeting ${meetingId}`);
        res.json({ success: true });
    } catch (err) {
        console.error('[FEEDBACK ERROR]', err);
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/feedback/meeting/:userId/:meetingId', async (req, res) => {
    try {
        const { userId, meetingId } = req.params;
        // Imported rows (from bulk training import) hold a historical PTE score for
        // reporting only — they are not a real submission by this participant, so they
        // must not make the feedback form show as already submitted.
        const rows = await query('SELECT * FROM course_feedback WHERE user_id = ? AND meeting_id = ? AND (is_imported IS NULL OR is_imported = 0)', [userId, meetingId]);
        res.json(rows[0] || null);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/feedback/all', async (req, res) => {
    try {
        const rows = await query('SELECT * FROM course_feedback ORDER BY submitted_at DESC');
        const mapped = rows.map(r => ({
            ...r,
            userId: r.user_id,
            employeeId: r.employee_id,
            courseId: r.course_id,
            meetingId: r.meeting_id,
            feedbackData: r.feedback_data,
            submittedAt: r.submitted_at
        }));
        res.json(mapped);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// --- EXTERNAL TRAINING ENDPOINTS ---

// 1. Employee creates new request
// Every active leader who sees this employee's requests in their Team Approvals list - the same
// matching as findSubordinateEmployeeIds (via reportsToLeader), so a comma-separated
// id_report_to ("A,B") reaches its leaders here too, unlike findReportToEmployee's exact match.
const findApprovingLeaders = async (employeeId) => {
    const employees = await querySimAsset(
        `SELECT id_employee, user_id, full_name, nickname, id_report_to, id_report_to_value, active_status, status_join, deleted_at
         FROM employees`
    );
    const employee = employees.find(e => String(e.id_employee) === String(employeeId));
    if (!employee) return [];
    return employees.filter(l =>
        l.id_employee && l.id_employee !== employee.id_employee && !l.deleted_at && isActiveNonIntern(l) && reportsToLeader(employee, l)
    );
};

// An employee submitted an external training request -> a general ticket for each leader who has
// to approve it, followed by IS5_TICKET_FOLLOW. Skipped when the employee has no leader on the org chart.
const notifyLeaderExternalTrainingRequest = async ({ requestId, employee_id, employee_name, category, title, start_date, end_date, registration_fee, vendor }) => {
    if (!isGeneralTicketEnabled()) return;
    const leaders = await findApprovingLeaders(employee_id);
    if (leaders.length === 0) {
        console.warn(`[EXTERNAL TRAINING GT] No leader found for ${employee_name} (${employee_id}) - skipping the ticket.`);
        return;
    }
    const formatDate = (v) => v ? String(v).replace('T', ' ') : '-';
    const fee = Number(registration_fee) || 0;
    for (const leader of leaders) {
        try {
            await createGeneralTicket({
                kind: 'external_training_request',
                reference: `external_training_request:${requestId}`,
                subject: `Pengajuan training eksternal: ${employee_name} - ${title}`,
                comment: [
                    `Halo ${leader.full_name}, ${employee_name} (${employee_id}) mengajukan training eksternal yang menunggu persetujuan Anda di LMS.`,
                    '',
                    `Judul: ${title}`,
                    `Kategori: ${category || '-'}`,
                    `Penyelenggara: ${vendor || '-'}`,
                    `Tanggal: ${formatDate(start_date)} s/d ${formatDate(end_date)}`,
                    `Biaya pendaftaran: Rp ${fee.toLocaleString('id-ID')}`,
                    '',
                    lmsAnchor(`/training/external?tab=team_approvals&request=${requestId}`, 'Buka Pengajuan')
                ].join('\n'),
                timeExpired: generalTicketDueDate(),
                priorityId: 1,
                ticketPic: String(leader.id_employee)
            });
            console.log(`[EXTERNAL TRAINING GT] Ticket created for leader ${leader.full_name} (${employee_name}: "${title}").`);
        } catch (err) {
            console.error(`[EXTERNAL TRAINING GT] Ticket for leader ${leader.full_name} failed:`, err.message);
        }
    }
};

// A leader approved an external training request -> a general ticket for the HR PIC in
// IS5_TICKET_PIC_HR to process it, followed by IS5_TICKET_FOLLOW.
const notifyHRApprovedExternalTraining = async ({ request, approvedBy, approvalNote, totalCost, budgetNoticeMessage }) => {
    if (!isGeneralTicketEnabled()) return;
    const hrPic = (process.env.IS5_TICKET_PIC_HR || '').trim();
    if (!hrPic) {
        console.warn('[EXTERNAL TRAINING GT] IS5_TICKET_PIC_HR is not set - skipping the HR ticket for an approved request.');
        return;
    }
    // The row's DATETIMEs come back as Dates read in the server's local time - format them the same way.
    const formatDate = (v) => {
        const d = v ? new Date(v) : null;
        if (!d || isNaN(d.getTime())) return '-';
        return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
    };
    await createGeneralTicket({
        kind: 'external_training_approved',
        reference: `external_training_request:${request.id}`,
        subject: `Training eksternal disetujui: ${request.employee_name} - ${request.title}`,
        comment: [
            `Pengajuan training eksternal ${request.employee_name} (${request.employee_id}) telah disetujui oleh ${approvedBy || '-'} dan menunggu diproses HR di LMS.`,
            '',
            `Judul: ${request.title}`,
            `Kategori: ${request.category || '-'}`,
            `Penyelenggara: ${request.vendor || '-'}`,
            `Tanggal: ${formatDate(request.start_date)} s/d ${formatDate(request.end_date)}`,
            `Total biaya: Rp ${(Number(totalCost) || 0).toLocaleString('id-ID')}`,
            `Metode pembayaran: ${request.payment_method || '-'}`,
            `Catatan leader: ${approvalNote || '-'}`,
            ...(budgetNoticeMessage ? ['', budgetNoticeMessage] : []),
            '',
            lmsAnchor('/admin/training', 'Buka Training Eksternal')
        ].join('\n'),
        timeExpired: generalTicketDueDate(),
        priorityId: 1,
        ticketPic: hrPic
    });
    console.log(`[EXTERNAL TRAINING GT] HR ticket created for ${request.employee_name}'s approved request "${request.title}".`);
};

app.post('/api/external-training/request', async (req, res) => {
    try {
        const { employee_id, employee_name, category, title, start_date, end_date, registration_fee, attachment_link, vendor, location, payment_method, cc_employee_ids } = req.body;
        // datetime-local inputs send "YYYY-MM-DDTHH:MM"; MySQL DATETIME literals need a space instead of "T"
        const toMysqlDatetime = (v) => v ? v.replace('T', ' ') : null;
        const result = await query(`
            INSERT INTO external_training_requests
            (employee_id, employee_name, category, title, start_date, end_date, registration_fee, attachment_link, vendor, location, payment_method, cc_employee_ids)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [employee_id, employee_name, category, title, toMysqlDatetime(start_date), toMysqlDatetime(end_date), registration_fee || 0, attachment_link || '', vendor || '', location || '', payment_method || 'Reimbursement', Array.isArray(cc_employee_ids) && cc_employee_ids.length > 0 ? JSON.stringify(cc_employee_ids) : null]);

        res.json({ success: true, id: result.insertId });

        // Best-effort, after responding - an IS5 outage must never fail or slow down the request.
        notifyLeaderExternalTrainingRequest({ requestId: result.insertId, employee_id, employee_name, category, title, start_date, end_date, registration_fee, vendor })
            .catch(err => console.error('[EXTERNAL TRAINING GT] Failed to notify leader:', err.message));
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// 1b. HR bulk-imports historical/already-processed requests from an Excel export (see TrainingExternalManager import).
// Each row is inserted directly with status 'Processed', bypassing the normal request/approve/hr-process flow.
app.post('/api/external-training/bulk-import', async (req, res) => {
    try {
        const { rows, hr_name } = req.body;
        if (!Array.isArray(rows) || rows.length === 0) {
            return res.status(400).json({ error: 'rows must be a non-empty array' });
        }

        const toMysqlDatetime = (v) => v ? v.replace('T', ' ') : null;
        const errors = [];
        const duplicates = [];

        const insertOne = async ({ row, i }) => {
            try {
                const {
                    employee_id, employee_name, category, title, vendor, location,
                    start_date, end_date, registration_fee, travel_flight_cost, accommodation_cost,
                    miscellaneous_cost, payment_method, certificate_link, certificate_expiry_date,
                    incentive_reward, incentive_payment_type, learning_hours, participation_type, training_gr_type
                } = row;

                if (!employee_id || !title) {
                    throw new Error('employee_id and title are required');
                }

                // Re-importing the same source file (accidental double-click, re-upload of an unmodified
                // sheet, etc.) would otherwise insert duplicate rows every time — there's no unique
                // constraint on the table. Treat the same employee + title + start date as "already imported".
                const existing = await query(
                    `SELECT id FROM external_training_requests WHERE employee_id = ? AND title = ? AND start_date <=> ? LIMIT 1`,
                    [employee_id, title, toMysqlDatetime(start_date)]
                );
                if (existing.length > 0) {
                    duplicates.push({ row: i + 1, employee_id, employee_name: employee_name || '', title, start_date: start_date || null, existingId: existing[0].id });
                    return 'duplicate';
                }

                // Attribute the "Supervisor" side to whoever currently reports-to for this employee in SimAsset,
                // rather than a hardcoded placeholder, so the dossier reflects the real org chart at import time.
                const supervisor = await findReportToEmployee(employee_id);
                const approvedBy = supervisor?.full_name || 'Bulk Import';

                // Re-host the certificate on the LMS itself instead of linking out to Google Drive, whose
                // unofficial thumbnail endpoint is unreliable for embedding (see downloadDriveImageToUploads).
                let storedCertificateLink = certificate_link || null;
                if (certificate_link && certificate_link.includes('drive.google.com')) {
                    const localPath = await downloadDriveCertificateToUploads(certificate_link);
                    if (localPath) storedCertificateLink = localPath;
                }

                await query(`
                    INSERT INTO external_training_requests
                    (employee_id, employee_name, category, title, vendor, location, start_date, end_date,
                     status, registration_fee, travel_flight_cost, accommodation_cost, miscellaneous_cost,
                     payment_method, approved_by, hr_name, certificate_link, certificate_expiry_date,
                     original_certificate_expiry_date, incentive_reward, incentive_payment_type,
                     training_gr_type, participation_type, learning_hours)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'Processed', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                `, [
                    employee_id, employee_name || '', category || '', title, vendor || '', location || '',
                    toMysqlDatetime(start_date), toMysqlDatetime(end_date),
                    registration_fee || 0, travel_flight_cost || 0, accommodation_cost || 0, miscellaneous_cost || 0,
                    payment_method || 'Reimbursement', approvedBy, hr_name || null,
                    storedCertificateLink, certificate_expiry_date || null, certificate_expiry_date || null,
                    incentive_reward || null, incentive_payment_type || null,
                    training_gr_type || null, participation_type || null, learning_hours || null
                ]);
                return 'inserted';
            } catch (rowErr) {
                errors.push({ row: i + 1, error: rowErr.message });
                return 'error';
            }
        };

        // Bounded concurrency: downloading certificate images from Drive per row is slow one-at-a-time
        // and large imports would otherwise risk hitting the proxy's request timeout.
        const indexedRows = rows.map((row, i) => ({ row, i }));
        const results = await runWithConcurrency(indexedRows, 5, insertOne);
        const inserted = results.filter(r => r === 'inserted').length;
        const skipped = results.filter(r => r === 'duplicate').length;

        res.json({ success: true, inserted, skipped, duplicates, errors });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// 2. Employee views own requests
app.get('/api/external-training/my-requests', async (req, res) => {
    try {
        const { employee_id } = req.query;
        const queryStr = `
            SELECT r.*, e.id_report_to as leader_name
            FROM external_training_requests r
            LEFT JOIN employees e ON r.employee_id = e.id_employee
            WHERE r.employee_id = ? AND r.deleted_at IS NULL
            ORDER BY r.created_at DESC
        `;
        const rows = await query(queryStr, [employee_id]);
        res.json(rows.map(parseExternalTrainingRow));
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// 3. Leader views requests from subordinates
app.get('/api/external-training/subordinates', async (req, res) => {
    try {
        const { leader_id } = req.query;
        if (!leader_id) return res.json([]);

        const subordinateIds = await filterActiveEmployeeIds(await findSubordinateEmployeeIds(leader_id));
        if (subordinateIds.length === 0) return res.json([]);

        const placeholders = subordinateIds.map(() => '?').join(',');
        const rows = await query(`
            SELECT * FROM external_training_requests
            WHERE employee_id IN (${placeholders}) AND deleted_at IS NULL
            ORDER BY created_at DESC
        `, subordinateIds);

        res.json(rows.map(parseExternalTrainingRow));
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// Must match ANNUAL_LEARNING_BUDGET in src/components/LearningReport.tsx - the one place this
// per-person cap is already defined and shown to users (Dashboard, Employee Learning Report).
const ANNUAL_LEARNING_BUDGET = 2000000;

// 4. Leader approves/rejects
app.post('/api/external-training/approve', async (req, res) => {
    try {
        const { id, status, approved_by, rejection_reason, approval_note } = req.body; // status should be 'Approved' or 'Rejected'
        if (status === 'Rejected') {
            await query('UPDATE external_training_requests SET status = ?, approved_by = ?, rejection_reason = ? WHERE id = ?', [status, approved_by, rejection_reason || null, id]);
            return res.json({ success: true });
        }
        if (status === 'Approved' && !(approval_note && approval_note.trim())) {
            return res.status(400).json({ error: 'A note explaining the approval is required.' });
        }

        const requestRows = await query('SELECT * FROM external_training_requests WHERE id = ?', [id]);
        if (requestRows.length === 0) return res.status(404).json({ error: 'Request not found' });
        const trainingRequest = parseExternalTrainingRow(requestRows[0]);

        // Whether approving THIS request pushes the requester over their own annual learning budget -
        // if so, the excess is effectively coming out of the team's pool, so their CC list gets a
        // heads-up. Uses the same per-employee cost total already shown everywhere else in the app
        // (computeLearningStats, for the calendar year this training starts in) plus this request's
        // own cost, which isn't counted yet since it isn't Approved/Processed until this call.
        const thisRequestCost = Number(trainingRequest.registration_fee || 0) + Number(trainingRequest.travel_flight_cost || 0)
            + Number(trainingRequest.accommodation_cost || 0) + Number(trainingRequest.miscellaneous_cost || 0)
            + Number(trainingRequest.additional_cost || 0);
        const periodYear = trainingRequest.start_date ? new Date(trainingRequest.start_date).getFullYear() : new Date().getFullYear();
        const existingStats = await computeLearningStats({
            employee_id: trainingRequest.employee_id,
            startDate: `${periodYear}-01-01`,
            endDate: `${periodYear}-12-31`
        }).catch(() => null);
        const existingCost = existingStats ? (existingStats.biayaTraining + existingStats.biayaTrainingExternal + existingStats.biayaBuku) : 0;
        // Interns get no personal learning budget, so any cost of theirs comes from the team's pool.
        const personalBudget = await isInternEmployeeId(trainingRequest.employee_id) ? 0 : ANNUAL_LEARNING_BUDGET;
        const exceedsPersonalBudget = (existingCost + thisRequestCost) > personalBudget;

        let budgetNoticeMessage = null;
        if (exceedsPersonalBudget) {
            const [employeeRow] = await querySimAsset('SELECT organization_name FROM employees WHERE id_employee = ?', [trainingRequest.employee_id]);
            const organizationName = employeeRow?.organization_name || '-';
            budgetNoticeMessage = `Pengajuan training eksternal "${trainingRequest.title}" (${trainingRequest.employee_name}) melebihi budget per-orang dan saat ini menggunakan budget tim "${organizationName}".`;
        }

        await query(
            'UPDATE external_training_requests SET status = ?, approved_by = ?, approval_note = ?, budget_notice_message = ? WHERE id = ?',
            [status, approved_by, approval_note.trim(), budgetNoticeMessage, id]
        );

        res.json({ success: true, exceedsPersonalBudget });

        // Best-effort, after responding - an IS5 outage must never fail or slow down the approval.
        if (status === 'Approved') {
            notifyHRApprovedExternalTraining({ request: trainingRequest, approvedBy: approved_by, approvalNote: approval_note.trim(), totalCost: thisRequestCost, budgetNoticeMessage })
                .catch(err => console.error('[EXTERNAL TRAINING GT] Failed to notify HR:', err.message));
        }
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// Header notification feed for a CC'd employee: every approved request that pushed the requester over
// their personal budget AND lists this employee_id in cc_employee_ids. The candidate set (any row with
// a budget notice at all) is small, so the cc_employee_ids membership check is done in JS rather than
// with a JSON_CONTAINS/LIKE clause in SQL.
app.get('/api/external-training/cc-budget-notices', async (req, res) => {
    try {
        const { employee_id } = req.query;
        if (!employee_id) return res.json([]);
        const rows = await query(
            `SELECT id, title, employee_name, cc_employee_ids, budget_notice_message, updated_at
             FROM external_training_requests WHERE budget_notice_message IS NOT NULL AND deleted_at IS NULL`
        );
        const notices = rows
            .map(parseExternalTrainingRow)
            .filter(r => r.cc_employee_ids.includes(employee_id));
        res.json(notices);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// 5. Admin views all requests
app.get('/api/external-training/all', async (req, res) => {
    try {
        const rows = await query(`SELECT * FROM external_training_requests WHERE deleted_at IS NULL ORDER BY created_at DESC`);
        res.json(rows.map(parseExternalTrainingRow));
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// 6. HR views all approved/processed requests
app.get('/api/external-training/hr', async (req, res) => {
    try {
        // HR usually wants to see Approved (needs action) or Processed (done)
        const rows = await query(`SELECT * FROM external_training_requests WHERE status IN ('Approved', 'Processed') AND deleted_at IS NULL ORDER BY updated_at DESC`);
        res.json(rows);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// Recently deleted requests, used only to notify the employee that their request was removed.
app.get('/api/external-training/deleted', async (req, res) => {
    try {
        const { employee_id } = req.query;
        const rows = await query(
            'SELECT id, title, employee_id, deleted_at FROM external_training_requests WHERE employee_id = ? AND deleted_at IS NOT NULL ORDER BY deleted_at DESC',
            [employee_id]
        );
        res.json(rows);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// 6. HR processes payment
app.post('/api/external-training/hr-process', async (req, res) => {
    try {
        const { id, travel_flight_cost, accommodation_cost, miscellaneous_cost, payment_method, registration_fee, certificate_link, certificate_expiry_date, category, title, vendor, location, start_date, end_date, certification_result, incentive_reward, incentive_payment_type, hr_name, training_gr_type, participation_type, learning_hours, pte_form_id } = req.body;
        // datetime-local inputs send "YYYY-MM-DDTHH:MM"; MySQL DATETIME literals need a space instead of "T"
        const toMysqlDatetime = (v) => v ? v.replace('T', ' ') : null;

        // processed_at starts the leader's 30-day Post Training Evaluation window (runPteReminders).
        let sql = `UPDATE external_training_requests SET status = 'Processed', processed_at = COALESCE(processed_at, NOW()), travel_flight_cost = ?, accommodation_cost = ?, miscellaneous_cost = ?, payment_method = ?, hr_name = ?`;
        let params = [travel_flight_cost || 0, accommodation_cost || 0, miscellaneous_cost || 0, payment_method, hr_name || null];

        if (registration_fee !== undefined) {
            sql += `, registration_fee = ?`;
            params.push(registration_fee);
        }
        if (certificate_link !== undefined) {
            sql += `, certificate_link = ?`;
            params.push(certificate_link);
        }
        if (certificate_expiry_date !== undefined) {
            sql += `, certificate_expiry_date = ?, original_certificate_expiry_date = COALESCE(original_certificate_expiry_date, ?)`;
            params.push(certificate_expiry_date || null, certificate_expiry_date || null);
        }
        if (category !== undefined) {
            sql += `, category = ?`;
            params.push(category);
        }
        if (title !== undefined) {
            sql += `, title = ?`;
            params.push(title);
        }
        if (vendor !== undefined) {
            sql += `, vendor = ?`;
            params.push(vendor);
        }
        if (location !== undefined) {
            sql += `, location = ?`;
            params.push(location);
        }
        if (start_date !== undefined) {
            sql += `, start_date = ?`;
            params.push(toMysqlDatetime(start_date));
        }
        if (end_date !== undefined) {
            sql += `, end_date = ?`;
            params.push(toMysqlDatetime(end_date));
        }
        if (certification_result !== undefined) {
            sql += `, certification_result = ?`;
            params.push(certification_result || null);
        }
        if (incentive_reward !== undefined) {
            sql += `, incentive_reward = ?`;
            params.push(incentive_reward || null);
        }
        if (incentive_payment_type !== undefined) {
            sql += `, incentive_payment_type = ?`;
            params.push(incentive_payment_type || null);
        }
        if (training_gr_type !== undefined) {
            sql += `, training_gr_type = ?`;
            params.push(training_gr_type || null);
        }
        if (participation_type !== undefined) {
            sql += `, participation_type = ?`;
            params.push(participation_type || null);
        }
        if (learning_hours !== undefined) {
            sql += `, learning_hours = ?`;
            params.push(learning_hours || null);
        }
        if (pte_form_id !== undefined) {
            sql += `, pte_form_id = ?`;
            params.push(pte_form_id || null);
        }
        sql += ` WHERE id = ?`;
        params.push(id);

        await query(sql, params);
        reconcileExternalTrainingNusawork(id);

        // The linked Post Training Evaluation template only goes live once this request is
        // Processed by HR - mirrors the "Paid" gate for meetings (see PUT /api/meetings/:id).
        // Read back the final value rather than trusting the request body alone, since the form
        // may have been attached earlier via hr-update-details (Save) without being resent here.
        const [updatedRow] = await query('SELECT pte_form_id FROM external_training_requests WHERE id = ?', [id]);
        if (updatedRow?.pte_form_id) {
            query("UPDATE post_training_evaluation_forms SET status = 'PUBLISHED' WHERE id = ? AND deleted_at IS NULL", [updatedRow.pte_form_id])
                .then(() => console.log(`[PTE] Published form ${updatedRow.pte_form_id} - external training request ${id} is Processed.`))
                .catch(e => console.error('[PTE] Failed to publish linked form on Processed:', e.message));
        }

        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// Lets HR save corrections to a request's details (category, title, vendor, dates, etc.) without
// running the full approval flow — status and cost/incentive fields are left untouched.
app.post('/api/external-training/hr-update-details', async (req, res) => {
    try {
        const { id, category, title, vendor, location, start_date, end_date, training_gr_type, participation_type, learning_hours, pte_form_id } = req.body;
        if (!id) return res.status(400).json({ error: 'id is required' });
        const toMysqlDatetime = (v) => v ? v.replace('T', ' ') : null;

        let sql = `UPDATE external_training_requests SET`;
        let params = [];
        const set = (fragment, value) => {
            sql += `${params.length ? ',' : ''} ${fragment}`;
            params.push(value);
        };

        if (category !== undefined) set('category = ?', category);
        if (title !== undefined) set('title = ?', title);
        if (vendor !== undefined) set('vendor = ?', vendor);
        if (location !== undefined) set('location = ?', location);
        if (start_date !== undefined) set('start_date = ?', toMysqlDatetime(start_date));
        if (end_date !== undefined) set('end_date = ?', toMysqlDatetime(end_date));
        if (training_gr_type !== undefined) set('training_gr_type = ?', training_gr_type || null);
        if (participation_type !== undefined) set('participation_type = ?', participation_type || null);
        if (learning_hours !== undefined) set('learning_hours = ?', learning_hours ? Number(learning_hours) : null);
        if (pte_form_id !== undefined) set('pte_form_id = ?', pte_form_id || null);

        if (params.length === 0) return res.json({ success: true });

        sql += ` WHERE id = ?`;
        params.push(id);

        await query(sql, params);
        reconcileExternalTrainingNusawork(id);
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// Manual retry for a Processed request that never made it to Nusawork - covers bulk-imported/historical
// rows (which skip the automatic push entirely) and any row where the automatic push failed silently.
// Awaited (unlike the fire-and-forget calls above) so the button that triggers this can show a real
// pass/fail result instead of the admin only finding out later that the note never showed up.
app.post('/api/external-training/:id/sync-nusawork', async (req, res) => {
    const { id } = req.params;
    const result = await reconcileExternalTrainingNusawork(id);
    if (!result?.success) {
        return res.status(400).json({ error: result?.error || 'Failed to sync to Nusawork.' });
    }
    res.json({ success: true });
});

// HR renews an already-processed certificate's expiry date (and optionally a fresh incentive amount),
// without touching the cost/settlement fields set during the original approval.
app.post('/api/external-training/renew-certificate', async (req, res) => {
    try {
        const { id, certificate_expiry_date, incentive_reward, incentive_payment_type, renewal_certificate_link } = req.body;
        if (!id || !certificate_expiry_date) {
            return res.status(400).json({ error: 'id and certificate_expiry_date are required' });
        }

        await query(
            'UPDATE external_training_requests SET certificate_expiry_date = ?, incentive_reward = ?, incentive_payment_type = ?, renewal_certificate_link = ? WHERE id = ?',
            [certificate_expiry_date, incentive_reward || null, incentive_payment_type || null, renewal_certificate_link || null, id]
        );

        const updated = await query('SELECT * FROM external_training_requests WHERE id = ?', [id]);
        res.json(updated[0]);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// --- INDIVIDUAL DEVELOPMENT PLAN (IDP) ENDPOINTS ---

const IDP_MANDATORY_ACTION = {
    description: '[WAJIB] Memiliki jam learning 48 jam per tahun (rata-rata 4 jam per bulan)',
    targetTime: 'Q1-Q4',
    hoursTarget: 48
};
// The mandatory learning-hours row counts as 1 of the 4, so at least 3 more must have content.
const IDP_MIN_ACTION_PLAN_ITEMS = 4;

const INDO_MONTHS = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
const formatIndoDate = (dateVal) => {
    if (!dateVal) return '';
    const d = new Date(dateVal);
    if (isNaN(d.getTime())) return '';
    return `${d.getDate()} ${INDO_MONTHS[d.getMonth()]} ${d.getFullYear()}`;
};

// Looks up an employee's department (organization_name) and formatted join date from the org-chart
// master data, so the IDP always reflects HR's source of truth instead of free-text entry.
const findEmployeeIdpFields = async (employeeId) => {
    if (!employeeId) return { department: '', join_date_label: '' };
    const rows = await querySimAsset('SELECT organization_name, join_date FROM employees WHERE id_employee = ?', [employeeId]);
    if (rows.length === 0) return { department: '', join_date_label: '' };
    return { department: rows[0].organization_name || '', join_date_label: formatIndoDate(rows[0].join_date) };
};

// 1. Employee creates a new IDP (Draft) for a given year. Resolves the supervisor from the current
// org chart (same lookup External Training uses) and seeds the mandatory learning-hours action item.
app.post('/api/idp', async (req, res) => {
    try {
        const {
            employee_id, employee_name, job_position, period_year,
            achievements, career_goal, existing_skills, development_area,
            action_items
        } = req.body;

        if (!employee_id || !period_year) {
            return res.status(400).json({ error: 'employee_id and period_year are required' });
        }
        if (await isInternEmployeeId(employee_id)) {
            return res.status(403).json({ error: 'Interns are not eligible for an Individual Development Plan.' });
        }

        const supervisor = await findReportToEmployee(employee_id);
        const { department, join_date_label } = await findEmployeeIdpFields(employee_id);

        const result = await query(`
            INSERT INTO idp_plans
            (employee_id, employee_name, job_position, department, supervisor_name, period_year,
             join_date_label, achievements, career_goal, existing_skills, development_area, status)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Draft')
        `, [
            employee_id, employee_name || '', job_position || '', department, supervisor?.full_name || null,
            period_year, join_date_label, achievements || '', career_goal || '',
            existing_skills || '', development_area || ''
        ]);

        const idpId = result.insertId;
        const items = Array.isArray(action_items) ? action_items.filter(i => !i.is_mandatory) : [];

        await query(
            'INSERT INTO idp_action_items (idp_id, action_description, target_time, is_mandatory, is_completed, notes, sort_order) VALUES (?, ?, ?, 1, 0, ?, 0)',
            [idpId, IDP_MANDATORY_ACTION.description, IDP_MANDATORY_ACTION.targetTime, '']
        );
        for (let i = 0; i < items.length; i++) {
            const item = items[i];
            await query(
                'INSERT INTO idp_action_items (idp_id, action_description, target_time, is_mandatory, is_completed, notes, sort_order) VALUES (?, ?, ?, 0, ?, ?, ?)',
                [idpId, item.action_description || '', item.target_time || '', item.is_completed ? 1 : 0, item.notes || '', i + 1]
            );
        }

        res.json({ success: true, id: idpId });
    } catch (err) {
        if (err.code === 'ER_DUP_ENTRY') {
            return res.status(409).json({ error: 'Sudah ada IDP untuk karyawan dan periode ini.' });
        }
        res.status(500).json({ error: err.message });
    }
});

// 1b. HR bulk-imports IDP plans parsed from the standard IDP Excel template (one sheet per employee).
// Employees are matched to the org-chart master data by full name since the sheet carries no employee_id.
// Existing (employee_id, period_year) plans are left untouched and reported as skipped — this endpoint
// only backfills plans that don't exist yet, never overwrites live data.
app.post('/api/idp/bulk-import', async (req, res) => {
    const rows = Array.isArray(req.body.rows) ? req.body.rows : [];
    // Neither HR's own bulk import (IDPManager.tsx) nor the employee's "Import from Excel"
    // (IDPPage.tsx) can auto-approve a plan just because its sheet already carries a review history
    // or an approval date - that data is backfilled either way (see hasApprovalSignal below), but the
    // plan still lands as Pending/Draft, exactly like a sheet with no history at all, so a real HR
    // approval always has to happen through the app afterward rather than being implied by the import.
    const result = { inserted: 0, skipped: 0, duplicates: [], errors: [] };
    // New plans an employee imported for themselves from the IDP menu (IDPPage.tsx sends
    // source: 'self') - HR gets a general ticket for each. Imports from the Admin Panel
    // (IDPManager.tsx) never raise one, even when HR imports their own plan there.
    const isSelfImport = req.body.source === 'self';
    const ownImportedPlans = [];

    for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        const rowLabel = row.sheet_name || row.employee_name || `#${i + 1}`;
        try {
            if (!row.employee_name || !row.period_year) {
                result.errors.push({ row: rowLabel, error: 'Nama karyawan atau periode IDP tidak ditemukan di sheet.' });
                continue;
            }

            const nameMatches = await querySimAsset(
                'SELECT id_employee, full_name, job_position, organization_name, join_date FROM employees WHERE full_name = ? LIMIT 1',
                [row.employee_name.trim()]
            );
            const employee = nameMatches[0] || (await querySimAsset(
                'SELECT id_employee, full_name, job_position, organization_name, join_date FROM employees WHERE full_name LIKE ? LIMIT 1',
                [`%${row.employee_name.trim()}%`]
            ))[0];

            if (!employee) {
                result.errors.push({ row: rowLabel, error: `Karyawan "${row.employee_name}" tidak ditemukan di data organisasi.` });
                continue;
            }
            const employeeId = employee.id_employee;
            // Store the org chart's canonical name/casing ("Januar Ilham") rather than whatever the
            // sheet had typed ("januar ilham") - the row already matched to this exact employee above.
            const employeeName = employee.full_name || row.employee_name.trim();

            // Job Position, Department, Direct Supervisor and Start Date at Company are all sourced
            // from the org chart record matched above, never from the sheet - these are factual/
            // administrative fields the org chart owns, and the sheet's copy is often stale (typed
            // whenever the employee last filled the template) or malformed (e.g. a raw Excel date
            // serial like 39142 leaking through when the "Start Date" cell wasn't a real date).
            const jobPosition = employee.job_position || '';
            const department = employee.organization_name || '';
            const joinDateLabel = formatIndoDate(employee.join_date);
            const supervisor = await findReportToEmployee(employeeId);
            const supervisorName = supervisor?.full_name || null;

            const reviews = Array.isArray(row.reviews) ? row.reviews.filter(r => r.review_date) : [];
            // Prefer the real employee's canonical name over whatever shorthand the sheet used
            // ("Indah R"); if it doesn't match anyone (or matches more than one person), keep the
            // sheet's text as-is rather than guessing.
            const hrNoteBy = row.hr_note_by ? (await matchEmployeeFullName(row.hr_note_by)) || row.hr_note_by : null;

            const existing = await query(
                'SELECT id, hr_note, employee_name, job_position, department, supervisor_name, join_date_label, created_by_date, approved_date FROM idp_plans WHERE employee_id = ? AND period_year = ?',
                [employeeId, row.period_year]
            );
            if (existing.length > 0) {
                // Don't overwrite the existing plan's narrative fields (achievements, career goal, etc.) -
                // those may have been hand-edited live in the app since, and the sheet could be a stale
                // snapshot of them. employee_name/job_position/department/supervisor_name/join_date_label
                // are always the org chart's current values (resolved above), never the sheet's, so they
                // just overwrite outright here too - re-importing an old sheet can't regress them back to
                // a stale snapshot. created_by_date is the one administrative field still sourced from the
                // sheet (the org chart has no equivalent), falling back to the existing value only when the
                // sheet doesn't provide one - it can otherwise silently drift to "today" if the plan gets
                // resubmitted elsewhere in the app. Then backfill whatever else the sheet has that the
                // existing record is missing: review-log rows the plan doesn't have yet (matched by date,
                // so re-importing the same file is idempotent) and the HR note if none is set yet.
                const existingPlan = existing[0];
                await query(
                    `UPDATE idp_plans SET employee_name = ?, job_position = ?, department = ?, supervisor_name = ?, join_date_label = ?, created_by_date = ?, approved_date = ? WHERE id = ?`,
                    [
                        employeeName,
                        jobPosition,
                        department,
                        supervisorName,
                        joinDateLabel,
                        row.created_by_date || existingPlan.created_by_date || null,
                        // Same rule as the fresh-insert path: import never writes a new approval date -
                        // only preserves one the plan already has from a real approval in the app.
                        existingPlan.approved_date || null,
                        existingPlan.id
                    ]
                );
                // Format server-side (DATE_FORMAT) rather than via JS Date/toISOString - the driver
                // returns DATE columns as local-midnight Date objects, and toISOString() converts to
                // UTC, which shifts the date backward a day in timezones ahead of UTC (e.g. WIB/UTC+7).
                const existingReviewDates = new Set(
                    (await query("SELECT DATE_FORMAT(review_date, '%Y-%m-%d') AS review_date FROM idp_reviews WHERE idp_id = ?", [existingPlan.id]))
                        .map(r => r.review_date)
                );
                let reviewsAdded = 0;
                for (const review of reviews) {
                    if (existingReviewDates.has(review.review_date)) continue;
                    await query(
                        `INSERT INTO idp_reviews (idp_id, review_date, supervisor_note, reviewed_by, hr_verification_date, hr_note, hr_verified_by)
                         VALUES (?, ?, ?, ?, ?, ?, ?)`,
                        [existingPlan.id, review.review_date, review.supervisor_note || '', review.reviewed_by || supervisorName,
                        review.hr_verification_date || null, review.hr_note || null, review.hr_verified_by || null]
                    );
                    reviewsAdded++;
                }
                let noteAdded = false;
                if (!existingPlan.hr_note && row.hr_note) {
                    await query('UPDATE idp_plans SET hr_note = ?, hr_note_by = ? WHERE id = ?', [row.hr_note, hrNoteBy, existingPlan.id]);
                    noteAdded = true;
                }
                result.skipped++;
                result.duplicates.push({ row: rowLabel, employee_name: employeeName, period_year: row.period_year, reviewsAdded, noteAdded });
                continue;
            }

            const hasApprovalSignal = !!(row.approved_date || reviews.length > 0);
            const status = (row.created_by_date || hasApprovalSignal) ? 'Pending' : 'Draft';
            // Never persist an approval date via import - approval always has to be a real, explicit
            // action taken through the app, never implied by whatever the sheet happened to carry.
            const approvedDateToStore = null;

            const planResult = await query(`
                INSERT INTO idp_plans
                (employee_id, employee_name, job_position, department, supervisor_name, period_year,
                 join_date_label, achievements, career_goal, existing_skills, development_area, status,
                 created_by_date, approved_date, hr_note, hr_note_by)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `, [
                employeeId, employeeName, jobPosition, department, supervisorName,
                row.period_year, joinDateLabel, row.achievements || '', row.career_goal || '',
                row.existing_skills || '', row.development_area || '', status,
                row.created_by_date || null, approvedDateToStore, row.hr_note || null, hrNoteBy
            ]);
            const idpId = planResult.insertId;

            const actionItems = Array.isArray(row.action_items) ? row.action_items : [];
            const hasMandatory = actionItems.some(a => a.is_mandatory);
            if (!hasMandatory) {
                await query(
                    'INSERT INTO idp_action_items (idp_id, action_description, target_time, is_mandatory, is_completed, notes, sort_order) VALUES (?, ?, ?, 1, 0, ?, 0)',
                    [idpId, IDP_MANDATORY_ACTION.description, IDP_MANDATORY_ACTION.targetTime, '']
                );
            }
            let sortOrder = hasMandatory ? 0 : 1;
            for (const item of actionItems) {
                if (!item.action_description || !item.action_description.trim()) continue;
                await query(
                    'INSERT INTO idp_action_items (idp_id, action_description, target_time, is_mandatory, is_completed, notes, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?)',
                    [idpId, item.action_description.trim(), item.target_time || '', item.is_mandatory ? 1 : 0, item.is_completed ? 1 : 0, item.notes || '', sortOrder++]
                );
            }

            for (const review of reviews) {
                await query(
                    `INSERT INTO idp_reviews (idp_id, review_date, supervisor_note, reviewed_by, hr_verification_date, hr_note, hr_verified_by)
                     VALUES (?, ?, ?, ?, ?, ?, ?)`,
                    [idpId, review.review_date, review.supervisor_note || '', review.reviewed_by || supervisorName,
                        review.hr_verification_date || null, review.hr_note || null, review.hr_verified_by || null]
                );
            }

            result.inserted++;
            if (isSelfImport && req.user?.employee_id && String(employeeId) === String(req.user.employee_id)) {
                ownImportedPlans.push({ planId: idpId, employeeId, employeeName, periodYear: row.period_year });
            }
        } catch (err) {
            result.errors.push({ row: rowLabel, error: err.message });
        }
    }

    res.json(result);

    // Best-effort, after responding - an IS5 outage must never fail or slow down the import.
    for (const plan of ownImportedPlans) {
        notifyHRImportedIdp(plan).catch(err => console.error('[IDP GT] Failed to notify HR of imported IDP:', err.message));
    }
});

// --- IDP GENERAL TICKETS (IS5) ---
// An employee imported their own IDP -> a general ticket for the HR PIC in IS5_TICKET_PIC_HR.
const notifyHRImportedIdp = async ({ planId, employeeId, employeeName, periodYear }) => {
    if (!isGeneralTicketEnabled()) return;
    const hrPic = (process.env.IS5_TICKET_PIC_HR || '').trim();
    if (!hrPic) {
        console.warn('[IDP GT] IS5_TICKET_PIC_HR is not set - skipping the HR ticket for an imported IDP.');
        return;
    }
    await createGeneralTicket({
        kind: 'idp_import',
        reference: `idp:${planId}`,
        subject: `IDP baru diimpor: ${employeeName} (${periodYear})`,
        comment: `${employeeName} (${employeeId}) telah mengimpor Individual Development Plan periode ${periodYear} di LMS. Mohon ditinjau dan disetujui oleh HR.\n\n${lmsAnchor(`/admin/idp?idp=${planId}`, 'Buka IDP')}`,
        timeExpired: generalTicketDueDate(),
        priorityId: 1,
        ticketPic: hrPic
    });
    console.log(`[IDP GT] HR ticket created for ${employeeName}'s imported IDP (${periodYear}).`);
};

// Days before the end of the month when leaders get a ticket for IDPs not yet reviewed that month.
const IDP_REVIEW_REMINDER_DAYS_BEFORE_MONTH_END = 7;

// Monthly, from H-7 before month end: every leader with an Approved IDP (current year) on their
// team that has no review logged this month gets ONE general ticket listing those employees.
// ticket_pic is the leader; followers come from IS5_TICKET_FOLLOW (HR). Safe to run repeatedly -
// sendReminderTicketOnce allows one ticket per leader per month and retries a failed send next run.
const runIdpReviewReminders = async () => {
    const today = nowInWib();
    const year = today.getUTCFullYear();
    const month = today.getUTCMonth() + 1;
    const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
    if (today.getUTCDate() < lastDay - IDP_REVIEW_REMINDER_DAYS_BEFORE_MONTH_END) return;

    const periodMonth = `${year}-${pad2(month)}`;
    const monthStart = `${periodMonth}-01`;
    const monthEnd = `${periodMonth}-${pad2(lastDay)}`;

    const unreviewed = await query(
        `SELECT p.id, p.employee_id, p.employee_name
         FROM idp_plans p
         WHERE p.status = 'Approved' AND p.period_year = ?
           AND NOT EXISTS (
               SELECT 1 FROM idp_reviews r
               WHERE r.idp_id = p.id AND r.review_date BETWEEN ? AND ?
           )`,
        [year, monthStart, monthEnd]
    );
    if (unreviewed.length === 0) return;

    const byLeader = new Map();
    for (const plan of unreviewed) {
        const leader = await findReportToEmployee(plan.employee_id);
        if (!leader?.id_employee) continue;
        const key = String(leader.id_employee);
        if (!byLeader.has(key)) byLeader.set(key, { leader, plans: [] });
        byLeader.get(key).plans.push(plan);
    }

    const monthLabel = `${INDO_MONTHS[month - 1]} ${year}`;
    for (const [leaderId, { leader, plans }] of byLeader) {
        const names = plans.map(p => `- ${p.employee_name} (${p.employee_id})`).join('\n');
        try {
            const sent = await sendReminderTicketOnce({
                kind: 'idp_review',
                recipientEmployeeId: leaderId,
                period: periodMonth,
                refIds: plans.map(p => p.id),
                ticket: {
                    subject: `Pengingat review IDP ${monthLabel}`,
                    comment: `Halo ${leader.full_name}, IDP anggota tim berikut belum direview untuk bulan ${monthLabel}:\n${names}\n\nMohon lakukan review 1-on-1 dan catat di LMS sebelum akhir bulan.\n\n${lmsAnchor('/idp', 'Buka IDP Tim')}`,
                    timeExpired: generalTicketDueDate(),
                    priorityId: 1
                }
            });
            if (sent) console.log(`[IDP GT] Review reminder sent to ${leader.full_name} for ${plans.length} IDP(s), ${periodMonth}.`);
        } catch (err) {
            console.error(`[IDP GT] Review reminder for ${leader.full_name} failed:`, err.message);
        }
    }
};

// 2. Employee's own plans across years.
app.get('/api/idp/my-plans', async (req, res) => {
    try {
        const { employee_id } = req.query;
        if (!employee_id) return res.json([]);
        const plans = await query('SELECT * FROM idp_plans WHERE employee_id = ? ORDER BY period_year DESC', [employee_id]);
        if (plans.length === 0) return res.json([]);

        // Reviews are attached per plan so the header notification poller can tell the employee
        // when their supervisor logs a new 1-on-1 review (see DashboardLayout.tsx).
        const placeholders = plans.map(() => '?').join(',');
        const reviews = await query(
            `SELECT * FROM idp_reviews WHERE idp_id IN (${placeholders}) ORDER BY review_date ASC, id ASC`,
            plans.map(p => p.id)
        );
        const reviewsByPlan = {};
        for (const r of reviews) (reviewsByPlan[r.idp_id] ||= []).push(r);

        res.json(plans.map(p => ({ ...p, reviews: reviewsByPlan[p.id] || [] })));
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// 3. Supervisor's team plans (same org-chart resolution as /api/external-training/subordinates).
app.get('/api/idp/subordinates', async (req, res) => {
    try {
        const { leader_id } = req.query;
        if (!leader_id) return res.json([]);

        const leaderInfo = await querySimAsset('SELECT user_id, full_name, nickname FROM employees WHERE id_employee = ?', [leader_id]);
        if (leaderInfo.length === 0) return res.json([]);
        const leader = leaderInfo[0];
        const leaderUserId = leader.user_id;
        const leaderFullName = leader.full_name;
        const leaderNickName = leader.nickname || leaderFullName;

        // Interns are excluded here too - they're never eligible for an IDP (see the isInternEmployeeId
        // guard on POST /api/idp), so this list stays consistent even if a stray plan somehow exists.
        const subordinatesResult = await querySimAsset(`
            SELECT id_employee FROM employees
            WHERE (id_report_to_value = ?
               OR id_report_to = ?
               OR id_report_to = ?
               OR id_report_to LIKE ?
               OR id_report_to LIKE ?)
               AND (status_join IS NULL OR status_join != 'Internship')
        `, [leaderUserId, leaderFullName, leaderNickName, `${leaderFullName},%`, `%,${leaderFullName},%`]);

        const subordinateIds = subordinatesResult.map(s => s.id_employee);
        if (subordinateIds.length === 0) return res.json([]);

        const placeholders = subordinateIds.map(() => '?').join(',');
        const rows = await query(
            `SELECT * FROM idp_plans WHERE employee_id IN (${placeholders}) ORDER BY period_year DESC, created_at DESC`,
            subordinateIds
        );
        res.json(rows);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// Team members for a leader (used by the "Kompetensi Teams" page to show each report's
// applicable competencies). isSupervisor is included per member so "Semua Posisi Level
// Leader" competency rows can be matched even when a direct report is themselves a leader.
app.get('/api/team-members', async (req, res) => {
    try {
        const { leader_id } = req.query;
        if (!leader_id) return res.json([]);

        const subordinateIds = await findSubordinateEmployeeIds(leader_id);
        if (subordinateIds.length === 0) return res.json([]);

        const placeholders = subordinateIds.map(() => '?').join(',');
        const members = await querySimAsset(
            `SELECT id_employee, full_name, job_position FROM employees
             WHERE id_employee IN (${placeholders}) AND (active_status IS NULL OR active_status != 'Resign')
               AND (status_join IS NULL OR status_join != 'Internship')
             ORDER BY full_name ASC`,
            subordinateIds
        );

        const reportToSet = await getSupervisorIdentifierSet();
        const mapped = members.map(m => ({
            employeeId: m.id_employee,
            fullName: m.full_name,
            jobPosition: m.job_position,
            isSupervisor: reportToSet.has(m.id_employee) || reportToSet.has(m.full_name)
        }));
        res.json(mapped);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// 4. HR/admin: every IDP. Excludes interns (see the isInternEmployeeId guard on POST /api/idp) so a
// stray plan from before that guard existed doesn't linger in HR's view either.
app.get('/api/idp/all', async (req, res) => {
    try {
        // reviewed_year_months lets HR see, month by month since the plan was created, which months
        // the supervisor actually logged a review for — without expanding every plan individually.
        const plans = await query(`
            SELECT p.*, (
                SELECT GROUP_CONCAT(DISTINCT DATE_FORMAT(r.review_date, '%Y-%m') ORDER BY r.review_date)
                FROM idp_reviews r WHERE r.idp_id = p.id
            ) AS reviewed_year_months,
            -- The monthly review strip starts no earlier than the employee's join month, so a
            -- mid-year joiner isn't shown as missing reviews for months before they started.
            (SELECT e.join_date FROM employees e WHERE e.id_employee = p.employee_id LIMIT 1) AS employee_join_date
            FROM idp_plans p
            WHERE NOT EXISTS (
                SELECT 1 FROM employees e WHERE e.id_employee = p.employee_id AND e.status_join = 'Internship'
            )
            ORDER BY p.period_year DESC, p.created_at DESC
        `);
        res.json(plans);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// 5. Employee edits a Draft/Rejected plan (narrative fields + non-mandatory action rows). Re-submitting
// after a rejection clears the rejection reason and puts it back in Draft.
app.put('/api/idp/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const existing = await query('SELECT status, employee_id FROM idp_plans WHERE id = ?', [id]);
        if (existing.length === 0) return res.status(404).json({ error: 'IDP not found' });
        const currentStatus = existing[0].status;

        const {
            job_position, achievements, career_goal,
            existing_skills, development_area, action_items
        } = req.body;

        const { department, join_date_label } = await findEmployeeIdpFields(existing[0].employee_id);

        // Draft/Rejected edits stay in the (re-)submit flow — status resets to Draft. Editing an
        // already Pending/Approved plan saves the changes in place without requiring re-approval.
        const nextStatus = ['Draft', 'Rejected'].includes(currentStatus) ? 'Draft' : currentStatus;

        await query(`
            UPDATE idp_plans SET job_position = ?, department = ?, join_date_label = ?, achievements = ?,
            career_goal = ?, existing_skills = ?, development_area = ?, status = ?, rejection_reason = NULL
            WHERE id = ?
        `, [job_position || '', department, join_date_label, achievements || '', career_goal || '', existing_skills || '', development_area || '', nextStatus, id]);

        if (Array.isArray(action_items)) {
            const currentItems = await query('SELECT id, is_mandatory FROM idp_action_items WHERE idp_id = ?', [id]);
            const hasMandatory = currentItems.some(i => i.is_mandatory);
            const nonMandatoryIds = currentItems.filter(i => !i.is_mandatory).map(i => i.id);
            if (nonMandatoryIds.length > 0) {
                await query(`DELETE FROM idp_action_items WHERE id IN (${nonMandatoryIds.map(() => '?').join(',')})`, nonMandatoryIds);
            }
            let sortOrder = 1;
            for (const item of action_items) {
                if (item.is_mandatory) continue; // the mandatory row is server-managed, never replaced here
                await query(
                    'INSERT INTO idp_action_items (idp_id, action_description, target_time, is_mandatory, is_completed, notes, sort_order) VALUES (?, ?, ?, 0, ?, ?, ?)',
                    [id, item.action_description || '', item.target_time || '', item.is_completed ? 1 : 0, item.notes || '', sortOrder++]
                );
            }
            if (!hasMandatory) {
                await query(
                    'INSERT INTO idp_action_items (idp_id, action_description, target_time, is_mandatory, is_completed, notes, sort_order) VALUES (?, ?, ?, 1, 0, ?, 0)',
                    [id, IDP_MANDATORY_ACTION.description, IDP_MANDATORY_ACTION.targetTime, '']
                );
            }
        }

        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// 6. Employee submits a Draft/Rejected plan for supervisor approval.
app.post('/api/idp/:id/submit', async (req, res) => {
    try {
        const { id } = req.params;
        const rows = await query('SELECT status FROM idp_plans WHERE id = ?', [id]);
        if (rows.length === 0) return res.status(404).json({ error: 'IDP not found' });
        if (!['Draft', 'Rejected'].includes(rows[0].status)) {
            return res.status(400).json({ error: 'Only Draft or Rejected plans can be submitted.' });
        }

        const items = await query('SELECT action_description FROM idp_action_items WHERE idp_id = ?', [id]);
        const filledCount = items.filter(i => (i.action_description || '').trim()).length;
        if (filledCount < IDP_MIN_ACTION_PLAN_ITEMS) {
            return res.status(400).json({ error: `The Development Action Plan needs at least ${IDP_MIN_ACTION_PLAN_ITEMS} rows (including the mandatory Learning Hours item).` });
        }

        await query("UPDATE idp_plans SET status = 'Pending', created_by_date = COALESCE(created_by_date, CURDATE()) WHERE id = ?", [id]);
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// 7. HR approves or rejects a Pending plan — the first approval step. Only after HR approval can
// the employee's supervisor log monthly 1-on-1 reviews against the plan (see endpoint 8 below).
app.post('/api/idp/:id/approve', async (req, res) => {
    try {
        const { id } = req.params;
        const { status, approved_by, rejection_reason } = req.body;
        if (!['Approved', 'Rejected'].includes(status)) {
            return res.status(400).json({ error: "status must be 'Approved' or 'Rejected'" });
        }
        if (status === 'Rejected') {
            await query('UPDATE idp_plans SET status = ?, rejection_reason = ? WHERE id = ?', [status, rejection_reason || null, id]);
        } else {
            await query("UPDATE idp_plans SET status = ?, approved_by = ?, approved_date = CURDATE() WHERE id = ?", [status, approved_by || null, id]);
        }
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// 7b. HR adds/updates a general feedback note on the plan — what's missing or needs to be added.
// Independent of the approve/reject decision, so HR can leave guidance without changing the status.
app.post('/api/idp/:id/hr-note', async (req, res) => {
    try {
        const { id } = req.params;
        const { hr_note, hr_note_by } = req.body;
        await query('UPDATE idp_plans SET hr_note = ?, hr_note_by = ? WHERE id = ?', [hr_note || null, hr_note_by || null, id]);
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// 8. Supervisor logs a periodic 1-on-1 review entry against the plan.
app.post('/api/idp/:id/review', async (req, res) => {
    try {
        const { id } = req.params;
        const { review_date, supervisor_note, reviewed_by } = req.body;
        if (!review_date || !supervisor_note) {
            return res.status(400).json({ error: 'review_date and supervisor_note are required' });
        }
        const result = await query(
            'INSERT INTO idp_reviews (idp_id, review_date, supervisor_note, reviewed_by) VALUES (?, ?, ?, ?)',
            [id, review_date, supervisor_note, reviewed_by || null]
        );
        res.json({ success: true, id: result.insertId });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// 9. Toggle/annotate a single action item. The mandatory learning-hours row tracks automatically
// (via computeLearningStats) and can't have its completion flipped manually.
app.patch('/api/idp/action-items/:itemId', async (req, res) => {
    try {
        const { itemId } = req.params;
        const { is_completed, notes } = req.body;
        const rows = await query('SELECT is_mandatory FROM idp_action_items WHERE id = ?', [itemId]);
        if (rows.length === 0) return res.status(404).json({ error: 'Action item not found' });
        if (rows[0].is_mandatory && is_completed !== undefined) {
            return res.status(400).json({ error: 'The mandatory learning-hours item tracks automatically and cannot be checked manually.' });
        }
        const fields = [];
        const params = [];
        if (is_completed !== undefined) { fields.push('is_completed = ?'); params.push(is_completed ? 1 : 0); }
        if (notes !== undefined) { fields.push('notes = ?'); params.push(notes); }
        if (fields.length === 0) return res.json({ success: true });
        params.push(itemId);
        await query(`UPDATE idp_action_items SET ${fields.join(', ')} WHERE id = ?`, params);
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// 10. Full detail: plan + action items + reviews + auto-computed learning-hours progress for the
// mandatory item, so the frontend never has to make a second call to /api/learning-stats.
app.get('/api/idp/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const plans = await query('SELECT * FROM idp_plans WHERE id = ?', [id]);
        if (plans.length === 0) return res.status(404).json({ error: 'IDP not found' });
        const plan = plans[0];

        const actionItems = await query('SELECT * FROM idp_action_items WHERE idp_id = ? ORDER BY sort_order ASC, id ASC', [id]);
        const reviews = await query('SELECT * FROM idp_reviews WHERE idp_id = ? ORDER BY review_date ASC, id ASC', [id]);

        let learningProgress = { totalJam: 0, target: IDP_MANDATORY_ACTION.hoursTarget };
        try {
            const stats = await computeLearningStats({
                employee_id: plan.employee_id,
                startDate: `${plan.period_year}-01-01`,
                endDate: `${plan.period_year}-12-31`
            });
            learningProgress = { totalJam: stats.totalJam, target: IDP_MANDATORY_ACTION.hoursTarget };
        } catch (e) {
            console.warn('[IDP] Failed to compute learning progress:', e.message);
        }

        res.json({ ...plan, action_items: actionItems, reviews, learningProgress });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// 11. HR permanently deletes an IDP plan (e.g. one created in error, or bad import data). Action items
// and reviews cascade-delete with it via the FK constraints on idp_action_items/idp_reviews.
app.delete('/api/idp/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const result = await query('DELETE FROM idp_plans WHERE id = ?', [id]);
        if (result.affectedRows === 0) return res.status(404).json({ error: 'IDP not found' });
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// Admin Report Endpoint
app.get('/api/admin/quiz-reports', async (req, res) => {
    try {
        const sql = `
            SELECT
                qr.id,
                qr.student_id,
                COALESCE(u.name, qr.student_name) as student_name,
                u.branch,
                u.employee_id,
                -- Online-module quizzes carry course_id; Internal/External Training quizzes carry
                -- meeting_id instead (see the meeting participant import) - fall back to the
                -- meeting's title so those don't show up as "Unknown Course".
                COALESCE(c.title, m.title) as course_title,
                cm.title as module_title,
                qr.score,
                qr.date,
                qr.module_id,
                qr.quiz_type
            FROM quiz_results qr
            LEFT JOIN users u ON qr.student_id = u.id
            LEFT JOIN courses c ON qr.course_id = c.id
            LEFT JOIN course_modules cm ON qr.module_id = cm.id
            LEFT JOIN meetings m ON qr.meeting_id = m.id
            ORDER BY qr.date DESC
        `;
        const results = await query(sql);
        res.json(results);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// --- INCENTIVES ---
// --- INCENTIVES ---
app.get('/api/incentives', async (req, res) => {
    try {
        const rows = await query('SELECT * FROM incentives ORDER BY id DESC');
        // Map snake_case to camelCase
        const mapped = rows.map(i => ({
            ...i,
            employeeName: i.employee_name,
            courseName: i.course_name,
            evidenceUrl: i.evidence_url,
            startDate: i.start_date,
            endDate: i.end_date,
            monthlyAmount: i.monthly_amount,
            paymentType: i.payment_type,
            approvedDate: i.approved_date
        }));
        res.json(mapped);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/incentives', async (req, res) => {
    try {
        const i = req.body;
        const status = i.status || 'Pending';
        const result = await query(
            'INSERT INTO incentives (employee_name, employee_id, course_name, description, start_date, end_date, evidence_url, status, reward, payment_type, approved_date) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
            [
                i.employeeName,
                i.employee_id,
                i.courseName,
                i.description || '',
                new Date(i.startDate),
                new Date(i.endDate),
                i.evidenceUrl || '',
                status,
                i.reward || 0,
                i.paymentType || 'Recurring',
                status === 'Active' ? new Date() : null
            ]
        );
        const newInc = await query('SELECT * FROM incentives WHERE id = ?', [result.insertId]);
        const mapping = {
            employee_name: 'employeeName',
            course_name: 'courseName',
            evidence_url: 'evidenceUrl',
            start_date: 'startDate',
            end_date: 'endDate',
            monthly_amount: 'monthlyAmount'
        };
        res.json(mapObject(newInc[0], mapping));
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.put('/api/incentives/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const updates = req.body;

        let sql = 'UPDATE incentives SET ';
        const params = [];

        if (updates.status) {
            sql += 'status = ?, ';
            params.push(updates.status);
        }
        if (updates.reward) {
            sql += 'reward = ?, ';
            params.push(updates.reward);
        }
        if (updates.paymentType) {
            sql += 'payment_type = ?, ';
            params.push(updates.paymentType);
        }
        if (updates.status === 'Active') {
            sql += 'approved_date = ?, ';
            params.push(new Date());
        }
        if (updates.endDate) {
            sql += 'end_date = ?, ';
            params.push(updates.endDate);
        }

        // --- Robus ID Sync ---
        // If we don't have an employee_id in the record, try to find it from the users table by name
        const currentRes = await query('SELECT employee_name, employee_id FROM incentives WHERE id = ?', [id]);
        const current = currentRes[0];
        if (current && !current.employee_id) {
            const userRows = await query('SELECT employee_id FROM users WHERE name = ?', [current.employee_name]);
            if (userRows.length > 0 && userRows[0].employee_id) {
                sql += 'employee_id = ?, ';
                params.push(userRows[0].employee_id);
            }
        }

        sql = sql.slice(0, -2);
        sql += ' WHERE id = ?';
        params.push(id);

        if (params.length > 1) {
            await query(sql, params);
        }

        const updated = await query('SELECT * FROM incentives WHERE id = ?', [id]);
        const mapping = {
            employee_name: 'employeeName',
            course_name: 'courseName',
            evidence_url: 'evidenceUrl',
            start_date: 'startDate',
            end_date: 'endDate',
            monthly_amount: 'monthlyAmount',
            payment_type: 'paymentType',
            approved_date: 'approvedDate'
        };
        res.json(mapObject(updated[0], mapping));
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/incentives/:id', async (req, res) => {
    try {
        const { id } = req.params;
        await query('DELETE FROM incentives WHERE id = ?', [id]);
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// --- COMPETENCY TEMPLATES (Admin > Settings > Template Kompetensi) ---
// A non-HR requester (a team leader) may only write templates for a position held by one of
// their own direct/indirect reports - never company-wide. HR bypasses this entirely. When no
// requesterId is supplied at all (e.g. an older/internal caller), we skip the check rather than
// reject, since these endpoints historically had no auth and other callers may not send one yet.
const getManagedPositions = async (leaderId) => {
    const subordinateIds = await findSubordinateEmployeeIds(leaderId);
    if (subordinateIds.length === 0) return [];
    const placeholders = subordinateIds.map(() => '?').join(',');
    const rows = await querySimAsset(
        `SELECT DISTINCT job_position FROM employees
         WHERE id_employee IN (${placeholders}) AND (active_status IS NULL OR active_status != 'Resign')
           AND (status_join IS NULL OR status_join != 'Internship')
           AND job_position IS NOT NULL AND job_position != ''`,
        subordinateIds
    );
    return rows.map(r => r.job_position);
};

const getRequesterRole = async (requesterId) => {
    if (!requesterId) return null;
    const userRows = await query('SELECT role FROM users WHERE employee_id = ?', [requesterId]);
    return userRows[0]?.role || 'STAFF';
};

const authorizeTemplateWrite = async (requesterId, position) => {
    if (!requesterId) return null;
    const role = await getRequesterRole(requesterId);
    if (role === 'HR') return null;
    const managedPositions = await getManagedPositions(requesterId);
    if (!position || !managedPositions.includes(position)) {
        return 'You can only manage competencies for positions within your own team.';
    }
    return null;
};

// Every write from a team leader's dictionary (Add/Edit/Delete on FUNCTIONAL, or Standard override
// on CORE - HR leaders included) is queued here instead of touching real data - HR approving the request is what actually
// applies it (see the /approve handler below), and rejecting it just marks the row REJECTED.
const mapChangeRequest = (row) => ({
    id: row.id,
    requesterId: row.requester_id,
    position: row.position,
    action: row.action,
    competencyType: row.competency_type,
    competencyName: row.competency_name,
    targetTemplateId: row.target_template_id,
    payload: row.payload_json ? JSON.parse(row.payload_json) : null,
    previous: row.previous_json ? JSON.parse(row.previous_json) : null,
    status: row.status,
    reviewedBy: row.reviewed_by,
    reviewedAt: row.reviewed_at,
    rejectionReason: row.rejection_reason,
    createdAt: row.created_at,
    updatedAt: row.updated_at
});

const createChangeRequest = async ({ requesterId, position, action, competencyType, competencyName, targetTemplateId, payload, previous }) => {
    const result = await query(
        `INSERT INTO competency_change_requests
         (requester_id, position, action, competency_type, competency_name, target_template_id, payload_json, previous_json)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
            requesterId, position, action, competencyType, competencyName,
            targetTemplateId || null,
            payload ? JSON.stringify(payload) : null,
            previous ? JSON.stringify(previous) : null
        ]
    );
    const rows = await query('SELECT * FROM competency_change_requests WHERE id = ?', [result.insertId]);
    return mapChangeRequest(rows[0]);
};

const mapCompetencyTemplate = (row) => ({
    ...row,
    competencyType: row.jenis_kompetensi,
    position: row.posisi,
    competencyName: row.kompetensi,
    operationalDefinition: row.definisi_operasional,
    standardLevelIndicator: row.indikator_level_standar,
    jdReference: row.acuan_jd,
    standardScore: row.standar_jabatan,
    createdAt: row.created_at,
    updatedAt: row.updated_at
});

app.get('/api/competency-templates', async (req, res) => {
    try {
        const rows = await query('SELECT * FROM competency_templates ORDER BY id ASC');
        res.json(rows.map(mapCompetencyTemplate));
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/competency-templates', async (req, res) => {
    try {
        const c = req.body;
        const authError = await authorizeTemplateWrite(c.requesterId, c.position);
        if (authError) return res.status(403).json({ error: authError });
        const payload = {
            competencyType: c.competencyType || '',
            position: c.position || '',
            competencyName: c.competencyName || '',
            operationalDefinition: c.operationalDefinition || '',
            standardLevelIndicator: c.standardLevelIndicator || '',
            jdReference: c.jdReference || '',
            standardScore: c.standardScore || null
        };
        // Anything sent from the leader's dictionary (it always carries requesterId) is queued for
        // HR approval - even when that leader is HR themselves, since that menu sits outside the
        // Admin Panel. Only the Admin Panel's Kamus Kompetensi (no requesterId) writes directly.
        if (c.requesterId) {
            const request = await createChangeRequest({
                requesterId: c.requesterId,
                position: payload.position,
                action: 'ADD',
                competencyType: payload.competencyType,
                competencyName: payload.competencyName,
                payload
            });
            return res.json({ pending: true, request });
        }
        const result = await query(
            'INSERT INTO competency_templates (jenis_kompetensi, posisi, kompetensi, definisi_operasional, indikator_level_standar, acuan_jd, standar_jabatan) VALUES (?, ?, ?, ?, ?, ?, ?)',
            [payload.competencyType, payload.position, payload.competencyName, payload.operationalDefinition, payload.standardLevelIndicator, payload.jdReference, payload.standardScore]
        );
        const created = await query('SELECT * FROM competency_templates WHERE id = ?', [result.insertId]);
        res.json(mapCompetencyTemplate(created[0]));
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.put('/api/competency-templates/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const c = req.body;
        const existingRows = await query('SELECT * FROM competency_templates WHERE id = ?', [id]);
        if (existingRows.length === 0) return res.status(404).json({ error: 'Template not found' });
        const currentAuthError = await authorizeTemplateWrite(c.requesterId, existingRows[0].posisi);
        if (currentAuthError) return res.status(403).json({ error: currentAuthError });
        const newAuthError = await authorizeTemplateWrite(c.requesterId, c.position || existingRows[0].posisi);
        if (newAuthError) return res.status(403).json({ error: newAuthError });
        const payload = {
            competencyType: c.competencyType || '',
            position: c.position || existingRows[0].posisi,
            competencyName: c.competencyName || '',
            operationalDefinition: c.operationalDefinition || '',
            standardLevelIndicator: c.standardLevelIndicator || '',
            jdReference: c.jdReference || '',
            standardScore: c.standardScore || null
        };
        // Queued even for an HR leader - see the POST handler above.
        if (c.requesterId) {
            const existing = mapCompetencyTemplate(existingRows[0]);
            const request = await createChangeRequest({
                requesterId: c.requesterId,
                position: existing.position,
                action: 'EDIT',
                competencyType: payload.competencyType,
                competencyName: payload.competencyName,
                targetTemplateId: existing.id,
                payload,
                previous: existing
            });
            return res.json({ pending: true, request });
        }
        await query(
            'UPDATE competency_templates SET jenis_kompetensi = ?, posisi = ?, kompetensi = ?, definisi_operasional = ?, indikator_level_standar = ?, acuan_jd = ?, standar_jabatan = ? WHERE id = ?',
            [payload.competencyType, payload.position, payload.competencyName, payload.operationalDefinition, payload.standardLevelIndicator, payload.jdReference, payload.standardScore, id]
        );
        const updated = await query('SELECT * FROM competency_templates WHERE id = ?', [id]);
        res.json(mapCompetencyTemplate(updated[0]));
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/competency-templates/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { requesterId } = req.query;
        const existingRows = await query('SELECT * FROM competency_templates WHERE id = ?', [id]);
        if (existingRows.length === 0) return res.status(404).json({ error: 'Template not found' });
        const authError = await authorizeTemplateWrite(requesterId, existingRows[0].posisi);
        if (authError) return res.status(403).json({ error: authError });
        // Queued even for an HR leader - see the POST handler above.
        if (requesterId) {
            const existing = mapCompetencyTemplate(existingRows[0]);
            const request = await createChangeRequest({
                requesterId,
                position: existing.position,
                action: 'DELETE',
                competencyType: existing.competencyType,
                competencyName: existing.competencyName,
                targetTemplateId: existing.id,
                previous: existing
            });
            return res.json({ pending: true, request });
        }
        await query('DELETE FROM competency_templates WHERE id = ?', [id]);
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// --- COMPETENCY STANDARD OVERRIDES (a team leader's own Standard, isolated from HR's template) ---
const mapStandardOverride = (row) => ({
    position: row.position,
    competencyType: row.competency_type,
    competencyName: row.competency_name,
    standardScore: row.standard_score
});

app.get('/api/competency-standard-overrides', async (req, res) => {
    try {
        const rows = await query('SELECT * FROM competency_standard_overrides');
        res.json(rows.map(mapStandardOverride));
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.put('/api/competency-standard-overrides', async (req, res) => {
    try {
        const { position, competencyType, competencyName, standardScore, requesterId } = req.body;
        const authError = await authorizeTemplateWrite(requesterId, position);
        if (authError) return res.status(403).json({ error: authError });
        // Queued even for an HR leader - see POST /api/competency-templates.
        if (requesterId) {
            const existingRows = await query(
                'SELECT * FROM competency_standard_overrides WHERE position = ? AND competency_type = ? AND competency_name = ?',
                [position, competencyType, competencyName]
            );
            const request = await createChangeRequest({
                requesterId,
                position,
                action: 'STANDARD_OVERRIDE',
                competencyType,
                competencyName,
                payload: { standardScore },
                previous: existingRows[0] ? mapStandardOverride(existingRows[0]) : null
            });
            return res.json({ pending: true, request });
        }
        await query(
            `INSERT INTO competency_standard_overrides (position, competency_type, competency_name, standard_score)
             VALUES (?, ?, ?, ?)
             ON DUPLICATE KEY UPDATE standard_score = VALUES(standard_score)`,
            [position, competencyType, competencyName, standardScore]
        );
        const updated = await query(
            'SELECT * FROM competency_standard_overrides WHERE position = ? AND competency_type = ? AND competency_name = ?',
            [position, competencyType, competencyName]
        );
        res.json(mapStandardOverride(updated[0]));
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// --- COMPETENCY CHANGE REQUESTS (HR review queue for leader Add/Edit/Delete/Standard actions) ---
app.get('/api/competency-change-requests', async (req, res) => {
    try {
        const { status, requesterId } = req.query;
        const conditions = [];
        const params = [];
        if (status) { conditions.push('status = ?'); params.push(status); }
        if (requesterId) { conditions.push('requester_id = ?'); params.push(requesterId); }
        const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
        const rows = await query(`SELECT * FROM competency_change_requests ${where} ORDER BY created_at DESC`, params);
        res.json(rows.map(mapChangeRequest));
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.put('/api/competency-change-requests/:id/approve', async (req, res) => {
    try {
        const { id } = req.params;
        const { reviewerId } = req.body;
        const role = await getRequesterRole(reviewerId);
        if (role !== 'HR') return res.status(403).json({ error: 'Only HR can approve requests.' });
        const rows = await query('SELECT * FROM competency_change_requests WHERE id = ?', [id]);
        if (rows.length === 0) return res.status(404).json({ error: 'Request not found' });
        const reqRow = rows[0];
        if (reqRow.status !== 'PENDING') return res.status(409).json({ error: 'This request has already been reviewed.' });
        const payload = reqRow.payload_json ? JSON.parse(reqRow.payload_json) : null;

        if (reqRow.action === 'ADD') {
            await query(
                'INSERT INTO competency_templates (jenis_kompetensi, posisi, kompetensi, definisi_operasional, indikator_level_standar, acuan_jd, standar_jabatan) VALUES (?, ?, ?, ?, ?, ?, ?)',
                [payload.competencyType, payload.position, payload.competencyName, payload.operationalDefinition, payload.standardLevelIndicator, payload.jdReference, payload.standardScore]
            );
        } else if (reqRow.action === 'EDIT') {
            await query(
                'UPDATE competency_templates SET jenis_kompetensi = ?, posisi = ?, kompetensi = ?, definisi_operasional = ?, indikator_level_standar = ?, acuan_jd = ?, standar_jabatan = ? WHERE id = ?',
                [payload.competencyType, payload.position, payload.competencyName, payload.operationalDefinition, payload.standardLevelIndicator, payload.jdReference, payload.standardScore, reqRow.target_template_id]
            );
        } else if (reqRow.action === 'DELETE') {
            await query('DELETE FROM competency_templates WHERE id = ?', [reqRow.target_template_id]);
        } else if (reqRow.action === 'STANDARD_OVERRIDE') {
            await query(
                `INSERT INTO competency_standard_overrides (position, competency_type, competency_name, standard_score)
                 VALUES (?, ?, ?, ?)
                 ON DUPLICATE KEY UPDATE standard_score = VALUES(standard_score)`,
                [reqRow.position, reqRow.competency_type, reqRow.competency_name, payload.standardScore]
            );
        }

        await query(
            "UPDATE competency_change_requests SET status = 'APPROVED', reviewed_by = ?, reviewed_at = NOW() WHERE id = ?",
            [reviewerId, id]
        );
        const updated = await query('SELECT * FROM competency_change_requests WHERE id = ?', [id]);
        res.json(mapChangeRequest(updated[0]));
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.put('/api/competency-change-requests/:id/reject', async (req, res) => {
    try {
        const { id } = req.params;
        const { reviewerId, reason } = req.body;
        const role = await getRequesterRole(reviewerId);
        if (role !== 'HR') return res.status(403).json({ error: 'Only HR can reject requests.' });
        const rows = await query('SELECT * FROM competency_change_requests WHERE id = ?', [id]);
        if (rows.length === 0) return res.status(404).json({ error: 'Request not found' });
        if (rows[0].status !== 'PENDING') return res.status(409).json({ error: 'This request has already been reviewed.' });
        await query(
            "UPDATE competency_change_requests SET status = 'REJECTED', reviewed_by = ?, reviewed_at = NOW(), rejection_reason = ? WHERE id = ?",
            [reviewerId, reason || null, id]
        );
        const updated = await query('SELECT * FROM competency_change_requests WHERE id = ?', [id]);
        res.json(mapChangeRequest(updated[0]));
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// --- COMPETENCY ASSESSMENTS (Kompetensi Teams: leader-submitted "Aktual" scores) ---
// Assessments are scoped to a quarter+year period. A period becomes immutable as soon as any
// row exists for it (enforced in the POST handler below) - there's no separate approval step,
// saving is what makes a quarter final.

// One row per quarter/year the employee has been assessed for - used to notify the employee
// when their leader submits a new period, since /latest requires already knowing the period.
// --- COMPETENCY ASSESSMENT REMINDERS (IS5 general tickets) ---
const COMPETENCY_REMINDER_DAYS_BEFORE_QUARTER_END = 7;
const COMPETENCY_ALL_POSITIONS = 'Umum';
const COMPETENCY_ALL_LEADERS = 'Semua Posisi Level Leader';

// Server-side twin of getMatchedCompetencies (src/utils/competency.ts), reduced to "is there at
// least one competency to assess?" - a leader can't fill in an assessment for someone without any.
const hasAssessableCompetencies = (jobPosition, isSupervisor, templatePositions) => {
    const position = jobPosition || '';
    if (templatePositions.has(COMPETENCY_ALL_POSITIONS)) return true;
    if (isSupervisor && templatePositions.has(COMPETENCY_ALL_LEADERS)) return true;
    for (const p of templatePositions) {
        if (p === COMPETENCY_ALL_POSITIONS || p === COMPETENCY_ALL_LEADERS) continue;
        if (p === position || (position.startsWith(p) && position[p.length] === ' ')) return true;
    }
    return false;
};

// Mirrors findSubordinateEmployeeIds' SQL on already-loaded employee rows (case-insensitive like
// MySQL's collation): by id_report_to_value = leader's user_id, id_report_to = full name or nickname,
// or the leader's full name as any but the last entry of a comma-separated id_report_to.
const reportsToLeader = (employee, leader) => {
    const lc = (v) => String(v ?? '').toLowerCase();
    if (leader.user_id != null && employee.id_report_to_value != null && lc(employee.id_report_to_value) === lc(leader.user_id)) return true;
    const reportTo = lc(employee.id_report_to);
    if (!reportTo) return false;
    const fullName = lc(leader.full_name);
    if (reportTo === fullName || reportTo === lc(leader.nickname || leader.full_name)) return true;
    return reportTo.split(',').slice(0, -1).includes(fullName);
};

const isActiveNonIntern = (e) => e.active_status !== 'Resign' && e.status_join !== 'Internship';

// From H-7 before the current quarter ends: every leader whose team (same members as the
// "Kompetensi Tim" page - active, non-intern) still has someone with no competency assessment for
// this quarter gets ONE general ticket naming them. ticket_pic is the leader; followers come from
// IS5_TICKET_FOLLOW. Safe to run repeatedly - one ticket per leader per quarter.
const runCompetencyAssessmentReminders = async () => {
    const today = nowInWib();
    const year = today.getUTCFullYear();
    const quarter = Math.floor(today.getUTCMonth() / 3) + 1;
    const quarterEnd = new Date(Date.UTC(year, quarter * 3, 0));
    const todayDate = new Date(Date.UTC(year, today.getUTCMonth(), today.getUTCDate()));
    const daysLeft = Math.round((quarterEnd - todayDate) / (24 * 60 * 60 * 1000));
    if (daysLeft > COMPETENCY_REMINDER_DAYS_BEFORE_QUARTER_END) return;

    const templatePositions = new Set((await query('SELECT DISTINCT posisi FROM competency_templates')).map(r => r.posisi));
    if (templatePositions.size === 0) return;

    const assessed = new Set((await query(
        'SELECT DISTINCT employee_id FROM competency_assessments WHERE quarter = ? AND year = ?',
        [quarter, year]
    )).map(r => String(r.employee_id)));

    const employees = await querySimAsset(
        `SELECT id_employee, user_id, full_name, nickname, job_position, id_report_to, id_report_to_value,
                active_status, status_join, deleted_at
         FROM employees`
    );
    const reportToSet = new Set(employees.map(e => e.id_report_to).filter(Boolean));

    const period = `${year}-Q${quarter}`;
    const periodLabel = `Q${quarter} ${year}`;
    const quarterEndLabel = formatIndoDate(`${formatWibDate(quarterEnd)}T00:00:00`);

    for (const leader of employees) {
        if (!leader.id_employee || leader.deleted_at || !isActiveNonIntern(leader)) continue;
        const pending = employees.filter(e =>
            e.id_employee && e.id_employee !== leader.id_employee && isActiveNonIntern(e) &&
            reportsToLeader(e, leader) &&
            !assessed.has(String(e.id_employee)) &&
            hasAssessableCompetencies(e.job_position, reportToSet.has(e.id_employee) || reportToSet.has(e.full_name), templatePositions)
        );
        if (pending.length === 0) continue;

        pending.sort((a, b) => String(a.full_name).localeCompare(String(b.full_name)));
        const names = pending.map(e => `- ${e.full_name} (${e.id_employee})`).join('\n');
        try {
            const sent = await sendReminderTicketOnce({
                kind: 'competency_assessment',
                recipientEmployeeId: leader.id_employee,
                period,
                refIds: pending.map(e => e.id_employee),
                ticket: {
                    subject: `Pengingat penilaian kompetensi ${periodLabel}`,
                    comment: `Halo ${leader.full_name}, penilaian kompetensi ${periodLabel} untuk anggota tim berikut belum diisi:\n${names}\n\nMohon isi penilaian di LMS (menu Kompetensi Tim) sebelum kuartal berakhir pada ${quarterEndLabel}.\n\n${lmsAnchor('/competency-team', 'Buka Kompetensi Tim')}`,
                    timeExpired: generalTicketDueDate(),
                    priorityId: 1
                }
            });
            if (sent) console.log(`[COMPETENCY GT] Reminder sent to ${leader.full_name} for ${pending.length} employee(s), ${period}.`);
        } catch (err) {
            console.error(`[COMPETENCY GT] Reminder for ${leader.full_name} failed:`, err.message);
        }
    }
};

app.get('/api/competency-assessments/periods', async (req, res) => {
    try {
        const { employee_id } = req.query;
        if (!employee_id) return res.json([]);
        const rows = await query(
            `SELECT quarter, year, MIN(assessed_at) as assessed_at, MIN(assessed_by_name) as assessed_by_name
             FROM competency_assessments WHERE employee_id = ? GROUP BY quarter, year ORDER BY (year * 4 + quarter) DESC`,
            [employee_id]
        );
        res.json(rows.map(r => ({ quarter: r.quarter, year: r.year, assessedAt: r.assessed_at, assessedByName: r.assessed_by_name })));
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/competency-assessments/latest', async (req, res) => {
    try {
        const { employee_id, quarter, year } = req.query;
        if (!employee_id || !quarter || !year) {
            return res.json({ current: {}, isLocked: false, previousTotal: null, previousPeriod: null, notes: null, assessedByName: null });
        }

        const rows = await query(
            'SELECT competency_template_id, actual_score, assessed_by_name FROM competency_assessments WHERE employee_id = ? AND quarter = ? AND year = ?',
            [employee_id, quarter, year]
        );
        const current = {};
        rows.forEach(r => { current[r.competency_template_id] = r.actual_score; });
        const assessedByName = rows[0]?.assessed_by_name ?? null;

        const prev = await query(
            `SELECT quarter, year, SUM(actual_score) as total FROM competency_assessments
             WHERE employee_id = ? AND (year * 4 + quarter) < (? * 4 + ?)
             GROUP BY quarter, year ORDER BY (year * 4 + quarter) DESC LIMIT 1`,
            [employee_id, year, quarter]
        );
        const previousTotal = prev[0]?.total ?? null;
        const previousPeriod = prev[0] ? { quarter: prev[0].quarter, year: prev[0].year } : null;

        const notesRow = await query(
            'SELECT notes FROM competency_assessment_notes WHERE employee_id = ? AND quarter = ? AND year = ?',
            [employee_id, quarter, year]
        );
        const notes = notesRow[0]?.notes ?? null;

        res.json({ current, isLocked: rows.length > 0, previousTotal, previousPeriod, notes, assessedByName });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/competency-assessments', async (req, res) => {
    try {
        const { employeeId, quarter, year, assessedByEmployeeId, assessedByName, scores, notes } = req.body;
        if (!employeeId || !quarter || !year || !Array.isArray(scores) || scores.length === 0) {
            return res.status(400).json({ error: 'employeeId, quarter, year and scores are required' });
        }
        if (await isInternEmployeeId(employeeId)) {
            return res.status(403).json({ error: 'Interns are not eligible for a competency assessment.' });
        }

        const existing = await query(
            'SELECT COUNT(*) as c FROM competency_assessments WHERE employee_id = ? AND quarter = ? AND year = ?',
            [employeeId, quarter, year]
        );
        if (existing[0].c > 0) {
            return res.status(409).json({ error: 'This period has already been saved and is locked.' });
        }

        const assessedAt = new Date();
        for (const s of scores) {
            await query(
                'INSERT INTO competency_assessments (employee_id, competency_template_id, actual_score, assessed_at, quarter, year, assessed_by_employee_id, assessed_by_name) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
                [employeeId, s.competencyTemplateId, s.actualScore, assessedAt, quarter, year, assessedByEmployeeId || null, assessedByName || null]
            );
        }
        if (notes && notes.trim()) {
            await query(
                `INSERT INTO competency_assessment_notes (employee_id, quarter, year, notes, assessed_by_employee_id, assessed_by_name)
                 VALUES (?, ?, ?, ?, ?, ?)
                 ON DUPLICATE KEY UPDATE notes = VALUES(notes), assessed_by_employee_id = VALUES(assessed_by_employee_id), assessed_by_name = VALUES(assessed_by_name)`,
                [employeeId, quarter, year, notes.trim(), assessedByEmployeeId || null, assessedByName || null]
            );
        }
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
});



// 2. Assets (Generic)
app.get('/api/assets', async (req, res) => {
    try {
        const { category } = req.query;
        let sql = `
            SELECT a.*, c.name as category_name, sc.name as sub_category_name 
            FROM assets a
            LEFT JOIN sub_categories sc ON a.sub_category_id = sc.id
            LEFT JOIN categories c ON sc.category_id = c.id
            WHERE a.deleted_at IS NULL
        `;
        const params = [];

        if (category) {
            sql += ' AND c.name = ?';
            params.push(category);
        }

        sql += ' ORDER BY a.name ASC';

        const assets = await querySimAsset(sql, params);
        res.json(assets);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// 3. SimAsset Borrowing History (Specific Logic for Books)
app.get('/api/simasset/books-history', async (req, res) => {
    try {
        const { employeeId, title, startDate, endDate } = req.query;

        // Base query - Joining assets, holders, and categories
        let sql = `
            SELECT 
                a.asset_uuid, 
                a.code, 
                a.name as title, 
                ah.asset_holder_uuid, 
                ah.employee_id, 
                ah.assigned_at, 
                ah.returned_at,
                c.name as category
            FROM assets a
            LEFT JOIN sub_categories sc ON a.sub_category_id = sc.id
            LEFT JOIN categories c ON sc.category_id = c.id 
            LEFT JOIN asset_holders ah ON a.id = ah.asset_id 
            WHERE c.name = 'Buku' 
            AND a.deleted_at IS NULL 
            AND ah.employee_id IS NOT NULL
        `;

        const params = [];

        if (employeeId) {
            sql += ' AND ah.employee_id = ?';
            params.push(employeeId);
        }

        if (title) {
            sql += ' AND a.name LIKE ?';
            params.push(`%${title}%`);
        }

        if (startDate) {
            if (endDate) {
                sql += ' AND date(ah.assigned_at) BETWEEN ? AND ?';
                params.push(startDate, endDate);
            } else {
                sql += ' AND date(ah.assigned_at) >= ?';
                params.push(startDate);
            }
        }

        sql += ' ORDER BY ah.assigned_at DESC';

        const history = await querySimAsset(sql, params);
        res.json(history);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// --- SETTLEMENT UPDATE ---
app.put('/api/training/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { cost, costTraining, costTransport, costAccommodation, costOthers, additionalCost, settlementNote } = req.body;

        await query(
            'UPDATE training_requests SET cost = ?, cost_training = ?, cost_transport = ?, cost_accommodation = ?, cost_others = ?, additional_cost = ?, settlement_note = ? WHERE id = ?',
            [cost, costTraining || 0, costTransport || 0, costAccommodation || 0, costOthers || 0, additionalCost || 0, settlementNote || '', id]
        );

        const updated = await query('SELECT * FROM training_requests WHERE id = ?', [id]);
        const r = updated[0];

        res.json(mapTrainingRequest(updated[0]));
    } catch (err) { res.status(500).json({ error: err.message }); }
});


app.put('/api/external-training/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { cost, costTraining, costTransport, costAccommodation, costOthers, additionalCost, settlementNote, certificateLink, pte_form_id } = req.body;

        // certificateLink: a URL replaces the certificate, null removes it, undefined leaves it untouched.
        if (certificateLink !== undefined) {
            const prev = await query('SELECT certificate_link FROM external_training_requests WHERE id = ?', [id]);
            await query(
                'UPDATE external_training_requests SET registration_fee = ?, travel_flight_cost = ?, accommodation_cost = ?, miscellaneous_cost = ?, additional_cost = ?, settlement_note = ?, certificate_link = ?, pte_form_id = ? WHERE id = ?',
                [costTraining || 0, costTransport || 0, costAccommodation || 0, costOthers || 0, additionalCost || 0, settlementNote || '', certificateLink || null, pte_form_id || null, id]
            );
            if (prev[0]?.certificate_link && prev[0].certificate_link !== certificateLink) {
                deleteLocalUpload(prev[0].certificate_link);
            }
        } else {
            await query(
                'UPDATE external_training_requests SET registration_fee = ?, travel_flight_cost = ?, accommodation_cost = ?, miscellaneous_cost = ?, additional_cost = ?, settlement_note = ?, pte_form_id = ? WHERE id = ?',
                [costTraining || 0, costTransport || 0, costAccommodation || 0, costOthers || 0, additionalCost || 0, settlementNote || '', pte_form_id || null, id]
            );
        }

        // Settlement happens after the request is already Processed - HR can attach or swap the PTE
        // form at this point too (mirrors Internal Training letting HR edit pte_form_id via Edit
        // Session even after the meeting was already marked Paid - see PUT /api/meetings/:id).
        if (pte_form_id) {
            query("UPDATE post_training_evaluation_forms SET status = 'PUBLISHED' WHERE id = ? AND deleted_at IS NULL", [pte_form_id])
                .then(() => console.log(`[PTE] Published form ${pte_form_id} - external training request ${id} settlement updated.`))
                .catch(e => console.error('[PTE] Failed to publish linked form on settlement update:', e.message));
        }

        const updated = await query('SELECT * FROM external_training_requests WHERE id = ?', [id]);
        reconcileExternalTrainingNusawork(id);
        res.json(updated[0]);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// Removes a locally-uploaded evidence file (skips external links like Google Drive) so deleting a
// request doesn't leave orphaned files behind in UPLOADS_DIR.
const deleteLocalUpload = (fileUrl) => {
    if (!fileUrl || typeof fileUrl !== 'string') return;
    const match = fileUrl.match(/^\/api\/uploads\/([^/?#]+)$/) || fileUrl.match(/^\/uploads\/([^/?#]+)$/);
    if (!match) return;
    const filePath = path.join(UPLOADS_DIR, match[1]);
    fs.unlink(filePath, (err) => {
        if (err && err.code !== 'ENOENT') console.error(`Failed to delete upload ${filePath}:`, err.message);
    });
};

app.delete('/api/external-training/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const rows = await query('SELECT certificate_link, renewal_certificate_link, employee_id, nusawork_id_group FROM external_training_requests WHERE id = ?', [id]);
        if (rows[0]) {
            deleteLocalUpload(rows[0].certificate_link);
            deleteLocalUpload(rows[0].renewal_certificate_link);
        }
        // Soft delete: keep the row (hidden from every listing via deleted_at IS NULL filters)
        // so the employee can still be notified about the removal.
        await query('UPDATE external_training_requests SET deleted_at = ? WHERE id = ?', [new Date(), id]);

        if (rows[0]?.nusawork_id_group) {
            deleteNusaworkNote({ employeeId: rows[0].employee_id, idGroup: rows[0].nusawork_id_group });
        }

        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/training/:id', async (req, res) => {
    try {
        const { id } = req.params;
        await query('DELETE FROM training_requests WHERE id = ?', [id]);
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/debug/db', async (req, res) => {
    try {
        const columns = await query('SHOW COLUMNS FROM reading_logs');
        res.json(columns);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/debug/logs', async (req, res) => {
    try {
        const logs = await query('SELECT id, title, status, cancelled_at, cancelled_by FROM reading_logs ORDER BY id DESC LIMIT 10');
        res.json(logs);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

const DIST_DIR = path.join(__dirname, '../dist');
if (fs.existsSync(DIST_DIR)) {
    app.use(express.static(DIST_DIR));
}

app.post('/api/utils/import-gform', async (req, res) => {
    try {
        const { url } = req.body;
        if (!url) return res.status(400).json({ error: 'URL is required' });
        const questions = await extractGForm(url);
        res.json({ questions });
    } catch (e) {
        console.error('Import GForm Error:', e);
        res.status(500).json({ error: e.message || 'Failed to import form' });
    }
});

// Fallback
if (fs.existsSync(DIST_DIR)) {
    app.get(/(.*)/, (req, res) => res.sendFile(path.join(DIST_DIR, 'index.html')));
}

app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT} with MySQL`));
// Trigger node watch reload to read new env variables

