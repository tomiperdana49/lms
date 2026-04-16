import express from 'express';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import multer from 'multer';
import pool, { initDB, simAssetPool } from './db.js';
import nodemailer from 'nodemailer';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3003;

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
initDB().then(async () => {
    try {
        const [cols] = await pool.query('DESCRIBE courses');
        console.log('ACTUAL DATABASE COLUMNS:', cols.map(c => c.Field).join(', '));
    } catch (e) {
        console.error('Failed to describe table:', e.message);
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

// --- AUTH ROUTES ---
// --- AUTH ROUTES ---
app.post('/api/login', async (req, res) => {
    try {
        const { identifier, password, email } = req.body;

        // 1. Trim whitespace to avoid copy-paste errors
        const loginId = (identifier || email || '').trim();
        const cleanPassword = (password || '').trim();

        console.log(`[LOGIN ATTEMPT] Value: '${loginId}'`);

        // --- DEBUG BYPASS start ---
        if (loginId === 'staff@nusa.com' && cleanPassword === '123') {
            return res.json({ success: true, user: { id: 'demo1', name: 'Demo Staff', role: 'STAFF', email: 'staff@nusa.com', branch: 'Headquarters' } });
        }
        if (loginId === 'hr@nusa.com' && cleanPassword === '123') {
            return res.json({ success: true, user: { id: 'demo3', name: 'Demo HR', role: 'HR', email: 'hr@nusa.com', branch: 'Headquarters' } });
        }
        if (loginId === 'spv@nusa.com' && cleanPassword === '123') {
            return res.json({ success: true, user: { id: 'demo2', name: 'Demo Supervisor', role: 'SUPERVISOR', email: 'spv@nusa.com', branch: 'Headquarters' } });
        }
        // --- DEBUG BYPASS end ---

        // 2. First try: Local database check (including legacy users and demo accounts in DB)
        const localUsers = await query(
            'SELECT * FROM users WHERE (email = ? OR employee_id = ?) AND password = ?',
            [loginId, loginId, cleanPassword]
        );

        if (localUsers.length > 0) {
            console.log(`[LOGIN SUCCESS] Local user found for ${loginId}`);
            const user = localUsers[0];
            return res.json({ success: true, user: { id: user.id, name: user.name, role: user.role, email: user.email, branch: user.branch, employee_id: user.employee_id } });
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
            console.log(`[NUSANET AUTH] Response for ${loginId}:`, authData);

            if (authResponse.ok && authData.access_token) {
                console.log(`[NUSANET AUTH] Success for ${loginId}`);
                const accessToken = authData.access_token;

                // 3.1 Fetch User Session info (to get ID)
                let nusanetUserId = null;
                try {
                    const sessionUrl = `${baseUrl}/auth/api/client/users/email/${loginId}`;
                    const sessionResponse = await fetch(sessionUrl, {
                        headers: { 'Authorization': `Bearer ${accessToken}` }
                    });
                    const sessionData = await sessionResponse.json();
                    nusanetUserId = sessionData.id || sessionData.uid || (sessionData.data ? sessionData.data.id : null);
                    console.log(`[NUSANET PROFILE] Found User ID: ${nusanetUserId}`);
                } catch (e) { console.error("[NUSANET PROFILE] Error fetching session info:", e); }

                // 3.2 Fetch Full Employee Detail (if ID found)
                let fullName = loginId.split('@')[0].replace('.', ' ');
                let employeeId = null;
                let branchName = 'Headquarters';

                let p = {};
                if (nusanetUserId) {
                    try {
                        const profileUrl = `${baseUrl}/emp/api/v1.1/employee/${nusanetUserId}`;
                        const profileResponse = await fetch(profileUrl, {
                            headers: { 'Authorization': `Bearer ${accessToken}` }
                        });
                        const profileData = await profileResponse.json();
                        // Adjust data mapping based on common Nusanet response structures
                        p = profileData.data || profileData;
                        console.log(`[NUSANET PROFILE] Full Data:`, JSON.stringify(p, null, 2)); // Debug log for structure

                        // Extract name from 'user' object or top level
                        if (p.user && typeof p.user === 'object') {
                            fullName = p.user.name || p.user.full_name || fullName;
                        } else {
                            fullName = p.full_name || p.name || fullName;
                        }

                        employeeId = p.id_employee || p.employee_id || null;

                        // Use organization_name as branch if available
                        branchName = p.organization_name || p.branch_name || (p.branch ? p.branch.name : 'Headquarters');

                        console.log(`[NUSANET PROFILE] Fetched detail for: ${fullName} (${employeeId}) at ${branchName}`);
                    } catch (e) { console.error("[NUSANET PROFILE] Error fetching full profile:", e); }
                }

                // Determine LMS role from Nusanet roles OR Job Position
                let lmsRole = 'STAFF';

                // 1. Check Nusanet Roles
                if (authData.role && authData.role.role_name) {
                    const roles = Array.isArray(authData.role.role_name) ? authData.role.role_name : [authData.role.role_name];
                    if (roles.some(r => r.toUpperCase().includes('ADMIN') || r.toUpperCase().includes('HR'))) {
                        lmsRole = 'HR';
                    } else if (roles.some(r => r.toUpperCase().includes('SPV') || r.toUpperCase().includes('SUPERVISOR'))) {
                        lmsRole = 'SUPERVISOR';
                    }
                }

                // 2. Check Job Position from Profile (More specific for HR Staff)
                const position = p.job_position || p.job_position_name || p.position_name || '';
                if (lmsRole === 'STAFF' && position.toUpperCase().includes('HR')) {
                    console.log(`[NUSANET AUTH] Elevating role to HR based on position: ${position}`);
                    lmsRole = 'HR';
                }

                // Check SimAsset for ID if not found in Nusanet profile
                if (!employeeId) {
                    const employees = await querySimAsset('SELECT * FROM employees WHERE email = ?', [loginId]);
                    if (employees.length > 0) {
                        employeeId = employees[0].id_employee;
                        if (!fullName || fullName.includes(' ')) fullName = employees[0].full_name;
                    }
                }

                // 3.3 Find or Sync local record
                let usersList = await query('SELECT * FROM users WHERE email = ?', [loginId]);
                let user = usersList[0];
                const avatar = `https://ui-avatars.com/api/?name=${fullName}&background=random`;

                if (!user) {
                    console.log(`[NUSANET AUTH] Creating new local record for ${loginId}`);
                    const id = Date.now().toString();
                    await query('INSERT INTO users (id, email, password, name, role, avatar, branch, employee_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
                        [id, loginId, 'nusanet-oauth-placeholder', fullName, lmsRole, avatar, branchName, employeeId]);

                    user = { id, email: loginId, name: fullName, role: lmsRole, avatar, branch: branchName, employee_id: employeeId };
                } else {
                    console.log(`[NUSANET AUTH] Syncing existing user data for ${loginId}`);
                    // Role protection: Only auto-update role if it's an upgrade or the current role is STAFF.
                    // This preserves manual overrides made by HR in the LMS (e.g. promoting someone to HR manually).
                    let finalRole = user.role;
                    if (lmsRole === 'HR') {
                        finalRole = 'HR';
                    } else if (lmsRole === 'SUPERVISOR' && user.role === 'STAFF') {
                        finalRole = 'SUPERVISOR';
                    }
                    
                    await query('UPDATE users SET name = ?, role = ?, branch = ?, employee_id = ? WHERE id = ?',
                        [fullName, finalRole, branchName, employeeId, user.id]);
                    user = { ...user, name: fullName, role: finalRole, branch: branchName, employee_id: employeeId };
                }

                // 3.4 Sync to employees table if missing (Requested by user)
                if (employeeId) {
                    try {
                        const existingEmp = await querySimAsset('SELECT * FROM employees WHERE id_employee = ?', [employeeId]);
                        if (existingEmp.length === 0) {
                            console.log(`[NUSANET AUTH] Auto-creating employee record for ${fullName} (${employeeId})`);
                            
                            // Try to find branch_id matching branchName
                            let bid = null;
                            try {
                                const branches = await querySimAsset('SELECT id_branch FROM branches WHERE name LIKE ?', [`%${branchName}%`]);
                                if (branches.length > 0) {
                                    bid = branches[0].id_branch;
                                } else {
                                    bid = '020'; // Default to HO
                                }
                            } catch (e) {
                                bid = '020';
                            }
                            
                            console.log(`[NUSANET AUTH] Resolved branch_id: ${bid} for ${branchName}`);

                            await querySimAsset(
                                'INSERT INTO employees (full_name, email, id_employee, job_position, job_level, organization_name, status_join, branch_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
                                [
                                    fullName,
                                    loginId,
                                    employeeId,
                                    p.job_position || p.job_position_name || 'Staff',
                                    p.job_level_name || 'Staff',
                                    p.organization_name || 'Nusanet',
                                    p.employee_status_name || 'Permanent',
                                    bid
                                ]
                            );
                            console.log(`[NUSANET AUTH] Successfully created employee record for ${fullName}`);
                        }
                    } catch (empErr) {
                        console.error("[NUSANET AUTH] Error auto-creating employee:", empErr.message);
                    }
                }

                return res.json({
                    success: true,
                    user: {
                        id: user.id,
                        name: user.name,
                        role: user.role,
                        email: user.email,
                        branch: user.branch,
                        employee_id: user.employee_id
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

app.post('/api/auth/google', async (req, res) => {
    try {
        const { email } = req.body;
        if (!email || !email.endsWith('@nusa.net.id')) {
            return res.status(403).json({ success: false, message: 'Access Restricted: Only @nusa.net.id emails are allowed.' });
        }

        // 1. Check if user already exists in LMS
        let users = await query('SELECT * FROM users WHERE email = ?', [email]);
        let user = users[0];

        // 2. Check if employee exists in SimAsset (to get correct data)
        const employees = await querySimAsset('SELECT * FROM employees WHERE email = ?', [email]);
        const employeeHelper = employees.length > 0 ? employees[0] : null;

        // Determine role based on job position
        const jobPos = (employeeHelper && employeeHelper.job_position) ? employeeHelper.job_position.toUpperCase() : '';
        const detectedRole = jobPos.includes('HR') ? 'HR' : (jobPos.includes('SUPERVISOR') || jobPos.includes('SPV') || jobPos.includes('MANAGER') ? 'SUPERVISOR' : 'STAFF');

        if (user) {
            // Role protection: Only auto-update role if it's an upgrade or the current role is STAFF.
            // This preserves manual overrides made by HR in the LMS.
            let finalRole = user.role;
            if (detectedRole === 'HR') {
                finalRole = 'HR';
            } else if (detectedRole === 'SUPERVISOR' && user.role === 'STAFF') {
                finalRole = 'SUPERVISOR';
            }

            const needsUpdate = !user.employee_id && employeeHelper || user.role !== finalRole;

            if (needsUpdate) {
                console.log(`[GOOGLE AUTH] Updating existing user ${email}: role=${finalRole}, empId=${employeeHelper?.id_employee}`);
                await query('UPDATE users SET employee_id = ?, role = ? WHERE id = ?',
                    [employeeHelper?.id_employee || user.employee_id, finalRole, user.id]);
                user.employee_id = employeeHelper?.id_employee || user.employee_id;
                user.role = finalRole;
            }
        } else {
            // New User: Create with linked data
            const id = Date.now().toString();
            // Use Employee Name if available, otherwise format from email
            const name = employeeHelper ? employeeHelper.full_name : email.split('@')[0].replace('.', ' ');
            const avatar = `https://ui-avatars.com/api/?name=${name}&background=random`;
            const branch = 'Headquarters';
            const employeeId = employeeHelper ? employeeHelper.id_employee : null;

            console.log(`[GOOGLE AUTH] Creating new user ${email} with role ${detectedRole}`);
            await query('INSERT INTO users (id, email, password, name, role, avatar, branch, employee_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
                [id, email, 'google-oauth-placeholder', name, detectedRole, avatar, branch, employeeId]);

            user = { id, email, name, role: detectedRole, avatar, branch, employee_id: employeeId };
        }

        res.json({
            success: true,
            user: {
                id: user.id,
                name: user.name,
                role: user.role,
                email: user.email,
                branch: user.branch,
                employee_id: user.employee_id
            }
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Database error' });
    }
});

// --- UPLOAD ROUTE ---
app.post('/api/upload', upload.single('file'), (req, res) => {
    if (!req.file) return res.status(400).json({ message: 'No file uploaded' });
    const fileUrl = `/api/uploads/${req.file.filename}`;
    res.json({ success: true, fileUrl });
});

// --- USER ROUTES ---
app.get('/api/users', async (req, res) => {
    try {
        const users = await query('SELECT * FROM users');
        res.json(users);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// SIMASSET integration routes moved up
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

        await query('INSERT INTO users (id, email, password, name, role, employee_id) VALUES (?, ?, ?, ?, ?, ?)',
            [newUser.id, newUser.email, newUser.password || '123', newUser.name, newUser.role, newUser.employee_id || null]);

        res.json(newUser);
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
                filteredUpdates[key] = updates[key];
            }
        });

        if (Object.keys(filteredUpdates).length === 0) {
            return res.json({ message: 'No valid fields to update' });
        }

        // Construct dynamic update query
        const fields = Object.keys(filteredUpdates).map(k => `${k} = ?`).join(', ');
        const values = Object.values(filteredUpdates);

        await query(`UPDATE users SET ${fields} WHERE id = ?`, [...values, id]);

        const updated = await query('SELECT * FROM users WHERE id = ?', [id]);
        res.json(updated[0]);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/users/:id', async (req, res) => {
    try {
        const { id } = req.params;
        await query('DELETE FROM users WHERE id = ?', [id]);
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/simas/sync', async (req, res) => {
    try {
        const { employee_id, user_name } = req.body;
        
        const baseUrl = process.env.SIMAS_API_BASE_URL || 'https://simas.nusa.id/';
        let url = `${baseUrl}api/v2/book/loan`;
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
                            const startDate = new Date(startDateRaw);
                            const isReturned = b.loanHistory.return && b.loanHistory.return.returnTime;
                            const finishDateRaw = isReturned ? b.loanHistory.return.returnTime : null;

                            // Check if exists
                            const existing = await query('SELECT * FROM reading_logs WHERE source = ? AND employee_id = ? AND sn = ? AND (DATE(start_date) = DATE(?) OR start_date = ?)',
                                ['SIMAS', targetEid, sn, startDateRaw, startDateRaw]);

                            if (existing.length === 0) {
                                console.log(`[SIMAS SYNC] Inserting new book for ${targetName}: ${b.name}`);
                                await query(
                                    'INSERT IGNORE INTO reading_logs (title, author, category, date, review, status, user_name, employee_id, evidence_url, return_evidence_url, start_date, finish_date, hr_approval_status, link, sn, location, source) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
                                    [
                                        b.name, '', b.subCategory || 'Lainnya', startDate,
                                        isReturned ? (b.loanHistory.return.linkReview || '') : '',
                                        isReturned ? 'Finished' : 'Reading',
                                        targetName, targetEid, b.loanHistory.loaning.loanPhoto || '',
                                        isReturned ? (b.loanHistory.return.returnPhoto || '') : '',
                                        startDate, finishDateRaw ? new Date(finishDateRaw) : null,
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
                                        ['Finished', new Date(finishDateRaw), b.loanHistory.return.returnPhoto || '', b.loanHistory.return.linkReview || '', b.loanHistory.return.linkReview || '', 'Draft', log.id]
                                    );
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
            try { await query('CREATE TABLE IF NOT EXISTS migration_test (id INT)'); } catch(e) { console.error("[PERMISSION TEST] Failed to create table:", e.message); }
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
            cancelledBy: log.cancelled_by
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
        const result = await query(
            'INSERT INTO reading_logs (title, author, category, date, duration, review, status, user_name, employee_id, evidence_url, start_date, finish_date, reading_duration, hr_approval_status, link, sn, planned_finish_date, location, source) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
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
                log.finishDate ? new Date(log.finishDate) : null,
                log.location || '',
                log.source || ''
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
            rejectionReason: newLog.rejection_reason,
            sn: newLog.sn,
            approvedAt: newLog.approved_at,
            plannedFinishDate: newLog.planned_finish_date,
            cancelledAt: newLog.cancelled_at
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
        if (updates.hrApprovalStatus !== undefined) dbUpdates.hr_approval_status = updates.hrApprovalStatus;
        if (updates.incentiveAmount !== undefined) dbUpdates.incentive_amount = updates.incentiveAmount;
        if (updates.rejectionReason !== undefined) dbUpdates.rejection_reason = updates.rejectionReason;
        if (updates.approvedBy !== undefined) dbUpdates.approved_by = updates.approvedBy;
        if (updates.sn !== undefined) dbUpdates.sn = updates.sn;
        if (updates.approvedBy !== undefined) dbUpdates.approved_by = updates.approvedBy;
        if (updates.approvedAt !== undefined) dbUpdates.approved_at = updates.approvedAt;
        if (updates.plannedFinishDate !== undefined) dbUpdates.planned_finish_date = updates.plannedFinishDate;
        if (updates.cancelledAt !== undefined) dbUpdates.cancelled_at = updates.cancelledAt;
        if (updates.cancelledBy !== undefined) dbUpdates.cancelled_by = updates.cancelledBy;
        if (updates.location !== undefined) dbUpdates.location = updates.location;
        if (updates.source !== undefined) dbUpdates.source = updates.source;

        // Auto set approved_at if status changes to Approved
        if (updates.hrApprovalStatus === 'Approved') {
            dbUpdates.approved_at = new Date();
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
            rejectionReason: updated.rejection_reason,
            cancelledAt: updated.cancelled_at,
            cancelledBy: updated.cancelled_by
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
        const meetings = await query('SELECT * FROM meetings');
        const mapped = meetings.map(m => ({
            ...m,
            description: m.agenda, // Map agenda to description for frontend
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
            'INSERT INTO meetings (title, date, time, host, location, type, meetLink, agenda, guests_json, cost_report_json, employee_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
            [m.title, new Date(m.date), m.time, m.host || 'HR Team', m.location, m.type || 'Offline', m.meetLink || '', m.description || m.agenda || '', JSON.stringify(guests), null, m.employee_id]
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
            'UPDATE meetings SET title = ?, date = ?, time = ?, host = ?, location = ?, type = ?, meetLink = ?, agenda = ?, guests_json = ?, cost_report_json = ?, employee_id = ? WHERE id = ?',
            [
                m.title,
                new Date(m.date),
                m.time,
                m.host || 'HR Team',
                m.location,
                m.type || 'Offline',
                m.meetLink || '',
                m.description || m.agenda || '',
                JSON.stringify(guests),
                costReport ? JSON.stringify(costReport) : null,
                m.employee_id,
                id
            ]
        );

        const updated = await query('SELECT * FROM meetings WHERE id = ?', [id]);
        const r = updated[0];

        res.json({
            ...r,
            description: r.agenda,
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

const mapCourse = (c, modules) => {
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
        const combined = courses.map(c => mapCourse(c, modules));
        res.json(combined);
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

        // Return updated
        const updatedCourseData = await query('SELECT * FROM courses WHERE id = ?', [id]);
        const updatedModulesData = await query('SELECT * FROM course_modules WHERE course_id = ?', [id]);
        
        const mapped = mapCourse(updatedCourseData[0], updatedModulesData);
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
        await query('DELETE FROM courses WHERE id = ?', [id]);
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
        await query(
            'INSERT INTO quiz_results (student_id, student_name, course_id, module_id, score, date, quiz_type, employee_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
            [studentId, studentName, courseId, moduleId, score, now, quizType, employeeId]
        );

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
            'SELECT id, student_id, student_name, course_id, module_id as moduleId, score, date, quiz_type as quizType FROM quiz_results WHERE (student_id = ? OR (employee_id IS NOT NULL AND employee_id = ?)) AND course_id = ? ORDER BY date DESC',
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
        const result = await query(
            'INSERT INTO incentives (employee_name, employee_id, course_name, description, start_date, end_date, evidence_url, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
            [
                i.employeeName,
                i.employee_id,
                i.courseName,
                i.description || '',
                new Date(i.startDate),
                new Date(i.endDate),
                i.evidenceUrl || '',
                i.status || 'Pending'
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

// Fallback
if (fs.existsSync(DIST_DIR)) {
    app.get(/(.*)/, (req, res) => res.sendFile(path.join(DIST_DIR, 'index.html')));
}

app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT} with MySQL`));

