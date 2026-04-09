import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '../.env') });

const pool = mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME
});

async function runSync() {
    const baseUrl = process.env.SIMAS_API_BASE_URL || 'https://simas.nusa.id/';
    let url = `${baseUrl}api/v2/book/loan`;
    const apiKey = process.env.SIMAS_API_KEY || '';
    
    const response = await fetch(url, { headers: { 'x-api-key': apiKey } });
    const dataJson = await response.json();
    const simasData = dataJson.data[0];

    const [allUsers] = await pool.query('SELECT employee_id, name FROM users WHERE employee_id IS NOT NULL AND employee_id != ""');
    
    console.log(`Syncing ${allUsers.length} users...`);

    for (const targetUser of allUsers) {
        const targetEid = (targetUser.employee_id || '').trim();
        const targetName = targetUser.name;

        if (targetEid && simasData[targetEid]) {
            const empLoans = simasData[targetEid].bookLoans;
            if (empLoans) {
                console.log(`Processing ${targetName} (${targetEid})`);
                for (const uuid of Object.keys(empLoans)) {
                    const b = empLoans[uuid];
                    if (!b.loanHistory || !b.loanHistory.loaning) continue;

                    const sn = b.code;
                    const startDateRaw = b.loanHistory.loaning.loanPeriod;
                    const startDate = new Date(startDateRaw);
                    const isReturned = b.loanHistory.return && b.loanHistory.return.returnTime;
                    const finishDateRaw = isReturned ? b.loanHistory.return.returnTime : null;

                    try {
                        const [existing] = await pool.query('SELECT * FROM reading_logs WHERE source = ? AND employee_id = ? AND sn = ? AND (DATE(start_date) = DATE(?) OR start_date = ?)',
                            ['SIMAS', targetEid, sn, startDateRaw, startDateRaw]);

                        if (existing.length === 0) {
                            console.log(`  - Inserting: ${b.name}`);
                            await pool.query(
                                'INSERT IGNORE INTO reading_logs (title, author, category, date, review, status, user_name, employee_id, evidence_url, return_evidence_url, start_date, finish_date, hr_approval_status, link, sn, location, source) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
                                [
                                    b.name, '', b.subCategory || 'Lainnya', startDate,
                                    isReturned ? (b.loanHistory.return.linkReview || '') : '',
                                    isReturned ? 'Finished' : 'Reading',
                                    targetName, targetEid, b.loanHistory.loaning.loanPhoto || '',
                                    isReturned ? (b.loanHistory.return.returnPhoto || '') : '',
                                    startDate, finishDateRaw ? new Date(finishDateRaw) : null,
                                    isReturned ? 'Draft' : 'Pending',
                                    isReturned ? (b.loanHistory.return.linkReview || '') : '',
                                    sn, 'Kantor', 'SIMAS'
                                ]
                            );
                        }
                    } catch (e) {
                        console.error(`  - ERROR for ${b.name}:`, e.message);
                    }
                }
            }
        }
    }
    process.exit(0);
}

runSync();
