import { useState, useEffect } from 'react';
import { ArrowLeft, Search, CheckCircle, XCircle, Clock, Edit, ExternalLink, Image as ImageIcon, Trash2, RefreshCw } from 'lucide-react';
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
        return d.toISOString().split('T')[0];
    });
    const [endDate, setEndDate] = useState(() => {
        const now = new Date();
        const d = new Date(now.getFullYear(), now.getMonth(), 25);
        return d.toISOString().split('T')[0];
    });
    const [selectedBranch, setSelectedBranch] = useState('All Branches');
    const [branches, setBranches] = useState<string[]>(['All Branches']);
    const [filterStatus, setFilterStatus] = useState('all');
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
        setVerifyModal({
            open: true,
            log: log,
            category: log.category?.toLowerCase().includes('komik') ? 'comic' : 'text',
            reward: log.category?.toLowerCase().includes('komik') ? 50000 : 100000
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
                setAllLogs(allLogs.map(log => log.id === id ? { ...log, status: 'Cancelled', hrApprovalStatus: 'Cancelled' } : log));
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
        const [start, end] = getPeriodDates();
        const userLogs = allLogs.filter(l => {
            if (user.employee_id && l.employee_id && l.employee_id === user.employee_id) { }
            else if (l.userName && user.name && l.userName.trim().toLowerCase() === user.name.trim().toLowerCase()) { }
            else return false;

            if (l.status !== 'Finished') return false;
            const dateToCheck = l.status === 'Finished' && l.finishDate ? l.finishDate : l.date;
            const logDate = new Date(dateToCheck);
            return logDate >= start && logDate <= end;
        });

        const totalBooks = userLogs.length;
        const verifiedCount = userLogs.filter(l => l.hrApprovalStatus === 'Approved').length;
        const totalIncentive = userLogs.reduce((sum, l) => sum + (l.incentiveAmount || 0), 0);

        return { totalBooks, verifiedCount, totalIncentive, logs: userLogs };
    };

    const filteredUsers = users.filter(user => {
        const matchesSearch = user.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
            user.email.toLowerCase().includes(searchTerm.toLowerCase());
        const matchesBranch = selectedBranch === 'All Branches' || user.branch === selectedBranch;
        return matchesSearch && matchesBranch;
    });

    const verificationLogs = allLogs
        .filter(l => l.status === 'Finished' && l.hrApprovalStatus !== 'Cancelled')
        .filter(l => {
            if (filterStatus !== 'all') {
                const s = (l.hrApprovalStatus || 'Draft').toLowerCase();
                const f = filterStatus.toLowerCase();
                if (s !== f) return false;
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
            return new Date(b.date).getTime() - new Date(a.date).getTime();
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
                    <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} className="px-4 py-2.5 rounded-xl border border-slate-200 font-bold text-slate-600 text-sm outline-none focus:ring-2 focus:ring-blue-500 bg-white">
                        <option value="all">All Status</option>
                        <option value="Draft">Draft</option>
                        <option value="Pending">Under Review</option>
                        <option value="Approved">Approved</option>
                        <option value="Rejected">Rejected</option>
                    </select>
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
                                    <th className="px-6 py-4 w-[30%]">Name / Email</th>
                                    <th className="px-6 py-4 w-[15%]">Role</th>
                                    <th className="px-6 py-4 w-[25%]">Books Read</th>
                                    <th className="px-6 py-4 w-[20%]">Incentive Status</th>
                                    <th className="px-6 py-4 text-center">Action</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-50">
                                {filteredUsers.map((user) => {
                                    const stats = getUserStats(user);
                                    const isEligible = stats.verifiedCount >= 5;
                                    const remaining = 5 - stats.verifiedCount;
                                    return (
                                        <tr key={user.employee_id || user.email} className="hover:bg-slate-50 transition-colors group">
                                            <td className="px-6 py-4">
                                                <div><p className="font-bold text-slate-800">{user.name}</p><p className="text-xs text-slate-400">{user.email}</p></div>
                                            </td>
                                            <td className="px-6 py-4">
                                                <span className={`px-2 py-1 rounded text-[10px] font-bold uppercase ${user.role === 'HR' || user.role === 'HR_ADMIN' ? 'bg-purple-100 text-purple-700' : user.role === 'SUPERVISOR' ? 'bg-blue-100 text-blue-700' : 'bg-green-100 text-green-700'}`}>{user.role?.replace('_', ' ') || 'STAFF'}</span>
                                            </td>
                                            <td className="px-6 py-4">
                                                <div className="flex items-center gap-2"><span className="text-slate-800 font-bold text-lg">{stats.totalBooks}</span><span className="text-slate-400 text-sm">Books</span>{stats.verifiedCount > 0 && <span className="px-2 py-0.5 bg-green-100 text-green-700 text-[10px] font-bold rounded-full">{stats.verifiedCount} Verified</span>}</div>
                                            </td>
                                            <td className="px-6 py-4">
                                                <div className="flex items-center gap-2 text-slate-600">{isEligible ? <span className="flex items-center gap-1 text-green-600 font-bold text-xs"><CheckCircle size={14} /> Eligible</span> : <span className="flex items-center gap-1 text-slate-400 text-xs font-medium"><Clock size={14} /> {remaining > 0 ? `${remaining} more to go` : 'Pending'}</span>}{stats.totalIncentive > 0 && <span className="ml-2 text-green-600 font-bold text-sm bg-green-50 px-2 py-0.5 rounded border border-green-100">{formatCurrency(stats.totalIncentive)}</span>}</div>
                                            </td>
                                            <td className="px-6 py-4 text-center">
                                                <span className="text-slate-400 text-xs italic">No actions yet</span>
                                            </td>
                                        </tr>
                                    );
                                })}
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
                                        <td className="px-6 py-4"><span className={`px-2 py-1 rounded text-[10px] font-bold uppercase border ${log.hrApprovalStatus === 'Approved' ? 'bg-indigo-100 text-indigo-700 border-indigo-200' : log.hrApprovalStatus === 'Rejected' ? 'bg-red-100 text-red-700 border-red-200' : log.hrApprovalStatus === 'Pending' ? 'bg-orange-100 text-orange-700 border-orange-200' : 'bg-slate-100 text-slate-500 border-slate-200'}`}>{log.hrApprovalStatus === 'Pending' ? 'Under Review' : (log.hrApprovalStatus || 'Draft')}</span>{log.incentiveAmount && <div className="text-[10px] font-bold text-green-600 mt-1">{formatCurrency(log.incentiveAmount)}</div>}</td>
                                        <td className="px-6 py-4 text-center">
                                            {(log.hrApprovalStatus === 'Pending' || log.hrApprovalStatus === 'Draft' || !log.hrApprovalStatus) ? (
                                                <div className="flex justify-center gap-2">
                                                    <button onClick={() => handleEditLogClick(log)} className="p-2 bg-slate-100 text-slate-600 rounded-lg hover:bg-slate-200 transition-colors" title="Edit Details"><Edit size={18} /></button>
                                                    <button onClick={() => handleVerifyClick(log)} className="p-2 bg-green-100 text-green-700 rounded-lg hover:bg-green-200 transition-colors" title="Verify & Reward"><CheckCircle size={18} /></button>
                                                    <button onClick={() => handleRejectClick(log)} className="p-2 bg-red-100 text-red-700 rounded-lg hover:bg-red-200 transition-colors" title="Reject"><XCircle size={18} /></button>
                                                </div>
                                            ) : <span className="text-xs text-slate-400 italic">No actions</span>}
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
                            <div>
                                <label className="block text-sm font-bold text-slate-700 mb-1">Book Category</label>
                                <select 
                                    className="w-full px-4 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none"
                                    value={verifyModal.category}
                                    onChange={(e) => setVerifyModal(prev => ({ ...prev, category: e.target.value as any, reward: e.target.value === 'comic' ? 50000 : 100000 }))}
                                >
                                    <option value="text">Non-Fiksi Text</option>
                                    <option value="comic">Non-Fiksi Komik/Manga</option>
                                </select>
                            </div>
                            <div>
                                <label className="block text-sm font-bold text-slate-700 mb-1">Incentive Amount (Rp)</label>
                                <input 
                                    type="number"
                                    className="w-full px-4 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none"
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
        </div>
    );
};

export default AdminReadingLog;
