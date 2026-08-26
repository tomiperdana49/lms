import express from 'express';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
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

    if (position.includes('SUPERVISOR') || position.includes('SPV') || position.includes('MANAGER')) {
        return 'SUPERVISOR';
    }

    return 'STAFF';
};

const checkIsSupervisor = async (user) => {
    if (!user) return false;
    if (user.role === 'SUPERVISOR') return true;

    if (user.employee_id || user.name || user.email) {
        try {
            const subCount = await querySimAsset(
                `SELECT COUNT(*) as count FROM employees 
                 WHERE id_report_to = ? 
                    OR id_report_to = ? 
                    OR id_report_to LIKE ? 
                    OR id_report_to = ?`,
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

// Normalizes a local ID phone number to the "62..." format expected by the WhatsApp API.
const normalizeIndonesianPhone = (phone) => {
    if (!phone) return null;
    let digits = String(phone).replace(/\D/g, '');
    if (!digits) return null;
    if (digits.startsWith('0')) digits = '62' + digits.slice(1);
    else if (!digits.startsWith('62')) digits = '62' + digits;
    return digits;
};

// --- WHATSAPP NOTIFICATION INTEGRATION (NusaContact) ---
const sendWhatsAppNotification = async (toPhone, text) => {
    const waUrl = process.env.WHATSAPP_API_URL;
    const waToken = process.env.WHATSAPP_API_TOKEN;
    const to = normalizeIndonesianPhone(toPhone);
    if (!waUrl || !to) return;

    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 6000);
        const response = await fetch(waUrl, {
            method: 'POST',
            headers: {
                'Authorization': waToken ? `Bearer ${waToken}` : '',
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ to, body: 'text', text }),
            signal: controller.signal
        });
        clearTimeout(timeoutId);
        if (!response.ok) {
            console.error(`[WhatsApp] Notification failed (${response.status}):`, await response.text());
        }
    } catch (waErr) {
        console.error('[WhatsApp] Failed to send notification:', waErr.message);
    }
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
        const branchName = employee.organization_name || employee.branch_name || (employee.branch ? employee.branch.name : 'Headquarters');
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

        // Domain restriction check for email logins
        if (loginId.includes('@')) {
            const isCorporate = loginId.endsWith('@nusawork.com') || loginId.endsWith('@nusa.id');
            if (!isCorporate) {
                return res.status(403).json({ success: false, message: 'Access Restricted: Only @nusa.id or @nusawork.com emails are allowed.' });
            }
        }

        // 2. First try: Local database check using our helper (handles email domain transitions)
        let user = await findLocalUserByEmailOrId(loginId, null);

        // Fallback for custom / demo accounts without proper email formats if not found by helper
        if (!user) {
            const localUsers = await query(
                'SELECT * FROM users WHERE (email = ? OR employee_id = ?) AND password = ?',
                [loginId, loginId, cleanPassword]
            );
            if (localUsers.length > 0) {
                user = localUsers[0];
            }
        }

        if (user && user.password === cleanPassword) {
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

            const isSupervisor = await checkIsSupervisor(finalUser);

            return res.json({
                success: true,
                user: {
                    id: finalUser.id,
                    name: finalUser.name,
                    role: finalUser.role,
                    email: finalUser.email,
                    branch: finalUser.branch,
                    employee_id: finalUser.employee_id,
                    isSupervisor
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
            console.log(`[NUSANET AUTH] Response for ${loginId}:`, authData);

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
                let user = await findLocalUserByEmailOrId(loginId, employeeId);

                if (!user) {
                    // Fallback create if somehow syncEmployeeFromNusawork failed to insert
                    console.log(`[NUSANET AUTH] Fallback create local user for ${loginId}`);
                    const id = Date.now().toString();
                    const fullName = loginId.split('@')[0].replace('.', ' ');
                    const avatar = employeeHelper?.photo_profile || `https://ui-avatars.com/api/?name=${fullName}&background=random`;

                    let initialRole = 'STAFF';
                    if (employeeHelper) {
                        initialRole = determineInitialRole(employeeHelper);
                    }

                    await query('INSERT INTO users (id, email, password, name, role, avatar, branch, employee_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
                        [id, loginId, 'nusanet-oauth-placeholder', fullName, initialRole, avatar, 'Headquarters', employeeId]);

                    const newUsers = await query('SELECT * FROM users WHERE email = ?', [loginId]);
                    user = newUsers[0];
                }

                const isSupervisor = await checkIsSupervisor(user);

                return res.json({
                    success: true,
                    user: {
                        id: user.id,
                        name: user.name,
                        role: user.role,
                        email: user.email,
                        branch: user.branch,
                        employee_id: user.employee_id,
                        isSupervisor
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
        if (!email || (!email.endsWith('@nusawork.com') && !email.endsWith('@nusa.id'))) {
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
            // New User: Create with linked data
            const id = Date.now().toString();
            const name = employeeHelper ? employeeHelper.full_name : email.split('@')[0].replace('.', ' ');
            const avatar = employeeHelper?.photo_profile || `https://ui-avatars.com/api/?name=${name}&background=random`;
            const branch = employeeHelper?.organization_name || 'Headquarters';

            const initialRole = determineInitialRole(employeeHelper);

            console.log(`[GOOGLE AUTH] Creating new user ${email} with default role ${initialRole}`);
            await query('INSERT INTO users (id, email, password, name, role, avatar, branch, employee_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
                [id, email, 'google-oauth-placeholder', name, initialRole, avatar, branch, employeeId]);

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
            user: {
                id: user.id,
                name: user.name,
                role: user.role,
                email: user.email,
                branch: user.branch,
                employee_id: user.employee_id,
                isSupervisor
            }
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Database error' });
    }
});

// --- APP CONFIG ENDPOINT ---
app.get('/api/config', (req, res) => {
    res.json({
        moduleInternal: process.env.module_internal === 'true',
        moduleExternal: process.env.module_external === 'true',
        moduleIncentive: process.env.module_incentive_certification === 'true',
        moduleIDP: process.env.module_IDP !== 'false'
    });
});

// --- SESSION EPOCH ENDPOINT (Force Logout Mechanism) ---
app.get('/api/auth/session-epoch', (req, res) => {
    const currentEpoch = process.env.SESSION_EPOCH || 'v1';
    res.json({ success: true, epoch: currentEpoch });
});

// --- AUTH SESSION REFRESH ENDPOINT ---
app.post('/api/auth/refresh', async (req, res) => {
    try {
        const { email } = req.body;
        if (!email) {
            return res.status(400).json({ success: false, message: 'Email is required' });
        }

        let users = await query('SELECT * FROM users WHERE email = ?', [email]);
        let user = users[0];
        if (!user) {
            return res.status(404).json({ success: false, message: 'User not found' });
        }

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

        res.json({
            success: true,
            user: {
                id: user.id,
                name: user.name,
                role: user.role,
                email: user.email,
                branch: user.branch,
                employee_id: user.employee_id,
                isSupervisor
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
                    const branchName = employee.organization_name || employee.branch_name || (employee.branch ? employee.branch.name : 'Headquarters');
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
        const meetings = await query("SELECT id, title, date, time, guests_json, cost_report_json, host, employee_id FROM meetings WHERE type IN ('Offline', 'Online', 'Hybrid', 'Internal')");

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
                if (data && data.rating !== undefined) rating = data.rating;
            } catch (e) { }
            feedbackByMeeting[f.meeting_id] = { submittedAt: f.submitted_at, rating };
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
                    organizer: meeting.host || null
                });
            }
        }

        // 2. External Training (external_training_requests)
        if (targetEmpId) {
            const externalTrainings = await query(
                "SELECT title, vendor, certificate_link, start_date, end_date, registration_fee, travel_flight_cost, accommodation_cost, miscellaneous_cost, learning_hours FROM external_training_requests WHERE employee_id = ? AND status = 'Processed'",
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
                    title: ext.title,
                    date: ext.start_date,
                    hours: Math.round(itemHours * 100) / 100,
                    cost: Math.round(itemCost),
                    organizer: ext.vendor || null,
                    certificateLink: ext.certificate_link || null
                });
            }
        }

        // 3. Online Modules (progress on courses)
        if (targetEmpId || targetUserId) {
            const progressRows = await query(
                `SELECT p.course_id, p.completed_module_ids, p.last_access, c.title as course_title
                 FROM progress p LEFT JOIN courses c ON p.course_id = c.id
                 WHERE (p.employee_id IS NOT NULL AND p.employee_id = ?) OR p.user_id = ?`,
                [targetEmpId, targetUserId]
            );

            if (progressRows.length > 0) {
                const moduleRows = await query('SELECT id, duration FROM course_modules');
                const durationMap = {};
                for (const m of moduleRows) durationMap[m.id] = m.duration;

                const parseModuleDuration = (dur) => {
                    if (!dur) return 0;
                    if (typeof dur === 'string' && dur.includes(':')) {
                        const [mm, ss] = dur.split(':').map(Number);
                        return ((mm || 0) + (ss || 0) / 60) / 60;
                    }
                    const n = Number(dur);
                    return isNaN(n) ? 0 : n / 60;
                };

                for (const p of progressRows) {
                    if (!isWithinRange(p.last_access)) continue;

                    let completedIds = [];
                    try {
                        completedIds = typeof p.completed_module_ids === 'string'
                            ? JSON.parse(p.completed_module_ids)
                            : (p.completed_module_ids || []);
                    } catch (e) { }

                    let courseHours = 0;
                    for (const modId of completedIds) {
                        courseHours += parseModuleDuration(durationMap[modId]);
                    }
                    jamOnline += courseHours;

                    if (courseHours > 0) {
                        onlineDetails.push({
                            title: p.course_title || `Course #${p.course_id}`,
                            date: p.last_access,
                            hours: Math.round(courseHours * 100) / 100,
                            cost: 0
                        });
                    }
                }
            }
        }

        // 4. Baca Buku (reading_logs)
        if (targetEmpId) {
            const logs = await query("SELECT title, finish_date, date, incentive_amount, category FROM reading_logs WHERE employee_id = ? AND hr_approval_status = 'Approved'", [targetEmpId]);
            // Biaya buku
            for (const log of logs) {
                if (!isWithinRange(log.finish_date || log.date)) continue;

                const incentive = Number(log.incentive_amount) || 0;
                biayaBuku += incentive;

                const category = log.category || '';
                let itemHours = 0;

                if (category === 'Buku Fiksi/Novel' || category === 'Majalah') {
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

        res.json(merged);
    } catch (err) {
        console.error('[API] Error in /api/learning-stats/bulk:', err);
        res.status(500).json({ error: err.message });
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
                if (key === 'password' && (!updates[key] || updates[key] === '')) {
                    return; // Skip empty passwords
                }
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
                                        b.name, '', b.subCategory || 'Lainnya', startDate,
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
            claimedAt: updated.claimed_at
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
            costReport: m.cost_report_json ? (typeof m.cost_report_json === 'string' ? JSON.parse(m.cost_report_json) : m.cost_report_json) : undefined,
            pre_test_data: m.pre_test_data ? (typeof m.pre_test_data === 'string' ? JSON.parse(m.pre_test_data) : m.pre_test_data) : undefined,
            post_test_data: m.post_test_data ? (typeof m.post_test_data === 'string' ? JSON.parse(m.post_test_data) : m.post_test_data) : undefined,
            feedback_data: m.feedback_data ? (typeof m.feedback_data === 'string' ? JSON.parse(m.feedback_data) : m.feedback_data) : undefined
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

        // Convert date to local YYYY-MM-DD
        const d = new Date(m.date);
        const localDate = new Date(d.getTime() + 7 * 60 * 60 * 1000).toISOString().split('T')[0];

        const result = await query(
            'INSERT INTO meetings (title, date, time, host, location, type, meetLink, agenda, guests_json, cost_report_json, employee_id, competency_type, competency_name, training_gr_type, pre_test_link, material_link, post_test_link, feedback_link, pre_test_data, post_test_data, feedback_data, is_pre_test_active, is_post_test_active, is_feedback_active, is_closed) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
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
                0,
                0,
                0
            ]
        );

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

        // Prepare guests JSON
        let guests = m.guests || { status: 'Awaiting', count: 0, emails: [] };

        // Prepare Cost Report JSON
        let costReport = m.costReport || null;

        // Convert date to local YYYY-MM-DD
        const d = new Date(m.date);
        const localDate = new Date(d.getTime() + 7 * 60 * 60 * 1000).toISOString().split('T')[0];

        await query(
            'UPDATE meetings SET title = ?, date = ?, time = ?, host = ?, location = ?, type = ?, meetLink = ?, agenda = ?, guests_json = ?, cost_report_json = ?, employee_id = ?, competency_type = ?, competency_name = ?, training_gr_type = ?, pre_test_link = ?, material_link = ?, post_test_link = ?, feedback_link = ?, pre_test_data = ?, post_test_data = ?, feedback_data = ?, is_pre_test_active = ?, is_post_test_active = ?, is_feedback_active = ?, is_closed = ? WHERE id = ?',
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
                costReport ? JSON.stringify(costReport) : null,
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
                m.is_pre_test_active ? 1 : 0,
                m.is_post_test_active ? 1 : 0,
                m.is_feedback_active ? 1 : 0,
                m.is_closed ? 1 : 0,
                id
            ]
        );

        const updated = await query('SELECT * FROM meetings WHERE id = ?', [id]);
        const r = updated[0];

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
        // Meetings has no FK cascade to these tables, so clean them up explicitly
        // to avoid leaving orphaned quiz/feedback/certificate rows behind.
        await query('DELETE FROM quiz_results WHERE meeting_id = ?', [meetingId]);
        await query('DELETE FROM course_feedback WHERE meeting_id = ?', [meetingId]);
        await query('DELETE FROM internal_certificates WHERE meeting_id = ?', [meetingId]);
        await query('DELETE FROM meetings WHERE id = ?', [meetingId]);
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
        await query(
            'INSERT INTO quiz_results (student_id, student_name, course_id, module_id, meeting_id, score, date, quiz_type, employee_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
            [studentId, studentName, courseId || null, moduleId || null, req.body.meetingId || null, score, now, quizType, employeeId]
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
            'SELECT id, student_id, student_name, course_id, module_id as moduleId, meeting_id as meetingId, score, date, quiz_type as quizType FROM quiz_results WHERE (student_id = ? OR (employee_id IS NOT NULL AND employee_id = ?)) AND meeting_id = ? ORDER BY date DESC',
            [userId, employeeId, meetingId]
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
app.post('/api/external-training/request', async (req, res) => {
    try {
        const { employee_id, employee_name, category, title, start_date, end_date, registration_fee, attachment_link, vendor, location, payment_method } = req.body;
        // datetime-local inputs send "YYYY-MM-DDTHH:MM"; MySQL DATETIME literals need a space instead of "T"
        const toMysqlDatetime = (v) => v ? v.replace('T', ' ') : null;
        const result = await query(`
            INSERT INTO external_training_requests
            (employee_id, employee_name, category, title, start_date, end_date, registration_fee, attachment_link, vendor, location, payment_method)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [employee_id, employee_name, category, title, toMysqlDatetime(start_date), toMysqlDatetime(end_date), registration_fee || 0, attachment_link || '', vendor || '', location || '', payment_method || 'Reimbursement']);

        // Notify the requester's supervisor via WhatsApp (best-effort, never blocks the response)
        try {
            const supervisor = await findReportToEmployee(employee_id);
            const supervisorPhone = supervisor?.whatsapp || supervisor?.mobile_phone;
            if (supervisorPhone) {
                const approvalLink = `${process.env.APP_BASE_URL || ''}/?page=external&tab=team_approvals`;
                await sendWhatsAppNotification(
                    supervisorPhone,
                    `Halo ${supervisor.full_name}, ada pengajuan training eksternal baru dari ${employee_name} ("${title}") yang menunggu persetujuan Anda di LMS.\n\nCek di sini: ${approvalLink}`
                );
            }
        } catch (notifyErr) {
            console.error('[External Training] Failed to notify supervisor:', notifyErr.message);
        }

        res.json({ success: true, id: result.insertId });
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
            WHERE r.employee_id = ? 
            ORDER BY r.created_at DESC
        `;
        const rows = await query(queryStr, [employee_id]);
        res.json(rows);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// 3. Leader views requests from subordinates
app.get('/api/external-training/subordinates', async (req, res) => {
    try {
        const { leader_id } = req.query;
        if (!leader_id) return res.json([]);

        // Get leader's info to find their user_id or name
        const leaderInfo = await querySimAsset('SELECT user_id, full_name, nickname FROM employees WHERE id_employee = ?', [leader_id]);
        if (leaderInfo.length === 0) return res.json([]);
        const leader = leaderInfo[0];
        const leaderUserId = leader.user_id;
        const leaderFullName = leader.full_name;
        const leaderNickName = leader.nickname || leaderFullName;

        // Get all subordinates of this leader from SimAsset
        const subordinatesResult = await querySimAsset(`
            SELECT id_employee FROM employees
            WHERE id_report_to_value = ? 
               OR id_report_to = ? 
               OR id_report_to = ?
               OR id_report_to LIKE ? 
               OR id_report_to LIKE ?
        `, [leaderUserId, leaderFullName, leaderNickName, `${leaderFullName},%`, `%,${leaderFullName},%`]);

        const subordinateIds = subordinatesResult.map(s => s.id_employee);
        if (subordinateIds.length === 0) return res.json([]);

        const placeholders = subordinateIds.map(() => '?').join(',');
        const rows = await query(`
            SELECT * FROM external_training_requests 
            WHERE employee_id IN (${placeholders}) 
            ORDER BY created_at DESC
        `, subordinateIds);

        res.json(rows);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// 4. Leader approves/rejects
app.post('/api/external-training/approve', async (req, res) => {
    try {
        const { id, status, approved_by, rejection_reason } = req.body; // status should be 'Approved' or 'Rejected'
        if (status === 'Rejected') {
            await query('UPDATE external_training_requests SET status = ?, approved_by = ?, rejection_reason = ? WHERE id = ?', [status, approved_by, rejection_reason || null, id]);
        } else {
            await query('UPDATE external_training_requests SET status = ?, approved_by = ? WHERE id = ?', [status, approved_by, id]);
        }
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// 5. Admin views all requests
app.get('/api/external-training/all', async (req, res) => {
    try {
        const rows = await query(`SELECT * FROM external_training_requests ORDER BY created_at DESC`);
        res.json(rows);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// 6. HR views all approved/processed requests
app.get('/api/external-training/hr', async (req, res) => {
    try {
        // HR usually wants to see Approved (needs action) or Processed (done)
        const rows = await query(`SELECT * FROM external_training_requests WHERE status IN ('Approved', 'Processed') ORDER BY updated_at DESC`);
        res.json(rows);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// 6. HR processes payment
app.post('/api/external-training/hr-process', async (req, res) => {
    try {
        const { id, travel_flight_cost, accommodation_cost, miscellaneous_cost, payment_method, registration_fee, certificate_link, certificate_expiry_date, title, vendor, location, start_date, end_date, certification_result, incentive_reward, incentive_payment_type, hr_name, training_gr_type, participation_type, learning_hours } = req.body;
        // datetime-local inputs send "YYYY-MM-DDTHH:MM"; MySQL DATETIME literals need a space instead of "T"
        const toMysqlDatetime = (v) => v ? v.replace('T', ' ') : null;

        let sql = `UPDATE external_training_requests SET status = 'Processed', travel_flight_cost = ?, accommodation_cost = ?, miscellaneous_cost = ?, payment_method = ?, hr_name = ?`;
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
        sql += ` WHERE id = ?`;
        params.push(id);

        await query(sql, params);
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
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
    const result = { inserted: 0, skipped: 0, duplicates: [], errors: [] };

    for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        const rowLabel = row.sheet_name || row.employee_name || `#${i + 1}`;
        try {
            if (!row.employee_name || !row.period_year) {
                result.errors.push({ row: rowLabel, error: 'Nama karyawan atau periode IDP tidak ditemukan di sheet.' });
                continue;
            }

            const nameMatches = await querySimAsset(
                'SELECT id_employee, organization_name, join_date FROM employees WHERE full_name = ? LIMIT 1',
                [row.employee_name.trim()]
            );
            const employee = nameMatches[0] || (await querySimAsset(
                'SELECT id_employee, organization_name, join_date FROM employees WHERE full_name LIKE ? LIMIT 1',
                [`%${row.employee_name.trim()}%`]
            ))[0];

            if (!employee) {
                result.errors.push({ row: rowLabel, error: `Karyawan "${row.employee_name}" tidak ditemukan di data organisasi.` });
                continue;
            }
            const employeeId = employee.id_employee;

            const existing = await query('SELECT id FROM idp_plans WHERE employee_id = ? AND period_year = ?', [employeeId, row.period_year]);
            if (existing.length > 0) {
                result.skipped++;
                result.duplicates.push({ row: rowLabel, employee_name: row.employee_name, period_year: row.period_year });
                continue;
            }

            let supervisorName = row.supervisor_name || null;
            if (!supervisorName) {
                const supervisor = await findReportToEmployee(employeeId);
                supervisorName = supervisor?.full_name || null;
            }
            const department = row.department || employee.organization_name || '';
            const joinDateLabel = row.join_date_label || formatIndoDate(employee.join_date);

            const reviews = Array.isArray(row.reviews) ? row.reviews.filter(r => r.review_date) : [];
            const status = row.approved_date || reviews.length > 0 ? 'Approved' : (row.created_by_date ? 'Pending' : 'Draft');

            const planResult = await query(`
                INSERT INTO idp_plans
                (employee_id, employee_name, job_position, department, supervisor_name, period_year,
                 join_date_label, achievements, career_goal, existing_skills, development_area, status,
                 created_by_date, approved_date, hr_note, hr_note_by)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `, [
                employeeId, row.employee_name.trim(), row.job_position || '', department, supervisorName,
                row.period_year, joinDateLabel, row.achievements || '', row.career_goal || '',
                row.existing_skills || '', row.development_area || '', status,
                row.created_by_date || null, row.approved_date || null, row.hr_note || null, row.hr_note_by || null
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
        } catch (err) {
            result.errors.push({ row: rowLabel, error: err.message });
        }
    }

    res.json(result);
});

// 2. Employee's own plans across years.
app.get('/api/idp/my-plans', async (req, res) => {
    try {
        const { employee_id } = req.query;
        if (!employee_id) return res.json([]);
        const plans = await query('SELECT * FROM idp_plans WHERE employee_id = ? ORDER BY period_year DESC', [employee_id]);
        res.json(plans);
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

        const subordinatesResult = await querySimAsset(`
            SELECT id_employee FROM employees
            WHERE id_report_to_value = ?
               OR id_report_to = ?
               OR id_report_to = ?
               OR id_report_to LIKE ?
               OR id_report_to LIKE ?
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

// 4. HR/admin: every IDP.
app.get('/api/idp/all', async (req, res) => {
    try {
        // reviewed_year_months lets HR see, month by month since the plan was created, which months
        // the supervisor actually logged a review for — without expanding every plan individually.
        const plans = await query(`
            SELECT p.*, (
                SELECT GROUP_CONCAT(DISTINCT DATE_FORMAT(r.review_date, '%Y-%m') ORDER BY r.review_date)
                FROM idp_reviews r WHERE r.idp_id = p.id
            ) AS reviewed_year_months
            FROM idp_plans p
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

        await query("UPDATE idp_plans SET status = 'Pending', created_by_date = CURDATE() WHERE id = ?", [id]);
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
                c.title as course_title,
                cm.title as module_title,
                qr.score,
                qr.date,
                qr.module_id,
                qr.quiz_type
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
        const { cost, costTraining, costTransport, costAccommodation, costOthers, additionalCost, settlementNote, certificateLink } = req.body;

        if (certificateLink) {
            await query(
                'UPDATE external_training_requests SET registration_fee = ?, travel_flight_cost = ?, accommodation_cost = ?, miscellaneous_cost = ?, additional_cost = ?, settlement_note = ?, certificate_link = ? WHERE id = ?',
                [costTraining || 0, costTransport || 0, costAccommodation || 0, costOthers || 0, additionalCost || 0, settlementNote || '', certificateLink, id]
            );
        } else {
            await query(
                'UPDATE external_training_requests SET registration_fee = ?, travel_flight_cost = ?, accommodation_cost = ?, miscellaneous_cost = ?, additional_cost = ?, settlement_note = ? WHERE id = ?',
                [costTraining || 0, costTransport || 0, costAccommodation || 0, costOthers || 0, additionalCost || 0, settlementNote || '', id]
            );
        }

        const updated = await query('SELECT * FROM external_training_requests WHERE id = ?', [id]);
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
        const rows = await query('SELECT certificate_link, renewal_certificate_link FROM external_training_requests WHERE id = ?', [id]);
        if (rows[0]) {
            deleteLocalUpload(rows[0].certificate_link);
            deleteLocalUpload(rows[0].renewal_certificate_link);
        }
        await query('DELETE FROM external_training_requests WHERE id = ?', [id]);
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

