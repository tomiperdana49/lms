import pool from './db.js';

const rawData = `1/23/2026 17:30:39	mfikri@nusa.net.id	Bad Men	Buku Fiksi/Novel	Medan - Cabang	Buku Milik Pribadi	Selesai Baca Buku	https://drive.google.com/file/d/1W08SxH1HFrftTrCrEF0DFIAus5iQpCq8/view?usp=drivesdk	https://www.goodreads.com/review/show/8244641090
3/14/2026 10:56:29	nurul@nusa.net.id	The Psychology of Money	Buku Terlaris	Medan - Cabang	Buku Milik Pribadi	Memulai Baca Buku	https://drive.google.com/file/d/1_wEBJyZVNvziA5tK9eBT92HYqfAYGM1Z/view?usp=drivesdk	
4/21/2026 20:55:27	nurul@nusa.net.id	The Psychology of Money	Buku Terlaris	Medan - Cabang	Buku Milik Pribadi	Selesai Baca Buku	https://drive.google.com/file/d/1MhSduIP3RhmtYdaqjuZh8HntGhI7Y6IS/view?usp=drivesdk	https://www.goodreads.com/review/show/8539895486
12/28/2025 22:32:16	linda@nusa.net.id	The Art Stoicism	Buku Pribadi	Medan - HO	Buku Milik Pribadi	Memulai Baca Buku	https://drive.google.com/file/d/1Drk34Q_GQrhm4oc9-a8LbDnB0F9Wxwaq/view?usp=drivesdk	
1/14/2026 17:09:03	titinpurba@nusa.net.id	Membaca Pikiran Orang Lewat Bahasa Tubuh	Buku Pribadi	Medan - HO	Buku Milik Pribadi	Memulai Baca Buku	https://drive.google.com/file/d/1vk7MeRRIlZi2WcGu5b2UGESh1059wsfk/view?usp=drivesdk	
17/11/2025 09:49:46	rizkaputri@nusa.net.id	DotCom Secrets	Buku Pribadi	Medan - HO	Buku dari Kantor	Memulai Baca Buku	https://drive.google.com/file/d/1TISWA0JrdzpBLGGohugA3QKskFYOmE0v/view?usp=drivesdk	
1/19/2026 12:05:46	rizkaputri@nusa.net.id	DotCom Secrets	Buku Pribadi	Medan - HO	Buku Milik Pribadi	Selesai Baca Buku	https://drive.google.com/file/d/1yIcoMUAYFjqD1U3JMPfWAeXiIW-xm888/view?usp=drivesdk	https://www.goodreads.com/review/show/8274589694?book_show_action=false
1/25/2026 23:28:57	titinpurba@nusa.net.id	Membaca Pikiran Orang Lewat Bahasa Tubuh	Buku Pribadi	Medan - HO	Buku Milik Pribadi	Selesai Baca Buku	https://drive.google.com/file/d/15AsAVI11heernVYlZZXen0QJvvz9spKY/view?usp=drivesdk	https://www.goodreads.com/review/show/8298158229
1/26/2026 12:31:58	rizkaputri@nusa.net.id	The Art Stoicism	Buku Pribadi	Medan - HO	Buku Milik Pribadi	Memulai Baca Buku	https://drive.google.com/file/d/16nP1EcHYk4xAK98a0Lyu9bw-Ve8eYRca/view?usp=drivesdk	
3/20/2026 23:13:50	linda@nusa.net.id	The Art Stoicism	Buku Pribadi	Medan - HO	Buku Milik Pribadi	Selesai Baca Buku	https://drive.google.com/file/d/1lBHyJkeJLMaaYORJOCRZ-t1-FMcDe70o/view?usp=drivesdk	https://www.goodreads.com/review/show/8453248532
3/31/2026 11:12:29	rizkaputri@nusa.net.id	The Art Stoicism	Buku Pribadi	Medan - HO	Buku Milik Pribadi	Selesai Baca Buku	https://drive.google.com/file/d/1FtRWbNdZhAaraxbeQVuYthVEn_sxRNtT/view?usp=drivesdk	https://docs.google.com/document/d/1gtQ8EeDXZXAL-hz9_wfUJfs-z6r_HKro3zPw4QIKxcg/edit?tab=t.sfg3uhjdcnte
4/5/2026 18:04:15	linda@nusa.net.id	The Decision Book: Fifty Models for Strategic Thinking	Buku Pribadi	Medan - HO	Buku Milik Pribadi	Memulai Baca Buku	https://drive.google.com/file/d/16TgpnsgYFb-uWoepQe38qMuKPcxm5NnI/view?usp=drivesdk	
4/15/2026 16:12:53	titinpurba@nusa.net.id	The Things You Can See Only When You Slow Down	Buku Pribadi	Medan - HO	Buku Milik Pribadi	Selesai Baca Buku	https://drive.google.com/file/d/1_f5fhVCBQPtqIyxiWwUg04I_aKi53HIw/view?usp=drivesdk	https://www.goodreads.com/review/show/8523977253
4/15/2026 21:43:55	ekopujianto@nusa.net.id	Designing for Emotion	Buku Pribadi	Medan - HO	Buku Milik Pribadi	Selesai Baca Buku	https://drive.google.com/file/d/1t3li0DiWqMU7ucjVHR8I3f7dhQ6Nvkos/view?usp=drivesdk	https://www.goodreads.com/review/show/8524488130
4/15/2026 21:46:13	ekopujianto@nusa.net.id	Conversational Design	Buku Pribadi	Medan - HO	Buku Milik Pribadi	Memulai Baca Buku	https://drive.google.com/file/d/1OYNChO_Zr5zNOISgRv1mTgSC33EVoLiD/view?usp=drivesdk	
1/9/2026 14:40:35	ekopujianto@nusa.net.id	Modular Design Frameworks: A Projects-based Guide for UI/UX Designers	Buku Pribadi	Medan - HO	E-Book	Memulai Baca Buku	https://drive.google.com/file/d/16wqrCgMrgxSMBDO7GilAWDjAkCondaNY/view?usp=drivesdk	
1/17/2026 17:07:25	ekopujianto@nusa.net.id	Modular Design Frameworks: A Projects-based Guide for UI/UX Designers	Buku Pribadi	Medan - HO	E-Book	Selesai Baca Buku	https://drive.google.com/file/d/1mfLhWz9LHIkpcXnQpvYkzOECEnYTsCml/view?usp=drivesdk	https://www.goodreads.com/review/show/8270537369
1/17/2026 17:08:19	ekopujianto@nusa.net.id	Atomic Design	Buku Pribadi	Medan - HO	E-Book	Memulai Baca Buku	https://drive.google.com/file/d/1dTJQ6ArCJRl_mRFwmjJmMGH9_8MQdqcw/view?usp=drivesdk	
2/4/2026 14:30:42	ekopujianto@nusa.net.id	Atomic Design	Buku Pribadi	Medan - HO	E-Book	Selesai Baca Buku	https://drive.google.com/file/d/1RDHPXz93ni4uc2o4yprPf4b0d4i6jPkC/view?usp=drivesdk	https://www.goodreads.com/review/show/8316195315
2/5/2026 11:25:42	ekopujianto@nusa.net.id	Designing for Emotion	Buku Pribadi	Medan - HO	E-Book	Memulai Baca Buku	https://drive.google.com/file/d/1MxGR4ISaNn99JLy-hRUMuVNSY5Mj1cAB/view?usp=drivesdk	
2/28/2026 23:31:55	meysha@nusa.net.id	Berani Tidak Disukai	Buku Terlaris	Medan - HO	E-Book	Memulai Baca Buku	https://drive.google.com/file/d/1W3bUS01e_TXVUTn4zH7tt9bp72GhLVdk/view?usp=drivesdk	
3/30/2026 11:03:09	meysha@nusa.net.id	Quarter Life Crisis	Buku Pribadi	Medan - HO	E-Book	Memulai Baca Buku	https://drive.google.com/file/d/1DOQNWKLzWImu1snfvCe0yL93aCm7mJ4z/view?usp=drivesdk	
3/30/2026 11:23:33	meysha@nusa.net.id	Quarter Life Crisis	Buku Pribadi	Medan - HO	E-Book	Selesai Baca Buku	https://drive.google.com/file/d/1Ig6-HRHpZvK5azdkLLxnjPEgTG9rd1LT/view?usp=drivesdk	https://www.goodreads.com/review/show/8479114536
3/31/2026 10:50:58	meysha@nusa.net.id	Hidup Damai Tanpa Berpikir Berlebihan	Buku Pribadi	Medan - HO	E-Book	Memulai Baca Buku	https://drive.google.com/file/d/1p_KvGdhuOSR4nPNewrCXfr8dz6DBo-my/view?usp=drivesdk	
4/2/2026 10:16:44	meysha@nusa.net.id	Hidup Damai Tanpa Berpikir Berlebihan	Buku Pribadi	Medan - HO	E-Book	Selesai Baca Buku	https://drive.google.com/file/d/1XB-vdEA_OkNyxBIwYt7LEfZhLfKX7ZmP/view?usp=drivesdk	https://www.goodreads.com/review/show/8487789717
4/13/2026 23:58:58	titinpurba@nusa.net.id	The Things You Can See Only When You Slow Down	Buku Pribadi	Medan - HO	E-Book	Memulai Baca Buku	https://drive.google.com/file/d/1dwinMdFNb7iTjsoynbbVgwZuOJ8APgn-/view?usp=drivesdk	
4/27/2026 11:59:16	meysha@nusa.net.id	Quarter Life Crisis	Buku Pribadi	Medan - HO	E-Book	Selesai Baca Buku	https://drive.google.com/file/d/177q7nXNZ3IyxglaAIUY_d1Ny9cl5UBhu/view?usp=drivesdk	https://www.goodreads.com/review/show/8479114536
2/4/2026 14:57:17	rindayana@nusawork.com	The Freedom of Self-Forgetfulness: The Path to True Christian Joy	Buku Milik Pribadi	Jakarta	E-Book	Memulai Baca Buku	https://drive.google.com/file/d/1OrCBxT2RNW8AOOHIQGpIWCYvHzbcQV9f/view?usp=drivesdk	
2/5/2026 11:22:48	rindayana@nusawork.com	The Freedom of Self-Forgetfulness: The Path to True Christian Joy	Buku Milik Pribadi	Jakarta	E-Book	Selesai Baca Buku	https://drive.google.com/file/d/1zUG-cwBwaPemNaJ7ML4NpdWtGL1bqCC_/view?usp=drivesdk	https://www.goodreads.com/review/show/8257253644
3/10/2026 19:59:09	rindayana@nusawork.com	The Ciputra Way	Buku Biografi dan Sejarah	Jakarta	E-Book	Memulai Baca Buku	https://drive.google.com/file/d/1JZZYFU90RmyrAn-Hp-AtZ4CEuJ6HO5_u/view?usp=drivesdk	
3/12/2026 11:46:40	rindayana@nusawork.com	The Ciputra Way	Buku Biografi dan Sejarah	Jakarta	E-Book	Selesai Baca Buku	https://drive.google.com/file/d/1FrjnenpUSaBCakWlDaRR7Tc35EQ15P8E/view?usp=drivesdk	https://www.goodreads.com/review/show/8425765736
3/12/2026 11:48:31	rindayana@nusawork.com	The Steve Jobs Way	Buku Biografi dan Sejarah	Jakarta	E-Book	Memulai Baca Buku	https://drive.google.com/file/d/1PAzfeD2TOEyfui4cPeEcd4r8lGYOZRIk/view?usp=drivesdk	
3/16/2026 12:06:52	rindayana@nusawork.com	The Steve Jobs Way	Buku Biografi dan Sejarah	Jakarta	E-Book	Selesai Baca Buku	https://drive.google.com/file/d/1VJGQ11Lq1xfS1GCs2SU2uACwO2TYwfCc/view?usp=drivesdk	https://www.goodreads.com/review/show/8441199040
4/6/2026 11:53:48	rindayana@nusawork.com	The Black Swan	Buku Bisnis dan Manajemen	Jakarta	E-Book	Memulai Baca Buku	https://drive.google.com/file/d/1F5jgTtMtYgFJlz-jeVbWE7MiZusg5zvS/view?usp=drivesdk	
4/15/2026 13:43:21	rindayana@nusawork.com	The Black Swan	Buku Bisnis dan Manajemen	Jakarta	E-Book	Selesai Baca Buku	https://drive.google.com/file/d/1FtQ65uOifILxZ_Edm6OlwgGH_T57enSs/view?usp=drivesdk	https://www.goodreads.com/review/show/8523831896
4/15/2026 13:45:36	rindayana@nusawork.com	Emotional Intelligence	Buku Pengembangan Diri	Jakarta	E-Book	Memulai Baca Buku	https://drive.google.com/file/d/1QnEv1dsoxpLL3IgPmhl5pZdCj2R-T_Gc/view?usp=drivesdk	
4/20/2026 15:39:57	rindayana@nusawork.com	Emotional Intelligence	Buku Pengembangan Diri	Jakarta	E-Book	Selesai Baca Buku	https://drive.google.com/file/d/1dkMe-xdyyfpqrfGwzlCSLpw514BBkqa3/view?usp=drivesdk	https://www.goodreads.com/review/show/8536600504`;

function parseFlexibleDate(timestamp) {
    const parts = timestamp.split(' ');
    const dateStr = parts[0];
    const timeStr = parts[1];
    
    const dateParts = dateStr.split('/');
    let month, day, year;

    // Detect if parts[0] is month or day
    if (parseInt(dateParts[0]) > 12) {
        // Must be D/M/YYYY
        day = dateParts[0];
        month = dateParts[1];
        year = dateParts[2];
    } else if (parseInt(dateParts[1]) > 12) {
        // Must be M/D/YYYY
        month = dateParts[0];
        day = dateParts[1];
        year = dateParts[2];
    } else {
        // Ambiguous, assume M/D/YYYY (most common for this data)
        month = dateParts[0];
        day = dateParts[1];
        year = dateParts[2];
    }

    return year + "-" + month.padStart(2, '0') + "-" + day.padStart(2, '0') + " " + timeStr;
}

async function importReadingLogs() {
    try {
        const lines = rawData.trim().split('\n');
        const [users] = await pool.query('SELECT employee_id, email, name FROM users');
        const userMap = users.reduce((acc, u) => {
            acc[u.email.toLowerCase()] = u;
            return acc;
        }, {});

        console.log("Starting import of " + lines.length + " entries...");

        for (const line of lines) {
            const parts = line.split('\t');
            if (parts.length < 7) continue;

            const timestamp = parts[0];
            const email = parts[1];
            const title = parts[2];
            const category = parts[3];
            const location = parts[4];
            const source = parts[5];
            const action = parts[6];
            const photo = parts[7] || null;
            const review = parts[8] || null;
            
            const user = userMap[email.toLowerCase()];
            if (!user) {
                console.warn("⚠️ User not found for email: " + email);
                continue;
            }

            const formattedDate = parseFlexibleDate(timestamp);
            const status = action === 'Selesai Baca Buku' ? 'Finished' : 'Reading';
            const hrStatus = 'Draft';

            const [existing] = await pool.query(
                'SELECT id FROM reading_logs WHERE employee_id = ? AND title = ?',
                [user.employee_id, title]
            );

            if (existing.length > 0) {
                const logId = existing[0].id;
                if (status === 'Finished') {
                    await pool.query(
                        'UPDATE reading_logs SET status = ?, finish_date = ?, review = ?, return_evidence_url = ? WHERE id = ?',
                        [status, formattedDate, review, photo, logId]
                    );
                    console.log("✅ Updated Finish: " + title + " for " + user.name);
                } else {
                    await pool.query(
                        'UPDATE reading_logs SET start_date = ?, evidence_url = ? WHERE id = ?',
                        [formattedDate, photo, logId]
                    );
                    console.log("✅ Updated Start: " + title + " for " + user.name);
                }
            } else {
                const query = "INSERT INTO reading_logs (employee_id, user_name, title, category, source, status, hr_approval_status, start_date, finish_date, evidence_url, return_evidence_url, review, incentive_amount, date) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?)";
                await pool.query(query, [
                    user.employee_id, 
                    user.name, 
                    title, 
                    category, 
                    source, 
                    status, 
                    hrStatus,
                    status === 'Reading' ? formattedDate : null,
                    status === 'Finished' ? formattedDate : null,
                    status === 'Reading' ? photo : null,
                    status === 'Finished' ? photo : null,
                    review,
                    formattedDate
                ]);
                console.log("✅ Inserted New: " + title + " for " + user.name + " (" + status + ")");
            }
        }

        console.log('🎉 Import completed successfully!');
        process.exit(0);
    } catch (err) {
        console.error('❌ Import failed:', err);
        process.exit(1);
    }
}

importReadingLogs();
