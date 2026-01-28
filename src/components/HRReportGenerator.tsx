import { useState, useEffect } from 'react';
import { Download, Layers, Eye, XCircle, RefreshCw } from 'lucide-react';
import { API_BASE_URL } from '../config';
import type { TrainingRequest, Meeting, Incentive, ReadingLogEntry } from '../types';

const HRReportGenerator = () => {
    // Data State
    const [requests, setRequests] = useState<TrainingRequest[]>([]);
    const [meetings, setMeetings] = useState<Meeting[]>([]);
    const [incentives, setIncentives] = useState<Incentive[]>([]);
    const [logs, setLogs] = useState<ReadingLogEntry[]>([]);

    // Filter State
    const [year, setYear] = useState<number>(new Date().getFullYear());
    const [selectedBranch, setSelectedBranch] = useState<string>('All');

    // Detail Modal State
    const [detailMonth, setDetailMonth] = useState<string | null>(null);

    const branchesList = ["Medan-HO", "Medan-Cabang", "Jakarta", "Bali", "Binjai", "Tanjung Morawa"];
    const months = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];

    const [refreshing, setRefreshing] = useState(false);

    const fetchData = async () => {
        setRefreshing(true);
        try {
            const [reqRes, meetRes, incRes, logsRes] = await Promise.all([
                fetch(`${API_BASE_URL}/api/training`),
                fetch(`${API_BASE_URL}/api/meetings`),
                fetch(`${API_BASE_URL}/api/incentives`),
                fetch(`${API_BASE_URL}/api/logs`)
            ]);

            if (reqRes.ok) setRequests(await reqRes.json());
            if (meetRes.ok) setMeetings(await meetRes.json());
            if (incRes.ok) setIncentives(await incRes.json());
            if (logsRes.ok) setLogs(await logsRes.json());
        } catch (err) {
            console.error("Failed to fetch report data", err);
        } finally {
            setRefreshing(false);
        }
    };

    useEffect(() => {
        fetchData();
    }, []);

    const formatCurrency = (amount: number) => {
        return new Intl.NumberFormat('id-ID', { maximumFractionDigits: 0 }).format(amount);
    };

    const getMonthIdx = (dateStr: string) => new Date(dateStr).getMonth();
    const getYear = (dateStr: string) => new Date(dateStr).getFullYear();

    // Aggregation Logic
    const monthlyData = months.map((monthName, idx) => {
        let internalTraining = 0;
        let readingIncentive = 0;
        let externalTraining = 0;
        let certIncentive = 0;

        // 1. Internal Training (Meetings)
        meetings.forEach(m => {
            if (getYear(m.date) !== year) return;
            if (getMonthIdx(m.date) !== idx) return;
            if (selectedBranch !== 'All' && m.location !== selectedBranch) return;
            if (m.costReport) {
                internalTraining += (m.costReport.trainerIncentive + m.costReport.snackCost + m.costReport.lunchCost + m.costReport.otherCost);
            }
        });

        // 2. Reading Incentive (Logs)
        logs.filter(l => l.hrApprovalStatus === 'Approved' && l.incentiveAmount).forEach(l => {
            if (getYear(l.date) !== year) return;
            if (getMonthIdx(l.date) !== idx) return;
            if (selectedBranch !== 'All' && l.location !== selectedBranch) return; // Strict location match
            readingIncentive += l.incentiveAmount!;
        });

        // 3. External Training (Requests)
        requests.filter(r => r.status === 'APPROVED').forEach(r => {
            if (getYear(r.date) !== year) return;
            if (getMonthIdx(r.date) !== idx) return;
            if (selectedBranch !== 'All' && r.location !== selectedBranch) return;
            externalTraining += (r.cost || 0) + (r.additionalCost || 0);
        });

        // 4. Certificate Incentive (Incentives)
        incentives.filter(i => i.status === 'Active').forEach(i => {
            if (getYear(i.startDate) !== year) return;
            if (getMonthIdx(i.startDate) !== idx) return;
            // Note: Incentive doesn't have location, so we might skip branch filter or include all
            // For strictness, if branch is selected, we might omit if we can't map user.
            // Let's assume for now they are global or match 'Medan-HO' if strictly needed.
            // To simplify: if 'All' branch selected, show. If specific branch, maybe show if we add location to Incentive type later.
            // Currently showing all for simplified view.
            certIncentive += Number(i.reward) || 0;
        });

        return {
            month: monthName,
            internalTraining,
            readingIncentive,
            externalTraining,
            certIncentive,
            total: internalTraining + readingIncentive + externalTraining + certIncentive
        };
    });

    // Detail Data Generator
    const getDetailTransactions = (monthIdx: number) => {
        const txs: any[] = [];

        // Meetings
        meetings.forEach(m => {
            if (getYear(m.date) !== year || getMonthIdx(m.date) !== monthIdx) return;
            if (selectedBranch !== 'All' && m.location !== selectedBranch) return;
            if (m.costReport) {
                const total = m.costReport.trainerIncentive + m.costReport.snackCost + m.costReport.lunchCost + m.costReport.otherCost;
                const details = [];
                if (m.costReport.snackCost) details.push(`Snack: ${formatCurrency(m.costReport.snackCost)}`);
                if (m.costReport.lunchCost) details.push(`Lunch: ${formatCurrency(m.costReport.lunchCost)}`);
                if (m.costReport.trainerIncentive) details.push(`Trainer: ${formatCurrency(m.costReport.trainerIncentive)}`);
                if (m.costReport.otherCost) details.push(`Other: ${formatCurrency(m.costReport.otherCost)}`);

                txs.push({
                    date: m.date,
                    category: 'Internal Training',
                    item: m.title,
                    pic: m.host,
                    details: details.join(', '),
                    amount: total
                });
            }
        });

        // Logs
        logs.filter(l => l.hrApprovalStatus === 'Approved' && l.incentiveAmount).forEach(l => {
            if (getYear(l.date) !== year || getMonthIdx(l.date) !== monthIdx) return;
            if (selectedBranch !== 'All' && l.location !== selectedBranch) return;
            txs.push({
                date: l.date,
                category: 'Reading Incentive',
                item: l.title,
                pic: l.userName,
                details: `Category: ${l.category}`,
                amount: l.incentiveAmount
            });
        });

        // External Requests
        requests.filter(r => r.status === 'APPROVED').forEach(r => {
            if (getYear(r.date) !== year || getMonthIdx(r.date) !== monthIdx) return;
            if (selectedBranch !== 'All' && r.location !== selectedBranch) return;
            const details = [`Main Cost: ${formatCurrency(r.cost)}`];
            if (r.additionalCost) details.push(`Addtl: ${formatCurrency(r.additionalCost)}`);

            txs.push({
                date: r.date,
                category: 'External Training',
                item: r.title,
                pic: r.employeeName,
                details: details.join(', '),
                amount: (r.cost || 0) + (r.additionalCost || 0)
            });
        });

        // Incentives
        incentives.filter(i => i.status === 'Active').forEach(i => {
            if (getYear(i.startDate) !== year || getMonthIdx(i.startDate) !== monthIdx) return;
            txs.push({
                date: i.startDate,
                category: 'Cert. Incentive',
                item: i.courseName,
                pic: i.employeeName,
                details: 'Reward Payout',
                amount: Number(i.reward) || 0
            });
        });

        return txs.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    };

    const details = detailMonth !== null ? getDetailTransactions(months.indexOf(detailMonth)) : [];

    return (
        <div className="p-6 bg-slate-50 min-h-screen font-sans animate-fade-in relative">

            {/* Header */}
            <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 mb-6 flex flex-col md:flex-row justify-between items-center gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
                        <Layers className="text-blue-600" /> Learning & Development Report
                    </h1>
                    <p className="text-slate-500 mt-1">Consolidated Budget Report • {year} • {selectedBranch}</p>
                </div>

                <div className="flex gap-3">
                    <button
                        onClick={fetchData}
                        disabled={refreshing}
                        className="flex items-center gap-2 px-4 py-2 bg-white text-slate-600 border border-slate-200 rounded-xl hover:bg-slate-50 font-bold transition-all disabled:opacity-50"
                    >
                        <RefreshCw size={18} className={refreshing ? "animate-spin" : ""} />
                        {refreshing ? "Refreshing..." : "Refresh Data"}
                    </button>
                    <select
                        value={year}
                        onChange={(e) => setYear(parseInt(e.target.value))}
                        className="px-4 py-2 rounded-xl border border-slate-300 font-semibold outline-none focus:ring-2 focus:ring-blue-500"
                    >
                        {[2024, 2025, 2026, 2027].map(y => <option key={y} value={y}>{y}</option>)}
                    </select>
                    <select
                        value={selectedBranch}
                        onChange={(e) => setSelectedBranch(e.target.value)}
                        className="px-4 py-2 rounded-xl border border-slate-300 font-semibold outline-none focus:ring-2 focus:ring-blue-500"
                    >
                        <option value="All">All Branches</option>
                        {branchesList.map(b => <option key={b} value={b}>{b}</option>)}
                    </select>
                    <button className="flex items-center gap-2 px-5 py-2 bg-green-600 text-white rounded-xl font-bold hover:bg-green-700 transition-colors shadow-lg shadow-green-200">
                        <Download size={18} /> Export CSV
                    </button>
                </div>
            </div>

            {/* Main Monthly Summary Table */}
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
                <table className="w-full text-left">
                    <thead className="bg-slate-50 text-slate-700 font-bold border-b border-slate-200">
                        <tr>
                            <th className="p-4 w-32">Month</th>
                            <th className="p-4 text-right text-blue-700">Internal Training</th>
                            <th className="p-4 text-right text-green-700">Reading Incentives</th>
                            <th className="p-4 text-right text-orange-700">External Training</th>
                            <th className="p-4 text-right text-purple-700">Cert. Incentives</th>
                            <th className="p-4 text-right bg-slate-100 text-slate-900 border-l border-slate-200">Grand Total</th>
                            <th className="p-4 text-center w-24">Action</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                        {monthlyData.map((row) => (
                            <tr key={row.month} className="hover:bg-slate-50 transition-colors group">
                                <td className="p-4 font-bold text-slate-800">{row.month}</td>
                                <td className="p-4 text-right font-medium text-slate-600">{row.internalTraining > 0 ? formatCurrency(row.internalTraining) : '-'}</td>
                                <td className="p-4 text-right font-medium text-slate-600">{row.readingIncentive > 0 ? formatCurrency(row.readingIncentive) : '-'}</td>
                                <td className="p-4 text-right font-medium text-slate-600">{row.externalTraining > 0 ? formatCurrency(row.externalTraining) : '-'}</td>
                                <td className="p-4 text-right font-medium text-slate-600">{row.certIncentive > 0 ? formatCurrency(row.certIncentive) : '-'}</td>
                                <td className="p-4 text-right font-bold text-slate-900 bg-slate-50/50 border-l border-slate-100">{formatCurrency(row.total)}</td>
                                <td className="p-4 text-center">
                                    <button
                                        onClick={() => setDetailMonth(row.month)}
                                        className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                                        title="View Details"
                                    >
                                        <Eye size={18} />
                                    </button>
                                </td>
                            </tr>
                        ))}
                        <tr className="bg-slate-100 font-bold border-t border-slate-300">
                            <td className="p-4">TOTAL YEAR</td>
                            <td className="p-4 text-right">{formatCurrency(monthlyData.reduce((a, b) => a + b.internalTraining, 0))}</td>
                            <td className="p-4 text-right">{formatCurrency(monthlyData.reduce((a, b) => a + b.readingIncentive, 0))}</td>
                            <td className="p-4 text-right">{formatCurrency(monthlyData.reduce((a, b) => a + b.externalTraining, 0))}</td>
                            <td className="p-4 text-right">{formatCurrency(monthlyData.reduce((a, b) => a + b.certIncentive, 0))}</td>
                            <td className="p-4 text-right text-lg border-l border-slate-300 bg-slate-200">{formatCurrency(monthlyData.reduce((a, b) => a + b.total, 0))}</td>
                            <td></td>
                        </tr>
                    </tbody>
                </table>
            </div>

            {/* Detail Modal */}
            {detailMonth && (
                <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 animate-in fade-in backdrop-blur-sm">
                    <div className="bg-white rounded-2xl w-full max-w-5xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden">
                        <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50">
                            <div>
                                <h2 className="text-xl font-bold text-slate-800">Transaction Details - {detailMonth} {year}</h2>
                                <p className="text-sm text-slate-500">Breakdown of all expenses for this period.</p>
                            </div>
                            <button onClick={() => setDetailMonth(null)} className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-full transition-colors">
                                <XCircle size={24} />
                            </button>
                        </div>

                        <div className="flex-1 overflow-y-auto p-6 bg-slate-50/50">
                            {details.length === 0 ? (
                                <div className="text-center py-12 text-slate-400 border-2 border-dashed border-slate-200 rounded-xl bg-white">
                                    No transaction data available for this month.
                                </div>
                            ) : (
                                <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                                    <table className="w-full text-left">
                                        <thead className="bg-slate-50 text-xs uppercase tracking-wider text-slate-500 font-bold border-b border-slate-100">
                                            <tr>
                                                <th className="p-4">Date</th>
                                                <th className="p-4">Category</th>
                                                <th className="p-4">Activity / Item</th>
                                                <th className="p-4">PIC</th>
                                                <th className="p-4 w-1/3">Cost Breakdown</th>
                                                <th className="p-4 text-right">Total Amount</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-50 text-sm">
                                            {details.map((tx, idx) => (
                                                <tr key={idx} className="hover:bg-slate-50 transition-colors">
                                                    <td className="p-4 text-slate-500 whitespace-nowrap">{new Date(tx.date).toLocaleDateString()}</td>
                                                    <td className="p-4">
                                                        <span className={`px-2 py-1 rounded text-[10px] font-bold uppercase
                                                            ${tx.category.includes('Internal') ? 'bg-blue-100 text-blue-700' :
                                                                tx.category.includes('External') ? 'bg-orange-100 text-orange-700' :
                                                                    'bg-green-100 text-green-700'}`}>
                                                            {tx.category}
                                                        </span>
                                                    </td>
                                                    <td className="p-4 font-semibold text-slate-700">{tx.item}</td>
                                                    <td className="p-4 text-slate-600">{tx.pic || '-'}</td>
                                                    <td className="p-4 text-slate-500 italic text-xs leading-relaxed">{tx.details}</td>
                                                    <td className="p-4 text-right font-bold text-slate-800">{formatCurrency(tx.amount)}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                        <tfoot className="bg-slate-50 font-bold border-t border-slate-200 text-right">
                                            <tr>
                                                <td colSpan={5} className="p-4 text-slate-600">TOTAL {detailMonth.toUpperCase()}</td>
                                                <td className="p-4 text-slate-900 text-base">{formatCurrency(details.reduce((a, b) => a + b.amount, 0))}</td>
                                            </tr>
                                        </tfoot>
                                    </table>
                                </div>
                            )}
                        </div>

                        <div className="p-4 border-t border-slate-100 bg-white text-right">
                            <button onClick={() => setDetailMonth(null)} className="px-6 py-2 bg-slate-800 text-white rounded-xl font-bold hover:bg-slate-900 transition-colors">Close Details</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default HRReportGenerator;
