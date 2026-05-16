import pool from '../server/db.js';

const rawData = `21/01/2026 16:11:29	adhitya@nusa.net.id	How To Win Friends & Influence People	100.000
21/02/2026 9:44:04	adhitya@nusa.net.id	Who Moved My Cheese?	100.000
12/03/2026 17:10:05	adhitya@nusa.net.id	Atomic Habits	100.000
18/03/2026 17:17:34	adhitya@nusa.net.id	Sebuah Seni untuk Bersikap Bodo Amat	100.000
25/03/2026 18:00:20	adhitya@nusa.net.id	Attitude Is Everything	100.000
20/04/2026 9:35:12	adindawahyuningsih@nusa.net.id	Zero to One	100.000
25/04/2026 12:56:02	alfan@nusa.net.id	Buying Trances	100.000
06/04/2026 9:37:56	alfi@nusa.net.id	Spin Selling	100.000
14/01/2026 9:01:53	alfiany@nusa.net.id	Mengapa Doa Saya Selalu Dikabulkan	100.000
21/01/2026 16:14:12	alfiany@nusa.net.id	Sayangi Dirimu, Berhentilah Menyenangkan Semua Orang	100.000
09/02/2026 8:23:03	alwis@nusa.net.id	Setiap Manajer Harus Baca Buku Ini!	100.000
23/03/2026 12:17:51	alwis@nusa.net.id	Sebuah Seni untuk Bersikap Bodo Amat	100.000
09/01/2026 8:19:47	ambar@nusa.net.id	The Principles of Power	100.000
24/02/2026 23:08:07	ambar@nusa.net.id	Hooked	100.000
16/02/2026 16:49:16	amelfi@nusa.net.id	Untung Besar 80 jt-an	100.000
18/02/2026 9:11:48	amelfi@nusa.net.id	Mencari Bening Mata Air	100.000
23/02/2026 9:39:48	amelfi@nusa.net.id	Jurus Sehat Rasulullah	100.000
24/03/2026 9:32:44	amelfi@nusa.net.id	Membongkar Trik Rahasia Para Master PHP	100.000
25/03/2026 18:03:36	amelfi@nusa.net.id	Kerjaku, Ibadahku	100.000
23/04/2026 17:39:35	andreas@nusa.net.id	How To Win Friends & Influence People	100.000
24/04/2026 12:51:40	angelinlaka@nusa.net.id	The Secret: Rahasia	100.000
20/01/2026 15:25:44	angga@nusa.net.id	Control Your Expectation	100.000
24/04/2026 15:52:15	angga@nusa.net.id	The Great Ideas	100.000
23/01/2026 18:51:16	anggisaputra@nusa.net.id	Makanya, Mikir!	100.000
23/02/2026 17:12:58	anggisaputra@nusa.net.id	Sebuah Seni untuk Bersikap Bodo Amat	100.000
16/03/2026 17:03:35	anggisaputra@nusa.net.id	Ikigai	100.000
24/04/2026 19:05:10	anggisaputra@nusa.net.id	8 Kekuatan Keunggulan Diri	100.000
25/02/2026 12:20:47	anjelisa@nusa.net.id	Keluarga Super Irit	50.000
26/03/2026 10:25:54	anjelisa@nusa.net.id	Great Customer Service	100.000
26/03/2026 10:29:25	anjelisa@nusa.net.id	77++ Tanya Jawab Cara Bodoh Berjualan	100.000
31/03/2026 16:19:50	anjelisa@nusa.net.id	Atomic Habits	100.000
31/03/2026 16:21:03	anjelisa@nusa.net.id	Who Moved My Cheese?	100.000
25/01/2026 15:41:38	antonnikola@nusa.net.id	Getting to Yes	100.000
24/01/2026 9:45:36	aqif@nusa.net.id	Who Moved My Cheese?	100.000
18/02/2026 9:09:36	aqif@nusa.net.id	77 Cara Bodoh Hidup Bahagia	100.000
13/03/2026 9:05:13	aqif@nusa.net.id	Learning 5.1	100.000
20/03/2026 9:02:06	aqif@nusa.net.id	Be Your Own Boss Now	100.000
25/03/2026 8:46:45	aqif@nusa.net.id	Makanya, Mikir!	100.000
23/01/2026 16:28:58	ardha@nusa.net.id	Jurus Anti-Gagal Dalam Menjual	100.000
25/04/2026 8:59:14	ardha@nusa.net.id	77 Cara Bodoh Hidup Bahagia	100.000
24/01/2026 23:07:29	aryawicaksana@nusa.net.id	Sebuah Seni untuk Bersikap Bodo Amat	100.000
24/02/2026 21:53:17	aryawicaksana@nusa.net.id	77 Cara Bodoh Hidup Bahagia	100.000
25/03/2026 19:15:59	aryawicaksana@nusa.net.id	Awareness Of Ramadhan	100.000
25/04/2026 20:03:00	aryawicaksana@nusa.net.id	Think and Grow Rich	100.000
24/01/2026 22:54:06	azmi@nusa.net.id	Atomic Habits	100.000
25/03/2026 21:16:17	azmi@nusa.net.id	Think and Grow Rich	100.000
25/04/2026 23:39:03	azmi@nusa.net.id	Be Your Own Boss Now	100.000
26/01/2026 11:06:38	bagas@nusa.net.id	The Empathy Effect	100.000
23/02/2026 17:37:42	bagas@nusa.net.id	Setiap Manajer Harus Baca Buku Ini!	100.000
21/02/2026 11:36:22	bagus@nusa.net.id	Happiness Through Budha Damma	100.000
25/04/2026 13:47:25	bagus@nusa.net.id	Who Moved My Cheese?	100.000
19/02/2026 9:12:56	cesar@nusa.net.id	10 Jurus Terlarang	100.000
20/03/2026 9:34:01	cesar@nusa.net.id	Naked Sales	100.000
11/02/2026 15:31:53	cinthya@nusa.net.id	Merawat Luka Batin	100.000
16/03/2026 17:02:04	cinthya@nusa.net.id	Quiet	100.000
16/04/2026 14:15:38	cinthya@nusa.net.id	Noise: A Flaw in Human Judgment	100.000
25/01/2026 21:57:30	dheyslow@nusa.net.id	Hypnotic Writing	100.000
24/02/2026 14:17:37	dheyslow@nusa.net.id	Kejar Target	100.000
25/03/2026 19:09:39	dheyslow@nusa.net.id	The Effective Executive	100.000
25/04/2026 9:54:26	dheyslow@nusa.net.id	Makanya, Mikir!	100.000
24/01/2026 22:48:22	dian@nusa.net.id	Zero to One	100.000
24/03/2026 15:46:01	dian@nusa.net.id	Cantik, Cerdas, dan Feminin	100.000
28/03/2026 10:28:25	dian@nusa.net.id	Berani Tidak Disukai	100.000
24/04/2026 9:04:16	dian@nusa.net.id	The Way to Happiness	100.000
24/01/2026 10:04:48	dodisyahdianto@nusa.net.id	Start With Why	100.000
23/02/2026 10:15:15	dodisyahdianto@nusa.net.id	Attitude Is Everything	100.000
01/04/2026 9:47:23	dodisyahdianto@nusa.net.id	Be Your Own Boss Now	100.000
17/04/2026 10:32:59	dodisyahdianto@nusa.net.id	The Subtle Art Of Not Giving A Fuck	100.000
23/04/2026 10:07:28	dodisyahdianto@nusa.net.id	Tipping Point	100.000
25/02/2026 17:18:40	efen@nusa.net.id	Oh My Goodness	100.000
17/01/2026 17:07:25	ekopujianto@nusa.net.id	Modular Design Frameworks: A Projects-based Guide for UI/UX Designers	100.000
04/02/2026 14:30:42	ekopujianto@nusa.net.id	Atomic Design	100.000
15/04/2026 21:43:55	ekopujianto@nusa.net.id	Designing for Emotion	100.000
25/01/2026 19:11:38	evelyn@nusa.net.id	The Principles of Power	100.000
25/04/2026 20:11:13	evelyn@nusa.net.id	Managing People Is Like Herding Cats	100.000
25/03/2026 20:58:04	famujji@nusa.net.id	Sebuah Seni untuk Bersikap Bodo Amat	100.000
22/01/2026 9:13:38	fandi@nusa.net.id	Sebuah Seni untuk Bersikap Bodo Amat	100.000
25/03/2026 8:19:20	fandi@nusa.net.id	Purple Cow	100.000
27/02/2026 9:35:22	fatiah@nusa.net.id	Sebuah Seni untuk Bersikap Bodo Amat	100.000
25/03/2026 12:18:01	fatiah@nusa.net.id	Atomic Habits	100.000
11/04/2026 16:08:26	fayad@nusa.net.id	The Power Of Habit (IDN)	100.000
25/03/2026 8:33:35	freddy@nusa.net.id	Membuka Pintu Hati	100.000
19/01/2026 17:32:51	gebby@nusa.net.id	Sebuah Seni untuk Bersikap Bodo Amat	100.000
23/02/2026 17:12:34	gebby@nusa.net.id	Atomic Habits	100.000
24/03/2026 17:32:42	gebby@nusa.net.id	Berani Tidak Disukai	100.000
19/01/2026 9:29:18	gompis@nusa.net.id	How To Win Friends & Influence People	100.000
20/04/2026 9:13:40	gompis@nusa.net.id	Improvisasi Jazz	100.000
14/01/2026 9:05:28	harianto@nusa.net.id	Laku dan Tutur Islami	100.000
19/01/2026 9:23:57	harianto@nusa.net.id	77++ Tanya Jawab Cara Bodoh Berjualan	100.000
21/01/2026 9:20:07	harianto@nusa.net.id	50 Kesalahan Sales dan Solusinya	100.000
23/01/2026 9:08:56	harianto@nusa.net.id	Untung Besar 80 jt-an	100.000
24/01/2026 10:26:57	harianto@nusa.net.id	8 Kekuatan Keunggulan Diri	100.000
19/02/2026 12:40:47	haya@nusa.net.id	Who Moved My Cheese?	100.000
12/03/2026 11:40:48	haya@nusa.net.id	The Principles of Power	100.000
13/04/2026 15:07:59	haya@nusa.net.id	Tak Apa-apa Tak Sempurna	100.000
23/04/2026 17:03:52	hendro@nusa.net.id	Openstack	100.000
24/01/2026 8:17:00	hendy@nusa.net.id	Bahagia Bersama	100.000
21/04/2026 20:30:08	hendy@nusa.net.id	Berani Tidak Disukai	100.000
24/01/2026 2:30:44	imamzhulkarnaen@nusa.net.id	Quiet	100.000
17/02/2026 15:09:42	imamzhulkarnaen@nusa.net.id	Work Rules!	100.000
24/03/2026 22:35:46	imamzhulkarnaen@nusa.net.id	Winners Dream	100.000
13/04/2026 0:40:54	imamzhulkarnaen@nusa.net.id	The Power Of Habit (ENG)	100.000
23/04/2026 23:23:06	imamzhulkarnaen@nusa.net.id	TED Talks	100.000
12/01/2026 9:08:55	immanuel@nusa.net.id	From Zero to Survive	100.000
19/02/2026 17:01:34	iqrom@nusa.net.id	Atomic Habits	100.000
20/03/2026 9:32:56	iqrom@nusa.net.id	The Subtle Art Of Not Giving A Fuck	100.000
24/03/2026 8:02:32	iqrom@nusa.net.id	Kado Cinta	100.000
14/04/2026 8:13:45	iqrom@nusa.net.id	Yes! I Can Serve	100.000
22/04/2026 17:27:07	iqrom@nusa.net.id	10 Jurus Terlarang	100.000
07/04/2026 18:11:31	jefri@nusa.id	Makanya, Mikir!	100.000
09/04/2026 15:09:36	jefri@nusa.id	Prinsipil Ekonomi	100.000
10/02/2026 10:43:39	jimmyfebrian@nusa.net.id	From Zero to Survive	100.000
24/02/2026 5:59:21	josuapinem@nusa.net.id	The Power Of Habit (IDN)	100.000
23/03/2026 11:04:20	josuapinem@nusa.net.id	Tipping Point	100.000
19/04/2026 11:06:16	josuapinem@nusa.net.id	Learning 5.1	100.000
24/04/2026 12:55:07	josuapinem@nusa.net.id	Hooked	100.000
25/02/2026 18:03:56	josuapurba@nusa.net.id	Memetik Matahari	100.000
25/04/2026 11:57:45	josuapurba@nusa.net.id	Sales Breakthrough	100.000
09/02/2026 11:13:24	kajel@nusa.net.id	Zero to One	100.000
16/03/2026 13:24:51	kajel@nusa.net.id	From Zero to Survive	100.000
11/01/2026 15:26:26	komangbayu@nusa.net.id	Tak Apa-apa Tak Sempurna	100.000
20/03/2026 23:13:50	linda@nusa.net.id	The Art Stoicism	100.000
01/01/2026 8:02:19	lutfi@nusa.net.id	Berani Tidak Disukai	100.000
24/01/2026 6:39:58	lutfi@nusa.net.id	Simplify Your Work Life	100.000
24/03/2026 6:31:34	lutfi@nusa.net.id	Sayangi Dirimu, Berhentilah Menyenangkan Semua Orang	100.000
24/04/2026 4:01:50	lutfi@nusa.net.id	From Zero to Survive	100.000
24/01/2026 1:26:51	madja@nusa.net.id	Atomic Habits	100.000
13/03/2026 18:09:28	maleakhi@nusa.net.id	Merry Riana: Langkah Sejuta Suluh	100.000
25/03/2026 15:07:40	maleakhi@nusa.net.id	50 Kesalahan Sales dan Solusinya	100.000
13/04/2026 17:27:07	maleakhi@nusa.net.id	Tipping Point	100.000
25/04/2026 9:37:59	maleakhi@nusa.net.id	The Empathy Effect	100.000
24/01/2026 10:04:48	marudut@nusa.net.id	Naked Sales	100.000
24/03/2026 9:05:30	marudut@nusa.net.id	The 7 Habits of Highly Effective People (IDN)	100.000
11/02/2026 15:58:15	meysha@nusa.net.id	77 Cara Bodoh Hidup Bahagia	100.000
02/04/2026 10:16:44	meysha@nusa.net.id	Hidup Damai Tanpa Berpikir Berlebihan	100.000
17/04/2026 22:46:39	meysha@nusa.net.id	Makanya, Mikir!	100.000
10/01/2026 9:43:49	mfikri@nusa.net.id	Getting to Yes	100.000
17/01/2026 10:14:31	mfikri@nusa.net.id	Ikigai	100.000
09/02/2026 17:32:11	mfikri@nusa.net.id	Quiet	100.000
14/02/2026 12:57:39	mfikri@nusa.net.id	Zero to One	100.000
21/02/2026 9:16:18	mfikri@nusa.net.id	Who Moved My Cheese?	100.000
19/01/2026 9:23:37	najla@nusa.id	Getting to Yes	100.000
19/01/2026 8:29:01	natanael@nusa.net.id	Purple Cow	100.000
25/02/2026 5:09:02	natanael@nusa.net.id	Learning 5.1	100.000
13/04/2026 15:24:28	natanael@nusa.net.id	Apa Apa Saja yang Harus di Lakukan Manajer & Supervisor	100.000
25/01/2026 8:05:42	nethasya@nusa.net.id	Getting to Yes	100.000
25/02/2026 9:02:37	nethasya@nusa.net.id	Control Your Expectation	100.000
18/03/2026 17:01:20	nethasya@nusa.net.id	The Way to Happiness	100.000
25/04/2026 11:02:49	nethasya@nusa.net.id	Great Customer Service	100.000
22/01/2026 7:51:58	niluhyani@nusa.net.id	Terima Kasih Sudah Mengatakannya	100.000
23/02/2026 8:07:05	niluhyani@nusa.net.id	The Secret: Rahasia	100.000
24/03/2026 13:21:11	niluhyani@nusa.net.id	From Zero to Survive	100.000
22/04/2026 8:55:16	niluhyani@nusa.net.id	Makanya, Mikir!	100.000
21/04/2026 20:55:27	nurul@nusa.net.id	The Psychology of Money	100.000
24/04/2026 11:49:08	nurul@nusa.net.id	Who Moved My Cheese?	100.000
28/01/2026 14:42:06	peby@nusa.net.id	The Way to Happiness	100.000
25/02/2026 23:59:42	peby@nusa.net.id	Atomic Habits	100.000
25/04/2026 23:59:26	peby@nusa.net.id	Who Moved My Cheese?	100.000
21/01/2026 0:47:37	pedro@nusa.net.id	8 Kekuatan Keunggulan Diri	100.000
17/02/2026 11:14:26	pedro@nusa.net.id	The Ciputra Way	100.000
19/03/2026 9:43:38	pedro@nusa.net.id	TED Talks	100.000
23/04/2026 7:19:52	pedro@nusa.net.id	Ikigai	100.000
24/01/2026 9:54:41	prima@nusa.net.id	Homo Deus	100.000
25/03/2026 15:51:07	prima@nusa.net.id	Mengapa Doa Saya Selalu Dikabulkan	100.000
25/03/2026 15:52:48	prima@nusa.net.id	Project X Cup Noodle	50.000
25/04/2026 9:14:28	prima@nusa.net.id	Atomic Habits	100.000
25/01/2026 20:29:03	putri@nusa.id	Manifest: 7 Langkah Menuju Hidup yang Indah	100.000
13/04/2026 11:38:08	putri@nusa.id	The Empathy Effect	100.000
24/04/2026 8:49:00	putri@nusa.id	Berpikir Kritis	100.000
23/01/2026 17:45:18	putrisitumorang@nusa.net.id	Tak Apa-Apa Tak Sempurna	100.000
23/02/2026 17:16:22	putrisitumorang@nusa.net.id	Ikigai	100.000
25/03/2026 13:39:22	putrisitumorang@nusa.net.id	8 Kekuatan Keunggulan Diri	100.000
25/04/2026 12:00:58	putrisitumorang@nusa.net.id	Setiap Manajer Harus Baca Buku Ini!	100.000
22/01/2026 17:38:06	rafliansyah@nusa.net.id	8 Kekuatan Keunggulan Diri	100.000
24/01/2026 10:16:59	rafliansyah@nusa.net.id	Ikigai	100.000
11/02/2026 14:32:32	rafliansyah@nusa.net.id	77 Cara Bodoh Hidup Bahagia	100.000
25/02/2026 9:05:01	rafliansyah@nusa.net.id	Spin Selling	100.000
01/04/2026 9:54:29	rafliansyah@nusa.net.id	The Subtle Art Of Not Giving A Fuck	100.000
23/01/2026 10:59:03	rahayuningsih@nusa.net.id	From Zero to Survive	100.000
25/02/2026 12:54:44	rahayuningsih@nusa.net.id	Same as Ever	100.000
28/01/2026 10:39:11	rama@nusawork.com	Who Moved My Cheese?	100.000
07/02/2026 10:47:54	rifqi@nusa.net.id	Getting to Yes	100.000
16/02/2026 17:50:25	rifqi@nusa.net.id	Thinking, Fast and Slow	100.000
19/02/2026 9:30:36	rifqi@nusa.net.id	Profit Is King	100.000
21/02/2026 14:05:12	rifqi@nusa.net.id	How To Win Friends & Influence People	100.000
23/02/2026 18:54:59	rifqi@nusa.net.id	Hypnotic Writing	100.000
23/02/2026 10:30:35	rinasukmawati@nusa.net.id	Makanya, Mikir!	100.000
25/03/2026 8:32:59	rinasukmawati@nusa.net.id	The Secret: Rahasia	100.000
23/04/2026 12:03:20	rinasukmawati@nusa.net.id	Who Moved My Cheese?	100.000
20/01/2026 11:44:23	rindayana@nusawork.com	The Communication Book	100.000
20/01/2026 13:57:29	rindayana@nusawork.com	Atomic Habits	100.000
05/02/2026 11:22:48	rindayana@nusawork.com	The Freedom of Self-Forgetfulness: The Path to True Christian Joy	100.000
23/02/2026 7:49:48	rindayana@nusawork.com	Getting to Yes	100.000
12/03/2026 11:46:40	rindayana@nusawork.com	The Ciputra Way	100.000
24/02/2026 21:51:04	riskisimanjuntak@nusa.net.id	Key Performance Indicators	100.000
25/04/2026 0:37:36	riskisimanjuntak@nusa.net.id	How To Win Friends & Influence People In The Digital Age	100.000
19/01/2026 12:05:46	rizkaputri@nusa.net.id	DotCom Secrets	100.000
25/02/2026 9:02:13	rizkaputri@nusa.net.id	7 Kebiasaan Manusia yang Sangat Efektif	100.000
31/03/2026 11:12:29	rizkaputri@nusa.net.id	The Art Stoicism	100.000
31/12/2025 9:34:19	rizkyabdillah@nusa.net.id	Who Moved My Cheese?	100.000
19/01/2026 7:08:06	romi@nusa.net.id	Great Customer Service	100.000
23/02/2026 16:24:16	romi@nusa.net.id	Makanya, Mikir!	100.000
20/03/2026 6:45:57	romi@nusa.net.id	Blink: Kemampuan berfikir tanpa berfikir	100.000
16/04/2026 6:44:30	romi@nusa.net.id	The Life-Changing Manga of Tidying Up	50.000
20/02/2026 10:59:09	rosaliana@nusa.net.id	Terima Kasih Sudah Mengatakannya	100.000
19/04/2026 20:49:58	rosaliana@nusa.net.id	The Principles of Power	100.000
23/04/2026 21:05:09	rosaliana@nusa.net.id	Habit is Power	100.000
21/01/2026 19:20:43	ryanalfarisi@nusa.net.id	Think and Grow Rich	100.000
25/04/2026 13:12:16	ryanfajar@nusa.net.id	Manifest: 7 Langkah Menuju Hidup Yang Indah	100.000
06/01/2026 8:43:15	sabrino@nusa.net.id	Membongkar Trik Rahasia Para Master PHP	100.000
25/03/2026 17:03:01	sabrino@nusa.net.id	Atomic Habits	100.000
24/01/2026 20:10:12	salsabila@nusawork.com	Getting to Yes	100.000
22/02/2026 14:02:59	salsabila@nusawork.com	Same as Ever	100.000
11/02/2026 7:52:10	samudera@nusa.net.id	Control Your Expectation	100.000
25/04/2026 19:21:29	samudera@nusa.net.id	50 Kesalahan Sales dan Solusinya	100.000
29/01/2026 9:10:20	samuelmanik@nusa.net.id	Berani Tidak Disukai	100.000
17/01/2026 11:48:46	siddiq@nusa.net.id	Simplify Your Work Life	100.000
04/02/2026 16:10:24	siddiq@nusa.net.id	Great Customer Service	100.000
17/02/2026 23:16:09	siddiq@nusa.net.id	Sampaikanlah Walau Satu Konten	100.000
24/02/2026 11:23:55	siddiq@nusa.net.id	Zero to One	100.000
11/04/2026 11:30:42	siddiq@nusa.net.id	77 Cara Bodoh Hidup Bahagia	100.000
06/01/2026 7:58:13	sirjon@nusa.net.id	Manifest: 7 Langkah Menuju Hidup yang Indah	100.000
17/01/2026 10:46:17	sirjon@nusa.net.id	Start With Why	100.000
29/01/2026 8:10:49	sirjon@nusa.net.id	How To Win Friends & Influence People	100.000
05/02/2026 9:49:19	sirjon@nusa.net.id	Awareness Of Ramadhan	100.000
18/02/2026 8:51:23	sirjon@nusa.net.id	Great Customer Service	100.000
26/12/2025 8:35:59	steven@nusa.net.id	Improvisasi Jazz	100.000
26/12/2025 13:12:04	steven@nusa.net.id	Tragedi IPDN	100.000
29/12/2025 13:16:41	steven@nusa.net.id	8 Kekuatan Keunggulan Diri	100.000
30/12/2025 13:00:42	steven@nusa.net.id	Quidditch Through The Ages	100.000
09/02/2026 8:17:50	steven@nusa.net.id	Atomic Habits	100.000
18/02/2026 9:27:19	sudirman@nusa.net.id	Sales Breakthrough	100.000
20/02/2026 8:59:08	sudirman@nusa.net.id	Mencari Bening Mata Air	100.000
21/02/2026 11:55:41	sudirman@nusa.net.id	How To Win Friends & Influence People	100.000
24/02/2026 9:55:21	sudirman@nusa.net.id	The Power Of Habit (IDN)	100.000
20/03/2026 8:29:39	syarfina@nusa.net.id	Makanya, Mikir!	100.000
23/01/2026 22:26:07	syawal@nusa.net.id	Homo Deus	100.000
23/03/2026 6:15:54	syawal@nusa.net.id	21 Lessons for the 21st Century	100.000
23/04/2026 1:58:49	syawal@nusa.net.id	Self Driving	100.000
25/01/2026 2:53:52	tantowi@nusa.net.id	7 Kebiasaan Manusia yang Sangat Efektif	100.000
24/02/2026 15:35:59	tantowi@nusa.net.id	Makanya, Mikir!	100.000
05/01/2026 17:59:16	teguhakbar@nusa.net.id	Butir-Butir Mutiara Kesuksesan	100.000
09/01/2026 17:32:40	teguhakbar@nusa.net.id	Zero to One	100.000
12/01/2026 12:28:51	teguhakbar@nusa.net.id	Memetik Matahari	100.000
17/01/2026 10:07:15	teguhakbar@nusa.net.id	Solution Selling	100.000
21/01/2026 18:21:48	teguhakbar@nusa.net.id	Ikigai	100.000
25/01/2026 23:28:57	titinpurba@nusa.net.id	Membaca Pikiran Orang Lewat Bahasa Tubuh	100.000
25/02/2026 19:31:08	titinpurba@nusa.net.id	Hooked	100.000
25/03/2026 23:25:24	titinpurba@nusa.net.id	Makanya, Mikir!	100.000
15/04/2026 16:11:38	titinpurba@nusa.net.id	Who Moved My Cheese?	100.000
15/04/2026 16:12:53	titinpurba@nusa.net.id	The Things You Can See Only When You Slow Down	100.000
06/04/2026 15:52:57	tomi@nusa.net.id	Kekuatan Kata Tidak	100.000
27/02/2026 8:59:39	topher@nusa.net.id	Be Brilliant and Productive	100.000
25/03/2026 21:38:06	topher@nusa.net.id	Hooked	100.000
26/12/2025 11:27:06	ummi@nusa.net.id	Makanya, Mikir!	100.000
16/03/2026 15:07:30	utami@nusawork.com	Atomic Habits	100.000
08/04/2026 16:08:45	utami@nusawork.com	Getting to Yes	100.000
21/04/2026 15:42:32	utami@nusawork.com	Stay Positive with Marcus Aurelius	100.000
17/03/2026 12:45:44	williamtobing@nusa.net.id	Introduction to Cryptography	100.000
25/03/2026 15:41:12	williamtobing@nusa.net.id	Bikin PC Aman dari Serangan Virus, Spam, dan Spyware	100.000
16/04/2026 11:38:01	williamtobing@nusa.net.id	Who Moved My Cheese?	100.000
25/02/2026 13:06:55	windy@nusa.net.id	Merry Riana: Langkah Sejuta Suluh	100.000
24/02/2026 15:31:28	wiraagus@nusa.net.id	Kekuatan Kata Tidak	100.000
05/01/2026 18:00:47	yunanda@nusa.net.id	Ikigai	100.000
13/01/2026 17:41:09	yunanda@nusa.net.id	Profit Is King	100.000
04/02/2026 16:56:15	yunanda@nusa.net.id	Kekuatan Kata Tidak	100.000
24/02/2026 17:05:01	yunanda@nusa.net.id	Sebuah Seni untuk Bersikap Bodo Amat	100.000
25/02/2026 17:13:39	yunanda@nusa.net.id	Great Customer Service	100.000
02/01/2026 17:33:26	zailani@nusa.net.id	Kerjaku, Ibadahku	100.000
05/01/2026 17:44:53	zailani@nusa.net.id	Mencari Bening Mata Air	100.000
08/01/2026 17:56:46	zailani@nusa.net.id	Bahagia Bersama	100.000
14/01/2026 8:31:00	zailani@nusa.net.id	Sayangi Dirimu, Berhentilah Menyenangkan Semua Orang	100.000
21/01/2026 18:18:44	zailani@nusa.net.id	Mengapa Doa Saya Selalu Dikabulkan	100.000
23/01/2026 21:18:36	zoya@nusa.net.id	Makanya, Mikir!	100.000
23/02/2026 17:47:13	zoya@nusa.net.id	77 Cara Bodoh Hidup Bahagia	100.000
25/03/2026 18:34:19	zoya@nusa.net.id	Atomic Habits	100.000`;

async function syncAndApprove() {
    try {
        console.log('Fetching users...');
        const [users] = await pool.query('SELECT email, employee_id, name FROM users');
        const userMap = users.reduce((acc, u) => {
            if (u.email) acc[u.email.toLowerCase().trim()] = u;
            return acc;
        }, {});

        const lines = rawData.trim().split('\n');
        console.log(`Processing ${lines.length} lines for approval...`);

        let updatedCount = 0;
        let notFoundCount = 0;
        let alreadyApprovedCount = 0;

        for (const line of lines) {
            const parts = line.split('\t');
            if (parts.length < 3) continue;

            const dateStr = parts[0].trim();
            const email = parts[1].toLowerCase().trim();
            const title = parts[2].trim();
            const incentiveStr = parts[3] ? parts[3].trim().replace(/\./g, '') : '0';
            const incentiveAmount = parseInt(incentiveStr) || 0;

            const user = userMap[email];
            if (!user) {
                console.warn(`User not found in DB: ${email}`);
                notFoundCount++;
                continue;
            }

            // Check if record exists in reading_logs
            const [existing] = await pool.query(
                'SELECT id, hr_approval_status FROM reading_logs WHERE employee_id = ? AND title = ?',
                [user.employee_id, title]
            );

            // Parse date for consistency
            const [dStr, tStr] = dateStr.split(' ');
            const [day, month, year] = dStr.split('/');
            const mysqlDate = `${year}-${month}-${day} ${tStr}`;

            if (existing.length > 0) {
                // Update existing record to Approved
                await pool.query(
                    `UPDATE reading_logs 
                     SET hr_approval_status = 'Approved', 
                         incentive_amount = ?, 
                         approved_by = 'Tomi', 
                         status = 'Finished',
                         approved_at = ?,
                         finish_date = IFNULL(finish_date, ?)
                     WHERE id = ?`,
                    [incentiveAmount, mysqlDate, mysqlDate, existing[0].id]
                );
                updatedCount++;
            } else {
                // Not found, maybe we should skip or warn
                // console.warn(`Record not found in DB: ${email} - ${title}`);
                notFoundCount++;
            }
        }

        console.log(`Sync finished.`);
        console.log(`- Updated (Approved): ${updatedCount}`);
        console.log(`- Not found in DB: ${notFoundCount}`);
        process.exit(0);
    } catch (err) {
        console.error('Process failed:', err);
        process.exit(1);
    }
}

syncAndApprove();
