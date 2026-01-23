import { useState } from 'react';
import {
    Search,
    XCircle,
    CheckCircle2,
    FileText,
} from 'lucide-react';

// Types
interface TrainingRequest {
    id: number;
    employeeName: string;
    employeeRole: string;
    title: string;
    vendor: string;
    cost: number;
    date: string;
    status: 'PENDING_SUPERVISOR' | 'PENDING_HR' | 'APPROVED' | 'REJECTED';
    justification: string;
    priority: 'High' | 'Medium' | 'Low';
}

const MOCK_REQUESTS: TrainingRequest[] = [
    { id: 1, employeeName: "Sarah Johnson", employeeRole: "UX Designer", title: "Advanced Figma Mastery", vendor: "DesignCode", cost: 2500000, date: "2024-04-10", status: "PENDING_HR", justification: "To improve prototyping speed.", priority: "High" },
    { id: 2, employeeName: "Michael Chen", employeeRole: "Backend Dev", title: "AWS Solutions Architect", vendor: "Amazon", cost: 4500000, date: "2024-05-15", status: "APPROVED", justification: "Required for cloud migration project.", priority: "High" },
    { id: 3, employeeName: "Jessica Wu", employeeRole: "Marketing", title: "SEO Fundamentals", vendor: "Coursera", cost: 500000, date: "2024-04-20", status: "PENDING_SUPERVISOR", justification: "Upskilling for Q2 campaign.", priority: "Medium" },
    { id: 4, employeeName: "David Kim", employeeRole: "Frontend Dev", title: "React Summit Ticket", vendor: "GitNation", cost: 8000000, date: "2024-06-01", status: "REJECTED", justification: "Networking opportunity.", priority: "Low" },
];

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
    const [requests, setRequests] = useState<TrainingRequest[]>(MOCK_REQUESTS);
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedRequest, setSelectedRequest] = useState<TrainingRequest | null>(null);

    const formatCurrency = (amount: number) => {
        return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR' }).format(amount);
    };

    const handleApprove = (id: number) => {
        setRequests(requests.map(r => r.id === id ? { ...r, status: 'APPROVED' } : r));
        setSelectedRequest(null);
    };

    const handleReject = (id: number) => {
        setRequests(requests.map(r => r.id === id ? { ...r, status: 'REJECTED' } : r));
        setSelectedRequest(null);
    };

    const filteredRequests = requests.filter(req =>
        req.employeeName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        req.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        req.vendor.toLowerCase().includes(searchQuery.toLowerCase())
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
                                <th className="px-6 py-4">Status</th>
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
                                        <StatusBadge status={req.status} />
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
                        </div>

                        {/* Action Footer */}
                        <div className="p-6 border-t border-slate-100 bg-slate-50 flex justify-end gap-3">
                            {selectedRequest.status.includes('PENDING') ? (
                                <>
                                    <button
                                        onClick={() => handleReject(selectedRequest.id)}
                                        className="px-6 py-3 rounded-xl font-bold text-red-600 hover:bg-red-50 border border-transparent hover:border-red-100 transition-all"
                                    >
                                        Reject Request
                                    </button>
                                    <button
                                        onClick={() => handleApprove(selectedRequest.id)}
                                        className="px-8 py-3 rounded-xl font-bold text-white bg-blue-600 hover:bg-blue-700 shadow-lg shadow-blue-500/20 transition-all flex items-center gap-2"
                                    >
                                        <CheckCircle2 size={20} /> Approve Request
                                    </button>
                                </>
                            ) : (
                                <button
                                    onClick={() => setSelectedRequest(null)}
                                    className="px-8 py-3 rounded-xl font-bold text-slate-600 hover:bg-slate-200 transition-all"
                                >
                                    Close Details
                                </button>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default TrainingManager;
