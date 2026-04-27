import { useState, useEffect } from 'react';
import { ArrowLeft, Search, CheckCircle, XCircle, Clock, Edit, ExternalLink, Image as ImageIcon, Trash2, RefreshCw, BookOpen, Trophy, ArrowUp, ArrowDown } from 'lucide-react';
import { API_BASE_URL } from '../config';
import type { ReadingLogEntry, User, Employee } from '../types';

interface AdminReadingLogProps {
    onBack: () => void;
    user: User;
}

const AdminReadingLog = ({ onBack, user }: AdminReadingLogProps) => {
    const [allLogs, setAllLogs] = useState<ReadingLogEntry[]>([]);
    const [users, setUsers] = useState<User[]>([]);
    const [searchTerm, setSearchTerm] = useState('');
    const [startDate, setStartDate] = useState(() => {
        const y = new Date().getFullYear();
        return `${y}-01-01`;
    });
    const [endDate, setEndDate] = useState(() => {
        const y = new Date().getFullYear();
        return `${y}-12-31`;
    });
    const [selectedBranch, setSelectedBranch] = useState('All Branches');
    const [branches, setBranches] = useState<string[]>(['All Branches']);
    const [filterStatus, setFilterStatus] = useState('Under Review');
    const [isSyncing, setIsSyncing] = useState(false);

    // View Mode State - Default to verification as previously requested
    const [viewMode, setViewMode] = useState<'verification' | 'recap'>('verification');




    // Verification Modal State
    const [verifyModal, setVerifyModal] = useState<{ open: boolean; log: ReadingLogEntry | null; category: 'comic' | 'text'; reward: number }>({
        open: false,
        log: null,
        category: 'text',
        reward: 100000
    });

    // Rejection Modal State
    const [rejectModal, setRejectModal] = useState<{ open: boolean; log: ReadingLogEntry | null; reason: string }>({
        open: false,
        log: null,
        reason: ''
    });

    // Edit Log Modal State
    const [editLogModal, setEditLogModal] = useState<{ open: boolean; log: ReadingLogEntry | null; formData: Partial<ReadingLogEntry> }>({
        open: false,
        log: null,
        formData: {}
    });

    // Cancel Modal State (Admin)
    const [cancelModal, setCancelModal] = useState<{ open: boolean; log: ReadingLogEntry | null; reason: string }>({
        open: false,
        log: null,
        reason: ''
    });

    const [recapModal, setRecapModal] = useState<{ open: boolean; title: string; logs: ReadingLogEntry[] }>({
        open: false,
        title: '',
        logs: []
    });

    const [recapSort, setRecapSort] = useState<{ key: 'name' | 'totalBooks' | 'verifiedCount' | 'milestone' | 'incentive', direction: 'asc' | 'desc' }>({
        key: 'incentive',
        direction: 'desc'
    });

    // Photo Modal State
    const [photoModal, setPhotoModal] = useState<{ open: boolean; log: ReadingLogEntry | null }>({
        open: false,
        log: null
    });


    const fetchBranches = () => {
        fetch(`${API_BASE_URL}/api/branches`)
            .then(res => res.json())
            .then(data => {
                if (Array.isArray(data)) {
                    const names = ['All Branches', ...data.map((b: any) => b.name)];
                    setBranches(names);
                }
            })
            .catch(err => console.error(err));
    };

    const fetchLogs = () => {
        fetch(`${API_BASE_URL}/api/logs`)
            .then(res => res.json())
            .then(data => {
                if (Array.isArray(data)) setAllLogs(data);
                else setAllLogs([]);
            })
            .catch(err => console.error(err));
    };

    const fetchUsers = () => {
        fetch(`${API_BASE_URL}/api/employees`)
            .then(res => res.json())
            .then(data => {
                if (Array.isArray(data)) {
                    const mapped: User[] = data.map((emp: Employee) => ({
                        id: emp.id_employee,
                        employee_id: emp.id_employee,
                        name: emp.full_name,
                        email: emp.email,
                        branch: emp.branch_name,
                        role: emp.job_position?.includes('HR') ? 'HR' : (emp.job_position?.includes('Supervisor') ? 'SUPERVISOR' : 'STAFF')
                    }));
                    setUsers(mapped);
                }
            })
            .catch(err => console.error(err));
    };

    useEffect(() => {
        fetchBranches();
        fetchLogs();
        fetchUsers();

        // Silent background sync on mount
        const silentSync = async () => {
            try {
                await fetch(`${API_BASE_URL}/api/simas/sync`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ employee_id: 'all' })
                });
                fetchLogs(); // Refresh again after sync
            } catch (err) {
                console.error("Silent sync failed", err);
            }
        };
        silentSync();
    }, []);

    const handleSyncSIMAS = async () => {
        if (isSyncing) return;
        setIsSyncing(true);
        try {
            const res = await fetch(`${API_BASE_URL}/api/simas/sync`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ employee_id: 'all' })
            });
            if (res.ok) {
                alert('SIMAS data synchronization successful!');
                fetchLogs(); // Refresh the list
            } else {
                alert('Failed to synchronize SIMAS data.');
            }
        } catch (error) {
            console.error(error);
            alert('Error during data synchronization.');
        } finally {
            setIsSyncing(false);
        }
    };

    const handleVerifyClick = (log: ReadingLogEntry) => {
        const y = new Date(log.finishDate || log.date).getFullYear();
        const key = `${log.employee_id || log.userName || 'unknown'}_${y}`;
        const currentSeq = (approvedCounts[key] || 0) + 1;

        let reward = log.category?.toLowerCase().includes('komik') ? 50000 : 100000;
        if (currentSeq === 5) {
            reward += 500000;
        }

        setVerifyModal({
            open: true,
            log: log,
            category: log.category?.toLowerCase().includes('komik') ? 'comic' : 'text',
            reward: reward
        });
    };

    const handleRejectClick = (log: ReadingLogEntry) => {
        setRejectModal({ open: true, log: log, reason: '' });
    };

    const handleVerifySubmit = async () => {
        if (!verifyModal.log) return;
        try {
            const now = new Date().toISOString();
            const res = await fetch(`${API_BASE_URL}/api/logs/${verifyModal.log.id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    hrApprovalStatus: 'Approved',
                    managedCategory: verifyModal.category === 'comic' ? 'Non-Fiksi Komik/Manga' : 'Non-Fiksi Text',
                    incentiveAmount: verifyModal.reward,
                    approvedBy: user.name || 'Admin',
                    approvedAt: now
                })
            });

            if (res.ok) {
                const updated = await res.json();
                setAllLogs(allLogs.map(l => l.id === updated.id ? {
                    ...updated,
                    approvedBy: user.name || 'Admin',
                    approvedAt: now
                } : l));
                setVerifyModal(prev => ({ ...prev, open: false }));
            }
        } catch (err) { console.error(err); }
    };

    const handleRejectSubmit = async () => {
        if (!rejectModal.log) return;
        try {
            const now = new Date().toISOString();
            const res = await fetch(`${API_BASE_URL}/api/logs/${rejectModal.log.id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    hrApprovalStatus: 'Rejected',
                    rejectionReason: rejectModal.reason,
                    cancelledBy: user.name || 'Admin',
                    cancelledAt: now
                })
            });

            if (res.ok) {
                const updated = await res.json();
                setAllLogs(allLogs.map(l => l.id === updated.id ? {
                    ...updated,
                    cancelledBy: user.name || 'Admin',
                    cancelledAt: now
                } : l));
                setRejectModal(prev => ({ ...prev, open: false }));
            }
        } catch (err) { console.error(err); }
    };

    const handleEditLogClick = (log: ReadingLogEntry) => {
        setEditLogModal({
            open: true,
            log,
            formData: {
                title: log.title,
                date: log.date,
                startDate: log.startDate,
                finishDate: log.finishDate,
                link: log.link || log.review,
                evidenceUrl: log.evidenceUrl,
                category: log.category
            }
        });
    };

    const handleEditLogSubmit = async () => {
        if (!editLogModal.log) return;
        try {
            const res = await fetch(`${API_BASE_URL}/api/logs/${editLogModal.log.id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(editLogModal.formData)
            });

            if (res.ok) {
                const updated = await res.json();
                setAllLogs(allLogs.map(l => l.id === updated.id ? updated : l));
                setEditLogModal({ open: false, log: null, formData: {} });
            }
        } catch (err) { console.error(err); }
    };

    const handleCancelClick = (log: ReadingLogEntry) => {
        setCancelModal({ open: true, log, reason: '' });
    };

    const handleCancelSubmit = () => {
        if (!cancelModal.log) return;

        const finalReason = cancelModal.reason || 'Cancelled by Admin';
        const cancelBy = user?.name || user?.employee_id || 'Admin';
        
        console.log('--- CANCEL ACTION ---', { id: cancelModal.log.id, by: cancelBy, finalReason });

        fetch(`${API_BASE_URL}/api/logs/${cancelModal.log.id}/cancel`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ reason: finalReason, cancelledBy: cancelBy })
        })
            .then(res => {
                if (res.ok) {
                    setAllLogs(allLogs.map(l => l.id === cancelModal.log!.id
                        ? { ...l, status: 'Cancelled', hrApprovalStatus: 'Cancelled' as any, rejectionReason: finalReason, cancelledAt: new Date().toISOString(), cancelledBy: cancelBy }
                        : l
                    ));
                    setCancelModal({ open: false, log: null, reason: '' });
                }
            })
            .catch(err => console.error(err));
    };

    const handleDeleteLog = async (id: number | string) => {
        if (!window.confirm('Are you sure you want to cancel this report? The data will remain stored but will not be counted in reports.')) return;
        try {
            const res = await fetch(`${API_BASE_URL}/api/logs/${id}`, { method: 'DELETE' });
            if (res.ok) {
                setAllLogs(allLogs.map(log => String(log.id) === String(id) ? { ...log, status: 'Cancelled', hrApprovalStatus: 'Cancelled' as 'Cancelled' } : log));
                setTimeout(() => {
                    window.location.reload();
                }, 1000);
            } else {
                alert('Failed to cancel report');
            }
        } catch (error) {
            console.error(error);
            alert('Error while cancelling report');
        }
    };



    const formatCurrency = (val: number) => new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(val);

    const getPeriodDates = () => {
        return [new Date(startDate), new Date(endDate + 'T23:59:59')];
    };

    const areSameUser = (u1: { employee_id?: any, name?: string }, u2: { employee_id?: any, name?: string, userName?: string }) => {
        const id1 = u1.employee_id ? String(u1.employee_id).replace(/^0+/, '') : '';
        const id2 = u2.employee_id ? String(u2.employee_id).replace(/^0+/, '') : '';
        if (id1 && id2 && id1 === id2) return true;

        const n1 = (u1.name || '').trim().toLowerCase();
        const n2 = (u2.name || u2.userName || '').trim().toLowerCase();
        return n1 !== '' && n1 === n2;
    };

    const getLogSequence = (log: ReadingLogEntry) => {
        if (log.status === 'Reading') return 0;
        const logDateObj = new Date(log.finishDate || log.date);
        const y = logDateObj.getFullYear();

        // Filter all logs for this user/year from the global state
        const userYearLogs = allLogs.filter(l => {
            if (!areSameUser({ employee_id: log.employee_id, name: log.userName }, l)) return false;
            if (l.status === 'Reading') return false; // Don't count ongoing reads in the sequence
            const lY = new Date(l.finishDate || l.date).getFullYear();
            return lY === y;
        });

        // Split into categories and sort chronologically
        const approvedLogs = userYearLogs
            .filter(l => l.hrApprovalStatus === 'Approved')
            .sort((a, b) => {
                const dateA = new Date(a.finishDate || a.date).getTime();
                const dateB = new Date(b.finishDate || b.date).getTime();
                if (dateA !== dateB) return dateA - dateB;
                return Number(a.id) - Number(b.id);
            });

        const pendingLogs = userYearLogs
            .filter(l => l.hrApprovalStatus === 'Pending')
            .sort((a, b) => {
                const dateA = new Date(a.finishDate || a.date).getTime();
                const dateB = new Date(b.finishDate || b.date).getTime();
                if (dateA !== dateB) return dateA - dateB;
                return Number(a.id) - Number(b.id);
            });

        if (log.hrApprovalStatus === 'Approved') {
            const idx = approvedLogs.findIndex(l => l.id === log.id);
            return idx !== -1 ? idx + 1 : 0;
        } else if (log.hrApprovalStatus === 'Pending') {
            const pIdx = pendingLogs.findIndex(l => l.id === log.id);
            return approvedLogs.length + (pIdx !== -1 ? pIdx + 1 : 1);
        }
        return 0; // Draft or Rejected or Cancelled usually won't need sequence in this table
    };

    const getUserStats = (user: User) => {
        const currentYear = new Date(endDate).getFullYear();

        // Data 1 Tahun Full
        const userYearLogs = allLogs.filter(l => {
            if (!areSameUser(user, l)) return false;
            if (l.status === 'Reading') return false;
            const logDate = new Date(l.finishDate || l.date);
            return logDate.getFullYear() === currentYear;
        });

        // Data Periode Range - Sekarang menggunakan TANGGAL APPROVED
        const userRangeLogs = allLogs.filter(l => {
            if (!areSameUser(user, l)) return false;
            if (l.hrApprovalStatus !== 'Approved') return false; // Hanya hitung yang sudah approved untuk range insentif
            
            // Gunakan approvedAt, jika tidak ada (data lama) fallback ke finishDate/date
            const approvalDateStr = l.approvedAt || l.finishDate || l.date;
            const logDate = new Date(approvalDateStr);
            
            const start = new Date(startDate);
            start.setHours(0, 0, 0, 0);
            const end = new Date(endDate);
            end.setHours(23, 59, 59, 999);
            
            return logDate >= start && logDate <= end;
        });

        const totalIncentiveRange = userRangeLogs.reduce((sum, l) => {
            if (l.hrApprovalStatus !== 'Approved') return sum;

            // Forced conversion and robust fallback
            const dbAmount = Number(l.incentiveAmount);
            const amount = (!isNaN(dbAmount) && dbAmount > 0)
                ? dbAmount
                : (l.category?.toLowerCase() === 'comic' ? 50000 : 100000);

            return sum + amount;
        }, 0);

        return {
            totalBooksYear: userYearLogs.filter(l => l.status !== 'Cancelled').length,
            verifiedCountYear: userYearLogs.filter(l => l.hrApprovalStatus === 'Approved' && l.status !== 'Cancelled').length,
            verifiedCountRange: userRangeLogs.filter(l => l.hrApprovalStatus === 'Approved' && l.status !== 'Cancelled').length,
            totalIncentiveRange,
            logsYear: userYearLogs.filter(l => l.status !== 'Cancelled'),
            logsRange: userRangeLogs.filter(l => l.status !== 'Cancelled')
        };
    };

    const filteredUsers = users.filter(user => {
        const matchesSearch = user.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
            user.email.toLowerCase().includes(searchTerm.toLowerCase());
        const matchesBranch = selectedBranch === 'All Branches' || user.branch === selectedBranch;
        return matchesSearch && matchesBranch;
    });

    const approvedCounts = allLogs.reduce((acc: Record<string, number>, log) => {
        if (log.hrApprovalStatus === 'Approved') {
            const y = new Date(log.finishDate || log.date).getFullYear();
            const key = `${log.employee_id || log.userName || 'unknown'}_${y}`;
            acc[key] = (acc[key] || 0) + 1;
        }
        return acc;
    }, {});
    const verificationLogs = allLogs
        .filter(l => {
            if (filterStatus !== 'all') {
                if (filterStatus === 'Reading') {
                    // Sedang Baca = Statusnya Reading DAN belum ada tanggal selesai
                    if (l.finishDate || l.status !== 'Reading') return false;
                } else if (filterStatus === 'Read') {
                    // Selesai Baca = Sudah ada tanggal selesai DAN status Draft
                    if (!l.finishDate || (l.hrApprovalStatus !== 'Draft' && !!l.hrApprovalStatus)) return false;
                } else if (filterStatus === 'Approved') {
                    if (l.hrApprovalStatus !== 'Approved') return false;
                } else if (filterStatus === 'Under Review') {
                    if (!l.finishDate || l.hrApprovalStatus !== 'Pending') return false;
                } else if (filterStatus === 'Cancel') {
                    if (l.status !== 'Cancelled') return false;
                } else if (filterStatus === 'Rejected HRD') {
                    if (l.hrApprovalStatus !== 'Rejected') return false;
                }
            }

            // Always hide Cancelled logs from standard verification unless filtered for them
            if (filterStatus === 'all' && l.status === 'Cancelled') return false;
            if (filterStatus !== 'Cancel' && l.status === 'Cancelled') return false;

            const emp = users.find(u => (l.employee_id && u.employee_id === l.employee_id) || (l.userName && u.name && l.userName.trim().toLowerCase() === u.name.trim().toLowerCase()));
            const empBranch = emp?.branch || 'Others';
            if (selectedBranch !== 'All Branches' && empBranch !== selectedBranch) return false;

            const dateToCheck = l.finishDate || l.date;
            const d = new Date(dateToCheck);
            const [start, end] = getPeriodDates();

            if (d < start || d > end) return false;

            // 4. Search Filter
            const s = searchTerm.trim().toLowerCase();
            if (s) {
                const logName = (l.userName || '').toLowerCase();
                const matchedName = (emp?.name || '').toLowerCase();
                const matchedEmail = (emp?.email || '').toLowerCase();

                const matches = logName.includes(s) ||
                    matchedName.includes(s) ||
                    matchedEmail.includes(s) ||
                    (l.title || '').toLowerCase().includes(s);

                if (!matches) return false;
            }

            return true;
        })
        .sort((a, b) => {
            if (a.hrApprovalStatus === 'Pending' && b.hrApprovalStatus !== 'Pending') return -1;
            if (a.hrApprovalStatus !== 'Pending' && b.hrApprovalStatus === 'Pending') return 1;
            // Within same status, sort by ID ascending so 1/5 appears first
            return Number(a.id) - Number(b.id);
        });

    return (
        <div className="space-y-6 animate-fade-in relative min-h-screen pb-20">
            <div className="flex flex-col gap-4">
                <button onClick={onBack} className="flex items-center text-slate-500 hover:text-slate-800 transition-colors w-fit group">
                    <ArrowLeft size={20} className="mr-2 group-hover:-translate-x-1 transition-transform" /> Back to Dashboard
                </button>

                <div className="flex flex-col md:flex-row justify-between items-end md:items-center gap-4">
                    <div>
                        <h1 className="text-2xl font-bold text-slate-800">Reading Log Management</h1>
                        <p className="text-slate-500">Manage validations and view reading statistics.</p>
                    </div>
                    <div className="flex items-center gap-3">
                        <button
                            onClick={handleSyncSIMAS}
                            disabled={isSyncing}
                            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold transition-all shadow-sm border ${isSyncing ? 'bg-slate-50 text-slate-400 border-slate-200' : 'bg-white text-emerald-600 border-emerald-100 hover:bg-emerald-50 hover:border-emerald-200'}`}
                            title="Fetch latest book loan data from SIMAS for all employees"
                        >
                            <RefreshCw size={18} className={isSyncing ? 'animate-spin' : ''} />
                            {isSyncing ? 'Syncing...' : 'Sync SIMAS Data'}
                        </button>
                        <div className="bg-slate-100 p-1 rounded-xl flex shadow-inner">
                            <button 
                                onClick={() => {
                                    setViewMode('verification');
                                    // Reset to Full Year for Verification
                                    const y = new Date().getFullYear();
                                    setStartDate(`${y}-01-01`);
                                    setEndDate(`${y}-12-31`);
                                }} 
                                className={`px-4 py-2 rounded-lg text-sm font-bold transition-all ${viewMode === 'verification' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                            >
                                Verification
                            </button>
                            <button 
                                onClick={() => {
                                    setViewMode('recap');
                                    // Reset to Rolling Cycle for Recap
                                    const now = new Date();
                                    const d = now.getDate() >= 26 
                                        ? new Date(now.getFullYear(), now.getMonth(), 26)
                                        : new Date(now.getFullYear(), now.getMonth() - 1, 26);
                                    const ed = now.getDate() >= 26
                                        ? new Date(now.getFullYear(), now.getMonth() + 1, 25)
                                        : new Date(now.getFullYear(), now.getMonth(), 25);
                                    
                                    setStartDate(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`);
                                    setEndDate(`${ed.getFullYear()}-${String(ed.getMonth() + 1).padStart(2, '0')}-${String(ed.getDate()).padStart(2, '0')}`);
                                }} 
                                className={`px-4 py-2 rounded-lg text-sm font-bold transition-all ${viewMode === 'recap' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                            >
                                Recapitulation
                            </button>
                        </div>
                    </div>
                </div>
            </div>

            <div className="bg-white p-4 rounded-2xl shadow-sm border border-slate-200 flex flex-wrap gap-4 items-center mb-6">
                <div className="flex flex-wrap gap-2 items-center">
                    <select value={selectedBranch} onChange={(e) => setSelectedBranch(e.target.value)} className="px-4 py-2.5 rounded-xl border border-slate-200 font-bold text-slate-600 text-sm outline-none focus:ring-2 focus:ring-blue-500 bg-white min-w-[150px]">
                        {branches.map(b => <option key={b} value={b}>{b}</option>)}
                    </select>
                    <div className="flex items-center gap-2 bg-slate-50 px-3 py-1 rounded-xl border border-slate-100">
                        <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} onClick={(e) => e.currentTarget.showPicker()} className="bg-transparent border-none font-bold text-slate-600 text-xs outline-none focus:ring-0 cursor-pointer" />
                        <span className="text-slate-400 font-medium text-xs">to</span>
                        <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} onClick={(e) => e.currentTarget.showPicker()} className="bg-transparent border-none font-bold text-slate-600 text-xs outline-none focus:ring-0 cursor-pointer" />
                    </div>
                    {viewMode === 'verification' && (
                        <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} className="px-4 py-2.5 rounded-xl border border-slate-200 font-bold text-slate-600 text-sm outline-none focus:ring-2 focus:ring-blue-500 bg-white">
                            <option value="all">All Status</option>
                            <option value="Reading">Reading</option>
                            <option value="Read">Read</option>
                            <option value="Approved">Approved</option>
                            <option value="Under Review">Under Review</option>
                            <option value="Rejected HRD">Rejected HRD</option>
                            <option value="Cancel">Cancel</option>
                        </select>
                    )}
                </div>
                <div className="relative flex-1 min-w-[200px]">
                    <Search className="absolute left-4 top-3.5 text-slate-400" size={18} />
                    <input type="text" placeholder="Search Name, Title..." className="w-full pl-11 pr-4 py-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-blue-500 outline-none font-medium text-slate-600 text-sm" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
                </div>
            </div>

            {viewMode === 'recap' && (
                <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden animate-in slide-in-from-bottom-4 fade-in">
                    <div className="overflow-x-auto">
                        <table className="w-full text-left">
                            <thead className="bg-white text-xs uppercase text-slate-500 font-bold border-b border-slate-100">
                                <tr>
                                    <th className="px-6 py-4 w-[30%] cursor-pointer hover:bg-slate-50 transition-colors" onClick={() => setRecapSort({ key: 'name', direction: recapSort.key === 'name' && recapSort.direction === 'asc' ? 'desc' : 'asc' })}>
                                        <div className="flex items-center gap-1.5">
                                            Name / Email {recapSort.key === 'name' && (recapSort.direction === 'asc' ? <ArrowUp size={14} /> : <ArrowDown size={14} />)}
                                        </div>
                                    </th>
                                    <th className="px-6 py-4 w-[15%]">Role</th>
                                    <th className="px-6 py-4 w-[25%] cursor-pointer hover:bg-slate-50 transition-colors" onClick={() => setRecapSort({ key: 'totalBooks', direction: recapSort.key === 'totalBooks' && recapSort.direction === 'asc' ? 'desc' : 'asc' })}>
                                        <div className="flex items-center gap-1.5">
                                            Books Read {recapSort.key === 'totalBooks' && (recapSort.direction === 'asc' ? <ArrowUp size={14} /> : <ArrowDown size={14} />)}
                                        </div>
                                    </th>
                                    <th className="px-6 py-4 w-[20%] cursor-pointer hover:bg-slate-50 transition-colors" onClick={() => setRecapSort({ key: 'milestone', direction: recapSort.key === 'milestone' && recapSort.direction === 'asc' ? 'desc' : 'asc' })}>
                                        <div className="flex items-center gap-1.5">
                                            Bonus Status {recapSort.key === 'milestone' && (recapSort.direction === 'asc' ? <ArrowUp size={14} /> : <ArrowDown size={14} />)}
                                        </div>
                                    </th>
                                    <th className="px-6 py-4 w-[20%] cursor-pointer hover:bg-slate-50 transition-colors" onClick={() => setRecapSort({ key: 'incentive', direction: recapSort.key === 'incentive' && recapSort.direction === 'asc' ? 'desc' : 'asc' })}>
                                        <div className="flex items-center gap-1.5 justify-end">
                                            Total Incentive {new Date(endDate).toLocaleString('en-US', { month: 'short' })} {recapSort.key === 'incentive' && (recapSort.direction === 'asc' ? <ArrowUp size={14} /> : <ArrowDown size={14} />)}
                                        </div>
                                    </th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-50">
                                {(() => {
                                    const processedUsers = filteredUsers.map(user => ({
                                        user,
                                        stats: getUserStats(user)
                                    }));

                                    processedUsers.sort((a, b) => {
                                        let valA: any, valB: any;
                                        if (recapSort.key === 'name') {
                                            valA = a.user.name.toLowerCase();
                                            valB = b.user.name.toLowerCase();
                                        } else if (recapSort.key === 'totalBooks') {
                                            valA = a.stats.totalBooksYear;
                                            valB = b.stats.totalBooksYear;
                                        } else if (recapSort.key === 'verifiedCount') {
                                            valA = a.stats.verifiedCountRange;
                                            valB = b.stats.verifiedCountRange;
                                        } else if (recapSort.key === 'milestone') {
                                            valA = a.stats.verifiedCountYear;
                                            valB = b.stats.verifiedCountYear;
                                        } else if (recapSort.key === 'incentive') {
                                            valA = a.stats.totalIncentiveRange;
                                            valB = b.stats.totalIncentiveRange;
                                        }

                                        if (valA < valB) return recapSort.direction === 'asc' ? -1 : 1;
                                        if (valA > valB) return recapSort.direction === 'asc' ? 1 : -1;
                                        return 0;
                                    });

                                    return processedUsers.map(({ user, stats }) => {
                                        const isEligible = stats.verifiedCountYear >= 5;
                                        const remaining = 5 - stats.verifiedCountYear;
                                        return (
                                            <tr key={user.employee_id || user.email} className="hover:bg-slate-50 transition-colors group">
                                                <td className="px-6 py-4">
                                                    <div><p className="font-bold text-slate-800">{user.name}</p><p className="text-xs text-slate-400">{user.email}</p></div>
                                                </td>
                                                <td className="px-6 py-4">
                                                    <span className={`px-2 py-1 rounded text-[10px] font-bold uppercase ${user.role === 'HR' || user.role === 'HR_ADMIN' ? 'bg-purple-100 text-purple-700' : user.role === 'SUPERVISOR' ? 'bg-blue-100 text-blue-700' : 'bg-green-100 text-green-700'}`}>{user.role?.replace('_', ' ') || 'STAFF'}</span>
                                                </td>
                                                <td className="px-6 py-4">
                                                    <div className="flex items-center gap-2">
                                                        <button
                                                            className="group flex items-center gap-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500 rounded-lg px-3 py-1.5 bg-white border border-slate-200 hover:border-blue-300 hover:bg-blue-50 hover:shadow-sm transition-all active:scale-95"
                                                            onClick={() => setRecapModal({ open: true, title: `Books Read by ${user.name} in ${new Date(endDate).getFullYear()}`, logs: stats.logsYear })}
                                                        >
                                                            <span className="text-slate-800 font-bold text-lg group-hover:text-blue-700 transition-colors">{stats.totalBooksYear}</span>
                                                            <span className="text-slate-500 text-sm group-hover:text-blue-600 transition-colors">Books</span>
                                                        </button>
                                                        {stats.verifiedCountRange > 0 && (
                                                            <button
                                                                className="group flex items-center gap-1 focus:outline-none focus:ring-2 focus:ring-green-500 rounded-lg px-2.5 py-1.5 bg-green-50 border border-green-200 hover:border-green-400 hover:bg-green-100 hover:shadow-sm transition-all active:scale-95 text-green-700 text-xs font-bold whitespace-nowrap"
                                                                onClick={() => setRecapModal({ open: true, title: `Verified Books for ${user.name} (Selected Range)`, logs: stats.logsRange.filter(l => l.hrApprovalStatus === 'Approved') })}
                                                            >
                                                                <CheckCircle size={14} className="text-green-500 group-hover:text-green-600 transition-colors" />
                                                                {stats.verifiedCountRange} Verified {new Date(endDate).toLocaleString('en-US', { month: 'short' })}
                                                            </button>
                                                        )}
                                                    </div>
                                                </td>
                                                <td className="px-6 py-4">
                                                    <div className="flex flex-col gap-1 items-start">
                                                        {isEligible ? (
                                                            <span className="flex items-center gap-1.5 text-white bg-green-600 font-black text-[10px] px-2.5 py-1 rounded-full uppercase shadow-sm border border-green-500 animate-pulse">
                                                                <Trophy size={12} /> Milestone Passed!
                                                            </span>
                                                        ) : (
                                                            <div className="flex flex-col">
                                                                <span className="flex items-center gap-1 text-slate-500 text-[11px] font-bold italic">
                                                                    <Clock size={12} /> {remaining > 0 ? `${remaining} more to bonus` : 'Pending Review'}
                                                                </span>
                                                                <div className="w-24 h-1.5 bg-slate-100 rounded-full mt-1 overflow-hidden">
                                                                    <div className="h-full bg-blue-500 rounded-full" style={{ width: `${(stats.verifiedCountYear / 5) * 100}%` }}></div>
                                                                </div>
                                                            </div>
                                                        )}
                                                    </div>
                                                </td>
                                                <td className="px-6 py-4">
                                                    {stats.totalIncentiveRange > 0 ? (
                                                        <div className="flex flex-col items-end">
                                                            <span className="text-green-700 font-black text-sm bg-green-50 px-2.5 py-1 rounded-lg border border-green-200 shadow-sm">
                                                                {formatCurrency(stats.totalIncentiveRange)}
                                                            </span>
                                                        </div>
                                                    ) : (
                                                        <div className="text-slate-300 text-sm font-medium italic text-right">-</div>
                                                    )}
                                                </td>
                                            </tr>
                                        );
                                    });
                                })()}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {viewMode === 'verification' && (
                <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden animate-in slide-in-from-bottom-4 fade-in">
                    <div className="p-4 border-b border-slate-100 bg-slate-50/50 flex justify-between items-center">
                        <h3 className="font-bold text-slate-700 flex items-center gap-2"><CheckCircle size={18} className="text-orange-500" /> Pending Verifications & History</h3>
                    </div>
                    <div className="overflow-x-auto">
                        <table className="w-full text-left">
                            <thead className="bg-slate-50 text-slate-500 font-semibold uppercase text-xs">
                                <tr>
                                    <th className="px-6 py-4">Employee</th>
                                    <th className="px-6 py-4">Book #</th>
                                    <th className="px-6 py-4">Book Title / Source</th>
                                    <th className="px-6 py-4">Start Date</th>
                                    <th className="px-6 py-4">Finish Date</th>

                                    <th className="px-6 py-4">Status</th>
                                    <th className="px-6 py-4 text-center">Action</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {verificationLogs.map((log) => (
                                    <tr key={log.id} className="hover:bg-slate-50 transition-colors">
                                        <td className="px-6 py-4"><div><p className="font-bold text-slate-700 text-sm">{log.userName || 'Unknown'}</p><p className="text-xs text-slate-400">Staff</p></div></td>
                                        <td className="px-6 py-4">
                                            {(() => {
                                                const currentSeq = getLogSequence(log);
                                                if (currentSeq === 0) return <span className="text-slate-400">-</span>;
                                                const isApproved = log.hrApprovalStatus === 'Approved';

                                                return (
                                                    <div className="flex flex-col items-center justify-center">
                                                        <div className="flex items-center gap-1.5">
                                                            <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded border uppercase transition-colors ${isApproved
                                                                    ? 'bg-indigo-50 text-indigo-700 border-indigo-100'
                                                                    : 'bg-slate-50 text-slate-500 border-slate-100'
                                                                }`}>
                                                                {isApproved ? 'Verified' : 'Target'}
                                                            </span>
                                                        </div>
                                                        <span className={`text-sm font-black mt-1 whitespace-nowrap ${currentSeq === 5 ? 'text-orange-600' : currentSeq > 5 ? 'text-red-500' : 'text-slate-700'}`}>
                                                            {!isApproved ? 'To ' : ''}{currentSeq} / 5
                                                        </span>
                                                        <span className="text-[9px] text-slate-400 font-medium mt-0.5">Year {new Date(log.finishDate || log.date).getFullYear()}</span>
                                                        {currentSeq === 5 && log.hrApprovalStatus === 'Pending' && (
                                                            <span className="text-[9px] font-extrabold text-white bg-orange-500 px-1.5 rounded-full uppercase mt-1 animate-bounce shadow-sm">Bonus!</span>
                                                        )}
                                                        {currentSeq > 5 && (
                                                            <span className="text-[9px] font-bold text-red-500 uppercase mt-1">Limit!</span>
                                                        )}
                                                    </div>
                                                );
                                            })()}
                                        </td>
                                        <td className="px-6 py-4"><div className="flex flex-col gap-1"><span className="font-semibold text-slate-800 text-sm">{log.title}</span><span className="text-xs text-slate-500">{log.category}</span><span className={`text-[10px] font-bold px-2 py-0.5 rounded w-fit ${log.source === 'Buku Pribadi' ? 'bg-purple-100 text-purple-700 border border-purple-200' : 'bg-blue-100 text-blue-700 border border-blue-200'}`}>{log.source === 'Buku Pribadi' ? 'Private' : (log.source === 'SIMAS' ? 'SIMAS' : 'Office')}</span></div></td>
                                        <td className="px-6 py-4 text-sm text-slate-600">
                                            {log.startDate ? new Date(log.startDate).toLocaleString('en-US', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '-'}
                                        </td>
                                        <td className="px-6 py-4 text-sm text-slate-600">
                                            <div className="flex flex-col gap-1">
                                                <span>{log.finishDate ? new Date(log.finishDate).toLocaleString('en-US', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '-'}</span>
                                                {log.startDate && log.finishDate && (
                                                    <span className="text-[9px] whitespace-nowrap font-black bg-indigo-600 text-white px-1.5 py-0.5 rounded shadow-sm flex items-center gap-1 w-fit">
                                                        <Clock size={10} />
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
                                        </td>

                                        <td className="px-6 py-4">
                                            <span className={`px-2 py-1 rounded text-[10px] font-bold uppercase border ${
                                                log.status === 'Reading' ? 'bg-orange-50 text-orange-600 border-orange-100' :
                                                log.hrApprovalStatus === 'Approved' ? 'bg-indigo-100 text-indigo-700 border-indigo-200' : 
                                                log.hrApprovalStatus === 'Rejected' ? 'bg-red-100 text-red-700 border-red-200' : 
                                                log.hrApprovalStatus === 'Pending' ? 'bg-orange-100 text-orange-700 border-orange-200' : 
                                                'bg-slate-100 text-slate-500 border-slate-200'
                                            }`}>
                                                {log.status === 'Reading' ? 'Reading' : (log.hrApprovalStatus === 'Pending' ? 'Under Review' : ((log.hrApprovalStatus as any) === 'Draft' || !log.hrApprovalStatus ? 'Read' : log.hrApprovalStatus))}
                                            </span>
                                            {log.incentiveAmount && (
                                                <div className="text-[10px] font-bold text-green-600 mt-1">
                                                    {(() => {
                                                        const seq = getLogSequence(log);
                                                        if (seq === 5 && log.incentiveAmount > 500000) {
                                                            const base = log.incentiveAmount - 500000;
                                                            return `${base.toLocaleString('id-ID')} + 500.000 = ${formatCurrency(log.incentiveAmount)}`;
                                                        }
                                                        return formatCurrency(log.incentiveAmount);
                                                    })()}
                                                </div>
                                            )}
                                        </td>
                                        <td className="px-6 py-4 text-center">
                                            {log.status === 'Reading' ? (
                                                <span className="text-xs text-slate-300 italic">-</span>
                                            ) : log.status !== 'Cancelled' ? (
                                                <div className="flex justify-center gap-2">
                                                     {log.hrApprovalStatus === 'Pending' ? (
                                                        (() => {
                                                            const currentSeq = getLogSequence(log);
                                                            if (currentSeq <= 5) {
                                                                return (
                                                                    <div className="grid grid-cols-2 gap-2 min-w-[180px]">
                                                                        <button 
                                                                            onClick={() => handleVerifyClick(log)} 
                                                                            className="flex items-center justify-center gap-1.5 px-2 py-1.5 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-all shadow-sm font-bold text-[11px]" 
                                                                            title="Verify & Reward"
                                                                        >
                                                                            <CheckCircle size={13} /> Verify
                                                                        </button>
                                                                        <button 
                                                                            onClick={() => handleEditLogClick(log)} 
                                                                            className="flex items-center justify-center gap-1.5 px-2 py-1.5 bg-slate-50 text-slate-600 rounded-lg hover:bg-slate-100 transition-colors font-bold text-[11px] border border-slate-200" 
                                                                            title="Edit Details"
                                                                        >
                                                                            <Edit size={13} /> Edit
                                                                        </button>
                                                                        <button 
                                                                            onClick={() => handleRejectClick(log)} 
                                                                            className="flex items-center justify-center gap-1.5 px-2 py-1.5 bg-rose-50 text-rose-700 rounded-lg hover:bg-rose-100 transition-colors font-bold text-[11px] border border-rose-100" 
                                                                            title="Reject Report"
                                                                        >
                                                                            <XCircle size={13} /> Reject
                                                                        </button>
                                                                        <button 
                                                                            onClick={() => handleCancelClick(log)} 
                                                                            className="flex items-center justify-center gap-1.5 px-2 py-1.5 bg-white text-slate-400 rounded-lg hover:bg-slate-50 transition-colors font-bold text-[11px] border border-slate-100" 
                                                                            title="Cancel Log"
                                                                        >
                                                                            <Trash2 size={13} /> Cancel
                                                                        </button>
                                                                    </div>
                                                                );
                                                            } else {
                                                                return (
                                                                    <div className="flex flex-col items-center">
                                                                        <span className="text-xs text-red-500 font-bold italic">Limit Exceeded ({currentSeq}/5)</span>
                                                                        <div className="flex items-center gap-2 mt-1">
                                                                            <button onClick={() => handleCancelClick(log)} className="p-1.5 bg-slate-100 text-slate-500 rounded hover:bg-slate-200" title="Cancel Log"><Trash2 size={12} /></button>
                                                                            <button onClick={() => handleRejectClick(log)} className="text-[10px] text-red-600 hover:underline flex items-center gap-1"><XCircle size={10} /> Reject Over Limit</button>
                                                                        </div>
                                                                    </div>
                                                                );
                                                            }
                                                        })()
                                                    ) : (
                                                        /* For Draft or finished logs not yet in Pending mode */
                                                        <button onClick={() => handleCancelClick(log)} className="p-2 bg-slate-100 text-slate-500 rounded-lg hover:bg-red-50 hover:text-red-500 transition-all border border-slate-200 hover:border-red-200" title="Cancel / Delete Report">
                                                            <Trash2 size={16} />
                                                        </button>
                                                    )}
                                                </div>
                                            ) : (
                                                <span className="text-xs text-slate-300 font-bold uppercase tracking-wider italic">Cancelled</span>
                                            )}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}
            {/* Verify Modal */}
            {verifyModal.open && verifyModal.log && (
                <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                    <div className="bg-white rounded-2xl w-full max-w-md p-6 animate-in fade-in zoom-in duration-200 max-h-[90vh] overflow-y-auto pr-2">
                        <div className="flex justify-between items-center mb-6">
                            <h3 className="text-xl font-bold text-slate-800 flex items-center gap-2"><CheckCircle className="text-green-500" /> Verify Reading Log</h3>
                            <button onClick={() => setVerifyModal({ open: false, log: null, category: 'text', reward: 0 })} className="text-slate-400 hover:text-slate-600"><XCircle /></button>
                        </div>
                        <div className="space-y-4">
                            {(() => {
                                const y = new Date(verifyModal.log.finishDate || verifyModal.log.date).getFullYear();
                                const key = `${verifyModal.log.employee_id || verifyModal.log.userName || 'unknown'}_${y}`;
                                const currentSeq = (approvedCounts[key] || 0) + 1;
                                if (currentSeq === 5) {
                                    return (
                                        <div className="bg-orange-50 border border-orange-200 p-3 rounded-xl flex items-start gap-3 animate-pulse">
                                            <Trophy size={20} className="text-orange-500 mt-1" />
                                            <div>
                                                <p className="text-sm font-bold text-orange-800">Milestone #5 Detected!</p>
                                                <p className="text-xs text-orange-600">This user will receive an additional Rp 500,000 bonus.</p>
                                            </div>
                                        </div>
                                    );
                                }
                                return (
                                    <div className="bg-blue-50 border border-blue-100 p-3 rounded-xl flex items-center gap-2">
                                        <BookOpen size={16} className="text-blue-500" />
                                        <p className="text-xs font-bold text-blue-700">Verified Book #{currentSeq} Year {y}</p>
                                    </div>
                                );
                            })()}

                            <div className="bg-slate-50 p-4 rounded-xl border border-slate-100 flex flex-col gap-3">
                                 <div className="flex flex-col gap-1">
                                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Book Details</p>
                                    <p className="font-bold text-slate-800 text-sm leading-tight">{verifyModal.log.title}</p>
                                    <div className="flex items-center gap-2 mt-1">
                                        <span className="text-xs text-slate-500 font-medium">{verifyModal.log.category}</span>
                                        <span className="text-slate-300">•</span>
                                        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded border ${verifyModal.log.source === 'Buku Pribadi' ? 'bg-purple-100 text-purple-700 border-purple-200' : 'bg-blue-100 text-blue-700 border-blue-200'}`}>
                                            {verifyModal.log.source === 'Buku Pribadi' ? 'Private' : (verifyModal.log.source === 'SIMAS' ? 'SIMAS' : 'Office')}
                                        </span>
                                        {verifyModal.log.sn && (
                                            <>
                                                <span className="text-slate-300">•</span>
                                                <span className="text-[10px] font-bold text-slate-500 bg-slate-200 px-1.5 py-0.5 rounded">SN: {verifyModal.log.sn}</span>
                                            </>
                                        )}
                                    </div>
                                </div>

                                {/* Approved Books History Section */}
                                {(() => {
                                    const y = new Date(verifyModal.log.finishDate || verifyModal.log.date).getFullYear();
                                    const approvedLogs = allLogs.filter(l => 
                                        areSameUser(verifyModal.log!, l) && 
                                        l.hrApprovalStatus === 'Approved' && 
                                        new Date(l.finishDate || l.date).getFullYear() === y
                                    ).sort((a, b) => new Date(a.finishDate || a.date).getTime() - new Date(b.finishDate || b.date).getTime());

                                    if (approvedLogs.length === 0) return null;

                                    return (
                                        <div className="pt-2 border-t border-slate-200/60">
                                            <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-2">Previously Approved in {y} ({approvedLogs.length})</p>
                                            <div className="space-y-1.5 max-h-[120px] overflow-y-auto pr-1 custom-scrollbar">
                                                {approvedLogs.map((appLog, idx) => (
                                                    <div key={appLog.id} className="flex items-start gap-2 p-2 rounded-lg bg-emerald-50/50 border border-emerald-100/50">
                                                        <div className="min-w-[18px] h-[18px] rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center text-[9px] font-black mt-0.5">
                                                            {idx + 1}
                                                        </div>
                                                        <div className="flex-1">
                                                            <p className="text-[10px] font-bold text-slate-700 leading-tight">{appLog.title}</p>
                                                            <div className="flex items-center gap-1.5 mt-0.5">
                                                                <p className="text-[8px] text-slate-400 font-medium">{new Date(appLog.finishDate || appLog.date).toLocaleDateString('en-US', { day: 'numeric', month: 'short' })}</p>
                                                                <span className="text-slate-300 text-[8px]">•</span>
                                                                <span className="text-[8px] font-bold text-emerald-600">{formatCurrency(appLog.incentiveAmount || 0)}</span>
                                                            </div>
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    );
                                })()}

                                {/* Dates Grid */}
                                <div className="grid grid-cols-2 gap-4 pt-2 border-t border-slate-200/60">
                                    <div>
                                        <p className="text-[9px] font-bold text-slate-400 uppercase">Start / Borrow</p>
                                        <p className="text-xs font-bold text-slate-700">{verifyModal.log.startDate ? new Date(verifyModal.log.startDate).toLocaleString('en-US', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '-'}</p>
                                    </div>
                                    <div>
                                        <p className="text-[9px] font-bold text-slate-400 uppercase">Finish / Return</p>
                                        <div className="flex items-center gap-2">
                                            <p className="text-xs font-bold text-slate-700">{verifyModal.log.finishDate ? new Date(verifyModal.log.finishDate).toLocaleString('en-US', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '-'}</p>
                                            {verifyModal.log.startDate && verifyModal.log.finishDate && (
                                                <span className="text-[10px] whitespace-nowrap font-black bg-indigo-600 text-white px-1.5 py-0.5 rounded-md shadow-sm flex items-center gap-1">
                                                    <Clock size={10} />
                                                    {(() => {
                                                        const s = new Date(verifyModal.log.startDate).getTime();
                                                        const e = new Date(verifyModal.log.finishDate).getTime();
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
                                </div>

                                {/* Review Link */}
                                {(verifyModal.log.link || verifyModal.log.review) && (
                                    <div className="pt-2 border-t border-slate-200/60">
                                        <p className="text-[9px] font-bold text-slate-400 uppercase mb-1">Review Link / Goodreads</p>
                                        <a 
                                            href={verifyModal.log.link || verifyModal.log.review} 
                                            target="_blank" 
                                            rel="noreferrer" 
                                            className="text-blue-600 text-[11px] font-bold hover:underline flex items-center gap-1 w-fit"
                                        >
                                            <ExternalLink size={12} /> Open Review Link
                                        </a>
                                    </div>
                                )}

                                {/* Evidence Thumbnails */}
                                {(verifyModal.log.evidenceUrl || verifyModal.log.returnEvidenceUrl) && (
                                    <div className="pt-2 border-t border-slate-200/60 flex gap-3">
                                        {verifyModal.log.evidenceUrl && (
                                            <div className="flex-1">
                                                <p className="text-[9px] font-bold text-slate-400 uppercase mb-1">Borrow Evidence</p>
                                                <div className="relative group cursor-zoom-in" onClick={() => setPhotoModal({ open: true, log: verifyModal.log })}>
                                                    <img 
                                                        src={verifyModal.log.evidenceUrl.startsWith('http') ? verifyModal.log.evidenceUrl : `${API_BASE_URL}${verifyModal.log.evidenceUrl}`} 
                                                        alt="Borrow Evidence" 
                                                        className="w-full h-14 object-cover rounded-lg border border-slate-200 shadow-sm transition-transform group-hover:scale-[1.02]"
                                                    />
                                                    <div className="absolute inset-0 bg-black/20 opacity-0 group-hover:opacity-100 transition-opacity rounded-lg flex items-center justify-center">
                                                        <ImageIcon size={16} className="text-white" />
                                                    </div>
                                                </div>
                                            </div>
                                        )}
                                        {verifyModal.log.returnEvidenceUrl && (
                                            <div className="flex-1">
                                                <p className="text-[9px] font-bold text-slate-400 uppercase mb-1">Return Evidence</p>
                                                <div className="relative group cursor-zoom-in" onClick={() => setPhotoModal({ open: true, log: verifyModal.log })}>
                                                    <img 
                                                        src={verifyModal.log.returnEvidenceUrl.startsWith('http') ? verifyModal.log.returnEvidenceUrl : `${API_BASE_URL}${verifyModal.log.returnEvidenceUrl}`} 
                                                        alt="Return Evidence" 
                                                        className="w-full h-14 object-cover rounded-lg border border-slate-200 shadow-sm transition-transform group-hover:scale-[1.02]"
                                                    />
                                                    <div className="absolute inset-0 bg-black/20 opacity-0 group-hover:opacity-100 transition-opacity rounded-lg flex items-center justify-center">
                                                        <ImageIcon size={16} className="text-white" />
                                                    </div>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                            <div>
                                <label className="block text-sm font-bold text-slate-700 mb-1">Book Category</label>
                                <select
                                    className="w-full px-4 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none"
                                    value={verifyModal.category}
                                    onChange={(e) => {
                                        const y = new Date(verifyModal.log!.finishDate || verifyModal.log!.date).getFullYear();
                                        const key = `${verifyModal.log!.employee_id || verifyModal.log!.userName || 'unknown'}_${y}`;
                                        const isFifth = ((approvedCounts[key] || 0) + 1) === 5;
                                        setVerifyModal(prev => ({
                                            ...prev,
                                            category: e.target.value as any,
                                            reward: (e.target.value === 'comic' ? 50000 : 100000) + (isFifth ? 500000 : 0)
                                        }));
                                    }}
                                >
                                    <option value="text">Non-Fiction Text</option>
                                    <option value="comic">Non-Fiction Comic/Manga</option>
                                </select>
                            </div>
                            <div>
                                <label className="block text-sm font-bold text-slate-700 mb-1">Incentive Amount (Rp)</label>
                                <input
                                    type="number"
                                    className="w-full px-4 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none font-bold text-green-700 bg-green-50/30"
                                    value={verifyModal.reward}
                                    onChange={(e) => setVerifyModal(prev => ({ ...prev, reward: Number(e.target.value) }))}
                                />
                            </div>
                        </div>
                        <div className="mt-6 flex justify-end gap-3">
                            <button onClick={() => setVerifyModal({ open: false, log: null, category: 'text', reward: 0 })} className="px-4 py-2 text-slate-600 font-bold hover:bg-slate-100 rounded-xl">Cancel</button>
                            <button onClick={handleVerifySubmit} className="px-4 py-2 bg-green-600 text-white font-bold rounded-xl hover:bg-green-700">Approve & Send Reward</button>
                        </div>
                    </div>
                </div>
            )}

            {/* Reject Modal */}
            {rejectModal.open && rejectModal.log && (
                <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                    <div className="bg-white rounded-2xl w-full max-w-md p-6 animate-in fade-in zoom-in duration-200">
                        <div className="flex justify-between items-center mb-6">
                            <h3 className="text-xl font-bold text-red-600 flex items-center gap-2"><XCircle /> Reject Reading Log</h3>
                            <button onClick={() => setRejectModal({ open: false, log: null, reason: '' })} className="text-slate-400 hover:text-slate-600"><XCircle /></button>
                        </div>
                        <div>
                            <label className="block text-sm font-bold text-slate-700 mb-1">Reason for Rejection</label>
                            <textarea
                                className="w-full px-4 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-red-500 outline-none min-h-[100px]"
                                placeholder="State why this log is rejected..."
                                value={rejectModal.reason}
                                onChange={(e) => setRejectModal(prev => ({ ...prev, reason: e.target.value }))}
                            />
                        </div>
                        <div className="mt-6 flex justify-end gap-3">
                            <button onClick={() => setRejectModal({ open: false, log: null, reason: '' })} className="px-4 py-2 text-slate-600 font-bold hover:bg-slate-100 rounded-xl">Cancel</button>
                            <button onClick={handleRejectSubmit} className="px-4 py-2 bg-red-600 text-white font-bold rounded-xl hover:bg-red-700">Reject Log</button>
                        </div>
                    </div>
                </div>
            )}

            {/* Cancel Modal (Admin) */}
            {cancelModal.open && cancelModal.log && (
                <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                    <div className="bg-white rounded-2xl w-full max-w-md p-6 animate-in fade-in zoom-in duration-200">
                        <div className="flex justify-between items-center mb-6">
                            <h3 className="text-xl font-bold text-slate-700 flex items-center gap-2"><Trash2 className="text-slate-400" /> Cancel Reading Log</h3>
                            <button onClick={() => setCancelModal({ open: false, log: null, reason: '' })} className="text-slate-400 hover:text-slate-600"><XCircle /></button>
                        </div>
                        <p className="text-sm text-slate-500 mb-4">
                            Cancelling this log will remove it from the employee's reading statistics.
                        </p>
                        <div>
                            <label className="block text-sm font-bold text-slate-700 mb-1">Cancellation Reason</label>
                            <textarea
                                className="w-full px-4 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-slate-500 outline-none min-h-[100px]"
                                placeholder="Enter reason why this report is being cancelled..."
                                value={cancelModal.reason}
                                onChange={(e) => setCancelModal(prev => ({ ...prev, reason: e.target.value }))}
                            />
                        </div>
                        <div className="mt-6 flex justify-end gap-3">
                            <button onClick={() => setCancelModal({ open: false, log: null, reason: '' })} className="px-4 py-2 text-slate-600 font-bold hover:bg-slate-100 rounded-xl">Discard</button>
                            <button onClick={handleCancelSubmit} className="px-4 py-2 bg-slate-800 text-white font-bold rounded-xl hover:bg-slate-900 shadow-lg">Yes, Cancel Report</button>
                        </div>
                    </div>
                </div>
            )}

            {/* Edit Modal */}
            {editLogModal.open && editLogModal.log && (
                <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                    <div className="bg-white rounded-2xl w-full max-w-md p-6 animate-in fade-in zoom-in duration-200">
                        <div className="flex justify-between items-center mb-6">
                            <h3 className="text-xl font-bold text-slate-800 flex items-center gap-2"><Edit className="text-blue-500" /> Edit Reading Log</h3>
                            <button onClick={() => setEditLogModal({ open: false, log: null, formData: {} })} className="text-slate-400 hover:text-slate-600"><XCircle /></button>
                        </div>
                        <div className="space-y-4 max-h-[60vh] overflow-y-auto pr-2">
                            <div>
                                <label className="block text-sm font-bold text-slate-700 mb-1">Title</label>
                                <input type="text" className="w-full px-4 py-2 border border-slate-200 rounded-xl" value={editLogModal.formData.title || ''} onChange={e => setEditLogModal(prev => ({ ...prev, formData: { ...prev.formData, title: e.target.value } }))} />
                            </div>
                            <div>
                                <label className="block text-sm font-bold text-slate-700 mb-1">Start Date</label>
                                <input type="date" className="w-full px-4 py-2 border border-slate-200 rounded-xl" value={editLogModal.formData.startDate?.split('T')[0] || editLogModal.formData.date?.split('T')[0] || ''} onChange={e => setEditLogModal(prev => ({ ...prev, formData: { ...prev.formData, startDate: e.target.value } }))} />
                            </div>
                            <div>
                                <label className="block text-sm font-bold text-slate-700 mb-1">Finish Date</label>
                                <input type="date" className="w-full px-4 py-2 border border-slate-200 rounded-xl" value={editLogModal.formData.finishDate?.split('T')[0] || ''} onChange={e => setEditLogModal(prev => ({ ...prev, formData: { ...prev.formData, finishDate: e.target.value } }))} />
                            </div>
                            <div>
                                <label className="block text-sm font-bold text-slate-700 mb-1">Evidence URL / Image</label>
                                <input type="text" className="w-full px-4 py-2 border border-slate-200 rounded-xl" value={editLogModal.formData.evidenceUrl || ''} onChange={e => setEditLogModal(prev => ({ ...prev, formData: { ...prev.formData, evidenceUrl: e.target.value } }))} />
                            </div>
                            <div>
                                <label className="block text-sm font-bold text-slate-700 mb-1">Goodreads / Review Link</label>
                                <input type="text" className="w-full px-4 py-2 border border-slate-200 rounded-xl" value={editLogModal.formData.link || ''} onChange={e => setEditLogModal(prev => ({ ...prev, formData: { ...prev.formData, link: e.target.value } }))} />
                            </div>
                        </div>
                        <div className="mt-6 flex justify-between gap-3">
                            <button onClick={() => handleDeleteLog(editLogModal.log!.id)} className="px-4 py-2 text-red-600 font-bold hover:bg-red-50 rounded-xl border border-red-200 flex items-center"><Trash2 size={16} className="mr-2" /> Delete</button>
                            <div className="flex gap-2">
                                <button onClick={() => setEditLogModal({ open: false, log: null, formData: {} })} className="px-4 py-2 text-slate-600 font-bold hover:bg-slate-100 rounded-xl">Cancel</button>
                                <button onClick={handleEditLogSubmit} className="px-4 py-2 bg-blue-600 text-white font-bold rounded-xl hover:bg-blue-700">Save Changes</button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
            {/* Photo Modal */}
            {photoModal.open && photoModal.log && (
                <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                    <div className="bg-white rounded-2xl w-full max-w-2xl p-6 relative max-h-[90vh] overflow-y-auto animate-in fade-in zoom-in duration-200">
                        <button onClick={() => setPhotoModal({ open: false, log: null })} className="absolute top-4 right-4 text-slate-400 hover:text-slate-600 bg-white rounded-full p-1 shadow-sm">
                            <XCircle size={24} />
                        </button>
                        <h3 className="text-xl font-bold text-slate-800 mb-6 pr-8">Evidence Photos for {photoModal.log.title}</h3>

                        <div className="flex flex-col gap-6">
                            {photoModal.log.evidenceUrl && (
                                <div className="bg-slate-50 p-4 rounded-xl border border-slate-100">
                                    <p className="font-bold text-slate-700 mb-3 flex items-center gap-2">
                                        <ImageIcon className="text-blue-500" size={18} />
                                        {photoModal.log.source === 'SIMAS' ? 'Borrowing Evidence Photo' : 'Evidence Photo'}
                                    </p>
                                    <img src={photoModal.log.evidenceUrl.startsWith('http') ? photoModal.log.evidenceUrl : `${API_BASE_URL}${photoModal.log.evidenceUrl}`} alt="Borrowing" className="w-full h-auto max-h-[500px] object-contain rounded-lg border border-slate-200 shadow-sm bg-white" />
                                </div>
                            )}

                            {photoModal.log.returnEvidenceUrl && (
                                <div className="bg-slate-50 p-4 rounded-xl border border-slate-100">
                                    <p className="font-bold text-slate-700 mb-3 flex items-center gap-2">
                                        <ImageIcon className="text-green-500" size={18} />
                                        Return Evidence Photo
                                    </p>
                                    <img src={photoModal.log.returnEvidenceUrl.startsWith('http') ? photoModal.log.returnEvidenceUrl : `${API_BASE_URL}${photoModal.log.returnEvidenceUrl}`} alt="Return" className="w-full h-auto max-h-[500px] object-contain rounded-lg border border-slate-200 shadow-sm bg-white" />
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}
            {/* Recap Logs List Modal */}
            {recapModal.open && (
                <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm animate-in fade-in" onClick={() => setRecapModal({ ...recapModal, open: false })}>
                    <div className="bg-white rounded-2xl w-full max-w-3xl flex flex-col max-h-[85vh] animate-in fade-in zoom-in duration-200 shadow-2xl overflow-hidden" onClick={e => e.stopPropagation()}>
                        <div className="p-5 border-b border-slate-100 flex justify-between items-center bg-slate-50">
                            <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                                <BookOpen size={18} className="text-blue-600" />
                                {recapModal.title}
                            </h3>
                            <button onClick={() => setRecapModal({ ...recapModal, open: false })} className="text-slate-400 hover:text-slate-600 bg-white p-1 rounded-full shadow-sm">
                                <XCircle size={20} />
                            </button>
                        </div>
                        <div className="p-0 overflow-y-auto w-full">
                            {recapModal.logs.length === 0 ? (
                                <div className="p-8 text-center text-slate-500 italic">No books to display.</div>
                            ) : (
                                <table className="w-full text-left">
                                    <thead className="bg-white text-xs uppercase text-slate-500 font-bold border-b border-slate-100 sticky top-0 shadow-sm">
                                        <tr>
                                            <th className="px-6 py-3 text-center">Book #</th>
                                            <th className="px-6 py-3">Book Title / Category</th>
                                            <th className="px-6 py-3 text-center">Start Date</th>
                                            <th className="px-6 py-3 text-center">Finish Date</th>
                                            <th className="px-6 py-3 text-center">Date Verified</th>
                                            <th className="px-6 py-3 text-center">Incentive</th>
                                            <th className="px-6 py-3">Status</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-50">
                                        {[...recapModal.logs]
                                            .sort((a, b) => {
                                                const seqA = getLogSequence(a);
                                                const seqB = getLogSequence(b);
                                                // Handle sequence 0 (Draft/Rejected) by putting them at the bottom
                                                if (seqA === 0 && seqB === 0) return new Date(a.finishDate || a.date).getTime() - new Date(b.finishDate || b.date).getTime();
                                                if (seqA === 0) return 1;
                                                if (seqB === 0) return -1;
                                                return seqA - seqB;
                                            })
                                            .map(log => (
                                                <tr key={log.id} className="hover:bg-slate-50 transition-colors">
                                                    <td className="px-6 py-4 text-center">
                                                        {(() => {
                                                            const seq = getLogSequence(log);
                                                            if (seq === 0) return '-';
                                                            const isApproved = log.hrApprovalStatus === 'Approved';
                                                            return <span className={`text-xs font-black px-2 py-0.5 rounded border whitespace-nowrap ${seq === 5 ? 'bg-orange-50 text-orange-600 border-orange-100' : 'bg-slate-50 text-slate-700 border-slate-100'}`}>
                                                                {!isApproved ? 'To ' : ''}{seq} / 5
                                                            </span>;
                                                        })()}
                                                    </td>
                                                    <td className="px-6 py-4">
                                                        <div className="font-bold text-slate-700 text-sm whitespace-pre-wrap leading-tight">{log.title}</div>
                                                        <div className="flex flex-col gap-1.5 mt-1">
                                                            <div className="text-xs text-slate-500">
                                                                {log.category} <span className="text-slate-300 mx-1">•</span> <span className="font-medium text-slate-400 italic">{log.source === 'Buku Pribadi' ? 'Private' : 'Office'}</span>
                                                            </div>
                                                            <span className={`text-[9px] font-black px-1.5 py-0.5 rounded w-fit uppercase tracking-wider border shadow-sm ${log.source === 'Buku Pribadi'
                                                                    ? 'bg-purple-100 text-purple-700 border-purple-200'
                                                                    : 'bg-indigo-100 text-indigo-700 border-indigo-200'
                                                                }`}>
                                                                {log.source === 'Buku Pribadi' ? 'Private Reading' : 'Office Book'}
                                                            </span>
                                                        </div>
                                                    </td>
                                                    <td className="px-6 py-4 text-center">
                                                        <div className="text-sm text-slate-600">
                                                            {log.startDate ? new Date(log.startDate).toLocaleString('en-US', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '-'}
                                                        </div>
                                                    </td>
                                                    <td className="px-6 py-4">
                                                         <div className="text-sm font-medium text-slate-600">
                                                             {log.finishDate ? new Date(log.finishDate).toLocaleString('en-US', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : log.date ? new Date(log.date).toLocaleString('en-US', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '-'}
                                                         </div>
                                                    </td>
                                                    <td className="px-6 py-4 text-center">
                                                        <div className="text-sm font-bold text-indigo-600">
                                                            {log.approvedAt ? new Date(log.approvedAt).toLocaleString('en-US', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '-'}
                                                        </div>
                                                    </td>
                                                    <td className="px-6 py-4 text-center">
                                                        {log.incentiveAmount ? (
                                                            <div className="text-[10px] font-bold text-green-600 bg-green-50 px-2 py-1 rounded border border-green-100 whitespace-nowrap">
                                                                {(() => {
                                                                    const seq = getLogSequence(log);
                                                                    if (seq === 5 && log.incentiveAmount > 500000) {
                                                                        const base = log.incentiveAmount - 500000;
                                                                        return `${base.toLocaleString('id-ID')} + 500.000 = ${formatCurrency(log.incentiveAmount)}`;
                                                                    }
                                                                    return formatCurrency(log.incentiveAmount);
                                                                })()}
                                                            </div>
                                                        ) : (
                                                            <div className="text-sm text-slate-400 italic">-</div>
                                                        )}
                                                    </td>
                                                     <td className="px-6 py-4">
                                                         <div className={`px-2 py-1 rounded text-[10px] font-bold uppercase w-fit border ${
                                                             log.status === 'Reading' ? 'bg-orange-50 text-orange-600 border-orange-100' :
                                                             log.hrApprovalStatus === 'Approved' ? 'bg-indigo-100 text-indigo-700 border-indigo-200' : 
                                                             log.hrApprovalStatus === 'Rejected' ? 'bg-red-100 text-red-700 border-red-200' : 
                                                             log.hrApprovalStatus === 'Pending' ? 'bg-orange-100 text-orange-700 border-orange-200' : 
                                                             'bg-slate-100 text-slate-500 border-slate-200'
                                                         }`}>
                                                              <div className="flex flex-col gap-1">
                                                                 <span>{log.status === 'Reading' ? 'Reading' : (log.hrApprovalStatus === 'Pending' ? 'Under Review' : ((log.hrApprovalStatus as any) === 'Draft' || !log.hrApprovalStatus ? 'Read' : log.hrApprovalStatus))}</span>
                                                                 {(log.hrApprovalStatus === 'Approved' && log.approvedBy) && (
                                                                     <span className="text-[8px] opacity-70 normal-case italic">By: {log.approvedBy}</span>
                                                                 )}
                                                                 {(log.hrApprovalStatus === 'Rejected' && log.cancelledBy) && (
                                                                     <span className="text-[8px] opacity-70 normal-case italic">By: {log.cancelledBy}</span>
                                                                 )}
                                                              </div>
                                                         </div>
                                                     </td>
                                                </tr>
                                            ))}
                                    </tbody>
                                </table>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default AdminReadingLog;
