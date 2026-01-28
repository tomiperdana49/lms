import { useState, useEffect } from 'react';
import { ArrowLeft, Search, CheckCircle, XCircle, Clock, Edit, ExternalLink, Image as ImageIcon } from 'lucide-react';
import { API_BASE_URL } from '../config';
import type { ReadingLogEntry, User } from '../types';

interface AdminReadingLogProps {
    onBack: () => void;
}

const AdminReadingLog = ({ onBack }: AdminReadingLogProps) => {
    const [allLogs, setAllLogs] = useState<ReadingLogEntry[]>([]);
    const [users, setUsers] = useState<User[]>([]);
    const [searchTerm, setSearchTerm] = useState('');
    const [filterYear, setFilterYear] = useState(new Date().getFullYear());
    const [filterPeriod, setFilterPeriod] = useState('all');
    const [selectedBranch, setSelectedBranch] = useState('All Branches');

    // View Mode State
    const [viewMode, setViewMode] = useState<'verification' | 'recap'>('recap');

    // Detail Modal State (Recap View)
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [selectedUser, setSelectedUser] = useState<User | null>(null);

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

    // Edit Log Modal State (New)
    const [editLogModal, setEditLogModal] = useState<{ open: boolean; log: ReadingLogEntry | null; formData: Partial<ReadingLogEntry> }>({
        open: false,
        log: null,
        formData: {}
    });

    const periodOptions = [
        { label: 'All Year', value: 'all' },
        { label: 'Semester 1 (Jan-Jun)', value: 's1' },
        { label: 'Semester 2 (Jul-Dec)', value: 's2' },
        { label: 'Q1 (Jan-Mar)', value: 'q1' },
        { label: 'Q2 (Apr-Jun)', value: 'q2' },
        { label: 'Q3 (Jul-Sep)', value: 'q3' },
        { label: 'Q4 (Oct-Dec)', value: 'q4' },
        ...[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11].map(m => ({
            label: new Date(2024, m, 1).toLocaleString('default', { month: 'long' }),
            value: String(m)
        }))
    ];

    const branches = ['All Branches', 'Jakarta', 'Surabaya', 'Semarang', 'Manado', 'Medan', 'Bandung', 'Jogja', 'Bali', 'Binjai', 'Tanjung Morawa'];

    useEffect(() => {
        fetchLogs();
        fetchUsers();
    }, []);

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
        fetch(`${API_BASE_URL}/api/users`)
            .then(res => {
                if (!res.ok) throw new Error("Failed to fetch users");
                return res.json();
            })
            .then(data => {
                if (Array.isArray(data)) setUsers(data);
                else setUsers([]);
            })
            .catch(err => console.error(err));
    };

    // --- Actions ---

    const handleVerifyClick = (log: ReadingLogEntry) => {
        setVerifyModal({
            open: true,
            log,
            category: 'text',
            reward: 100000
        });
    };

    const handleRejectClick = (log: ReadingLogEntry) => {
        setRejectModal({
            open: true,
            log,
            reason: ''
        });
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
                link: log.link,
                evidenceUrl: log.evidenceUrl,
                category: log.category
                // Add other fields if needed
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

    const handleEditClick = (user: User) => {
        setSelectedUser(user);
        setIsModalOpen(true);
    };

    const formatCurrency = (val: number) => new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(val);

    // --- Filtering Logic (Unified) ---

    const getPeriodDates = () => {
        const y = filterYear;
        switch (filterPeriod) {
            case 's1': return [new Date(y, 0, 1), new Date(y, 5, 30, 23, 59, 59)];
            case 's2': return [new Date(y, 6, 1), new Date(y, 11, 31, 23, 59, 59)];
            case 'q1': return [new Date(y, 0, 1), new Date(y, 2, 31, 23, 59, 59)];
            case 'q2': return [new Date(y, 3, 1), new Date(y, 5, 30, 23, 59, 59)];
            case 'q3': return [new Date(y, 6, 1), new Date(y, 8, 30, 23, 59, 59)];
            case 'q4': return [new Date(y, 9, 1), new Date(y, 11, 31, 23, 59, 59)];
            case 'all': return [new Date(y, 0, 1), new Date(y, 11, 31, 23, 59, 59)];
            default: // Month index (Incentive Period: 26th prev month - 25th current month)
                const m = parseInt(filterPeriod);
                // Start: 26th of previous month
                const start = new Date(y, m - 1, 26);
                // End: 25th of current month
                const end = new Date(y, m, 25, 23, 59, 59);
                return [start, end];
        }
    };

    // Recap Data Construction
    const getUserStats = (user: User) => {
        const [start, end] = getPeriodDates();

        // Filter logs for this user in the selected period AND branch
        const userLogs = allLogs.filter(l => {
            // Match user by name (ideal would be ID but keeping consistent with current data)
            if (l.userName !== user.name) return false;
            // Only finished logs count towards stats
            if (l.status !== 'Finished') return false;

            // Branch Filter
            if (selectedBranch !== 'All Branches') {
                if (!l.location || !l.location.toLowerCase().includes(selectedBranch.toLowerCase())) return false;
            }

            const dateToCheck = l.status === 'Finished' && l.finishDate ? l.finishDate : l.date;
            const logDate = new Date(dateToCheck);
            return logDate >= start && logDate <= end;
        });

        // Stats calculation
        const totalBooks = userLogs.length;
        const verifiedCount = userLogs.filter(l => l.hrApprovalStatus === 'Approved').length;
        const totalIncentive = userLogs.reduce((sum, l) => sum + (l.incentiveAmount || 0), 0);

        return {
            totalBooks,
            verifiedCount,
            totalIncentive,
            logs: userLogs
        };
    };

    // Filter Users for Recap Table
    const filteredUsers = users.filter(user =>
        user.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        user.email.toLowerCase().includes(searchTerm.toLowerCase())
    );

    const verificationLogs = allLogs
        .filter(l => l.status === 'Finished')
        .filter(l => {
            // Branch Filter
            if (selectedBranch !== 'All Branches') {
                if (!l.location || !l.location.toLowerCase().includes(selectedBranch.toLowerCase())) return false;
            }

            // Period & Year Filter
            // Use finishDate for Finished logs to match Incentive Period
            const dateToCheck = l.status === 'Finished' && l.finishDate ? l.finishDate : l.date;
            const d = new Date(dateToCheck);
            const [start, end] = getPeriodDates();
            if (d < start || d > end) return false;

            // Search Filter
            const lowerSearch = searchTerm.toLowerCase();
            return (
                (l.userName || '').toLowerCase().includes(lowerSearch) ||
                (l.title || '').toLowerCase().includes(lowerSearch)
            );
        })
        .sort((a, b) => {
            // Pending first
            if (a.hrApprovalStatus === 'Pending' && b.hrApprovalStatus !== 'Pending') return -1;
            if (a.hrApprovalStatus !== 'Pending' && b.hrApprovalStatus === 'Pending') return 1;
            // Then date desc
            return new Date(b.date).getTime() - new Date(a.date).getTime();
        });


    return (
        <div className="space-y-6 animate-fade-in relative min-h-screen pb-20">
            {/* Header / Nav */}
            <div className="flex flex-col gap-4">
                <button onClick={onBack} className="flex items-center text-slate-500 hover:text-slate-800 transition-colors w-fit group">
                    <ArrowLeft size={20} className="mr-2 group-hover:-translate-x-1 transition-transform" /> Back to Dashboard
                </button>

                <div className="flex flex-col md:flex-row justify-between items-end md:items-center gap-4">
                    <div>
                        <h1 className="text-2xl font-bold text-slate-800">Reading Log Management</h1>
                        <p className="text-slate-500">Manage validations and view reading statistics.</p>
                    </div>
                    {/* View Toggle */}
                    <div className="bg-slate-100 p-1 rounded-xl flex shadow-inner">
                        <button
                            onClick={() => setViewMode('verification')}
                            className={`px-4 py-2 rounded-lg text-sm font-bold transition-all ${viewMode === 'verification' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                        >
                            Verification
                        </button>
                        <button
                            onClick={() => setViewMode('recap')}
                            className={`px-4 py-2 rounded-lg text-sm font-bold transition-all ${viewMode === 'recap' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                        >
                            Recapitulation
                        </button>
                    </div>
                </div>
            </div>

            {/* Global Filter Bar */}
            <div className="bg-white p-4 rounded-2xl shadow-sm border border-slate-200 flex flex-col md:flex-row gap-4 items-center justify-between mb-6">
                <div className="relative w-full md:w-96">
                    <Search className="absolute left-4 top-3.5 text-slate-400" size={18} />
                    <input
                        type="text"
                        placeholder="Search Name, Title..."
                        className="w-full pl-11 pr-4 py-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-blue-500 outline-none font-medium text-slate-600"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                    />
                </div>

                <div className="flex gap-2 w-full md:w-auto overflow-x-auto pb-2 md:pb-0">
                    <select
                        value={selectedBranch}
                        onChange={(e) => setSelectedBranch(e.target.value)}
                        className="px-4 py-2.5 rounded-xl border border-slate-200 font-bold text-slate-600 text-sm outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                    >
                        {branches.map(b => <option key={b} value={b}>{b}</option>)}
                    </select>

                    <select
                        value={filterYear}
                        onChange={(e) => setFilterYear(Number(e.target.value))}
                        className="px-4 py-2.5 rounded-xl border border-slate-200 font-bold text-slate-600 text-sm outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                    >
                        <option value="All">All Year</option>
                        {[2024, 2025, 2026, 2027].map(y => <option key={y} value={y}>{y}</option>)}
                    </select>

                    <select
                        value={filterPeriod}
                        onChange={(e) => setFilterPeriod(e.target.value)}
                        className="px-4 py-2.5 rounded-xl border border-slate-200 font-bold text-slate-600 text-sm outline-none focus:ring-2 focus:ring-blue-500 bg-white min-w-[140px]"
                    >
                        {periodOptions.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
                    </select>
                </div>
            </div>

            {/* --- RECAPITULATION VIEW --- */}
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
                                    const isEligible = stats.verifiedCount >= 5; // Example logic
                                    const remaining = 5 - stats.verifiedCount;

                                    return (
                                        <tr key={user.name} className="hover:bg-slate-50 transition-colors group">
                                            <td className="px-6 py-4">
                                                <div>
                                                    <p className="font-bold text-slate-800">{user.name}</p>
                                                    <p className="text-xs text-slate-400">{user.email}</p>
                                                </div>
                                            </td>
                                            <td className="px-6 py-4">
                                                <span className={`px-2 py-1 rounded text-[10px] font-bold uppercase
                                                    ${user.role === 'HR' || user.role === 'HR_ADMIN' ? 'bg-purple-100 text-purple-700' :
                                                        user.role === 'SUPERVISOR' ? 'bg-blue-100 text-blue-700' : 'bg-green-100 text-green-700'}
                                                `}>
                                                    {user.role?.replace('_', ' ') || 'STAFF'}
                                                </span>
                                            </td>
                                            <td className="px-6 py-4">
                                                <div className="flex items-center gap-2">
                                                    <span className="text-slate-800 font-bold text-lg">{stats.totalBooks}</span>
                                                    <span className="text-slate-400 text-sm">Books</span>
                                                    {stats.verifiedCount > 0 && (
                                                        <span className="px-2 py-0.5 bg-green-100 text-green-700 text-[10px] font-bold rounded-full">
                                                            {stats.verifiedCount} Verified
                                                        </span>
                                                    )}
                                                </div>
                                            </td>
                                            <td className="px-6 py-4">
                                                <div className="flex items-center gap-2 text-slate-600">
                                                    {isEligible ? (
                                                        <span className="flex items-center gap-1 text-green-600 font-bold text-xs">
                                                            <CheckCircle size={14} /> Eligible
                                                        </span>
                                                    ) : (
                                                        <span className="flex items-center gap-1 text-slate-400 text-xs font-medium">
                                                            <Clock size={14} /> {remaining > 0 ? `${remaining} more to go` : 'Pending'}
                                                        </span>
                                                    )}
                                                    {stats.totalIncentive > 0 && (
                                                        <span className="ml-2 text-green-600 font-bold text-sm bg-green-50 px-2 py-0.5 rounded border border-green-100">
                                                            {formatCurrency(stats.totalIncentive)}
                                                        </span>
                                                    )}
                                                </div>
                                            </td>
                                            <td className="px-6 py-4 text-center">
                                                <button
                                                    onClick={() => handleEditClick(user)}
                                                    className="p-2 bg-slate-100 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-all"
                                                    title="View Details"
                                                >
                                                    <Edit size={18} />
                                                </button>
                                            </td>
                                        </tr>
                                    );
                                })}
                                {filteredUsers.length === 0 && (
                                    <tr>
                                        <td colSpan={5} className="p-8 text-center text-slate-400 italic">No users found matching search.</td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {/* --- VERIFICATION VIEW (Existing List) --- */}
            {viewMode === 'verification' && (
                <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden animate-in slide-in-from-bottom-4 fade-in">
                    <div className="p-4 border-b border-slate-100 bg-slate-50/50 flex justify-between items-center">
                        <h3 className="font-bold text-slate-700 flex items-center gap-2">
                            <CheckCircle size={18} className="text-orange-500" /> Pending Verifications & History
                        </h3>
                    </div>
                    <div className="overflow-x-auto">
                        <table className="w-full text-left">
                            <thead className="bg-slate-50 text-slate-500 font-semibold uppercase text-xs">
                                <tr>
                                    <th className="px-6 py-4">Employee</th>
                                    <th className="px-6 py-4">Book Title</th>
                                    <th className="px-6 py-4">Date Finished</th>
                                    <th className="px-6 py-4">Evidence & Links</th>
                                    <th className="px-6 py-4">Status</th>
                                    <th className="px-6 py-4 text-center">Action</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {verificationLogs
                                    .map((log) => (
                                        <tr key={log.id} className="hover:bg-slate-50 transition-colors">
                                            <td className="px-6 py-4">
                                                <div>
                                                    <p className="font-bold text-slate-700 text-sm">{log.userName || 'Unknown'}</p>
                                                    <p className="text-xs text-slate-400">Staff</p>
                                                </div>
                                            </td>
                                            <td className="px-6 py-4">
                                                <div className="flex flex-col">
                                                    <span className="font-semibold text-slate-800 text-sm">{log.title}</span>
                                                    <span className="text-xs text-slate-500">{log.category}</span>
                                                </div>
                                            </td>
                                            <td className="px-6 py-4 text-sm text-slate-600">{new Date(log.date).toLocaleDateString()}</td>
                                            <td className="px-6 py-4">
                                                <div className="flex flex-col gap-1">
                                                    {log.evidenceUrl ? (
                                                        <a href={log.evidenceUrl} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-blue-600 hover:underline text-xs font-bold">
                                                            <ImageIcon size={14} /> View Evidence
                                                        </a>
                                                    ) : <span className="text-slate-400 text-xs italic">No photo</span>}

                                                    {log.link ? (
                                                        <a href={log.link} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-green-600 hover:underline text-xs font-bold">
                                                            <ExternalLink size={14} /> Goodreads / Review
                                                        </a>
                                                    ) : <span className="text-slate-400 text-xs italic">No link</span>}
                                                </div>
                                            </td>
                                            <td className="px-6 py-4">
                                                <span className={`px-2 py-1 rounded text-[10px] font-bold uppercase border
                                                ${log.hrApprovalStatus === 'Approved' ? 'bg-green-100 text-green-700 border-green-200' :
                                                        log.hrApprovalStatus === 'Rejected' ? 'bg-red-100 text-red-700 border-red-200' :
                                                            'bg-orange-100 text-orange-700 border-orange-200'}
                                            `}>
                                                    {log.hrApprovalStatus || 'Pending'}
                                                </span>
                                                {log.incentiveAmount && (
                                                    <div className="text-[10px] font-bold text-green-600 mt-1">{formatCurrency(log.incentiveAmount)}</div>
                                                )}
                                            </td>
                                            <td className="px-6 py-4 text-center">
                                                {log.hrApprovalStatus === 'Pending' ? (
                                                    <div className="flex justify-center gap-2">
                                                        <button
                                                            onClick={() => handleEditLogClick(log)}
                                                            className="p-2 bg-slate-100 text-slate-600 rounded-lg hover:bg-slate-200 transition-colors tooltip"
                                                            title="Edit Details"
                                                        >
                                                            <Edit size={18} />
                                                        </button>
                                                        <button
                                                            onClick={() => handleVerifyClick(log)}
                                                            className="p-2 bg-green-100 text-green-700 rounded-lg hover:bg-green-200 transition-colors tooltip"
                                                            title="Verify & Reward"
                                                        >
                                                            <CheckCircle size={18} />
                                                        </button>
                                                        <button
                                                            onClick={() => handleRejectClick(log)}
                                                            className="p-2 bg-red-100 text-red-700 rounded-lg hover:bg-red-200 transition-colors tooltip"
                                                            title="Reject"
                                                        >
                                                            <XCircle size={18} />
                                                        </button>
                                                    </div>
                                                ) : (
                                                    <span className="text-xs text-slate-400 font-medium">Processed</span>
                                                )}
                                            </td>
                                        </tr>
                                    ))}
                                {verificationLogs.length === 0 && (
                                    <tr>
                                        <td colSpan={6} className="p-8 text-center text-slate-400 italic">No finished reading logs found.</td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {/* --- MODALS --- */}

            {/* Detail Modal (Recap) */}
            {isModalOpen && selectedUser && (
                <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 animate-in fade-in backdrop-blur-sm">
                    <div className="bg-white rounded-2xl w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col shadow-2xl ring-1 ring-white/20">
                        <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50">
                            <div>
                                <h3 className="text-xl font-bold text-slate-800">{selectedUser.name}'s Reading Log</h3>
                                <p className="text-sm text-slate-500">Period: {filterPeriod === 'all' ? 'All Year' : periodOptions.find(p => p.value == filterPeriod)?.label} {filterYear}</p>
                            </div>
                            <button onClick={() => setIsModalOpen(false)} className="text-slate-400 hover:text-red-500 p-2 rounded-full hover:bg-red-50 transition-colors">
                                <XCircle size={24} />
                            </button>
                        </div>

                        <div className="flex-1 overflow-y-auto p-0">
                            <table className="w-full text-left">
                                <thead className="bg-slate-50 text-slate-500 text-xs font-bold uppercase border-b border-slate-100 sticky top-0">
                                    <tr>
                                        <th className="px-6 py-3">Date</th>
                                        <th className="px-6 py-3">Book Title</th>
                                        <th className="px-6 py-3">Category</th>
                                        <th className="px-6 py-3">Evidence</th>
                                        <th className="px-6 py-3">Status</th>
                                        <th className="px-6 py-3 text-right">Incentive</th>
                                        <th className="px-6 py-3 text-center">Action</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                    {getUserStats(selectedUser).logs.length === 0 ? (
                                        <tr><td colSpan={7} className="p-8 text-center text-slate-400 italic">No logs found for this period.</td></tr>
                                    ) : (
                                        getUserStats(selectedUser).logs.map(log => (
                                            <tr key={log.id} className="hover:bg-slate-50">
                                                <td className="px-6 py-4 text-sm text-slate-600">{new Date(log.date).toLocaleDateString()}</td>
                                                <td className="px-6 py-4 font-bold text-slate-700">{log.title}</td>
                                                <td className="px-6 py-4 text-sm text-slate-500">{log.category}</td>
                                                <td className="px-6 py-4">
                                                    <div className="flex flex-col gap-1">
                                                        {log.evidenceUrl ? (
                                                            <a href={log.evidenceUrl} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-blue-600 hover:underline text-xs font-bold">
                                                                <ImageIcon size={14} /> Photo
                                                            </a>
                                                        ) : <span className="text-slate-300 text-xs">-</span>}

                                                        {log.link ? (
                                                            <a href={log.link} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-green-600 hover:underline text-xs font-bold">
                                                                <ExternalLink size={14} /> Review
                                                            </a>
                                                        ) : <span className="text-slate-300 text-xs">-</span>}
                                                    </div>
                                                </td>
                                                <td className="px-6 py-4">
                                                    <span className={`px-2 py-1 rounded text-[10px] font-bold uppercase border
                                                        ${log.hrApprovalStatus === 'Approved' ? 'bg-green-100 text-green-700 border-green-200' :
                                                            log.hrApprovalStatus === 'Rejected' ? 'bg-red-100 text-red-700 border-red-200' :
                                                                'bg-orange-100 text-orange-700 border-orange-200'
                                                        }
                                                    `}>
                                                        {log.hrApprovalStatus || 'Pending'}
                                                    </span>
                                                </td>
                                                <td className="px-6 py-4 text-right">
                                                    {log.incentiveAmount ? (
                                                        <span className="font-mono font-bold text-green-600">{formatCurrency(log.incentiveAmount)}</span>
                                                    ) : '-'}
                                                </td>
                                                <td className="px-6 py-4 text-center">
                                                    {(log.hrApprovalStatus === 'Pending' || !log.hrApprovalStatus) && (
                                                        <div className="flex justify-center gap-2">
                                                            <button
                                                                onClick={() => handleVerifyClick(log)}
                                                                className="p-1.5 bg-green-100 text-green-700 rounded-lg hover:bg-green-200 transition-colors tooltip"
                                                                title="Verify"
                                                            >
                                                                <CheckCircle size={16} />
                                                            </button>
                                                            <button
                                                                onClick={() => handleRejectClick(log)}
                                                                className="p-1.5 bg-red-100 text-red-700 rounded-lg hover:bg-red-200 transition-colors tooltip"
                                                                title="Reject"
                                                            >
                                                                <XCircle size={16} />
                                                            </button>
                                                        </div>
                                                    )}
                                                </td>
                                            </tr>
                                        ))
                                    )}
                                </tbody>
                            </table>
                        </div>
                        <div className="p-4 border-t border-slate-100 bg-white flex justify-end">
                            <button onClick={() => setIsModalOpen(false)} className="px-6 py-2 bg-slate-800 text-white font-bold rounded-xl hover:bg-slate-900 transition-colors">Close</button>
                        </div>
                    </div>
                </div>
            )}

            {/* Verify Modal */}
            {verifyModal.open && verifyModal.log && (
                <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in">
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 space-y-4 animate-in zoom-in-95">
                        <h3 className="font-bold text-lg text-slate-800">Verify Incentive</h3>
                        <div>
                            <label className="block text-xs font-bold text-slate-500 mb-2 uppercase">Book Category (HR Determination)</label>
                            <div className="grid grid-cols-2 gap-3">
                                <button
                                    onClick={() => setVerifyModal(prev => ({ ...prev, category: 'comic', reward: 50000 }))}
                                    className={`p-3 rounded-xl border text-sm font-bold transition-all ${verifyModal.category === 'comic' ? 'border-blue-500 bg-blue-50 text-blue-700 ring-2 ring-blue-200' : 'border-slate-200 hover:bg-slate-50'}`}
                                >
                                    Comic/Manga
                                    <div className="text-xs font-normal opacity-70 mt-1">Rp 50.000</div>
                                </button>
                                <button
                                    onClick={() => setVerifyModal(prev => ({ ...prev, category: 'text', reward: 100000 }))}
                                    className={`p-3 rounded-xl border text-sm font-bold transition-all ${verifyModal.category === 'text' ? 'border-blue-500 bg-blue-50 text-blue-700 ring-2 ring-blue-200' : 'border-slate-200 hover:bg-slate-50'}`}
                                >
                                    Text Non-Fiction
                                    <div className="text-xs font-normal opacity-70 mt-1">Rp 100.000</div>
                                </button>
                            </div>
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-slate-500 mb-1 uppercase">Approved Reward (IDR)</label>
                            <input
                                type="number"
                                value={verifyModal.reward}
                                onChange={e => setVerifyModal(prev => ({ ...prev, reward: parseInt(e.target.value) || 0 }))}
                                className="w-full px-4 py-3 border border-slate-300 rounded-xl text-lg font-bold text-slate-800 focus:ring-2 focus:ring-green-500 outline-none"
                            />
                        </div>
                        <div className="flex gap-2 pt-2">
                            <button onClick={() => setVerifyModal(prev => ({ ...prev, open: false }))} className="flex-1 px-4 py-3 bg-slate-100 text-slate-600 font-bold rounded-xl hover:bg-slate-200 transition-colors">Cancel</button>
                            <button onClick={handleVerifySubmit} className="flex-1 px-4 py-3 bg-green-600 text-white font-bold rounded-xl hover:bg-green-700 shadow-lg shadow-green-200 transition-colors">Confirm Verify</button>
                        </div>
                    </div>
                </div>
            )}

            {/* Rejection Modal */}
            {rejectModal.open && rejectModal.log && (
                <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in">
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 space-y-4 animate-in zoom-in-95">
                        <h3 className="font-bold text-lg text-red-600">Reject Log</h3>
                        <div>
                            <label className="block text-xs font-bold text-slate-500 mb-2 uppercase">Reason for Rejection (Required)</label>
                            <textarea
                                value={rejectModal.reason}
                                onChange={e => setRejectModal(prev => ({ ...prev, reason: e.target.value }))}
                                className="w-full p-4 border border-slate-300 rounded-xl h-32 focus:ring-2 focus:ring-red-500 outline-none resize-none text-slate-700"
                                placeholder="E.g. Evidence link broken, Not a valid book..."
                            />
                        </div>
                        <div className="flex gap-2 pt-2">
                            <button onClick={() => setRejectModal(prev => ({ ...prev, open: false }))} className="flex-1 px-4 py-3 bg-slate-100 text-slate-600 font-bold rounded-xl hover:bg-slate-200 transition-colors">Cancel</button>
                            <button
                                onClick={handleRejectSubmit}
                                disabled={!rejectModal.reason}
                                className="flex-1 px-4 py-3 bg-red-600 text-white font-bold rounded-xl hover:bg-red-700 shadow-lg shadow-red-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                Confirm Reject
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Edit Log Modal */}
            {editLogModal.open && editLogModal.log && (
                <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in">
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg p-6 space-y-4 animate-in zoom-in-95 max-h-[90vh] overflow-y-auto">
                        <div className="flex justify-between items-center border-b border-slate-100 pb-4">
                            <h3 className="font-bold text-lg text-slate-800">Edit Log Details</h3>
                            <button onClick={() => setEditLogModal(prev => ({ ...prev, open: false }))}>
                                <XCircle size={24} className="text-slate-400 hover:text-slate-600" />
                            </button>
                        </div>

                        <div className="space-y-4">
                            <div>
                                <label className="block text-xs font-bold text-slate-500 mb-1 uppercase">Book Title</label>
                                <input
                                    type="text"
                                    value={editLogModal.formData.title || ''}
                                    onChange={e => setEditLogModal(prev => ({ ...prev, formData: { ...prev.formData, title: e.target.value } }))}
                                    className="w-full px-4 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none"
                                />
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-xs font-bold text-slate-500 mb-1 uppercase">Date</label>
                                    <input
                                        type="date"
                                        value={editLogModal.formData.date ? new Date(editLogModal.formData.date).toISOString().split('T')[0] : ''}
                                        onChange={e => setEditLogModal(prev => ({ ...prev, formData: { ...prev.formData, date: e.target.value } }))}
                                        className="w-full px-4 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none"
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-slate-500 mb-1 uppercase">Category</label>
                                    <select
                                        value={editLogModal.formData.category || 'Non-Fiksi'}
                                        onChange={e => setEditLogModal(prev => ({ ...prev, formData: { ...prev.formData, category: e.target.value } }))}
                                        className="w-full px-4 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none"
                                    >
                                        <option value="Non-Fiksi">Non-Fiksi</option>
                                        <option value="Fiksi">Fiksi</option>
                                        <option value="Komik/Manga">Komik/Manga</option>
                                    </select>
                                </div>
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-slate-500 mb-1 uppercase">Review Link</label>
                                <input
                                    type="text"
                                    value={editLogModal.formData.link || ''}
                                    onChange={e => setEditLogModal(prev => ({ ...prev, formData: { ...prev.formData, link: e.target.value } }))}
                                    className="w-full px-4 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none"
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-slate-500 mb-1 uppercase">Evidence URL</label>
                                <input
                                    type="text"
                                    value={editLogModal.formData.evidenceUrl || ''}
                                    onChange={e => setEditLogModal(prev => ({ ...prev, formData: { ...prev.formData, evidenceUrl: e.target.value } }))}
                                    className="w-full px-4 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none"
                                />
                            </div>
                        </div>

                        <div className="flex gap-2 pt-4">
                            <button onClick={() => setEditLogModal(prev => ({ ...prev, open: false }))} className="flex-1 px-4 py-3 bg-slate-100 text-slate-600 font-bold rounded-xl hover:bg-slate-200 transition-colors">Cancel</button>
                            <button
                                onClick={handleEditLogSubmit}
                                className="flex-1 px-4 py-3 bg-blue-600 text-white font-bold rounded-xl hover:bg-blue-700 shadow-lg shadow-blue-200 transition-colors"
                            >
                                Save Changes
                            </button>
                        </div>
                    </div>
                </div>
            )}

        </div>
    );
};

export default AdminReadingLog;
