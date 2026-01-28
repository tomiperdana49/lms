import express from 'express';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import multer from 'multer';
import pool, { initDB } from './db.js';
import { sendMeetingInvite } from './emailService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 3003;
const UPLOADS_DIR = path.join(__dirname, '../uploads');

// Ensure Uploads Directory Exists
if (!fs.existsSync(UPLOADS_DIR)) {
    fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

// Initialize Database
initDB();

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

app.use(cors());
app.use(express.json());

// Serve Static Files
app.use('/uploads', express.static(UPLOADS_DIR));
const DIST_DIR = path.join(__dirname, '../dist');
if (fs.existsSync(DIST_DIR)) {
    app.use(express.static(DIST_DIR));
}

// --- AUTH POOL WRAPPERS ---
// Helper to execute query safely
const query = async (sql, params) => {
    const [results] = await pool.query(sql, params);
    return results;
};

// --- AUTH ROUTES ---
app.post('/api/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        const users = await query('SELECT * FROM users WHERE email = ? AND password = ?', [email, password]);

        if (users.length > 0) {
            const user = users[0];
            res.json({ success: true, user: { name: user.name, role: user.role, email: user.email } });
        } else {
            res.status(401).json({ success: false, message: 'Invalid credentials' });
        }
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Database error' });
    }
});

app.post('/api/auth/google', async (req, res) => {
    try {
        const { email } = req.body;
        if (!email || !email.endsWith('@nusa.net.id')) {
            return res.status(403).json({ success: false, message: 'Access Restricted: Only @nusa.net.id emails are allowed.' });
        }

        let users = await query('SELECT * FROM users WHERE email =?', [email]);
        let user = users[0];

        if (!user) {
            const id = Date.now().toString();
            const name = email.split('@')[0].replace('.', ' ');
            const avatar = `https://ui-avatars.com/api/?name=${name}&background=random`;
            const role = 'STAFF'; // Default

            await query('INSERT INTO users (id, email, password, name, role, avatar) VALUES (?, ?, ?, ?, ?, ?)',
                [id, email, 'google-oauth-placeholder', name, role, avatar]);

            user = { id, email, name, role, avatar };
        }

        res.json({ success: true, user: { name: user.name, role: user.role, email: user.email } });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Database error' });
    }
});

// --- UPLOAD ROUTE ---
app.post('/api/upload', upload.single('file'), (req, res) => {
    if (!req.file) return res.status(400).json({ message: 'No file uploaded' });
    const fileUrl = `/uploads/${req.file.filename}`;
    res.json({ success: true, fileUrl });
});

// --- USER ROUTES ---
app.get('/api/users', async (req, res) => {
    try {
        const users = await query('SELECT * FROM users');
        res.json(users);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/users', async (req, res) => {
    try {
        const newUser = { ...req.body, id: Date.now().toString() };
        // Check exist
        const existing = await query('SELECT * FROM users WHERE email = ?', [newUser.email]);
        if (existing.length > 0) return res.status(400).json({ message: 'User already exists' });

        await query('INSERT INTO users (id, email, password, name, role) VALUES (?, ?, ?, ?, ?)',
            [newUser.id, newUser.email, newUser.password || '123', newUser.name, newUser.role]);

        res.json(newUser);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.put('/api/users/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const updates = req.body;
        // Construct dynamic update query
        const fields = Object.keys(updates).map(k => `${k} = ?`).join(', ');
        const values = Object.values(updates);

        await query(`UPDATE users SET ${fields} WHERE id = ?`, [...values, id]);

        const updated = await query('SELECT * FROM users WHERE id = ?', [id]);
        res.json(updated[0]);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// --- BOOKS ROUTE (STATIC JSON) ---
app.get('/api/books', (req, res) => {
    try {
        const booksPath = path.join(__dirname, 'books.json');
        if (fs.existsSync(booksPath)) {
            const books = fs.readFileSync(booksPath, 'utf8');
            res.json(JSON.parse(books));
        } else {
            res.status(404).json({ message: 'Books file not found' });
        }
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to load books' });
    }
});

// --- READING LOGS ROUTES ---
app.get('/api/logs', async (req, res) => {
    try {
        const logs = await query('SELECT * FROM reading_logs ORDER BY date DESC');
        res.json(logs);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/logs', async (req, res) => {
    try {
        const log = req.body;
        const result = await query(
            'INSERT INTO reading_logs (title, author, category, date, duration, review, status, user_name) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
            [log.title, log.author, log.category, new Date(log.date), log.duration, log.review, log.status || 'Reading', log.userName]
        );
        const newLog = await query('SELECT * FROM reading_logs WHERE id = ?', [result.insertId]);
        res.json(newLog[0]);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/logs/:id', async (req, res) => {
    try {
        await query('DELETE FROM reading_logs WHERE id = ?', [req.params.id]);
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.put('/api/logs/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const updates = req.body;
        const fields = Object.keys(updates).map(k => `${k} = ?`).join(', ');
        const values = Object.values(updates);

        await query(`UPDATE reading_logs SET ${fields} WHERE id = ?`, [...values, id]);
        const updated = await query('SELECT * FROM reading_logs WHERE id = ?', [id]);
        res.json(updated[0]);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// --- TRAINING REQUESTS ---
app.get('/api/training', async (req, res) => {
    try {
        const requests = await query('SELECT * FROM training_requests ORDER BY submitted_at DESC');
        // Rename rejection_reason to rejectionReason for frontend compatibility if needed, or update frontend.
        // For now, let's map in code if strictly needed, but snake_case vs camelCase might be an issue.
        // Frontend likely expects camelCase.
        const mapped = requests.map(r => ({ ...r, submittedAt: r.submitted_at, rejectionReason: r.rejection_reason }));
        res.json(mapped);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/training', async (req, res) => {
    try {
        const reqData = req.body;
        const submittedAt = new Date();
        const result = await query(
            'INSERT INTO training_requests (title, vendor, cost, date, status, submitted_at) VALUES (?, ?, ?, ?, ?, ?)',
            [reqData.title, reqData.vendor, reqData.cost, new Date(reqData.date), reqData.status || 'PENDING_HR', submittedAt]
        );
        const newReq = await query('SELECT * FROM training_requests WHERE id = ?', [result.insertId]);
        res.json({ ...newReq[0], submittedAt: newReq[0].submitted_at });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/training/:id/approve', async (req, res) => {
    try {
        const { id } = req.params;
        const { action, reason } = req.body;

        // Fetch current status first
        const currentRows = await query('SELECT status FROM training_requests WHERE id = ?', [id]);
        if (currentRows.length === 0) return res.status(404).json({ message: 'Not found' });

        let newStatus = currentRows[0].status;
        let updateSql = 'UPDATE training_requests SET status = ? WHERE id = ?';
        let params = [newStatus, id];

        if (action === 'reject') {
            newStatus = 'REJECTED';
            updateSql = 'UPDATE training_requests SET status = ?, rejection_reason = ? WHERE id = ?';
            params = [newStatus, reason, id];
        } else if (action === 'approve') {
            if (newStatus === 'PENDING_SUPERVISOR') newStatus = 'PENDING_HR';
            else if (newStatus === 'PENDING_HR') newStatus = 'APPROVED';
            params = [newStatus, id];
        }

        await query(updateSql, params);
        const updated = await query('SELECT * FROM training_requests WHERE id = ?', [id]);
        res.json({ ...updated[0], submittedAt: updated[0].submitted_at, rejectionReason: updated[0].rejection_reason });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// --- MEETINGS ---
app.get('/api/meetings', async (req, res) => {
    try {
        const meetings = await query('SELECT * FROM meetings');
        const mapped = meetings.map(m => ({
            ...m,
            guests: m.guests_json ? (typeof m.guests_json === 'string' ? JSON.parse(m.guests_json) : m.guests_json) : undefined
        }));
        res.json(mapped);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/meetings', async (req, res) => {
    try {
        const m = req.body;
        // Prepare guests JSON
        let guests = m.guests || { status: 'Awaiting', count: 0, emails: [] };
        if (!guests.emails) guests.emails = [];

        const result = await query(
            'INSERT INTO meetings (title, date, time, location, agenda, guests_json) VALUES (?, ?, ?, ?, ?, ?)',
            [m.title, new Date(m.date), m.time, m.location, m.agenda, JSON.stringify(guests)]
        );

        const newMeeting = { ...m, id: result.insertId, guests };

        if (guests.emails.length > 0) {
            sendMeetingInvite(newMeeting, guests.emails).catch(e => console.error(e));
        }

        res.json(newMeeting);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/meetings/:id', async (req, res) => {
    try {
        await query('DELETE FROM meetings WHERE id = ?', [req.params.id]);
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

app.get('/api/courses', async (req, res) => {
    try {
        // Fetch courses and modules
        const courses = await query('SELECT * FROM courses');
        const modules = await query('SELECT * FROM course_modules');

        const combined = courses.map(c => ({
            ...c,
            modules: modules.filter(m => m.course_id === c.id).map(m => ({
                id: m.id,
                title: m.title,
                duration: m.duration,
                locked: !!m.is_locked // convert 0/1 to boolean
            }))
        }));

        res.json(combined);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/courses', async (req, res) => {
    try {
        const c = req.body;
        const result = await query(
            'INSERT INTO courses (title, category, description, duration) VALUES (?, ?, ?, ?)',
            [c.title, c.category || 'General', c.description, c.duration || 0]
        );
        const courseId = result.insertId;

        // Insert modules if any
        if (c.modules && c.modules.length > 0) {
            for (const mod of c.modules) {
                await query(
                    'INSERT INTO course_modules (course_id, title, duration, video_id, video_type, is_locked) VALUES (?, ?, ?, ?, ?, ?)',
                    [courseId, mod.title, mod.duration, mod.videoId || '', mod.videoType || 'youtube', mod.locked ? 1 : 0]
                );
            }
        }

        // Return full object
        const newCourse = await query('SELECT * FROM courses WHERE id=?', [courseId]);
        // simplified return for now
        res.json({ ...newCourse[0], modules: c.modules || [] });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.put('/api/courses/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const c = req.body;

        // 1. Update Course details
        await query(
            'UPDATE courses SET title = ?, category = ?, description = ?, duration = ? WHERE id = ?',
            [c.title, c.category, c.description, c.duration, id]
        );

        // 2. Update Modules
        // Strategy: Delete all existing modules for this course and re-insert (simplest for syncing)
        // ideally uses transaction
        await query('DELETE FROM course_modules WHERE course_id = ?', [id]);

        if (c.modules && c.modules.length > 0) {
            for (const mod of c.modules) {
                await query(
                    'INSERT INTO course_modules (course_id, title, duration, video_id, video_type, is_locked) VALUES (?, ?, ?, ?, ?, ?)',
                    [id, mod.title, mod.duration, mod.videoId || '', mod.videoType || 'youtube', mod.locked ? 1 : 0]
                );
            }
        }

        // Return updated
        const updated = await query('SELECT * FROM courses WHERE id = ?', [id]);
        res.json({ ...updated[0], modules: c.modules || [] });
    } catch (err) {
        console.error("ERROR SAVING COURSE:", err); // ADDED LOGGING
        res.status(500).json({ error: err.message });
    }
});

// --- PROGRESS ---
app.get('/api/progress/:userId/:courseId', async (req, res) => {
    try {
        const { userId, courseId } = req.params;
        const rows = await query('SELECT * FROM progress WHERE user_id = ? AND course_id = ?', [userId, courseId]);

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
            lastAccess: record.last_access
        });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/progress/complete', async (req, res) => {
    try {
        const { userId, courseId, moduleId } = req.body;

        // Find existing
        const rows = await query('SELECT * FROM progress WHERE user_id = ? AND course_id = ?', [userId, courseId]);

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

        if (recordId) {
            await query('UPDATE progress SET completed_module_ids = ?, last_access = ? WHERE id = ?', [jsonIds, now, recordId]);
        } else {
            await query('INSERT INTO progress (user_id, course_id, completed_module_ids, last_access) VALUES (?, ?, ?, ?)',
                [userId, courseId, jsonIds, now]);
        }

        res.json({ success: true, completedModuleIds });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// --- INCENTIVES ---
app.get('/api/incentives', async (req, res) => {
    try {
        const rows = await query('SELECT * FROM incentives');
        res.json(rows);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// Fallback
if (fs.existsSync(DIST_DIR)) {
    app.get(/(.*)/, (req, res) => res.sendFile(path.join(DIST_DIR, 'index.html')));
}

app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT} with MySQL`));
