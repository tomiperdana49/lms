// No fetch import needed in Node 18+

async function dumpSimas() {
    try {
        const apiKey = 'k0fipxf232vbm0q4fcszt81975s2qptsxwyr7hi3f9l1gdclfl77p28zuu3l0jd9';
        const url = 'https://simas.nusa.id/api/v2/book/loan';
        
        const response = await fetch(url, { headers: { 'x-api-key': apiKey } });
        const dataJson = await response.json();
        
        console.log('Data Success:', dataJson.success);
        console.log('Data Length:', dataJson.data.length);
        
        if (dataJson.data.length > 0) {
            const first = dataJson.data[0];
            const keys = Object.keys(first);
            console.log('Total keys in data[0]:', keys.length);
            
            // Look at one employee
            const sampleEid = keys[0];
            console.log(`Sample Employee: ${sampleEid}`);
            console.log('BookLoans count:', Object.keys(first[sampleEid].bookLoans || {}).length);
            
            // Check if there's data[1], data[2] etc.
            if (dataJson.data.length > 1) {
                console.log('Total keys in data[1]:', Object.keys(dataJson.data[1]).length);
            }
        }
        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

dumpSimas();
