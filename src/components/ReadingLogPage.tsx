import { useState, useEffect, type ChangeEvent, type FormEvent } from 'react';
import { BookOpen, ArrowLeft, Search, Book, Trophy, Trash2, XCircle, MessageCircle, LogOut, CheckCircle, Upload } from 'lucide-react';
import { API_BASE_URL } from '../config';
import type { ReadingLogEntry, User } from '../types';
import PopupNotification from './PopupNotification';
import ConfirmationModal from './ConfirmationModal';



interface ReadingLogPageProps {
    user: User;
    onBack: () => void;
}

const ReadingLogPage = ({ user, onBack }: ReadingLogPageProps) => {
    const [readingLogs, setReadingLogs] = useState<ReadingLogEntry[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [notification, setNotification] = useState<{ show: boolean; type: 'success' | 'error'; message: string }>({ show: false, type: 'success', message: '' });

    // --- Stats State ---
    const [yearReadCount, setYearReadCount] = useState(0);

    // --- State for "Claim / Selesai" Modal ---
    const [claimModalOpen, setClaimModalOpen] = useState(false);
    const [selectedLog, setSelectedLog] = useState<ReadingLogEntry | null>(null);



    // --- Form State: Private Book Report ---
    const [privateReportForm, setPrivateReportForm] = useState<{
        title: string;
        category: string;
        startDate: string;
        finishDate: string;
        link: string;
        evidenceUrl: string;
    }>({
        title: '',
        category: '',
        startDate: '',
        finishDate: new Date().toISOString().split('T')[0],
        link: '',
        evidenceUrl: ''
    });

    // --- Form State: Claim / Finish (For Office Books / WA Borrowed) ---
    const [claimForm, setClaimForm] = useState<{
        title: string;
        category: string;
        startDate: string;
        finishDate: string;
        link: string;
        evidenceUrl: string;
    }>({
        title: '',
        category: '',
        startDate: '',
        finishDate: new Date().toISOString().split('T')[0],
        link: '',
        evidenceUrl: ''
    });

    const [confirmConfig, setConfirmConfig] = useState<{
        isOpen: boolean;
        title: string;
        message: string;
        onConfirm: () => void;
    }>({ isOpen: false, title: '', message: '', onConfirm: () => { } });

    const openConfirm = (title: string, message: string, onConfirm: () => void) => {
        setConfirmConfig({ isOpen: true, title, message, onConfirm });
    };

    // --- Fetch Data ---
    useEffect(() => {
        fetch(`${API_BASE_URL}/api/logs`)
            .then(res => res.json())
            .then(data => {
                if (!Array.isArray(data)) {
                    console.error("Expected array from API", data);
                    setReadingLogs([]);
                    return;
                }
                const userLogs = data.filter((log: ReadingLogEntry) =>
                    log.employee_id === user.employee_id || (!log.employee_id && log.userName === user.name)
                );
                setReadingLogs(userLogs);

                // Calculate This Year's Completed Books
                const currentYear = new Date().getFullYear();
                const isValidDate = (d: string) => { const dt = new Date(d); return !isNaN(dt.getTime()); };

                const count = userLogs.filter((log: ReadingLogEntry) =>
                    log.status === 'Finished' && isValidDate(log.date) && new Date(log.date).getFullYear() === currentYear
                ).length;
                setYearReadCount(count);
            })
            .catch(err => console.error("Failed to fetch readingLogs", err));
    }, [user.name]);

    const handleWhatsAppRedirect = (text: string) => {
        const phone = "628889654321";
        const url = `https://wa.me/${phone}?text=${encodeURIComponent(text)}`;
        window.open(url, '_blank');
    };





    const handleDelete = (id: number) => {
        openConfirm('Delete Log', 'Are you sure you want to delete this log?', async () => {
            try {
                const res = await fetch(`${API_BASE_URL}/api/logs/${id}`, { method: 'DELETE' });
                if (res.ok) {
                    setReadingLogs(readingLogs.filter(log => log.id !== id));
                    if (selectedLog?.id === id) setSelectedLog(null);
                    setNotification({ show: true, type: 'success', message: "Log deleted successfully." });
                }
            } catch (err) {
                console.error("Failed to delete log", err);
                setNotification({ show: true, type: 'error', message: "Failed to delete log." });
            }
        });
    };

    const handleFileChange = async (e: ChangeEvent<HTMLInputElement>, target: 'privateReport' | 'claimFinish') => {
        if (e.target.files && e.target.files[0]) {
            const file = e.target.files[0];
            const data = new FormData();
            data.append('file', file);

            try {
                const res = await fetch(`${API_BASE_URL}/api/upload`, {
                    method: 'POST',
                    body: data
                });

                if (res.ok) {
                    const result = await res.json();
                    if (target === 'privateReport') {
                        setPrivateReportForm(prev => ({ ...prev, evidenceUrl: result.fileUrl }));
                    } else {
                        setClaimForm(prev => ({ ...prev, evidenceUrl: result.fileUrl }));
                    }
                    setNotification({ show: true, type: 'success', message: "Foto berhasil diupload!" });
                } else {
                    const errText = await res.text();
                    setNotification({ show: true, type: 'error', message: `Upload gagal: ${errText}` });
                }
            } catch (err) {
                console.error("Upload error:", err);
                setNotification({ show: true, type: 'error', message: "Error uploading photo." });
            }
        }
    };

    const getIncentivePeriod = (dateStr: string) => {
        const d = new Date(dateStr);
        const day = d.getDate();
        const month = d.getMonth();
        const year = d.getFullYear();

        if (day > 25) {
            if (month === 11) return { month: 0, year: year + 1 };
            return { month: month + 1, year };
        }
        return { month, year };
    };

    const isEligibleForBonus = readingLogs.filter(l => l.hrApprovalStatus === 'Approved').length >= 5;

    const categories = [
        "Biografi", "Bisnis & Ekonomi", "Fiksi", "Komik/Manga",
        "Non-Fiksi", "Pengembangan Diri", "Sejarah", "Teknologi", "Lainnya"
    ];

    const [filterYear, setFilterYear] = useState(new Date().getFullYear());
    const [filterPeriod, setFilterPeriod] = useState('all');

    const periodOptions = [
        { label: 'All Year', value: 'all' },
        ...[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11].map(m => ({
            label: new Date(2024, m, 1).toLocaleString('default', { month: 'long' }),
            value: String(m)
        }))
    ];

    const filteredLogs = readingLogs.filter(log => {
        if (!log.date) return false;
        // const targetDate = log.status === 'Finished' && log.finishDate ? log.finishDate : log.date;
        const period = getIncentivePeriod(log.finishDate || log.date || '');
        if (period.year !== filterYear) return false;
        if (filterPeriod === 'all') return true;
        return period.month === parseInt(filterPeriod);
    });

    const handlePrivateReportSubmit = async (e: FormEvent) => {
        e.preventDefault();
        setIsLoading(true);
        const { title, category, startDate, finishDate, link, evidenceUrl } = privateReportForm;

        if (!title || !category || !startDate || !finishDate || !link || !evidenceUrl) {
            setNotification({ show: true, type: 'error', message: 'Mohon lengkapi semua field wajib: Judul, Kategori, Tgl Mulai/Selesai, Link, dan Bukti Foto.' });
            setIsLoading(false);
            return;
        }

        try {
            const res = await fetch(`${API_BASE_URL}/api/logs`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    title, category, startDate: new Date(startDate), finishDate: new Date(finishDate),
                    link: link, review: '-', evidenceUrl, status: 'Finished', hrApprovalStatus: 'Pending',
                    location: 'Pribadi', source: 'Buku Pribadi', userName: user.name, employee_id: user.employee_id, date: new Date()
                })
            });

            if (res.ok) {
                const savedLog = await res.json();
                setReadingLogs([savedLog, ...readingLogs]);
                setPrivateReportForm({ title: '', category: '', startDate: '', finishDate: new Date().toISOString().split('T')[0], link: '', evidenceUrl: '' });
                setYearReadCount(prev => prev + 1);
                setNotification({ show: true, type: 'success', message: "Laporan Buku Pribadi berhasil dikirim!" });
            } else {
                const err = await res.json();
                setNotification({ show: true, type: 'error', message: err.error || "Gagal mengirim laporan." });
            }
        } catch (err) {
            console.error(err);
            setNotification({ show: true, type: 'error', message: "Error connecting to server." });
        } finally {
            setIsLoading(false);
        }
    };

    const openClaimModal = (logToFinish?: ReadingLogEntry) => {
        if (logToFinish) {
            setSelectedLog(logToFinish);
            setClaimForm({
                title: logToFinish.title,
                category: logToFinish.category,
                startDate: logToFinish.date ? new Date(logToFinish.date).toISOString().split('T')[0] : '',
                finishDate: new Date().toISOString().split('T')[0],
                link: '',
                evidenceUrl: ''
            });
        } else {
            setSelectedLog(null);
            setClaimForm({
                title: '', category: '', startDate: '', finishDate: new Date().toISOString().split('T')[0],
                link: '', evidenceUrl: ''
            });
        }
        setClaimModalOpen(true);
    };

    const handleClaimSubmit = async (e: FormEvent) => {
        e.preventDefault();
        setIsLoading(true);

        if (!claimForm.link || !claimForm.evidenceUrl || !claimForm.startDate || !claimForm.finishDate) {
            setNotification({ show: true, type: 'error', message: 'Mohon lengkapi semua field wajib: Tgl Mulai, Tgl Selesai, Link Review, dan Bukti Foto.' });
            setIsLoading(false);
            return;
        }

        try {
            let res;
            if (selectedLog) {
                res = await fetch(`${API_BASE_URL}/api/books/return`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        id: selectedLog.id, review: '-', link: claimForm.link, evidenceUrl: claimForm.evidenceUrl,
                        readingDuration: 0, startDate: claimForm.startDate ? new Date(claimForm.startDate) : undefined,
                        finishDate: claimForm.finishDate ? new Date(claimForm.finishDate) : new Date()
                    })
                });
            } else {
                res = await fetch(`${API_BASE_URL}/api/logs`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        title: claimForm.title, category: claimForm.category,
                        startDate: claimForm.startDate ? new Date(claimForm.startDate) : undefined,
                        finishDate: claimForm.finishDate ? new Date(claimForm.finishDate) : new Date(),
                        link: claimForm.link, evidenceUrl: claimForm.evidenceUrl,
                        status: 'Finished', hrApprovalStatus: 'Pending', userName: user.name, employee_id: user.employee_id,
                        source: 'Office/Other', date: new Date()
                    })
                });
            }

            if (res.ok) {
                const savedLog = await res.json();
                if (selectedLog) {
                    setReadingLogs(readingLogs.map(l => l.id === selectedLog.id ? savedLog : l));
                } else {
                    setReadingLogs([savedLog, ...readingLogs]);
                }
                setYearReadCount(prev => prev + 1);
                setClaimModalOpen(false);
                setNotification({ show: true, type: 'success', message: "Klaim bacaan berhasil dikirim!" });
            } else {
                const err = await res.json();
                setNotification({ show: true, type: 'error', message: err.error || "Gagal menyimpan data." });
            }
        } catch (err) {
            console.error(err);
            setNotification({ show: true, type: 'error', message: "Error connecting to server." });
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="max-w-6xl mx-auto space-y-8 pb-20">
            <PopupNotification isOpen={notification.show} type={notification.type} message={notification.message} onClose={() => setNotification({ ...notification, show: false })} />

            <div className="flex items-center justify-between">
                <button onClick={onBack} className="text-sm text-slate-500 hover:text-blue-600 flex items-center gap-1 transition-colors">
                    <ArrowLeft size={14} /> Back to Dashboard
                </button>
                <div className="text-2xl font-bold text-slate-800 flex items-center gap-2">
                    <BookOpen className="text-blue-600" /> Reading Log
                </div>
            </div>

            {/* Stats Banner */}
            <div className="bg-gradient-to-r from-blue-600 to-indigo-600 rounded-2xl p-6 text-white shadow-lg">
                <div className="flex items-center justify-between mb-4">
                    <div>
                        <h2 className="text-2xl font-bold mb-1">Your Reading Journey</h2>
                        <p className="text-blue-100 opacity-90">Track your progress and incentives</p>
                    </div>
                    <div className="text-right">
                        <div className="text-4xl font-black">{yearReadCount}</div>
                        <div className="text-sm font-medium text-blue-100 uppercase tracking-wider">Books This Year</div>
                    </div>
                </div>
                <div className="grid md:grid-cols-2 gap-4">
                    <div className={`p-4 rounded-xl border ${isEligibleForBonus ? 'bg-green-500/20 border-green-400/30' : 'bg-white/10 border-white/20'}`}>
                        <div className="flex items-center gap-3">
                            <div className={`p-2 rounded-lg ${isEligibleForBonus ? 'bg-green-500' : 'bg-slate-500'}`}>
                                <Trophy size={20} className="text-white" />
                            </div>
                            <div>
                                <p className="font-bold text-white">Bonus Incentive Status</p>
                                <p className="text-sm text-blue-100">
                                    {isEligibleForBonus ? "Eligible! 5+ Verified Books." : `${readingLogs.filter(l => l.hrApprovalStatus === 'Approved').length}/5 Books Verified by HR`}
                                </p>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Action Buttons */}
            <div className="grid md:grid-cols-3 gap-6">
                <button onClick={() => handleWhatsAppRedirect('!pinjam_buku')} className="p-6 bg-white rounded-2xl shadow-sm border border-slate-100 hover:shadow-md hover:border-blue-200 transition-all flex flex-col items-center text-center gap-4 group">
                    <div className="bg-blue-50 text-blue-600 p-4 rounded-full group-hover:scale-110 transition-transform"><MessageCircle size={32} /></div>
                    <div><h3 className="font-bold text-lg text-slate-800">Pinjam Buku</h3><p className="text-sm text-slate-500">Pinjam buku kantor via WhatsApp</p></div>
                </button>
                <button onClick={() => handleWhatsAppRedirect('!kembalikan_buku')} className="p-6 bg-white rounded-2xl shadow-sm border border-slate-100 hover:shadow-md hover:border-orange-200 transition-all flex flex-col items-center text-center gap-4 group">
                    <div className="bg-orange-50 text-orange-600 p-4 rounded-full group-hover:scale-110 transition-transform"><LogOut size={32} /></div>
                    <div><h3 className="font-bold text-lg text-slate-800">Kembalikan Buku</h3><p className="text-sm text-slate-500">Kembalikan buku kantor via WhatsApp</p></div>
                </button>
                <button onClick={() => openClaimModal()} className="p-6 bg-white rounded-2xl shadow-sm border border-slate-100 hover:shadow-md hover:border-green-200 transition-all flex flex-col items-center text-center gap-4 group">
                    <div className="bg-green-50 text-green-600 p-4 rounded-full group-hover:scale-110 transition-transform"><CheckCircle size={32} /></div>
                    <div><h3 className="font-bold text-lg text-slate-800">Claim / Selesaikan</h3><p className="text-sm text-slate-500">Lapor bacaan selesai untuk insentif</p></div>
                </button>
            </div>

            <div className="grid lg:grid-cols-3 gap-8">
                {/* Private Report Form */}
                <div className="lg:col-span-1">
                    <div className="bg-white rounded-2xl shadow-xl border border-slate-100 overflow-visible sticky top-6 z-20">
                        <div className="p-6 border-b border-slate-100 bg-slate-50/50">
                            <h2 className="font-bold text-lg text-slate-800 mb-1 flex items-center gap-2"><Book size={20} className="text-purple-600" /> Lapor Bacaan Pribadi</h2>
                            <p className="text-xs text-slate-500">Lapor buku pribadi yang selesai dibaca</p>
                        </div>
                        <form onSubmit={handlePrivateReportSubmit} className="p-6 space-y-4">
                            <div>
                                <label className="block text-sm font-semibold text-slate-700 mb-1">Judul Buku</label>
                                <input required value={privateReportForm.title} onChange={e => setPrivateReportForm({ ...privateReportForm, title: e.target.value })} className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-blue-500 outline-none" placeholder="Input judul buku..." />
                            </div>
                            <div>
                                <label className="block text-sm font-semibold text-slate-700 mb-1">Kategori</label>
                                <select value={privateReportForm.category} onChange={e => setPrivateReportForm({ ...privateReportForm, category: e.target.value })} className="w-full px-4 py-2.5 rounded-xl border border-slate-200 bg-white" required>
                                    <option value="">Select Category...</option>
                                    {categories.map((cat, idx) => <option key={idx} value={cat}>{cat}</option>)}
                                </select>
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                                <div><label className="block text-xs font-bold text-slate-500 mb-1 uppercase">Awal Baca</label><input type="date" required value={privateReportForm.startDate} onChange={e => setPrivateReportForm({ ...privateReportForm, startDate: e.target.value })} className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm" /></div>
                                <div><label className="block text-xs font-bold text-slate-500 mb-1 uppercase">Akhir Baca</label><input type="date" required value={privateReportForm.finishDate} onChange={e => setPrivateReportForm({ ...privateReportForm, finishDate: e.target.value })} className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm" /></div>
                            </div>
                            <div>
                                <label className="block text-sm font-semibold text-slate-700 mb-1">Link Review</label>
                                <input type="url" required value={privateReportForm.link} onChange={e => setPrivateReportForm({ ...privateReportForm, link: e.target.value })} className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-blue-500" placeholder="Goodreads / GDrive link..." />
                            </div>
                            <div>
                                <label className="block text-sm font-bold text-slate-500 mb-1 uppercase text-xs">Bukti Foto Cover</label>
                                <div className="space-y-3">
                                    <div className="flex items-center gap-3">
                                        <div className="relative overflow-hidden cursor-pointer bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-lg p-2 transition-colors">
                                            <input type="file" onChange={(e) => handleFileChange(e, 'privateReport')} className="absolute inset-0 opacity-0 cursor-pointer" accept="image/*" />
                                            <Upload size={18} className="text-slate-500" />
                                        </div>
                                        <span className={`text-xs ${privateReportForm.evidenceUrl ? 'text-green-600 font-bold' : 'text-slate-400'}`}>{privateReportForm.evidenceUrl ? 'Foto Terupload' : 'Upload foto cover'}</span>
                                    </div>
                                    {privateReportForm.evidenceUrl && (
                                        <div className="relative w-full h-48 rounded-xl overflow-hidden border border-slate-200 shadow-sm group">
                                            <img src={`${API_BASE_URL}${privateReportForm.evidenceUrl}`} alt="Evidence" className="w-full h-full object-cover" />
                                            <button type="button" onClick={() => setPrivateReportForm(prev => ({ ...prev, evidenceUrl: '' }))} className="absolute top-2 right-2 bg-red-500 text-white p-1.5 rounded-full opacity-0 group-hover:opacity-100 transition-opacity shadow-lg"><XCircle size={16} /></button>
                                        </div>
                                    )}
                                </div>
                            </div>
                            <button type="submit" disabled={isLoading} className="w-full px-4 py-3 rounded-xl font-bold shadow-lg transition-all flex items-center justify-center gap-2 text-white bg-purple-600 hover:bg-purple-700 hover:shadow-purple-200">{isLoading ? 'Sending...' : 'Kirim Laporan'}</button>
                        </form>
                    </div>
                </div>

                {/* List View */}
                <div className="lg:col-span-2 space-y-4">
                    <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
                        <div className="p-4 border-b border-slate-100 flex gap-3">
                            <div className="relative flex-1">
                                <Search className="absolute left-3 top-2.5 text-slate-400" size={18} />
                                <input type="text" placeholder="Search readingLogs..." className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl" />
                            </div>
                            <div className="flex items-center gap-2">
                                <select value={filterYear} onChange={(e) => setFilterYear(Number(e.target.value))} className="pl-3 pr-8 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold text-slate-600 outline-none focus:ring-2 focus:ring-blue-500 appearance-none cursor-pointer">
                                    {[2024, 2025, 2026, 2027].map(y => <option key={y} value={y}>{y}</option>)}
                                </select>
                                <select value={filterPeriod} onChange={(e) => setFilterPeriod(e.target.value)} className="pl-3 pr-8 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold text-slate-600 outline-none focus:ring-2 focus:ring-blue-500 appearance-none cursor-pointer">
                                    {periodOptions.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
                                </select>
                            </div>
                        </div>
                        <div className="divide-y divide-slate-50">
                            {filteredLogs.length === 0 ? (
                                <div className="p-12 text-center text-slate-400"><BookOpen size={48} className="mx-auto mb-3 opacity-20" /><p>No reading readingLogs found for this period.</p></div>
                            ) : (
                                filteredLogs.map((log) => (
                                    <div key={log.id} className="p-4 hover:bg-slate-50 transition-colors flex items-start gap-4 group">
                                        <div className={`p-3 rounded-xl transition-colors ${log.status === 'Finished' ? 'bg-green-50 text-green-600' : 'bg-blue-50 text-blue-600'}`}>{log.status === 'Finished' ? <Trophy size={20} /> : <Book size={20} />}</div>
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-2 mb-1"><h3 className="font-semibold text-slate-800 truncate">{log.title}</h3></div>
                                            <p className="text-sm text-slate-500 truncate">{log.category} • {log.location || 'Medan'}</p>
                                            {log.status === 'Finished' && log.hrApprovalStatus === 'Approved' && log.incentiveAmount && (
                                                <div className="mt-1 flex items-center gap-1.5 text-sm font-bold text-green-600 bg-green-50 w-fit px-2 py-1 rounded-lg border border-green-100"><Trophy size={14} className="text-green-500" /><span>Reward: Rp {log.incentiveAmount.toLocaleString('id-ID')}</span></div>
                                            )}
                                            <div className="mt-2 p-2 bg-slate-50 rounded-lg border border-slate-100">
                                                {log.status === 'Finished' ? (
                                                    <div className="space-y-1">
                                                        {log.startDate && log.finishDate && (<div className="flex items-center gap-2 text-xs text-slate-500"><span>Start: {new Date(log.startDate).toLocaleDateString()}</span><span>•</span><span>Finish: {new Date(log.finishDate).toLocaleDateString()}</span></div>)}
                                                        {log.finishDate && (<div className="inline-block mt-1 px-2 py-1 bg-indigo-50 text-indigo-600 text-[10px] font-bold rounded border border-indigo-100 uppercase tracking-wide">Paid In: {new Date(new Date(log.finishDate).getFullYear(), getIncentivePeriod(log.finishDate || '').month).toLocaleString('default', { month: 'long' })}</div>)}
                                                    </div>
                                                ) : (
                                                    <div className="flex items-center gap-2 text-xs"><span className="font-semibold text-orange-600">In Progress</span><span className="text-slate-500">Started: {log.date ? new Date(log.date).toLocaleDateString() : 'Unknown'}</span></div>
                                                )}
                                            </div>
                                        </div>
                                        <div className="flex gap-2 mb-2">
                                            <div className={`px-3 py-1 text-xs font-bold rounded-lg ${log.status === 'Finished' ? 'bg-green-100 text-green-700' : 'bg-orange-100 text-orange-700'}`}>{log.status === 'Finished' ? 'Selesai' : 'Sedang Baca'}</div>
                                            {log.status === 'Finished' && (
                                                <div className="flex flex-col items-end">
                                                    <div className={`px-3 py-1 text-xs font-bold rounded-lg ${log.hrApprovalStatus === 'Approved' ? 'bg-blue-100 text-blue-700' : log.hrApprovalStatus === 'Rejected' ? 'bg-red-100 text-red-700' : 'bg-yellow-100 text-yellow-700'}`}>{log.hrApprovalStatus || 'Waiting HR'}</div>
                                                </div>
                                            )}
                                        </div>
                                        {log.status === 'Reading' && <button onClick={() => openClaimModal(log)} className="px-3 py-1 text-xs font-bold bg-green-100 text-green-700 hover:bg-green-200 rounded-lg border border-green-200">Selesai</button>}
                                        {log.status === 'Reading' && <button onClick={() => handleDelete(log.id)} className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg"><Trash2 size={18} /></button>}
                                    </div>
                                ))
                            )}
                        </div>
                    </div>
                </div>
            </div>

            {/* Claim Modal */}
            {claimModalOpen && (
                <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in">
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg flex flex-col max-h-[90vh]">
                        <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50 rounded-t-2xl">
                            <div><h3 className="text-xl font-bold text-slate-800">{selectedLog ? `Selesaikan: ${selectedLog.title}` : 'Klaim / Lapor Bacaan'}</h3><p className="text-sm text-slate-500">Isi detail untuk verifikasi HR</p></div>
                            <button onClick={() => setClaimModalOpen(false)} className="text-slate-400 hover:text-slate-600"><XCircle size={24} /></button>
                        </div>
                        <div className="px-6 py-2 bg-green-50 border-b border-green-100 flex justify-between items-center">
                            <span className="text-xs text-green-700 font-bold">Lapor via WA (Buku Kantor)</span>
                            <div className="flex gap-2">
                                <button type="button" onClick={() => handleWhatsAppRedirect('!kembalikan_buku')} className="text-xs font-bold text-white bg-green-500 hover:bg-green-600 px-3 py-1.5 rounded-lg flex items-center gap-1.5 shadow-sm transition-colors"><MessageCircle size={14} />!kembalikan_buku</button>
                            </div>
                        </div>

                        <form onSubmit={handleClaimSubmit} className="p-6 space-y-4 overflow-y-auto">
                            {!selectedLog && (
                                <>
                                    <div><label className="block text-sm font-semibold text-slate-700 mb-1">Judul Buku</label><input required value={claimForm.title} onChange={e => setClaimForm({ ...claimForm, title: e.target.value })} className="w-full px-4 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500" placeholder="Judul buku..." /></div>
                                    <div><label className="block text-sm font-semibold text-slate-700 mb-1">Kategori</label><select value={claimForm.category} onChange={e => setClaimForm({ ...claimForm, category: e.target.value })} className="w-full px-4 py-2 border border-slate-200 rounded-xl bg-white" required><option value="">Select Category...</option>{categories.map((cat, idx) => <option key={idx} value={cat}>{cat}</option>)}</select></div>
                                </>
                            )}
                            <div className="grid grid-cols-2 gap-4">
                                <div><label className="block text-sm font-semibold text-slate-700 mb-1">Tgl Mulai</label><input type="date" value={claimForm.startDate} onChange={e => setClaimForm({ ...claimForm, startDate: e.target.value })} className="w-full px-4 py-2 border border-slate-200 rounded-xl" /></div>
                                <div><label className="block text-sm font-semibold text-slate-700 mb-1">Tgl Selesai</label><input type="date" required value={claimForm.finishDate} onChange={e => setClaimForm({ ...claimForm, finishDate: e.target.value })} className="w-full px-4 py-2 border border-slate-200 rounded-xl" /></div>
                            </div>
                            <div>
                                <label className="block text-sm font-semibold text-slate-700 mb-1">Link Review</label>
                                <input type="url" required value={claimForm.link} onChange={e => setClaimForm({ ...claimForm, link: e.target.value })} className="w-full px-4 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500" placeholder="Link reviews/rangkuman..." />
                            </div>
                            <div>
                                <label className="block text-sm font-semibold text-slate-700 mb-1">Bukti Foto Pengembalian</label>
                                <div className="space-y-3">
                                    <div className="border-2 border-dashed border-slate-300 rounded-xl p-4 text-center hover:bg-slate-50 transition-colors relative">
                                        <input type="file" onChange={(e) => handleFileChange(e, 'claimFinish')} className="absolute inset-0 opacity-0 cursor-pointer" accept="image/*" />
                                        {claimForm.evidenceUrl ? (<div className="flex items-center justify-center gap-2 text-green-600 font-bold"><CheckCircle size={18} /> Foto Terupload</div>) : (<span className="text-slate-500 text-sm">Klik untuk upload bukti</span>)}
                                    </div>
                                    {claimForm.evidenceUrl && (
                                        <div className="relative w-full h-48 rounded-xl overflow-hidden border border-slate-200 shadow-sm group">
                                            <img src={`${API_BASE_URL}${claimForm.evidenceUrl}`} alt="Evidence" className="w-full h-full object-cover" />
                                            <button type="button" onClick={() => setClaimForm(prev => ({ ...prev, evidenceUrl: '' }))} className="absolute top-2 right-2 bg-red-500 text-white p-1.5 rounded-full opacity-0 group-hover:opacity-100 transition-opacity shadow-lg"><XCircle size={16} /></button>
                                        </div>
                                    )}
                                </div>
                            </div>
                            <div className="pt-4 flex gap-3">
                                <button type="button" onClick={() => setClaimModalOpen(false)} className="flex-1 px-4 py-3 bg-slate-100 text-slate-600 font-bold rounded-xl hover:bg-slate-200">Cancel</button>
                                <button type="submit" disabled={isLoading} className="flex-1 px-4 py-3 bg-green-600 text-white font-bold rounded-xl hover:bg-green-700 shadow-lg shadow-green-200">{isLoading ? 'Sending...' : 'Klaim / Lapor'}</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            <ConfirmationModal isOpen={confirmConfig.isOpen} onClose={() => setConfirmConfig({ ...confirmConfig, isOpen: false })} onConfirm={confirmConfig.onConfirm} title={confirmConfig.title} message={confirmConfig.message} confirmText="Yes, Delete" variant="danger" />
        </div>
    );
};

export default ReadingLogPage;
