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
    const [employees, setEmployees] = useState<any[]>([]);

    // Filter State
    const [year, setYear] = useState<number>(new Date().getFullYear());
    const [selectedBranch, setSelectedBranch] = useState<string>('All');
    const [branchesList, setBranchesList] = useState<string[]>([]);

    // Detail Modal State
    const [detailMonth, setDetailMonth] = useState<string | null>(null);

    const months = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];

    const [refreshing, setRefreshing] = useState(false);

    const fetchData = async () => {
        setRefreshing(true);
        try {
            const [reqRes, meetRes, incRes, logsRes, empRes] = await Promise.all([
                fetch(`${API_BASE_URL}/api/training`),
                fetch(`${API_BASE_URL}/api/meetings`),
                fetch(`${API_BASE_URL}/api/incentives`),
                fetch(`${API_BASE_URL}/api/logs`),
                fetch(`${API_BASE_URL}/api/employees`)
            ]);

            if (reqRes.ok) setRequests(await reqRes.json());
            if (meetRes.ok) setMeetings(await meetRes.json());
            if (incRes.ok) setIncentives(await incRes.json());
            if (logsRes.ok) setLogs(await logsRes.json());
            if (empRes.ok) setEmployees(await empRes.json());
        } catch (err) {
            console.error("Failed to fetch report data", err);
        } finally {
            setRefreshing(false);
        }
    };

    const fetchBranches = async () => {
        try {
            const res = await fetch(`${API_BASE_URL}/api/branches`);
            if (res.ok) {
                const data = await res.json();
                if (Array.isArray(data)) {
                    setBranchesList(data.map((b: any) => b.name));
                }
            }
        } catch (err) { console.error(err); }
    };

    useEffect(() => {
        fetchData();
        fetchBranches();
    }, []);

    const formatCurrency = (amount: number) => {
        return new Intl.NumberFormat('id-ID', { maximumFractionDigits: 0 }).format(amount);
    };

    // Helper to safety parse numbers
    const safeNum = (val: string | number | undefined | null) => {
        if (typeof val === 'number') return val;
        if (!val) return 0;

        // Try direct conversion first (handles standard DB strings "150000.00")
        const direct = Number(val);
        if (!isNaN(direct)) return direct;

        // Handle "1.000.000" string format if present
        if (typeof val === 'string') {
            const clean = val.replace(/\./g, '').replace(/,/g, '.'); // Remove thousands dot, replace decimal comma
            return Number(clean) || 0;
        }
        return 0;
    };

    // Aggregation Logic
    // Helper for Incentive Period (26th Prev Month - 25th Curr Month)
    const getPeriodRange = (yearIdx: number, monthIdx: number) => {
        const start = new Date(yearIdx, monthIdx - 1, 26);
        const end = new Date(yearIdx, monthIdx, 25, 23, 59, 59, 999);
        return { start, end };
    };

    const isInPeriod = (dateStr: string, range: { start: Date, end: Date }) => {
        const d = new Date(dateStr);
        return d >= range.start && d <= range.end;
    };

    const monthlyData = months.map((monthName, idx) => {
        let internalTraining = 0;
        let readingIncentive = 0;
        let externalTraining = 0;
        let certIncentive = 0;

        const { start, end } = getPeriodRange(year, idx);
        const range = { start, end };

        // 1. Internal Training (Meetings)
        meetings.forEach(m => {
            if (selectedBranch !== 'All' && m.location !== selectedBranch) return;
            if (m.costReport && isInPeriod(m.date, range)) {
                internalTraining += (
                    safeNum(m.costReport.trainerIncentive) +
                    safeNum(m.costReport.snackCost) +
                    safeNum(m.costReport.lunchCost) +
                    safeNum(m.costReport.otherCost) +
                    (safeNum(m.costReport.audienceFee) * safeNum(m.costReport.participantsCount))
                );
            }
        });

        // 2. Reading Incentive (Logs)
        logs.filter(l => l.hrApprovalStatus === 'Approved' && l.incentiveAmount).forEach(l => {
            if (selectedBranch !== 'All' && l.location !== selectedBranch) return;
            // Use finishDate if available, else date
            const dateToCheck = l.finishDate || l.date;
            if (isInPeriod(dateToCheck, range)) {
                readingIncentive += safeNum(l.incentiveAmount);
            }
        });

        // 3. External Training (Requests)
        requests.filter(r => r.status === 'APPROVED').forEach(r => {
            if (selectedBranch !== 'All' && r.location !== selectedBranch) return;
            if (isInPeriod(r.date, range)) {
                externalTraining += safeNum(r.cost) + safeNum(r.additionalCost);
            }
        });

        // 4. Certificate Incentive (Incentives)
        incentives.filter(i => ['Active', 'Paid'].includes(i.status)).forEach(i => {
            if (selectedBranch !== 'All') {
                const emp = employees.find(e => e.id_employee === i.employee_id);
                if (emp?.branch_name !== selectedBranch) return;
            }
            const isOneTime = i.paymentType === 'One-Time';
            const iStart = new Date(i.startDate);
            const iEnd = new Date(i.endDate);
            const dateToUse = i.approvedDate ? new Date(i.approvedDate) : iStart;

            if (isOneTime) {
                if (isInPeriod(dateToUse.toISOString(), range)) {
                    certIncentive += safeNum(i.reward);
                }
            } else {
                if (range.start <= iEnd && range.end >= iStart) {
                    certIncentive += safeNum(i.reward);
                }
            }
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
    interface Transaction {
        date: string;
        category: string;
        item: string;
        pic: string;
        details: string;
        amount: number;
    }

    const getDetailTransactions = (monthIdx: number) => {
        const txs: Transaction[] = [];
        const { start, end } = getPeriodRange(year, monthIdx);
        const range = { start, end };

        // Meetings
        meetings.forEach(m => {
            if (selectedBranch !== 'All' && m.location !== selectedBranch) return;
            if (m.costReport && isInPeriod(m.date, range)) {
                const total = safeNum(m.costReport.trainerIncentive) +
                    safeNum(m.costReport.snackCost) +
                    safeNum(m.costReport.lunchCost) +
                    safeNum(m.costReport.otherCost) +
                    (safeNum(m.costReport.audienceFee) * safeNum(m.costReport.participantsCount));

                const details = [];
                if (m.costReport.snackCost) details.push(`Snack: ${formatCurrency(m.costReport.snackCost)}`);
                if (m.costReport.lunchCost) details.push(`Lunch: ${formatCurrency(m.costReport.lunchCost)}`);
                if (m.costReport.trainerIncentive) details.push(`Trainer: ${formatCurrency(m.costReport.trainerIncentive)}`);
                if (m.costReport.audienceFee) details.push(`Audience: ${formatCurrency(m.costReport.audienceFee)}/pax`);
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
            if (selectedBranch !== 'All' && l.location !== selectedBranch) return;
            const dateToCheck = l.finishDate || l.date;
            if (isInPeriod(dateToCheck, range)) {
                txs.push({
                    date: l.date,
                    category: 'Reading Incentive',
                    item: l.title,
                    pic: l.userName || 'Unknown',
                    details: `Category: ${l.category}`,
                    amount: safeNum(l.incentiveAmount)
                });
            }
        });

        // External Requests
        requests.filter(r => r.status === 'APPROVED').forEach(r => {
            if (selectedBranch !== 'All' && r.location !== selectedBranch) return;
            if (isInPeriod(r.date, range)) {
                const details = [`Main Cost: ${formatCurrency(r.cost || 0)}`];
                if (r.additionalCost) details.push(`Addtl: ${formatCurrency(r.additionalCost)}`);

                txs.push({
                    date: r.date,
                    category: 'External Training',
                    item: r.title,
                    pic: r.employeeName || 'Unknown',
                    details: details.join(', '),
                    amount: safeNum(r.cost) + safeNum(r.additionalCost)
                });
            }
        });

        // Incentives
        incentives.filter(i => ['Active', 'Paid'].includes(i.status)).forEach(i => {
            if (selectedBranch !== 'All') {
                const emp = employees.find(e => e.id_employee === i.employee_id);
                if (emp?.branch_name !== selectedBranch) return;
            }
            const isOneTime = i.paymentType === 'One-Time';
            const iStart = new Date(i.startDate);
            const iEnd = new Date(i.endDate);
            const dateToUse = i.approvedDate ? new Date(i.approvedDate) : iStart;

            let shouldInclude = false;

            if (isOneTime) {
                shouldInclude = isInPeriod(dateToUse.toISOString(), range);
            } else {
                shouldInclude = range.start <= iEnd && range.end >= iStart;
            }

            if (shouldInclude) {
                txs.push({
                    date: isOneTime ? dateToUse.toISOString() : range.end.toISOString(),
                    category: `Cert. Incentive (${isOneTime ? 'One-Time' : 'Recurring'})`,
                    item: i.courseName,
                    pic: i.employeeName,
                    details: `Status: ${i.status} • Reward: ${formatCurrency(safeNum(i.reward))}`,
                    amount: safeNum(i.reward)
                });
            }
        });

        return txs.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    };

    const handleExport = () => {
        const headers = ["Month", "Internal Training", "Reading Incentives", "External Training", "Cert. Incentives", "Grand Total"];
        const rows = monthlyData.map(row => [
            row.month,
            row.internalTraining,
            row.readingIncentive,
            row.externalTraining,
            row.certIncentive,
            row.total
        ]);

        const csvContent = "data:text/csv;charset=utf-8,"
            + headers.join(",") + "\n"
            + rows.map(r => r.join(",")).join("\n");

        const encodedUri = encodeURI(csvContent);
        const link = document.createElement("a");
        link.setAttribute("href", encodedUri);
        link.setAttribute("download", `L&D_Report_${year}_${selectedBranch}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    const details = detailMonth !== null ? getDetailTransactions(months.indexOf(detailMonth)) : [];

    return (
        <div className="p-6 bg-slate-50 min-h-screen font-sans animate-fade-in relative">
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
                    <button
                        onClick={handleExport}
                        className="flex items-center gap-2 px-5 py-2 bg-green-600 text-white rounded-xl font-bold hover:bg-green-700 transition-colors shadow-lg shadow-green-200"
                    >
                        <Download size={18} /> Export CSV
                    </button>
                </div>
            </div>

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
                                    >
                                        <Eye size={18} />
                                    </button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                    <tfoot className="bg-slate-100 font-bold border-t border-slate-300">
                        <tr>
                            <td className="p-4">TOTAL YEAR</td>
                            <td className="p-4 text-right">{formatCurrency(monthlyData.reduce((a, b) => a + b.internalTraining, 0))}</td>
                            <td className="p-4 text-right">{formatCurrency(monthlyData.reduce((a, b) => a + b.readingIncentive, 0))}</td>
                            <td className="p-4 text-right">{formatCurrency(monthlyData.reduce((a, b) => a + b.externalTraining, 0))}</td>
                            <td className="p-4 text-right">{formatCurrency(monthlyData.reduce((a, b) => a + b.certIncentive, 0))}</td>
                            <td className="p-4 text-right text-lg border-l border-slate-300 bg-slate-200">{formatCurrency(monthlyData.reduce((a, b) => a + b.total, 0))}</td>
                            <td></td>
                        </tr>
                    </tfoot>
                </table>
            </div>

            {detailMonth && (
                <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 animate-in fade-in backdrop-blur-sm">
                    <div className="bg-white rounded-2xl w-full max-w-5xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden">
                        <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50">
                            <div>
                                <h2 className="text-xl font-bold text-slate-800">Transaction Details - {detailMonth} {year}</h2>
                            </div>
                            <button onClick={() => setDetailMonth(null)} className="p-2 text-slate-400 hover:text-red-500 rounded-full transition-colors">
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
                                        <thead className="bg-slate-50 text-xs uppercase text-slate-500 font-bold border-b border-slate-100">
                                            <tr>
                                                <th className="p-4">Date</th>
                                                <th className="p-4">Category</th>
                                                <th className="p-4">Item</th>
                                                <th className="p-4">PIC</th>
                                                <th className="p-4">Details</th>
                                                <th className="p-4 text-right">Amount</th>
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
                                                    <td className="p-4 text-slate-500 italic text-xs">{tx.details}</td>
                                                    <td className="p-4 text-right font-bold text-slate-800">{formatCurrency(tx.amount)}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                        <tfoot className="bg-slate-50 font-bold border-t border-slate-200 text-right">
                                            <tr>
                                                <td colSpan={5} className="p-4 text-slate-600">TOTAL</td>
                                                <td className="p-4 text-slate-900 text-base">{formatCurrency(details.reduce((a, b) => a + b.amount, 0))}</td>
                                            </tr>
                                        </tfoot>
                                    </table>
                                </div>
                            )}
                        </div>
                        <div className="p-4 border-t border-slate-100 bg-white text-right">
                            <button onClick={() => setDetailMonth(null)} className="px-6 py-2 bg-slate-800 text-white rounded-xl font-bold hover:bg-slate-900 transition-colors">Close</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default HRReportGenerator;
