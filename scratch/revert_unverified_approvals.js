import pool from '../server/db.js';

// Combined lists from user (Message 7, 11, 15)
const list1 = `21/01/2026 16:11:29	adhitya@nusa.net.id	How To Win Friends & Influence People	100.000
21/02/2026 9:44:04	adhitya@nusa.net.id	Who Moved My Cheese?	100.000
12/03/2026 17:10:05	adhitya@nusa.net.id	Atomic Habits	100.000
18/03/2026 17:17:34	adhitya@nusa.net.id	Sebuah Seni untuk Bersikap Bodo Amat	100.000
25/03/2026 18:00:20	adhitya@nusa.net.id	Attitude Is Everything	100.000
...`; // (I will include all items from previous messages in the actual execution)

async function revertToUserLists() {
    try {
        console.log('Fetching all Approved logs...');
        const [approvedLogs] = await pool.query(
            'SELECT rl.id, rl.title, u.email FROM reading_logs rl JOIN users u ON rl.employee_id = u.employee_id WHERE rl.hr_approval_status = "Approved"'
        );

        // I'll manually build the set of verified (Email, Title) pairs from the conversation history
        const verifiedPairs = new Set();
        
        // Data from Message 15 (Adhitya etc)
        const msg15 = `adhitya@nusa.net.id|How To Win Friends & Influence People
adhitya@nusa.net.id|Who Moved My Cheese?
adhitya@nusa.net.id|Atomic Habits
adhitya@nusa.net.id|Sebuah Seni untuk Bersikap Bodo Amat
adhitya@nusa.net.id|Attitude Is Everything
adindawahyuningsih@nusa.net.id|Zero to One
alfan@nusa.net.id|Buying Trances
alfi@nusa.net.id|Spin Selling
alfiany@nusa.net.id|Mengapa Doa Saya Selalu Dikabulkan
alfiany@nusa.net.id|Sayangi Dirimu, Berhentilah Menyenangkan Semua Orang
alwis@nusa.net.id|Setiap Manajer Harus Baca Buku Ini!
alwis@nusa.net.id|Sebuah Seni untuk Bersikap Bodo Amat
ambar@nusa.net.id|The Principles of Power
ambar@nusa.net.id|Hooked
amelfi@nusa.net.id|Untung Besar 80 jt-an
amelfi@nusa.net.id|Mencari Bening Mata Air
amelfi@nusa.net.id|Jurus Sehat Rasulullah
amelfi@nusa.net.id|Membongkar Trik Rahasia Para Master PHP
amelfi@nusa.net.id|Kerjaku, Ibadahku
andreas@nusa.net.id|How To Win Friends & Influence People
angelinlaka@nusa.net.id|The Secret: Rahasia
angga@nusa.net.id|Control Your Expectation
angga@nusa.net.id|The Great Ideas
anggisaputra@nusa.net.id|Makanya, Mikir!
anggisaputra@nusa.net.id|Sebuah Seni untuk Bersikap Bodo Amat
anggisaputra@nusa.net.id|Ikigai
anggisaputra@nusa.net.id|8 Kekuatan Keunggulan Diri
anjelisa@nusa.net.id|Keluarga Super Irit
anjelisa@nusa.net.id|Great Customer Service
anjelisa@nusa.net.id|77++ Tanya Jawab Cara Bodoh Berjualan
anjelisa@nusa.net.id|Atomic Habits
anjelisa@nusa.net.id|Who Moved My Cheese?
antonnikola@nusa.net.id|Getting to Yes
aqif@nusa.net.id|Who Moved My Cheese?
aqif@nusa.net.id|77 Cara Bodoh Hidup Bahagia
aqif@nusa.net.id|Learning 5.1
aqif@nusa.net.id|Be Your Own Boss Now
aqif@nusa.net.id|Makanya, Mikir!
ardha@nusa.net.id|Jurus Anti-Gagal Dalam Menjual
ardha@nusa.net.id|77 Cara Bodoh Hidup Bahagia
aryawicaksana@nusa.net.id|Sebuah Seni untuk Bersikap Bodo Amat
aryawicaksana@nusa.net.id|77 Cara Bodoh Hidup Bahagia
aryawicaksana@nusa.net.id|Awareness Of Ramadhan
aryawicaksana@nusa.net.id|Think and Grow Rich
azmi@nusa.net.id|Atomic Habits
azmi@nusa.net.id|Think and Grow Rich
azmi@nusa.net.id|Be Your Own Boss Now
bagas@nusa.net.id|The Empathy Effect
bagas@nusa.net.id|Setiap Manajer Harus Baca Buku Ini!
bagus@nusa.net.id|Happiness Through Budha Damma
bagus@nusa.net.id|Who Moved My Cheese?
cesar@nusa.net.id|10 Jurus Terlarang
cesar@nusa.net.id|Naked Sales
cinthya@nusa.net.id|Merawat Luka Batin
cinthya@nusa.net.id|Quiet
cinthya@nusa.net.id|Noise: A Flaw in Human Judgment
dheyslow@nusa.net.id|Hypnotic Writing
dheyslow@nusa.net.id|Kejar Target
dheyslow@nusa.net.id|The Effective Executive
dheyslow@nusa.net.id|Makanya, Mikir!
dian@nusa.net.id|Zero to One
dian@nusa.net.id|Cantik, Cerdas, dan Feminin
dian@nusa.net.id|Berani Tidak Disukai
dian@nusa.net.id|The Way to Happiness
dodisyahdianto@nusa.net.id|Start With Why
dodisyahdianto@nusa.net.id|Attitude Is Everything
dodisyahdianto@nusa.net.id|Be Your Own Boss Now
dodisyahdianto@nusa.net.id|The Subtle Art Of Not Giving A Fuck
dodisyahdianto@nusa.net.id|Tipping Point
efen@nusa.net.id|Oh My Goodness
ekopujianto@nusa.net.id|Modular Design Frameworks: A Projects-based Guide for UI/UX Designers
ekopujianto@nusa.net.id|Atomic Design
ekopujianto@nusa.net.id|Designing for Emotion
evelyn@nusa.net.id|The Principles of Power
evelyn@nusa.net.id|Managing People Is Like Herding Cats
famujji@nusa.net.id|Sebuah Seni untuk Bersikap Bodo Amat
fandi@nusa.net.id|Sebuah Seni untuk Bersikap Bodo Amat
fandi@nusa.net.id|Purple Cow
fatiah@nusa.net.id|Sebuah Seni untuk Bersikap Bodo Amat
fatiah@nusa.net.id|Atomic Habits
fayad@nusa.net.id|The Power Of Habit (IDN)
freddy@nusa.net.id|Membuka Pintu Hati
gebby@nusa.net.id|Sebuah Seni untuk Bersikap Bodo Amat
gebby@nusa.net.id|Atomic Habits
gebby@nusa.net.id|Berani Tidak Disukai
gompis@nusa.net.id|How To Win Friends & Influence People
gompis@nusa.net.id|Improvisasi Jazz
harianto@nusa.net.id|Laku dan Tutur Islami
harianto@nusa.net.id|77++ Tanya Jawab Cara Bodoh Berjualan
harianto@nusa.net.id|50 Kesalahan Sales dan Solusinya
harianto@nusa.net.id|Untung Besar 80 jt-an
harianto@nusa.net.id|8 Kekuatan Keunggulan Diri
haya@nusa.net.id|Who Moved My Cheese?
haya@nusa.net.id|The Principles of Power
haya@nusa.net.id|Tak Apa-apa Tak Sempurna
hendro@nusa.net.id|Openstack
hendy@nusa.net.id|Bahagia Bersama
hendy@nusa.net.id|Berani Tidak Disukai
imamzhulkarnaen@nusa.net.id|Quiet
imamzhulkarnaen@nusa.net.id|Work Rules!
imamzhulkarnaen@nusa.net.id|Winners Dream
imamzhulkarnaen@nusa.net.id|The Power Of Habit (ENG)
imamzhulkarnaen@nusa.net.id|TED Talks
immanuel@nusa.net.id|From Zero to Survive
iqrom@nusa.net.id|Atomic Habits
iqrom@nusa.net.id|The Subtle Art Of Not Giving A Fuck
iqrom@nusa.net.id|Kado Cinta
iqrom@nusa.net.id|Yes! I Can Serve
iqrom@nusa.net.id|10 Jurus Terlarang
jefri@nusa.id|Makanya, Mikir!
jefri@nusa.id|Prinsipil Ekonomi
jimmyfebrian@nusa.net.id|From Zero to Survive
josuapinem@nusa.net.id|The Power Of Habit (IDN)
josuapinem@nusa.net.id|Tipping Point
josuapinem@nusa.net.id|Learning 5.1
josuapinem@nusa.net.id|Hooked
josuapurba@nusa.net.id|Memetik Matahari
josuapurba@nusa.net.id|Sales Breakthrough
kajel@nusa.net.id|Zero to One
kajel@nusa.net.id|From Zero to Survive
komangbayu@nusa.net.id|Tak Apa-apa Tak Sempurna
linda@nusa.net.id|The Art Stoicism
lutfi@nusa.net.id|Berani Tidak Disukai
lutfi@nusa.net.id|Simplify Your Work Life
lutfi@nusa.net.id|Sayangi Dirimu, Berhentilah Menyenangkan Semua Orang
lutfi@nusa.net.id|From Zero to Survive
madja@nusa.net.id|Atomic Habits
maleakhi@nusa.net.id|Merry Riana: Langkah Sejuta Suluh
maleakhi@nusa.net.id|50 Kesalahan Sales dan Solusinya
maleakhi@nusa.net.id|Tipping Point
maleakhi@nusa.net.id|The Empathy Effect
marudut@nusa.net.id|Naked Sales
marudut@nusa.net.id|The 7 Habits of Highly Effective People (IDN)
meysha@nusa.net.id|77 Cara Bodoh Hidup Bahagia
meysha@nusa.net.id|Hidup Damai Tanpa Berpikir Berlebihan
meysha@nusa.net.id|Makanya, Mikir!
meysha@nusa.net.id|Quarter Life Crisis
mfikri@nusa.net.id|Getting to Yes
mfikri@nusa.net.id|Ikigai
mfikri@nusa.net.id|Quiet
mfikri@nusa.net.id|Zero to One
mfikri@nusa.net.id|Who Moved My Cheese?
najla@nusa.id|Getting to Yes
natanael@nusa.net.id|Purple Cow
natanael@nusa.net.id|Learning 5.1
natanael@nusa.net.id|Apa Apa Saja yang Harus di Lakukan Manajer & Supervisor
nethasya@nusa.net.id|Getting to Yes
nethasya@nusa.net.id|Control Your Expectation
nethasya@nusa.net.id|The Way to Happiness
nethasya@nusa.net.id|Great Customer Service
niluhyani@nusa.net.id|Terima Kasih Sudah Mengatakannya
niluhyani@nusa.net.id|The Secret: Rahasia
niluhyani@nusa.net.id|From Zero to Survive
niluhyani@nusa.net.id|Makanya, Mikir!
nurul@nusa.net.id|The Psychology of Money
nurul@nusa.net.id|Who Moved My Cheese?
peby@nusa.net.id|The Way to Happiness
peby@nusa.net.id|Atomic Habits
peby@nusa.net.id|Who Moved My Cheese?
pedro@nusa.net.id|8 Kekuatan Keunggulan Diri
pedro@nusa.net.id|The Ciputra Way
pedro@nusa.net.id|TED Talks
pedro@nusa.net.id|Ikigai
prima@nusa.net.id|Homo Deus
prima@nusa.net.id|Mengapa Doa Saya Selalu Dikabulkan
prima@nusa.net.id|Project X Cup Noodle
prima@nusa.net.id|Atomic Habits
putri@nusa.id|Manifest: 7 Langkah Menuju Hidup yang Indah
putri@nusa.id|The Empathy Effect
putri@nusa.id|Berpikir Kritis
putrisitumorang@nusa.net.id|Tak Apa-Apa Tak Sempurna
putrisitumorang@nusa.net.id|Ikigai
putrisitumorang@nusa.net.id|8 Kekuatan Keunggulan Diri
putrisitumorang@nusa.net.id|Setiap Manajer Harus Baca Buku Ini!
rafliansyah@nusa.net.id|8 Kekuatan Keunggulan Diri
rafliansyah@nusa.net.id|Ikigai
rafliansyah@nusa.net.id|77 Cara Bodoh Hidup Bahagia
rafliansyah@nusa.net.id|Spin Selling
rafliansyah@nusa.net.id|The Subtle Art Of Not Giving A Fuck
rahayuningsih@nusa.net.id|From Zero to Survive
rahayuningsih@nusa.net.id|Same as Ever
rama@nusawork.com|Who Moved My Cheese?
rifqi@nusa.net.id|Getting to Yes
rifqi@nusa.net.id|Thinking, Fast and Slow
rifqi@nusa.net.id|Profit Is King
rifqi@nusa.net.id|How To Win Friends & Influence People
rifqi@nusa.net.id|Hypnotic Writing
rinasukmawati@nusa.net.id|Makanya, Mikir!
rinasukmawati@nusa.net.id|The Secret: Rahasia
rinasukmawati@nusa.net.id|Who Moved My Cheese?
rindayana@nusawork.com|The Communication Book
rindayana@nusawork.com|Atomic Habits
rindayana@nusawork.com|The Freedom of Self-Forgetfulness: The Path to True Christian Joy
rindayana@nusawork.com|Getting to Yes
rindayana@nusawork.com|The Ciputra Way
riskisimanjuntak@nusa.net.id|Key Performance Indicators
riskisimanjuntak@nusa.net.id|How To Win Friends & Influence People In The Digital Age
rizkaputri@nusa.net.id|DotCom Secrets
rizkaputri@nusa.net.id|7 Kebiasaan Manusia yang Sangat Efektif
rizkaputri@nusa.net.id|The Art Stoicism
rizkyabdillah@nusa.net.id|Who Moved My Cheese?
romi@nusa.net.id|Great Customer Service
romi@nusa.net.id|Makanya, Mikir!
romi@nusa.net.id|Blink: Kemampuan berfikir tanpa berfikir
romi@nusa.net.id|The Life-Changing Manga of Tidying Up
rosaliana@nusa.net.id|Terima Kasih Sudah Mengatakannya
rosaliana@nusa.net.id|The Principles of Power
rosaliana@nusa.net.id|Habit is Power
ryanalfarisi@nusa.net.id|Think and Grow Rich
ryanfajar@nusa.net.id|Manifest: 7 Langkah Menuju Hidup Yang Indah
sabrino@nusa.net.id|Membongkar Trik Rahasia Para Master PHP
sabrino@nusa.net.id|Atomic Habits
salsabila@nusawork.com|Getting to Yes
salsabila@nusawork.com|Same as Ever
samudera@nusa.net.id|Control Your Expectation
samudera@nusa.net.id|50 Kesalahan Sales dan Solusinya
samuelmanik@nusa.net.id|Berani Tidak Disukai
siddiq@nusa.net.id|Simplify Your Work Life
siddiq@nusa.net.id|Great Customer Service
siddiq@nusa.net.id|Sampaikanlah Walau Satu Konten
siddiq@nusa.net.id|Zero to One
siddiq@nusa.net.id|77 Cara Bodoh Hidup Bahagia
sirjon@nusa.net.id|Manifest: 7 Langkah Menuju Hidup yang Indah
sirjon@nusa.net.id|Start With Why
sirjon@nusa.net.id|How To Win Friends & Influence People
sirjon@nusa.net.id|Awareness Of Ramadhan
sirjon@nusa.net.id|Great Customer Service
steven@nusa.net.id|Improvisasi Jazz
steven@nusa.net.id|Tragedi IPDN
steven@nusa.net.id|8 Kekuatan Keunggulan Diri
steven@nusa.net.id|Quidditch Through The Ages
steven@nusa.net.id|Atomic Habits
sudirman@nusa.net.id|Sales Breakthrough
sudirman@nusa.net.id|Mencari Bening Mata Air
sudirman@nusa.net.id|How To Win Friends & Influence People
sudirman@nusa.net.id|The Power Of Habit (IDN)
syarfina@nusa.net.id|Makanya, Mikir!
syawal@nusa.net.id|Homo Deus
syawal@nusa.net.id|21 Lessons for the 21st Century
syawal@nusa.net.id|Self Driving
tantowi@nusa.net.id|7 Kebiasaan Manusia yang Sangat Efektif
tantowi@nusa.net.id|Makanya, Mikir!
teguhakbar@nusa.net.id|Butir-Butir Mutiara Kesuksesan
teguhakbar@nusa.net.id|Zero to One
teguhakbar@nusa.net.id|Memetik Matahari
teguhakbar@nusa.net.id|Solution Selling
teguhakbar@nusa.net.id|Ikigai
titinpurba@nusa.net.id|Membaca Pikiran Orang Lewat Bahasa Tubuh
titinpurba@nusa.net.id|Hooked
titinpurba@nusa.net.id|Makanya, Mikir!
titinpurba@nusa.net.id|Who Moved My Cheese?
titinpurba@nusa.net.id|The Things You Can See Only When You Slow Down
tomi@nusa.net.id|Kekuatan Kata Tidak
topher@nusa.net.id|Be Brilliant and Productive
topher@nusa.net.id|Hooked
ummi@nusa.net.id|Makanya, Mikir!
utami@nusawork.com|Atomic Habits
utami@nusawork.com|Getting to Yes
utami@nusawork.com|Stay Positive with Marcus Aurelius
williamtobing@nusa.net.id|Introduction to Cryptography
williamtobing@nusa.net.id|Bikin PC Aman dari Serangan Virus, Spam, dan Spyware
williamtobing@nusa.net.id|Who Moved My Cheese?
windy@nusa.net.id|Merry Riana: Langkah Sejuta Suluh
wiraagus@nusa.net.id|Kekuatan Kata Tidak
yunanda@nusa.net.id|Ikigai
yunanda@nusa.net.id|Profit Is King
yunanda@nusa.net.id|Kekuatan Kata Tidak
yunanda@nusa.net.id|Sebuah Seni untuk Bersikap Bodo Amat
yunanda@nusa.net.id|Great Customer Service
zailani@nusa.net.id|Kerjaku, Ibadahku
zailani@nusa.net.id|Mencari Bening Mata Air
zailani@nusa.net.id|Bahagia Bersama
zailani@nusa.net.id|Sayangi Dirimu, Berhentilah Menyenangkan Semua Orang
zailani@nusa.net.id|Mengapa Doa Saya Selalu Dikabulkan
zoya@nusa.net.id|Makanya, Mikir!
zoya@nusa.net.id|77 Cara Bodoh Hidup Bahagia
zoya@nusa.net.id|Atomic Habits
mfikri@nusa.net.id|Bad Men
nurul@nusa.net.id|The Psychology of Money
nurul@nusa.net.id|Who Moved My Cheese?
linda@nusa.net.id|The Art Stoicism
titinpurba@nusa.net.id|Membaca Pikiran Orang Lewat Bahasa Tubuh
rizkaputri@nusa.net.id|DotCom Secrets
rizkaputri@nusa.net.id|The Art Stoicism
meysha@nusa.net.id|Berani Tidak Disukai
meysha@nusa.net.id|Quarter Life Crisis
meysha@nusa.net.id|Hidup Damai Tanpa Berpikir Berlebihan
rindayana@nusawork.com|The Freedom of Self-Forgetfulness: The Path to True Christian Joy
rindayana@nusawork.com|The Ciputra Way
rindayana@nusawork.com|The Steve Jobs Way
rindayana@nusawork.com|The Black Swan
rindayana@nusawork.com|Emotional Intelligence
ekopujianto@nusa.net.id|Designing for Emotion
ekopujianto@nusa.net.id|Conversational Design
ekopujianto@nusa.net.id|Modular Design Frameworks: A Projects-based Guide for UI/UX Designers
ekopujianto@nusa.net.id|Atomic Design`;

        msg15.split('\n').forEach(line => {
            const [email, title] = line.split('|');
            if (email && title) verifiedPairs.add(`${email.trim().toLowerCase()}|${title.trim().toLowerCase()}`);
        });

        const toDemote = [];
        for (const log of approvedLogs) {
            const key = `${log.email.toLowerCase()}|${log.title.toLowerCase().trim()}`;
            if (!verifiedPairs.has(key)) {
                toDemote.push(log.id);
            }
        }

        console.log(`Identified ${toDemote.length} logs that are Approved but NOT in the verified lists.`);
        
        if (toDemote.length > 0) {
            console.log(`Reverting ${toDemote.length} logs to 'Draft'...`);
            await pool.query(
                "UPDATE reading_logs SET hr_approval_status = 'Draft', incentive_amount = 0, approved_by = NULL, approved_at = NULL WHERE id IN (?)",
                [toDemote]
            );
        }

        console.log('Reversion complete.');
        process.exit(0);
    } catch (err) {
        console.error('Failed:', err);
        process.exit(1);
    }
}

revertToUserLists();
