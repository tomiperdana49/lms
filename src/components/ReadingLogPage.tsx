import { useState, useEffect, type ChangeEvent, type FormEvent } from 'react';
import { BookOpen, ArrowLeft, Search, Book, Trophy, Trash2, XCircle, CheckCircle, Upload, AlertCircle } from 'lucide-react';
import { API_BASE_URL } from '../config';
import type { ReadingLogEntry, User } from '../types';
import PopupNotification from './PopupNotification';
import ConfirmationModal from './ConfirmationModal';

interface ReadingLogPageProps {
    user: User;
    onBack: () => void;
}

const getFullImageUrl = (path: string) => {
    if (!path) return '';
    if (path.startsWith('http')) return path;
    const cleanPath = path.startsWith('/') ? path.slice(1) : path;
    return `${API_BASE_URL}/${cleanPath}`;
};

const ReadingLogPage = ({ user, onBack }: ReadingLogPageProps) => {
    const [readingLogs, setReadingLogs] = useState<ReadingLogEntry[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [yearReadCount, setYearReadCount] = useState(0);

    const [privateReportForm, setPrivateReportForm] = useState({
        title: '',
        category: '',
        startDate: '',
        finishDate: '',
        link: '',
        evidenceUrl: ''
    });

    const [claimModalOpen, setClaimModalOpen] = useState(false);
    const [claimForm, setClaimForm] = useState({
        title: '',
        category: '',
        startDate: '',
        finishDate: '',
        link: '',
        evidenceUrl: ''
    });

    const [detailModalOpen, setDetailModalOpen] = useState(false);
    const [viewLog, setViewLog] = useState<ReadingLogEntry | null>(null);
    const [selectedLog, setSelectedLog] = useState<ReadingLogEntry | null>(null);

    const [notification, setNotification] = useState<{ show: boolean, type: 'success' | 'error', message: string }>({ show: false, type: 'success', message: '' });
    const [confirmConfig, setConfirmConfig] = useState<{
        isOpen: boolean;
        title: string;
        message: string;
        onConfirm: () => void;
        variant?: 'danger' | 'warning' | 'info' | 'success';
        confirmText?: string;
        cancelText?: string;
        hideConfirm?: boolean;
    }>({ isOpen: false, title: '', message: '', onConfirm: () => { } });

    const openConfirm = (title: string, message: string, onConfirm: () => void = () => { }, confirmText = 'Yes, Delete', variant: 'danger' | 'warning' | 'info' | 'success' = 'danger', cancelText = 'Cancel', hideConfirm = false) => {
        setConfirmConfig({ isOpen: true, title, message, onConfirm, confirmText, variant, cancelText, hideConfirm });
    };

    const fetchLogs = async () => {
        try {
            // First trigger sync to backend
            await fetch(`${API_BASE_URL}/api/simas/sync`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ employee_id: user.employee_id, user_name: user.name })
            }).catch(e => console.error(e));

            // Then fetch all logs from local DB
            const resLogs = await fetch(`${API_BASE_URL}/api/logs`);
            
            let myLogs: ReadingLogEntry[] = [];

            if (resLogs && resLogs.ok) {
                const data = await resLogs.json();
                myLogs = data.filter((log: ReadingLogEntry) =>
                    (!!log.employee_id && !!user.employee_id && log.employee_id === user.employee_id) ||
                    (!log.employee_id && log.userName === user.name)
                );
            }

            myLogs.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
            setReadingLogs(myLogs);

            // Yearly count
            const currentYear = new Date().getFullYear();
            const thisYearLogs = myLogs.filter((log: ReadingLogEntry) =>
                new Date(log.date).getFullYear() === currentYear && log.status === 'Finished'
            );
            setYearReadCount(thisYearLogs.length);
        } catch (error) {
            console.error("Failed to fetch logs", error);
        }
    };

    useEffect(() => {
        fetchLogs();
    }, [user.name, user.employee_id]);

    const openDetailModal = (log: ReadingLogEntry) => {
        setViewLog(log);
        setDetailModalOpen(true);
    };

    const handleDelete = async (id: number | string) => {
        openConfirm('Hapus Laporan', 'Apakah Anda yakin ingin menghapus laporan bacaan ini secara permanen? Tindakan ini tidak dapat dibatalkan.', async () => {
            try {
                const res = await fetch(`${API_BASE_URL}/api/logs/${id}`, { method: 'DELETE' });
                if (res.ok) {
                    setReadingLogs(readingLogs.filter(l => l.id !== id));
                    setNotification({ show: true, type: 'success', message: "Laporan berhasil dihapus." });
                }
            } catch (err) {
                console.error("Failed to delete log", err);
                setNotification({ show: true, type: 'error', message: "Failed to delete log." });
            }
        });
    };

    const handleClaimIncentive = async (id: number | string) => {
        setIsLoading(true);
        try {
            const res = await fetch(`${API_BASE_URL}/api/logs/${id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ hrApprovalStatus: 'Pending' })
            });
            if (res.ok) {
                setReadingLogs(readingLogs.map(l => l.id === id ? { ...l, hrApprovalStatus: 'Pending' } : l));
                setNotification({ show: true, type: 'success', message: 'Klaim insentif berhasil dikirim ke HRD!' });
            } else {
                setNotification({ show: true, type: 'error', message: 'Gagal mengirim klaim.' });
            }
        } catch (err) {
            console.error(err);
            setNotification({ show: true, type: 'error', message: 'Gagal terhubung ke server.' });
        } finally {
            setIsLoading(false);
        }
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
    const [filterStatus, setFilterStatus] = useState('all'); // 'all', 'Reading', 'Approved', 'Pending'
    const [searchQuery, setSearchQuery] = useState('');
    const [currentPage, setCurrentPage] = useState(1);
    const ITEMS_PER_PAGE = 5;

    useEffect(() => {
        setCurrentPage(1);
    }, [filterYear, filterPeriod, searchQuery, filterStatus]);

    const periodOptions = [
        { label: 'All Year', value: 'all' },
        ...[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11].map(m => ({
            label: new Date(2024, m, 1).toLocaleString('default', { month: 'long' }),
            value: String(m)
        }))
    ];

    const filteredLogs = readingLogs.filter(log => {
        if (!log.date) return false;
        if (searchQuery && !log.title.toLowerCase().includes(searchQuery.toLowerCase())) return false;

        // Status Filter
        if (filterStatus === 'Reading') {
            if (log.status !== filterStatus) return false;
        } else if (filterStatus === 'Approved') {
            if (log.hrApprovalStatus !== 'Approved') return false;
        } else if (filterStatus === 'Pending') {
            if (log.status !== 'Finished' || log.hrApprovalStatus !== 'Pending') return false;
        }

        // Date/Period Filter
        const period = getIncentivePeriod(log.finishDate || log.date || '');
        if (period.year !== filterYear) return false;
        if (filterPeriod === 'all') return true;
        return period.month === parseInt(filterPeriod);
    });

    const totalPages = Math.ceil(filteredLogs.length / ITEMS_PER_PAGE);
    const paginatedLogs = filteredLogs.slice((currentPage - 1) * ITEMS_PER_PAGE, currentPage * ITEMS_PER_PAGE);

    const submitPrivateReportData = async () => {
        setIsLoading(true);
        const { title, category, startDate, finishDate, link, evidenceUrl } = privateReportForm;
        try {
            const res = await fetch(`${API_BASE_URL}/api/logs`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    title, category, startDate: new Date(startDate), finishDate: new Date(finishDate),
                    link: link, review: '-', evidenceUrl, status: 'Finished', hrApprovalStatus: 'Draft',
                    location: 'Pribadi', source: 'Buku Pribadi', userName: user.name, employee_id: user.employee_id, date: new Date()
                })
            });

            if (res.ok) {
                const savedLog = await res.json();
                setReadingLogs([savedLog, ...readingLogs]);
                setPrivateReportForm({ title: '', category: '', startDate: '', finishDate: '', link: '', evidenceUrl: '' });
                setYearReadCount(prev => prev + 1);
                window.location.reload();
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

    const handlePrivateReportSubmit = async (e: FormEvent) => {
        e.preventDefault();
        const { title, category, startDate, finishDate, evidenceUrl } = privateReportForm;

        if (!title || !category || !startDate || !finishDate || !evidenceUrl) {
            setNotification({ show: true, type: 'error', message: 'Mohon lengkapi semua field wajib: Judul, Kategori, Tgl Mulai/Selesai, dan Bukti Foto.' });
            return;
        }

        const start = new Date(startDate).getTime();
        const end = new Date(finishDate).getTime();
        const diffDays = Math.abs(end - start) / (1000 * 60 * 60 * 24);

        if (diffDays <= 1) {
            openConfirm(
                'Konfirmasi Waktu Baca',
                'Jarak Awal Baca dan Akhir Baca sangat singkat (0-1 hari).',
                () => { },
                '',
                'warning',
                'OK',
                true
            );
            return;
        }

        submitPrivateReportData();
    };

    const openClaimModal = (logToFinish?: ReadingLogEntry) => {
        if (logToFinish) {
            setSelectedLog(logToFinish);
            setClaimForm({
                title: logToFinish.title,
                category: logToFinish.category,
                startDate: logToFinish.startDate ? new Date(new Date(logToFinish.startDate).getTime() - (new Date().getTimezoneOffset() * 60000)).toISOString().slice(0, 16) : (logToFinish.date ? new Date(new Date(logToFinish.date).getTime() - (new Date().getTimezoneOffset() * 60000)).toISOString().slice(0, 16) : ''),
                finishDate: new Date(new Date().getTime() - (new Date().getTimezoneOffset() * 60000)).toISOString().slice(0, 16),
                link: '',
                evidenceUrl: ''
            });
        } else {
            setSelectedLog(null);
            setClaimForm({
                title: '', category: '', startDate: '', finishDate: '',
                link: '', evidenceUrl: ''
            });
        }
        setClaimModalOpen(true);
    };

    const submitClaimData = async () => {
        setIsLoading(true);
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
                window.location.reload();
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

    const handleClaimSubmit = async (e: FormEvent) => {
        e.preventDefault();

        if (!claimForm.evidenceUrl || !claimForm.startDate || !claimForm.finishDate || !claimForm.link) {
            setNotification({ show: true, type: 'error', message: 'Mohon lengkapi semua field wajib: Tgl Mulai, Tgl Selesai, Bukti Foto, dan Link Review.' });
            return;
        }

        const start = new Date(claimForm.startDate).getTime();
        const end = new Date(claimForm.finishDate).getTime();
        const diffDays = Math.abs(end - start) / (1000 * 60 * 60 * 24);

        if (diffDays <= 1) {
            openConfirm(
                'Konfirmasi Waktu Baca',
                'Jarak Awal Baca dan Akhir Baca sangat singkat (0-1 hari).',
                () => { },
                '',
                'warning',
                'OK',
                true
            );
            return;
        }

        submitClaimData();
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
                                <label className="block text-sm font-semibold text-slate-700 mb-1">Judul Buku <span className="text-red-500">*</span></label>
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
                                <div><label className="block text-xs font-bold text-slate-500 mb-1 uppercase">Awal Baca <span className="text-red-500">*</span></label><input type="date" required value={privateReportForm.startDate} onChange={e => setPrivateReportForm({ ...privateReportForm, startDate: e.target.value })} className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm" /></div>
                                <div><label className="block text-xs font-bold text-slate-500 mb-1 uppercase">Akhir Baca <span className="text-red-500">*</span></label><input type="date" required value={privateReportForm.finishDate} onChange={e => setPrivateReportForm({ ...privateReportForm, finishDate: e.target.value })} className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm" /></div>
                            </div>
                            <div>
                                <label className="block text-sm font-semibold text-slate-700 mb-1">Link Review</label>
                                <input type="url" value={privateReportForm.link} onChange={e => setPrivateReportForm({ ...privateReportForm, link: e.target.value })} className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-blue-500" placeholder="Goodreads / GDrive link..." />
                            </div>
                            <div>
                                <label className="block text-sm font-bold text-slate-500 mb-1 uppercase text-xs">Bukti Foto Cover <span className="text-red-500">*</span></label>
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
                                            <img src={getFullImageUrl(privateReportForm.evidenceUrl)} alt="Evidence" className="w-full h-full object-cover" />
                                            <button type="button" onClick={() => setPrivateReportForm(prev => ({ ...prev, evidenceUrl: '' }))} className="absolute top-2 right-2 bg-red-500 text-white p-1.5 rounded-full opacity-0 group-hover:opacity-100 transition-opacity shadow-lg"><XCircle size={16} /></button>
                                        </div>
                                    )}
                                </div>
                            </div>
                            <button type="submit" disabled={isLoading} className="w-full px-4 py-3 rounded-xl font-bold shadow-lg transition-all flex items-center justify-center gap-2 text-white bg-purple-600 hover:bg-purple-700 hover:shadow-purple-200">{isLoading ? 'Saving...' : 'Save'}</button>
                        </form>
                    </div>
                </div>

                {/* List View */}
                <div className="lg:col-span-2 space-y-4">
                    <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
                        <div className="p-4 border-b border-slate-100 flex gap-3">
                            <div className="relative flex-1">
                                <Search className="absolute left-3 top-2.5 text-slate-400" size={18} />
                                <input type="text" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder="Search readingLogs..." className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500" />
                            </div>
                            <div className="flex items-center gap-2">
                                <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} className="pl-3 pr-8 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold text-slate-600 outline-none focus:ring-2 focus:ring-blue-500 appearance-none cursor-pointer">
                                    <option value="all">All Status</option>
                                    <option value="Reading">Sedang Baca</option>
                                    <option value="Approved">Approved</option>
                                    <option value="Pending">Inprogress</option>
                                </select>
                                <select value={filterYear} onChange={(e) => setFilterYear(Number(e.target.value))} className="pl-3 pr-8 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold text-slate-600 outline-none focus:ring-2 focus:ring-blue-500 appearance-none cursor-pointer">
                                    {[2024, 2025, 2026, 2027].map(y => <option key={y} value={y}>{y}</option>)}
                                </select>
                                <select value={filterPeriod} onChange={(e) => setFilterPeriod(e.target.value)} className="pl-3 pr-8 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold text-slate-600 outline-none focus:ring-2 focus:ring-blue-500 appearance-none cursor-pointer">
                                    {periodOptions.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
                                </select>
                            </div>
                        </div>
                        <div className="divide-y divide-slate-50">
                            {paginatedLogs.length === 0 ? (
                                <div className="p-12 text-center text-slate-400"><BookOpen size={48} className="mx-auto mb-3 opacity-20" /><p>No reading readingLogs found for this period.</p></div>
                            ) : (
                                paginatedLogs.map((log) => {
                                    const isMyLog = (!!log.employee_id && !!user.employee_id && log.employee_id === user.employee_id) || (!log.employee_id && log.userName === user.name);
                                    return (
                                        <div key={log.id} className="p-4 hover:bg-slate-50 transition-colors flex items-start gap-4 group">
                                            <div className={`p-3 rounded-xl transition-colors ${log.status === 'Finished' ? 'bg-green-50 text-green-600' : 'bg-blue-50 text-blue-600'}`}>{log.status === 'Finished' ? <Trophy size={20} /> : <Book size={20} />}</div>
                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-center gap-2 mb-1">
                                                    <h3 onClick={() => openDetailModal(log)} className="font-semibold text-slate-800 truncate cursor-pointer hover:text-blue-600 transition-colors" title="Lihat Detail">{log.title}</h3>
                                                    {(user.role === 'HR' || user.role === 'HR_ADMIN') && (
                                                        <span className="text-[10px] bg-purple-100 text-purple-700 font-bold px-2 py-0.5 rounded-md truncate max-w-[120px]">
                                                            {log.userName}
                                                        </span>
                                                    )}
                                                </div>
                                                <p className="text-sm text-slate-500 truncate">{log.category} • {log.location || 'Medan'}</p>
                                                {log.status === 'Finished' && log.hrApprovalStatus === 'Approved' && log.incentiveAmount && (
                                                    <div className="mt-1 flex items-center gap-1.5 text-sm font-bold text-green-600 bg-green-50 w-fit px-2 py-1 rounded-lg border border-green-100"><Trophy size={14} className="text-green-500" /><span>Reward: Rp {log.incentiveAmount.toLocaleString('id-ID')}</span></div>
                                                )}
                                                <div className="mt-2 p-2 bg-slate-50 rounded-lg border border-slate-100">
                                                    {log.status === 'Finished' ? (
                                                        <div className="space-y-1">
                                                            {log.startDate && log.finishDate && (<div className="flex items-center gap-2 text-xs text-slate-500"><span>Start: {new Date(log.startDate).toLocaleDateString()}</span><span>•</span><span>Finish: {new Date(log.finishDate).toLocaleDateString()}</span></div>)}
                                                            {log.finishDate && (
                                                                <div className={`inline-block mt-1 px-2 py-1 text-[10px] font-bold rounded border uppercase tracking-wide ${log.hrApprovalStatus === 'Approved' ? 'bg-indigo-50 text-indigo-600 border-indigo-100' : 'bg-slate-100 text-slate-500 border-slate-200'}`}>
                                                                    {log.hrApprovalStatus === 'Approved' ? `Paid In: ${new Date(new Date(log.finishDate).getFullYear(), getIncentivePeriod(log.finishDate || '').month).toLocaleString('default', { month: 'long' })}` : log.hrApprovalStatus === 'Draft' ? '-' : 'inprogress insentive'}
                                                                </div>
                                                            )}
                                                        </div>
                                                    ) : (
                                                        <div className="flex items-center gap-2 text-xs"><span className="font-semibold text-orange-600">In Progress</span><span className="text-slate-500">Started: {log.date ? new Date(log.date).toLocaleDateString() : 'Unknown'}</span></div>
                                                    )}
                                                </div>
                                            </div>
                                            <div className="flex gap-2 mb-2">
                                                {log.status === 'Finished' && !log.hrApprovalStatus && (
                                                    <div className="px-3 py-1 text-xs font-bold rounded-lg bg-green-100 text-green-700">Selesai</div>
                                                )}
                                                {log.status === 'Finished' && (
                                                    <div className="flex flex-col items-end">
                                                        {log.hrApprovalStatus === 'Draft' ? (
                                                            <button
                                                                onClick={(e) => { e.stopPropagation(); handleClaimIncentive(log.id); }}
                                                                className="px-4 py-1.5 text-xs font-bold rounded-xl bg-purple-600 text-white hover:bg-purple-700 transition-all shadow-md"
                                                                title="Klik untuk kirim klaim ke HRD"
                                                            >
                                                                Klaim Insentif
                                                            </button>
                                                        ) : (
                                                            <div className={`px-3 py-1 text-xs font-bold rounded-lg ${log.hrApprovalStatus === 'Approved' ? 'bg-blue-100 text-blue-700' : log.hrApprovalStatus === 'Rejected' ? 'bg-red-100 text-red-700' : 'bg-yellow-100 text-yellow-700'}`}>
                                                                {log.hrApprovalStatus === 'Pending' ? 'inprogress insentive' : (log.hrApprovalStatus || 'Waiting HR')}
                                                            </div>
                                                        )}
                                                    </div>
                                                )}
                                                {/* HR Actions removed */}
                                            </div>
                                            {isMyLog && log.status === 'Reading' && <button onClick={() => openClaimModal(log)} className="px-3 py-1 text-xs font-bold bg-green-100 text-green-700 hover:bg-green-200 rounded-lg border border-green-200">Selesai</button>}
                                            {isMyLog && (log.status === 'Reading' || log.hrApprovalStatus === 'Draft') && <button onClick={() => handleDelete(log.id)} className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg"><Trash2 size={18} /></button>}
                                        </div>
                                    );
                                })
                            )}
                        </div>
                        {totalPages > 1 && (
                            <div className="p-4 border-t border-slate-100 flex justify-between items-center bg-slate-50/50">
                                <span className="text-sm text-slate-500">
                                    Showing {(currentPage - 1) * ITEMS_PER_PAGE + 1} to {Math.min(currentPage * ITEMS_PER_PAGE, filteredLogs.length)} of {filteredLogs.length} entries
                                </span>
                                <div className="flex gap-1 overflow-x-auto">
                                    <button onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage === 1} className="px-3 py-1 border border-slate-200 rounded-lg text-sm font-medium hover:bg-white disabled:opacity-50 disabled:cursor-not-allowed">Prev</button>
                                    {[...Array(totalPages)].map((_, i) => (
                                        <button key={i} onClick={() => setCurrentPage(i + 1)} className={`px-3 py-1 border rounded-lg text-sm font-medium ${currentPage === i + 1 ? 'bg-blue-600 text-white border-blue-600' : 'border-slate-200 hover:bg-white text-slate-600'}`}>{i + 1}</button>
                                    ))}
                                    <button onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages} className="px-3 py-1 border border-slate-200 rounded-lg text-sm font-medium hover:bg-white disabled:opacity-50 disabled:cursor-not-allowed">Next</button>
                                </div>
                            </div>
                        )}
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


                        <form onSubmit={handleClaimSubmit} className="p-6 space-y-4 overflow-y-auto">
                            {!selectedLog && (
                                <>
                                    <div><label className="block text-sm font-semibold text-slate-700 mb-1">Judul Buku <span className="text-red-500">*</span></label><input required value={claimForm.title} onChange={e => setClaimForm({ ...claimForm, title: e.target.value })} className="w-full px-4 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500" placeholder="Judul buku..." /></div>
                                    <div><label className="block text-sm font-semibold text-slate-700 mb-1">Kategori</label><select value={claimForm.category} onChange={e => setClaimForm({ ...claimForm, category: e.target.value })} className="w-full px-4 py-2 border border-slate-200 rounded-xl bg-white" required><option value="">Select Category...</option>{categories.map((cat, idx) => <option key={idx} value={cat}>{cat}</option>)}</select></div>
                                </>
                            )}
                            <div className="grid grid-cols-2 gap-4">
                                <div><label className="block text-sm font-semibold text-slate-700 mb-1">Tgl Mulai <span className="text-red-500">*</span></label><input type="datetime-local" required disabled={!!selectedLog} value={claimForm.startDate} onChange={e => setClaimForm({ ...claimForm, startDate: e.target.value })} className={`w-full px-4 py-2 border border-slate-200 rounded-xl ${!!selectedLog ? 'bg-slate-100 text-slate-500 cursor-not-allowed' : ''}`} /></div>
                                <div><label className="block text-sm font-semibold text-slate-700 mb-1">Tgl Selesai <span className="text-red-500">*</span></label><input type="datetime-local" required value={claimForm.finishDate} onChange={e => setClaimForm({ ...claimForm, finishDate: e.target.value })} className="w-full px-4 py-2 border border-slate-200 rounded-xl" /></div>
                            </div>
                            <div>
                                <label className="block text-sm font-semibold text-slate-700 mb-1">Link Review <span className="text-red-500">*</span></label>
                                <input type="url" required value={claimForm.link} onChange={e => setClaimForm({ ...claimForm, link: e.target.value })} className="w-full px-4 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500" placeholder="Link reviews/rangkuman..." />
                            </div>
                            <div>
                                <label className="block text-sm font-semibold text-slate-700 mb-1">Bukti Foto Pengembalian <span className="text-red-500">*</span></label>
                                <div className="space-y-3">
                                    <div className="border-2 border-dashed border-slate-300 rounded-xl p-4 text-center hover:bg-slate-50 transition-colors relative">
                                        <input type="file" onChange={(e) => handleFileChange(e, 'claimFinish')} className="absolute inset-0 opacity-0 cursor-pointer" accept="image/*" />
                                        {claimForm.evidenceUrl ? (<div className="flex items-center justify-center gap-2 text-green-600 font-bold"><CheckCircle size={18} /> Foto Terupload</div>) : (<span className="text-slate-500 text-sm">Klik untuk upload bukti</span>)}
                                    </div>
                                    {claimForm.evidenceUrl && (
                                        <div className="relative w-full h-48 rounded-xl overflow-hidden border border-slate-200 shadow-sm group">
                                            <img src={getFullImageUrl(claimForm.evidenceUrl)} alt="Evidence" className="w-full h-full object-cover" />
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

            {/* Detail Modal */}
            {detailModalOpen && viewLog && (
                <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in" onClick={() => setDetailModalOpen(false)}>
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md flex flex-col max-h-[90vh] overflow-hidden" onClick={e => e.stopPropagation()}>
                        <div className="p-6 border-b border-slate-100 flex justify-between items-start bg-slate-50">
                            <div className="pr-4">
                                <h3 className="text-xl font-bold text-slate-800 break-words">{viewLog.title}</h3>
                                <div className="flex items-center gap-2 mt-1">
                                    <p className="text-sm text-slate-500">{viewLog.category} • {viewLog.location === 'Pribadi' || viewLog.source === 'Buku Pribadi' ? 'Pribadi' : (viewLog.location || 'Medan')}</p>
                                    {(viewLog.source === 'Buku Pribadi' || viewLog.location === 'Pribadi') && (
                                        <span className="px-2 py-0.5 bg-purple-100 text-purple-700 text-[10px] font-bold rounded-md uppercase tracking-wider">Bacaan Pribadi</span>
                                    )}
                                </div>
                            </div>
                            <button onClick={() => setDetailModalOpen(false)} className="text-slate-400 hover:text-slate-600 flex-shrink-0 mt-1"><XCircle size={24} /></button>
                        </div>
                        <div className="p-6 overflow-y-auto space-y-5">
                            <div className={`grid gap-4 ${viewLog.status === 'Finished' ? 'grid-cols-2' : 'grid-cols-1'}`}>
                                <div className="bg-slate-50 p-3 rounded-xl border border-slate-100">
                                    <div className="text-xs text-slate-500 font-bold uppercase mb-1">Status</div>
                                    <div className={`font-semibold ${viewLog.status === 'Finished' ? 'text-green-600' : 'text-orange-600'}`}>{viewLog.status === 'Finished' ? 'Selesai' : 'Sedang Baca'}</div>
                                </div>
                                {viewLog.status === 'Finished' && (
                                    <div className="bg-slate-50 p-3 rounded-xl border border-slate-100">
                                        <div className="text-xs text-slate-500 font-bold uppercase mb-1">Approval HR</div>
                                        <div className={`font-semibold ${viewLog.hrApprovalStatus === 'Approved' ? 'text-blue-600' : viewLog.hrApprovalStatus === 'Rejected' ? 'text-red-500' : 'text-slate-400'}`}>
                                            {viewLog.hrApprovalStatus === 'Approved' ? 'Approved' : (viewLog.hrApprovalStatus === 'Pending' || !viewLog.hrApprovalStatus ? 'inprogress insentive' : viewLog.hrApprovalStatus === 'Draft' ? '-' : viewLog.hrApprovalStatus === 'Rejected' ? 'Rejected' : viewLog.hrApprovalStatus)}
                                        </div>
                                    </div>
                                )}
                            </div>

                            {viewLog.hrApprovalStatus === 'Rejected' && viewLog.rejectionReason && (
                                <div className="bg-red-50 p-4 rounded-xl border border-red-100 mb-4 animate-in slide-in-from-top-2 duration-300">
                                    <div className="text-xs text-red-600 font-bold uppercase mb-1 flex items-center gap-1.5">
                                        <AlertCircle size={14} /> Rejection Note
                                    </div>
                                    <div className="text-sm text-red-800 font-medium italic">
                                        "{viewLog.rejectionReason}"
                                    </div>
                                </div>
                            )}

                            <div className="space-y-3">
                                <div className="flex justify-between text-sm py-2 border-b border-slate-50">
                                    <span className="text-slate-500">Tanggal Pinjam / Mulai</span>
                                    <span className="font-semibold text-slate-700">
                                        {viewLog.startDate
                                            ? new Date(viewLog.startDate).toLocaleString('id-ID', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })
                                            : (viewLog.date ? new Date(viewLog.date).toLocaleString('id-ID', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '-')}
                                    </span>
                                </div>

                                {viewLog.status === 'Finished' && (
                                    <div className="flex justify-between text-sm py-2 border-b border-slate-50">
                                        <span className="text-slate-500">Tanggal Kembali / Selesai</span>
                                        <span className="font-semibold text-slate-700">
                                            {viewLog.finishDate ? new Date(viewLog.finishDate).toLocaleString('id-ID', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '-'}
                                        </span>
                                    </div>
                                )}
                                {viewLog.sn && (
                                    <div className="flex justify-between text-sm py-2 border-b border-slate-50">
                                        <span className="text-slate-500">Serial Number (SN)</span>
                                        <span className="font-semibold text-blue-600 font-mono">{viewLog.sn}</span>
                                    </div>
                                )}
                                {viewLog.approvedBy && (
                                    <div className="flex justify-between text-sm py-2 border-b border-slate-50">
                                        <span className="text-slate-500">Approved by</span>
                                        <span className="font-semibold text-blue-600">{viewLog.approvedBy}</span>
                                    </div>
                                )}
                                {viewLog.approvedAt && (
                                    <div className="flex justify-between text-sm py-2 border-b border-slate-50">
                                        <span className="text-slate-500">Approved time</span>
                                        <span className="font-semibold text-slate-700">
                                            {new Date(viewLog.approvedAt).toLocaleString('id-ID', {
                                                day: 'numeric',
                                                month: 'long',
                                                year: 'numeric',
                                                hour: '2-digit',
                                                minute: '2-digit'
                                            })}
                                        </span>
                                    </div>
                                )}
                                {viewLog.link && (
                                    <div className="flex items-start gap-3 p-3 bg-slate-50 rounded-xl border border-slate-100">
                                        <div className="text-sm text-slate-500 font-medium whitespace-nowrap pt-0.5">Link Review</div>
                                        <a href={viewLog.link} target="_blank" rel="noopener noreferrer" className="text-sm font-bold text-blue-600 break-all hover:underline">{viewLog.link}</a>
                                    </div>
                                )}
                            </div>



                            {viewLog.evidenceUrl && (
                                <div>
                                    <div className="flex justify-between items-center mb-2">
                                        <div className="text-xs text-slate-500 font-bold uppercase">
                                            {viewLog.source === 'SIMAS' ? 'Bukti Foto Pinjaman' : 'Bukti Foto'}
                                        </div>
                                    </div>
                                    <div className="rounded-xl overflow-hidden border border-slate-200 shadow-sm bg-slate-50">
                                        <img src={getFullImageUrl(viewLog.evidenceUrl)} alt="Bukti Pinjam" className="w-auto h-auto mx-auto object-contain max-h-60" />
                                    </div>
                                </div>
                            )}

                            {viewLog.returnEvidenceUrl && (
                                <div className="pt-2">
                                    <div className="flex justify-between items-center mb-2">
                                        <div className="text-xs text-slate-500 font-bold uppercase">Bukti Foto Pengembalian</div>
                                    </div>
                                    <div className="rounded-xl overflow-hidden border border-slate-200 shadow-sm bg-slate-50">
                                        <img src={getFullImageUrl(viewLog.returnEvidenceUrl)} alt="Bukti Kembali" className="w-auto h-auto mx-auto object-contain max-h-60" />
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}

            <ConfirmationModal
                isOpen={confirmConfig.isOpen}
                onClose={() => setConfirmConfig({ ...confirmConfig, isOpen: false })}
                onConfirm={confirmConfig.onConfirm}
                title={confirmConfig.title}
                message={confirmConfig.message}
                confirmText={confirmConfig.confirmText || "Yes, Delete"}
                cancelText={confirmConfig.cancelText || "Cancel"}
                variant={confirmConfig.variant || "danger"}
                hideConfirm={confirmConfig.hideConfirm || false}
            />
        </div>
    );
};

export default ReadingLogPage;
