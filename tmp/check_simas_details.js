import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '../.env') });

async function check() {
    const baseUrl = process.env.SIMAS_API_BASE_URL || 'https://simas.nusa.id/';
    let url = `${baseUrl}api/v2/book/loan`;
    const apiKey = process.env.SIMAS_API_KEY || '';
    
    const response = await fetch(url, { headers: { 'x-api-key': apiKey } });
    const dataJson = await response.json();
    
    if (dataJson.success && dataJson.data && dataJson.data.length > 0) {
        const simasData = dataJson.data[0];
        const keys = Object.keys(simasData);
        for (const k of keys) {
            const loans = simasData[k].bookLoans || {};
            console.log(`User ID ${k}:`, Object.keys(loans).length, "loans");
            if (Object.keys(loans).length > 0) {
                const firstLoan = loans[Object.keys(loans)[0]];
                console.log(`  - Sample book: ${firstLoan.name} (Started: ${firstLoan.loanHistory?.loaning?.loanPeriod})`);
            }
        }
    }
}

check();
