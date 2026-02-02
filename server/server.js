import express from 'express';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import multer from 'multer';
import pool, { initDB } from './db.js';
import nodemailer from 'nodemailer';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 3003;

app.use(cors());
app.use(express.json());
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
            res.json({ success: true, user: { id: user.id, name: user.name, role: user.role, email: user.email, branch: user.branch } });
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
            const branch = 'Headquarters'; // Default branch

            await query('INSERT INTO users (id, email, password, name, role, avatar, branch) VALUES (?, ?, ?, ?, ?, ?, ?)',
                [id, email, 'google-oauth-placeholder', name, role, avatar, branch]);

            user = { id, email, name, role, avatar, branch };
        }

        res.json({ success: true, user: { id: user.id, name: user.name, role: user.role, email: user.email, branch: user.branch } });
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
        // Map snake_case to camelCase
        const mappedLogs = logs.map(log => ({
            ...log,
            userName: log.user_name,
            readingDuration: log.reading_duration,
            startDate: log.start_date,
            finishDate: log.finish_date,
            evidenceUrl: log.evidence_url,
            hrApprovalStatus: log.hr_approval_status,
            incentiveAmount: log.incentive_amount,
            rejectionReason: log.rejection_reason
        }));
        res.json(mappedLogs);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/logs', async (req, res) => {
    try {
        const log = req.body;
        // Fix: Ensure we use the correct column names for INSERT
        // Note: For POST, we might be receiving camelCase from frontend, so we map it to snake_case for DB
        const result = await query(
            'INSERT INTO reading_logs (title, author, category, date, duration, review, status, user_name, evidence_url, start_date, finish_date, reading_duration, hr_approval_status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
            [
                log.title,
                log.author || '',
                log.category,
                new Date(log.date),
                log.duration || 0,
                log.review || '',
                log.status || 'Reading',
                log.userName,
                log.evidenceUrl || '',
                log.startDate ? new Date(log.startDate) : new Date(),
                log.finishDate ? new Date(log.finishDate) : null,
                log.readingDuration || 0,
                log.hrApprovalStatus || 'Pending'
            ]
        );
        const newLogs = await query('SELECT * FROM reading_logs WHERE id = ?', [result.insertId]);
        const newLog = newLogs[0];

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
            rejectionReason: newLog.rejection_reason
        });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/logs/:id', async (req, res) => {
    try {
        await query('DELETE FROM reading_logs WHERE id = ?', [req.params.id]);
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
        if (updates.readingDuration !== undefined) dbUpdates.reading_duration = updates.readingDuration;
        if (updates.startDate !== undefined) dbUpdates.start_date = new Date(updates.startDate);
        if (updates.finishDate !== undefined) dbUpdates.finish_date = new Date(updates.finishDate);
        if (updates.evidenceUrl !== undefined) dbUpdates.evidence_url = updates.evidenceUrl;
        if (updates.hrApprovalStatus !== undefined) dbUpdates.hr_approval_status = updates.hrApprovalStatus;
        if (updates.incentiveAmount !== undefined) dbUpdates.incentive_amount = updates.incentiveAmount;
        if (updates.rejectionReason !== undefined) dbUpdates.rejection_reason = updates.rejectionReason;
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

        await query(`UPDATE reading_logs SET ${fields} WHERE id = ?`, [...values, id]);

        const updatedLogs = await query('SELECT * FROM reading_logs WHERE id = ?', [id]);
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
            rejectionReason: updated.rejection_reason
        });
    } catch (err) { res.status(500).json({ error: err.message }); }
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
            'INSERT INTO reading_logs (title, category, location, source, user_name, evidence_url, start_date, date, status, hr_approval_status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
            [title, category, location, source, userName, evidenceUrl, now, now, 'Reading', 'Pending']
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
        const { id, review, link, evidenceUrl, readingDuration } = req.body;

        if (!id) return res.status(400).json({ error: 'Log ID is required' });

        const now = new Date(); // Finish date

        await query(
            'UPDATE reading_logs SET status = ?, finish_date = ?, review = ?, link = ?, evidence_url = ?, reading_duration = ?, hr_approval_status = ? WHERE id = ?',
            ['Finished', now, review, link || '', evidenceUrl, readingDuration || 0, 'Pending', id]
        );

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
            rejectionReason: updated.rejection_reason
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
        const mapped = requests.map(r => ({
            ...r,
            submittedAt: r.submitted_at,
            rejectionReason: r.rejection_reason,
            employeeName: r.employee_name, // Map DB column to frontend prop
            supervisorName: r.supervisor_name,
            supervisorApprovedAt: r.supervisor_approved_at,
            hrName: r.hr_name,
            hrApprovedAt: r.hr_approved_at,
            employeeRole: r.employee_role, // Map DB column to frontend prop
            costTraining: r.cost_training || 0,
            costTransport: r.cost_transport || 0,
            costAccommodation: r.cost_accommodation || 0,
            costOthers: r.cost_others || 0,
            additionalCost: r.additional_cost || 0,
            justification: r.justification,
            evidenceUrl: r.evidence_url
        }));
        res.json(mapped);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/training', async (req, res) => {
    try {
        const reqData = req.body;
        const submittedAt = new Date();
        const result = await query(
            'INSERT INTO training_requests (title, vendor, cost, date, status, submitted_at, employee_name, employee_role, cost_training, cost_transport, cost_accommodation, cost_others, justification, evidence_url) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
            [
                reqData.title,
                reqData.vendor,
                reqData.cost,
                new Date(reqData.date),
                reqData.status || 'PENDING_SUPERVISOR',
                submittedAt,
                reqData.employeeName,
                reqData.employeeRole,
                reqData.costTraining || 0,
                reqData.costTransport || 0,
                reqData.costAccommodation || 0,
                reqData.costOthers || 0,
                reqData.reason || '', // Map 'reason' from frontend to 'justification'
                reqData.evidenceUrl || ''
            ]
        );
        const newReq = await query('SELECT * FROM training_requests WHERE id = ?', [result.insertId]);
        const r = newReq[0];
        res.json({
            ...r,
            submittedAt: r.submitted_at,
            employeeName: r.employee_name,
            employeeRole: r.employee_role,
            costTraining: r.cost_training,
            costTransport: r.cost_transport,
            costAccommodation: r.cost_accommodation,
            costOthers: r.cost_others
        });
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
        res.json({
            ...r,
            submittedAt: r.submitted_at,
            rejectionReason: r.rejection_reason,
            supervisorName: r.supervisor_name,
            supervisorApprovedAt: r.supervisor_approved_at,
            hrName: r.hr_name,
            hrApprovedAt: r.hr_approved_at,
            employeeName: r.employee_name,
            employeeRole: r.employee_role,
            costTraining: r.cost_training,
            costTransport: r.cost_transport,
            costAccommodation: r.cost_accommodation,
            costOthers: r.cost_others,
            additionalCost: r.additional_cost,
            justification: r.justification,
            evidenceUrl: r.evidence_url
        });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// --- MEETINGS ---
app.get('/api/meetings', async (req, res) => {
    try {
        const meetings = await query('SELECT * FROM meetings');
        const mapped = meetings.map(m => ({
            ...m,
            guests: m.guests_json ? (typeof m.guests_json === 'string' ? JSON.parse(m.guests_json) : m.guests_json) : undefined,
            costReport: m.cost_report_json ? (typeof m.cost_report_json === 'string' ? JSON.parse(m.cost_report_json) : m.cost_report_json) : undefined
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
            'INSERT INTO meetings (title, date, time, location, agenda, guests_json, cost_report_json) VALUES (?, ?, ?, ?, ?, ?, ?)',
            [m.title, new Date(m.date), m.time, m.location, m.agenda, JSON.stringify(guests), null]
        );

        const newMeeting = { ...m, id: result.insertId, guests };

        if (guests.emails.length > 0) {
            sendMeetingInvite(newMeeting, guests.emails).catch(e => console.error(e));
        }

        res.json(newMeeting);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.put('/api/meetings/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const m = req.body;

        // Prepare guests JSON
        let guests = m.guests || { status: 'Awaiting', count: 0, emails: [] };

        // Prepare Cost Report JSON
        let costReport = m.costReport || null;

        await query(
            'UPDATE meetings SET title = ?, date = ?, time = ?, location = ?, agenda = ?, guests_json = ?, cost_report_json = ? WHERE id = ?',
            [
                m.title,
                new Date(m.date),
                m.time,
                m.location,
                m.agenda,
                JSON.stringify(guests),
                costReport ? JSON.stringify(costReport) : null,
                id
            ]
        );

        const updated = await query('SELECT * FROM meetings WHERE id = ?', [id]);
        const r = updated[0];

        res.json({
            ...r,
            guests: r.guests_json ? (typeof r.guests_json === 'string' ? JSON.parse(r.guests_json) : r.guests_json) : undefined,
            costReport: r.cost_report_json ? (typeof r.cost_report_json === 'string' ? JSON.parse(r.cost_report_json) : r.cost_report_json) : undefined
        });

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
            assessment: c.assessment_data ? (typeof c.assessment_data === 'string' ? JSON.parse(c.assessment_data) : c.assessment_data) : undefined,
            modules: (modules || []).filter(m => m.course_id === c.id).map(m => ({
                id: m.id,
                title: m.title,
                duration: m.duration,
                locked: !!m.is_locked, // convert 0/1 to boolean
                videoId: m.video_id,
                videoType: m.video_type || 'youtube',
                quiz: m.quiz_data ? (typeof m.quiz_data === 'string' ? JSON.parse(m.quiz_data) : m.quiz_data) : undefined
            }))
        }));

        res.json(combined);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/courses', async (req, res) => {
    try {
        const c = req.body;
        const result = await query(
            'INSERT INTO courses (title, category, description, duration, assessment_data) VALUES (?, ?, ?, ?, ?)',
            [c.title, c.category || 'General', c.description, c.duration || 0, c.assessment ? JSON.stringify(c.assessment) : null]
        );
        const courseId = result.insertId;

        // Insert modules if any
        if (c.modules && c.modules.length > 0) {
            for (const mod of c.modules) {
                await query(
                    'INSERT INTO course_modules (course_id, title, duration, video_id, video_type, is_locked, quiz_data) VALUES (?, ?, ?, ?, ?, ?, ?)',
                    [
                        courseId,
                        mod.title,
                        mod.duration,
                        mod.videoId || '',
                        mod.videoType || 'youtube',
                        mod.locked ? 1 : 0,
                        mod.quiz ? JSON.stringify(mod.quiz) : null
                    ]
                );
            }
        }

        // Return full object
        const newCourse = await query('SELECT * FROM courses WHERE id=?', [courseId]);
        // simplified return for now - frontend will likely refetch or use its own state
        res.json({ ...newCourse[0], modules: c.modules || [] });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.put('/api/courses/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const c = req.body;

        // 1. Update Course details
        await query(
            'UPDATE courses SET title = ?, category = ?, description = ?, duration = ?, assessment_data = ? WHERE id = ?',
            [c.title, c.category, c.description, c.duration, c.assessment ? JSON.stringify(c.assessment) : null, id]
        );

        // 2. Update Modules
        // Strategy: Delete all existing modules for this course and re-insert (simplest for syncing)
        // ideally uses transaction
        await query('DELETE FROM course_modules WHERE course_id = ?', [id]);

        if (c.modules && c.modules.length > 0) {
            for (const mod of c.modules) {
                await query(
                    'INSERT INTO course_modules (course_id, title, duration, video_id, video_type, is_locked, quiz_data) VALUES (?, ?, ?, ?, ?, ?, ?)',
                    [
                        id,
                        mod.title,
                        mod.duration,
                        mod.videoId || '',
                        mod.videoType || 'youtube',
                        mod.locked ? 1 : 0,
                        mod.quiz ? JSON.stringify(mod.quiz) : null
                    ]
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
            moduleProgress: typeof record.module_progress === 'string' ? JSON.parse(record.module_progress) : record.module_progress || {},
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

app.post('/api/progress/time', async (req, res) => {
    try {
        const { userId, courseId, moduleId, timestamp } = req.body;

        const rows = await query('SELECT * FROM progress WHERE user_id = ? AND course_id = ?', [userId, courseId]);
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
            await query('UPDATE progress SET module_progress = ?, last_access = ? WHERE id = ?', [jsonProgress, now, recordId]);
        } else {
            // Should rarely happen if they haven't started, but possible
            await query('INSERT INTO progress (user_id, course_id, module_progress, last_access) VALUES (?, ?, ?, ?)',
                [userId, courseId, jsonProgress, now]);
        }

        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// --- QUIZ & ASSESSMENT ---
app.post('/api/quiz/submit', async (req, res) => {
    try {
        const { studentId, studentName, courseId, moduleId, score } = req.body;
        const now = new Date();

        // 1. Save Result
        await query(
            'INSERT INTO quiz_results (student_id, student_name, course_id, module_id, score, date) VALUES (?, ?, ?, ?, ?, ?)',
            [studentId, studentName, courseId, moduleId, score, now]
        );

        // 2. If Passed (>= 80), mark module as complete
        if (score >= 80 && moduleId) {
            // Find progress
            const rows = await query('SELECT * FROM progress WHERE user_id = ? AND course_id = ?', [studentId, courseId]);
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
                    await query('UPDATE progress SET completed_module_ids = ?, last_access = ? WHERE id = ?', [jsonIds, now, recordId]);
                } else {
                    await query('INSERT INTO progress (user_id, course_id, completed_module_ids, last_access) VALUES (?, ?, ?, ?)',
                        [studentId, courseId, jsonIds, now]);
                }
            }
        }

        res.json({ success: true, score });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/quiz/results/:userId/:courseId', async (req, res) => {
    try {
        const { userId, courseId } = req.params;
        const results = await query('SELECT * FROM quiz_results WHERE student_id = ? AND course_id = ?', [userId, courseId]);
        const mapped = results.map(r => ({
            id: r.id,
            studentId: r.student_id,
            studentName: r.student_name,
            courseId: r.course_id,
            moduleId: r.module_id,
            score: r.score,
            date: r.date
        }));
        res.json(mapped);
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
                c.title as course_title,
                cm.title as module_title,
                qr.score,
                qr.date,
                qr.module_id
            FROM quiz_results qr
            LEFT JOIN users u ON qr.student_id = u.id
            LEFT JOIN courses c ON qr.course_id = c.id
            LEFT JOIN course_modules cm ON qr.module_id = cm.id
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
        // Insert with new columns
        const result = await query(
            'INSERT INTO incentives (employee_name, course_name, description, start_date, end_date, evidence_url, status) VALUES (?, ?, ?, ?, ?, ?, ?)',
            [
                i.employeeName,
                i.courseName,
                i.description || '',
                new Date(i.startDate),
                new Date(i.endDate),
                i.evidenceUrl || '',
                i.status || 'Pending'
            ]
        );
        const newInc = await query('SELECT * FROM incentives WHERE id = ?', [result.insertId]);
        const r = newInc[0];

        // Return mapped
        res.json({
            ...r,
            employeeName: r.employee_name,
            courseName: r.course_name,
            evidenceUrl: r.evidence_url,
            startDate: r.start_date,
            endDate: r.end_date,
            monthlyAmount: r.monthly_amount
        });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.put('/api/incentives/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const updates = req.body;

        // Build update manually since we need to map keys potentially, 
        // OR just expect specific fields. For simplicity in this specialized endpoint:
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
        // Remove trailing comma
        sql = sql.slice(0, -2);
        sql += ' WHERE id = ?';
        params.push(id);

        if (params.length > 1) { // At least one field + id
            await query(sql, params);
        }

        const updated = await query('SELECT * FROM incentives WHERE id = ?', [id]);
        const r = updated[0];
        res.json({
            ...r,
            employeeName: r.employee_name,
            courseName: r.course_name,
            evidenceUrl: r.evidence_url,
            startDate: r.start_date,
            endDate: r.end_date,
            monthlyAmount: r.monthly_amount,
            monthlyAmount: r.monthly_amount,
            paymentType: r.payment_type,
            approvedDate: r.approved_date
        });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// Fallback
if (fs.existsSync(DIST_DIR)) {
    app.get(/(.*)/, (req, res) => res.sendFile(path.join(DIST_DIR, 'index.html')));
}

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

        res.json({
            ...r,
            submittedAt: r.submitted_at,
            employeeName: r.employee_name,
            employeeRole: r.employee_role,
            costTraining: r.cost_training,
            costTransport: r.cost_transport,
            costAccommodation: r.cost_accommodation,
            costOthers: r.cost_others,
            additionalCost: r.additional_cost,
            settlementNote: r.settlement_note
        });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT} with MySQL`));
