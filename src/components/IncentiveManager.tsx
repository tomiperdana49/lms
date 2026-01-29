import React, { useState, useEffect, type FormEvent, type ChangeEvent } from 'react';
import { Award, Plus, CheckCircle, XCircle, Clock, History, Image as ImageIcon, BarChart2 } from 'lucide-react';
import { API_BASE_URL } from '../config';
import type { User, Incentive } from '../types';
import PopupNotification from './PopupNotification';
import ConfirmationModal from './ConfirmationModal';

interface IncentiveManagerProps {
    user?: User;
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

const IncentiveManagerContent = ({ user }: IncentiveManagerProps) => {
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

    // Approval State (HR)
    const [approvalModal, setApprovalModal] = useState<{ isOpen: boolean, id: number | null, incentive: Incentive | null }>({
        isOpen: false, id: null, incentive: null
    });
    const [approvalReward, setApprovalReward] = useState(''); // HR inputs this

    const [confirmConfig, setConfirmConfig] = useState<{
        isOpen: boolean;
        title: string;
        message: string;
        onConfirm: () => void;
    }>({ isOpen: false, title: '', message: '', onConfirm: () => { } });

    const openConfirm = (title: string, message: string, onConfirm: () => void) => {
        setConfirmConfig({ isOpen: true, title, message, onConfirm });
    };
    // --- Summary Logic State (Moved to top level to avoid hook errors) ---
    const [summaryYear, setSummaryYear] = useState(new Date().getFullYear());

    const isHR = user?.role === 'HR' || user?.role === 'HR_ADMIN';

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
        setApprovalReward(''); // Reset
    };

    const confirmApproval = async () => {
        if (!approvalModal.id || !approvalReward) {
            setNotification({ show: true, type: 'error', message: "Please enter the reward amount." });
            return;
        }

        try {
            const res = await fetch(`${API_BASE_URL}/api/incentives/${approvalModal.id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    status: 'Active',
                    reward: approvalReward
                })
            });

            if (res.ok) {
                const updated = await res.json();
                setIncentives(incentives.map(i => i.id === approvalModal.id ? updated : i));
                setApprovalModal({ isOpen: false, id: null, incentive: null });
            }
        } catch (err) {
            console.error(err);
        }
    };

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
                }
            } catch (err) { console.error(err); }
        });
    };

    const markResign = (id: number) => {
        openConfirm('Mark as Resigned', 'Mark this employee as Resigned and stop incentive?', async () => {
            try {
                const res = await fetch(`${API_BASE_URL}/api/incentives/${id}`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ status: 'Resign' })
                });

                if (res.ok) {
                    const updated = await res.json();
                    setIncentives(incentives.map(i => i.id === id ? updated : i));
                }
            } catch (err) { console.error(err); }
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
    const myIncentives = incentives.filter(i => i.employeeName === user?.name);
    const pendingVerification = incentives.filter(i => i.status === 'Pending');
    const activeIncentives = isHR
        ? incentives.filter(i => i.status === 'Active')
        : myIncentives.filter(i => ['Active', 'Pending'].includes(i.status));
    const historyIncentives = isHR
        ? incentives.filter(i => ['Expired', 'Denied', 'Resign'].includes(i.status))
        : myIncentives.filter(i => ['Expired', 'Denied', 'Resign'].includes(i.status));


    if (isLoading) {
        return (
            <div className="flex items-center justify-center min-h-[500px] bg-white rounded-3xl p-6">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-amber-500"></div>
            </div>
        );
    }

    // --- Summary Logic ---
    // State moved to top level


    // Helper to parse currency string "Rp 100.000" -> 100000
    const parseReward = (rewardStr: string) => {
        if (!rewardStr) return 0;
        return parseInt(rewardStr.replace(/[^0-9]/g, '')) || 0;
    };

    const formatCurrency = (val: number) => new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR' }).format(val);

    const getSummaryData = () => {
        // Only run summary logic if tab is active (Optimization & Safety)
        if (activeTab !== 'summary') return {};

        const tree: Record<string, Record<string, Record<string, Incentive[]>>> = {};

        // Filter for active incentives
        const actives = incentives.filter(i => i.status === 'Active');

        const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

        months.forEach((month, idx) => {
            const monthStart = new Date(summaryYear, idx, 1);
            const monthEnd = new Date(summaryYear, idx + 1, 0);

            actives.forEach(inc => {
                if (!inc.startDate || !inc.endDate) return;

                const start = new Date(inc.startDate);
                const end = new Date(inc.endDate);

                if (isNaN(start.getTime()) || isNaN(end.getTime())) return;

                // If overlap
                if (start <= monthEnd && end >= monthStart) {
                    if (!tree[month]) tree[month] = {};

                    const branch = 'General';
                    // Safe access to employeeName
                    const user = inc.employeeName || 'Unknown';

                    if (!tree[month][branch]) tree[month][branch] = {};
                    if (!tree[month][branch][user]) tree[month][branch][user] = [];

                    tree[month][branch][user].push(inc);
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

                {!isHR && (
                    <button
                        onClick={() => setIsFormOpen(true)}
                        className="bg-amber-500 hover:bg-amber-600 text-white px-6 py-2.5 rounded-xl font-bold shadow-lg shadow-amber-500/20 flex items-center gap-2"
                    >
                        <Plus size={18} /> Upload Certificate
                    </button>
                )}
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
                {!isHR && (
                    <button
                        onClick={() => setActiveTab('request')}
                        className={`px-4 py-2 rounded-xl text-sm font-bold transition-colors flex items-center gap-2 whitespace-nowrap
                            ${activeTab === 'request' ? 'bg-amber-100 text-amber-700' : 'text-slate-500 hover:bg-slate-50'}
                        `}
                    >
                        <Clock size={16} /> My Requests
                    </button>
                )}
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
                    <div className="flex items-center gap-4 bg-white p-4 rounded-xl shadow-sm border border-slate-200">
                        <span className="font-bold text-slate-600">Year:</span>
                        <select
                            value={summaryYear}
                            onChange={(e) => setSummaryYear(parseInt(e.target.value))}
                            className="px-4 py-2 rounded-lg border border-slate-300 font-bold text-slate-700 outline-none focus:ring-2 focus:ring-amber-500"
                        >
                            {[2024, 2025, 2026, 2027].map(y => <option key={y} value={y}>{y}</option>)}
                        </select>
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
                                            <th className="px-4 py-2 w-24 text-center">Active Certs</th>
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
                                                            <div>{employee}</div>
                                                            <div className="text-[10px] uppercase font-bold text-slate-400">{branch}</div>
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
                                <th className="px-6 py-4">Status</th>
                                {isHR && <th className="px-6 py-4 text-right">Actions</th>}
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-200 bg-white">
                            {(
                                activeTab === 'pending' ? pendingVerification :
                                    activeTab === 'active' ? activeIncentives :
                                        activeTab === 'history' ? historyIncentives :
                                            (!isHR && activeTab === 'request') ? myIncentives : []
                            ).map(inc => (
                                <tr key={inc.id} className="hover:bg-slate-50 transition-colors">
                                    <td className="px-6 py-4 font-bold text-slate-700">{inc.employeeName}</td>
                                    <td className="px-6 py-4 text-sm text-slate-600">{inc.courseName}</td>
                                    <td className="px-6 py-4 text-xs text-slate-500 font-medium">
                                        {new Date(inc.startDate).toLocaleDateString()}
                                    </td>
                                    <td className="px-6 py-4 text-xs text-slate-500 font-medium">
                                        {new Date(inc.endDate).toLocaleDateString()}
                                    </td>
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
                                        <span className={`px-2 py-1 rounded text-xs font-bold flex items-center gap-1 w-fit
                                            ${inc.status === 'Active' ? 'bg-green-100 text-green-700' :
                                                inc.status === 'Pending' ? 'bg-blue-50 text-blue-600 border border-blue-100' :
                                                    inc.status === 'Expired' ? 'bg-orange-100 text-orange-700' :
                                                        inc.status === 'Resign' ? 'bg-slate-100 text-slate-500' :
                                                            'bg-red-100 text-red-700'}
                                         `}>
                                            {inc.status === 'Pending' ? 'Processing by HR' : inc.status}
                                        </span>
                                    </td>
                                    {isHR && (
                                        <td className="px-6 py-4 text-right">
                                            <div className="flex justify-end gap-2">
                                                {inc.status === 'Pending' && (
                                                    <>
                                                        <button
                                                            onClick={() => openApprovalModal(inc)}
                                                            className="px-3 py-1.5 bg-green-500 text-white rounded-lg text-xs font-bold hover:bg-green-600 shadow-lg shadow-green-500/20"
                                                        >
                                                            Approve
                                                        </button>
                                                        <button
                                                            onClick={() => denyRequest(inc.id)}
                                                            className="p-1.5 bg-red-50 text-red-600 rounded-lg hover:bg-red-100" title="Deny"
                                                        >
                                                            <XCircle size={18} />
                                                        </button>
                                                    </>
                                                )}
                                                {inc.status === 'Active' && (
                                                    <button
                                                        onClick={() => markResign(inc.id)}
                                                        className="px-3 py-1 bg-slate-100 text-slate-600 rounded-lg text-xs font-bold hover:bg-slate-200"
                                                    >
                                                        Cancel/Resign
                                                    </button>
                                                )}
                                            </div>
                                        </td>
                                    )}
                                </tr>
                            ))}
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
                            <h2 className="font-bold text-lg text-slate-800">Approve Incentive</h2>
                            <p className="text-xs text-slate-500">Set the monthly reward for {approvalModal.incentive?.employeeName}</p>
                        </div>
                        <div className="p-6 space-y-4">
                            <div>
                                <label className="block text-sm font-bold text-slate-700 mb-2">Select Monthly Reward (IDR)</label>
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
                                    className={`flex-1 py-2 font-bold rounded-xl shadow-lg transition-all ${approvalReward
                                        ? 'bg-green-600 text-white shadow-green-500/20 hover:bg-green-700'
                                        : 'bg-slate-200 text-slate-400 cursor-not-allowed shadow-none'
                                        }`}
                                    disabled={!approvalReward}
                                >
                                    Confirm
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
