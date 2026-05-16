import pool from '../server/db.js';

async function analyzeSync() {
    try {
        const apiKey = 'k0fipxf232vbm0q4fcszt81975s2qptsxwyr7hi3f9l1gdclfl77p28zuu3l0jd9';
        const url = 'https://simas.nusa.id/api/v2/book/loan';
        
        console.log('Fetching data from SIMAS...');
        const response = await fetch(url, { headers: { 'x-api-key': apiKey } });
        const dataJson = await response.json();
        
        if (!dataJson.success || !dataJson.data || dataJson.data.length === 0) {
            console.error('Failed to fetch or data is empty');
            return;
        }

        const simasData = dataJson.data[0];
        const simasEmployeeIds = Object.keys(simasData);
        console.log(`Total Employee IDs in SIMAS: ${simasEmployeeIds.length}`);

        const [users] = await pool.query('SELECT employee_id, name FROM users');
        const userMap = users.reduce((acc, u) => {
            if (u.employee_id) acc[u.employee_id.trim()] = u.name;
            return acc;
        }, {});
        
        const lmsEmployeeIds = Object.keys(userMap);
        console.log(`Total Employee IDs in LMS Users: ${lmsEmployeeIds.length}`);

        let missingInLms = 0;
        let foundInLms = 0;
        
        for (const eid of simasEmployeeIds) {
            if (userMap[eid]) {
                foundInLms++;
            } else {
                missingInLms++;
            }
        }

        console.log(`SIMAS Employees found in LMS: ${foundInLms}`);
        console.log(`SIMAS Employees MISSING in LMS: ${missingInLms}`);
        
        // Check for specific structure issues
        let totalBooksInSimas = 0;
        let booksMissingHistory = 0;
        
        for (const eid of simasEmployeeIds) {
            const empLoans = simasData[eid].bookLoans;
            if (empLoans) {
                for (const uuid of Object.keys(empLoans)) {
                    totalBooksInSimas++;
                    const b = empLoans[uuid];
                    if (!b.loanHistory || !b.loanHistory.loaning) {
                        booksMissingHistory++;
                    }
                }
            }
        }
        
        console.log(`Total book loans in SIMAS: ${totalBooksInSimas}`);
        console.log(`Books missing loanHistory/loaning (will be skipped): ${booksMissingHistory}`);

        process.exit(0);
    } catch (err) {
        console.error('Analysis failed:', err);
        process.exit(1);
    }
}

analyzeSync();
