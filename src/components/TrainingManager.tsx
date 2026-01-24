import { useState, useEffect } from 'react';
import {
    Search,
    XCircle,
    CheckCircle2,
    FileText,
    Printer,
    DollarSign
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

const TrainingManager = () => {
    const [requests, setRequests] = useState<TrainingRequest[]>([]);
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedRequest, setSelectedRequest] = useState<TrainingRequest | null>(null);
    const [isRejectMode, setIsRejectMode] = useState(false);
    const [rejectReason, setRejectReason] = useState('');

    // Settlement State
    const [isSettlementOpen, setIsSettlementOpen] = useState(false);
    const [settleData, setSettleData] = useState({
        finalCost: 0,
        additionalCost: 0,
        settlementNotes: ''
    });

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
                body: JSON.stringify({ action, reason })
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
                                    <!-- Note: Assuming logic updates cost or we use req.finalCost if available. For now using cost -->
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
                    cost: settleData.finalCost, // Update main cost to final? Or separate field? User prompt implies updating "additional cost". I'll update both for completeness.
                    additionalCost: settleData.additionalCost,
                    // settlementNotes: settleData.settlementNotes // Needs field in type if we want to save it everywhere
                })
            });
            if (res.ok) {
                const updated = await res.json();
                setRequests(requests.map(r => r.id === updated.id ? updated : r));
                setIsSettlementOpen(false);
                // Keep selectedRequest open to show update
                setSelectedRequest(updated);
            }
        } catch (err) { console.error(err); }
    };

    const filteredRequests = requests.filter(req =>
        (req.employeeName || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
        (req.title || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
        (req.vendor || '').toLowerCase().includes(searchQuery.toLowerCase())
    );

    return (
        <div className="space-y-8 animate-fade-in">
            {/* Header */}
            <div className="flex flex-col md:flex-row justify-between items-center gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-slate-800">Training Requests</h1>
                    <p className="text-slate-500 mt-1">List of all training requests submitted by employees</p>
                </div>

                <div className="relative w-full md:w-96">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={20} />
                    <input
                        type="text"
                        placeholder="Search employee, training..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-700 placeholder-slate-400 focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                    />
                </div>
            </div>

            {/* Training Requests List */}
            <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
                <div className="overflow-x-auto">
                    <table className="w-full text-left">
                        <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 text-xs uppercase font-semibold">
                            <tr>
                                <th className="px-6 py-4">Employee</th>
                                <th className="px-6 py-4">Training Title</th>
                                <th className="px-6 py-4">Vendor</th>
                                <th className="px-6 py-4">Date</th>
                                <th className="px-6 py-4">Cost</th>
                                <th className="px-6 py-4">Add. Cost</th>
                                <th className="px-6 py-4">Priority</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {filteredRequests.map(req => (
                                <tr
                                    key={req.id}
                                    onClick={() => setSelectedRequest(req)}
                                    className="hover:bg-slate-50 cursor-pointer transition-colors"
                                >
                                    <td className="px-6 py-4">
                                        <div className="flex items-center gap-3">
                                            <div className="w-9 h-9 rounded-full bg-indigo-50 text-indigo-600 flex items-center justify-center font-bold text-sm">
                                                {req.employeeName.charAt(0)}
                                            </div>
                                            <div>
                                                <p className="font-bold text-slate-700 text-sm">{req.employeeName}</p>
                                                <p className="text-xs text-slate-400">{req.employeeRole}</p>
                                            </div>
                                        </div>
                                    </td>
                                    <td className="px-6 py-4">
                                        <p className="font-semibold text-slate-700 text-sm">{req.title}</p>
                                    </td>
                                    <td className="px-6 py-4">
                                        <p className="text-sm text-slate-600">{req.vendor}</p>
                                    </td>
                                    <td className="px-6 py-4">
                                        <p className="text-sm text-slate-600">{new Date(req.date).toLocaleDateString()}</p>
                                    </td>
                                    <td className="px-6 py-4">
                                        <p className="font-mono text-sm text-slate-600">{formatCurrency(req.cost)}</p>
                                    </td>
                                    <td className="px-6 py-4">
                                        <p className="font-mono text-sm text-slate-600">
                                            {req.additionalCost ? formatCurrency(req.additionalCost) : '-'}
                                        </p>
                                    </td>
                                    <td className="px-6 py-4">
                                        <span className={`text-xs font-bold px-2 py-1 rounded border 
                                            ${req.priority === 'High' ? 'bg-red-50 text-red-600 border-red-100' :
                                                req.priority === 'Medium' ? 'bg-yellow-50 text-yellow-600 border-yellow-100' :
                                                    'bg-slate-50 text-slate-500 border-slate-100'}
                                        `}>
                                            {req.priority}
                                        </span>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>

                {filteredRequests.length === 0 && (
                    <div className="text-center py-12">
                        <p className="text-slate-400 italic">No training requests found.</p>
                    </div>
                )}
            </div>

            {/* Approval Modal */}
            {selectedRequest && (
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
                            ) : selectedRequest.status.includes('PENDING') ? (
                                <>
                                    <button
                                        onClick={() => setIsRejectMode(true)}
                                        className="px-6 py-3 rounded-xl font-bold text-red-600 hover:bg-red-50 border border-transparent hover:border-red-100 transition-all"
                                    >
                                        Reject Request
                                    </button>
                                    <button
                                        onClick={() => handleAction(selectedRequest.id, 'approve')}
                                        className="px-8 py-3 rounded-xl font-bold text-white bg-blue-600 hover:bg-blue-700 shadow-lg shadow-blue-500/20 transition-all flex items-center gap-2"
                                    >
                                        <CheckCircle2 size={20} /> Approve Request
                                    </button>
                                </>
                            ) : (
                                <div className="flex gap-3">
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
                                    <button
                                        onClick={() => setSelectedRequest(null)}
                                        className="px-8 py-3 rounded-xl font-bold text-slate-600 hover:bg-slate-200 transition-all"
                                    >
                                        Close Details
                                    </button>
                                </div>
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
            )}
        </div>
    );
};

export default TrainingManager;
