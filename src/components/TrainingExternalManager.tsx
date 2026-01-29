import { useState, useEffect } from 'react';
import {
    Search,
    XCircle,
    CheckCircle2,
    FileText,
    Printer,
    DollarSign,
    Calendar
} from 'lucide-react';
import { API_BASE_URL } from '../config';
import type { TrainingRequest } from '../types';



const getStatusColor = (status: string) => {
    switch (status) {
        case 'APPROVED': return 'bg-green-100 text-green-700 border-green-200';
        case 'REJECTED': return 'bg-red-100 text-red-700 border-red-200';
        case 'PENDING_HR': return 'bg-purple-100 text-purple-700 border-purple-200';
        default: return 'bg-orange-100 text-orange-700 border-orange-200';
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
        <span className={`px-2.5 py-1 rounded-lg text-xs font-bold border ${getStatusColor(status)}`}>
            {labels[status] || status}
        </span>
    );
};

const TrainingExternalManager = ({ userRole, userName }: { userRole: string; userName?: string }) => {
    // --- Data State ---
    const [requests, setRequests] = useState<TrainingRequest[]>([]);

    // --- Filter State ---
    const [viewMode, setViewMode] = useState<'list' | 'recap'>('list');
    const [selectedYear, setSelectedYear] = useState<number | 'All'>(new Date().getFullYear());
    const [selectedPeriod, setSelectedPeriod] = useState<string>('All Year');
    const [selectedBranch, setSelectedBranch] = useState<string>('All Branches');
    const [searchQuery, setSearchQuery] = useState('');

    // --- Modal State ---
    const [selectedRequest, setSelectedRequest] = useState<TrainingRequest | null>(null);
    const [isRejectMode, setIsRejectMode] = useState(false);
    const [rejectReason, setRejectReason] = useState('');
    const [recapDetailUser, setRecapDetailUser] = useState<string | null>(null);

    // Settlement State
    const [isSettlementOpen, setIsSettlementOpen] = useState(false);
    const [settleData, setSettleData] = useState({
        finalCost: 0,
        additionalCost: 0,
        settlementNotes: ''
    });

    // ... (Filter logic omitted for brevity as it is unchanged) ...
    // Note: I will need to be careful not to delete the filter logic if I'm not replacing it.
    // Since I can't easily skip lines in a single replace block without copying them, I will target specific blocks.

    // ...

    // --- Filter Logic ---

    // ... (Rest of component)

    const periodOptions = [
        "All Year",
        "Q1 (Jan-Mar)", "Q2 (Apr-Jun)", "Q3 (Jul-Sep)", "Q4 (Oct-Dec)",
        "Semester 1 (Jan-Jun)", "Semester 2 (Jul-Dec)",
        "January", "February", "March", "April", "May", "June",
        "July", "August", "September", "October", "November", "December"
    ];

    const getPeriodDates = () => {
        const year = selectedYear === 'All' ? new Date().getFullYear() : selectedYear;
        // Default: Full Year
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
            // Monthly
            const monthIdx = new Date(`${selectedPeriod} 1, ${year}`).getMonth();
            if (!isNaN(monthIdx)) {
                start = new Date(year, monthIdx, 1);
                end = new Date(year, monthIdx + 1, 0, 23, 59, 59);
            }
        }
        return [start, end];
    };

    // --- Filtered Data for List View ---
    const filteredRequests = requests.filter(req => {
        const d = new Date(req.date);
        const [start, end] = getPeriodDates();

        // Year & Period Filter
        if (selectedYear !== 'All' && d.getFullYear() !== selectedYear) return false;
        if (d < start || d > end) return false;

        // Branch Filter
        const branch = req.location || 'Online';
        if (selectedBranch !== 'All Branches' && !branch.includes(selectedBranch)) return false;

        // Search Filter
        const lowerSearch = searchQuery.toLowerCase();
        return (
            (req.employeeName || '').toLowerCase().includes(lowerSearch) ||
            (req.title || '').toLowerCase().includes(lowerSearch) ||
            (req.vendor || '').toLowerCase().includes(lowerSearch)
        );
    });

    // --- Effects & Actions ---
    useEffect(() => {
        fetch(`${API_BASE_URL}/api/training`)
            .then(res => res.json())
            .then(data => setRequests(data))
            .catch(err => console.error(err));
    }, []);

    const formatCurrency = (amount: number) => {
        return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR' }).format(amount);
    };

    const handleAction = async (id: number, action: 'approve' | 'reject', reason?: string) => {
        try {
            const res = await fetch(`${API_BASE_URL}/api/training/${id}/approve`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action, reason, approverName: userName || 'Admin' })
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

    const handlePrint = (req: TrainingRequest) => {
        const printWindow = window.open('', '_blank');
        if (printWindow) {
            printWindow.document.write(`
                <html>
                <head>
                    <title>Training Request Approval - ${req.id}</title>
                    <style>
                        body { font-family: sans-serif; padding: 40px; color: #333; }
                        .header { text-align: center; margin-bottom: 40px; border-bottom: 2px solid #eee; padding-bottom: 20px; }
                        .title { font-size: 24px; font-weight: bold; margin-bottom: 10px; }
                        .meta { margin-bottom: 30px; }
                        .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 30px; }
                        .label { font-size: 12px; color: #666; text-transform: uppercase; font-weight: bold; }
                        .value { font-size: 16px; font-weight: bold; margin-top: 5px; }
                        .justification { background: #f9f9f9; padding: 20px; border-radius: 8px; margin-bottom: 30px; }
                        .footer { margin-top: 60px; text-align: center; font-size: 12px; color: #999; }
                        .stamp { border: 2px solid green; color: green; display: inline-block; padding: 10px 20px; font-weight: bold; text-transform: uppercase; transform: rotate(-5deg); margin-top: 20px; }
                        .settlement { margin-top: 30px; border-top: 2px dashed #ccc; padding-top: 20px; }
                    </style>
                </head>
                <body>
                    <div class="header">
                        <div class="title">External Training Request</div>
                        <div>Document ID: #${req.id}</div>
                    </div>
                    
                    <div class="grid">
                        <div>
                            <div class="label">Employee Name</div>
                            <div class="value">${req.employeeName}</div>
                            <div style="font-size: 14px; color: #666;">${req.employeeRole}</div>
                        </div>
                        <div>
                            <div class="label">Submission Date</div>
                            <div class="value">${new Date(req.date).toLocaleDateString()}</div>
                        </div>
                    </div>

                    <div class="grid">
                        <div>
                            <div class="label">Training Program</div>
                            <div class="value">${req.title}</div>
                        </div>
                        <div>
                            <div class="label">Vendor / Provider</div>
                            <div class="value">${req.vendor}</div>
                        </div>
                    </div>

                    <div class="grid">
                        <div>
                            <div class="label">Estimated Cost</div>
                            <div class="value">${new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR' }).format(req.cost)}</div>
                        </div>
                        <div>
                            <div class="label">Priority</div>
                            <div class="value">${req.priority}</div>
                        </div>
                    </div>

                    <div class="label">Business Justification</div>
                    <div class="justification">
                        "${req.justification}"
                    </div>

                    <div style="text-align: center;">
                        <div class="label">Status</div>
                        <div class="stamp">APPROVED BY HR</div>
                        <p style="margin-top: 10px; font-size: 12px;">Digitally Approved by HR Dept.</p>
                    </div>

                    ${req.additionalCost ? `
                        <div class="settlement">
                            <h3 style="margin-bottom: 15px;">Finance Settlement</h3>
                            <div class="grid">
                                <div>
                                    <div class="label">Final Actual Cost</div>
                                    <div class="value">${new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR' }).format(req.cost)}</div> 
                                </div>
                                <div>
                                    <div class="label">Additional/Excess Cost</div>
                                    <div class="value" style="color: red;">${new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR' }).format(req.additionalCost)}</div>
                                </div>
                            </div>
                        </div>
                    ` : ''}

                    <div class="footer">
                        Generated from Nusa LMS
                    </div>
                </body>
                </html>
            `);
            printWindow.document.close();
            printWindow.print();
        }
    };

    const handleOpenSettlement = (req: TrainingRequest) => {
        setSettleData({
            finalCost: req.cost,
            additionalCost: req.additionalCost || 0,
            settlementNotes: ''
        });
        setIsSettlementOpen(true);
    };

    const handleSaveSettlement = async () => {
        if (!selectedRequest) return;
        try {
            const res = await fetch(`${API_BASE_URL}/api/training/${selectedRequest.id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    cost: settleData.finalCost,
                    additionalCost: settleData.additionalCost,
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

            // Branch Filter
            const branch = req.location || 'Online';
            if (selectedBranch !== 'All Branches' && !branch.includes(selectedBranch)) return;

            // Search
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
                // Only count cost if approved? Or all? Usually budgets track APPROVED costs.
                if (i.status !== 'APPROVED') return sum;
                return sum + (i.cost || 0) + (i.additionalCost || 0);
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

    return (
        <div className="space-y-8 animate-fade-in">
            {/* Header */}
            <div className="flex flex-col md:flex-row justify-between items-center gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-slate-800">Training Requests</h1>
                    <p className="text-slate-500 mt-1">List of all training requests submitted by employees</p>
                </div>

                <div className="flex items-center gap-3">
                    <div className="bg-white p-1 rounded-xl border border-slate-200 shadow-sm flex">
                        <button
                            onClick={() => setViewMode('list')}
                            className={`px-4 py-2 rounded-lg text-sm font-bold transition-all ${viewMode === 'list' ? 'bg-blue-100 text-blue-700' : 'text-slate-500 hover:text-slate-700'}`}
                        >
                            List View
                        </button>
                        <button
                            onClick={() => setViewMode('recap')}
                            className={`px-4 py-2 rounded-lg text-sm font-bold transition-all ${viewMode === 'recap' ? 'bg-blue-100 text-blue-700' : 'text-slate-500 hover:text-slate-700'}`}
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
                        placeholder="Search Employee, Title, Vendor..."
                        className="w-full pl-11 pr-4 py-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-blue-500 outline-none font-medium text-slate-600"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                    />
                </div>

                <div className="flex gap-2 w-full md:w-auto overflow-x-auto pb-2 md:pb-0">
                    <select
                        value={selectedBranch}
                        onChange={(e) => setSelectedBranch(e.target.value)}
                        className="px-4 py-2.5 rounded-xl border border-slate-200 font-bold text-slate-600 text-sm outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                    >
                        <option value="All Branches">All Branches</option>
                        <option value="Medan-HO">Medan-HO</option>
                        <option value="Medan-Cabang">Medan-Cabang</option>
                        <option value="Jakarta">Jakarta</option>
                        <option value="Bali">Bali</option>
                        <option value="Binjai">Binjai</option>
                        <option value="Tanjung Morawa">Tanjung Morawa</option>
                        <option value="Online">Online Only</option>
                    </select>

                    <select
                        value={selectedYear}
                        onChange={(e) => setSelectedYear(e.target.value === 'All' ? 'All' : parseInt(e.target.value))}
                        className="px-4 py-2.5 rounded-xl border border-slate-200 font-bold text-slate-600 text-sm outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                    >
                        <option value="All">All Years</option>
                        <option value={2024}>2024</option>
                        <option value={2025}>2025</option>
                    </select>

                    <select
                        value={selectedPeriod}
                        onChange={(e) => setSelectedPeriod(e.target.value)}
                        className="px-4 py-2.5 rounded-xl border border-slate-200 font-bold text-slate-600 text-sm outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                    >
                        {periodOptions.map(opt => (
                            <option key={opt} value={opt}>{opt}</option>
                        ))}
                    </select>
                </div>
            </div>

            {viewMode === 'list' && (
                <>


                    <div className="space-y-4">
                        {filteredRequests.map(req => (
                            <div key={req.id} className="p-4 border border-slate-100 rounded-xl hover:bg-slate-50 transition-colors bg-white shadow-sm flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                                <div className="flex-1">
                                    <div className="flex items-center gap-2 mb-1">
                                        <h4 className="font-bold text-slate-800 text-lg">{req.title}</h4>
                                        <StatusBadge status={req.status} />
                                    </div>
                                    <div className="text-sm text-slate-600 mb-2">{req.employeeName} — {req.employeeRole}</div>

                                    <div className="flex flex-wrap gap-4 text-xs text-slate-500 mb-3">
                                        <span className="flex items-center gap-1 bg-slate-100 px-2 py-1 rounded"><Calendar size={12} /> {new Date(req.date).toLocaleDateString()}</span>
                                        <span className="flex items-center gap-1 bg-slate-100 px-2 py-1 rounded"><DollarSign size={12} /> {new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(req.cost || 0)}</span>
                                        <span className="flex items-center gap-1 bg-slate-100 px-2 py-1 rounded">{req.vendor}</span>
                                    </div>

                                    {/* Workflow Stepper */}
                                    <div className="flex items-center gap-3 text-xs">
                                        <div className={`px-2 py-1 rounded border flex items-center gap-1.5 ${req.supervisorName ? 'bg-green-50 border-green-200 text-green-700' : 'bg-slate-50 border-slate-200 text-slate-400'}`}>
                                            {req.supervisorName ? <CheckCircle2 size={14} className="text-green-600" /> : <div className="w-3.5 h-3.5 rounded-full border-2 border-slate-300"></div>}
                                            <div className="flex flex-col">
                                                <span className="font-bold text-[10px] uppercase">Supervisor</span>
                                                <span className="font-medium">{req.supervisorName || 'Pending'}</span>
                                            </div>
                                        </div>
                                        <div className={`w-8 h-0.5 ${req.supervisorName ? 'bg-green-200' : 'bg-slate-200'}`}></div>
                                        <div className={`px-2 py-1 rounded border flex items-center gap-1.5 ${req.hrName ? 'bg-green-50 border-green-200 text-green-700' : 'bg-slate-50 border-slate-200 text-slate-400'}`}>
                                            {req.hrName ? <CheckCircle2 size={14} className="text-green-600" /> : <div className="w-3.5 h-3.5 rounded-full border-2 border-slate-300"></div>}
                                            <div className="flex flex-col">
                                                <span className="font-bold text-[10px] uppercase">HR Dept</span>
                                                <span className="font-medium">{req.hrName || 'Pending'}</span>
                                            </div>
                                        </div>
                                    </div>

                                    {req.status === 'REJECTED' && req.rejectionReason && (
                                        <div className="mt-3 text-xs text-red-600 bg-red-50 p-2 rounded border border-red-100 flex items-start gap-2">
                                            <XCircle size={14} className="mt-0.5 shrink-0" />
                                            <div>
                                                <span className="font-bold">Rejected:</span> {req.rejectionReason}
                                            </div>
                                        </div>
                                    )}
                                </div>

                                <div className="flex items-center gap-2 self-start md:self-center">
                                    <button onClick={() => { setSelectedRequest(req); setIsSettlementOpen(true); }} className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors" title="View Details">
                                        <FileText size={20} />
                                    </button>

                                    {/* Action Buttons */}
                                    {userRole === 'SUPERVISOR' && req.status === 'PENDING_SUPERVISOR' && (
                                        <div className="flex gap-2">
                                            <button onClick={() => handleAction(req.id, 'approve')} className="px-3 py-1.5 bg-green-600 text-white text-xs font-bold rounded-lg hover:bg-green-700 shadow-sm">Approve</button>
                                            <button onClick={() => handleAction(req.id, 'reject')} className="px-3 py-1.5 bg-white border border-red-200 text-red-600 text-xs font-bold rounded-lg hover:bg-red-50">Reject</button>
                                        </div>
                                    )}
                                    {userRole === 'HR' && req.status === 'PENDING_HR' && (
                                        <div className="flex gap-2">
                                            <button onClick={() => handleAction(req.id, 'approve')} className="px-3 py-1.5 bg-green-600 text-white text-xs font-bold rounded-lg hover:bg-green-700 shadow-sm">Final Approve</button>
                                            <button onClick={() => handleAction(req.id, 'reject')} className="px-3 py-1.5 bg-white border border-red-200 text-red-600 text-xs font-bold rounded-lg hover:bg-red-50">Reject</button>
                                        </div>
                                    )}
                                </div>
                            </div>
                        ))}

                        {filteredRequests.length === 0 && (
                            <div className="text-center py-12 bg-white rounded-2xl border border-dashed border-slate-200">
                                <p className="text-slate-400 italic">No training requests found.</p>
                            </div>
                        )}
                    </div>
                </>
            )}

            {
                viewMode === 'recap' && (
                    <div className="space-y-6 animate-in slide-in-from-bottom-4">


                        {/* Recap Table */}
                        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
                            <table className="w-full text-left">
                                <thead className="bg-slate-50 text-slate-500 font-bold uppercase text-xs tracking-wider">
                                    <tr>
                                        <th className="px-6 py-4">Employee Name</th>
                                        <th className="px-6 py-4 text-center">Requests (Total)</th>
                                        <th className="px-6 py-4 text-center">Approved</th>
                                        <th className="px-6 py-4 text-right">Total Cost (Approved)</th>
                                        <th className="px-6 py-4 text-center">Action</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                    {getUserRecap().length === 0 ? (
                                        <tr><td colSpan={5} className="p-8 text-center text-slate-400 italic">No matching records found.</td></tr>
                                    ) : (
                                        getUserRecap().map((stat, idx) => (
                                            <tr key={idx} className="hover:bg-slate-50 transition-colors">
                                                <td className="px-6 py-4 font-bold text-slate-700">{stat.name}</td>
                                                <td className="px-6 py-4 text-center text-slate-600 font-semibold">{stat.totalRequests}</td>
                                                <td className="px-6 py-4 text-center">
                                                    <span className="bg-green-100 text-green-700 px-2.5 py-1 rounded-lg text-xs font-bold">
                                                        {stat.approvedRequests}
                                                    </span>
                                                </td>
                                                <td className="px-6 py-4 text-right font-mono text-slate-700 font-bold">
                                                    {formatCurrency(stat.totalCost)}
                                                </td>
                                                <td className="px-6 py-4 text-center">
                                                    <button
                                                        onClick={() => setRecapDetailUser(stat.name)}
                                                        className="px-3 py-1.5 bg-white border border-slate-200 hover:bg-blue-50 hover:border-blue-200 hover:text-blue-600 text-slate-500 rounded-lg text-xs font-bold transition-all shadow-sm"
                                                    >
                                                        View Details
                                                    </button>
                                                </td>
                                            </tr>
                                        ))
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )
            }

            {/* Recap Detail Modal */}
            {
                recapDetailUser && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in">
                        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl overflow-hidden flex flex-col max-h-[90vh]">
                            <div className="p-5 border-b border-slate-100 flex justify-between items-center bg-white">
                                <div>
                                    <h2 className="font-bold text-lg text-slate-800 flex items-center gap-2">
                                        <FileText className="text-blue-600" size={20} /> {recapDetailUser} - Training History
                                    </h2>
                                    <p className="text-xs text-slate-500 font-medium">{selectedPeriod} • {selectedYear} • {selectedBranch}</p>
                                </div>
                                <button onClick={() => setRecapDetailUser(null)} className="p-2 hover:bg-slate-100 rounded-full text-slate-400 transition-colors"><XCircle size={20} /></button>
                            </div>

                            <div className="overflow-y-auto p-6">
                                <table className="w-full text-left text-sm">
                                    <thead className="bg-slate-50 text-slate-500 font-bold uppercase text-xs">
                                        <tr>
                                            <th className="px-4 py-3">Date</th>
                                            <th className="px-4 py-3">Training Title</th>
                                            <th className="px-4 py-3">Vendor</th>
                                            <th className="px-4 py-3 text-right">Est. Cost</th>
                                            <th className="px-4 py-3 text-right">Add. Cost</th>
                                            <th className="px-4 py-3 text-right">Total</th>
                                            <th className="px-4 py-3 text-center">Status</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100">
                                        {getUserRecap().find(u => u.name === recapDetailUser)?.requests.map((r) => (
                                            <tr key={r.id} className="hover:bg-slate-50">
                                                <td className="px-4 py-3 text-slate-600">{new Date(r.date).toLocaleDateString()}</td>
                                                <td className="px-4 py-3 font-bold text-slate-700">{r.title}</td>
                                                <td className="px-4 py-3 text-slate-600">{r.vendor}</td>
                                                <td className="px-4 py-3 text-right font-mono text-slate-500">
                                                    {formatCurrency(r.cost)}
                                                </td>
                                                <td className="px-4 py-3 text-right font-mono text-orange-600">
                                                    {r.additionalCost ? formatCurrency(r.additionalCost) : '-'}
                                                </td>
                                                <td className="px-4 py-3 text-right font-mono text-slate-800 font-bold">
                                                    {formatCurrency((r.cost || 0) + (r.additionalCost || 0))}
                                                </td>
                                                <td className="px-4 py-3 text-center">
                                                    <StatusBadge status={r.status} />
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>

                            <div className="p-4 border-t border-slate-100 bg-slate-50 text-right">
                                <button onClick={() => setRecapDetailUser(null)} className="px-6 py-2 bg-white border border-slate-200 text-slate-600 font-bold rounded-xl hover:bg-slate-100 transition-colors shadow-sm">
                                    Close
                                </button>
                            </div>
                        </div>
                    </div>
                )
            }

            {/* Approval Modal (Existing) */}
            {
                selectedRequest && (

                    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
                        <div className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl overflow-hidden ring-1 ring-white/10 flex flex-col max-h-[90vh]">
                            <div className="p-8 border-b border-slate-100 flex justify-between items-start bg-slate-50/80">
                                <div>
                                    <div className="flex items-center gap-3 mb-2">
                                        <StatusBadge status={selectedRequest.status} />
                                        <span className="text-slate-400 text-sm">• {new Date(selectedRequest.date).toLocaleDateString()}</span>
                                    </div>
                                    <h2 className="text-2xl font-bold text-slate-900 leading-tight">{selectedRequest.title}</h2>
                                    <p className="text-slate-500 font-medium mt-1">{selectedRequest.vendor}</p>
                                </div>
                                <button onClick={() => setSelectedRequest(null)} className="p-2 hover:bg-slate-200 rounded-full text-slate-400 transition-colors">
                                    <XCircle size={28} />
                                </button>
                            </div>

                            <div className="p-8 overflow-y-auto space-y-8">
                                {/* Employee Info Card */}
                                <div className="flex items-center gap-4 p-4 rounded-2xl border border-slate-100 bg-slate-50/50">
                                    <div className="w-12 h-12 rounded-full bg-blue-100 flex items-center justify-center text-blue-700 font-bold text-lg">
                                        {selectedRequest.employeeName.charAt(0)}
                                    </div>
                                    <div>
                                        <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Applicant</p>
                                        <p className="font-bold text-slate-800 text-lg">{selectedRequest.employeeName}</p>
                                        <p className="text-sm text-slate-500">{selectedRequest.employeeRole}</p>
                                    </div>
                                </div>

                                <div className="grid grid-cols-2 gap-8">
                                    <div>
                                        <p className="text-sm font-bold text-slate-400 uppercase mb-1">Cost Estimation</p>
                                        <p className="text-2xl font-bold text-slate-800 tracking-tight">{formatCurrency(selectedRequest.cost)}</p>
                                    </div>
                                    <div>
                                        <p className="text-sm font-bold text-slate-400 uppercase mb-1">Priority</p>
                                        <p className={`text-lg font-bold ${selectedRequest.priority === 'High' ? 'text-red-600' : 'text-slate-700'}`}>
                                            {selectedRequest.priority} Priority
                                        </p>
                                    </div>
                                </div>

                                <div>
                                    <h3 className="text-lg font-bold text-slate-800 mb-3 flex items-center gap-2">
                                        <FileText size={20} className="text-slate-400" /> Business Justification
                                    </h3>
                                    <div className="p-5 bg-slate-50 rounded-2xl text-slate-600 leading-relaxed border border-slate-100 italic">
                                        "{selectedRequest.justification}"
                                    </div>
                                </div>

                                {selectedRequest.rejectionReason && (
                                    <div className="mt-6 bg-red-50 p-4 rounded-xl border border-red-100">
                                        <h4 className="text-sm font-bold text-red-800 mb-1">Rejection Reason</h4>
                                        <p className="text-red-600 text-sm italic">"{selectedRequest.rejectionReason}"</p>
                                    </div>
                                )}
                            </div>

                            {/* Action Footer */}
                            <div className="p-6 border-t border-slate-100 bg-slate-50 flex justify-end gap-3">
                                {isRejectMode ? (
                                    <div className="w-full">
                                        <label className="block text-sm font-bold text-slate-700 mb-2">Reason for Rejection</label>
                                        <textarea
                                            value={rejectReason}
                                            onChange={(e) => setRejectReason(e.target.value)}
                                            className="w-full p-3 rounded-xl border border-slate-300 mb-3 text-sm"
                                            placeholder="Please explain why this request is rejected..."
                                            rows={3}
                                        />
                                        <div className="flex justify-end gap-2">
                                            <button
                                                onClick={() => setIsRejectMode(false)}
                                                className="px-4 py-2 font-bold text-slate-500 hover:bg-slate-200 rounded-lg text-sm"
                                            >
                                                Cancel
                                            </button>
                                            <button
                                                onClick={() => handleAction(selectedRequest.id, 'reject', rejectReason)}
                                                className="px-4 py-2 font-bold text-white bg-red-600 hover:bg-red-700 rounded-lg text-sm"
                                                disabled={!rejectReason}
                                            >
                                                Confirm Reject
                                            </button>
                                        </div>
                                    </div>
                                ) : (
                                    <>
                                        {/* Role-Based Approval Buttons */}

                                        {/* SUPERVISOR: Approve PENDING_SUPERVISOR -> PENDING_HR */}
                                        {userRole === 'SUPERVISOR' && selectedRequest.status === 'PENDING_SUPERVISOR' && (
                                            <>
                                                <button
                                                    onClick={() => setIsRejectMode(true)}
                                                    className="px-6 py-3 rounded-xl font-bold text-red-600 hover:bg-red-50 border border-transparent hover:border-red-100 transition-all"
                                                >
                                                    Reject
                                                </button>
                                                <button
                                                    onClick={() => handleAction(selectedRequest.id, 'approve')}
                                                    className="px-8 py-3 rounded-xl font-bold text-white bg-blue-600 hover:bg-blue-700 shadow-lg shadow-blue-500/20 transition-all flex items-center gap-2"
                                                >
                                                    <CheckCircle2 size={20} /> Approve (to HR)
                                                </button>
                                            </>
                                        )}

                                        {/* HR: Approve PENDING_HR -> APPROVED */}
                                        {(userRole === 'HR' || userRole === 'HR_ADMIN') && selectedRequest.status === 'PENDING_HR' && (
                                            <>
                                                <button
                                                    onClick={() => setIsRejectMode(true)}
                                                    className="px-6 py-3 rounded-xl font-bold text-red-600 hover:bg-red-50 border border-transparent hover:border-red-100 transition-all"
                                                >
                                                    Reject
                                                </button>
                                                <button
                                                    onClick={() => handleAction(selectedRequest.id, 'approve')}
                                                    className="px-8 py-3 rounded-xl font-bold text-white bg-green-600 hover:bg-green-700 shadow-lg shadow-green-500/20 transition-all flex items-center gap-2"
                                                >
                                                    <CheckCircle2 size={20} /> Final Approve
                                                </button>
                                            </>
                                        )}

                                        {/* APPROVED STATUS Actions */}
                                        {selectedRequest.status === 'APPROVED' && (
                                            <>
                                                <button
                                                    onClick={() => handleOpenSettlement(selectedRequest)}
                                                    className="px-5 py-3 rounded-xl font-bold text-green-700 bg-green-50 border border-green-200 hover:bg-green-100 transition-all flex items-center gap-2"
                                                >
                                                    <DollarSign size={18} /> Settlement
                                                </button>
                                                <button
                                                    onClick={() => handlePrint(selectedRequest)}
                                                    className="px-6 py-3 rounded-xl font-bold text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 transition-all flex items-center gap-2"
                                                >
                                                    <Printer size={18} /> Print / Download PDF
                                                </button>
                                            </>
                                        )}

                                        {/* Close Button (Always Visible) */}
                                        <button
                                            onClick={() => setSelectedRequest(null)}
                                            className="px-8 py-3 rounded-xl font-bold text-slate-600 hover:bg-slate-200 transition-all"
                                        >
                                            Close Details
                                        </button>
                                    </>
                                )}
                            </div>
                        </div>

                        {/* Finance Settlement Modal */}
                        {isSettlementOpen && (
                            <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in">
                                <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden p-6">
                                    <h3 className="text-lg font-bold text-slate-800 mb-4 flex items-center gap-2"><DollarSign className="text-green-600" /> Finance Settlement</h3>
                                    <div className="space-y-4">
                                        <div>
                                            <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Final Actual Cost</label>
                                            <input
                                                type="number"
                                                className="w-full px-3 py-2 border rounded-lg"
                                                value={settleData.finalCost}
                                                onChange={e => setSettleData({ ...settleData, finalCost: parseInt(e.target.value) })}
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Additional / Excess Cost</label>
                                            <input
                                                type="number"
                                                className="w-full px-3 py-2 border rounded-lg text-red-600 font-bold"
                                                value={settleData.additionalCost}
                                                onChange={e => setSettleData({ ...settleData, additionalCost: parseInt(e.target.value) })}
                                            />
                                        </div>
                                        <div className="flex gap-2 pt-4">
                                            <button onClick={() => setIsSettlementOpen(false)} className="flex-1 py-2 text-slate-500 font-bold hover:bg-slate-100 rounded-lg">Cancel</button>
                                            <button onClick={handleSaveSettlement} className="flex-1 py-2 bg-green-600 hover:bg-green-700 text-white font-bold rounded-lg shadow-lg shadow-green-200">Save Settlement</button>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                )
            }
        </div >
    );
};

export default TrainingExternalManager;
