import { useState, useEffect } from 'react';
import { ArrowLeft, Search, CheckCircle, XCircle, Clock, Edit, ExternalLink, Image as ImageIcon, Trash2, RefreshCw, BookOpen, Trophy } from 'lucide-react';
import { API_BASE_URL } from '../config';
import type { ReadingLogEntry, User, Employee } from '../types';

interface AdminReadingLogProps {
    onBack: () => void;
}

const AdminReadingLog = ({ onBack }: AdminReadingLogProps) => {
    const [allLogs, setAllLogs] = useState<ReadingLogEntry[]>([]);
    const [users, setUsers] = useState<User[]>([]);
    const [searchTerm, setSearchTerm] = useState('');
    const [startDate, setStartDate] = useState(() => {
        const now = new Date();
        const d = new Date(now.getFullYear(), now.getMonth() - 1, 26);
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return `${y}-${m}-${day}`;
    });
    const [endDate, setEndDate] = useState(() => {
        const now = new Date();
        const d = new Date(now.getFullYear(), now.getMonth(), 25);
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return `${y}-${m}-${day}`;
    });
    const [selectedBranch, setSelectedBranch] = useState('All Branches');
    const [branches, setBranches] = useState<string[]>(['All Branches']);
    const [filterStatus, setFilterStatus] = useState('all');
    const [isSyncing, setIsSyncing] = useState(false);

    // View Mode State - Default to verification as previously requested
    const [viewMode, setViewMode] = useState<'verification' | 'recap'>('verification');
    const [selectedYear, setSelectedYear] = useState<number>(new Date().getFullYear());



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

    const [recapModal, setRecapModal] = useState<{ open: boolean; title: string; logs: ReadingLogEntry[] }>({
        open: false,
        title: '',
        logs: []
    });

    const [recapSort, setRecapSort] = useState<{ key: 'name' | 'totalBooks' | 'verifiedCount' | 'incentive', direction: 'asc' | 'desc' }>({
        key: 'name',
        direction: 'asc'
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
                alert('Sinkronisasi data SIMAS berhasil!');
                fetchLogs(); // Refresh the list
            } else {
                alert('Gagal melakukan sinkronisasi data SIMAS.');
            }
        } catch (error) {
            console.error(error);
            alert('Error saat sinkronisasi data.');
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
            const res = await fetch(`${API_BASE_URL}/api/logs/${verifyModal.log.id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    hrApprovalStatus: 'Approved',
                    managedCategory: verifyModal.category === 'comic' ? 'Non-Fiksi Komik/Manga' : 'Non-Fiksi Text',
                    incentiveAmount: verifyModal.reward
                })
            });

            if (res.ok) {
                const updated = await res.json();
                setAllLogs(allLogs.map(l => l.id === updated.id ? updated : l));
                setVerifyModal(prev => ({ ...prev, open: false }));
            }
        } catch (err) { console.error(err); }
    };

    const handleRejectSubmit = async () => {
        if (!rejectModal.log) return;
        try {
            const res = await fetch(`${API_BASE_URL}/api/logs/${rejectModal.log.id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    hrApprovalStatus: 'Rejected',
                    rejectionReason: rejectModal.reason
                })
            });

            if (res.ok) {
                const updated = await res.json();
                setAllLogs(allLogs.map(l => l.id === updated.id ? updated : l));
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

    const handleDeleteLog = async (id: number | string) => {
        if (!window.confirm('Apakah Anda yakin ingin membatalkan laporan ini? Data akan tetap tersimpan namun tidak terhitung dalam laporan.')) return;
        try {
            const res = await fetch(`${API_BASE_URL}/api/logs/${id}`, { method: 'DELETE' });
            if (res.ok) {
                setAllLogs(allLogs.map(log => String(log.id) === String(id) ? { ...log, status: 'Cancelled', hrApprovalStatus: 'Cancelled' as 'Cancelled' } : log));
                setTimeout(() => {
                    window.location.reload();
                }, 1000);
            } else {
                alert('Gagal membatalkan laporan');
            }
        } catch (error) {
            console.error(error);
            alert('Error saat membatalkan laporan');
        }
    };



    const formatCurrency = (val: number) => new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(val);

    const getPeriodDates = () => {
        return [new Date(startDate), new Date(endDate + 'T23:59:59')];
    };

    const getUserStats = (user: User) => {
        const userKey = user.employee_id || user.name.trim().toLowerCase();
        const currentYear = new Date(endDate).getFullYear();

        // Data 1 Tahun Full
        const userYearLogs = allLogs.filter(l => {
            const lKey = l.employee_id || (l.userName ? l.userName.trim().toLowerCase() : 'unknown');
            if (lKey !== userKey) return false;
            const logDate = new Date(l.finishDate || l.date);
            return logDate.getFullYear() === currentYear;
        });

        // Data Periode Range
        const userRangeLogs = allLogs.filter(l => {
            const lKey = l.employee_id || (l.userName ? l.userName.trim().toLowerCase() : 'unknown');
            if (lKey !== userKey) return false;
            const logDate = new Date(l.finishDate || l.date);
            const start = new Date(startDate);
            start.setHours(0, 0, 0, 0);
            const end = new Date(endDate);
            end.setHours(23, 59, 59, 999);
            return logDate >= start && logDate <= end;
        });

        return { 
            totalBooksYear: userYearLogs.length, 
            verifiedCountYear: userYearLogs.filter(l => l.hrApprovalStatus === 'Approved').length, 
            verifiedCountRange: userRangeLogs.filter(l => l.hrApprovalStatus === 'Approved').length,
            totalIncentiveRange: userRangeLogs.reduce((sum, l) => sum + (l.incentiveAmount || 0), 0), 
            logsYear: userYearLogs,
            logsRange: userRangeLogs
        };
    };

    const getLogSequence = (log: ReadingLogEntry) => {
        const y = new Date(log.finishDate || log.date).getFullYear();
        const userKey = log.employee_id || (log.userName ? log.userName.trim().toLowerCase() : 'unknown');
        
        // Filter all logs for this user/year from the global state
        const userYearLogs = allLogs.filter(l => {
            const lKey = l.employee_id || (l.userName ? l.userName.trim().toLowerCase() : 'unknown');
            const lY = new Date(l.finishDate || l.date).getFullYear();
            return lKey === userKey && lY === y;
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
                if (filterStatus === 'Sedang Baca') {
                    if (l.status !== 'Reading') return false;
                } else if (filterStatus === 'Selesai Baca') {
                    if (l.status !== 'Finished' || (l.hrApprovalStatus !== 'Draft' && !!l.hrApprovalStatus)) return false;
                } else if (filterStatus === 'Approved') {
                    if (l.hrApprovalStatus !== 'Approved') return false;
                } else if (filterStatus === 'Under Review') {
                    if (l.status !== 'Finished' || l.hrApprovalStatus !== 'Pending') return false;
                } else if (filterStatus === 'Dibatalkan') {
                    if (l.status !== 'Cancelled') return false;
                } else if (filterStatus === 'Rejected HRD') {
                    if (l.hrApprovalStatus !== 'Rejected') return false;
                }
            }
            
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
                            title="Tarik data peminjaman buku terbaru dari SIMAS untuk semua karyawan"
                        >
                            <RefreshCw size={18} className={isSyncing ? 'animate-spin' : ''} />
                            {isSyncing ? 'Syncing...' : 'Sync Data SIMAS'}
                        </button>
                        <div className="bg-slate-100 p-1 rounded-xl flex shadow-inner">
                            <button onClick={() => setViewMode('verification')} className={`px-4 py-2 rounded-lg text-sm font-bold transition-all ${viewMode === 'verification' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>Verification</button>
                            <button onClick={() => setViewMode('recap')} className={`px-4 py-2 rounded-lg text-sm font-bold transition-all ${viewMode === 'recap' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>Recapitulation</button>
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
                        <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="bg-transparent border-none font-bold text-slate-600 text-xs outline-none focus:ring-0" />
                        <span className="text-slate-400 font-medium text-xs">to</span>
                        <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="bg-transparent border-none font-bold text-slate-600 text-xs outline-none focus:ring-0" />
                    </div>
                    {viewMode === 'verification' && (
                        <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} className="px-4 py-2.5 rounded-xl border border-slate-200 font-bold text-slate-600 text-sm outline-none focus:ring-2 focus:ring-blue-500 bg-white">
                            <option value="all">All Status</option>
                            <option value="Sedang Baca">Sedang Baca</option>
                            <option value="Selesai Baca">Selesai Baca</option>
                            <option value="Approved">Approved</option>
                            <option value="Under Review">Under Review</option>
                            <option value="Rejected HRD">Rejected HRD</option>
                            <option value="Dibatalkan">Dibatalkan</option>
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
                                            Name / Email {recapSort.key === 'name' && (recapSort.direction === 'asc' ? '↑' : '↓')}
                                        </div>
                                    </th>
                                    <th className="px-6 py-4 w-[15%]">Role</th>
                                    <th className="px-6 py-4 w-[25%] cursor-pointer hover:bg-slate-50 transition-colors" onClick={() => setRecapSort({ key: 'totalBooks', direction: recapSort.key === 'totalBooks' && recapSort.direction === 'asc' ? 'desc' : 'asc' })}>
                                        <div className="flex items-center gap-1.5">
                                            Books Read {recapSort.key === 'totalBooks' && (recapSort.direction === 'asc' ? '↑' : '↓')}
                                        </div>
                                    </th>
                                    <th className="px-6 py-4 w-[30%] cursor-pointer hover:bg-slate-50 transition-colors" onClick={() => setRecapSort({ key: 'incentive', direction: recapSort.key === 'incentive' && recapSort.direction === 'asc' ? 'desc' : 'asc' })}>
                                        <div className="flex items-center gap-1.5">
                                            Status Bonus {recapSort.key === 'incentive' && (recapSort.direction === 'asc' ? '↑' : '↓')}
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
                                            <td className="px-6 py-4 text-center">
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
                                                    {stats.totalIncentiveRange > 0 && (
                                                        <div className="mt-1 flex flex-col">
                                                            <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Total Incentive</span>
                                                            <span className="text-green-700 font-black text-sm bg-green-50 px-2 py-0.5 rounded border border-green-200">
                                                                {formatCurrency(stats.totalIncentiveRange)}
                                                            </span>
                                                        </div>
                                                    )}
                                                </div>
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
                                    <th className="px-6 py-4">Evidence & Links</th>
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
                                                            <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded border uppercase transition-colors ${
                                                                isApproved 
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
                                        <td className="px-6 py-4"><div className="flex flex-col gap-1"><span className="font-semibold text-slate-800 text-sm">{log.title}</span><span className="text-xs text-slate-500">{log.category}</span><span className={`text-[10px] font-bold px-2 py-0.5 rounded w-fit ${log.source === 'Buku Pribadi' ? 'bg-purple-100 text-purple-700 border border-purple-200' : 'bg-blue-100 text-blue-700 border border-blue-200'}`}>{log.source === 'Buku Pribadi' ? 'Pribadi' : 'Office'}</span></div></td>
                                        <td className="px-6 py-4 text-sm text-slate-600">{log.startDate ? new Date(log.startDate).toLocaleDateString() : '-'}</td>
                                        <td className="px-6 py-4 text-sm text-slate-600">{log.finishDate ? new Date(log.finishDate).toLocaleDateString() : new Date(log.date).toLocaleDateString()}</td>
                                        <td className="px-6 py-4">
                                            <div className="flex flex-col gap-2">
                                                {(log.evidenceUrl || log.returnEvidenceUrl) ? (
                                                    <button onClick={() => setPhotoModal({ open: true, log })} className="flex items-center gap-1 text-blue-600 hover:text-blue-700 bg-blue-50 px-2 py-1 rounded text-xs font-bold transition-colors w-fit border border-blue-100">
                                                        <ImageIcon size={14} /> View Evidence
                                                    </button>
                                                ) : <span className="text-slate-400 text-xs italic">No photo</span>}
                                                
                                                {log.link || log.review ? (
                                                    <a href={log.link || log.review} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-green-600 hover:text-green-700 bg-green-50 px-2 py-1 rounded text-xs font-bold transition-colors w-fit border border-green-100">
                                                        <ExternalLink size={14} /> Goodreads / Review
                                                    </a>
                                                ) : <span className="text-slate-400 text-xs italic">No link</span>}
                                            </div>
                                        </td>
                                        <td className="px-6 py-4">
                                            <span className={`px-2 py-1 rounded text-[10px] font-bold uppercase border ${log.hrApprovalStatus === 'Approved' ? 'bg-indigo-100 text-indigo-700 border-indigo-200' : log.hrApprovalStatus === 'Rejected' ? 'bg-red-100 text-red-700 border-red-200' : log.hrApprovalStatus === 'Pending' ? 'bg-orange-100 text-orange-700 border-orange-200' : 'bg-slate-100 text-slate-500 border-slate-200'}`}>
                                                {log.hrApprovalStatus === 'Pending' ? 'Under Review' : (log.hrApprovalStatus || 'Draft')}
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
                                            {log.hrApprovalStatus === 'Pending' ? (
                                                (() => {
                                                    const currentSeq = getLogSequence(log);
                                                    
                                                    if (currentSeq <= 5) {
                                                        return (
                                                            <div className="flex justify-center gap-2">
                                                                <button onClick={() => handleEditLogClick(log)} className="p-2 bg-slate-100 text-slate-600 rounded-lg hover:bg-slate-200 transition-colors" title="Edit Details"><Edit size={18} /></button>
                                                                <button onClick={() => handleVerifyClick(log)} className="p-2 bg-green-100 text-green-700 rounded-lg hover:bg-green-200 transition-colors" title="Verify & Reward"><CheckCircle size={18} /></button>
                                                                <button onClick={() => handleRejectClick(log)} className="p-2 bg-red-100 text-red-700 rounded-lg hover:bg-red-200 transition-colors" title="Reject"><XCircle size={18} /></button>
                                                            </div>
                                                        );
                                                    } else {
                                                        return (
                                                            <div className="flex flex-col items-center">
                                                                <span className="text-xs text-red-500 font-bold italic">Limit Exceeded ({currentSeq}/5)</span>
                                                                <button onClick={() => handleRejectClick(log)} className="mt-1 text-[10px] text-red-600 hover:underline flex items-center gap-1"><XCircle size={10}/> Reject Over Limit</button>
                                                            </div>
                                                        );
                                                    }
                                                })()
                                            ) : (
                                                <span className="text-xs text-slate-400 italic">No actions</span>
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
                    <div className="bg-white rounded-2xl w-full max-w-md p-6 animate-in fade-in zoom-in duration-200">
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
                                                <p className="text-sm font-bold text-orange-800">Milestone Ke-5 Terdeteksi!</p>
                                                <p className="text-xs text-orange-600">User ini akan mendapatkan bonus tambahan Rp 500.000.</p>
                                            </div>
                                        </div>
                                    );
                                }
                                return (
                                    <div className="bg-blue-50 border border-blue-100 p-3 rounded-xl flex items-center gap-2">
                                        <BookOpen size={16} className="text-blue-500" />
                                        <p className="text-xs font-bold text-blue-700">Verifikasi Buku Ke-{currentSeq} Tahun {y}</p>
                                    </div>
                                );
                            })()}
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
                                    <option value="text">Non-Fiksi Text</option>
                                    <option value="comic">Non-Fiksi Komik/Manga</option>
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
                            <button onClick={() => handleDeleteLog(editLogModal.log!.id)} className="px-4 py-2 text-red-600 font-bold hover:bg-red-50 rounded-xl border border-red-200 flex items-center"><Trash2 size={16} className="mr-2"/> Delete</button>
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
                                        {photoModal.log.source === 'SIMAS' ? 'Bukti Foto Pinjaman' : 'Bukti Foto'}
                                    </p>
                                    <img src={photoModal.log.evidenceUrl.startsWith('http') ? photoModal.log.evidenceUrl : `${API_BASE_URL}${photoModal.log.evidenceUrl}`} alt="Pinjaman" className="w-full h-auto max-h-[500px] object-contain rounded-lg border border-slate-200 shadow-sm bg-white" />
                                </div>
                            )}
                            
                            {photoModal.log.returnEvidenceUrl && (
                                <div className="bg-slate-50 p-4 rounded-xl border border-slate-100">
                                    <p className="font-bold text-slate-700 mb-3 flex items-center gap-2">
                                        <ImageIcon className="text-green-500" size={18} /> 
                                        Bukti Foto Pengembalian
                                    </p>
                                    <img src={photoModal.log.returnEvidenceUrl.startsWith('http') ? photoModal.log.returnEvidenceUrl : `${API_BASE_URL}${photoModal.log.returnEvidenceUrl}`} alt="Pengembalian" className="w-full h-auto max-h-[500px] object-contain rounded-lg border border-slate-200 shadow-sm bg-white" />
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
                                            <th className="px-6 py-3">Book Title / Category</th>
                                            <th className="px-6 py-3 text-center">Book #</th>
                                            <th className="px-6 py-3">Period</th>
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
                                                <td className="px-6 py-4">
                                                    <div className="font-bold text-slate-700 text-sm whitespace-pre-wrap leading-tight">{log.title}</div>
                                                    <div className="flex flex-col gap-1.5 mt-1">
                                                        <div className="text-xs text-slate-500">
                                                            {log.category} <span className="text-slate-300 mx-1">•</span> <span className="font-medium text-slate-400 italic">{log.source === 'Buku Pribadi' ? 'Pribadi' : 'Kantor'}</span>
                                                        </div>
                                                        <span className={`text-[9px] font-black px-1.5 py-0.5 rounded w-fit uppercase tracking-wider border shadow-sm ${
                                                            log.source === 'Buku Pribadi' 
                                                                ? 'bg-purple-100 text-purple-700 border-purple-200' 
                                                                : 'bg-indigo-100 text-indigo-700 border-indigo-200'
                                                        }`}>
                                                            {log.source === 'Buku Pribadi' ? 'Bacaan Pribadi' : 'Buku Kantor'}
                                                        </span>
                                                    </div>
                                                </td>
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
                                                    <div className="text-sm font-medium text-slate-600">
                                                        {log.finishDate ? new Date(log.finishDate).toLocaleDateString() : log.date ? new Date(log.date).toLocaleDateString() : '-'}
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
                                                    <div className={`px-2 py-1 rounded text-[10px] font-bold uppercase w-fit border ${log.hrApprovalStatus === 'Approved' ? 'bg-indigo-100 text-indigo-700 border-indigo-200' : log.hrApprovalStatus === 'Rejected' ? 'bg-red-100 text-red-700 border-red-200' : log.hrApprovalStatus === 'Pending' ? 'bg-orange-100 text-orange-700 border-orange-200' : 'bg-slate-100 text-slate-500 border-slate-200'}`}>
                                                        {log.hrApprovalStatus || 'Draft'}
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
