import { useState, useEffect } from 'react';
import { BarChart, PieChart, FileText, Download } from 'lucide-react';
import { API_BASE_URL } from '../config';
import type { TrainingRequest } from '../types';

const HRReportGenerator = () => {
    const [requests, setRequests] = useState<TrainingRequest[]>([]);
    const [year, setYear] = useState<number>(new Date().getFullYear());
    const [quarter, setQuarter] = useState<string>('All');
    const [selectedLocation, setSelectedLocation] = useState<string>('All');

    useEffect(() => {
        const fetchRequests = async () => {
            try {
                const res = await fetch(`${API_BASE_URL}/api/training`);
                const data = await res.json();
                setRequests(data);
            } catch (err) {
                console.error("Failed to fetch training requests", err);
            }
        };
        fetchRequests();
    }, []);

    // Extract unique locations
    const locations = Array.from(new Set(requests.map(r => r.location).filter(Boolean))) as string[];

    // Filtering Logic
    const filteredRequests = requests.filter(req => {
        const d = new Date(req.date);
        const reqYear = d.getFullYear();
        const reqMonth = d.getMonth(); // 0-11

        if (year !== reqYear) return false;

        if (quarter !== 'All') {
            const q = parseInt(quarter.replace('Q', ''));
            // Q1: 0,1,2 | Q2: 3,4,5 | Q3: 6,7,8 | Q4: 9,10,11
            const startMonth = (q - 1) * 3;
            const endMonth = startMonth + 2;
            if (reqMonth < startMonth || reqMonth > endMonth) return false;
        }

        if (selectedLocation !== 'All' && req.location !== selectedLocation) return false;

        return true;
    });

    // Calculations
    const totalBudget = filteredRequests.reduce((sum, req) => sum + (req.cost || 0), 0);
    const approvedBudget = filteredRequests.filter(r => r.status === 'APPROVED').reduce((sum, req) => sum + (req.cost || 0), 0);
    const totalRequests = filteredRequests.length;

    // Grouping by Location for "Per Cabang" view
    const locationBreakdown = filteredRequests.reduce((acc, req) => {
        const loc = req.location || 'Unknown';
        if (!acc[loc]) acc[loc] = 0;
        acc[loc] += (req.cost || 0);
        return acc;
    }, {} as Record<string, number>);

    const formatCurrency = (amount: number) => {
        return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR' }).format(amount);
    };

    return (
        <div className="space-y-8 animate-fade-in p-6">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
                        <BarChart className="text-blue-600" /> HR Training Reports
                    </h1>
                    <p className="text-slate-500 mt-1">Analyze training budget and requests per branch/quarter.</p>
                </div>
                <button className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 rounded-xl text-slate-600 font-bold hover:bg-slate-50 transition-colors shadow-sm">
                    <Download size={18} /> Export CSV
                </button>
            </div>

            {/* Filters */}
            <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 grid grid-cols-1 md:grid-cols-3 gap-6">
                <div>
                    <label className="block text-sm font-bold text-slate-700 mb-2">Year</label>
                    <select
                        value={year}
                        onChange={(e) => setYear(parseInt(e.target.value))}
                        className="w-full px-4 py-2 rounded-xl border border-slate-200 outline-none focus:ring-2 focus:ring-blue-500"
                    >
                        <option value={2026}>2026</option>
                        <option value={2025}>2025</option>
                        <option value={2024}>2024</option>
                    </select>
                </div>
                <div>
                    <label className="block text-sm font-bold text-slate-700 mb-2">Quarter</label>
                    <select
                        value={quarter}
                        onChange={(e) => setQuarter(e.target.value)}
                        className="w-full px-4 py-2 rounded-xl border border-slate-200 outline-none focus:ring-2 focus:ring-blue-500"
                    >
                        <option value="All">Full Year</option>
                        <option value="Q1">Q1 (Jan - Mar)</option>
                        <option value="Q2">Q2 (Apr - Jun)</option>
                        <option value="Q3">Q3 (Jul - Sep)</option>
                        <option value="Q4">Q4 (Oct - Dec)</option>
                    </select>
                </div>
                <div>
                    <label className="block text-sm font-bold text-slate-700 mb-2">Branch / Cabang</label>
                    <select
                        value={selectedLocation}
                        onChange={(e) => setSelectedLocation(e.target.value)}
                        className="w-full px-4 py-2 rounded-xl border border-slate-200 outline-none focus:ring-2 focus:ring-blue-500"
                    >
                        <option value="All">All Branches</option>
                        {locations.map(loc => (
                            <option key={loc} value={loc}>{loc}</option>
                        ))}
                    </select>
                </div>
            </div>

            {/* Stats Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="bg-blue-600 text-white p-6 rounded-2xl shadow-lg shadow-blue-200">
                    <p className="text-blue-100 font-medium mb-1">Total Budget Requested</p>
                    <h3 className="text-3xl font-bold">{formatCurrency(totalBudget)}</h3>
                </div>
                <div className="bg-emerald-500 text-white p-6 rounded-2xl shadow-lg shadow-emerald-200">
                    <p className="text-emerald-100 font-medium mb-1">Total Approved Budget</p>
                    <h3 className="text-3xl font-bold">{formatCurrency(approvedBudget)}</h3>
                </div>
                <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
                    <p className="text-slate-500 font-medium mb-1">Total Requests</p>
                    <h3 className="text-3xl font-bold text-slate-800">{totalRequests}</h3>
                </div>
            </div>

            {/* Branch Breakdown */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
                    <h3 className="font-bold text-slate-800 mb-4 flex items-center gap-2">
                        <PieChart size={20} className="text-slate-400" /> Budget by Branch
                    </h3>
                    <div className="space-y-4">
                        {Object.entries(locationBreakdown).map(([loc, amount]) => {
                            const percent = totalBudget > 0 ? (amount / totalBudget) * 100 : 0;
                            return (
                                <div key={loc}>
                                    <div className="flex justify-between text-sm mb-1">
                                        <span className="font-bold text-slate-700">{loc}</span>
                                        <span className="font-semibold text-slate-900">{formatCurrency(amount)}</span>
                                    </div>
                                    <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden">
                                        <div className="bg-blue-500 h-full rounded-full" style={{ width: `${percent}%` }}></div>
                                    </div>
                                </div>
                            );
                        })}
                        {Object.keys(locationBreakdown).length === 0 && (
                            <p className="text-center text-slate-400 py-8 italic">No data available for this filter.</p>
                        )}
                    </div>
                </div>

                {/* Detail List */}
                <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden flex flex-col">
                    <div className="p-6 border-b border-slate-100">
                        <h3 className="font-bold text-slate-800 flex items-center gap-2">
                            <FileText size={20} className="text-slate-400" /> Request Details
                        </h3>
                    </div>
                    <div className="flex-1 overflow-y-auto max-h-[400px]">
                        <table className="w-full text-left">
                            <thead className="bg-slate-50 text-slate-500 text-xs uppercase font-semibold sticky top-0">
                                <tr>
                                    <th className="px-6 py-3">Date</th>
                                    <th className="px-6 py-3">Title</th>
                                    <th className="px-6 py-3">Branch</th>
                                    <th className="px-6 py-3 text-right">Cost</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {filteredRequests.map(req => (
                                    <tr key={req.id} className="hover:bg-slate-50">
                                        <td className="px-6 py-3 text-sm text-slate-500">{new Date(req.date).toLocaleDateString()}</td>
                                        <td className="px-6 py-3 text-sm font-semibold text-slate-700">{req.title}</td>
                                        <td className="px-6 py-3 text-sm text-slate-600">{req.location || '-'}</td>
                                        <td className="px-6 py-3 text-sm font-mono text-slate-700 text-right">{formatCurrency(req.cost)}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default HRReportGenerator;
