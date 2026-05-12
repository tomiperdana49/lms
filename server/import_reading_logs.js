import pool from './db.js';

const data = `Timestamp	Email Address	Judul Buku	Kategori Buku	Lokasi/Penempatan	Sumber Buku	Aksi	Foto	link review
21/04/2026 20:55:27	nurul@nusa.net.id	The Psychology of Money	Buku Terlaris	Medan - Cabang	Buku Milik Pribadi	Selesai Baca Buku	https://drive.google.com/file/d/1MhSduIP3RhmtYdaqjuZh8HntGhI7Y6IS/view?usp=drivesdk	https://www.goodreads.com/review/show/8539895486
20/04/2026 15:39:57	rindayana@nusawork.com	Emotional Intelligence	Buku Pengembangan Diri	Jakarta	E-Book	Selesai Baca Buku	https://drive.google.com/file/d/1dkMe-xdyyfpqrfGwzlCSLpw514BBkqa3/view?usp=drivesdk	https://www.goodreads.com/review/show/8536600504
15/04/2026 21:43:55	ekopujianto@nusa.net.id	Designing for Emotion	Buku Pribadi	Medan - HO	Buku Milik Pribadi	Selesai Baca Buku	https://drive.google.com/file/d/1t3li0DiWqMU7ucjVHR8I3f7dhQ6Nvkos/view?usp=drivesdk	https://www.goodreads.com/review/show/8524488130
15/04/2026 16:12:53	titinpurba@nusa.net.id	The Things You Can See Only When You Slow Down	Buku Pribadi	Medan - HO	Buku Milik Pribadi	Selesai Baca Buku	https://drive.google.com/file/d/1_f5fhVCBQPtqIyxiWwUg04I_aKi53HIw/view?usp=drivesdk	https://www.goodreads.com/review/show/8523977253
15/04/2026 13:45:36	rindayana@nusawork.com	Emotional Intelligence	Buku Pengembangan Diri	Jakarta	E-Book	Memulai Baca Buku	https://drive.google.com/file/d/1QnEv1dsoxpLL3IgPmhl5pZdCj2R-T_Gc/view?usp=drivesdk	
15/04/2026 13:43:21	rindayana@nusawork.com	The Black Swan	Buku Bisnis dan Manajemen	Jakarta	E-Book	Selesai Baca Buku	https://drive.google.com/file/d/1FtQ65uOifILxZ_Edm6OlwgGH_T57enSs/view?usp=drivesdk	https://www.goodreads.com/review/show/8523831896
13/04/2026 23:58:58	titinpurba@nusa.net.id	The Things You Can See Only When You Slow Down	Buku Pribadi	Medan - HO	E-Book	Memulai Baca Buku	https://drive.google.com/file/d/1dwinMdFNb7iTjsoynbbVgwZuOJ8APgn-/view?usp=drivesdk	
06/04/2026 11:53:48	rindayana@nusawork.com	The Black Swan	Buku Bisnis dan Manajemen	Jakarta	E-Book	Memulai Baca Buku	https://drive.google.com/file/d/1F5jgTtMtYgFJlz-jeVbWE7MiZusg5zvS/view?usp=drivesdk	
02/04/2026 10:16:44	meysha@nusa.net.id	Hidup Damai Tanpa Berpikir Berlebihan	Buku Pribadi	Medan - HO	E-Book	Selesai Baca Buku	https://drive.google.com/file/d/1XB-vdEA_OkNyxBIwYt7LEfZhLfKX7ZmP/view?usp=drivesdk	https://www.goodreads.com/review/show/8487789717
31/03/2026 11:12:29	rizkaputri@nusa.net.id	The Art Stoicism	Buku Pribadi	Medan - HO	Buku Milik Pribadi	Selesai Baca Buku	https://drive.google.com/file/d/1FtRWbNdZhAaraxbeQVuYthVEn_sxRNtT/view?usp=drivesdk	https://docs.google.com/document/d/1gtQ8EeDXZXAL-hz9_wfUJfs-z6r_HKro3zPw4QIKxcg/edit?tab=t.sfg3uhjdcnte
31/03/2026 10:50:58	meysha@nusa.net.id	Hidup Damai Tanpa Berpikir Berlebihan	Buku Pribadi	Medan - HO	E-Book	Memulai Baca Buku	https://drive.google.com/file/d/1p_KvGdhuOSR4nPNewrCXfr8dz6DBo-my/view?usp=drivesdk	
20/03/2026 23:13:50	linda@nusa.net.id	The Art Stoicism	Buku Pribadi	Medan - HO	Buku Milik Pribadi	Selesai Baca Buku	https://drive.google.com/file/d/1lBHyJkeJLMaaYORJOCRZ-t1-FMcDe70o/view?usp=drivesdk	https://www.goodreads.com/review/show/8453248532
16/03/2026 12:06:52	rindayana@nusawork.com	The Steve Jobs Way	Buku Biografi dan Sejarah	Jakarta	E-Book	Selesai Baca Buku	https://drive.google.com/file/d/1VJGQ11Lq1xfS1GCs2SU2uACwO2TYwfCc/view?usp=drivesdk	https://www.goodreads.com/review/show/8441199040
14/03/2026 10:56:29	nurul@nusa.net.id	The Psychology of Money	Buku Terlaris	Medan - Cabang	Buku Milik Pribadi	Memulai Baca Buku	https://drive.google.com/file/d/1_wEBJyZVNvziA5tK9eBT92HYqfAYGM1Z/view?usp=drivesdk	
12/03/2026 11:48:31	rindayana@nusawork.com	The Steve Jobs Way	Buku Biografi dan Sejarah	Jakarta	E-Book	Memulai Baca Buku	https://drive.google.com/file/d/1PAzfeD2TOEyfui4cPeEcd4r8lGYOZRIk/view?usp=drivesdk	
12/03/2026 11:46:40	rindayana@nusawork.com	The Ciputra Way	Buku Biografi dan Sejarah	Jakarta	E-Book	Selesai Baca Buku	https://drive.google.com/file/d/1FrjnenpUSaBCakWlDaRR7Tc35EQ15P8E/view?usp=drivesdk	https://www.goodreads.com/review/show/8425765736
10/03/2026 19:59:09	rindayana@nusawork.com	The Ciputra Way	Buku Biografi dan Sejarah	Jakarta	E-Book	Memulai Baca Buku	https://drive.google.com/file/d/1JZZYFU90RmyrAn-Hp-AtZ4CEuJ6HO5_u/view?usp=drivesdk	
05/02/2026 11:25:42	ekopujianto@nusa.net.id	Designing for Emotion	Buku Pribadi	Medan - HO	E-Book	Memulai Baca Buku	https://drive.google.com/file/d/1MxGR4ISaNn99JLy-hRUMuVNSY5Mj1cAB/view?usp=drivesdk	
05/02/2026 11:22:48	rindayana@nusawork.com	The Freedom of Self-Forgetfulness: The Path to True Christian Joy	Buku Milik Pribadi	Jakarta	E-Book	Selesai Baca Buku	https://drive.google.com/file/d/1zUG-cwBwaPemNaJ7ML4NpdWtGL1bqCC_/view?usp=drivesdk	https://www.goodreads.com/review/show/8257253644
04/02/2026 14:57:17	rindayana@nusawork.com	The Freedom of Self-Forgetfulness: The Path to True Christian Joy	Buku Milik Pribadi	Jakarta	E-Book	Memulai Baca Buku	https://drive.google.com/file/d/1OrCBxT2RNW8AOOHIQGpIWCYvHzbcQV9f/view?usp=drivesdk	
04/02/2026 14:30:42	ekopujianto@nusa.net.id	Atomic Design	Buku Pribadi	Medan - HO	E-Book	Selesai Baca Buku	https://drive.google.com/file/d/1RDHPXz93ni4uc2o4yprPf4b0d4i6jPkC/view?usp=drivesdk	https://www.goodreads.com/review/show/8316195315
26/01/2026 12:31:58	rizkaputri@nusa.net.id	The Art Stoicism	Buku Pribadi	Medan - HO	Buku Milik Pribadi	Memulai Baca Buku	https://drive.google.com/file/d/16nP1EcHYk4xAK98a0Lyu9bw-Ve8eYRca/view?usp=drivesdk	
25/01/2026 23:28:57	titinpurba@nusa.net.id	Membaca Pikiran Orang Lewat Bahasa Tubuh	Buku Pribadi	Medan - HO	Buku Milik Pribadi	Selesai Baca Buku	https://drive.google.com/file/d/15AsAVI11heernVYlZZXen0QJvvz9spKY/view?usp=drivesdk	https://www.goodreads.com/review/show/8298158229
19/01/2026 12:05:46	rizkaputri@nusa.net.id	DotCom Secrets	Buku Pribadi	Medan - HO	Buku Milik Pribadi	Selesai Baca Buku	https://drive.google.com/file/d/1yIcoMUAYFjqD1U3JMPfWAeXiIW-xm888/view?usp=drivesdk	https://www.goodreads.com/review/show/8274589694?book_show_action=false
17/01/2026 17:08:19	ekopujianto@nusa.net.id	Atomic Design	Buku Pribadi	Medan - HO	E-Book	Memulai Baca Buku	https://drive.google.com/file/d/1dTJQ6ArCJRl_mRFwmjJmMGH9_8MQdqcw/view?usp=drivesdk	
17/01/2026 17:07:25	ekopujianto@nusa.net.id	Modular Design Frameworks: A Projects-based Guide for UI/UX Designers	Buku Pribadi	Medan - HO	E-Book	Selesai Baca Buku	https://drive.google.com/file/d/1mfLhWz9LHIkpcXnQpvYkzOECEnYTsCml/view?usp=drivesdk	https://www.goodreads.com/review/show/8270537369
14/01/2026 17:09:03	titinpurba@nusa.net.id	Membaca Pikiran Orang Lewat Bahasa Tubuh	Buku Pribadi	Medan - HO	Buku Milik Pribadi	Memulai Baca Buku	https://drive.google.com/file/d/1vk7MeRRIlZi2WcGu5b2UGESh1059wsfk/view?usp=drivesdk	
09/01/2026 14:40:35	ekopujianto@nusa.net.id	Modular Design Frameworks: A Projects-based Guide for UI/UX Designers	Buku Pribadi	Medan - HO	E-Book	Memulai Baca Buku	https://drive.google.com/file/d/16wqrCgMrgxSMBDO7GilAWDjAkCondaNY/view?usp=drivesdk	
28/12/2025 22:32:16	linda@nusa.net.id	The Art Stoicism	Buku Pribadi	Medan - HO	Buku Milik Pribadi	Memulai Baca Buku	https://drive.google.com/file/d/1Drk34Q_GQrhm4oc9-a8LbDnB0F9Wxwaq/view?usp=drivesdk	
17/11/2025 09:49:46	rizkaputri@nusa.net.id	DotCom Secrets		Medan - HO	Buku dari Kantor	Memulai Baca Buku	https://drive.google.com/file/d/1TISWA0JrdzpBLGGohugA3QKskFYOmE0v/view?usp=drivesdk	
`;

async function importLogs() {
    try {
        const [users] = await pool.query('SELECT employee_id, email, name FROM users');
        const userMap = users.reduce((acc, user) => {
            acc[user.email.toLowerCase()] = user;
            return acc;
        }, {});

        const lines = data.trim().split('\n').slice(1);
        const logsMap = {};

        for (const line of lines) {
            const [timestamp, email, title, category, location, source, action, photo, review] = line.split('\t');
            const key = `${email.toLowerCase()}-${title.toLowerCase()}`;
            
            if (!logsMap[key]) {
                logsMap[key] = {
                    title,
                    category,
                    email: email.toLowerCase(),
                    location,
                    source,
                    evidence_url: photo,
                    review: review || null,
                    start_date: null,
                    finish_date: null,
                    status: 'Reading'
                };
            }

            // Parse DD/MM/YYYY HH:mm:ss
            const [datePart, timePart] = timestamp.split(' ');
            const [day, month, year] = datePart.split('/');
            const formattedDate = `${year}-${month}-${day} ${timePart}`;

            if (action.includes('Selesai')) {
                logsMap[key].finish_date = formattedDate;
                logsMap[key].status = 'Finished';
                logsMap[key].evidence_url = photo; // Favor finish photo
                if (review) logsMap[key].review = review;
            } else if (action.includes('Memulai')) {
                logsMap[key].start_date = formattedDate;
                logsMap[key].evidence_url = logsMap[key].evidence_url || photo;
            }
        }

        for (const key in logsMap) {
            const log = logsMap[key];
            const user = userMap[log.email];
            
            if (!user) {
                console.warn(`User not found for email: ${log.email}`);
                continue;
            }

            const insertData = {
                title: log.title,
                category: log.category,
                date: log.finish_date || log.start_date,
                status: log.status,
                user_name: user.name,
                employee_id: user.employee_id,
                start_date: log.start_date,
                finish_date: log.finish_date,
                evidence_url: log.evidence_url,
                review: log.review,
                link: log.review,
                location: log.location,
                source: log.source,
                hr_approval_status: 'Draft',
                incentive_amount: 0
            };

            await pool.query(
                `INSERT INTO reading_logs (
                    title, category, date, status, user_name, employee_id, 
                    start_date, finish_date, evidence_url, review, link, 
                    location, source, hr_approval_status, incentive_amount
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                    insertData.title, insertData.category, insertData.date, insertData.status, 
                    insertData.user_name, insertData.employee_id, insertData.start_date, 
                    insertData.finish_date, insertData.evidence_url, insertData.review, 
                    insertData.link, insertData.location, insertData.source, 
                    insertData.hr_approval_status, insertData.incentive_amount
                ]
            );
            console.log(`✅ Imported: ${log.title} for ${user.name}`);
        }

        console.log("🎉 All reading logs imported successfully.");
        process.exit(0);
    } catch (err) {
        console.error("❌ Import failed:", err);
        process.exit(1);
    }
}

importLogs();
