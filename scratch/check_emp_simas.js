async function checkEmployee() {
    try {
        const apiKey = 'k0fipxf232vbm0q4fcszt81975s2qptsxwyr7hi3f9l1gdclfl77p28zuu3l0jd9';
        const url = 'https://simas.nusa.id/api/v2/book/loan';
        
        const response = await fetch(url, { headers: { 'x-api-key': apiKey } });
        const dataJson = await response.json();
        
        const targetEid = '0201507';
        const targetSn = 'N0006MZ7N';
        
        const empData = dataJson.data[0][targetEid];
        if (empData) {
            console.log(`Data for ${targetEid}:`);
            const loans = empData.bookLoans;
            for (const uuid of Object.keys(loans)) {
                const b = loans[uuid];
                if (b.code === targetSn) {
                    console.log('Book found:', JSON.stringify(b, null, 2));
                }
            }
        } else {
            console.log('Employee not found in SIMAS');
        }
        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

checkEmployee();
