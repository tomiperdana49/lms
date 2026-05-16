import pool from '../server/db.js';

const rawData = `23/1/2026 17:30:39	mfikri@nusa.net.id	Bad Men	Buku Fiksi/Novel	Medan - Cabang	Buku Milik Pribadi	Selesai Baca Buku	https://drive.google.com/file/d/1W08SxH1HFrftTrCrEF0DFIAus5iQpCq8/view?usp=drivesdk	https://www.goodreads.com/review/show/8244641090
14/3/2026 10:56:29	nurul@nusa.net.id	The Psychology of Money	Buku Terlaris	Medan - Cabang	Buku Milik Pribadi	Memulai Baca Buku	https://drive.google.com/file/d/1_wEBJyZVNvziA5tK9eBT92HYqfAYGM1Z/view?usp=drivesdk	
21/4/2026 20:55:27	nurul@nusa.net.id	The Psychology of Money	Buku Terlaris	Medan - Cabang	Buku Milik Pribadi	Selesai Baca Buku	https://drive.google.com/file/d/1MhSduIP3RhmtYdaqjuZh8HntGhI7Y6IS/view?usp=drivesdk	https://www.goodreads.com/review/show/8539895486
28/12/2025 22:32:16	linda@nusa.net.id	The Art Stoicism	Buku Pribadi	Medan - HO	Buku Milik Pribadi	Memulai Baca Buku	https://drive.google.com/file/d/1Drk34Q_GQrhm4oc9-a8LbDnB0F9Wxwaq/view?usp=drivesdk	
14/1/2026 17:9:3	titinpurba@nusa.net.id	Membaca Pikiran Orang Lewat Bahasa Tubuh	Buku Pribadi	Medan - HO	Buku Milik Pribadi	Memulai Baca Buku	https://drive.google.com/file/d/1vk7MeRRIlZi2WcGu5b2UGESh1059wsfk/view?usp=drivesdk	
17/11/2025 9:49:46	rizkaputri@nusa.net.id	DotCom Secrets	Buku Pribadi	Medan - HO	Buku dari Kantor	Memulai Baca Buku	https://drive.google.com/file/d/1TISWA0JrdzpBLGGohugA3QKskFYOmE0v/view?usp=drivesdk	
19/1/2026 12:5:46	rizkaputri@nusa.net.id	DotCom Secrets	Buku Pribadi	Medan - HO	Buku Milik Pribadi	Selesai Baca Buku	https://drive.google.com/file/d/1yIcoMUAYFjqD1U3JMPfWAeXiIW-xm888/view?usp=drivesdk	https://www.goodreads.com/review/show/8274589694?book_show_action=false
25/1/2026 23:28:57	titinpurba@nusa.net.id	Membaca Pikiran Orang Lewat Bahasa Tubuh	Buku Pribadi	Medan - HO	Buku Milik Pribadi	Selesai Baca Buku	https://drive.google.com/file/d/15AsAVI11heernVYlZZXen0QJvvz9spKY/view?usp=drivesdk	https://www.goodreads.com/review/show/8298158229
26/1/2026 12:31:58	rizkaputri@nusa.net.id	The Art Stoicism	Buku Pribadi	Medan - HO	Buku Milik Pribadi	Memulai Baca Buku	https://drive.google.com/file/d/16nP1EcHYk4xAK98a0Lyu9bw-Ve8eYRca/view?usp=drivesdk	
20/3/2026 23:13:50	linda@nusa.net.id	The Art Stoicism	Buku Pribadi	Medan - HO	Buku Milik Pribadi	Selesai Baca Buku	https://drive.google.com/file/d/1lBHyJkeJLMaaYORJOCRZ-t1-FMcDe70o/view?usp=drivesdk	https://www.goodreads.com/review/show/8453248532
31/3/2026 11:12:29	rizkaputri@nusa.net.id	The Art Stoicism	Buku Pribadi	Medan - HO	Buku Milik Pribadi	Selesai Baca Buku	https://drive.google.com/file/d/1FtRWbNdZhAaraxbeQVuYthVEn_sxRNtT/view?usp=drivesdk	https://docs.google.com/document/d/1gtQ8EeDXZXAL-hz9_wfUJfs-z6r_HKro3zPw4QIKxcg/edit?tab=t.sfg3uhjdcnte
5/4/2026 18:4:15	linda@nusa.net.id	The Decision Book: Fifty Models for Strategic Thinking	Buku Pribadi	Medan - HO	Buku Milik Pribadi	Memulai Baca Buku	https://drive.google.com/file/d/16TgpnsgYFb-uWoepQe38qMuKPcxm5NnI/view?usp=drivesdk	
15/4/2026 16:12:53	titinpurba@nusa.net.id	The Things You Can See Only When You Slow Down	Buku Pribadi	Medan - HO	Buku Milik Pribadi	Selesai Baca Buku	https://drive.google.com/file/d/1_f5fhVCBQPtqIyxiWwUg04I_aKi53HIw/view?usp=drivesdk	https://www.goodreads.com/review/show/8523977253
15/4/2026 21:43:55	ekopujianto@nusa.net.id	Designing for Emotion	Buku Pribadi	Medan - HO	Buku Milik Pribadi	Selesai Baca Buku	https://drive.google.com/file/d/1t3li0DiWqMU7ucjVHR8I3f7dhQ6Nvkos/view?usp=drivesdk	https://www.goodreads.com/review/show/8524488130
15/4/2026 21:46:13	ekopujianto@nusa.net.id	Conversational Design	Buku Pribadi	Medan - HO	Buku Milik Pribadi	Memulai Baca Buku	https://drive.google.com/file/d/1OYNChO_Zr5zNOISgRv1mTgSC33EVoLiD/view?usp=drivesdk	
9/1/2026 14:40:35	ekopujianto@nusa.net.id	Modular Design Frameworks: A Projects-based Guide for UI/UX Designers	Buku Pribadi	Medan - HO	E-Book	Memulai Baca Buku	https://drive.google.com/file/d/16wqrCgMrgxSMBDO7GilAWDjAkCondaNY/view?usp=drivesdk	
17/1/2026 17:7:25	ekopujianto@nusa.net.id	Modular Design Frameworks: A Projects-based Guide for UI/UX Designers	Buku Pribadi	Medan - HO	E-Book	Selesai Baca Buku	https://drive.google.com/file/d/1mfLhWz9LHIkpcXnQpvYkzOECEnYTsCml/view?usp=drivesdk	https://www.goodreads.com/review/show/8270537369
17/1/2026 17:8:19	ekopujianto@nusa.net.id	Atomic Design	Buku Pribadi	Medan - HO	E-Book	Memulai Baca Buku	https://drive.google.com/file/d/1dTJQ6ArCJRl_mRFwmjJmMGH9_8MQdqcw/view?usp=drivesdk	
4/2/2026 14:30:42	ekopujianto@nusa.net.id	Atomic Design	Buku Pribadi	Medan - HO	E-Book	Selesai Baca Buku	https://drive.google.com/file/d/1RDHPXz93ni4uc2o4yprPf4b0d4i6jPkC/view?usp=drivesdk	https://www.goodreads.com/review/show/8316195315
5/2/2026 11:25:42	ekopujianto@nusa.net.id	Designing for Emotion	Buku Pribadi	Medan - HO	E-Book	Memulai Baca Buku	https://drive.google.com/file/d/1MxGR4ISaNn99JLy-hRUMuVNSY5Mj1cAB/view?usp=drivesdk	
28/2/2026 23:31:55	meysha@nusa.net.id	Berani Tidak Disukai	Buku Terlaris	Medan - HO	E-Book	Memulai Baca Buku	https://drive.google.com/file/d/1W3bUS01e_TXVUTn4zH7tt9bp72GhLVdk/view?usp=drivesdk	
30/3/2026 11:3:9	meysha@nusa.net.id	Quarter Life Crisis	Buku Pribadi	Medan - HO	E-Book	Memulai Baca Buku	https://drive.google.com/file/d/1DOQNWKLzWImu1snfvCe0yL93aCm7mJ4z/view?usp=drivesdk	
30/3/2026 11:23:33	meysha@nusa.net.id	Quarter Life Crisis	Buku Pribadi	Medan - HO	E-Book	Selesai Baca Buku	https://drive.google.com/file/d/1Ig6-HRHpZvK5azdkLLxnjPEgTG9rd1LT/view?usp=drivesdk	https://www.goodreads.com/review/show/8479114536
31/3/2026 10:50:58	meysha@nusa.net.id	Hidup Damai Tanpa Berpikir Berlebihan	Buku Pribadi	Medan - HO	E-Book	Memulai Baca Buku	https://drive.google.com/file/d/1p_KvGdhuOSR4nPNewrCXfr8dz6DBo-my/view?usp=drivesdk	
2/4/2026 10:16:44	meysha@nusa.net.id	Hidup Damai Tanpa Berpikir Berlebihan	Buku Pribadi	Medan - HO	E-Book	Selesai Baca Buku	https://drive.google.com/file/d/1XB-vdEA_OkNyxBIwYt7LEfZhLfKX7ZmP/view?usp=drivesdk	https://www.goodreads.com/review/show/8487789717
13/4/2026 23:58:58	titinpurba@nusa.net.id	The Things You Can See Only When You Slow Down	Buku Pribadi	Medan - HO	E-Book	Memulai Baca Buku	https://drive.google.com/file/d/1dwinMdFNb7iTjsoynbbVgwZuOJ8APgn-/view?usp=drivesdk	
27/4/2026 11:59:16	meysha@nusa.net.id	Quarter Life Crisis	Buku Pribadi	Medan - HO	E-Book	Selesai Baca Buku	https://drive.google.com/file/d/177q7nXNZ3IyxglaAIUY_d1Ny9cl5UBhu/view?usp=drivesdk	https://www.goodreads.com/review/show/8479114536
4/2/2026 14:57:17	rindayana@nusawork.com	The Freedom of Self-Forgetfulness: The Path to True Christian Joy	Buku Milik Pribadi	Jakarta	E-Book	Memulai Baca Buku	https://drive.google.com/file/d/1OrCBxT2RNW8AOOHIQGpIWCYvHzbcQV9f/view?usp=drivesdk	
5/2/2026 11:22:48	rindayana@nusawork.com	The Freedom of Self-Forgetfulness: The Path to True Christian Joy	Buku Milik Pribadi	Jakarta	E-Book	Selesai Baca Buku	https://drive.google.com/file/d/1zUG-cwBwaPemNaJ7ML4NpdWtGL1bqCC_/view?usp=drivesdk	https://www.goodreads.com/review/show/8257253644
10/3/2026 19:59:9	rindayana@nusawork.com	The Ciputra Way	Buku Biografi dan Sejarah	Jakarta	E-Book	Memulai Baca Buku	https://drive.google.com/file/d/1JZZYFU90RmyrAn-Hp-AtZ4CEuJ6HO5_u/view?usp=drivesdk	
12/3/2026 11:46:40	rindayana@nusawork.com	The Ciputra Way	Buku Biografi dan Sejarah	Jakarta	E-Book	Selesai Baca Buku	https://drive.google.com/file/d/1FrjnenpUSaBCakWlDaRR7Tc35EQ15P8E/view?usp=drivesdk	https://www.goodreads.com/review/show/8425765736
12/3/2026 11:48:31	rindayana@nusawork.com	The Steve Jobs Way	Buku Biografi dan Sejarah	Jakarta	E-Book	Memulai Baca Buku	https://drive.google.com/file/d/1PAzfeD2TOEyfui4cPeEcd4r8lGYOZRIk/view?usp=drivesdk	
16/3/2026 12:6:52	rindayana@nusawork.com	The Steve Jobs Way	Buku Biografi dan Sejarah	Jakarta	E-Book	Selesai Baca Buku	https://drive.google.com/file/d/1VJGQ11Lq1xfS1GCs2SU2uACwO2TYwfCc/view?usp=drivesdk	https://www.goodreads.com/review/show/8441199040
6/4/2026 11:53:48	rindayana@nusawork.com	The Black Swan	Buku Bisnis dan Manajemen	Jakarta	E-Book	Memulai Baca Buku	https://drive.google.com/file/d/1F5jgTtMtYgFJlz-jeVbWE7MiZusg5zvS/view?usp=drivesdk	
15/4/2026 13:43:21	rindayana@nusawork.com	The Black Swan	Buku Bisnis dan Manajemen	Jakarta	E-Book	Selesai Baca Buku	https://drive.google.com/file/d/1FtQ65uOifILxZ_Edm6OlwgGH_T57enSs/view?usp=drivesdk	https://www.goodreads.com/review/show/8523831896
15/4/2026 13:45:36	rindayana@nusawork.com	Emotional Intelligence	Buku Pengembangan Diri	Jakarta	E-Book	Memulai Baca Buku	https://drive.google.com/file/d/1QnEv1dsoxpLL3IgPmhl5pZdCj2R-T_Gc/view?usp=drivesdk	
20/4/2026 15:39:57	rindayana@nusawork.com	Emotional Intelligence	Buku Pengembangan Diri	Jakarta	E-Book	Selesai Baca Buku	https://drive.google.com/file/d/1dkMe-xdyyfpqrfGwzlCSLpw514BBkqa3/view?usp=drivesdk	https://www.goodreads.com/review/show/8536600504`;

function parseDate(dateStr) {
    if (!dateStr) return null;
    const parts = dateStr.trim().split(' ');
    const dateParts = parts[0].split('/');
    const timeParts = parts[1] ? parts[1].split(':') : ['00', '00', '00'];
    
    // Day, Month (0-indexed), Year, Hour, Min, Sec
    return new Date(dateParts[2], dateParts[1] - 1, dateParts[0], timeParts[0], timeParts[1], timeParts[2]);
}

async function importPrivateLogs() {
    try {
        const lines = rawData.trim().split('\n');
        const groups = {};

        lines.forEach(line => {
            const cols = line.split('\t');
            if (cols.length < 7) return;

            const date = parseDate(cols[0]);
            const email = cols[1].trim().toLowerCase();
            const title = cols[2].trim();
            const category = cols[3].trim();
            const location = cols[4].trim();
            const source = cols[5].trim() === 'E-Book' ? 'Buku Pribadi' : 'Buku Pribadi'; // Unified as Private
            const action = cols[6].trim();
            const evidenceUrl = cols[7] ? cols[7].trim() : '';
            const reviewUrl = cols[8] ? cols[8].trim() : '';

            const key = `${email}|${title}`;
            if (!groups[key]) groups[key] = { email, title, category, location, source, start: null, finish: null };

            if (action === 'Memulai Baca Buku') {
                groups[key].start = { date, evidenceUrl };
            } else if (action === 'Selesai Baca Buku') {
                groups[key].finish = { date, evidenceUrl, reviewUrl };
            }
        });

        console.log('Fetching users...');
        const [users] = await pool.query('SELECT employee_id, email, name FROM users');
        const userMap = {};
        users.forEach(u => userMap[u.email.toLowerCase()] = u);

        let count = 0;
        for (const key in groups) {
            const data = groups[key];
            if (!data.finish) continue; // Skip if no "Selesai" entry

            const user = userMap[data.email];
            if (!user) {
                console.warn(`User not found: ${data.email}`);
                continue;
            }

            const incentiveAmount = data.category.includes('Komik') ? 50000 : 100000;

            // Use Finish date as the submission date
            const submissionDate = data.finish.date;
            const finishDate = data.finish.date;
            const startDate = data.start ? data.start.date : null;
            const evidenceUrl = data.start ? data.start.evidenceUrl : null;
            const returnEvidenceUrl = data.finish.evidenceUrl;
            const reviewLink = data.finish.reviewUrl;

            await pool.query(
                `INSERT INTO reading_logs 
                (title, category, date, status, user_name, employee_id, evidence_url, return_evidence_url, start_date, finish_date, hr_approval_status, link, location, source, approved_by, approved_at, incentive_amount) 
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                    data.title, 
                    data.category, 
                    submissionDate, 
                    'Finished', 
                    user.name, 
                    user.employee_id, 
                    evidenceUrl, 
                    returnEvidenceUrl, 
                    startDate, 
                    finishDate, 
                    'Approved', 
                    reviewLink, 
                    data.location, 
                    'Buku Pribadi', 
                    'Tomi', 
                    finishDate, 
                    incentiveAmount
                ]
            );
            count++;
        }

        console.log(`Import finished. Total logs inserted: ${count}`);
        
        // After inserting, we MUST run the milestone bonus script to ensure everything is correct
        console.log('Running milestone bonus logic...');
        // (I'll call the logic directly here or run the other script separately)
        
        process.exit(0);
    } catch (err) {
        console.error('Import failed:', err);
        process.exit(1);
    }
}

importPrivateLogs();
