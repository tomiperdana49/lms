import { useState, useEffect, type ChangeEvent, type FormEvent } from 'react';
import { BookOpen, ArrowLeft, Search, Book, Trophy, Trash2, XCircle, CheckCircle, Upload, Clock } from 'lucide-react';
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
    
    let cleanPath = path.startsWith('/') ? path.slice(1) : path;
    
    // If path starts with 'api/' and API_BASE_URL already contains '/api'
    if (cleanPath.startsWith('api/') && API_BASE_URL.toLowerCase().endsWith('/api')) {
        const root = API_BASE_URL.substring(0, API_BASE_URL.length - 4);
        return `${root}/${cleanPath}`;
    }
    
    return `${API_BASE_URL}/${cleanPath}`;
};

const ReadingLogPage = ({ user, onBack }: ReadingLogPageProps) => {
    const [readingLogs, setReadingLogs] = useState<ReadingLogEntry[]>([]);
    const [isLoading, setIsLoading] = useState(false);

    const [privateFile, setPrivateFile] = useState<File | null>(null);
    const [privatePreview, setPrivatePreview] = useState<string>('');
    const [claimFile, setClaimFile] = useState<File | null>(null);
    const [claimPreview, setClaimPreview] = useState<string>('');

    const today = new Date().toLocaleDateString('en-CA');

    const [privateReportForm, setPrivateReportForm] = useState({
        title: '',
        category: '',
        startDate: '',
        finishDate: today,
        link: '',
        evidenceUrl: ''
    });

    const [claimModalOpen, setClaimModalOpen] = useState(false);
    const [claimForm, setClaimForm] = useState({
        title: '',
        category: '',
        startDate: '',
        finishDate: today,
        link: '',
        evidenceUrl: ''
    });

    const [detailModalOpen, setDetailModalOpen] = useState(false);
    const [viewLog, setViewLog] = useState<ReadingLogEntry | null>(null);
    const [selectedLog, setSelectedLog] = useState<ReadingLogEntry | null>(null);
    const [cancelNote, setCancelNote] = useState('');
    const [notification, setNotification] = useState<{ show: boolean, type: 'success' | 'error', message: string }>({ show: false, type: 'success', message: '' });

    const [confirmConfig, setConfirmConfig] = useState<{
        isOpen: boolean;
        title: string;
        message: string;
        onConfirm: (val?: string) => void;
        variant?: 'danger' | 'warning' | 'info' | 'success';
        confirmText?: string;
        cancelText?: string;
        hideConfirm?: boolean;
        showInput?: boolean;
        inputPlaceholder?: string;
    }>({ isOpen: false, title: '', message: '', onConfirm: () => { } });

    const openConfirm = (
        title: string, 
        message: string, 
        onConfirm: (val?: string) => void = () => { }, 
        confirmText = 'Yes, Delete', 
        variant: 'danger' | 'warning' | 'info' | 'success' = 'danger', 
        cancelText = 'Cancel', 
        hideConfirm = false,
        showInput = false,
        inputPlaceholder = 'Enter note...'
    ) => {
        setConfirmConfig({ isOpen: true, title, message, onConfirm, confirmText, variant, cancelText, hideConfirm, showInput, inputPlaceholder });
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

    const handleDelete = (id: number | string) => {
        setCancelNote('');
        openConfirm(
            'Cancel Reading Log', 
            'Are you sure you want to cancel this reading log? Please provide a reason.', 
            async (reason) => {
                try {
                    const finalReason = reason || 'Cancelled by user';
                    const res = await fetch(`${API_BASE_URL}/api/logs/${id}/cancel`, { 
                        method: 'PATCH',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ reason: finalReason, cancelledBy: user.name })
                    });
                    if (res.ok) {
                        const now = new Date().toISOString();
                        const updatedLogs = readingLogs.map(l => String(l.id) === String(id) ? { 
                            ...l, 
                            status: 'Cancelled', 
                            hrApprovalStatus: 'Cancelled' as 'Cancelled', 
                            rejectionReason: finalReason,
                            cancelledAt: now,
                            cancelledBy: user.name
                        } : l);
                        setReadingLogs(updatedLogs);
                        if (viewLog && String(viewLog.id) === String(id)) {
                            setViewLog({ 
                                ...viewLog, 
                                status: 'Cancelled', 
                                hrApprovalStatus: 'Cancelled' as 'Cancelled', 
                                rejectionReason: finalReason,
                                cancelledAt: now,
                                cancelledBy: user.name
                            });
                        }
                        setNotification({ show: true, type: 'success', message: "Log cancelled successfully." });
                        setTimeout(() => {
                            window.location.reload();
                        }, 1000);
                    }
                } catch (err) {
                    console.error("Failed to cancel log", err);
                    setNotification({ show: true, type: 'error', message: "Failed to cancel log." });
                }
            }, 
            'Yes, Cancel', 
            'warning',
            'Back',
            false,
            true,
            'Enter cancellation reason...'
        );
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
                setNotification({ show: true, type: 'success', message: 'Incentive claim sent to HR successfully!' });
            } else {
                setNotification({ show: true, type: 'error', message: 'Failed to send claim.' });
            }
        } catch (err) {
            console.error(err);
            setNotification({ show: true, type: 'error', message: 'Failed to connect to server.' });
        } finally {
            setIsLoading(false);
        }
    };

    const handleFileChange = (e: ChangeEvent<HTMLInputElement>, target: 'privateReport' | 'claimFinish') => {
        if (e.target.files && e.target.files[0]) {
            const file = e.target.files[0];
            const previewUrl = URL.createObjectURL(file);
            
            if (target === 'privateReport') {
                setPrivateFile(file);
                setPrivatePreview(previewUrl);
                setPrivateReportForm(prev => ({ ...prev, evidenceUrl: 'pending' })); // placeholder
            } else {
                setClaimFile(file);
                setClaimPreview(previewUrl);
                setClaimForm(prev => ({ ...prev, evidenceUrl: 'pending' })); // placeholder
            }
        }
    };

    const uploadFileToServer = async (file: File): Promise<string> => {
        const data = new FormData();
        data.append('file', file);
        const res = await fetch(`${API_BASE_URL}/api/upload`, {
            method: 'POST',
            body: data
        });
        if (!res.ok) throw new Error('Upload failed');
        const result = await res.json();
        return result.fileUrl;
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

    const getQuotaCountByYear = (year: number) => {
        return readingLogs.filter(l => 
            (l.hrApprovalStatus === 'Approved' || l.hrApprovalStatus === 'Pending') && 
            new Date(l.finishDate || l.date).getFullYear() === year
        ).length;
    };


    const categories = [
        "Biography", "Business & Economy", "Fiction", "Comic/Manga",
        "Non-Fiction", "Self Development", "History", "Technology", "Others"
    ];

    const [filterYear] = useState(new Date().getFullYear());
    const [filterPeriod] = useState('all');
    const [filterStatus, setFilterStatus] = useState('all'); // 'all', 'Reading', 'Approved', 'Pending'
    const [searchQuery, setSearchQuery] = useState('');
    const [currentPage, setCurrentPage] = useState(1);
    const ITEMS_PER_PAGE = 5;

    useEffect(() => {
        setCurrentPage(1);
    }, [filterYear, filterPeriod, searchQuery, filterStatus]);

    /* const periodOptions = [
        { label: 'All Year', value: 'all' },
        ...[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11].map(m => ({
            label: new Date(2024, m, 1).toLocaleString('default', { month: 'long' }),
            value: String(m)
        }))
    ]; */

    const filteredLogs = readingLogs.filter(log => {
        if (!log.date) return false;
        if (searchQuery && !log.title.toLowerCase().includes(searchQuery.toLowerCase())) return false;

        // Status Filter
        if (filterStatus === 'Reading') {
            if (log.status !== filterStatus) return false;
        } else if (filterStatus === 'Finished') {
            if (log.status !== 'Finished' || (log.hrApprovalStatus !== 'Draft' && !!log.hrApprovalStatus)) return false;
        } else if (filterStatus === 'Approved') {
            if (log.hrApprovalStatus !== 'Approved') return false;
        } else if (filterStatus === 'Pending') {
            if (log.status !== 'Finished' || log.hrApprovalStatus !== 'Pending') return false;
        } else if (filterStatus === 'Cancelled') {
            if (log.status !== 'Cancelled') return false;
        } else if (filterStatus === 'Rejected') {
            if (log.hrApprovalStatus !== 'Rejected') return false;
        }

        // Date/Period Filter
        const period = getIncentivePeriod(log.finishDate || log.date || '');
        if (period.year !== filterYear) return false;
        if (filterPeriod === 'all') return true;
        return period.month === parseInt(filterPeriod);
    });

    // const totalPages = Math.ceil(filteredLogs.length / ITEMS_PER_PAGE);
    const paginatedLogs = filteredLogs.slice((currentPage - 1) * ITEMS_PER_PAGE, currentPage * ITEMS_PER_PAGE);

    const submitPrivateReportData = async () => {
        setIsLoading(true);
        const { title, category, startDate, finishDate, link } = privateReportForm;
        try {
            const finalStartDate = new Date(startDate);
            finalStartDate.setHours(9, 0, 0);

            const finalFinishDate = new Date(finishDate);
            const now = new Date();
            finalFinishDate.setHours(now.getHours(), now.getMinutes(), now.getSeconds());

            const res = await fetch(`${API_BASE_URL}/api/logs`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    title, category, startDate: finalStartDate, 
                    finishDate: finalFinishDate,
                    link: link, review: '-', evidenceUrl: '', status: 'Finished', hrApprovalStatus: 'Draft',
                    location: 'Pribadi', source: 'Buku Pribadi', userName: user.name, employee_id: user.employee_id, date: new Date()
                })
            });

            if (!res.ok) throw new Error('Failed to save to database');
            const newLog = await res.json();
            const logId = newLog.id;

            if (privateFile) {
                try {
                    const uploadedUrl = await uploadFileToServer(privateFile);
                    await fetch(`${API_BASE_URL}/api/logs/${logId}`, {
                        method: 'PUT',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ evidenceUrl: uploadedUrl })
                    });
                } catch (uploadErr) {
                    console.error("Upload failed:", uploadErr);
                    setNotification({ show: true, type: 'error', message: "Data saved, but photo failed to upload." });
                }
            }

            setReadingLogs([newLog, ...readingLogs]);
            setPrivateReportForm({ title: '', category: '', startDate: '', finishDate: today, link: '', evidenceUrl: '' });
            setNotification({ show: true, type: 'success', message: "Private reading log saved successfully!" });
            setTimeout(() => {
                window.location.reload();
            }, 1500);
        } catch (err) {
            console.error(err);
            setNotification({ show: true, type: 'error', message: "Error connecting to server." });
        } finally {
            setIsLoading(false);
        }
    };

    const handlePrivateReportSubmit = async (e: FormEvent) => {
        e.preventDefault();
        const { title, category, startDate, finishDate } = privateReportForm;

        if (!title || !category || !startDate || !finishDate || !privateFile) {
            setNotification({ show: true, type: 'error', message: 'Please complete all required fields: Title, Category, Start/Finish Date, and Evidence Photo.' });
            return;
        }

        const start = new Date(startDate).getTime();
        const end = new Date(finishDate).getTime();
        const diffDays = Math.abs(end - start) / (1000 * 60 * 60 * 24);

        if (diffDays <= 1) {
            openConfirm(
                'Reading Time Confirmation',
                'The duration between start and finish is very short (0-1 days).',
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
                title: '', category: '', startDate: '', finishDate: today,
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
                        id: selectedLog.id, review: '-', link: claimForm.link, evidenceUrl: '',
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
                        link: claimForm.link, evidenceUrl: '',
                        status: 'Finished', hrApprovalStatus: 'Pending', userName: user.name, employee_id: user.employee_id,
                        source: 'Office/Other', date: new Date()
                    })
                });
            }

            if (!res.ok) throw new Error('Failed to save claim');
            const savedData = await res.json();
            const logId = selectedLog ? selectedLog.id : savedData.id;

            if (claimFile) {
                try {
                    const uploadedUrl = await uploadFileToServer(claimFile);
                    await fetch(`${API_BASE_URL}/api/logs/${logId}`, {
                        method: 'PUT',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ evidenceUrl: uploadedUrl })
                    });
                } catch (uploadErr) {
                    console.error("Upload failed:", uploadErr);
                    setNotification({ show: true, type: 'error', message: "Claim saved, but photo failed to upload." });
                }
            }
            setNotification({ show: true, type: 'success', message: "Claim saved successfully!" });
            setTimeout(() => {
                window.location.reload();
            }, 1500);
        } catch (err) {
            console.error(err);
            setNotification({ show: true, type: 'error', message: "Error connecting to server." });
        } finally {
            setIsLoading(false);
        }
    };

    const handleClaimSubmit = async (e: FormEvent) => {
        e.preventDefault();

        if (!claimFile || !claimForm.startDate || !claimForm.finishDate || !claimForm.link) {
            setNotification({ show: true, type: 'error', message: 'Please complete all required fields.' });
            return;
        }

        const start = new Date(claimForm.startDate).getTime();
        const end = new Date(claimForm.finishDate).getTime();
        const diffDays = Math.abs(end - start) / (1000 * 60 * 60 * 24);

        if (diffDays <= 1) {
            openConfirm(
                'Reading Time Confirmation',
                'The duration between start and finish is very short (0-1 days).',
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
                        <div className="text-4xl font-black">
                            {readingLogs.filter(l => 
                                new Date(l.finishDate || l.date).getFullYear() === filterYear && 
                                l.status === 'Finished' && 
                                l.hrApprovalStatus !== 'Rejected'
                            ).length}
                        </div>
                        <div className="text-sm font-medium text-blue-100 uppercase tracking-wider">Books In {filterYear}</div>
                    </div>
                </div>
                <div className="grid md:grid-cols-2 gap-4">
                    {(() => {
                        const quotaCount = getQuotaCountByYear(filterYear);
                        const isMaxed = quotaCount >= 5;
                        const approvedOnly = readingLogs.filter(l => l.hrApprovalStatus === 'Approved' && new Date(l.finishDate || l.date).getFullYear() === filterYear).length;
                        return (
                            <div className={`p-4 rounded-xl border ${approvedOnly >= 5 ? 'bg-green-500/20 border-green-400/30' : 'bg-white/10 border-white/20'}`}>
                                <div className="flex items-center gap-3">
                                    <div className={`p-2 rounded-lg ${approvedOnly >= 5 ? 'bg-green-500' : 'bg-slate-500'}`}>
                                        <Trophy size={20} className="text-white" />
                                    </div>
                                    <div>
                                        <p className="font-bold text-white">Annual Limit Status ({filterYear})</p>
                                        <p className="text-sm text-blue-100">
                                            {isMaxed ? `Quota Reached: 5 Books (${approvedOnly} Approved, ${quotaCount - approvedOnly} Pending)` : `${quotaCount}/5 Books Processing/Approved`}
                                        </p>
                                    </div>
                                </div>
                            </div>
                        );
                    })()}
                </div>
            </div>

            <div className="grid lg:grid-cols-3 gap-8">
                {/* Form */}
                <div className="lg:col-span-1">
                    <div className="bg-white rounded-2xl shadow-xl border border-slate-100 overflow-visible sticky top-6 z-20">
                        <div className="p-6 border-b border-slate-100 bg-slate-50/50">
                            <h2 className="font-bold text-lg text-slate-800 mb-1 flex items-center gap-2"><Book size={20} className="text-purple-600" /> Report Private Reading</h2>
                            <p className="text-xs text-slate-500">Report personal books you finished reading</p>
                        </div>
                        <form onSubmit={handlePrivateReportSubmit} className="p-6 space-y-4">
                            <div>
                                <label className="block text-sm font-semibold text-slate-700 mb-1">Book Title <span className="text-red-500">*</span></label>
                                <input required value={privateReportForm.title} onChange={e => setPrivateReportForm({ ...privateReportForm, title: e.target.value })} className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-blue-500 outline-none" placeholder="Enter book title..." />
                            </div>
                            <div>
                                <label className="block text-sm font-semibold text-slate-700 mb-1">Category</label>
                                <select value={privateReportForm.category} onChange={e => setPrivateReportForm({ ...privateReportForm, category: e.target.value })} className="w-full px-4 py-2.5 rounded-xl border border-slate-200 bg-white" required>
                                    <option value="">Select Category...</option>
                                    {categories.map((cat, idx) => <option key={idx} value={cat}>{cat}</option>)}
                                </select>
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                                <div><label className="block text-xs font-bold text-slate-500 mb-1 uppercase">Start Date <span className="text-red-500">*</span></label><input type="date" max={today} required value={privateReportForm.startDate} onChange={e => setPrivateReportForm({ ...privateReportForm, startDate: e.target.value })} onClick={(e) => e.currentTarget.showPicker()} className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm" /></div>
                                <div><label className="block text-xs font-bold text-slate-500 mb-1 uppercase">Finish Date <span className="text-red-500">*</span></label><input type="date" required readOnly value={privateReportForm.finishDate} className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm bg-slate-50 text-slate-500 cursor-not-allowed" /></div>
                            </div>
                            <div>
                                <label className="block text-sm font-semibold text-slate-700 mb-1">Review Link</label>
                                <input type="url" value={privateReportForm.link} onChange={e => setPrivateReportForm({ ...privateReportForm, link: e.target.value })} className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-blue-500" placeholder="Goodreads / GDrive link..." />
                            </div>
                            <div>
                                <label className="block text-sm font-bold text-slate-500 mb-1 uppercase text-xs">Cover Photo Evidence <span className="text-red-500">*</span></label>
                                <div className="space-y-3">
                                    <div className="flex items-center gap-3">
                                        <div className="relative overflow-hidden cursor-pointer bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-lg p-2 transition-colors">
                                            <input type="file" onChange={(e) => handleFileChange(e, 'privateReport')} className="absolute inset-0 opacity-0 cursor-pointer" accept="image/*" />
                                            <Upload size={18} className="text-slate-500" />
                                        </div>
                                        <span className={`text-xs ${privateFile ? 'text-green-600 font-bold' : 'text-slate-400'}`}>{privateFile ? 'Photo Selected' : 'Select cover photo'}</span>
                                    </div>
                                    {privatePreview && (
                                        <div className="relative w-full h-48 rounded-xl overflow-hidden border border-slate-200 shadow-sm group">
                                            <img src={privatePreview} alt="Preview" className="w-full h-full object-cover" />
                                            <button type="button" onClick={() => { setPrivateFile(null); setPrivatePreview(''); }} className="absolute top-2 right-2 bg-red-500 text-white p-1.5 rounded-full opacity-0 group-hover:opacity-100 transition-opacity shadow-lg"><XCircle size={16} /></button>
                                        </div>
                                    )}
                                </div>
                            </div>
                            <button type="submit" disabled={isLoading} className="w-full px-4 py-3 rounded-xl font-bold shadow-lg transition-all flex items-center justify-center gap-2 text-white bg-purple-600 hover:bg-purple-700">{isLoading ? 'Saving...' : 'Save'}</button>
                        </form>
                    </div>
                </div>

                {/* List */}
                <div className="lg:col-span-2 space-y-4">
                    <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
                        <div className="p-4 border-b border-slate-100 flex gap-3">
                            <div className="relative flex-1">
                                <Search className="absolute left-3 top-2.5 text-slate-400" size={18} />
                                <input type="text" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder="Search logs..." className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500" />
                            </div>
                            <div className="flex items-center gap-2">
                                <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} className="pl-3 pr-8 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold text-slate-600 outline-none cursor-pointer">
                                    <option value="all">All Status</option>
                                    <option value="Reading">Reading</option>
                                    <option value="Finished">Read</option>
                                    <option value="Approved">Approved</option>
                                    <option value="Pending">Under Review</option>
                                    <option value="Rejected">Rejected</option>
                                    <option value="Cancelled">Cancel</option>
                                </select>
                            </div>
                        </div>
                        <div className="divide-y divide-slate-50">
                            {paginatedLogs.length === 0 ? (
                                <div className="p-12 text-center text-slate-400"><BookOpen size={48} className="mx-auto mb-3 opacity-20" /><p>No logs found.</p></div>
                            ) : (
                                paginatedLogs.map((log) => {
                                    const isMyLog = (!!log.employee_id && !!user.employee_id && log.employee_id === user.employee_id) || (!log.employee_id && log.userName === user.name);
                                    return (
                                        <div key={log.id} className={`p-4 hover:bg-slate-50 transition-colors flex items-start gap-4 group ${log.status === 'Cancelled' ? 'opacity-60 bg-slate-50/50' : ''}`}>
                                            <div className={`p-3 rounded-xl ${log.status === 'Finished' ? 'bg-green-50 text-green-600' : log.status === 'Cancelled' ? 'bg-red-50 text-red-400' : 'bg-blue-50 text-blue-600'}`}>
                                                {log.status === 'Finished' ? <Trophy size={20} /> : log.status === 'Cancelled' ? <XCircle size={20} /> : <Book size={20} />}
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <h3 onClick={() => openDetailModal(log)} className="font-semibold text-slate-800 truncate cursor-pointer hover:text-blue-600 transition-colors mb-1">{log.title}</h3>
                                                <p className="text-sm text-slate-500 truncate">{log.category} • {log.location || 'Medan'}</p>
                                                <div className="mt-2 p-2 bg-slate-50 rounded-lg border border-slate-100 text-xs">
                                                    {log.status === 'Finished' ? (
                                                        <div className="flex flex-col gap-1">
                                                            <div className="flex items-center gap-2 text-slate-500 font-medium">
                                                                <span>Start: {new Date(log.startDate || log.date).toLocaleString('en-US', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
                                                                <span>•</span>
                                                                <span>Finish: {log.finishDate ? new Date(log.finishDate).toLocaleString('en-US', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '-'}</span>
                                                                {log.startDate && log.finishDate && (
                                                                    <span className="ml-2 text-[8px] whitespace-nowrap font-black bg-indigo-600 text-white px-1 py-0.5 rounded shadow-sm inline-flex items-center gap-1">
                                                                        <Clock size={8} />
                                                                        {(() => {
                                                                            const s = new Date(log.startDate).getTime();
                                                                            const e = new Date(log.finishDate).getTime();
                                                                            const diff = Math.max(0, e - s);
                                                                            const totalMinutes = Math.floor(diff / (1000 * 60));
                                                                            const days = Math.floor(totalMinutes / (24 * 60));
                                                                            const hours = Math.floor((totalMinutes % (24 * 60)) / 60);
                                                                            const minutes = totalMinutes % 60;
                                                                            return `${days}D ${hours}H ${minutes}M`;
                                                                        })()}
                                                                    </span>
                                                                )}
                                                            </div>
                                                            <div className={`mt-1 font-bold uppercase tracking-wider ${log.hrApprovalStatus === 'Approved' ? 'text-blue-600 font-black' : (log.hrApprovalStatus === 'Pending' ? 'text-yellow-600' : 'text-slate-400')}`}>
                                                                {log.hrApprovalStatus === 'Approved' ? `Approved ${log.approvedBy ? `by ${log.approvedBy}` : ''}` : (log.hrApprovalStatus === 'Pending' ? 'Under Review' : 'Draft')}
                                                            </div>
                                                        </div>
                                                    ) : log.status === 'Cancelled' ? (
                                                        <span className="font-bold text-red-500 uppercase">Log Cancelled</span>
                                                    ) : (
                                                        <span className="font-bold text-orange-600 uppercase">Reading (Started: {new Date(log.date).toLocaleString('en-US', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })})</span>
                                                    )}
                                                </div>
                                            </div>
                                            <div className="flex flex-col items-end gap-2">
                                                {isMyLog && log.hrApprovalStatus === 'Draft' && log.status !== 'Cancelled' && (
                                                    <div className="flex gap-2">
                                                        {log.status === 'Reading' ? (
                                                            <button onClick={(e) => { e.stopPropagation(); openClaimModal(log); }} className="px-3 py-1 text-[10px] font-bold bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-all">Finish</button>
                                                        ) : (
                                                            <button onClick={(e) => { e.stopPropagation(); handleClaimIncentive(log.id); }} className="px-3 py-1 text-[10px] font-bold bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-all">Claim</button>
                                                        )}
                                                        <button onClick={(e) => { e.stopPropagation(); handleDelete(log.id); }} className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg"><Trash2 size={14} /></button>
                                                    </div>
                                                )}
                                                {log.hrApprovalStatus && log.hrApprovalStatus !== 'Draft' && (
                                                    <span className={`px-2 py-0.5 text-[10px] font-bold rounded-md ${log.hrApprovalStatus === 'Approved' ? 'bg-blue-100 text-blue-700' : (log.hrApprovalStatus === 'Rejected' ? 'bg-red-100 text-red-700' : 'bg-yellow-100 text-yellow-700')}`}>
                                                        {log.hrApprovalStatus === 'Pending' ? 'Review' : log.hrApprovalStatus}
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                    );
                                })
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
                            <div><h3 className="text-xl font-bold text-slate-800">{selectedLog ? `Finish: ${selectedLog.title}` : 'Claim Reading'}</h3><p className="text-sm text-slate-500">Submit details for verification</p></div>
                            <button onClick={() => setClaimModalOpen(false)} className="text-slate-400 hover:text-slate-600"><XCircle size={24} /></button>
                        </div>
                        <form onSubmit={handleClaimSubmit} className="p-6 space-y-4 overflow-y-auto">
                            {!selectedLog && (
                                <>
                                    <div><label className="block text-sm font-semibold text-slate-700 mb-1">Book Title <span className="text-red-500">*</span></label><input required value={claimForm.title} onChange={e => setClaimForm({ ...claimForm, title: e.target.value })} className="w-full px-4 py-2 border border-slate-200 rounded-xl outline-none" placeholder="Title..." /></div>
                                    <div><label className="block text-sm font-semibold text-slate-700 mb-1">Category</label><select value={claimForm.category} onChange={e => setClaimForm({ ...claimForm, category: e.target.value })} className="w-full px-4 py-2 border border-slate-200 rounded-xl bg-white" required><option value="">Select Category...</option>{categories.map((cat, idx) => <option key={idx} value={cat}>{cat}</option>)}</select></div>
                                </>
                            )}
                            <div className="grid grid-cols-2 gap-4">
                                <div><label className="block text-sm font-semibold text-slate-700 mb-1">Start Date <span className="text-red-500">*</span></label><input type="datetime-local" required disabled={!!selectedLog} value={claimForm.startDate} onChange={e => setClaimForm({ ...claimForm, startDate: e.target.value })} className="w-full px-4 py-2 border border-slate-200 rounded-xl" /></div>
                                <div><label className="block text-sm font-semibold text-slate-700 mb-1">Finish Date <span className="text-red-500">*</span></label><input type="date" required readOnly value={claimForm.finishDate} className="w-full px-4 py-2 border border-slate-200 rounded-xl bg-slate-50" /></div>
                            </div>
                            <div>
                                <label className="block text-sm font-semibold text-slate-700 mb-1">Review Link <span className="text-red-500">*</span></label>
                                <input type="url" required value={claimForm.link} onChange={e => setClaimForm({ ...claimForm, link: e.target.value })} className="w-full px-4 py-2 border border-slate-200 rounded-xl outline-none" placeholder="GDrive / Blog link..." />
                            </div>
                            <div>
                                <label className="block text-sm font-semibold text-slate-700 mb-1">Evidence Photo <span className="text-red-500">*</span></label>
                                <div className="space-y-3">
                                    <div className="border-2 border-dashed border-slate-300 rounded-xl p-4 text-center hover:bg-slate-50 relative">
                                        <input type="file" onChange={(e) => handleFileChange(e, 'claimFinish')} className="absolute inset-0 opacity-0 cursor-pointer" accept="image/*" />
                                        {claimFile ? (<div className="flex items-center justify-center gap-2 text-green-600 font-bold"><CheckCircle size={18} /> Photo Selected</div>) : (<span className="text-slate-500 text-sm">Click to select photo</span>)}
                                    </div>
                                    {claimPreview && (
                                        <div className="relative h-40 rounded-xl overflow-hidden border">
                                            <img src={claimPreview} alt="Preview" className="w-full h-full object-cover" />
                                            <button type="button" onClick={() => { setClaimFile(null); setClaimPreview(''); }} className="absolute top-2 right-2 bg-red-500 text-white p-1 rounded-full"><XCircle size={14} /></button>
                                        </div>
                                    )}
                                </div>
                            </div>
                            <div className="pt-4 flex gap-3">
                                <button type="button" onClick={() => setClaimModalOpen(false)} className="flex-1 px-4 py-3 bg-slate-100 text-slate-600 font-bold rounded-xl outline-none">Cancel</button>
                                <button type="submit" disabled={isLoading} className="flex-1 px-4 py-3 bg-green-600 text-white font-bold rounded-xl shadow-lg">{isLoading ? 'Sending...' : 'Claim / Report'}</button>
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
                            <div>
                                <h3 className="text-xl font-bold text-slate-800">{viewLog.title}</h3>
                                <p className="text-sm text-slate-500 mt-1">{viewLog.category} • {viewLog.source || 'Private'}</p>
                            </div>
                            <button onClick={() => setDetailModalOpen(false)} className="text-slate-400 hover:text-slate-600"><XCircle size={24} /></button>
                        </div>
                        <div className="p-6 overflow-y-auto space-y-4">
                            <div className="grid grid-cols-2 gap-3">
                                <div className="bg-slate-50 p-3 rounded-xl border">
                                    <div className="text-[10px] font-bold text-slate-500 uppercase mb-1">Status</div>
                                    <div className={`font-semibold ${viewLog.status === 'Finished' ? 'text-green-600' : 'text-blue-600'}`}>{viewLog.status === 'Finished' ? 'Read' : viewLog.status}</div>
                                </div>
                                <div className="bg-slate-50 p-3 rounded-xl border">
                                    <div className="text-[10px] font-bold text-slate-500 uppercase mb-1">HR Approval</div>
                                    <div className="font-semibold text-slate-700">{viewLog.hrApprovalStatus || 'Draft'}</div>
                                </div>
                            </div>

                            {viewLog.rejectionReason && (
                                <div className="bg-red-50 p-3 rounded-xl border border-red-100">
                                    <div className="text-[10px] font-bold text-red-600 uppercase mb-1 flex justify-between items-center">
                                        <span>Note</span>
                                        {viewLog.cancelledAt && (
                                            <span className="text-[9px] opacity-60 normal-case flex items-center gap-1">
                                                <Clock size={10} /> {new Date(viewLog.cancelledAt).toLocaleString('en-US', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                                            </span>
                                        )}
                                    </div>
                                    <p className="text-sm text-red-800 italic">"{viewLog.rejectionReason}"</p>
                                    {viewLog.cancelledBy && (
                                        <div className="mt-2 text-[10px] text-red-600/70 font-bold flex items-center gap-1">
                                            <span>• By: {viewLog.cancelledBy}</span>
                                        </div>
                                    )}
                                </div>
                            )}

                            <div className="space-y-2 text-sm">
                                <div className="flex justify-between py-1 border-b border-slate-50">
                                    <span className="text-slate-500">Start Date</span>
                                    <span className="font-semibold">{new Date(viewLog.startDate || viewLog.date).toLocaleString('en-US', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
                                </div>
                                {viewLog.finishDate && (
                                    <div className="flex justify-between py-1 border-b border-slate-50 items-center">
                                        <span className="text-slate-500">Finish Date</span>
                                        <div className="flex items-center gap-2">
                                            <span className="font-semibold">{new Date(viewLog.finishDate).toLocaleString('en-US', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
                                            {viewLog.startDate && viewLog.finishDate && (
                                                <span className="text-[9px] whitespace-nowrap font-black bg-indigo-600 text-white px-1.5 py-0.5 rounded shadow-sm flex items-center gap-1">
                                                    <Clock size={10} />
                                                    {(() => {
                                                        const s = new Date(viewLog.startDate).getTime();
                                                        const e = new Date(viewLog.finishDate).getTime();
                                                        const diff = Math.max(0, e - s);
                                                        const totalMinutes = Math.floor(diff / (1000 * 60));
                                                        const days = Math.floor(totalMinutes / (24 * 60));
                                                        const hours = Math.floor((totalMinutes % (24 * 60)) / 60);
                                                        const minutes = totalMinutes % 60;
                                                        return `${days}D ${hours}H ${minutes}M`;
                                                    })()}
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                )}
                                {viewLog.hrApprovalStatus === 'Approved' && (
                                    <>
                                        <div className="flex justify-between py-1 border-b border-slate-50">
                                            <span className="text-slate-500">Approved by</span>
                                            <span className="font-semibold text-blue-600">{viewLog.approvedBy || 'HR Administrator'}</span>
                                        </div>
                                        {viewLog.approvedAt && (
                                            <div className="flex justify-between py-1 border-b border-slate-50">
                                                <span className="text-slate-500">Approved time</span>
                                                <span className="font-semibold text-slate-700">{new Date(viewLog.approvedAt).toLocaleString('en-US', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
                                            </div>
                                        )}
                                    </>
                                )}
                                {viewLog.link && (
                                    <div className="pt-2">
                                        <div className="text-[10px] font-bold text-slate-500 uppercase mb-1">Review Link</div>
                                        <a href={viewLog.link} target="_blank" rel="noreferrer" className="text-blue-600 hover:underline break-all">{viewLog.link}</a>
                                    </div>
                                )}
                                {viewLog.evidenceUrl && (
                                    <div className="pt-2">
                                        <div className="text-[10px] font-bold text-slate-500 uppercase mb-2">Evidence Photo</div>
                                        <img src={getFullImageUrl(viewLog.evidenceUrl)} className="w-full rounded-xl border" alt="Evidence" />
                                    </div>
                                )}
                                {viewLog.returnEvidenceUrl && (
                                    <div className="pt-2">
                                        <div className="text-[10px] font-bold text-slate-500 uppercase mb-2">Return Evidence Photo</div>
                                        <img src={getFullImageUrl(viewLog.returnEvidenceUrl)} className="w-full rounded-xl border" alt="Return Evidence" />
                                    </div>
                                )}
                            </div>
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
                confirmText={confirmConfig.confirmText}
                cancelText={confirmConfig.cancelText}
                variant={confirmConfig.variant}
                hideConfirm={confirmConfig.hideConfirm}
                showInput={confirmConfig.showInput}
                inputPlaceholder={confirmConfig.inputPlaceholder}
                inputValue={cancelNote}
                onInputChange={(val) => setCancelNote(val)}
            />
        </div>
    );
};

export default ReadingLogPage;
