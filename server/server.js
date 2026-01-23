import express from 'express';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import multer from 'multer';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 3002;
const DATA_FILE = path.join(__dirname, 'data.json');
const UPLOADS_DIR = path.join(__dirname, '../uploads');

// Ensure Uploads Directory Exists
if (!fs.existsSync(UPLOADS_DIR)) {
    fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

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
// 1. Uploaded files (Photos, Certificates)
app.use('/uploads', express.static(UPLOADS_DIR));

// 2. React Frontend (Production Build) - effectively serving 'dist' folder
// Assuming 'dist' is in the root (../dist relative to server.js)
const DIST_DIR = path.join(__dirname, '../dist');
if (fs.existsSync(DIST_DIR)) {
    app.use(express.static(DIST_DIR));
}

// --- DATA HANDLERS ---

const readData = () => {
    if (!fs.existsSync(DATA_FILE)) {
        // Initial Seed
        return {
            users: [],
            logs: [],
            trainingRequests: [],
            meetings: [],
            courses: [],
            progress: []
        };
    }
    const data = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
    // Ensure all arrays exist
    if (!data.users) data.users = [];
    if (!data.logs) data.logs = [];
    if (!data.trainingRequests) data.trainingRequests = [];
    if (!data.meetings) data.meetings = [];
    if (!data.courses) data.courses = [];
    if (!data.progress) data.progress = []; // [{ userId, courseId, completedModuleIds: [], lastAccess: date }]
    return data;
};

const writeData = (data) => {
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
};

// --- AUTH ROUTES ---
app.post('/api/login', (req, res) => {
    const { email, password } = req.body;
    const data = readData();
    const user = data.users.find(u => u.email === email && u.password === password);

    if (user) {
        res.json({ success: true, user: { name: user.name, role: user.role, email: user.email } });
    } else {
        res.status(401).json({ success: false, message: 'Invalid credentials' });
    }
});

app.post('/api/auth/google', (req, res) => {
    const { email } = req.body;

    // 1. Domain Validation
    if (!email || !email.endsWith('@nusa.net.id')) {
        return res.status(403).json({
            success: false,
            message: 'Access Restricted: Only @nusa.net.id emails are allowed.'
        });
    }

    const data = readData();
    let user = data.users.find(u => u.email === email);

    // 2. Auto-Register if new
    if (!user) {
        user = {
            id: Date.now(),
            name: email.split('@')[0].replace('.', ' '), // e.g. jane.doe -> jane doe
            email: email,
            password: 'google-oauth-placeholder', // Not used for google login
            role: 'STAFF', // Default role
            avatar: `https://ui-avatars.com/api/?name=${email.split('@')[0]}&background=random`
        };
        data.users.push(user);
        writeData(data);
    }

    res.json({ success: true, user: { name: user.name, role: user.role, email: user.email } });
});

// --- UPLOAD ROUTE ---
app.post('/api/upload', upload.single('file'), (req, res) => {
    if (!req.file) {
        return res.status(400).json({ message: 'No file uploaded' });
    }
    // Return the URL accessible via the static route
    const fileUrl = `/uploads/${req.file.filename}`;
    res.json({ success: true, fileUrl });
});

// --- USER ROUTES ---
app.get('/api/users', (req, res) => {
    const data = readData();
    res.json(data.users);
});

app.post('/api/users', (req, res) => {
    const data = readData();
    const newUser = { ...req.body, id: Date.now() };
    if (data.users.find(u => u.email === newUser.email)) {
        return res.status(400).json({ message: 'User already exists' });
    }
    data.users.push(newUser);
    writeData(data);
    res.json(newUser);
});

// --- READING LOGS ROUTES ---
app.get('/api/logs', (req, res) => {
    const data = readData();
    res.json(data.logs);
});

app.post('/api/logs', (req, res) => {
    const data = readData();
    const newLog = req.body;
    data.logs.unshift(newLog);
    writeData(data);
    res.json(newLog);
});

app.delete('/api/logs/:id', (req, res) => {
    const { id } = req.params;
    const data = readData();
    data.logs = data.logs.filter(l => l.id != id);
    writeData(data);
    res.json({ success: true });
});

// --- TRAINING REQUESTS ROUTES ---
app.get('/api/training', (req, res) => {
    const data = readData();
    res.json(data.trainingRequests);
});

app.post('/api/training', (req, res) => {
    const data = readData();
    const newRequest = { ...req.body, id: Date.now(), submittedAt: new Date().toISOString() };
    data.trainingRequests.unshift(newRequest);
    writeData(data);
    res.json(newRequest);
});

app.post('/api/training/:id/approve', (req, res) => {
    const { id } = req.params;
    const { action } = req.body;
    const data = readData();
    let updatedreq = null;
    data.trainingRequests = data.trainingRequests.map(req => {
        if (req.id == id) {
            if (action === 'reject') req.status = 'REJECTED';
            else if (action === 'approve') {
                if (req.status === 'PENDING_SUPERVISOR') req.status = 'PENDING_HR';
                else if (req.status === 'PENDING_HR') req.status = 'APPROVED';
            }
            updatedreq = req;
        }
        return req;
    });
    writeData(data);
    res.json(updatedreq);
});

// --- MEETINGS ROUTES ---
app.get('/api/meetings', (req, res) => {
    const data = readData();
    res.json(data.meetings);
});

app.post('/api/meetings', (req, res) => {
    const data = readData();
    const newMeeting = { ...req.body, id: Date.now() };
    data.meetings.push(newMeeting);
    writeData(data);
    res.json(newMeeting);
});

app.delete('/api/meetings/:id', (req, res) => {
    const { id } = req.params;
    const data = readData();
    data.meetings = data.meetings.filter(m => m.id != id);
    res.json({ success: true });
});

app.put('/api/meetings/:id', (req, res) => {
    const { id } = req.params;
    const updatedMeeting = req.body;
    const data = readData();
    const idx = data.meetings.findIndex(m => m.id == id);
    if (idx !== -1) {
        data.meetings[idx] = { ...data.meetings[idx], ...updatedMeeting };
        writeData(data);
        res.json(data.meetings[idx]);
    } else {
        res.status(404).json({ message: 'Meeting not found' });
    }
});

app.post('/api/meetings/:id/rsvp', (req, res) => {
    const { id } = req.params;
    const { email } = req.body;
    const data = readData();
    const meeting = data.meetings.find(m => m.id == id);

    if (meeting) {
        // Init guests structure if missing
        if (!meeting.guests) meeting.guests = { status: 'Awaiting', count: 0, emails: [] };
        if (!meeting.guests.emails) meeting.guests.emails = [];

        if (!meeting.guests.emails.includes(email)) {
            meeting.guests.emails.push(email);
            meeting.guests.count = meeting.guests.emails.length;
            writeData(data);
        }
        res.json({ success: true, guests: meeting.guests });
    } else {
        res.status(404).json({ message: 'Meeting not found' });
    }
});

// --- COURSE ROUTES ---
app.get('/api/courses', (req, res) => {
    const data = readData();
    res.json(data.courses);
});

app.post('/api/courses', (req, res) => {
    const data = readData();
    const newCourse = req.body; // Expecting complete course object or partial
    // if id exists, update, else add? 
    // Usually POST is create.
    if (!newCourse.id) newCourse.id = Date.now();
    data.courses.push(newCourse);
    writeData(data);
    res.json(newCourse);
});

app.put('/api/courses/:id', (req, res) => {
    const { id } = req.params;
    const updatedCourse = req.body;
    const data = readData();
    const idx = data.courses.findIndex(c => c.id == id);
    if (idx !== -1) {
        data.courses[idx] = { ...data.courses[idx], ...updatedCourse };
        writeData(data);
        res.json(data.courses[idx]);
    } else {
        res.status(404).json({ message: 'Course not found' });
    }
});

app.delete('/api/courses/:id', (req, res) => {
    const { id } = req.params;
    const data = readData();
    data.courses = data.courses.filter(c => c.id != id);
    writeData(data);
    res.json({ success: true });
});

// --- PROGRESS ROUTES ---
app.get('/api/progress', (req, res) => {
    const data = readData();
    res.json(data.progress);
});

app.get('/api/progress/:userId/:courseId', (req, res) => {
    const { userId, courseId } = req.params;
    const data = readData();
    // Assuming userId is name or email for now based on current app usage, but ideally ID.
    // The app seems to use 'userName' for reading logs. Let's consistency check.
    // For consistency with Auth, let's assume client sends identifying info.

    const record = data.progress.find(p => p.userId == userId && p.courseId == courseId);
    res.json(record || { userId, courseId, completedModuleIds: [] });
});

app.post('/api/progress/complete', (req, res) => {
    const { userId, courseId, moduleId } = req.body;
    const data = readData();

    let record = data.progress.find(p => p.userId == userId && p.courseId == courseId);
    if (!record) {
        record = { userId, courseId, completedModuleIds: [], lastAccess: new Date().toISOString() };
        data.progress.push(record);
    }

    if (!record.completedModuleIds.includes(moduleId)) {
        record.completedModuleIds.push(moduleId);
    }
    record.lastAccess = new Date().toISOString();

    writeData(data);
    res.json({ success: true, record });
});

// --- SPA FALLBACK (Catch-All) ---
// This must be LAST
// Only if dist exists
if (fs.existsSync(DIST_DIR)) {
    // Express 5 requires regex or (.*) for wildcard
    app.get(/(.*)/, (req, res) => {
        // If request is API or special, ignore? 
        // But Express matches sequentially, so API routes above are safe.
        res.sendFile(path.join(DIST_DIR, 'index.html'));
    });
}

app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`- API enabled`);
    console.log(`- Static files served from /uploads`);
    if (fs.existsSync(DIST_DIR)) {
        console.log(`- Frontend served from /dist`);
    } else {
        console.log(`- Frontend build not found in /dist (Run 'npm run build' to generate)`);
    }
});
