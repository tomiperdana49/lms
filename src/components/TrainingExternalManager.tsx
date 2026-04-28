import { useState, useEffect } from 'react';
import {
    Search,
    XCircle,
    CheckCircle2,
    FileText,
    Printer,
    DollarSign,
    Calendar,
    Trash2,
    Filter,
    TrendingUp,
    Users,
    Clock,
    Download
} from 'lucide-react';
import { API_BASE_URL } from '../config';
import type { TrainingRequest } from '../types';

const getStatusColor = (status: string) => {
    switch (status) {
        case 'APPROVED': return 'bg-emerald-50 text-emerald-700 border-emerald-100';
        case 'REJECTED': return 'bg-rose-50 text-rose-700 border-rose-100';
        case 'PENDING_HR': return 'bg-indigo-50 text-indigo-700 border-indigo-100';
        default: return 'bg-amber-50 text-amber-700 border-amber-100';
    }
};

const StatusBadge = ({ status }: { status: string }) => {
    const labels: Record<string, string> = {
        'APPROVED': 'Approved',
        'REJECTED': 'Rejected',
        'PENDING_HR': 'Review (HR)',
        'PENDING_SUPERVISOR': 'Review (Spv)'
    };
    return (
        <span className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider border ${getStatusColor(status)}`}>
            {labels[status] || status}
        </span>
    );
};

const TrainingExternalManager = ({ userRole, userName }: { userRole: string; userName?: string }) => {
    // --- Data State ---
    const [requests, setRequests] = useState<TrainingRequest[]>([]);
    const [employees, setEmployees] = useState<any[]>([]);

    // --- Filter State ---
    const [viewMode, setViewMode] = useState<'list' | 'recap'>('list');
    const [selectedYear, setSelectedYear] = useState<number | 'All'>(new Date().getFullYear());
    const [selectedPeriod, setSelectedPeriod] = useState<string>('All Year');
    const [selectedBranch, setSelectedBranch] = useState<string>('All Branches');
    const [branches, setBranches] = useState<string[]>(['All Branches']);
    const [searchQuery, setSearchQuery] = useState('');

    // --- Data Loading ---
    useEffect(() => {
        const loadInitialData = async () => {
            const [trainRes, empRes, branchRes] = await Promise.all([
                fetch(`${API_BASE_URL}/api/training`),
                fetch(`${API_BASE_URL}/api/employees`),
                fetch(`${API_BASE_URL}/api/branches`)
            ]);

            if (trainRes.ok) setRequests(await trainRes.json());
            if (empRes.ok) setEmployees(await empRes.json());
            if (branchRes.ok) {
                const bData = await branchRes.json();
                if (Array.isArray(bData)) {
                    setBranches(['All Branches', ...bData.map((b: any) => b.name)]);
                }
            }
        };
        loadInitialData();
    }, []);

    // --- Modal State ---
    const [selectedRequest, setSelectedRequest] = useState<TrainingRequest | null>(null);
    const [isRejectMode, setIsRejectMode] = useState(false);
    const [rejectReason, setRejectReason] = useState('');
    const [recapDetailUser, setRecapDetailUser] = useState<string | null>(null);

    // Cost Breakdown State
    const [breakdownCost, setBreakdownCost] = useState({
        training: 0,
        transport: 0,
        accommodation: 0,
        others: 0
    });

    useEffect(() => {
        if (selectedRequest) {
            setBreakdownCost({
                training: Number(selectedRequest.costTraining) || 0,
                transport: Number(selectedRequest.costTransport) || 0,
                accommodation: Number(selectedRequest.costAccommodation) || 0,
                others: Number(selectedRequest.costOthers) || 0
            });
        }
    }, [selectedRequest]);

    const totalBreakdown = breakdownCost.training + breakdownCost.transport + breakdownCost.accommodation + breakdownCost.others;

    const [isSettlementOpen, setIsSettlementOpen] = useState(false);
    const [settleData, setSettleData] = useState({
        training: 0,
        transport: 0,
        accommodation: 0,
        others: 0,
        settlementNotes: ''
    });

    const periodOptions = [
        "All Year",
        "Q1 (Jan-Mar)", "Q2 (Apr-Jun)", "Q3 (Jul-Sep)", "Q4 (Oct-Dec)",
        "Semester 1 (Jan-Jun)", "Semester 2 (Jul-Dec)",
        "January", "February", "March", "April", "May", "June",
        "July", "August", "September", "October", "November", "December"
    ];

    const getPeriodDates = () => {
        const year = selectedYear === 'All' ? new Date().getFullYear() : selectedYear;
        let start = new Date(year, 0, 1);
        let end = new Date(year, 11, 31, 23, 59, 59);

        if (selectedPeriod === 'All Year') return [start, end];

        if (selectedPeriod.startsWith('Q1')) { end = new Date(year, 2, 31, 23, 59, 59); }
        else if (selectedPeriod.startsWith('Q2')) { start = new Date(year, 3, 1); end = new Date(year, 5, 30, 23, 59, 59); }
        else if (selectedPeriod.startsWith('Q3')) { start = new Date(year, 6, 1); end = new Date(year, 8, 30, 23, 59, 59); }
        else if (selectedPeriod.startsWith('Q4')) { start = new Date(year, 9, 1); end = new Date(year, 11, 31, 23, 59, 59); }
        else if (selectedPeriod.startsWith('Semester 1')) { end = new Date(year, 5, 30, 23, 59, 59); }
        else if (selectedPeriod.startsWith('Semester 2')) { start = new Date(year, 6, 1); }
        else {
            const monthIdx = new Date(`${selectedPeriod} 1, ${year}`).getMonth();
            if (!isNaN(monthIdx)) {
                start = new Date(year, monthIdx, 1);
                end = new Date(year, monthIdx + 1, 0, 23, 59, 59);
            }
        }
        return [start, end];
    };

    const filteredRequests = requests.filter(req => {
        if (req.employeeName === userName) return false;

        const d = new Date(req.date);
        const [start, end] = getPeriodDates();

        if (selectedYear !== 'All' && d.getFullYear() !== selectedYear) return false;
        if (d < start || d > end) return false;

        const emp = employees.find(e =>
            (req.employee_id && e.id_employee === req.employee_id) ||
            (req.employeeName && e.full_name && e.full_name.trim().toLowerCase() === req.employeeName.trim().toLowerCase())
        );
        const empBranch = emp?.branch_name || 'Others';

        if (selectedBranch !== 'All Branches' && empBranch !== selectedBranch) return false;

        const lowerSearch = searchQuery.toLowerCase();
        return (
            (req.employeeName || '').toLowerCase().includes(lowerSearch) ||
            (req.title || '').toLowerCase().includes(lowerSearch) ||
            (req.vendor || '').toLowerCase().includes(lowerSearch)
        );
    });


    const formatCurrency = (amount: number) => {
        return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(amount);
    };

    const handleAction = async (id: number, action: 'approve' | 'reject', reason?: string) => {
        if (action === 'reject' && !reason) {
            alert("Please provide a rejection reason.");
            return;
        }

        try {
            const finalCost = isNaN(totalBreakdown) ? 0 : totalBreakdown;
            const res = await fetch(`${API_BASE_URL}/api/training/${id}/approve`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    action,
                    reason,
                    approverName: userName || 'Admin',
                    ...(action === 'approve' ? {
                        cost: finalCost,
                        costTraining: breakdownCost.training,
                        costTransport: breakdownCost.transport,
                        costAccommodation: breakdownCost.accommodation,
                        costOthers: breakdownCost.others
                    } : {})
                })
            });
            if (res.ok) {
                const updated = await res.json();
                setRequests(requests.map(r => r.id === id ? updated : r));
                setSelectedRequest(null);
                setIsRejectMode(false);
                setRejectReason('');
            }
        } catch (err) {
            console.error("Action failed", err);
        }
    };

    const handleDeleteRequest = async (id: number) => {
        if (!window.confirm("Are you sure you want to permanently delete this training request?")) return;
        try {
            const res = await fetch(`${API_BASE_URL}/api/training/${id}`, { method: 'DELETE' });
            if (res.ok) {
                setRequests(requests.filter(r => r.id !== id));
            }
        } catch (err) { console.error(err); }
    };

    const handlePrint = (req: TrainingRequest) => {
        const printWindow = window.open('', '_blank');
        if (printWindow) {
            printWindow.document.write(`
                <html>
                <head>
                    <title>Training Approval - ${req.id}</title>
                    <style>
                        body { font-family: 'Inter', sans-serif; padding: 50px; color: #1e293b; line-height: 1.6; }
                        .header { text-align: center; margin-bottom: 50px; border-bottom: 2px solid #f1f5f9; padding-bottom: 30px; }
                        .title { font-size: 28px; font-weight: 900; color: #0f172a; margin-bottom: 5px; }
                        .doc-id { font-size: 12px; font-weight: 700; color: #64748b; text-transform: uppercase; letter-spacing: 0.1em; }
                        .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 40px; margin-bottom: 40px; }
                        .label { font-size: 10px; color: #94a3b8; text-transform: uppercase; font-weight: 900; letter-spacing: 0.05em; margin-bottom: 5px; }
                        .value { font-size: 15px; font-weight: 700; color: #334155; }
                        .box { background: #f8fafc; padding: 25px; border-radius: 16px; border: 1px solid #f1f5f9; margin-bottom: 40px; }
                        .footer { margin-top: 80px; text-align: center; font-size: 11px; color: #94a3b8; font-weight: 600; }
                        .stamp { border: 3px solid #10b981; color: #10b981; display: inline-block; padding: 12px 25px; font-weight: 900; text-transform: uppercase; transform: rotate(-3deg); margin-top: 30px; border-radius: 8px; font-size: 14px; }
                    </style>
                </head>
                <body>
                    <div class="header">
                        <div class="title">External Training Certificate of Approval</div>
                        <div class="doc-id">Reference: LTR-${req.id}</div>
                    </div>
                    
                    <div class="grid">
                        <div>
                            <div class="label">Employee Name</div>
                            <div class="value">${req.employeeName}</div>
                            <div style="font-size: 13px; color: #64748b; font-weight: 500;">${req.employeeRole}</div>
                        </div>
                        <div>
                            <div class="label">Approval Date</div>
                            <div class="value">${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</div>
                        </div>
                    </div>

                    <div class="box">
                        <div class="grid" style="margin-bottom: 0;">
                            <div>
                                <div class="label">Training Program</div>
                                <div class="value">${req.title}</div>
                            </div>
                            <div>
                                <div class="label">Vendor / Provider</div>
                                <div class="value">${req.vendor}</div>
                            </div>
                        </div>
                    </div>

                    <div class="grid">
                        <div>
                            <div class="label">Total Approved Budget</div>
                            <div class="value" style="font-size: 20px; color: #0f172a;">${new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR' }).format(req.cost)}</div>
                        </div>
                        <div style="text-align: right;">
                             <div class="stamp">Approved by HR</div>
                        </div>
                    </div>

                    <div class="footer">
                        Nusa Learning Management System • Official Document
                    </div>
                </body>
                </html>
            `);
            printWindow.document.close();
            setTimeout(() => printWindow.print(), 500);
        }
    };

    const handleOpenSettlement = (req: TrainingRequest) => {
        setSettleData({
            training: Number(req.costTraining) || Number(req.cost) || 0,
            transport: Number(req.costTransport) || 0,
            accommodation: Number(req.costAccommodation) || 0,
            others: Number(req.costOthers) || 0,
            settlementNotes: req.rejectionReason || ''
        });
        setIsSettlementOpen(true);
    };

    const handleSaveSettlement = async () => {
        if (!selectedRequest) return;
        try {
            const newTotal = settleData.training + settleData.transport + settleData.accommodation + settleData.others;
            const excess = Math.max(0, newTotal - (selectedRequest.cost || 0));

            const res = await fetch(`${API_BASE_URL}/api/training/${selectedRequest.id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    cost: newTotal,
                    costTraining: settleData.training,
                    costTransport: settleData.transport,
                    costAccommodation: settleData.accommodation,
                    costOthers: settleData.others,
                    additionalCost: excess,
                    settlementNote: settleData.settlementNotes
                })
            });

            if (res.ok) {
                const updated = await res.json();
                setRequests(requests.map(r => r.id === updated.id ? updated : r));
                setIsSettlementOpen(false);
                setSelectedRequest(updated);
            }
        } catch (err) { console.error(err); }
    };

    const getUserRecap = () => {
        const [start, end] = getPeriodDates();
        const userGroups: Record<string, TrainingRequest[]> = {};

        requests.forEach(req => {
            const d = new Date(req.date);
            if (selectedYear !== 'All' && d.getFullYear() !== selectedYear) return;
            if (d < start || d > end) return;

            const emp = employees.find(e =>
                (req.employee_id && e.id_employee === req.employee_id) ||
                (req.employeeName && e.full_name && e.full_name.trim().toLowerCase() === req.employeeName.trim().toLowerCase())
            );
            const empBranch = emp?.branch_name || 'Others';

            if (selectedBranch !== 'All Branches' && empBranch !== selectedBranch) return;

            const searchLower = searchQuery.toLowerCase();
            if (searchQuery &&
                !req.employeeName.toLowerCase().includes(searchLower) &&
                !req.title.toLowerCase().includes(searchLower)) return;

            const name = req.employeeName;
            if (!userGroups[name]) userGroups[name] = [];
            userGroups[name].push(req);
        });

        return Object.entries(userGroups).map(([name, items]) => {
            const totalRequests = items.length;
            const approvedRequests = items.filter(i => i.status === 'APPROVED').length;
            const totalCost = items.reduce((sum, i) => {
                if (i.status !== 'APPROVED') return sum;
                return sum + (Number(i.cost) || 0) + (Number(i.additionalCost) || 0);
            }, 0);

            return {
                name,
                totalRequests,
                approvedRequests,
                totalCost,
                requests: items
            };
        }).sort((a, b) => b.totalCost - a.totalCost);
    };

    // --- Statistics ---
    const stats = {
        totalBudget: filteredRequests.reduce((sum, r) => r.status === 'APPROVED' ? sum + (Number(r.cost) || 0) : sum, 0),
        pendingCount: filteredRequests.filter(r => r.status.startsWith('PENDING')).length,
        approvedCount: filteredRequests.filter(r => r.status === 'APPROVED').length,
        averageCost: filteredRequests.length ? filteredRequests.reduce((sum, r) => sum + (Number(r.cost) || 0), 0) / filteredRequests.length : 0
    };

    return (
        <div className="space-y-10 animate-fade-in max-w-[1600px] mx-auto py-6">
            {/* Header & View Switcher */}
            <div className="flex flex-col xl:flex-row justify-between items-start xl:items-center gap-6">
                <div>
                    <h1 className="text-4xl font-black text-slate-900 tracking-tight">External Training Manager</h1>
                    <p className="text-slate-400 font-bold uppercase tracking-widest text-[10px] mt-1">Nusa LMS • Enterprise Request Governance</p>
                </div>

                <div className="flex items-center gap-4 bg-white p-1.5 rounded-2xl border border-slate-200 shadow-sm">
                    <button
                        onClick={() => setViewMode('list')}
                        className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-black tracking-widest transition-all ${viewMode === 'list' ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-100' : 'text-slate-400 hover:text-slate-600'}`}
                    >
                        <Clock size={16} /> LIST VIEW
                    </button>
                    <button
                        onClick={() => setViewMode('recap')}
                        className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-black tracking-widest transition-all ${viewMode === 'recap' ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-100' : 'text-slate-400 hover:text-slate-600'}`}
                    >
                        <TrendingUp size={16} /> RECAPITULATION
                    </button>
                </div>
            </div>

            {/* Insight Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                {[
                    { label: 'Total Investment', value: formatCurrency(stats.totalBudget), icon: DollarSign, color: 'text-emerald-600', bg: 'bg-emerald-50' },
                    { label: 'Pending Approval', value: stats.pendingCount, icon: Clock, color: 'text-indigo-600', bg: 'bg-indigo-50' },
                    { label: 'Successful Enrollments', value: stats.approvedCount, icon: CheckCircle2, color: 'text-blue-600', bg: 'bg-blue-50' },
                    { label: 'Average Per Head', value: formatCurrency(stats.averageCost), icon: Users, color: 'text-amber-600', bg: 'bg-amber-50' }
                ].map((stat, i) => (
                    <div key={i} className="bg-white p-6 rounded-[32px] border border-slate-100 shadow-sm flex items-center gap-5 group hover:border-indigo-100 transition-all duration-300">
                        <div className={`p-4 ${stat.bg} ${stat.color} rounded-2xl group-hover:scale-110 transition-transform duration-500`}>
                            <stat.icon size={24} strokeWidth={2.5} />
                        </div>
                        <div>
                            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">{stat.label}</p>
                            <p className="text-xl font-black text-slate-900 leading-none">{stat.value}</p>
                        </div>
                    </div>
                ))}
            </div>

            {/* Global Filter Bar */}
            <div className="bg-white p-6 rounded-[32px] shadow-sm border border-slate-100 flex flex-row items-center gap-4 overflow-x-auto no-scrollbar">
                <div className="relative min-w-[300px] lg:w-[400px] flex-shrink-0">
                    <Search className="absolute left-5 top-4.5 text-slate-300" size={18} />
                    <input
                        type="text"
                        placeholder="Search employee, title, or vendor..."
                        className="w-full pl-14 pr-6 py-4 rounded-2xl bg-slate-50 border border-transparent focus:bg-white focus:border-indigo-500 focus:ring-4 focus:ring-indigo-100 outline-none font-bold text-slate-700 transition-all placeholder:text-slate-300"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                    />
                </div>

                <div className="flex items-center gap-3 flex-nowrap min-w-max ml-auto">
                    <div className="flex items-center gap-2 bg-slate-50 p-1 rounded-2xl border border-slate-100">
                        <div className="w-10 h-10 flex items-center justify-center bg-white rounded-xl shadow-sm text-slate-400">
                            <Filter size={16} />
                        </div>
                        <select
                            value={selectedBranch}
                            onChange={(e) => setSelectedBranch(e.target.value)}
                            className="bg-transparent px-3 py-2 rounded-xl font-black text-slate-600 text-[10px] outline-none tracking-widest cursor-pointer min-w-[140px]"
                        >
                            {branches.map(b => (
                                <option key={b} value={b}>{b.toUpperCase()}</option>
                            ))}
                        </select>
                    </div>

                    <div className="flex items-center gap-2 bg-slate-50 p-1 rounded-2xl border border-slate-100">
                        <div className="w-10 h-10 flex items-center justify-center bg-white rounded-xl shadow-sm text-slate-400">
                            <Calendar size={16} />
                        </div>
                        <select
                            value={selectedYear}
                            onChange={(e) => setSelectedYear(e.target.value === 'All' ? 'All' : parseInt(e.target.value))}
                            className="bg-transparent px-3 py-2 rounded-xl font-black text-slate-600 text-[10px] outline-none tracking-widest cursor-pointer min-w-[100px]"
                        >
                            <option value="All">ALL YEARS</option>
                            {Array.from({ length: Math.max(1, new Date().getFullYear() - 2026 + 1) }, (_, i) => 2026 + i).map(y => <option key={y} value={y}>{y}</option>)}
                        </select>
                    </div>

                    <div className="flex items-center gap-2 bg-slate-50 p-1 rounded-2xl border border-slate-100">
                        <div className="w-10 h-10 flex items-center justify-center bg-white rounded-xl shadow-sm text-slate-400">
                            <Clock size={16} />
                        </div>
                        <select
                            value={selectedPeriod}
                            onChange={(e) => setSelectedPeriod(e.target.value)}
                            className="bg-transparent px-3 py-2 rounded-xl font-black text-slate-600 text-[10px] outline-none tracking-widest cursor-pointer min-w-[140px]"
                        >
                            {periodOptions.map(opt => (
                                <option key={opt} value={opt}>{opt.toUpperCase()}</option>
                            ))}
                        </select>
                    </div>
                </div>
            </div>

            {viewMode === 'list' ? (
                <div className="grid grid-cols-1 gap-4">
                    {filteredRequests.length === 0 ? (
                        <div className="bg-white p-20 rounded-[40px] border border-slate-100 flex flex-col items-center gap-3">
                            <div className="w-16 h-16 rounded-3xl bg-slate-50 flex items-center justify-center text-slate-200">
                                <FileText size={32} />
                            </div>
                            <p className="text-sm font-black text-slate-400 uppercase tracking-widest">No matching requests found</p>
                        </div>
                    ) : (
                        filteredRequests.map(req => (
                            <div key={req.id} className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm hover:shadow-md transition-all group relative">
                                <div className="flex justify-between items-start">
                                    <div className="space-y-3">
                                        <div className="flex items-center gap-3">
                                            <h4 className="text-lg font-black text-slate-900 group-hover:text-indigo-600 transition-colors leading-none">{req.title}</h4>
                                            <StatusBadge status={req.status} />
                                        </div>
                                        
                                        <p className="text-sm font-bold text-slate-500">
                                            {req.employeeName} <span className="mx-2 text-slate-300">—</span> {req.employeeRole}
                                        </p>

                                        <div className="flex flex-wrap items-center gap-2">
                                            <div className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-50 rounded-lg text-[10px] font-black text-slate-400 border border-slate-100">
                                                <Calendar size={14} className="text-slate-300" />
                                                {new Date(req.date).toLocaleDateString('en-GB')}
                                            </div>
                                            <div className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-50 rounded-lg text-[10px] font-black text-slate-400 border border-slate-100">
                                                <DollarSign size={14} className="text-slate-300" />
                                                {formatCurrency(req.cost || 0)}
                                            </div>
                                            <div className="px-3 py-1.5 bg-slate-50 rounded-lg text-[10px] font-black text-slate-400 border border-slate-100 uppercase tracking-wider">
                                                {req.vendor}
                                            </div>
                                        </div>

                                        <div className="flex items-center gap-3 pt-2">
                                            <div className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border text-[9px] font-black uppercase tracking-tighter ${req.supervisorName ? 'bg-emerald-50 text-emerald-700 border-emerald-100' : 'bg-slate-50 text-slate-400 border-slate-100'}`}>
                                                <div className={`w-4 h-4 rounded-full flex items-center justify-center ${req.supervisorName ? 'bg-emerald-100' : 'bg-slate-200'}`}>
                                                    <CheckCircle2 size={10} />
                                                </div>
                                                <div>
                                                    <p className="opacity-60 leading-none mb-0.5">Supervisor</p>
                                                    <p className="leading-none">{req.supervisorName || 'PENDING'}</p>
                                                </div>
                                            </div>
                                            <div className="w-8 h-px bg-slate-100" />
                                            <div className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border text-[9px] font-black uppercase tracking-tighter ${req.hrName ? 'bg-emerald-50 text-emerald-700 border-emerald-100' : 'bg-slate-50 text-slate-400 border-slate-100'}`}>
                                                <div className={`w-4 h-4 rounded-full flex items-center justify-center ${req.hrName ? 'bg-emerald-100' : 'bg-slate-200'}`}>
                                                    <CheckCircle2 size={10} />
                                                </div>
                                                <div>
                                                    <p className="opacity-60 leading-none mb-0.5">HR DEPT</p>
                                                    <p className="leading-none">{req.hrName || 'PENDING'}</p>
                                                </div>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="flex items-center gap-2">
                                        <button onClick={() => setSelectedRequest(req)} className="p-3 text-slate-300 hover:text-indigo-600 hover:bg-indigo-50 rounded-xl transition-all" title="View Dossier">
                                            <FileText size={20} />
                                        </button>
                                        {(userRole === 'HR' || userRole === 'HR_ADMIN') && (
                                            <button onClick={() => handleDeleteRequest(req.id)} className="p-3 text-slate-300 hover:text-rose-600 hover:bg-rose-50 rounded-xl transition-all">
                                                <Trash2 size={20} />
                                            </button>
                                        )}
                                    </div>
                                </div>
                            </div>
                        ))
                    )}
                </div>
            ) : (
                <div className="bg-white rounded-[40px] shadow-sm border border-slate-100 overflow-hidden">
                    <table className="w-full text-left">
                        <thead className="bg-slate-50 text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">
                            <tr>
                                <th className="px-10 py-6">Professional Entity</th>
                                <th className="px-10 py-6 text-center">Requests</th>
                                <th className="px-10 py-6 text-center">Approved</th>
                                <th className="px-10 py-6 text-right">Total Investment</th>
                                <th className="px-10 py-6 text-center">Action Hub</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-50">
                            {getUserRecap().map((stat, idx) => (
                                <tr key={idx} className="hover:bg-slate-50 transition-colors">
                                    <td className="px-10 py-6">
                                        <div className="flex items-center gap-4">
                                            <div className="w-12 h-12 rounded-[18px] bg-indigo-100 text-indigo-700 flex items-center justify-center font-black text-lg shadow-inner">
                                                {stat.name.charAt(0)}
                                            </div>
                                            <p className="font-black text-slate-800 text-base">{stat.name}</p>
                                        </div>
                                    </td>
                                    <td className="px-10 py-6 text-center font-black text-slate-600">{stat.totalRequests}</td>
                                    <td className="px-10 py-6 text-center">
                                        <span className="bg-emerald-100 text-emerald-700 px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-widest">
                                            {stat.approvedRequests} Enrollments
                                        </span>
                                    </td>
                                    <td className="px-10 py-6 text-right font-mono text-slate-900 font-black text-base">
                                        {formatCurrency(stat.totalCost)}
                                    </td>
                                    <td className="px-10 py-6 text-center">
                                        <button
                                            onClick={() => setRecapDetailUser(stat.name)}
                                            className="px-6 py-2.5 bg-white border border-slate-200 text-slate-600 hover:bg-indigo-600 hover:text-white hover:border-indigo-600 rounded-2xl text-[10px] font-black tracking-widest transition-all shadow-sm"
                                        >
                                            VIEW DOSSIER
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}

            {/* Modal Components */}
            {selectedRequest && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-slate-900/60 backdrop-blur-md animate-in fade-in duration-300">
                    <div className="bg-white rounded-[50px] shadow-2xl w-full max-w-4xl overflow-hidden ring-1 ring-white/10 flex flex-col max-h-[95vh] animate-in zoom-in-95 duration-300">
                        <div className="p-12 border-b border-slate-50 flex justify-between items-start bg-slate-50/50">
                            <div>
                                <div className="flex items-center gap-4 mb-3">
                                    <StatusBadge status={selectedRequest.status} />
                                    <span className="text-slate-400 font-black text-[10px] uppercase tracking-widest">LTR-ID: {selectedRequest.id}</span>
                                </div>
                                <h2 className="text-4xl font-black text-slate-900 leading-tight">{selectedRequest.title}</h2>
                                <p className="text-lg font-bold text-slate-400 mt-2">{selectedRequest.vendor} • {selectedRequest.location}</p>
                            </div>
                            <button onClick={() => setSelectedRequest(null)} className="p-4 bg-white hover:bg-slate-100 rounded-3xl text-slate-300 hover:text-slate-600 transition-all shadow-sm">
                                <XCircle size={32} />
                            </button>
                        </div>

                        <div className="p-12 overflow-y-auto space-y-12">
                            <div className="grid md:grid-cols-2 gap-8">
                                <div className="p-8 rounded-[40px] bg-slate-50 border border-slate-100 flex items-center gap-6">
                                    <div className="w-16 h-16 rounded-[24px] bg-white text-indigo-600 flex items-center justify-center font-black text-2xl shadow-sm border border-slate-200">
                                        {selectedRequest.employeeName.charAt(0)}
                                    </div>
                                    <div>
                                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Applicant Identity</p>
                                        <p className="font-black text-slate-800 text-xl">{selectedRequest.employeeName}</p>
                                        <p className="text-sm font-bold text-indigo-500 uppercase tracking-tight">{selectedRequest.employeeRole}</p>
                                    </div>
                                </div>
                                <div className="p-8 rounded-[40px] bg-indigo-600 text-white flex flex-col justify-center">
                                    <p className="text-[10px] font-black text-white/60 uppercase tracking-widest mb-1">Total Investment Approved</p>
                                    <p className="text-3xl font-black">{formatCurrency(selectedRequest.cost || 0)}</p>
                                </div>
                            </div>

                            <div className="space-y-6">
                                <h5 className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Strategic Justification</h5>
                                <div className="p-10 bg-slate-50 rounded-[40px] border border-slate-100 italic font-bold text-slate-600 text-lg leading-relaxed">
                                    "{selectedRequest.justification}"
                                </div>
                            </div>

                            {(userRole === 'HR' || userRole === 'HR_ADMIN') && selectedRequest.status === 'PENDING_HR' && (
                                <div className="space-y-6">
                                    <h5 className="text-[10px] font-black text-indigo-600 uppercase tracking-widest ml-1">Finance Allocation Control</h5>
                                    <div className="bg-indigo-50/50 rounded-[40px] p-10 border border-indigo-100 grid sm:grid-cols-2 gap-6">
                                        {[
                                            { label: 'Training Fee', field: 'training' },
                                            { label: 'Travel Cost', field: 'transport' },
                                            { label: 'Accommodation', field: 'accommodation' },
                                            { label: 'Miscellaneous', field: 'others' }
                                        ].map((item) => (
                                            <div key={item.field}>
                                                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 ml-1">{item.label}</label>
                                                <div className="relative">
                                                    <span className="absolute left-5 top-3.5 font-black text-slate-300">Rp</span>
                                                    <input
                                                        type="text"
                                                        value={new Intl.NumberFormat('id-ID').format((breakdownCost as any)[item.field])}
                                                        onChange={(e) => {
                                                            const val = Number(e.target.value.replace(/\D/g, ''));
                                                            setBreakdownCost(prev => ({ ...prev, [item.field]: val }));
                                                        }}
                                                        className="w-full pl-12 pr-6 py-4 rounded-2xl border-2 border-indigo-100 focus:border-indigo-500 outline-none text-base font-black text-slate-700 bg-white transition-all shadow-sm"
                                                    />
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>

                        <div className="p-10 bg-slate-50 border-t border-slate-100 flex justify-between items-center gap-6">
                            <div className="flex items-center gap-4">
                                {selectedRequest.evidenceUrl && (
                                    <a href={selectedRequest.evidenceUrl} target="_blank" rel="noopener noreferrer" className="px-6 py-3 bg-white text-slate-600 border border-slate-200 rounded-2xl text-[10px] font-black tracking-widest hover:bg-slate-50 transition-all flex items-center gap-2">
                                        <Download size={14} /> DOWNLOAD EVIDENCE
                                    </a>
                                )}
                                <button onClick={() => handlePrint(selectedRequest)} className="px-6 py-3 bg-white text-slate-600 border border-slate-200 rounded-2xl text-[10px] font-black tracking-widest hover:bg-slate-50 transition-all flex items-center gap-2">
                                    <Printer size={14} /> PRINT DOSSIER
                                </button>
                            </div>

                            <div className="flex items-center gap-4">
                                {isRejectMode ? (
                                    <div className="flex gap-3 animate-in slide-in-from-right-4">
                                        <input
                                            autoFocus
                                            placeholder="Enter rejection reason..."
                                            className="px-6 py-3 rounded-2xl border-2 border-rose-200 outline-none font-bold text-sm min-w-[300px]"
                                            value={rejectReason}
                                            onChange={(e) => setRejectReason(e.target.value)}
                                        />
                                        <button onClick={() => handleAction(selectedRequest.id, 'reject', rejectReason)} className="px-8 py-3 bg-rose-600 text-white rounded-2xl font-black text-xs tracking-widest shadow-lg shadow-rose-100 active:scale-95 transition-all">REJECT NOW</button>
                                        <button onClick={() => setIsRejectMode(false)} className="px-8 py-3 bg-white text-slate-400 rounded-2xl font-black text-xs tracking-widest border border-slate-200">CANCEL</button>
                                    </div>
                                ) : (
                                    <>
                                        {((userRole === 'SUPERVISOR' && selectedRequest.status === 'PENDING_SUPERVISOR') || (userRole === 'HR' && selectedRequest.status === 'PENDING_HR')) && (
                                            <>
                                                <button onClick={() => setIsRejectMode(true)} className="px-10 py-4 bg-white text-rose-600 border-2 border-rose-100 hover:border-rose-600 rounded-[24px] font-black text-xs tracking-[0.2em] transition-all">REJECT</button>
                                                <button onClick={() => handleAction(selectedRequest.id, 'approve')} className="px-10 py-4 bg-indigo-600 text-white rounded-[24px] font-black text-xs tracking-[0.2em] shadow-xl shadow-indigo-100 hover:bg-indigo-700 active:scale-95 transition-all">APPROVE DOSSIER</button>
                                            </>
                                        )}
                                        {selectedRequest.status === 'APPROVED' && (userRole === 'HR' || userRole === 'HR_ADMIN') && (
                                            <button onClick={() => handleOpenSettlement(selectedRequest)} className="px-10 py-4 bg-emerald-600 text-white rounded-[24px] font-black text-xs tracking-[0.2em] shadow-xl shadow-emerald-100 hover:bg-emerald-700 active:scale-95 transition-all">UPDATE SETTLEMENT</button>
                                        )}
                                    </>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Recap Detail Modal */}
            {recapDetailUser && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-slate-900/60 backdrop-blur-md animate-in fade-in duration-300">
                    <div className="bg-white rounded-[50px] shadow-2xl w-full max-w-6xl overflow-hidden flex flex-col max-h-[90vh]">
                        <div className="p-12 border-b border-slate-50 flex justify-between items-center bg-white">
                            <div>
                                <h2 className="font-black text-2xl text-slate-900 tracking-tight flex items-center gap-4">
                                    <div className="w-10 h-10 rounded-xl bg-indigo-100 text-indigo-600 flex items-center justify-center"><FileText size={20} /></div>
                                    {recapDetailUser} • Training Archive
                                </h2>
                                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-1 ml-14">{selectedPeriod} • {selectedYear}</p>
                            </div>
                            <button onClick={() => setRecapDetailUser(null)} className="p-4 hover:bg-slate-100 rounded-3xl text-slate-300 transition-colors"><XCircle size={24} /></button>
                        </div>

                        <div className="overflow-y-auto p-12">
                            <table className="w-full text-left">
                                <thead className="bg-slate-50 text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">
                                    <tr>
                                        <th className="px-6 py-4">Date</th>
                                        <th className="px-6 py-4">Training Title</th>
                                        <th className="px-6 py-4">Vendor</th>
                                        <th className="px-6 py-4 text-right">Investment</th>
                                        <th className="px-6 py-4 text-right">Adjustment</th>
                                        <th className="px-6 py-4 text-right">Net Total</th>
                                        <th className="px-6 py-4 text-center">Status</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-50">
                                    {getUserRecap().find(u => u.name === recapDetailUser)?.requests.map((r) => (
                                        <tr key={r.id} className="hover:bg-slate-50 transition-colors">
                                            <td className="px-6 py-4 text-slate-400 text-xs font-bold">{new Date(r.date).toLocaleDateString()}</td>
                                            <td className="px-6 py-4 font-black text-slate-800">{r.title}</td>
                                            <td className="px-6 py-4 text-slate-500 font-bold text-xs">{r.vendor}</td>
                                            <td className="px-6 py-4 text-right font-mono text-slate-400 font-bold text-xs">
                                                {formatCurrency(Number(r.cost) || 0)}
                                            </td>
                                            <td className="px-6 py-4 text-right font-mono text-rose-500 font-bold text-xs">
                                                {(Number(r.additionalCost) || 0) > 0 ? formatCurrency(Number(r.additionalCost) || 0) : '-'}
                                            </td>
                                            <td className="px-6 py-4 text-right font-mono text-slate-900 font-black">
                                                {formatCurrency((Number(r.cost) || 0) + (Number(r.additionalCost) || 0))}
                                            </td>
                                            <td className="px-6 py-4 text-center">
                                                <StatusBadge status={r.status} />
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>

                        <div className="p-10 border-t border-slate-50 bg-slate-50/50 text-right">
                            <button onClick={() => setRecapDetailUser(null)} className="px-10 py-4 bg-white border border-slate-200 text-slate-600 font-black rounded-3xl hover:bg-slate-100 transition-all text-xs tracking-widest shadow-sm">
                                CLOSE ARCHIVE
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Settlement Modal */}
            {isSettlementOpen && (
                <div className="fixed inset-0 z-[60] flex items-center justify-center p-6 bg-slate-900/60 backdrop-blur-md animate-in fade-in">
                    <div className="bg-white rounded-[50px] shadow-2xl w-full max-w-2xl overflow-hidden animate-in zoom-in-95">
                        <div className="p-10 border-b border-slate-50 flex justify-between items-center bg-slate-50/50">
                            <div>
                                <h2 className="font-black text-2xl text-slate-900 tracking-tight">Finance Settlement</h2>
                                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-1">Final Actual Expenditure Review</p>
                            </div>
                            <button onClick={() => setIsSettlementOpen(false)} className="p-3 hover:bg-slate-100 rounded-2xl text-slate-300 transition-colors"><XCircle size={24} /></button>
                        </div>

                        <div className="p-10 space-y-6">
                            <div className="grid grid-cols-2 gap-4">
                                {[
                                    { label: 'Training Cost', field: 'training' },
                                    { label: 'Transport', field: 'transport' },
                                    { label: 'Accommodation', field: 'accommodation' },
                                    { label: 'Others', field: 'others' }
                                ].map((item) => (
                                    <div key={item.field}>
                                        <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 ml-1">{item.label}</label>
                                        <div className="relative">
                                            <span className="absolute left-4 top-3 text-xs font-black text-slate-300">Rp</span>
                                            <input
                                                type="text"
                                                value={new Intl.NumberFormat('id-ID').format((settleData as any)[item.field])}
                                                onChange={(e) => {
                                                    const val = Number(e.target.value.replace(/\D/g, ''));
                                                    setSettleData(prev => ({ ...prev, [item.field]: val }));
                                                }}
                                                className="w-full pl-10 pr-4 py-2.5 rounded-2xl border-2 border-slate-100 focus:border-emerald-500 outline-none text-sm font-black text-slate-700 bg-white transition-all"
                                            />
                                        </div>
                                    </div>
                                ))}
                            </div>

                            <div className="bg-emerald-900 p-8 rounded-[32px] text-white shadow-xl shadow-emerald-100">
                                <div className="flex justify-between items-center">
                                    <span className="text-[10px] font-black uppercase tracking-[0.2em] opacity-60">Total Actual Expenditure</span>
                                    <span className="text-2xl font-black">
                                        {formatCurrency(settleData.training + settleData.transport + settleData.accommodation + settleData.others)}
                                    </span>
                                </div>
                            </div>

                            <div>
                                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 ml-1">Settlement Notes</label>
                                <textarea
                                    className="w-full px-6 py-4 rounded-3xl bg-slate-50 border border-slate-100 focus:bg-white outline-none font-bold text-slate-700 text-sm resize-none"
                                    rows={3}
                                    placeholder="Add notes for finance department..."
                                    value={settleData.settlementNotes}
                                    onChange={(e) => setSettleData(prev => ({ ...prev, settlementNotes: e.target.value }))}
                                />
                            </div>
                        </div>

                        <div className="p-8 bg-slate-50 border-t border-slate-100 flex justify-end gap-4">
                            <button onClick={() => setIsSettlementOpen(false)} className="px-8 py-3 bg-white text-slate-400 rounded-2xl font-black text-xs tracking-widest border border-slate-200">CANCEL</button>
                            <button onClick={handleSaveSettlement} className="px-8 py-3 bg-emerald-600 text-white rounded-2xl font-black text-xs tracking-widest shadow-lg shadow-emerald-100 hover:bg-emerald-700 transition-all">CONFIRM SETTLEMENT</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default TrainingExternalManager;
