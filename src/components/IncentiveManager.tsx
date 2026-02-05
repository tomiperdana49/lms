import React, { useState, useEffect, type FormEvent, type ChangeEvent } from 'react';
import { Award, Plus, CheckCircle, XCircle, Clock, History, Image as ImageIcon, BarChart2, Trash2 } from 'lucide-react';
import { API_BASE_URL } from '../config';
import type { User, Incentive } from '../types';
import PopupNotification from './PopupNotification';
import ConfirmationModal from './ConfirmationModal';

interface IncentiveManagerProps {
    user?: User;
    viewMode?: 'personal' | 'admin';
}

// Minimal Error Boundary to catch runtime crashes
class ErrorBoundary extends React.Component<{ children: React.ReactNode }, { hasError: boolean; error: Error | null }> {
    constructor(props: { children: React.ReactNode }) {
        super(props);
        this.state = { hasError: false, error: null };
    }

    static getDerivedStateFromError(error: Error) {
        return { hasError: true, error };
    }

    componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
        console.error("IncentiveManager Crash:", error, errorInfo);
    }

    render() {
        if (this.state.hasError) {
            return (
                <div className="p-8 text-center bg-red-50 rounded-2xl border border-red-200 m-4">
                    <XCircle className="w-12 h-12 text-red-500 mx-auto mb-4" />
                    <h2 className="text-xl font-bold text-red-700 mb-2">Something went wrong</h2>
                    <p className="text-red-500 mb-4">We couldn't load the Incentive page.</p>
                    <pre className="text-xs bg-red-100 p-4 rounded text-left overflow-auto max-w-lg mx-auto text-red-800">
                        {this.state.error?.toString()}
                    </pre>
                </div>
            );
        }
        return this.props.children;
    }
}

const IncentiveManagerContent = ({ user, viewMode = 'personal' }: IncentiveManagerProps) => {
    const [incentives, setIncentives] = useState<Incentive[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [activeTab, setActiveTab] = useState<'request' | 'active' | 'pending' | 'history' | 'summary'>('active');
    const [notification, setNotification] = useState<{ show: boolean; type: 'success' | 'error'; message: string }>({ show: false, type: 'success', message: '' });

    // Form State (Staff Request)
    const [isFormOpen, setIsFormOpen] = useState(false);
    const [formData, setFormData] = useState({
        courseName: '',
        startDate: '',
        endDate: '',
        description: '', // Certificate Description
        evidenceUrl: '', // Certificate Photo
        requesterName: user?.name || ''
    });

    // Accordion State for Active List
    const [expandedEmployees, setExpandedEmployees] = useState<string[]>([]);
    const [branches, setBranches] = useState<string[]>(['All Branches']);
    const [employees, setEmployees] = useState<any[]>([]);
    const [selectedBranchSummary, setSelectedBranchSummary] = useState('All Branches');

    const toggleEmployee = (name: string) => {
        setExpandedEmployees(prev =>
            prev.includes(name) ? prev.filter(n => n !== name) : [...prev, name]
        );
    };

    // Approval State (HR)
    const [approvalModal, setApprovalModal] = useState<{ isOpen: boolean, id: number | null, incentive: Incentive | null }>({
        isOpen: false, id: null, incentive: null
    });
    const [approvalReward, setApprovalReward] = useState(''); // HR inputs this
    const [approvalPaymentType, setApprovalPaymentType] = useState<'One-Time' | 'Recurring' | null>(null); // HR inputs this

    const [confirmConfig, setConfirmConfig] = useState<{
        isOpen: boolean;
        title: string;
        message: string;
        onConfirm: () => void;
    }>({ isOpen: false, title: '', message: '', onConfirm: () => { } });

    const openConfirm = (title: string, message: string, onConfirm: () => void) => {
        setConfirmConfig({ isOpen: true, title, message, onConfirm });
    };

    const fetchBranches = async () => {
        try {
            const res = await fetch(`${API_BASE_URL}/api/branches`);
            if (res.ok) {
                const data = await res.json();
                if (Array.isArray(data)) {
                    setBranches(['All Branches', ...data.map((b: any) => b.name)]);
                }
            }
        } catch (err) { console.error(err); }
    };

    const fetchEmployees = async () => {
        try {
            const res = await fetch(`${API_BASE_URL}/api/employees`);
            if (res.ok) {
                const data = await res.json();
                setEmployees(data);
            }
        } catch (err) { console.error(err); }
    };

    useEffect(() => {
        fetchBranches();
        fetchEmployees();
    }, []);
    // --- Summary Logic State (Moved to top level to avoid hook errors) ---
    const [summaryYear, setSummaryYear] = useState(new Date().getFullYear());

    // Logic: 'isHR' determines if they see Admin features.
    // If viewMode is 'personal', we FORCE isHR to false for UI purposes (so they only see their own stuff).
    // But we might want to keep actual role check for some things?
    // User requested: "seharusnya di admin panel saja. jangan di tampilan insentif dashboardnya HR"
    // So distinct split:
    // Personal View: Behaves like Staff (Upload, My Requests).
    // Admin View: Behaves like Admin (Pending, Active, History, Summary).

    const isHR = (user?.role === 'HR' || user?.role === 'HR_ADMIN') && viewMode === 'admin';

    useEffect(() => {
        const fetchIncentives = async () => {
            setIsLoading(true);
            try {
                const res = await fetch(`${API_BASE_URL}/api/incentives`);
                if (res.ok) {
                    const data = await res.json();
                    if (Array.isArray(data)) {
                        // Update expiry status
                        const today = new Date();
                        const updatedData = data.map((inc: Incentive): Incentive => {
                            if (inc.status === 'Active' && inc.endDate && new Date(inc.endDate) < today) {
                                return { ...inc, status: 'Expired' };
                            }
                            return inc;
                        });
                        setIncentives(updatedData);
                    } else {
                        console.error("API returned non-array for incentives:", data);
                        setIncentives([]);
                    }
                } else {
                    console.error("Failed to fetch incentives:", res.status, res.statusText);
                }
            } catch (err) {
                console.error("Failed to load incentives", err);
            } finally {
                setIsLoading(false);
            }
        };
        fetchIncentives();
    }, []);

    const handleFileChange = async (e: ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            const file = e.target.files[0];
            const data = new FormData();
            data.append('file', file);
            try {
                const res = await fetch(`${API_BASE_URL}/api/upload`, { method: 'POST', body: data });
                if (res.ok) {
                    const result = await res.json();
                    setFormData(prev => ({ ...prev, evidenceUrl: result.fileUrl }));
                } else {
                    setNotification({ show: true, type: 'error', message: 'Failed to upload file' });
                }
            } catch (err) {
                console.error("Upload error", err);
            }
        }
    };

    // HR Actions
    const openApprovalModal = (inc: Incentive) => {
        setApprovalModal({ isOpen: true, id: inc.id, incentive: inc });
        // Pre-fill if editing existing active incentive, else empty
        setApprovalReward(inc.reward ? String(inc.reward) : '');
        setApprovalPaymentType(inc.paymentType || null);
    };

    const confirmApproval = async () => {
        if (!approvalModal.id || !approvalReward || !approvalPaymentType) {
            setNotification({ show: true, type: 'error', message: "Please select Payment Frequency and Reward Amount." });
            return;
        }

        try {
            const res = await fetch(`${API_BASE_URL}/api/incentives/${approvalModal.id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    status: 'Active',
                    reward: approvalReward,
                    paymentType: approvalPaymentType
                })
            });

            if (res.ok) {
                const updated = await res.json();
                setIncentives(incentives.map(i => i.id === approvalModal.id ? updated : i));
                setApprovalModal({ isOpen: false, id: null, incentive: null });
                setNotification({ show: true, type: 'success', message: "Incentive updated successfully." });
            }
        } catch (err) {
            console.error(err);
            setNotification({ show: true, type: 'error', message: "Error updating incentive." });
        }
    };

    // ... DENY/CANCEL/PAID logic unchanged ...

    // ... in RENDER ...
    // Active List Actions: Add Edit Button
    // ... (removed misplaced code)

    const denyRequest = (id: number) => {
        openConfirm('Deny Request', 'Are you sure you want to deny this request?', async () => {
            try {
                const res = await fetch(`${API_BASE_URL}/api/incentives/${id}`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ status: 'Denied' })
                });

                if (res.ok) {
                    const updated = await res.json();
                    setIncentives(incentives.map(i => i.id === id ? updated : i));
                    setNotification({ show: true, type: 'success', message: 'Incentive request denied.' });
                } else {
                    setNotification({ show: true, type: 'error', message: 'Failed to deny request.' });
                }
            } catch (err) {
                console.error(err);
                setNotification({ show: true, type: 'error', message: 'Error denying request.' });
            }
        });
    };

    const markCanceled = (id: number) => {
        openConfirm('Cancel Incentive', 'Are you sure you want to cancel this incentive? This will stop future payments but preserve history.', async () => {
            try {
                // Set End Date to NOW to "terminate" it effectively from today
                const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
                const res = await fetch(`${API_BASE_URL}/api/incentives/${id}`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        status: 'Canceled',
                        endDate: today
                    })
                });

                if (res.ok) {
                    const updated = await res.json();
                    setIncentives(incentives.map(i => i.id === id ? updated : i));
                    setNotification({ show: true, type: 'success', message: 'Incentive canceled.' });
                } else {
                    setNotification({ show: true, type: 'error', message: 'Failed to cancel incentive.' });
                }
            } catch (err) {
                console.error(err);
                setNotification({ show: true, type: 'error', message: 'Error canceling incentive.' });
            }
        });
    };

    const markAsPaid = (id: number) => {
        openConfirm('Confirm Payment', 'Mark this incentive as PAID? This will move it to History.', async () => {
            try {
                const res = await fetch(`${API_BASE_URL}/api/incentives/${id}`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ status: 'Paid' })
                });

                if (res.ok) {
                    const updated = await res.json();
                    setIncentives(incentives.map(i => i.id === id ? updated : i));
                    setNotification({ show: true, type: 'success', message: 'Incentive marked as PAID.' });
                } else {
                    setNotification({ show: true, type: 'error', message: 'Failed to mark as paid.' });
                }
            } catch (err) {
                console.error(err);
                setNotification({ show: true, type: 'error', message: 'Error updating payment status.' });
            }
        });
    };

    const handleDeleteIncentive = (id: number) => {
        openConfirm('Delete Incentive', 'Are you sure you want to permanently delete this incentive record? This action cannot be undone.', async () => {
            try {
                const res = await fetch(`${API_BASE_URL}/api/incentives/${id}`, { method: 'DELETE' });
                if (res.ok) {
                    setIncentives(incentives.filter(i => i.id !== id));
                    setNotification({ show: true, type: 'success', message: 'Incentive record deleted.' });
                } else {
                    setNotification({ show: true, type: 'error', message: 'Failed to delete incentive.' });
                }
            } catch (err) {
                console.error(err);
                setNotification({ show: true, type: 'error', message: 'Error deleting record.' });
            }
        });
    };

    const handleSubmit = async (e: FormEvent) => {
        e.preventDefault();

        // Validation
        if (!formData.courseName || !formData.description || !formData.startDate || !formData.endDate) {
            setNotification({ show: true, type: 'error', message: 'Mohon lengkapi semua data sertifikat.' });
            return;
        }

        if (!formData.evidenceUrl) {
            setNotification({ show: true, type: 'error', message: 'Wajib upload Bukti Sertifikat.' });
            return;
        }

        try {
            const newIncentive = {
                ...formData,
                employeeName: user?.name || 'Unknown',
                employee_id: user?.employee_id || null,
                status: 'Pending',
                reward: '', // Defined by HR later
                monthlyAmount: 0
            };

            const res = await fetch(`${API_BASE_URL}/api/incentives`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(newIncentive)
            });

            if (res.ok) {
                const saved = await res.json();
                setIncentives([...incentives, saved]);
                setIsFormOpen(false);
                setFormData({
                    courseName: '', startDate: '', endDate: '', description: '', evidenceUrl: '', requesterName: user?.name || ''
                });
                setNotification({ show: true, type: 'success', message: 'Request submitted! Waiting for HR verification.' });
            }
        } catch (err) {
            console.error(err);
        }
    };

    // --- filtering ---
    // --- filtering ---
    const myIncentives = incentives.filter(i => {
        const matchesId = user?.employee_id && i.employee_id === user.employee_id;
        const matchesName = user?.name && i.employeeName === user.name;
        return matchesId || matchesName;
    });
    const pendingVerification = incentives.filter(i => i.status === 'Pending');

    // Active: Status 'Active'
    // NOTE: One-Time items now stay 'Active' until manually marked 'Paid'.
    const activeIncentives = isHR
        ? incentives.filter(i => i.status === 'Active')
        : myIncentives.filter(i => i.status === 'Active' || i.status === 'Pending');

    // History: Paid, Expired, Denied, Canceled
    const historyIncentives = isHR
        ? incentives.filter(i => ['Paid', 'Expired', 'Denied', 'Canceled'].includes(i.status))
        : myIncentives.filter(i => ['Paid', 'Expired', 'Denied', 'Canceled'].includes(i.status));


    if (isLoading) {
        return (
            <div className="flex items-center justify-center min-h-[500px] bg-white rounded-3xl p-6">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-amber-500"></div>
            </div>
        );
    }

    // --- Summary Logic ---
    // State moved to top level


    // Helper to parse currency string
    const parseReward = (rewardStr: string) => {
        if (!rewardStr) return 0;
        // Check for standard decimal format (e.g. "250000.00" from DB)
        // Only use parseFloat if it looks like a clean number (digits and optional dot)
        if (/^\d+(\.\d+)?$/.test(rewardStr)) {
            return parseFloat(rewardStr);
        }
        // Fallback for formatted strings (e.g. "Rp 250.000")
        return parseInt(rewardStr.replace(/[^0-9]/g, '')) || 0;
    };

    const formatCurrency = (val: number) => new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR' }).format(val);

    const getSummaryData = () => {
        // Only run summary logic if tab is active (Optimization & Safety)
        if (activeTab !== 'summary') return {};

        const tree: Record<string, Record<string, Record<string, Incentive[]>>> = {};

        // Filter for active/paid/pending incentives
        // Canceled items excluded to avoid phantom budget projections (no cancellation_date available).
        const actives = incentives.filter(i => ['Active', 'Paid', 'Pending'].includes(i.status));

        const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

        months.forEach((month, idx) => {
            const monthStart = new Date(summaryYear, idx, 1);
            const monthEnd = new Date(summaryYear, idx + 1, 0);

            actives.forEach(inc => {
                // If it's One-Time and Paid, use approvedDate (payment date)
                // If it's One-Time and Active, use approvedDate (if set) or startDate (projected)
                const dateToUseStr = inc.approvedDate || inc.startDate;
                if (!dateToUseStr || !inc.endDate) return;

                const start = new Date(dateToUseStr);
                const end = new Date(inc.endDate);
                const recurringStart = new Date(inc.startDate); // Recurring always runs from start date

                if (isNaN(start.getTime()) || isNaN(end.getTime())) return;

                // Logic Update: Check paymentType
                const isOneTime = inc.paymentType === 'One-Time';
                let shouldInclude = false;

                if (isOneTime) {
                    // Check if the relevant date falls in this month
                    // We use the same calendar month logic as the loop
                    shouldInclude = start.getMonth() === idx && start.getFullYear() === summaryYear;
                } else {
                    // Recurring: Overlap with startDate -> endDate
                    shouldInclude = recurringStart <= monthEnd && end >= monthStart;
                }

                if (shouldInclude) {
                    const emp = employees.find(e =>
                        (inc.employee_id && e.id_employee === inc.employee_id) ||
                        (inc.employeeName && e.full_name && e.full_name.trim().toLowerCase() === inc.employeeName.trim().toLowerCase())
                    );
                    const branch = emp?.branch_name || 'Others';

                    if (selectedBranchSummary !== 'All Branches' && branch !== selectedBranchSummary) return;

                    if (!tree[month]) tree[month] = {};

                    // Safe access to employeeName
                    const empName = inc.employeeName || 'Unknown';
                    const empId = inc.employee_id || empName;

                    if (!tree[month][branch]) tree[month][branch] = {};
                    if (!tree[month][branch][empId]) tree[month][branch][empId] = [];

                    tree[month][branch][empId].push(inc);
                }
            });
        });

        return tree;
    };

    const summaryTree = getSummaryData();
    const monthsOrder = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
    const activeMonths = Object.keys(summaryTree).sort((a, b) => monthsOrder.indexOf(a) - monthsOrder.indexOf(b));

    const safeDate = (dateStr: string) => {
        if (!dateStr) return '-';
        const d = new Date(dateStr);
        return isNaN(d.getTime()) ? '-' : d.toLocaleDateString();
    };

    return (
        <div className="space-y-6 animate-fade-in p-6 bg-white rounded-3xl min-h-[500px]">
            <PopupNotification
                isOpen={notification.show}
                type={notification.type}
                message={notification.message}
                onClose={() => setNotification({ ...notification, show: false })}
            />
            {/* Header */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border-b border-slate-100 pb-6">
                <div>
                    <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
                        <Award className="text-amber-500" /> Incentive Program
                    </h1>
                    <p className="text-slate-500 mt-1">
                        {isHR ? 'Verify certificates and assign rewards.' : 'Upload certificates to claim incentives.'}
                    </p>
                </div>

                <button
                    onClick={() => setIsFormOpen(true)}
                    className="bg-amber-500 hover:bg-amber-600 text-white px-6 py-2.5 rounded-xl font-bold shadow-lg shadow-amber-500/20 flex items-center gap-2"
                >
                    <Plus size={18} /> Upload Certificate
                </button>
            </div>

            {/* Tabs */}
            <div className="flex gap-2 overflow-x-auto pb-2">
                {isHR && (
                    <button
                        onClick={() => setActiveTab('pending')}
                        className={`px-4 py-2 rounded-xl text-sm font-bold transition-colors flex items-center gap-2 whitespace-nowrap
                            ${activeTab === 'pending' ? 'bg-blue-100 text-blue-700' : 'text-slate-500 hover:bg-slate-50'}
                        `}
                    >
                        <Clock size={16} /> Pending ({pendingVerification.length})
                    </button>
                )}
                <button
                    onClick={() => setActiveTab('active')}
                    className={`px-4 py-2 rounded-xl text-sm font-bold transition-colors flex items-center gap-2 whitespace-nowrap
                        ${activeTab === 'active' ? 'bg-green-100 text-green-700' : 'text-slate-500 hover:bg-slate-50'}
                    `}
                >
                    <CheckCircle size={16} /> Active List
                </button>
                <button
                    onClick={() => setActiveTab('request')}
                    className={`px-4 py-2 rounded-xl text-sm font-bold transition-colors flex items-center gap-2 whitespace-nowrap
                        ${activeTab === 'request' ? 'bg-amber-100 text-amber-700' : 'text-slate-500 hover:bg-slate-50'}
                    `}
                >
                    <Clock size={16} /> My Requests
                </button>
                <button
                    onClick={() => setActiveTab('history')}
                    className={`px-4 py-2 rounded-xl text-sm font-bold transition-colors flex items-center gap-2 whitespace-nowrap
                        ${activeTab === 'history' ? 'bg-slate-100 text-slate-700' : 'text-slate-500 hover:bg-slate-50'}
                    `}
                >
                    <History size={16} /> History
                </button>
                {isHR && (
                    <button
                        onClick={() => setActiveTab('summary')}
                        className={`px-4 py-2 rounded-xl text-sm font-bold transition-colors flex items-center gap-2 whitespace-nowrap
                            ${activeTab === 'summary' ? 'bg-purple-100 text-purple-700' : 'text-slate-500 hover:bg-slate-50'}
                        `}
                    >
                        <BarChart2 size={16} /> Summary Report
                    </button>
                )}
            </div>

            {/* Content Table */}
            {activeTab === 'summary' ? (
                <div className="space-y-8 animate-in slide-in-from-right-4">
                    <div className="flex flex-wrap items-center gap-4 bg-white p-4 rounded-xl shadow-sm border border-slate-200">
                        <div className="flex items-center gap-2">
                            <span className="font-bold text-slate-600">Year:</span>
                            <select
                                value={summaryYear}
                                onChange={(e) => setSummaryYear(parseInt(e.target.value))}
                                className="px-4 py-2 rounded-lg border border-slate-300 font-bold text-slate-700 outline-none focus:ring-2 focus:ring-amber-500"
                            >
                                {[2024, 2025, 2026, 2027].map(y => <option key={y} value={y}>{y}</option>)}
                            </select>
                        </div>
                        <div className="flex items-center gap-2">
                            <span className="font-bold text-slate-600">Branch:</span>
                            <select
                                value={selectedBranchSummary}
                                onChange={(e) => setSelectedBranchSummary(e.target.value)}
                                className="px-4 py-2 rounded-lg border border-slate-300 font-bold text-slate-700 outline-none focus:ring-2 focus:ring-amber-500 bg-white"
                            >
                                {branches.map(b => (
                                    <option key={b} value={b}>{b}</option>
                                ))}
                            </select>
                        </div>
                    </div>

                    {activeMonths.map(month => (
                        <div key={month} className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
                            <div className="bg-amber-500 px-6 py-3">
                                <h3 className="text-white font-bold text-lg">{month} {summaryYear}</h3>
                            </div>
                            <div className="p-6">
                                <table className="w-full text-left text-sm">
                                    <thead className="bg-slate-50 text-slate-500 font-semibold uppercase text-xs">
                                        <tr>
                                            <th className="px-4 py-2 w-1/4">Employee Name</th>
                                            <th className="px-4 py-2 w-24 text-center">Total Certs</th>
                                            <th className="px-4 py-2">Details</th>
                                            <th className="px-4 py-2 text-right">Total Payout</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100 border border-slate-100 rounded-lg">
                                        {Object.keys(summaryTree[month] || {}).map(branch => {
                                            const branchUsers = summaryTree[month][branch];
                                            return Object.entries(branchUsers).map(([employee, incs], idx) => {
                                                const totalPayout = incs.reduce((sum, i) => sum + parseReward(i.reward), 0);
                                                return (
                                                    <tr key={`${branch}-${idx}`} className="hover:bg-slate-50">
                                                        <td className="px-4 py-3 font-bold text-slate-700">
                                                            <div>{incs[0].employeeName || employee}</div>
                                                            <div className="text-[10px] uppercase font-bold text-slate-400">{branch} (ID: {employee})</div>
                                                        </td>
                                                        <td className="px-4 py-3 text-center">
                                                            <span className="bg-amber-100 text-amber-700 px-2 py-1 rounded-full text-xs font-bold">
                                                                {incs.length}
                                                            </span>
                                                        </td>
                                                        <td className="px-4 py-3 text-slate-600">
                                                            <div className="flex flex-col gap-1">
                                                                {incs.map((inc, i) => (
                                                                    <div key={i} className="flex justify-between text-xs gap-4">
                                                                        <span className="flex-1 truncate" title={inc.courseName}>{inc.courseName}</span>
                                                                        <span className="text-[10px] text-slate-400 whitespace-nowrap">
                                                                            {safeDate(inc.startDate)}
                                                                        </span>
                                                                    </div>
                                                                ))}
                                                            </div>
                                                        </td>
                                                        <td className="px-4 py-3 text-right font-mono font-bold text-slate-700">
                                                            {formatCurrency(totalPayout)}
                                                        </td>
                                                    </tr>
                                                );
                                            });
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    ))}

                    {activeMonths.length === 0 && (
                        <div className="text-center py-12 bg-white rounded-2xl border border-slate-200 border-dashed text-slate-400">
                            No active incentives found for {summaryYear}.
                        </div>
                    )}
                </div>
            ) : (
                <div className="bg-slate-50 rounded-2xl border border-slate-100 overflow-hidden">
                    <table className="w-full text-left">
                        <thead className="bg-slate-100 text-slate-500 text-xs uppercase font-semibold">
                            <tr>
                                <th className="px-6 py-4">Employee</th>
                                <th className="px-6 py-4">Certificate</th>
                                <th className="px-6 py-4">Valid From</th>
                                <th className="px-6 py-4">Valid Until</th>
                                <th className="px-6 py-4">Description/Evidence</th>
                                <th className="px-6 py-4">Reward (IDR)</th>
                                <th className="px-6 py-4">Frequency</th>
                                <th className="px-6 py-4">Status</th>
                                {isHR && <th className="px-6 py-4 text-right">Actions</th>}
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-200 bg-white">
                            {activeTab === 'active' ? (
                                (function () {
                                    const grouped: Record<string, Incentive[]> = {};
                                    activeIncentives.forEach(inc => {
                                        // Group by name for visual consistency since IDs might be missing
                                        const key = inc.employeeName || inc.employee_id || 'Unknown';
                                        if (!grouped[key]) grouped[key] = [];
                                        grouped[key].push(inc);
                                    });

                                    return Object.entries(grouped).map(([employeeKey, employeeIncentives]) => {
                                        const employeeName = employeeIncentives[0].employeeName || 'Unknown';
                                        const employeeId = employeeIncentives[0].employee_id;
                                        return (
                                            <React.Fragment key={employeeKey}>
                                                <tr
                                                    className="bg-slate-50 hover:bg-slate-100 cursor-pointer transition-colors border-b border-slate-200"
                                                    onClick={() => toggleEmployee(employeeKey)}
                                                >
                                                    <td colSpan={isHR ? 9 : 8} className="px-6 py-4">
                                                        <div className="flex items-center justify-between">
                                                            <div className="flex items-center gap-3">
                                                                <div className="bg-amber-100 p-2 rounded-full text-amber-600 font-bold text-xs w-8 h-8 flex items-center justify-center border border-amber-200">
                                                                    {employeeName.charAt(0)}
                                                                </div>
                                                                <div>
                                                                    <span className="font-bold text-slate-700 text-sm block">{employeeName} {employeeId ? `(${employeeId})` : ''}</span>
                                                                    <span className="text-xs text-slate-500 font-medium">{employeeIncentives.length} Active Certificate(s)</span>
                                                                </div>
                                                            </div>
                                                            <div className={`text-slate-400 transform transition-transform duration-300 ${expandedEmployees.includes(employeeKey) ? 'rotate-180' : ''}`}>
                                                                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                                                    <polyline points="6 9 12 15 18 9"></polyline>
                                                                </svg>
                                                            </div>
                                                        </div>
                                                    </td>
                                                </tr>

                                                {expandedEmployees.includes(employeeKey) && employeeIncentives.map(inc => (
                                                    <tr key={inc.id} className="bg-white border-b border-slate-100 hover:bg-blue-50/50 transition-colors">
                                                        <td className="px-6 py-4 pl-16 font-bold text-slate-700 opacity-50 text-xs">↳</td>
                                                        <td className="px-6 py-4 text-sm text-slate-600 font-medium">{inc.courseName}</td>
                                                        <td className="px-6 py-4 text-xs text-slate-500 font-medium">{new Date(inc.startDate).toLocaleDateString()}</td>
                                                        <td className="px-6 py-4 text-xs text-slate-500 font-medium">{new Date(inc.endDate).toLocaleDateString()}</td>
                                                        <td className="px-6 py-4 text-sm text-slate-600">
                                                            <div className="flex flex-col gap-1">
                                                                <span className="italic text-slate-500">"{inc.description || '-'}"</span>
                                                                {inc.evidenceUrl && (
                                                                    <a href={`${API_BASE_URL}${inc.evidenceUrl}`} target="_blank" rel="noreferrer" className="text-blue-600 flex items-center gap-1 hover:underline text-xs font-bold">
                                                                        <ImageIcon size={12} /> View Certificate
                                                                    </a>
                                                                )}
                                                            </div>
                                                        </td>
                                                        <td className="px-6 py-4 font-mono font-bold text-slate-700">
                                                            {inc.reward ? new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR' }).format(Number(inc.reward)) : '-'}
                                                        </td>
                                                        <td className="px-6 py-4">
                                                            {inc.paymentType === 'One-Time' ? (
                                                                <span className="bg-amber-100 text-amber-700 px-2 py-1 rounded text-xs font-bold whitespace-nowrap">One-Time</span>
                                                            ) : (
                                                                <span className="bg-blue-100 text-blue-700 px-2 py-1 rounded text-xs font-bold whitespace-nowrap">Monthly</span>
                                                            )}
                                                        </td>
                                                        <td className="px-6 py-4">
                                                            {(() => {
                                                                if (inc.status === 'Paid') {
                                                                    const dateToUse = inc.approvedDate || inc.startDate;
                                                                    const d = new Date(dateToUse);
                                                                    if (d.getDate() > 25) d.setMonth(d.getMonth() + 1);
                                                                    const periodLabel = d.toLocaleString('default', { month: 'long', year: 'numeric' });
                                                                    return (
                                                                        <span className="bg-emerald-100 text-emerald-700 px-2 py-1 rounded text-xs font-bold w-fit flex items-center gap-1">
                                                                            <CheckCircle size={12} /> Paid in {periodLabel}
                                                                        </span>
                                                                    );
                                                                }
                                                                if (inc.status === 'Active') {
                                                                    if (inc.paymentType === 'One-Time') {
                                                                        const dateToUse = inc.approvedDate || inc.startDate;
                                                                        const d = new Date(dateToUse);
                                                                        if (d.getDate() > 25) d.setMonth(d.getMonth() + 1);
                                                                        const periodLabel = d.toLocaleString('default', { month: 'long', year: 'numeric' });
                                                                        return (
                                                                            <span className="bg-purple-100 text-purple-700 px-2 py-1 rounded text-xs font-bold w-fit flex items-center gap-1">
                                                                                <Clock size={12} /> Pending Payout ({periodLabel})
                                                                            </span>
                                                                        );
                                                                    }
                                                                    return <span className="bg-green-100 text-green-700 px-2 py-1 rounded text-xs font-bold w-fit">Active</span>;
                                                                }
                                                                return <span className="bg-red-100 text-red-700 px-2 py-1 rounded text-xs font-bold w-fit">{inc.status}</span>;
                                                            })()}
                                                        </td>
                                                        {isHR && (
                                                            <td className="px-6 py-4 text-right">
                                                                <div className="flex items-center justify-end gap-2">
                                                                    {inc.paymentType === 'One-Time' && (
                                                                        <button onClick={(e) => { e.stopPropagation(); markAsPaid(inc.id); }} className="px-3 py-1 bg-teal-500 text-white rounded-lg text-xs font-bold hover:bg-teal-600 shadow-sm flex items-center gap-1">
                                                                            <CheckCircle size={14} /> Mark Paid
                                                                        </button>
                                                                    )}
                                                                    <button onClick={(e) => { e.stopPropagation(); openApprovalModal(inc); }} className="px-3 py-1 bg-amber-100 text-amber-700 rounded-lg text-xs font-bold hover:bg-amber-200">Edit</button>
                                                                    <button onClick={(e) => { e.stopPropagation(); markCanceled(inc.id); }} className="px-3 py-1 bg-slate-100 text-slate-600 rounded-lg text-xs font-bold hover:bg-slate-200">Cancel</button>
                                                                    <button onClick={(e) => { e.stopPropagation(); handleDeleteIncentive(inc.id); }} className="p-1.5 bg-red-50 text-red-600 rounded-lg hover:bg-red-100" title="Delete Permanent"><Trash2 size={16} /></button>
                                                                </div>
                                                            </td>
                                                        )}
                                                    </tr>
                                                ))}
                                            </React.Fragment>
                                        );
                                    });
                                })()
                            ) : (
                                (
                                    activeTab === 'pending' ? pendingVerification :
                                        activeTab === 'history' ? historyIncentives :
                                            activeTab === 'request' ? myIncentives : []
                                ).map(inc => (
                                    <tr key={inc.id} className="hover:bg-slate-50 transition-colors">
                                        <td className="px-6 py-4 font-bold text-slate-700">
                                            {inc.employeeName} {inc.employee_id ? `(${inc.employee_id})` : ''}
                                        </td>
                                        <td className="px-6 py-4 text-sm text-slate-600">{inc.courseName}</td>
                                        <td className="px-6 py-4 text-xs text-slate-500 font-medium">{new Date(inc.startDate).toLocaleDateString()}</td>
                                        <td className="px-6 py-4 text-xs text-slate-500 font-medium">{new Date(inc.endDate).toLocaleDateString()}</td>
                                        <td className="px-6 py-4 text-sm text-slate-600">
                                            <div className="flex flex-col gap-1">
                                                <span className="italic">"{inc.description || '-'}"</span>
                                                {inc.evidenceUrl && (
                                                    <a href={`${API_BASE_URL}${inc.evidenceUrl}`} target="_blank" rel="noreferrer" className="text-blue-600 flex items-center gap-1 hover:underline text-xs font-bold">
                                                        <ImageIcon size={12} /> View Certificate
                                                    </a>
                                                )}
                                            </div>
                                        </td>
                                        <td className="px-6 py-4 font-mono font-bold text-slate-700">
                                            {inc.reward ? new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR' }).format(Number(inc.reward)) : '-'}
                                        </td>
                                        <td className="px-6 py-4">
                                            {inc.status === 'Pending' ? (
                                                <span className="text-slate-400 text-xs font-bold">-</span>
                                            ) : inc.paymentType === 'One-Time' ? (
                                                <span className="bg-amber-100 text-amber-700 px-2 py-1 rounded text-xs font-bold whitespace-nowrap">One-Time</span>
                                            ) : (
                                                <span className="bg-blue-100 text-blue-700 px-2 py-1 rounded text-xs font-bold whitespace-nowrap">Monthly</span>
                                            )}
                                        </td>
                                        <td className="px-6 py-4">
                                            {(() => {
                                                if (inc.status === 'Pending') return <span className="bg-blue-50 text-blue-600 border border-blue-100 px-2 py-1 rounded text-xs font-bold w-fit">Processing</span>;
                                                if (inc.status === 'Expired') return <span className="bg-orange-100 text-orange-700 px-2 py-1 rounded text-xs font-bold w-fit">Expired</span>;
                                                if (inc.status === 'Canceled') return <span className="bg-slate-100 text-slate-500 px-2 py-1 rounded text-xs font-bold w-fit">Canceled</span>;
                                                if (inc.status === 'Paid') {
                                                    const dateToUse = inc.approvedDate || inc.startDate;
                                                    const d = new Date(dateToUse);
                                                    if (d.getDate() > 25) d.setMonth(d.getMonth() + 1);
                                                    const periodLabel = d.toLocaleString('default', { month: 'long', year: 'numeric' });
                                                    return (
                                                        <span className="bg-emerald-100 text-emerald-700 px-2 py-1 rounded text-xs font-bold w-fit flex items-center gap-1">
                                                            <CheckCircle size={12} /> Paid in {periodLabel}
                                                        </span>
                                                    );
                                                }
                                                if (inc.status === 'Active') {
                                                    if (inc.paymentType === 'One-Time') {
                                                        const dateToUse = inc.approvedDate || inc.startDate;
                                                        const d = new Date(dateToUse);
                                                        if (d.getDate() > 25) d.setMonth(d.getMonth() + 1);
                                                        const periodLabel = d.toLocaleString('default', { month: 'long', year: 'numeric' });
                                                        return (
                                                            <span className="bg-purple-100 text-purple-700 px-2 py-1 rounded text-xs font-bold w-fit flex items-center gap-1">
                                                                <Clock size={12} /> Pending Payout ({periodLabel})
                                                            </span>
                                                        );
                                                    }
                                                    return <span className="bg-green-100 text-green-700 px-2 py-1 rounded text-xs font-bold w-fit">Active</span>;
                                                }
                                                return <span className="bg-red-100 text-red-700 px-2 py-1 rounded text-xs font-bold w-fit">{inc.status}</span>;
                                            })()}
                                        </td>
                                        {isHR && (
                                            <td className="px-6 py-4 text-right">
                                                <div className="flex justify-end gap-2">
                                                    {inc.status === 'Pending' && (
                                                        <>
                                                            <button onClick={() => openApprovalModal(inc)} className="px-3 py-1.5 bg-green-500 text-white rounded-lg text-xs font-bold hover:bg-green-600 shadow-lg shadow-green-500/20">Approve</button>
                                                            <button onClick={() => denyRequest(inc.id)} className="p-1.5 bg-red-50 text-red-600 rounded-lg hover:bg-red-100" title="Deny"><XCircle size={18} /></button>
                                                            <button onClick={() => handleDeleteIncentive(inc.id)} className="p-1.5 bg-slate-100 text-slate-500 rounded-lg hover:bg-slate-200" title="Delete"><Trash2 size={18} /></button>
                                                        </>
                                                    )}
                                                    {inc.status === 'Active' && (
                                                        <div className="flex items-center justify-end gap-2">
                                                            <button onClick={(e) => { e.stopPropagation(); openApprovalModal(inc); }} className="px-3 py-1 bg-amber-100 text-amber-700 rounded-lg text-xs font-bold hover:bg-amber-200">Edit</button>
                                                            <button onClick={(e) => { e.stopPropagation(); markCanceled(inc.id); }} className="px-3 py-1 bg-slate-100 text-slate-600 rounded-lg text-xs font-bold hover:bg-slate-200">Cancel</button>
                                                            <button onClick={(e) => { e.stopPropagation(); handleDeleteIncentive(inc.id); }} className="p-1.5 bg-red-50 text-red-600 rounded-lg hover:bg-red-100" title="Delete Permanent"><Trash2 size={16} /></button>
                                                        </div>
                                                    )}
                                                </div>
                                            </td>
                                        )}
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            )}

            {/* Request Modal (Staff) */}
            {isFormOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden animate-in zoom-in-95">
                        <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50">
                            <h2 className="font-bold text-lg text-slate-800">Upload Certificate</h2>
                            <button onClick={() => setIsFormOpen(false)} className="text-slate-400 hover:text-slate-600">Close</button>
                        </div>
                        <form onSubmit={handleSubmit} className="p-6 space-y-4">
                            <div>
                                <label className="block text-sm font-semibold text-slate-700 mb-1">Certificate Name</label>
                                <input required value={formData.courseName} onChange={e => setFormData({ ...formData, courseName: e.target.value })} className="w-full px-4 py-2 rounded-xl border border-slate-200 outline-none" placeholder="e.g. AWS Certified" />
                            </div>
                            <div>
                                <label className="block text-sm font-semibold text-slate-700 mb-1">Description / Notes</label>
                                <textarea required value={formData.description} onChange={e => setFormData({ ...formData, description: e.target.value })} className="w-full px-4 py-2 rounded-xl border border-slate-200 outline-none resize-none" rows={2} placeholder="Brief description..." />
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-semibold text-slate-700 mb-1">Valid From</label>
                                    <input required type="date" value={formData.startDate} onChange={e => setFormData({ ...formData, startDate: e.target.value })} className="w-full px-4 py-2 rounded-xl border border-slate-200 outline-none" />
                                </div>
                                <div>
                                    <label className="block text-sm font-semibold text-slate-700 mb-1">Valid Until</label>
                                    <input required type="date" value={formData.endDate} onChange={e => setFormData({ ...formData, endDate: e.target.value })} className="w-full px-4 py-2 rounded-xl border border-slate-200 outline-none" />
                                </div>
                            </div>
                            <div>
                                <label className="block text-sm font-semibold text-slate-700 mb-1">Upload Certificate (Image)</label>
                                <input type="file" accept="image/*" onChange={handleFileChange} className="w-full text-sm text-slate-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100" />
                                {formData.evidenceUrl && (
                                    <div className="mt-3 relative rounded-xl overflow-hidden border border-slate-200">
                                        <img
                                            src={`${API_BASE_URL}${formData.evidenceUrl}`}
                                            alt="Certificate Preview"
                                            className="w-full h-48 object-contain bg-slate-50"
                                        />
                                        <div className="absolute top-2 right-2 bg-green-500 text-white text-xs font-bold px-2 py-1 rounded-lg shadow-sm">
                                            Uploaded
                                        </div>
                                    </div>
                                )}
                            </div>
                            <button className="w-full py-3 bg-amber-500 hover:bg-amber-600 text-white font-bold rounded-xl shadow-lg mt-2">Submit for Verification</button>
                        </form>
                    </div>
                </div>
            )}

            {/* Approval Modal (HR) */}
            {approvalModal.isOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden animate-in zoom-in-95">
                        <div className="p-6 bg-slate-50 border-b border-slate-100">
                            <h2 className="font-bold text-lg text-slate-800">
                                {approvalModal.incentive?.status === 'Active' ? 'Update Incentive' : 'Approve Incentive'}
                            </h2>
                            <p className="text-xs text-slate-500">
                                {approvalModal.incentive?.status === 'Active'
                                    ? `Modify details for ${approvalModal.incentive?.employeeName}`
                                    : `Set the monthly reward for ${approvalModal.incentive?.employeeName}`}
                            </p>
                        </div>
                        <div className="p-6 space-y-4">
                            <div>
                                <label className="block text-sm font-bold text-slate-700 mb-2">Payment Frequency</label>
                                <div className="flex gap-2 mb-4">
                                    <button
                                        onClick={() => setApprovalPaymentType('Recurring')}
                                        className={`flex-1 py-2 rounded-xl text-sm font-bold border transition-all ${approvalPaymentType === 'Recurring'
                                            ? 'bg-blue-100 border-blue-500 text-blue-700 shadow-sm ring-1 ring-blue-500'
                                            : 'bg-white border-slate-200 text-slate-600 hover:border-slate-300'}`}
                                    >
                                        Recurring (Monthly)
                                    </button>
                                    <button
                                        onClick={() => setApprovalPaymentType('One-Time')}
                                        className={`flex-1 py-2 rounded-xl text-sm font-bold border transition-all ${approvalPaymentType === 'One-Time'
                                            ? 'bg-amber-100 border-amber-500 text-amber-700 shadow-sm ring-1 ring-amber-500'
                                            : 'bg-white border-slate-200 text-slate-600 hover:border-slate-300'}`}
                                    >
                                        One-Time Only
                                    </button>
                                </div>

                                <label className="block text-sm font-bold text-slate-700 mb-2">Select Reward Amount (IDR)</label>
                                <div className="grid grid-cols-2 gap-2">
                                    {['250000', '300000', '500000', '1000000'].map((amount) => (
                                        <button
                                            key={amount}
                                            onClick={() => setApprovalReward(amount)}
                                            className={`px-3 py-2 rounded-xl text-sm font-bold border transition-all ${approvalReward === amount
                                                ? 'bg-green-100 border-green-500 text-green-700 shadow-sm ring-1 ring-green-500'
                                                : 'bg-white border-slate-200 text-slate-600 hover:border-slate-300'
                                                }`}
                                        >
                                            {new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(Number(amount))}
                                        </button>
                                    ))}
                                </div>
                            </div>
                            <div className="flex gap-2 pt-2">
                                <button onClick={() => setApprovalModal({ isOpen: false, id: null, incentive: null })} className="flex-1 py-2 bg-slate-100 text-slate-600 font-bold rounded-xl hover:bg-slate-200 transition-colors">Cancel</button>
                                <button
                                    onClick={confirmApproval}
                                    className={`flex-1 py-2 font-bold rounded-xl shadow-lg transition-all ${approvalReward && approvalPaymentType
                                        ? 'bg-green-600 text-white shadow-green-500/20 hover:bg-green-700'
                                        : 'bg-slate-200 text-slate-400 cursor-not-allowed shadow-none'
                                        }`}
                                    disabled={!approvalReward || !approvalPaymentType}
                                >
                                    {approvalModal.incentive?.status === 'Active' ? 'Update' : 'Confirm'}
                                </button>
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
                confirmText="Yes, Proceed"
                variant="danger"
            />
        </div>
    );
};

const IncentiveManager = (props: IncentiveManagerProps) => (
    <ErrorBoundary>
        <IncentiveManagerContent {...props} />
    </ErrorBoundary>
);

export default IncentiveManager;
