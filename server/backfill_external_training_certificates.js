// One-off: re-host external_training_requests.certificate_link rows that still point straight at
// Google Drive (imported before bulk-import started downloading them) onto local /uploads, mirroring
// downloadDriveImageToUploads() in server.js.
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import pool from './db.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const UPLOADS_DIR = path.join(__dirname, '../uploads');

async function downloadDriveCertificateToUploads(driveUrl) {
    const match = driveUrl.match(/drive\.google\.com\/file\/d\/([a-zA-Z0-9_-]+)/) || driveUrl.match(/drive\.google\.com\/.*[?&]id=([a-zA-Z0-9_-]+)/);
    if (!match) return null;
    const fileId = match[1];

    try {
        const response = await fetch(`https://drive.google.com/uc?export=download&id=${fileId}`);
        if (!response.ok) {
            console.warn(`  - Failed to download Drive file ${fileId}: status ${response.status}`);
            return null;
        }
        // Google's download endpoint reports both images and PDFs as generic application/octet-stream;
        // the real type is only reliable from the Content-Disposition filename.
        const disposition = response.headers.get('content-disposition') || '';
        const nameMatch = disposition.match(/filename="?([^";]+)"?/);
        const nameExt = nameMatch ? path.extname(nameMatch[1]).replace('.', '').toLowerCase() : '';
        const contentType = response.headers.get('content-type') || '';
        const ext = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'pdf'].includes(nameExt)
            ? nameExt
            : (contentType.startsWith('image/') ? contentType.split('/')[1]?.split(';')[0] : contentType === 'application/pdf' ? 'pdf' : null);
        if (!ext) {
            console.warn(`  - Drive file ${fileId} is not an image or PDF (content-type: ${contentType}), skipping.`);
            return null;
        }
        const filename = `${Date.now()}-${Math.round(Math.random() * 1e9)}.${ext}`;
        const buffer = Buffer.from(await response.arrayBuffer());
        fs.writeFileSync(path.join(UPLOADS_DIR, filename), buffer);
        return `/api/uploads/${filename}`;
    } catch (e) {
        console.warn(`  - Error downloading Drive file ${fileId}:`, e.message);
        return null;
    }
}

async function backfill() {
    try {
        const [targets] = await pool.query(`SELECT id, certificate_link FROM external_training_requests WHERE certificate_link LIKE '%drive.google.com%'`);
        console.log(`Found ${targets.length} row(s) with a Google Drive certificate_link.`);

        let updated = 0;
        let failed = 0;
        for (const row of targets) {
            const localPath = await downloadDriveCertificateToUploads(row.certificate_link);
            if (localPath) {
                await pool.query('UPDATE external_training_requests SET certificate_link = ? WHERE id = ?', [localPath, row.id]);
                console.log(`  - Row id=${row.id}: re-hosted as ${localPath}`);
                updated++;
            } else {
                failed++;
                console.log(`  - Row id=${row.id}: could not download, left pointing at Drive.`);
            }
        }

        console.log(`✅ Updated ${updated} row(s). ${failed} row(s) left unchanged.`);
        process.exit(0);
    } catch (err) {
        console.error('❌ Backfill failed:', err);
        process.exit(1);
    }
}

backfill();
