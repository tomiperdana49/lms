// One-off: same reading_logs.category data-cleanup already applied to the local/dev DB during the
// "Sirah Nabawiyah showing 90 hours instead of 15" investigation. Run this once against production to
// bring it in sync.
//
// Root cause: the app's category dropdown was renamed over time (old English names -> old Indonesian
// short names -> current full Indonesian names), but existing rows kept whatever string was valid when
// they were created. getReadingLogHours() (server.js, backfill_nusawork_sync.js) and the Reading Log
// stats widget (ReadingLogPage.tsx) only recognize the CURRENT category strings - anything else falls
// through to a cost-based fallback formula, which produced wrong hours (e.g. 90h instead of 15h whenever
// a milestone bonus inflated incentive_amount).
//
// Every update below is guarded by "id AND category = <expected old value>" - if a row's category
// isn't exactly what we saw in the dev DB (already fixed, or this id means something else in
// production), it's left untouched and reported at the end instead of silently overwritten.
//
// Safe to re-run: rows already migrated no longer match their old category, so they're just skipped.
//
// Usage: node server/migrate_reading_log_categories.js

import pool from './db.js';

// { id, from: expected current category, to: new category, title: for-reference only, logged in output }
const fixes = [
    // "Biography" (old English name) -> current official category
    { id: 540, from: 'Biography', to: 'Buku Biografi dan Sejarah', title: 'Sirah Nabawiyah (sejarah hidup nabi Muhammad SAW)' },

    // "Buku Biografi & Sejarah" ("&" instead of "dan") -> official name
    { id: 81, from: 'Buku Biografi & Sejarah', to: 'Buku Biografi dan Sejarah', title: 'Kisah, Perjuangan, & Inspirasi William Soeryadjaya' },
    { id: 743, from: 'Buku Biografi & Sejarah', to: 'Buku Biografi dan Sejarah', title: 'Kisah, Perjuangan, & Inspirasi William Soeryadjaya' },

    // "Buku Sales & Marketing" ("&" instead of "dan") -> official name
    { id: 68, from: 'Buku Sales & Marketing', to: 'Buku Sales dan Marketing', title: 'Spin Selling' },
    { id: 131, from: 'Buku Sales & Marketing', to: 'Buku Sales dan Marketing', title: 'Spin Selling' },
    { id: 224, from: 'Buku Sales & Marketing', to: 'Buku Sales dan Marketing', title: 'Spin Selling' },
    { id: 673, from: 'Buku Sales & Marketing', to: 'Buku Sales dan Marketing', title: 'The Fall of Advertising & The Rise of PR' },
    { id: 764, from: 'Buku Sales & Marketing', to: 'Buku Sales dan Marketing', title: 'Building A Story Brand' },
    { id: 786, from: 'Buku Sales & Marketing', to: 'Buku Sales dan Marketing', title: 'Building A Story Brand' },

    // "Business & Economy" (old English name) -> official name
    { id: 525, from: 'Business & Economy', to: 'Buku Bisnis dan Manajemen', title: 'Business mom' },

    // "Self Development" (old English name) -> official name
    { id: 536, from: 'Self Development', to: 'Buku Pengembangan Diri', title: 'Simplify Your Work Life' },
    { id: 541, from: 'Self Development', to: 'Buku Pengembangan Diri', title: 'The let them theory' },

    // "Others" (old English name) -> official catch-all
    { id: 526, from: 'Others', to: 'Buku Lainnya', title: 'Noise : cacat dalam pertimbangan manusia' },
    { id: 542, from: 'Others', to: 'Buku Lainnya', title: 'Generasi zombie' },

    // "Buku Lainya" (missing an "n") -> "Buku Lainnya"
    { id: 727, from: 'Buku Lainya', to: 'Buku Lainnya', title: 'Common Sense' },

    // "Lainnya" (missing the "Buku " prefix) -> "Buku Lainnya"
    { id: 418, from: 'Lainnya', to: 'Buku Lainnya', title: '77 Cara Bodoh Hidup Bahagia' },
    { id: 420, from: 'Lainnya', to: 'Buku Lainnya', title: 'Berani Tidak Disukai' },
    { id: 421, from: 'Lainnya', to: 'Buku Lainnya', title: 'Modular Design Frameworks: A Projects-based Guide for UI/UX Designers' },
    { id: 422, from: 'Lainnya', to: 'Buku Lainnya', title: 'Atomic Design' },
    { id: 423, from: 'Lainnya', to: 'Buku Lainnya', title: 'Designing for Emotion' },
    { id: 425, from: 'Lainnya', to: 'Buku Lainnya', title: 'The Art Stoicism' },
    { id: 427, from: 'Lainnya', to: 'Buku Lainnya', title: '77 Cara Bodoh Hidup Bahagia' },
    { id: 428, from: 'Lainnya', to: 'Buku Lainnya', title: 'Hidup Damai Tanpa Berpikir Berlebihan' },
    { id: 431, from: 'Lainnya', to: 'Buku Lainnya', title: 'The Psychology of Money' },
    { id: 432, from: 'Lainnya', to: 'Buku Lainnya', title: 'Who Moved My Cheese?' },
    { id: 436, from: 'Lainnya', to: 'Buku Lainnya', title: 'The Freedom of Self-Forgetfulness: The Path to True Christian Joy' },
    { id: 437, from: 'Lainnya', to: 'Buku Lainnya', title: 'The Ciputra Way' },
    { id: 438, from: 'Lainnya', to: 'Buku Lainnya', title: 'DotCom Secrets' },
    { id: 439, from: 'Lainnya', to: 'Buku Lainnya', title: 'The Art Stoicism' },
    { id: 445, from: 'Lainnya', to: 'Buku Lainnya', title: 'Membaca Pikiran Orang Lewat Bahasa Tubuh' },
    { id: 446, from: 'Lainnya', to: 'Buku Lainnya', title: 'The Things You Can See Only When You Slow Down' },
    { id: 447, from: 'Lainnya', to: 'Buku Lainnya', title: 'Introduction to Cryptography' },
    { id: 448, from: 'Lainnya', to: 'Buku Lainnya', title: 'Bikin PC Aman dari Serangan Virus, Spam, dan Spyware' },
    { id: 449, from: 'Lainnya', to: 'Buku Lainnya', title: 'Who Moved My Cheese?' },

    // "Komik Self-Help/Non Fiksi" -> closest official comic category
    { id: 77, from: 'Komik Self-Help/Non Fiksi', to: 'Komik Bisnis/Non Fiksi', title: 'The Life-Changing Manga of Tidying Up' },

    // Judgment calls based on title/genre (not simple renames) - review these against production data too
    { id: 392, from: 'Kesehatan & Gaya Hidup', to: 'Buku Religi dan Hubungan', title: 'Jurus Sehat Rasulullah' },
    { id: 82, from: 'Buku', to: 'Buku Pengembangan Diri', title: 'buku the psychology of money' },
    { id: 701, from: 'Buku', to: 'Buku Pengembangan Diri', title: 'The Psychology Of Money' },
    { id: 749, from: 'Buku', to: 'Buku Pengembangan Diri', title: 'MAKANYA, MIKIR! panduan Berpikir Untuk Hidup Lebih Bahagia' },
    { id: 86, from: 'Buku Milik Pribadi', to: 'Buku Bisnis dan Manajemen', title: 'Prinsipil Ekonomi' },
    { id: 462, from: 'Buku Pribadi', to: 'Buku Pengembangan Diri', title: 'Quarter Life Crisis' },
];

async function migrate() {
    const conn = await pool.getConnection();
    const updated = [];
    const skipped = [];
    try {
        await conn.beginTransaction();

        for (const fix of fixes) {
            const [result] = await conn.query(
                'UPDATE reading_logs SET category = ? WHERE id = ? AND category = ?',
                [fix.to, fix.id, fix.from]
            );
            if (result.affectedRows === 1) {
                updated.push(fix);
                console.log(`OK  [${fix.id}] "${fix.title}": "${fix.from}" -> "${fix.to}"`);
            } else {
                const [[current]] = await conn.query('SELECT category FROM reading_logs WHERE id = ?', [fix.id]);
                skipped.push({ ...fix, currentCategory: current ? current.category : '(row not found)' });
                console.log(`SKIP [${fix.id}] "${fix.title}": expected category "${fix.from}", found "${current ? current.category : '(row not found)'}" - left untouched`);
            }
        }

        await conn.commit();
        console.log(`\nDone. Updated ${updated.length}/${fixes.length} rows.`);
        if (skipped.length > 0) {
            console.log(`${skipped.length} row(s) skipped (already migrated, or id/category mismatch in production) - review manually:`);
            console.log(JSON.stringify(skipped, null, 2));
        }
    } catch (err) {
        await conn.rollback();
        console.error('Migration failed, rolled back:', err.message);
        process.exit(1);
    } finally {
        conn.release();
    }
    process.exit(0);
}

migrate();
