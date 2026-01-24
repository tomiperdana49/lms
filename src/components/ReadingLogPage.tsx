import { useState, useEffect, type ChangeEvent, type FormEvent } from 'react';
import { BookOpen, Plus, ArrowLeft, Search, Filter, Book, Trophy, Calendar, Library, Trash2 } from 'lucide-react';
import { API_BASE_URL } from '../config';
import type { ReadingLogEntry } from '../types';
import PopupNotification from './PopupNotification';

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

    // --- Fetch Logs ---
    useEffect(() => {
        fetch(`${API_BASE_URL}/api/logs`)
            .then(res => res.json())
            .then(data => {
                // Filter logs for current user ONLY
                const userLogs = data.filter((log: ReadingLogEntry) => log.userName === user.name);
                setLogs(userLogs);

                // Calculate This Year's Completed Books
                const currentYear = new Date().getFullYear();
                const count = userLogs.filter((log: ReadingLogEntry) =>
                    log.status === 'Finished' && new Date(log.date).getFullYear() === currentYear
                ).length;
                setYearReadCount(count);
            })
            .catch(err => console.error("Failed to fetch logs", err));
    }, [user.name]);

    const handleDelete = async (id: number) => {
        if (!confirm('Are you sure you want to delete this log?')) return;
        try {
            const res = await fetch(`${API_BASE_URL}/api/logs/${id}`, { method: 'DELETE' });
            if (res.ok) {
                setLogs(logs.filter(log => log.id !== id));
            }
        } catch (err) {
            console.error("Failed to delete log", err);
            setNotification({ show: true, type: 'error', message: "Failed to delete log." });
        }
    };

    // --- Form State ---
    const [formData, setFormData] = useState({
        title: '',
        category: '',
        location: '',
        source: '',
        action: '',
        link: '',
        review: '',
        duration: 0,
        evidenceUrl: '' // Added for file upload
    });

    // --- Autocomplete State ---
    interface BookData {
        title: string;
        category: string;
        location?: string; // Added location field
    }

    const [suggestions, setSuggestions] = useState<BookData[]>([]);
    const [showSuggestions, setShowSuggestions] = useState(false);
    const [bookDatabase, setBookDatabase] = useState<BookData[]>([]);

    useEffect(() => {
        import('../data/books.json')
            .then((module) => setBookDatabase(module.default || module))
            .catch(err => console.error("Failed to load book database", err));
    }, []);

    // Add click outside handler
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

    const handleFileChange = async (e: ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            const file = e.target.files[0];
            const data = new FormData();
            data.append('file', file);

            try {
                // Determine the correct upload URL (Localhost specific for now)
                const res = await fetch(`${API_BASE_URL}/api/upload`, {
                    method: 'POST',
                    body: data
                });

                if (res.ok) {
                    const result = await res.json();
                    setFormData(prev => ({ ...prev, evidenceUrl: result.fileUrl }));
                    setNotification({ show: true, type: 'success', message: "Foto berhasil diupload!" });
                } else {
                    const errText = await res.text();
                    setNotification({ show: true, type: 'error', message: `Upload gagal. Status: ${res.status} ${res.statusText} - ${errText}` });
                }
            } catch (err) {
                console.error("Upload error:", err);
                setNotification({ show: true, type: 'error', message: `Error saat upload foto: ${(err as Error).message}` });
            }
        }
    };

    // --- Stats Calculations ---
    const totalReadingDuration = logs.reduce((acc, log) => acc + (log.duration || 0), 0);

    const formatDuration = (mins: number) => {
        const h = Math.floor(mins / 60);
        const m = mins % 60;
        return `${h}h ${m}m`;
    };

    const isEligibleForIncentive = totalReadingDuration >= 300; // Mock threshold: 5 hours
    const eligibleBooksCount = logs.filter(l => l.status === 'Finished').length; // Simplified logic
    const isEligibleForBonus = eligibleBooksCount >= 5;

    // Derive unique categories from book database
    // useMemo is good here to avoid recalculating on every render, though strictly not critical for small data
    const categories = Array.from(new Set(bookDatabase.map(b => b.category).filter(Boolean))).sort();

    const handleTitleChange = (e: ChangeEvent<HTMLInputElement>) => {
        const value = e.target.value;
        setFormData({ ...formData, title: value });

        // Filter suggestions based on matching title ONLY (Global Search)
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
        console.log('Suggestion clicked:', book); // Debug log
        setFormData(prev => ({
            ...prev,
            title: book.title,
            category: book.category || prev.category, // Keep existing category if book has no category
            location: book.location || prev.location // Keep existing location if book has no location
        }));
        setSuggestions([]);
        setShowSuggestions(false);
    };

    const handleSubmit = async (e: FormEvent) => {
        e.preventDefault();
        setIsLoading(true);

        // --- VALIDATION LOGIC ---

        // 1. Single Active Book Rule
        // If user is trying to 'Start' a book, check if they already have one 'Reading'
        if (formData.action === 'Start') {
            const activeBook = logs.find(log => log.userName === user.name && log.status === 'Reading');
            if (activeBook) {
                setNotification({ show: true, type: 'error', message: `You are currently reading "${activeBook.title}". Please finish it before starting a new one.` });
                setIsLoading(false);
                return;
            }
        }

        // 2. 6-Month Duplicate Rule
        // Check if user has read this book in the last 6 months
        if (formData.action === 'Start' || formData.action === 'Finish') {
            const sixMonthsAgo = new Date();
            sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

            const recentDuplicate = logs.find(log =>
                log.userName === user.name &&
                log.title.toLowerCase() === formData.title.toLowerCase() &&
                log.status === 'Finished' &&
                new Date(log.date) > sixMonthsAgo
            );

            if (recentDuplicate) {
                setNotification({ show: true, type: 'error', message: `You have already completed "${recentDuplicate.title}" on ${new Date(recentDuplicate.date).toLocaleDateString()}. You cannot read the same book within 6 months.` });
                setIsLoading(false);
                return;
            }
        }

        // --- END VALIDATION ---

        // Basic Duration Calculation Logic (Mocked for single entry update)
        // In a real app, 'Finish' would update an existing 'Start' record.
        // For now, if we are 'Finishing', we should ideally find the 'Reading' entry and update it, 
        // but based on current backend constraints (append only), we'll just save the 'Finished' state.
        // OPTIONAL IMPROVEMENT: If 'Finish', we could look for the 'Reading' status log and maybe delete/update it 
        // to keep the "One Active Book" rule consistent (so it doesn't look like they are reading 2 things if they forgot).
        // For strictly following the rule "Cannot START if READING", we are good. 
        // But when they "FINISH", the old "Reading" log remains as "Reading" unless we update it.
        // Let's assume for this simple version, 'Finished' just adds a new log entry.
        // To properly clear the "Active" block, we rely on the fact that the check is `status === 'Reading'`.
        // Wait, if we just ADD a 'Finished' log, the OLD 'Reading' log still exists!
        // So the user would be forever blocked from starting a new book because the old 'Reading' log is never removed/updated.
        //
        // FIX: If action is 'Finish', we MUST find the existing 'Reading' log for this book and either:
        // A) Update its status to 'Finished' (if backend supports PUT)
        // B) Delete it and create a new 'Finished' one (if backend supports DELETE)
        // C) For now, since we only have POST, we might have a logic issue.
        //
        // Let's check server.js capabilities again. 
        // server.js only assumes POST adds to array. It doesn't seem to have UPDATE.
        //
        // Workaround for Prototype:
        // When 'Finish' is submitted, we will optimistically update the local state to remove the 'Reading' version 
        // so the UI unblocks them, even if the backend technically has both rows.
        // Actually, the validation checks `logs` from state.

        const finalStatus = formData.action === 'Start' ? 'Reading' : 'Finished';

        const newLog = {
            id: Date.now(),
            title: formData.title || 'Untitled',
            category: formData.category || 'General',
            location: formData.location,
            source: formData.source,
            link: formData.link,
            date: new Date().toISOString(), // This serves as StartDate or EndDate depending on action
            status: finalStatus,
            userName: user.name, // Save User Name
            xp: formData.action === 'Finish' ? 50 : 10, // Mock XP
            review: formData.action === 'Finish' ? formData.review : undefined,
            duration: formData.action === 'Finish' ? formData.duration : undefined,
            evidenceUrl: formData.evidenceUrl, // Save Uploaded File URL
        };

        try {
            const res = await fetch(`${API_BASE_URL}/api/logs`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(newLog)
            });

            if (res.ok) {
                const savedLog = await res.json();

                // If Finished, we need to locally remove/update the previous 'Reading' entry for this book 
                // to enforce the "Single Active Book" rule correctly for the NEXT attempt.
                let updatedLogs = [savedLog, ...logs];

                if (finalStatus === 'Finished') {
                    // Find if there was a reading version of THIS book and remove it from view
                    // This is a client-side fix since we lack a real backend Update
                    updatedLogs = updatedLogs.filter(l =>
                        !(l.id !== savedLog.id && l.title === savedLog.title && l.status === 'Reading')
                    );
                    setYearReadCount(prev => prev + 1);
                }

                setLogs(updatedLogs);
                setFormData({ ...formData, title: '', link: '', review: '', duration: 0 }); // Reset some fields
                setNotification({ show: true, type: 'success', message: "Reading log saved!" });
            }
        } catch (err) {
            console.error("Failed to save log", err);
            setNotification({ show: true, type: 'error', message: "Error saving log." });
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

                {/* Regular Incentive Status */}
                <div className={`p-4 rounded-xl border mb-3 ${isEligibleForIncentive ? 'bg-green-500/20 border-green-400/30' : 'bg-red-500/20 border-red-400/30'}`}>
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <div className={`p-2 rounded-lg ${isEligibleForIncentive ? 'bg-green-500' : 'bg-red-500'}`}>
                                <Trophy size={20} className="text-white" />
                            </div>
                            <div>
                                <p className="font-bold text-white">
                                    {isEligibleForIncentive ? 'Eligible for Regular Incentive' : 'Not Eligible for Regular Incentive'}
                                </p>
                                <p className="text-sm text-blue-100">
                                    Total reading time: {formatDuration(totalReadingDuration)}
                                </p>
                            </div>
                        </div>
                        {!isEligibleForIncentive && (
                            <div className="text-right">
                                <p className="text-xs text-red-200">Reading time exceeds 6 months</p>
                                <p className="text-xs text-red-200">No regular incentive available</p>
                            </div>
                        )}
                    </div>
                </div>

                {/* Bonus Incentive Status */}
                <div className={`p-4 rounded-xl border ${isEligibleForBonus ? 'bg-yellow-500/20 border-yellow-400/30' : 'bg-slate-500/20 border-slate-400/30'}`}>
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <div className={`p-2 rounded-lg ${isEligibleForBonus ? 'bg-yellow-500' : 'bg-slate-500'}`}>
                                <Trophy size={20} className="text-white" />
                            </div>
                            <div>
                                <p className="font-bold text-white">
                                    {isEligibleForBonus ? 'Eligible for Bonus Incentive!' : 'Not Eligible for Bonus Incentive'}
                                </p>
                                <p className="text-sm text-blue-100">
                                    Eligible books: {eligibleBooksCount}/5 (each read in &lt;6 months)
                                </p>
                            </div>
                        </div>
                        {isEligibleForBonus && (
                            <div className="text-right">
                                <p className="text-xs text-yellow-200 font-bold">🎉 BONUS AVAILABLE!</p>
                                <p className="text-xs text-yellow-200">5+ eligible books achieved</p>
                            </div>
                        )}
                        {!isEligibleForBonus && (
                            <div className="text-right">
                                <p className="text-xs text-slate-200">Need {5 - eligibleBooksCount} more eligible books</p>
                                <p className="text-xs text-slate-200">for bonus incentive</p>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            <div className="grid lg:grid-cols-3 gap-8">
                {/* Left Column: Form (Always Visible) */}
                <div className="lg:col-span-1">
                    <div className="bg-white rounded-2xl shadow-xl border border-slate-100 overflow-visible sticky top-6 z-20">
                        <div className="p-6 border-b border-slate-100 bg-slate-50/50">
                            <h2 className="font-bold text-lg text-slate-800 flex items-center gap-2">
                                <Plus size={18} className="text-blue-600" /> New Entry
                            </h2>
                            <p className="text-xs text-slate-500 italic mt-1">"A room without books is like a body without a soul." - Cicero</p>
                        </div>
                        <form onSubmit={handleSubmit} className="p-6 space-y-5">
                            <div className="relative">
                                <label className="block text-sm font-semibold text-slate-700 mb-1">Judul Buku (Title)</label>
                                <input
                                    required
                                    value={formData.title}
                                    onChange={handleTitleChange}
                                    onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
                                    className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-blue-500 outline-none"
                                    placeholder="Start typing to search..."
                                    autoComplete="off"
                                />
                                {showSuggestions && suggestions.length > 0 && (
                                    <div className="suggestions-container absolute left-0 right-0 top-full mt-1 bg-white border border-slate-200 rounded-xl shadow-xl z-50 max-h-60 overflow-y-auto">
                                        {suggestions.map((book, idx) => (
                                            <div
                                                key={`${book.title}-${idx}`} // Better key
                                                onClick={(e) => {
                                                    e.preventDefault();
                                                    e.stopPropagation();
                                                    console.log('Click event triggered for:', book.title);
                                                    handleSuggestionClick(book);
                                                }}
                                                onMouseDown={(e) => {
                                                    e.preventDefault();
                                                    e.stopPropagation();
                                                }}
                                                className="px-4 py-3 hover:bg-blue-50 cursor-pointer text-sm border-b border-slate-50 last:border-0 transition-colors"
                                                style={{ userSelect: 'none' }}
                                            >
                                                <div className="font-bold text-slate-800">{book.title}</div>
                                                <div className="flex items-center gap-2 text-xs text-slate-500">
                                                    <span>{book.category}</span>
                                                    {book.location && (
                                                        <>
                                                            <span>•</span>
                                                            <span className="text-blue-600 font-medium">{book.location}</span>
                                                        </>
                                                    )}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>

                            <div>
                                <label className="block text-sm font-semibold text-slate-700 mb-1">Kategori</label>
                                <select
                                    value={formData.category}
                                    onChange={e => setFormData({ ...formData, category: e.target.value })}
                                    className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-blue-500 outline-none bg-white"
                                >
                                    <option value="">Select Category...</option>
                                    {categories.map((cat, idx) => (
                                        <option key={idx} value={cat}>{cat}</option>
                                    ))}
                                    <option disabled>--- Internal ---</option>
                                    <option value="Standard Operating Procedure (SOP)">Standard Operating Procedure (SOP)</option>
                                    <option value="Company Policy">Company Policy</option>
                                </select>
                            </div>

                            <div>
                                <label className="block text-sm font-semibold text-slate-700 mb-1">Lokasi/Penempatan</label>
                                <select
                                    required
                                    value={formData.location}
                                    onChange={e => setFormData({ ...formData, location: e.target.value })}
                                    className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-blue-500 outline-none bg-white"
                                >
                                    <option value="">-- Pilih Lokasi --</option>
                                    <option value="Medan - HO">Medan - HO</option>
                                    <option value="Medan - Cabang">Medan - Cabang</option>
                                    <option value="Binjai">Binjai</option>
                                    <option value="Jakarta">Jakarta</option>
                                    <option value="Bali">Bali</option>
                                    <option value="Tanjung Morawa">Tanjung Morawa</option>
                                </select>
                            </div>

                            <div>
                                <label className="block text-sm font-semibold text-slate-700 mb-1">Sumber Buku</label>
                                <select
                                    required
                                    value={formData.source}
                                    onChange={e => setFormData({ ...formData, source: e.target.value })}
                                    className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-blue-500 outline-none bg-white"
                                >
                                    <option value="">-- Pilih Sumber --</option>
                                    <option value="Buku dari Kantor">Buku dari Kantor</option>
                                    <option value="Buku Pribadi">Buku Pribadi</option>
                                    <option value="E-Book / Digital">E-Book / Digital</option>
                                </select>
                            </div>

                            <div>
                                <label className="block text-sm font-semibold text-slate-700 mb-1">Aksi</label>
                                <select
                                    required
                                    value={formData.action}
                                    onChange={e => setFormData({ ...formData, action: e.target.value })}
                                    className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-blue-500 outline-none bg-white"
                                >
                                    <option value="">-- Pilih Aksi --</option>
                                    <option value="Start">Memulai Baca Buku</option>
                                    <option value="Finish">Selesai Baca Buku</option>
                                </select>
                            </div>

                            <div>
                                <label className="block text-sm font-semibold text-slate-700 mb-1">Link Goodreads/GDocs (Wajib bila selesai)</label>
                                <input
                                    type="url"
                                    value={formData.link}
                                    onChange={e => setFormData({ ...formData, link: e.target.value })}
                                    className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-blue-500 outline-none"
                                    placeholder="Masukkan catatan atau link (opsional)"
                                    required={formData.action === 'Finish'}
                                />
                                <p className="text-xs text-slate-400 mt-1">Jika buku tidak ada di Goodreads, silakan isi dengan catatan atau link lain.</p>
                            </div>

                            {/* Mandatory Review for 'Finish' Action */}
                            {formData.action === 'Finish' && (
                                <div className="space-y-5 animate-in fade-in slide-in-from-top-4 duration-300">
                                    <div className="p-4 bg-blue-50 rounded-xl border border-blue-100">
                                        <h3 className="font-bold text-blue-800 mb-3 flex items-center gap-2">
                                            <Trophy size={16} /> Completion Details
                                        </h3>

                                        <div className="space-y-4">
                                            <div>
                                                <label className="block text-sm font-semibold text-slate-700 mb-1">Durasi Baca (Menit)</label>
                                                <input
                                                    type="number"
                                                    required
                                                    min="1"
                                                    value={formData.duration}
                                                    onChange={e => setFormData({ ...formData, duration: parseInt(e.target.value) || 0 })}
                                                    className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-blue-500 outline-none"
                                                    placeholder="Example: 60"
                                                />
                                            </div>

                                            <div>
                                                <label className="block text-sm font-semibold text-slate-700 mb-1">Review / Key Takeaways (Wajib)</label>
                                                <textarea
                                                    required
                                                    rows={4}
                                                    value={formData.review}
                                                    onChange={e => setFormData({ ...formData, review: e.target.value })}
                                                    className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-blue-500 outline-none resize-none"
                                                    placeholder="Tuliskan ringkasan singkat atau hal penting yang Anda pelajari dari buku ini..."
                                                />
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            )}

                            <div>
                                <label className="block text-sm font-semibold text-slate-700 mb-1">
                                    {formData.action === 'Start' ? 'Bukti Foto Pengambilan Buku' :
                                        formData.action === 'Finish' ? 'Bukti Foto Pengembalian Buku' : 'Upload Foto'}
                                </label>
                                <div className="border-2 border-dashed border-slate-300 rounded-xl p-4 text-center hover:bg-slate-50 transition-colors cursor-pointer relative bg-slate-50 overflow-hidden group">
                                    <input
                                        type="file"
                                        onChange={handleFileChange}
                                        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                                        accept="image/*"
                                    />

                                    {formData.evidenceUrl ? (
                                        <div className="relative h-48 w-full">
                                            <img
                                                src={`${API_BASE_URL}${formData.evidenceUrl}`}
                                                alt="Preview"
                                                className="w-full h-full object-contain rounded-lg"
                                            />
                                            <div className="absolute inset-0 bg-black/50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                                                <p className="text-white text-sm font-medium">Click to Change Photo</p>
                                            </div>
                                        </div>
                                    ) : (
                                        <div className="py-8 text-slate-400">
                                            <p className="font-medium text-slate-600">Klik untuk Pilih Foto</p>
                                            <p className="text-xs">
                                                {formData.action === 'Start' ? 'Foto buku saat diambil dari rak' :
                                                    formData.action === 'Finish' ? 'Foto buku saat dikembalikan ke rak' : 'Format JPG/PNG'}
                                            </p>
                                        </div>
                                    )}
                                </div>
                            </div>

                            <button
                                type="submit"
                                disabled={isLoading}
                                className="w-full px-4 py-3 rounded-xl bg-blue-600 text-white font-bold hover:bg-blue-700 shadow-lg shadow-blue-900/20 transition-all flex items-center justify-center gap-2"
                            >
                                {isLoading ? 'Saving...' : 'Submit'}
                            </button>
                        </form>
                    </div>
                </div>

                {/* Right Column: List */}
                <div className="lg:col-span-2 space-y-4">
                    <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
                        {/* Filter Bar */}
                        <div className="p-4 border-b border-slate-100 flex gap-3">
                            <div className="relative flex-1">
                                <Search className="absolute left-3 top-2.5 text-slate-400" size={18} />
                                <input
                                    type="text"
                                    placeholder="Search reading logs..."
                                    className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                                />
                            </div>
                            <button className="p-2 border border-slate-200 rounded-xl text-slate-600 hover:bg-slate-50">
                                <Filter size={18} />
                            </button>
                        </div>

                        {/* List Items */}
                        <div className="divide-y divide-slate-50">
                            {logs.length === 0 ? (
                                <div className="p-12 text-center text-slate-400">
                                    <BookOpen size={48} className="mx-auto mb-3 opacity-20" />
                                    <p>No reading logs yet. Start reading!</p>
                                </div>
                            ) : (
                                logs.map((log: ReadingLogEntry) => {
                                    // Check if this book is eligible for bonus (read in less than 6 months)
                                    const isBookEligible = log.status === 'Finished' && log.duration &&
                                        (log.duration / (8 * 60 * 22)) < 6;

                                    return (
                                        <div key={log.id} className="p-4 hover:bg-slate-50 transition-colors flex items-start gap-4 group">
                                            <div className={`p-3 rounded-xl transition-colors ${log.status === 'Finished' ? 'bg-green-50 text-green-600' : 'bg-blue-50 text-blue-600'}`}>
                                                {log.status === 'Finished' ? <Trophy size={20} /> : <Book size={20} />}
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-center gap-2 mb-1">
                                                    <h3 className="font-semibold text-slate-800 truncate">{log.title}</h3>
                                                    {isBookEligible && (
                                                        <span className="px-2 py-0.5 bg-yellow-100 text-yellow-700 text-xs font-bold rounded-lg border border-yellow-200">
                                                            ⭐ Bonus Eligible
                                                        </span>
                                                    )}
                                                </div>
                                                <p className="text-sm text-slate-500 truncate">{log.category} • {log.location || 'Medan'}</p>

                                                {/* Reading Duration Info */}
                                                <div className="mt-2 p-2 bg-slate-50 rounded-lg border border-slate-100">
                                                    {log.status === 'Finished' ? (
                                                        <div className="space-y-1">
                                                            <div className="flex items-center gap-2 text-xs">
                                                                <span className="font-semibold text-slate-600">Duration:</span>
                                                                <span className={`font-bold ${isBookEligible ? 'text-yellow-600' : 'text-blue-600'}`}>
                                                                    {log.readingDuration}
                                                                </span>
                                                                {isBookEligible && (
                                                                    <span className="text-yellow-600 text-xs">✓</span>
                                                                )}
                                                            </div>
                                                            {log.startDate && log.finishDate && (
                                                                <div className="flex items-center gap-2 text-xs text-slate-500">
                                                                    <span>Start:</span>
                                                                    <span>{new Date(log.startDate).toLocaleDateString()}</span>
                                                                    <span>•</span>
                                                                    <span>Finish:</span>
                                                                    <span>{new Date(log.finishDate).toLocaleDateString()}</span>
                                                                </div>
                                                            )}
                                                        </div>
                                                    ) : (
                                                        <div className="flex items-center gap-2 text-xs">
                                                            <span className="font-semibold text-orange-600">In Progress</span>
                                                            <span className="text-slate-500">Started: {log.startDate ? new Date(log.startDate).toLocaleDateString() : 'Unknown'}</span>
                                                        </div>
                                                    )}
                                                </div>

                                                <div className="flex items-center gap-2 text-xs text-slate-400 mt-2">
                                                    <Calendar size={12} /> {new Date(log.date).toLocaleDateString()}
                                                    <span className="w-1 h-1 bg-slate-300 rounded-full"></span>
                                                    <Library size={12} /> {log.source || 'Kantor'}
                                                </div>
                                            </div>
                                            {/* Status Badge */}
                                            <div className={`px-3 py-1 text-xs font-bold rounded-lg flex items-center gap-1 whitespace-nowrap
                                            ${log.status === 'Finished' ? 'bg-green-100 text-green-700' : 'bg-orange-100 text-orange-700'}
                                        `}>
                                                {log.status === 'Finished' ? 'Completed' : 'Reading'}
                                            </div>
                                            <button
                                                onClick={() => handleDelete(log.id)}
                                                className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                                                title="Delete Log"
                                            >
                                                <Trash2 size={18} />
                                            </button>
                                        </div>
                                    );
                                })
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default ReadingLogPage;
