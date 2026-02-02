import { useState, useEffect, type ChangeEvent, type FormEvent } from 'react';
import { BookOpen, ArrowLeft, Search, Book, Trophy, Trash2, XCircle } from 'lucide-react';
import { API_BASE_URL } from '../config';
import type { ReadingLogEntry } from '../types';
import PopupNotification from './PopupNotification';
import ConfirmationModal from './ConfirmationModal';

interface ReadingLogPageProps {
    user: { name: string; email: string };
    onBack: () => void;
}

const ReadingLogPage = ({ user, onBack }: ReadingLogPageProps) => {
    const [logs, setLogs] = useState<ReadingLogEntry[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [notification, setNotification] = useState<{ show: boolean; type: 'success' | 'error'; message: string }>({ show: false, type: 'success', message: '' });

    // --- Stats State ---
    const [yearReadCount, setYearReadCount] = useState(0);

    // --- Autocomplete State ---
    interface BookData {
        title: string;
        category: string;
        location?: string;
    }

    const [suggestions, setSuggestions] = useState<BookData[]>([]);
    const [showSuggestions, setShowSuggestions] = useState(false);
    const [bookDatabase, setBookDatabase] = useState<BookData[]>([]); // Dynamic book list
    const [selectedLog, setSelectedLog] = useState<ReadingLogEntry | null>(null);

    // --- Form State ---
    const [startFormData, setStartFormData] = useState({
        title: '',
        category: '',
        location: '',
        source: '',
        evidenceUrl: '' // For start evidence if needed, though usually finish has evidence
    });

    const [finishFormData, setFinishFormData] = useState({
        link: '',
        review: '',
        duration: 0,
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
        // Fetch Books
        fetch(`${API_BASE_URL}/api/books`)
            .then(res => res.json())
            .then(data => setBookDatabase(data))
            .catch(err => console.error("Failed to load book database", err));

        // Fetch Logs
        fetch(`${API_BASE_URL}/api/logs`)
            .then(res => res.json())
            .then(data => {
                const userLogs = data.filter((log: ReadingLogEntry) => log.userName === user.name);
                setLogs(userLogs);

                // Calculate This Year's Completed Books
                const currentYear = new Date().getFullYear();
                const isValidDate = (d: string) => { const dt = new Date(d); return !isNaN(dt.getTime()); };

                const count = userLogs.filter((log: ReadingLogEntry) =>
                    log.status === 'Finished' && isValidDate(log.date) && new Date(log.date).getFullYear() === currentYear
                ).length;
                setYearReadCount(count);
            })
            .catch(err => console.error("Failed to fetch logs", err));
    }, [user.name]);

    // Click outside handler for suggestions
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            const target = event.target as HTMLElement;
            if (!target.closest('.suggestions-container')) {
                setShowSuggestions(false);
            }
        };

        if (showSuggestions) {
            document.addEventListener('mousedown', handleClickOutside);
            return () => {
                document.removeEventListener('mousedown', handleClickOutside);
            };
        }
    }, [showSuggestions]);

    const handleDelete = (id: number) => {
        openConfirm('Delete Log', 'Are you sure you want to delete this log?', async () => {
            try {
                const res = await fetch(`${API_BASE_URL}/api/logs/${id}`, { method: 'DELETE' });
                if (res.ok) {
                    setLogs(logs.filter(log => log.id !== id));
                    if (selectedLog?.id === id) {
                        setSelectedLog(null);
                    }
                    setNotification({ show: true, type: 'success', message: "Log deleted successfully." });
                }
            } catch (err) {
                console.error("Failed to delete log", err);
                setNotification({ show: true, type: 'error', message: "Failed to delete log." });
            }
        });
    };

    const handleFileChange = async (e: ChangeEvent<HTMLInputElement>, isFinishForm: boolean) => {
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
                    if (isFinishForm) {
                        setFinishFormData(prev => ({ ...prev, evidenceUrl: result.fileUrl }));
                    } else {
                        setStartFormData(prev => ({ ...prev, evidenceUrl: result.fileUrl }));
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

    // --- Stats Helpers ---
    const totalReadingDuration = logs.reduce((acc, log) => acc + (log.duration || 0), 0);
    const formatDuration = (mins: number) => {
        const h = Math.floor(mins / 60);
        const m = mins % 60;
        return `${h}h ${m}m`;
    };

    // --- Incentive Period Helper (26th - 25th) ---
    const getIncentivePeriod = (dateStr: string) => {
        const d = new Date(dateStr);
        const day = d.getDate();
        const month = d.getMonth();
        const year = d.getFullYear();

        // If > 25th, it counts to next month
        if (day > 25) {
            if (month === 11) return { month: 0, year: year + 1 };
            return { month: month + 1, year };
        }
        return { month, year };
    };

    const isEligibleForIncentive = totalReadingDuration >= 300;
    const isEligibleForBonus = logs.filter(l => l.hrApprovalStatus === 'Approved').length >= 5;

    const categories = Array.from(new Set(bookDatabase.map(b => b.category).filter(Boolean))).sort();

    // --- Filtering State ---
    const [filterYear, setFilterYear] = useState(new Date().getFullYear());
    const [filterPeriod, setFilterPeriod] = useState('all');

    // Filter Options
    const periodOptions = [
        { label: 'All Year', value: 'all' },
        ...[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11].map(m => ({
            label: new Date(2024, m, 1).toLocaleString('default', { month: 'long' }),
            value: String(m)
        }))
    ];

    // Derived Logs (Filtered)
    const filteredLogs = logs.filter(log => {
        if (!log.date) return false;

        const targetDate = log.status === 'Finished' && log.finishDate ? log.finishDate : log.date;
        const { month, year } = getIncentivePeriod(targetDate);

        if (year !== filterYear) return false;
        if (filterPeriod === 'all') return true;

        // Specific Month
        return month === parseInt(filterPeriod);
    });

    // --- Handlers ---
    const handleTitleChange = (e: ChangeEvent<HTMLInputElement>) => {
        const value = e.target.value;
        setStartFormData({ ...startFormData, title: value });

        if (value.length > 1) {
            const matches = bookDatabase.filter(b =>
                b.title && b.title.toLowerCase().includes(value.toLowerCase())
            ).slice(0, 5);
            setSuggestions(matches);
            setShowSuggestions(true);
        } else {
            setSuggestions([]);
            setShowSuggestions(false);
        }
    };

    const handleSuggestionClick = (book: BookData) => {
        setStartFormData(prev => ({
            ...prev,
            title: book.title,
            category: book.category || prev.category,
            location: book.location || prev.location
        }));
        setSuggestions([]);
        setShowSuggestions(false);
    };

    const handleFinishClick = (log: ReadingLogEntry) => {
        setSelectedLog(log);
        setFinishFormData({
            link: '',
            review: '',
            duration: 0,
            evidenceUrl: ''
        });
        // Scroll to top of right column logic usually handled by layout, but window scroll is fine
        window.scrollTo({ top: 0, behavior: 'smooth' });
    };

    const handleCancelFinish = () => {
        setSelectedLog(null);
        setFinishFormData({ link: '', review: '', duration: 0, evidenceUrl: '' });
    };

    const handleStartSubmit = async (e: FormEvent) => {
        e.preventDefault();
        setIsLoading(true);

        // 1. Single Active Book Rule
        const activeBook = logs.find(log => log.userName === user.name && log.status === 'Reading');
        if (activeBook) {
            setNotification({ show: true, type: 'error', message: `Anda sedang meminjam "${activeBook.title}".Harap selesaikan terlebih dahulu.` });
            setIsLoading(false);
            return;
        }
        // 2. Title Must Match DB
        const isValidBook = bookDatabase.some(b => b.title === startFormData.title);
        if (!isValidBook) {
            setNotification({ show: true, type: 'error', message: 'Judul buku tidak ditemukan di database. Harap pilih dari daftar.' });
            setIsLoading(false);
            return;
        }

        // 3. Validate Mandatory Fields
        if (!startFormData.title || !startFormData.category || !startFormData.location || !startFormData.source) {
            setNotification({ show: true, type: 'error', message: 'Mohon lengkapi semua kolom.' });
            setIsLoading(false);
            return;
        }

        if (!startFormData.evidenceUrl) {
            setNotification({ show: true, type: 'error', message: 'Wajib upload Bukti Foto Pengambilan Buku.' });
            setIsLoading(false);
            return;
        }

        try {
            const res = await fetch(`${API_BASE_URL}/api/books/borrow`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    ...startFormData,
                    userName: user.name
                })
            });

            if (res.ok) {
                const savedLog = await res.json();
                setLogs([savedLog, ...logs]);
                setStartFormData({ title: '', category: '', location: '', source: '', evidenceUrl: '' });
                setNotification({ show: true, type: 'success', message: "Buku berhasil dipinjam!" });
            } else {
                const err = await res.json();
                setNotification({ show: true, type: 'error', message: err.error || "Gagal meminjam buku." });
            }
        } catch (err) {
            console.error(err);
            setNotification({ show: true, type: 'error', message: "Error connecting to server." });
        } finally {
            setIsLoading(false);
        }
    };

    const handleFinishSubmit = async (e: FormEvent) => {
        e.preventDefault();
        if (!selectedLog) return;
        setIsLoading(true);

        const startDate = selectedLog.date ? new Date(selectedLog.date) : new Date();
        const now = new Date();
        const oneDay = 24 * 60 * 60 * 1000;

        if (now.getTime() - startDate.getTime() < oneDay) {
            setNotification({ show: true, type: 'error', message: 'Anda belum bisa menyelesaikan buku ini. Minimal peminjaman adalah 1 hari.' });
            setIsLoading(false);
            return;
        }

        // Validation for Finish Form
        if (!finishFormData.link) {
            setNotification({ show: true, type: 'error', message: 'Mohon isi Link Review.' });
            setIsLoading(false);
            return;
        }

        if (!finishFormData.evidenceUrl) {
            setNotification({ show: true, type: 'error', message: 'Wajib upload Bukti Foto Pengembalian Buku.' });
            setIsLoading(false);
            return;
        }

        try {
            const res = await fetch(`${API_BASE_URL}/api/books/return`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    id: selectedLog.id,
                    review: "-", // Review text is effectively replaced by link review, or we could add a field
                    link: finishFormData.link,
                    evidenceUrl: finishFormData.evidenceUrl,
                    readingDuration: 1 // Placeholder for now, or calculate
                })
            });

            if (res.ok) {
                const savedLog = await res.json();

                // Update local state: Replace the old log with the new 'Finished' one
                const updatedLogs = logs.map(l => l.id === selectedLog.id ? savedLog : l);

                setLogs(updatedLogs);
                setYearReadCount(prev => prev + 1);
                handleCancelFinish();
                setNotification({ show: true, type: 'success', message: "Buku berhasil diselesaikan!" });
            } else {
                const err = await res.json();
                setNotification({ show: true, type: 'error', message: err.error || "Gagal menyelesaikan buku." });
            }
        } catch (err) {
            console.error(err);
            setNotification({ show: true, type: 'error', message: "Error connecting to server." });
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="max-w-6xl mx-auto space-y-6">
            <PopupNotification
                isOpen={notification.show}
                type={notification.type}
                message={notification.message}
                onClose={() => setNotification({ ...notification, show: false })}
            />

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

                {/* Incentives Checks */}
                <div className="grid md:grid-cols-2 gap-4">
                    <div className={`p-4 rounded-xl border ${isEligibleForIncentive ? 'bg-green-500/20 border-green-400/30' : 'bg-white/10 border-white/20'}`}>
                        <div className="flex items-center gap-3">
                            <div className={`p-2 rounded-lg ${isEligibleForIncentive ? 'bg-green-500' : 'bg-slate-500'}`}>
                                <Trophy size={20} className="text-white" />
                            </div>
                            <div>
                                <p className="font-bold text-white">Minimum Reading Time</p>
                                <p className="text-sm text-blue-100">
                                    {isEligibleForIncentive ? "Target Reached (300+ mins)" : `${formatDuration(totalReadingDuration)} / 5h`}
                                </p>
                            </div>
                        </div>
                    </div>

                    <div className={`p-4 rounded-xl border ${isEligibleForBonus ? 'bg-green-500/20 border-green-400/30' : 'bg-white/10 border-white/20'}`}>
                        <div className="flex items-center gap-3">
                            <div className={`p-2 rounded-lg ${isEligibleForBonus ? 'bg-green-500' : 'bg-slate-500'}`}>
                                <Trophy size={20} className="text-white" />
                            </div>
                            <div>
                                <p className="font-bold text-white">Bonus Incentive Status</p>
                                <p className="text-sm text-blue-100">
                                    {isEligibleForBonus ? "Eligible! 5+ Verified Books." : `${logs.filter(l => l.hrApprovalStatus === 'Approved').length}/5 Books Verified by HR`}
                                </p>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <div className="grid lg:grid-cols-3 gap-8">
                {/* Left Column: START Form */}
                <div className="lg:col-span-1">
                    <div className="bg-white rounded-2xl shadow-xl border border-slate-100 overflow-visible sticky top-6 z-20">
                        <div className="p-6 border-b border-slate-100 bg-slate-50/50">
                            {/* Modified Header: Removed Plus Icon, Larger Text */}
                            <h2 className="font-bold text-2xl text-slate-800 mb-1">
                                Log Baca Buku
                            </h2>
                            <p className="text-xs text-slate-500 italic">
                                Catat buku yang Anda pinjam
                            </p>
                        </div>

                        <form onSubmit={handleStartSubmit} className="p-6 space-y-5">
                            <div className="relative">
                                <label className="block text-sm font-semibold text-slate-700 mb-1">
                                    Judul Buku (Title) <span className="text-xs text-slate-400 font-normal">(Database: {bookDatabase.length} books)</span>
                                </label>
                                <input
                                    required
                                    value={startFormData.title}
                                    onChange={handleTitleChange}
                                    onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
                                    className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-blue-500 outline-none"
                                    placeholder="Cari buku..."
                                    autoComplete="off"
                                />
                                {showSuggestions && suggestions.length > 0 && (
                                    <div className="suggestions-container absolute left-0 right-0 top-full mt-1 bg-white border border-slate-200 rounded-xl shadow-xl z-50 max-h-60 overflow-y-auto">
                                        {suggestions.map((book, idx) => (
                                            <div
                                                key={`${book.title}-${idx}`}
                                                onClick={() => handleSuggestionClick(book)}
                                                className="px-4 py-3 hover:bg-blue-50 cursor-pointer text-sm border-b border-slate-50 last:border-0"
                                            >
                                                <div className="font-bold text-slate-800">{book.title}</div>
                                                <div className="text-xs text-slate-500">{book.category}</div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>

                            <div>
                                <label className="block text-sm font-semibold text-slate-700 mb-1">Kategori</label>
                                <select
                                    value={startFormData.category}
                                    onChange={e => setStartFormData({ ...startFormData, category: e.target.value })}
                                    className="w-full px-4 py-2.5 rounded-xl border border-slate-200 bg-white"
                                >
                                    <option value="">Select Category...</option>
                                    {categories.map((cat, idx) => <option key={idx} value={cat}>{cat}</option>)}
                                </select>
                            </div>

                            <div>
                                <label className="block text-sm font-semibold text-slate-700 mb-1">Lokasi</label>
                                <select
                                    required
                                    value={startFormData.location}
                                    onChange={e => setStartFormData({ ...startFormData, location: e.target.value })}
                                    className="w-full px-4 py-2.5 rounded-xl border border-slate-200 bg-white"
                                >
                                    <option value="">-- Pilih Lokasi --</option>
                                    <option value="Medan - HO">Medan - HO</option>
                                    <option value="Medan - Cabang">Medan - Cabang</option>
                                    <option value="Binjai">Binjai</option>
                                    <option value="Tanjung Morawa">Tanjung Morawa</option>
                                    <option value="Jakarta">Jakarta</option>
                                    <option value="Bali">Bali</option>
                                </select>
                            </div>

                            <div>
                                <label className="block text-sm font-semibold text-slate-700 mb-1">Sumber</label>
                                <select
                                    required
                                    value={startFormData.source}
                                    onChange={e => setStartFormData({ ...startFormData, source: e.target.value })}
                                    className="w-full px-4 py-2.5 rounded-xl border border-slate-200 bg-white"
                                >
                                    <option value="">-- Pilih Sumber --</option>
                                    <option value="Buku dari Kantor">Buku dari Kantor</option>
                                    <option value="Buku Pribadi">Buku Pribadi</option>
                                </select>
                            </div>

                            <div>
                                <label className="block text-sm font-semibold text-slate-700 mb-1">
                                    Bukti Foto Pengambilan Buku
                                </label>
                                <div className="border-2 border-dashed border-slate-300 rounded-xl p-4 text-center hover:bg-slate-50 transition-colors cursor-pointer relative bg-slate-50 overflow-hidden group">
                                    <input type="file" onChange={(e) => handleFileChange(e, false)} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10" accept="image/*" />
                                    {startFormData.evidenceUrl ? (
                                        <div className="relative h-48 w-full">
                                            <img src={`${API_BASE_URL}${startFormData.evidenceUrl}`} alt="Preview" className="w-full h-full object-contain rounded-lg" />
                                        </div>
                                    ) : (
                                        <div className="py-8 text-slate-400">
                                            <p className="font-medium text-slate-600">Klik untuk Pilih Foto</p>
                                        </div>
                                    )}
                                </div>
                            </div>

                            <button
                                type="submit"
                                disabled={isLoading}
                                className="w-full px-4 py-3 rounded-xl font-bold shadow-lg transition-all flex items-center justify-center gap-2 text-white bg-blue-600 hover:bg-blue-700"
                            >
                                {isLoading ? 'Saving...' : 'Mulai Baca'}
                            </button>
                        </form>
                    </div>
                </div>

                {/* Right Column: List OR Finish Form */}
                <div className="lg:col-span-2 space-y-4">
                    {selectedLog ? (
                        // --- FINISH FORM VIEW ---
                        <div className="bg-white rounded-2xl shadow-xl border border-slate-100 overflow-visible animate-in slide-in-from-right-4">
                            <div className="p-6 border-b border-slate-100 bg-green-50/50 flex justify-between items-center">
                                <div>
                                    <h2 className="font-bold text-lg text-slate-800 flex items-center gap-2">
                                        <Trophy size={18} className="text-green-600" /> Selesaikan Buku: {selectedLog.title}
                                    </h2>
                                    <p className="text-xs text-slate-500 italic mt-1">
                                        Started: {new Date(selectedLog.date).toLocaleDateString()}
                                    </p>
                                </div>
                                <button onClick={handleCancelFinish} className="text-slate-400 hover:text-slate-600">
                                    <XCircle size={24} />
                                </button>
                            </div>

                            <form onSubmit={handleFinishSubmit} className="p-6 space-y-5">
                                <div className="p-4 bg-blue-50 rounded-xl border border-blue-100 space-y-4">
                                    <div>
                                        <label className="block text-sm font-semibold text-slate-700 mb-1">Link Review (Goodreads/Docs)</label>
                                        <input
                                            type="url"
                                            required
                                            value={finishFormData.link}
                                            onChange={e => setFinishFormData({ ...finishFormData, link: e.target.value })}
                                            className="w-full px-4 py-2.5 rounded-xl border border-slate-200"
                                            placeholder="https://..."
                                        />
                                    </div>
                                </div>

                                <div>
                                    <label className="block text-sm font-semibold text-slate-700 mb-1">
                                        Bukti Foto Pengembalian Buku
                                    </label>
                                    <div className="border-2 border-dashed border-slate-300 rounded-xl p-4 text-center hover:bg-slate-50 transition-colors cursor-pointer relative bg-slate-50 overflow-hidden group">
                                        <input type="file" onChange={(e) => handleFileChange(e, true)} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10" accept="image/*" />
                                        {finishFormData.evidenceUrl ? (
                                            <div className="relative h-48 w-full">
                                                <img src={`${API_BASE_URL}${finishFormData.evidenceUrl}`} alt="Preview" className="w-full h-full object-contain rounded-lg" />
                                            </div>
                                        ) : (
                                            <div className="py-8 text-slate-400">
                                                <p className="font-medium text-slate-600">Klik untuk Pilih Foto</p>
                                            </div>
                                        )}
                                    </div>
                                </div>

                                <div className="flex gap-3">
                                    <button type="button" onClick={handleCancelFinish} className="flex-1 px-4 py-3 rounded-xl bg-slate-100 text-slate-600 font-bold hover:bg-slate-200 transition-all">Cancel</button>
                                    <button
                                        type="submit"
                                        disabled={isLoading}
                                        className="flex-1 px-4 py-3 rounded-xl font-bold shadow-lg transition-all text-white bg-green-600 hover:bg-green-700"
                                    >
                                        {isLoading ? 'Saving...' : 'Selesaikan Bacaan'}
                                    </button>
                                </div>
                            </form>
                        </div>
                    ) : (
                        // --- LIST VIEW ---
                        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
                            <div className="p-4 border-b border-slate-100 flex gap-3">
                                <div className="relative flex-1">
                                    <Search className="absolute left-3 top-2.5 text-slate-400" size={18} />
                                    <input type="text" placeholder="Search logs..." className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl" />
                                </div>

                                {/* Filters */}
                                <div className="flex items-center gap-2">
                                    <select
                                        value={filterYear}
                                        onChange={(e) => setFilterYear(Number(e.target.value))}
                                        className="pl-3 pr-8 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold text-slate-600 outline-none focus:ring-2 focus:ring-blue-500 appearance-none cursor-pointer"
                                    >
                                        {[2024, 2025, 2026, 2027].map(y => <option key={y} value={y}>{y}</option>)}
                                    </select>
                                    <select
                                        value={filterPeriod}
                                        onChange={(e) => setFilterPeriod(e.target.value)}
                                        className="pl-3 pr-8 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold text-slate-600 outline-none focus:ring-2 focus:ring-blue-500 appearance-none cursor-pointer"
                                    >
                                        {periodOptions.map(opt => (
                                            <option key={opt.value} value={opt.value}>{opt.label}</option>
                                        ))}
                                    </select>
                                </div>
                            </div>

                            <div className="divide-y divide-slate-50">
                                {filteredLogs.length === 0 ? (
                                    <div className="p-12 text-center text-slate-400">
                                        <BookOpen size={48} className="mx-auto mb-3 opacity-20" />
                                        <p>No reading logs found for this period.</p>
                                    </div>
                                ) : (
                                    filteredLogs.map((log) => {
                                        const isBookEligible = log.status === 'Finished' && log.duration && (log.duration / (8 * 60 * 22)) < 6;
                                        return (
                                            <div key={log.id} className="p-4 hover:bg-slate-50 transition-colors flex items-start gap-4 group">
                                                <div className={`p-3 rounded-xl transition-colors ${log.status === 'Finished' ? 'bg-green-50 text-green-600' : 'bg-blue-50 text-blue-600'}`}>
                                                    {log.status === 'Finished' ? <Trophy size={20} /> : <Book size={20} />}
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <div className="flex items-center gap-2 mb-1">
                                                        <h3 className="font-semibold text-slate-800 truncate">{log.title}</h3>
                                                        {isBookEligible && <span className="px-2 py-0.5 bg-yellow-100 text-yellow-700 text-xs font-bold rounded-lg border border-yellow-200">Bonus Eligible</span>}
                                                    </div>
                                                    <p className="text-sm text-slate-500 truncate">{log.category} • {log.location || 'Medan'}</p>

                                                    {/* Incentive Display */}
                                                    {log.status === 'Finished' && log.hrApprovalStatus === 'Approved' && log.incentiveAmount && (
                                                        <div className="mt-1 flex items-center gap-1.5 text-sm font-bold text-green-600 bg-green-50 w-fit px-2 py-1 rounded-lg border border-green-100">
                                                            <Trophy size={14} className="text-green-500" />
                                                            <span>Incentive Reward: Rp {log.incentiveAmount.toLocaleString('id-ID')}</span>
                                                        </div>
                                                    )}

                                                    <div className="mt-2 p-2 bg-slate-50 rounded-lg border border-slate-100">
                                                        {log.status === 'Finished' ? (
                                                            <div className="space-y-1">
                                                                <div className="flex items-center gap-2 text-xs">
                                                                    <span className="font-semibold text-slate-600">Duration:</span>
                                                                    <span className="font-bold text-blue-600">{log.readingDuration} mins</span>
                                                                </div>
                                                                {log.startDate && log.finishDate && (
                                                                    <div className="flex items-center gap-2 text-xs text-slate-500">
                                                                        <span>Start: {new Date(log.startDate).toLocaleDateString()}</span>
                                                                        <span>•</span>
                                                                        <span>Finish: {new Date(log.finishDate).toLocaleDateString()}</span>
                                                                    </div>
                                                                )}
                                                                {/* Incentive Period Badge */}
                                                                {log.status === 'Finished' && log.finishDate && (
                                                                    <div className="inline-block mt-1 px-2 py-1 bg-indigo-50 text-indigo-600 text-[10px] font-bold rounded border border-indigo-100 uppercase tracking-wide">
                                                                        Incentive Period: {new Date(new Date(log.finishDate).getFullYear(), getIncentivePeriod(log.finishDate).month).toLocaleString('default', { month: 'long' })} {getIncentivePeriod(log.finishDate).year}
                                                                    </div>
                                                                )}
                                                            </div>
                                                        ) : (
                                                            <div className="flex items-center gap-2 text-xs">
                                                                <span className="font-semibold text-orange-600">In Progress</span>
                                                                <span className="text-slate-500">Started: {log.date ? new Date(log.date).toLocaleDateString() : 'Unknown'}</span>
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>

                                                <div className="flex gap-2 mb-2">
                                                    <div className={`px-3 py-1 text-xs font-bold rounded-lg ${log.status === 'Finished' ? 'bg-green-100 text-green-700' : 'bg-orange-100 text-orange-700'}`}>
                                                        {log.status === 'Finished' ? 'Selesai Baca' : 'Sedang Baca'}
                                                    </div>
                                                    {log.status === 'Finished' && (
                                                        <div className="flex flex-col items-end">
                                                            <div className={`px-3 py-1 text-xs font-bold rounded-lg ${log.hrApprovalStatus === 'Approved' ? 'bg-blue-100 text-blue-700' :
                                                                log.hrApprovalStatus === 'Rejected' ? 'bg-red-100 text-red-700' :
                                                                    'bg-yellow-100 text-yellow-700'
                                                                }`}>
                                                                {log.hrApprovalStatus === 'Approved' ? `Verified - Rp ${log.incentiveAmount?.toLocaleString('id-ID') || '0'}` :
                                                                    log.hrApprovalStatus === 'Rejected' ? 'Rejected' :
                                                                        'Waiting HR'}
                                                            </div>
                                                            {log.hrApprovalStatus === 'Rejected' && log.rejectionReason && (
                                                                <div className="text-[10px] text-red-500 mt-1 max-w-[150px] text-right">
                                                                    Ex: {log.rejectionReason}
                                                                </div>
                                                            )}
                                                        </div>
                                                    )}
                                                </div>

                                                {log.status === 'Reading' && (
                                                    <button onClick={() => handleFinishClick(log)} className="px-3 py-1 text-xs font-bold bg-green-100 text-green-700 hover:bg-green-200 rounded-lg border border-green-200">
                                                        Selesai
                                                    </button>
                                                )}

                                                {log.status === 'Reading' && (
                                                    <button onClick={() => handleDelete(log.id)} className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg" title="Batalkan Peminjaman">
                                                        <Trash2 size={18} />
                                                    </button>
                                                )}
                                            </div>
                                        );
                                    })
                                )}
                            </div>
                        </div>
                    )}
                </div>
            </div>
            <ConfirmationModal
                isOpen={confirmConfig.isOpen}
                onClose={() => setConfirmConfig({ ...confirmConfig, isOpen: false })}
                onConfirm={confirmConfig.onConfirm}
                title={confirmConfig.title}
                message={confirmConfig.message}
                confirmText="Yes, Delete"
                variant="danger"
            />
        </div>
    );
};

export default ReadingLogPage;
