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
    Briefcase,
    Link
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

const TrainingExternalManager = ({ userRole, userName, user }: { userRole: string; userName?: string; user?: any }) => {
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

    const fetchRequests = async () => {
        try {
            const trainRes = await fetch(`${API_BASE_URL}/api/external-training/all`);
            if (trainRes.ok) {
                const rawData = await trainRes.json();
                const mapped = rawData.map((req: any) => ({
                    id: req.id,
                    employeeName: req.employee_name,
                    employeeRole: req.category,
                    title: req.title,
                    vendor: req.vendor || 'N/A',
                    location: req.location || 'N/A',
                    cost: Number(req.registration_fee || 0) + Number(req.travel_flight_cost || 0) + Number(req.accommodation_cost || 0) + Number(req.miscellaneous_cost || 0),
                    date: req.created_at || req.start_date || new Date().toISOString(),
                    status: req.status === 'Processed' ? 'APPROVED' : (req.status === 'Approved' ? 'PENDING_HR' : (req.status === 'Pending' ? 'PENDING_SUPERVISOR' : 'REJECTED')),
                    justification: `Dates: ${req.start_date ? new Date(req.start_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : ''} to ${req.end_date ? new Date(req.end_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : ''}`,
                    costTraining: req.registration_fee || 0,
                    costTransport: req.travel_flight_cost || 0,
                    costAccommodation: req.accommodation_cost || 0,
                    costOthers: req.miscellaneous_cost || 0,
                    evidenceUrl: (req.certificate_link || req.attachment_link) ? ((req.certificate_link || req.attachment_link).startsWith('/') ? `${API_BASE_URL}${req.certificate_link || req.attachment_link}` : (req.certificate_link || req.attachment_link)) : undefined,
                    hrName: req.status === 'Processed' ? 'HR Processed' : '',
                    supervisorName: req.approved_by,
                    employee_id: req.employee_id,
                    _original: req
                }));
                setRequests(mapped);
            }
        } catch (err) { console.error(err); }
    };

    // --- Data Loading ---
    useEffect(() => {
        const loadInitialData = async () => {
            const [trainRes, empRes, branchRes] = await Promise.all([
                fetch(`${API_BASE_URL}/api/external-training/all`),
                fetch(`${API_BASE_URL}/api/employees`),
                fetch(`${API_BASE_URL}/api/branches`)
            ]);

            if (trainRes.ok) {
                const rawData = await trainRes.json();
                const mapped = rawData.map((req: any) => ({
                    id: req.id,
                    employeeName: req.employee_name,
                    employeeRole: req.category,
                    title: req.title,
                    vendor: req.vendor || 'N/A',
                    location: req.location || 'N/A',
                    cost: Number(req.registration_fee || 0) + Number(req.travel_flight_cost || 0) + Number(req.accommodation_cost || 0) + Number(req.miscellaneous_cost || 0),
                    date: req.created_at || req.start_date || new Date().toISOString(),
                    status: req.status === 'Processed' ? 'APPROVED' : (req.status === 'Approved' ? 'PENDING_HR' : (req.status === 'Pending' ? 'PENDING_SUPERVISOR' : 'REJECTED')),
                    justification: `Dates: ${req.start_date ? new Date(req.start_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : ''} to ${req.end_date ? new Date(req.end_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : ''}`,
                    costTraining: req.registration_fee || 0,
                    costTransport: req.travel_flight_cost || 0,
                    costAccommodation: req.accommodation_cost || 0,
                    costOthers: req.miscellaneous_cost || 0,
                    evidenceUrl: (req.certificate_link || req.attachment_link) ? ((req.certificate_link || req.attachment_link).startsWith('/') ? `${API_BASE_URL}${req.certificate_link || req.attachment_link}` : (req.certificate_link || req.attachment_link)) : undefined,
                    hrName: req.status === 'Processed' ? 'HR Processed' : '',
                    supervisorName: req.approved_by,
                    employee_id: req.employee_id,
                    _original: req
                }));
                setRequests(mapped);
            }
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
    const [hrCertificateFile, setHrCertificateFile] = useState<File | null>(null);
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

    const [isSettlementOpen, setIsSettlementOpen] = useState(false);
    const [settleCertificate, setSettleCertificate] = useState<File | null>(null);
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

        // If the logged-in user is a supervisor (and not HR), only show requests of their subordinates
        if (userRole === 'SUPERVISOR' && user && !user.role.includes('HR')) {
            if (!emp) return false;
            const supervisorId = user.employee_id || '___INVALID___';
            const supervisorName = user.name || '___INVALID___';
            const supervisorEmailPrefix = user.email ? user.email.split('@')[0] : '___INVALID___';
            const supervisorEmail = user.email || '___INVALID___';
            const reportsTo = emp.id_report_to;
            if (!reportsTo) return false;

            const isMySubordinate = 
                reportsTo === supervisorId || 
                reportsTo === supervisorName || 
                reportsTo.toLowerCase() === supervisorEmailPrefix.toLowerCase() || 
                reportsTo.toLowerCase() === supervisorEmail.toLowerCase();

            if (!isMySubordinate) return false;
        }

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

    const handleAction = async (_id: number, action: 'approve' | 'reject', reason?: string) => {
        if (!selectedRequest) return;
        if (action === 'reject' && !reason) {
            alert("Please provide a rejection reason.");
            return;
        }

        try {
            let res;
            if (action === 'approve') {
                let certLink = selectedRequest?._original?.certificate_link;
                if (selectedRequest?._original?.category === 'Sertifikat' && !certLink && !hrCertificateFile) {
                    alert("Please upload the certificate evidence before processing this request.");
                    return;
                }
                if (hrCertificateFile) {
                    const formData = new FormData();
                    formData.append('file', hrCertificateFile);
                    const uploadRes = await fetch(`${API_BASE_URL}/api/upload`, {
                        method: 'POST',
                        body: formData
                    });
                    if (uploadRes.ok) {
                        const uploadData = await uploadRes.json();
                        certLink = uploadData.fileUrl;
                    }
                }
                res = await fetch(`${API_BASE_URL}/api/external-training/hr-process`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        id: selectedRequest.id,
                        travel_flight_cost: breakdownCost.transport,
                        accommodation_cost: breakdownCost.accommodation,
                        miscellaneous_cost: breakdownCost.others,
                        payment_method: selectedRequest._original?.payment_method || 'Reimbursement',
                        registration_fee: breakdownCost.training,
                        certificate_link: certLink
                    })
                });
            } else {
                res = await fetch(`${API_BASE_URL}/api/external-training/approve`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        id: selectedRequest.id,
                        status: 'Rejected',
                        approved_by: userName || 'Admin'
                    })
                });
            }
            if (res.ok) {
                await fetchRequests();
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
        setSettleCertificate(null);
    };

    const handleSaveSettlement = async () => {
        if (!selectedRequest) return;
        try {
            const newTotal = settleData.training + settleData.transport + settleData.accommodation + settleData.others;
            const excess = Math.max(0, newTotal - (selectedRequest.cost || 0));

            let certLink = undefined;
            if (settleCertificate) {
                const formData = new FormData();
                formData.append('file', settleCertificate);
                const uploadRes = await fetch(`${API_BASE_URL}/api/upload`, {
                    method: 'POST',
                    body: formData
                });
                if (uploadRes.ok) {
                    const uploadData = await uploadRes.json();
                    certLink = uploadData.fileUrl;
                }
            }

            const res = await fetch(`${API_BASE_URL}/api/external-training/${selectedRequest.id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    cost: newTotal,
                    costTraining: settleData.training,
                    costTransport: settleData.transport,
                    costAccommodation: settleData.accommodation,
                    costOthers: settleData.others,
                    additionalCost: excess,
                    settlementNote: settleData.settlementNotes,
                    certificateLink: certLink
                })
            });

            if (res.ok) {
                await fetchRequests();
                setIsSettlementOpen(false);
                setSelectedRequest(null);
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

            // If the logged-in user is a supervisor (and not HR), only include requests of their subordinates
            if (userRole === 'SUPERVISOR' && user && !user.role.includes('HR')) {
                if (!emp) return;
                const supervisorId = user.employee_id || '___INVALID___';
                const supervisorName = user.name || '___INVALID___';
                const supervisorEmailPrefix = user.email ? user.email.split('@')[0] : '___INVALID___';
                const supervisorEmail = user.email || '___INVALID___';
                const reportsTo = emp.id_report_to;
                if (!reportsTo) return;

                const isMySubordinate = 
                    reportsTo === supervisorId || 
                    reportsTo === supervisorName || 
                    reportsTo.toLowerCase() === supervisorEmailPrefix.toLowerCase() || 
                    reportsTo.toLowerCase() === supervisorEmail.toLowerCase();

                if (!isMySubordinate) return;
            }

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
                                <div className="flex flex-col md:flex-row md:items-start gap-4">
                                    <div className="space-y-3 flex-1">
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

                                    {req.evidenceUrl && (
                                        <div className="hidden lg:flex items-center justify-center mr-4">
                                            {req.evidenceUrl.match(/\.(jpeg|jpg|gif|png|webp)$/i) ? (
                                                <a href={req.evidenceUrl} target="_blank" rel="noreferrer" className="group/img relative block overflow-hidden rounded-xl border border-slate-100 shadow-sm w-40 h-28 shrink-0">
                                                    <img src={req.evidenceUrl} alt="Certificate" className="w-full h-full object-cover group-hover/img:scale-110 transition-transform duration-500" />
                                                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover/img:opacity-100 transition-opacity flex items-center justify-center">
                                                        <span className="text-white text-[10px] font-black uppercase tracking-widest">View Document</span>
                                                    </div>
                                                </a>
                                            ) : (
                                                <a href={req.evidenceUrl} target="_blank" rel="noreferrer" className="flex flex-col items-center justify-center w-40 h-28 bg-slate-50 border border-slate-100 rounded-xl hover:bg-slate-100 hover:border-slate-300 transition-colors group/doc text-slate-400 hover:text-indigo-600 shrink-0">
                                                    <FileText size={24} className="mb-2" />
                                                    <span className="text-[9px] font-black uppercase tracking-widest text-center px-2">Open Document</span>
                                                </a>
                                            )}
                                        </div>
                                    )}

                                    <div className="flex items-center gap-2">
                                        {req.evidenceUrl && (
                                            <a href={req.evidenceUrl} target="_blank" rel="noreferrer" className="p-3 text-slate-300 hover:text-emerald-600 hover:bg-emerald-50 rounded-xl transition-all lg:hidden" title="View Certificate/Attachment">
                                                <Link size={20} />
                                            </a>
                                        )}
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
                <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in">
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg flex flex-col max-h-[90vh]">
                        <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50 rounded-t-2xl">
                            <div>
                                <h3 className="text-xl font-bold text-slate-800 flex items-center gap-2">
                                    <Briefcase size={20} className="text-indigo-600" /> Process Training Request
                                </h3>
                                <p className="text-sm text-slate-500">LTR-ID: {selectedRequest.id} • {selectedRequest.employeeName}</p>
                            </div>
                            <button onClick={() => setSelectedRequest(null)} className="text-slate-400 hover:text-slate-600"><XCircle size={24} /></button>
                        </div>
                        <div className="p-6 space-y-4 overflow-y-auto">
                            <div>
                                <label className="block text-sm font-semibold text-slate-700 mb-1">Training Title</label>
                                <input readOnly value={selectedRequest.title} className="w-full px-4 py-2 border border-slate-200 rounded-xl bg-slate-50 text-slate-700 cursor-not-allowed" />
                            </div>
                            <div>
                                <label className="block text-sm font-semibold text-slate-700 mb-1">Vendor & Location</label>
                                <input readOnly value={`${selectedRequest.vendor} - ${selectedRequest.location}`} className="w-full px-4 py-2 border border-slate-200 rounded-xl bg-slate-50 text-slate-700 cursor-not-allowed" />
                            </div>
                            <div>
                                <label className="block text-sm font-semibold text-slate-700 mb-1">Strategic Justification</label>
                                <textarea readOnly value={selectedRequest.justification} className="w-full px-4 py-2 border border-slate-200 rounded-xl bg-slate-50 text-slate-700 cursor-not-allowed resize-none" rows={2} />
                            </div>

                            {(userRole === 'HR' || userRole === 'HR_ADMIN') && selectedRequest.status === 'PENDING_HR' && (
                                <>
                                    <div className="pt-4 border-t border-slate-100">
                                        <h4 className="font-bold text-slate-800 mb-3">Finance Allocation</h4>
                                        <div className="grid grid-cols-2 gap-3">
                                            {[
                                                { label: 'Training Fee', field: 'training' },
                                                { label: 'Travel Cost', field: 'transport' },
                                                { label: 'Accommodation', field: 'accommodation' },
                                                { label: 'Miscellaneous', field: 'others' }
                                            ].map((item) => (
                                                <div key={item.field}>
                                                    <label className="block text-xs font-semibold text-slate-700 mb-1">{item.label}</label>
                                                    <div className="relative">
                                                        <span className="absolute left-3 top-2.5 text-slate-400 text-sm">Rp</span>
                                                        <input
                                                            type="text"
                                                            value={new Intl.NumberFormat('id-ID').format((breakdownCost as any)[item.field])}
                                                            onChange={(e) => {
                                                                const val = Number(e.target.value.replace(/\D/g, ''));
                                                                setBreakdownCost(prev => ({ ...prev, [item.field]: val }));
                                                            }}
                                                            className="w-full pl-8 pr-3 py-2 border border-slate-200 rounded-xl outline-none text-sm focus:border-indigo-500"
                                                        />
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                    {selectedRequest._original?.category === 'Sertifikat' && (
                                        <div className="mt-4">
                                            <label className="block text-sm font-semibold text-slate-700 mb-1">Upload Certificate Evidence</label>
                                            <input
                                                type="file"
                                                accept="image/*,.pdf"
                                                onChange={(e) => setHrCertificateFile(e.target.files ? e.target.files[0] : null)}
                                                className="w-full px-4 py-2 border border-slate-200 rounded-xl outline-none text-sm"
                                            />
                                        </div>
                                    )}
                                </>
                            )}
                            
                            {isRejectMode && (
                                <div className="mt-4 p-4 bg-red-50 rounded-xl border border-red-100">
                                    <label className="block text-sm font-semibold text-red-700 mb-1">Rejection Reason</label>
                                    <input
                                        autoFocus
                                        placeholder="Enter reason..."
                                        className="w-full px-4 py-2 border border-red-200 rounded-xl outline-none text-sm mb-3"
                                        value={rejectReason}
                                        onChange={(e) => setRejectReason(e.target.value)}
                                    />
                                    <div className="flex gap-2">
                                        <button onClick={() => setIsRejectMode(false)} className="flex-1 py-2 bg-white border border-slate-200 text-slate-600 font-bold rounded-xl text-sm">Cancel</button>
                                        <button onClick={() => handleAction(selectedRequest.id, 'reject', rejectReason)} className="flex-1 py-2 bg-red-600 text-white font-bold rounded-xl text-sm">Confirm Reject</button>
                                    </div>
                                </div>
                            )}

                        </div>

                        {!isRejectMode && (
                            <div className="p-6 border-t border-slate-100 bg-slate-50 flex flex-wrap gap-3 rounded-b-2xl">
                                {selectedRequest.evidenceUrl && (
                                    <a href={selectedRequest.evidenceUrl} target="_blank" rel="noopener noreferrer" className="flex-1 py-2 bg-white border border-slate-200 text-slate-600 font-bold rounded-xl text-sm text-center">
                                        Evidence
                                    </a>
                                )}
                                <button onClick={() => handlePrint(selectedRequest)} className="flex-1 py-2 bg-white border border-slate-200 text-slate-600 font-bold rounded-xl text-sm flex items-center justify-center gap-2">
                                    <Printer size={16} /> Print
                                </button>
                                
                                {((userRole === 'SUPERVISOR' && selectedRequest.status === 'PENDING_SUPERVISOR') || (userRole === 'HR' && selectedRequest.status === 'PENDING_HR')) && (
                                    <>
                                        <button onClick={() => setIsRejectMode(true)} className="flex-1 py-2 bg-red-50 text-red-600 font-bold rounded-xl text-sm">Reject</button>
                                        <button onClick={() => handleAction(selectedRequest.id, 'approve')} className="flex-[2] py-2 bg-indigo-600 text-white font-bold rounded-xl text-sm shadow-md hover:bg-indigo-700 transition-colors">Approve Request</button>
                                    </>
                                )}
                                
                                {selectedRequest.status === 'APPROVED' && (userRole === 'HR' || userRole === 'HR_ADMIN') && (
                                    <button onClick={() => handleOpenSettlement(selectedRequest)} className="flex-[2] py-2 bg-emerald-600 text-white font-bold rounded-xl text-sm shadow-md hover:bg-emerald-700 transition-colors">Update Settlement</button>
                                )}
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* Recap Detail Modal */}
            {recapDetailUser && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-slate-900/60 backdrop-blur-md animate-in fade-in duration-300">
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-6xl overflow-hidden flex flex-col max-h-[90vh]">
                        <div className="p-6 sm:p-5 border-b border-slate-50 flex justify-between items-center bg-white">
                            <div>
                                <h2 className="font-black text-2xl text-slate-900 tracking-tight flex items-center gap-4">
                                    <div className="w-10 h-10 rounded-xl bg-indigo-100 text-indigo-600 flex items-center justify-center"><FileText size={20} /></div>
                                    {recapDetailUser} • Training Archive
                                </h2>
                                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-1 ml-14">{selectedPeriod} • {selectedYear}</p>
                            </div>
                            <button onClick={() => setRecapDetailUser(null)} className="p-4 hover:bg-slate-100 rounded-lg text-slate-300 transition-colors"><XCircle size={24} /></button>
                        </div>

                        <div className="overflow-y-auto p-6 sm:p-5">
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

                        <div className="p-6 border-t border-slate-50 bg-slate-50/50 text-right">
                            <button onClick={() => setRecapDetailUser(null)} className="px-10 py-4 bg-white border border-slate-200 text-slate-600 font-black rounded-lg hover:bg-slate-100 transition-all text-xs tracking-widest shadow-sm">
                                CLOSE ARCHIVE
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Settlement Modal */}
            {isSettlementOpen && (
                <div className="fixed inset-0 z-[60] flex items-center justify-center p-6 bg-slate-900/60 backdrop-blur-md animate-in fade-in">
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden animate-in zoom-in-95 flex flex-col max-h-[90vh]">
                        <div className="p-6 border-b border-slate-50 flex justify-between items-center bg-slate-50/50 shrink-0">
                            <div>
                                <h2 className="font-black text-2xl text-slate-900 tracking-tight">Finance Settlement</h2>
                                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-1">Final Actual Expenditure Review</p>
                            </div>
                            <button onClick={() => setIsSettlementOpen(false)} className="p-3 hover:bg-slate-100 rounded-2xl text-slate-300 transition-colors"><XCircle size={24} /></button>
                        </div>

                        <div className="p-6 space-y-6 overflow-y-auto">
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

                            <div className="bg-emerald-900 p-5 rounded-xl text-white shadow-xl shadow-emerald-100">
                                <div className="flex justify-between items-center">
                                    <span className="text-[10px] font-black uppercase tracking-[0.2em] opacity-60">Total Actual Expenditure</span>
                                    <span className="text-2xl font-black">
                                        {formatCurrency(settleData.training + settleData.transport + settleData.accommodation + settleData.others)}
                                    </span>
                                </div>
                            </div>

                            {selectedRequest?._original?.category === 'Sertifikat' && (
                                <div>
                                    <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 ml-1">Upload Certificate Evidence (Optional to Update)</label>
                                    <input
                                        type="file"
                                        accept="image/*,.pdf"
                                        onChange={(e) => setSettleCertificate(e.target.files ? e.target.files[0] : null)}
                                        className="w-full px-4 py-3 rounded-xl border border-slate-200 outline-none text-sm text-slate-600 bg-white"
                                    />
                                </div>
                            )}

                            <div>
                                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 ml-1">Settlement Notes</label>
                                <textarea
                                    className="w-full px-6 py-4 rounded-lg bg-slate-50 border border-slate-100 focus:bg-white outline-none font-bold text-slate-700 text-sm resize-none"
                                    rows={3}
                                    placeholder="Add notes for finance department..."
                                    value={settleData.settlementNotes}
                                    onChange={(e) => setSettleData(prev => ({ ...prev, settlementNotes: e.target.value }))}
                                />
                            </div>
                        </div>

                        <div className="p-5 bg-slate-50 border-t border-slate-100 flex justify-end gap-4 shrink-0">
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
