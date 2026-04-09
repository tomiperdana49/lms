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
    
    console.log("Fetching from:", url);
    const response = await fetch(url, { headers: { 'x-api-key': apiKey } });
    const dataJson = await response.json();
    
    if (dataJson.success && dataJson.data && dataJson.data.length > 0) {
        const simasData = dataJson.data[0];
        console.log("Total Users in SIMAS Response:", Object.keys(simasData).length);
        console.log("Keys in simasData:", Object.keys(simasData));
    } else {
        console.log("No data or unsuccessful response");
    }
}

check();
