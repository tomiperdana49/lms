import { useState, useEffect } from 'react';
import { Download, Layers, Eye, XCircle, RefreshCw, Filter, Calendar, Building2, TrendingUp, DollarSign, PieChart, ArrowUpRight } from 'lucide-react';
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
        return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(amount);
    };

    // Helper to safety parse numbers
    const safeNum = (val: string | number | undefined | null) => {
        if (typeof val === 'number') return val;
        if (!val) return 0;

        const direct = Number(val);
        if (!isNaN(direct)) return direct;

        if (typeof val === 'string') {
            const clean = val.replace(/\./g, '').replace(/,/g, '.');
            return Number(clean) || 0;
        }
        return 0;
    };

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

        logs.filter(l => l.hrApprovalStatus === 'Approved' && l.incentiveAmount).forEach(l => {
            if (selectedBranch !== 'All' && l.location !== selectedBranch) return;
            const dateToCheck = l.finishDate || l.date;
            if (isInPeriod(dateToCheck, range)) {
                readingIncentive += safeNum(l.incentiveAmount);
            }
        });

        requests.filter(r => r.status === 'APPROVED').forEach(r => {
            if (selectedBranch !== 'All' && r.location !== selectedBranch) return;
            if (isInPeriod(r.date, range)) {
                externalTraining += safeNum(r.cost) + safeNum(r.additionalCost);
            }
        });

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

    // Stats
    const totalYTD = monthlyData.reduce((sum, m) => sum + m.total, 0);
    const avgMonthly = totalYTD / monthlyData.filter(m => m.total > 0).length || 0;
    const topCategory = [
        { label: 'Internal', val: monthlyData.reduce((s, m) => s + m.internalTraining, 0) },
        { label: 'External', val: monthlyData.reduce((s, m) => s + m.externalTraining, 0) },
        { label: 'Reading', val: monthlyData.reduce((s, m) => s + m.readingIncentive, 0) },
        { label: 'Cert.', val: monthlyData.reduce((s, m) => s + m.certIncentive, 0) }
    ].sort((a, b) => b.val - a.val)[0];

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
        <div className="space-y-10 animate-fade-in max-w-[1600px] mx-auto py-6">
            {/* Professional Header */}
            <div className="flex flex-col xl:flex-row justify-between items-start xl:items-center gap-6">
                <div>
                    <h1 className="text-4xl font-black text-slate-900 tracking-tight flex items-center gap-4">
                        <Layers className="text-indigo-600" size={32} />
                        HR Report Generator
                    </h1>
                    <p className="text-slate-400 font-bold uppercase tracking-widest text-[10px] mt-1 ml-12">Nusa LMS • Enterprise Expenditure Intelligence</p>
                </div>

                <div className="flex items-center gap-3">
                    <button
                        onClick={fetchData}
                        disabled={refreshing}
                        className="flex items-center gap-2 px-6 py-2.5 bg-white text-slate-600 border border-slate-200 rounded-2xl hover:bg-slate-50 font-black text-[10px] tracking-widest transition-all disabled:opacity-50 shadow-sm"
                    >
                        <RefreshCw size={14} className={refreshing ? "animate-spin" : ""} />
                        REFRESH
                    </button>
                    <button
                        onClick={handleExport}
                        className="flex items-center gap-2 px-6 py-2.5 bg-emerald-600 text-white rounded-2xl font-black text-[10px] tracking-widest hover:bg-emerald-700 transition-all shadow-lg shadow-emerald-100"
                    >
                        <Download size={14} /> EXPORT CSV
                    </button>
                </div>
            </div>

            {/* Insight Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                {[
                    { label: 'YTD Total Investment', value: formatCurrency(totalYTD), icon: DollarSign, color: 'text-indigo-600', bg: 'bg-indigo-50' },
                    { label: 'Avg Monthly Spend', value: formatCurrency(avgMonthly), icon: TrendingUp, color: 'text-emerald-600', bg: 'bg-emerald-50' },
                    { label: 'Top Allocation', value: topCategory?.label || '-', sub: formatCurrency(topCategory?.val || 0), icon: PieChart, color: 'text-amber-600', bg: 'bg-amber-50' },
                    { label: 'Year Analysis', value: year, sub: 'Calendar Period', icon: Calendar, color: 'text-blue-600', bg: 'bg-blue-50' }
                ].map((stat, i) => (
                    <div key={i} className="bg-white p-6 rounded-[32px] border border-slate-100 shadow-sm flex items-center gap-5 group hover:border-indigo-100 transition-all duration-300">
                        <div className={`p-4 ${stat.bg} ${stat.color} rounded-2xl group-hover:scale-110 transition-transform duration-500`}>
                            <stat.icon size={24} strokeWidth={2.5} />
                        </div>
                        <div>
                            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">{stat.label}</p>
                            <p className="text-xl font-black text-slate-900 leading-none">{stat.value}</p>
                            {stat.sub && <p className="text-[10px] font-bold text-slate-400 mt-1 uppercase">{stat.sub}</p>}
                        </div>
                    </div>
                ))}
            </div>

            {/* Global Filter Bar */}
            <div className="bg-white p-6 rounded-[32px] shadow-sm border border-slate-100 flex flex-row items-center gap-6 overflow-x-auto no-scrollbar">
                <div className="flex items-center gap-3 flex-nowrap min-w-max">
                    <div className="flex items-center gap-2 bg-slate-50 p-1 rounded-2xl border border-slate-100">
                        <div className="w-10 h-10 flex items-center justify-center bg-white rounded-xl shadow-sm text-slate-400">
                            <Calendar size={16} />
                        </div>
                        <select
                            value={year}
                            onChange={(e) => setYear(parseInt(e.target.value))}
                            className="bg-transparent px-3 py-2 rounded-xl font-black text-slate-600 text-[10px] outline-none tracking-widest cursor-pointer min-w-[120px]"
                        >
                            {Array.from({ length: Math.max(1, new Date().getFullYear() - 2026 + 1) }, (_, i) => 2026 + i).map(y => <option key={y} value={y}>{y}</option>)}
                        </select>
                    </div>

                    <div className="flex items-center gap-2 bg-slate-50 p-1 rounded-2xl border border-slate-100">
                        <div className="w-10 h-10 flex items-center justify-center bg-white rounded-xl shadow-sm text-slate-400">
                            <Building2 size={16} />
                        </div>
                        <select
                            value={selectedBranch}
                            onChange={(e) => setSelectedBranch(e.target.value)}
                            className="bg-transparent px-3 py-2 rounded-xl font-black text-slate-600 text-[10px] outline-none tracking-widest cursor-pointer min-w-[180px]"
                        >
                            <option value="All">ALL BRANCHES</option>
                            {branchesList.map(b => <option key={b} value={b}>{b.toUpperCase()}</option>)}
                        </select>
                    </div>
                </div>
                <div className="ml-auto flex items-center gap-2 text-[10px] font-black text-slate-400 uppercase tracking-widest bg-slate-50 px-4 py-2 rounded-xl border border-slate-100">
                    <Filter size={14} /> FILTERS ACTIVE
                </div>
            </div>

            {/* Main Report Table */}
            <div className="bg-white rounded-[32px] shadow-sm border border-slate-100 overflow-hidden">
                <table className="w-full text-left border-collapse table-fixed">
                    <thead className="bg-slate-50 text-[9px] font-black text-slate-400 uppercase tracking-widest">
                        <tr>
                            <th className="px-5 py-5 w-[140px]">Month</th>
                            <th className="px-5 py-5 text-right">Internal</th>
                            <th className="px-5 py-5 text-right">Reading</th>
                            <th className="px-5 py-5 text-right">External</th>
                            <th className="px-5 py-5 text-right">Cert. Inc</th>
                            <th className="px-5 py-5 text-right bg-indigo-50/50 text-indigo-700 w-[160px]">Grand Total</th>
                            <th className="px-5 py-5 text-center w-[80px]">Audit</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                        {monthlyData.map((row) => (
                            <tr key={row.month} className="hover:bg-slate-50 transition-colors group">
                                <td className="px-5 py-4">
                                    <p className="font-black text-slate-800 text-xs">{row.month.toUpperCase()}</p>
                                </td>
                                <td className="px-5 py-4 text-right font-mono text-slate-500 font-bold text-[11px]">
                                    {row.internalTraining > 0 ? formatCurrency(row.internalTraining) : <span className="opacity-20">-</span>}
                                </td>
                                <td className="px-5 py-4 text-right font-mono text-slate-500 font-bold text-[11px]">
                                    {row.readingIncentive > 0 ? formatCurrency(row.readingIncentive) : <span className="opacity-20">-</span>}
                                </td>
                                <td className="px-5 py-4 text-right font-mono text-slate-500 font-bold text-[11px]">
                                    {row.externalTraining > 0 ? formatCurrency(row.externalTraining) : <span className="opacity-20">-</span>}
                                </td>
                                <td className="px-5 py-4 text-right font-mono text-slate-500 font-bold text-[11px]">
                                    {row.certIncentive > 0 ? formatCurrency(row.certIncentive) : <span className="opacity-20">-</span>}
                                </td>
                                <td className="px-5 py-4 text-right font-mono text-slate-900 font-black text-xs bg-indigo-50/20">
                                    {formatCurrency(row.total)}
                                </td>
                                <td className="px-5 py-4 text-center">
                                    <button
                                        onClick={() => setDetailMonth(row.month)}
                                        className="p-2 bg-white border border-slate-200 text-slate-400 hover:text-indigo-600 hover:border-indigo-600 rounded-xl transition-all shadow-sm"
                                    >
                                        <Eye size={16} />
                                    </button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                    <tfoot className="bg-slate-900 text-white font-black uppercase tracking-widest text-[9px]">
                        <tr>
                            <td className="px-5 py-6">YTD TOTAL</td>
                            <td className="px-5 py-6 text-right text-[10px]">{formatCurrency(monthlyData.reduce((a, b) => a + b.internalTraining, 0))}</td>
                            <td className="px-5 py-6 text-right text-[10px]">{formatCurrency(monthlyData.reduce((a, b) => a + b.readingIncentive, 0))}</td>
                            <td className="px-5 py-6 text-right text-[10px]">{formatCurrency(monthlyData.reduce((a, b) => a + b.externalTraining, 0))}</td>
                            <td className="px-5 py-6 text-right text-[10px]">{formatCurrency(monthlyData.reduce((a, b) => a + b.certIncentive, 0))}</td>
                            <td className="px-5 py-6 text-right text-sm font-black bg-indigo-600">{formatCurrency(totalYTD)}</td>
                            <td></td>
                        </tr>
                    </tfoot>
                </table>
            </div>

            {/* Detail Modal */}
            {detailMonth && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-slate-900/60 backdrop-blur-md animate-in fade-in duration-300">
                    <div className="bg-white rounded-[50px] shadow-2xl w-full max-w-6xl overflow-hidden flex flex-col max-h-[90vh] animate-in zoom-in-95 duration-300">
                        <div className="p-12 border-b border-slate-50 flex justify-between items-center bg-white">
                            <div>
                                <h2 className="font-black text-2xl text-slate-900 tracking-tight flex items-center gap-4">
                                    <div className="w-10 h-10 rounded-xl bg-indigo-100 text-indigo-600 flex items-center justify-center"><PieChart size={20} /></div>
                                    Monthly Audit Hub • {detailMonth.toUpperCase()} {year}
                                </h2>
                                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-1 ml-14">Consolidated Ledger Overview • {selectedBranch.toUpperCase()}</p>
                            </div>
                            <button onClick={() => setDetailMonth(null)} className="p-4 hover:bg-slate-100 rounded-3xl text-slate-300 transition-colors"><XCircle size={32} /></button>
                        </div>

                        <div className="overflow-y-auto p-12 bg-slate-50/30">
                            {details.length === 0 ? (
                                <div className="text-center py-32 bg-white rounded-[40px] border-2 border-dashed border-slate-100">
                                    <Layers className="mx-auto text-slate-200 mb-4" size={48} />
                                    <p className="text-sm font-black text-slate-400 uppercase tracking-[0.2em]">Zero transactions found for this period</p>
                                </div>
                            ) : (
                                <div className="bg-white rounded-[40px] shadow-sm border border-slate-100 overflow-hidden">
                                    <table className="w-full text-left">
                                        <thead className="bg-slate-50 text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">
                                            <tr>
                                                <th className="px-8 py-6">Timestamp</th>
                                                <th className="px-8 py-6">Categorization</th>
                                                <th className="px-8 py-6">Transaction Item</th>
                                                <th className="px-8 py-6">Professional PIC</th>
                                                <th className="px-8 py-6 text-right">Net Amount</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-50">
                                            {details.map((tx, idx) => (
                                                <tr key={idx} className="hover:bg-slate-50 transition-colors">
                                                    <td className="px-8 py-6">
                                                        <span className="text-[11px] font-bold text-slate-400 uppercase tracking-tighter">
                                                            {new Date(tx.date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}
                                                        </span>
                                                    </td>
                                                    <td className="px-8 py-6">
                                                        <span className={`px-3 py-1.5 rounded-xl text-[9px] font-black uppercase tracking-wider border
                                                            ${tx.category.includes('Internal') ? 'bg-indigo-50 text-indigo-700 border-indigo-100' :
                                                                tx.category.includes('External') ? 'bg-amber-50 text-amber-700 border-amber-100' :
                                                                    'bg-emerald-50 text-emerald-700 border-emerald-100'}`}>
                                                            {tx.category}
                                                        </span>
                                                    </td>
                                                    <td className="px-8 py-6">
                                                        <p className="font-black text-slate-800 text-sm leading-tight">{tx.item}</p>
                                                        <p className="text-[9px] font-bold text-slate-400 mt-1 italic leading-tight">{tx.details}</p>
                                                    </td>
                                                    <td className="px-8 py-6 font-bold text-slate-600 text-xs uppercase">{tx.pic || 'SYSTEM'}</td>
                                                    <td className="px-8 py-6 text-right font-mono font-black text-slate-900 text-base">{formatCurrency(tx.amount)}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                        <tfoot className="bg-slate-50 font-black border-t border-slate-100 text-right">
                                            <tr>
                                                <td colSpan={4} className="px-8 py-6 text-slate-400 text-[10px] tracking-widest">MONTHLY AGGREGATE</td>
                                                <td className="px-8 py-6 text-indigo-600 text-xl">{formatCurrency(details.reduce((a, b) => a + b.amount, 0))}</td>
                                            </tr>
                                        </tfoot>
                                    </table>
                                </div>
                            )}
                        </div>

                        <div className="p-10 border-t border-slate-50 bg-white text-right">
                            <button onClick={() => setDetailMonth(null)} className="px-10 py-4 bg-slate-900 text-white rounded-[24px] font-black text-xs tracking-widest hover:bg-black transition-all shadow-xl shadow-slate-200">
                                CLOSE AUDIT HUB
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default HRReportGenerator;
