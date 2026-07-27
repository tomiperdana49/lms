import { useState, useEffect } from 'react';
import { Download, Layers, Eye, XCircle, RefreshCw, Filter, Calendar, Building2, TrendingUp, DollarSign, PieChart } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { API_BASE_URL } from '../config';
import type { TrainingRequest, Meeting, Incentive, ReadingLogEntry } from '../types';
import * as XLSX from 'xlsx';

const HRReportGenerator = () => {
    const { t } = useTranslation('hrReportGenerator');
    // Data State
    const [requests, setRequests] = useState<TrainingRequest[]>([]);
    const [externalRequests, setExternalRequests] = useState<any[]>([]);
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
    // Positional keys mapping to translation entries (months array order never changes)
    const monthKeys = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];
    const monthLabel = (idx: number) => t(`months.${monthKeys[idx]}`);

    const [refreshing, setRefreshing] = useState(false);

    const fetchData = async () => {
        setRefreshing(true);
        try {
            const [reqRes, meetRes, incRes, logsRes, empRes, extRes] = await Promise.all([
                fetch(`${API_BASE_URL}/api/training`),
                fetch(`${API_BASE_URL}/api/meetings`),
                fetch(`${API_BASE_URL}/api/incentives`),
                fetch(`${API_BASE_URL}/api/logs`),
                fetch(`${API_BASE_URL}/api/employees`),
                fetch(`${API_BASE_URL}/api/external-training/all`)
            ]);

            if (reqRes.ok) setRequests(await reqRes.json());
            if (meetRes.ok) setMeetings(await meetRes.json());
            if (incRes.ok) setIncentives(await incRes.json());
            if (logsRes.ok) setLogs(await logsRes.json());
            if (empRes.ok) setEmployees(await empRes.json());
            if (extRes.ok) setExternalRequests(await extRes.json());
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

    // Branch filter must be resolved via the record's owning employee (employee_id -> employees.branch_name),
    // not the free-text `location` field on meetings/logs/requests (e.g. meeting room address), which is
    // unrelated to company branch and left empty most of the time.
    const matchesBranch = (employeeId?: string | null) => {
        if (selectedBranch === 'All') return true;
        if (!employeeId) return false;
        const emp = employees.find(e => e.id_employee === employeeId);
        return emp?.branch_name === selectedBranch;
    };

    // Meetings have no reliable host employee_id (host is stored as a free-text name), so branch
    // relevance is resolved from the meeting's participant list instead: a meeting counts toward a
    // branch if at least one invited/attending employee belongs to it.
    const meetingMatchesBranch = (m: Meeting) => {
        if (selectedBranch === 'All') return true;
        const ids = (m.costReport?.attendee_ids?.length ? m.costReport.attendee_ids : m.guests?.employee_ids) || [];
        return ids.some(id => employees.find(e => e.id_employee === id)?.branch_name === selectedBranch);
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
            if (!meetingMatchesBranch(m)) return;
            if (m.costReport && m.costReport.isPaid && isInPeriod(m.date, range)) {
                internalTraining += (
                    safeNum(m.costReport.trainerIncentive ?? (m.costReport as any).trainer) +
                    safeNum(m.costReport.snackCost ?? (m.costReport as any).snack) +
                    safeNum(m.costReport.lunchCost ?? (m.costReport as any).lunch) +
                    safeNum(m.costReport.otherCost ?? (m.costReport as any).other) +
                    (safeNum(m.costReport.audienceFee) * safeNum(m.costReport.participantsCount))
                );
            }
        });

        logs.filter(l => l.hrApprovalStatus === 'Approved' && l.incentiveAmount).forEach(l => {
            if (!matchesBranch(l.employee_id)) return;
            const dateToCheck = l.claimedAt || l.approvedAt || l.finishDate || l.date;
            if (isInPeriod(dateToCheck, range)) {
                readingIncentive += safeNum(l.incentiveAmount);
            }
        });

        requests.filter(r => r.status === 'APPROVED').forEach(r => {
            if (!matchesBranch(r.employee_id)) return;
            if (isInPeriod(r.date, range)) {
                externalTraining += safeNum(r.cost) + safeNum(r.additionalCost);
            }
        });
        
        externalRequests.filter(r => r.status === 'Processed').forEach(r => {
            if (!matchesBranch(r.employee_id)) return;
            const dateToCheck = r.updated_at || r.created_at || r.start_date;
            if (isInPeriod(dateToCheck, range)) {
                externalTraining += safeNum(r.registration_fee) + safeNum(r.travel_flight_cost) + safeNum(r.accommodation_cost) + safeNum(r.miscellaneous_cost);
            }
        });

        incentives.filter(i => ['Active', 'Paid'].includes(i.status)).forEach(i => {
            if (!matchesBranch(i.employee_id)) return;
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
        { label: t('categories.internal'), val: monthlyData.reduce((s, m) => s + m.internalTraining, 0) },
        { label: t('categories.external'), val: monthlyData.reduce((s, m) => s + m.externalTraining, 0) },
        { label: t('categories.reading'), val: monthlyData.reduce((s, m) => s + m.readingIncentive, 0) },
        { label: t('categories.cert'), val: monthlyData.reduce((s, m) => s + m.certIncentive, 0) }
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
            if (!meetingMatchesBranch(m)) return;
            if (m.costReport && m.costReport.isPaid && isInPeriod(m.date, range)) {
                const trainerInc = safeNum(m.costReport.trainerIncentive ?? (m.costReport as any).trainer);
                const snackC = safeNum(m.costReport.snackCost ?? (m.costReport as any).snack);
                const lunchC = safeNum(m.costReport.lunchCost ?? (m.costReport as any).lunch);
                const otherC = safeNum(m.costReport.otherCost ?? (m.costReport as any).other);
                const audFee = safeNum(m.costReport.audienceFee);

                const total = trainerInc + snackC + lunchC + otherC + (audFee * safeNum(m.costReport.participantsCount));

                const details = [];
                if (snackC) details.push(t('transactions.snackDetail', { amount: formatCurrency(snackC) }));
                if (lunchC) details.push(t('transactions.lunchDetail', { amount: formatCurrency(lunchC) }));
                if (trainerInc) details.push(t('transactions.trainerDetail', { amount: formatCurrency(trainerInc) }));
                if (audFee) details.push(t('transactions.audienceDetail', { amount: formatCurrency(audFee) }));
                if (otherC) details.push(t('transactions.otherDetail', { amount: formatCurrency(otherC) }));

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
            if (!matchesBranch(l.employee_id)) return;
            const dateToCheck = l.claimedAt || l.approvedAt || l.finishDate || l.date;
            if (isInPeriod(dateToCheck, range)) {
                txs.push({
                    date: dateToCheck,
                    category: 'Reading Incentive',
                    item: l.title,
                    pic: l.userName || t('transactions.unknown'),
                    details: t('transactions.categoryDetail', { category: l.category }),
                    amount: safeNum(l.incentiveAmount)
                });
            }
        });

        requests.filter(r => r.status === 'APPROVED').forEach(r => {
            if (!matchesBranch(r.employee_id)) return;
            if (isInPeriod(r.date, range)) {
                const details = [t('transactions.mainCostDetail', { amount: formatCurrency(r.cost || 0) })];
                if (r.additionalCost) details.push(t('transactions.additionalDetail', { amount: formatCurrency(r.additionalCost) }));

                txs.push({
                    date: r.date,
                    category: 'External Training',
                    item: r.title,
                    pic: r.employeeName || t('transactions.unknown'),
                    details: details.join(', '),
                    amount: safeNum(r.cost) + safeNum(r.additionalCost)
                });
            }
        });

        externalRequests.filter(r => r.status === 'Processed').forEach(r => {
            if (!matchesBranch(r.employee_id)) return;
            const dateToCheck = r.updated_at || r.created_at || r.start_date;
            if (isInPeriod(dateToCheck, range)) {
                const details = [t('transactions.registrationDetail', { amount: formatCurrency(safeNum(r.registration_fee)) })];
                if (safeNum(r.travel_flight_cost)) details.push(t('transactions.travelDetail', { amount: formatCurrency(safeNum(r.travel_flight_cost)) }));
                if (safeNum(r.accommodation_cost)) details.push(t('transactions.accommodationDetail', { amount: formatCurrency(safeNum(r.accommodation_cost)) }));
                if (safeNum(r.miscellaneous_cost)) details.push(t('transactions.miscDetail', { amount: formatCurrency(safeNum(r.miscellaneous_cost)) }));

                txs.push({
                    date: dateToCheck,
                    category: 'External Training',
                    item: r.title,
                    pic: r.employee_name || t('transactions.unknown'),
                    details: details.join(', '),
                    amount: safeNum(r.registration_fee) + safeNum(r.travel_flight_cost) + safeNum(r.accommodation_cost) + safeNum(r.miscellaneous_cost)
                });
            }
        });

        incentives.filter(i => ['Active', 'Paid'].includes(i.status)).forEach(i => {
            if (!matchesBranch(i.employee_id)) return;
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
                    details: t('transactions.statusRewardDetail', { status: i.status, amount: formatCurrency(safeNum(i.reward)) }),
                    amount: safeNum(i.reward)
                });
            }
        });

        return txs.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    };

    // Maps the internal (English, logic-bearing) category identifier to a translated display label.
    // The identifier itself must stay untranslated because it drives the color-coding below.
    const categoryLabel = (category: string) => {
        if (category === 'Internal Training') return t('transactions.internalTraining');
        if (category === 'Reading Incentive') return t('transactions.readingIncentive');
        if (category === 'External Training') return t('transactions.externalTraining');
        if (category.startsWith('Cert. Incentive')) {
            return category.includes('One-Time') ? t('transactions.certIncentiveOneTime') : t('transactions.certIncentiveRecurring');
        }
        return category;
    };

    const handleExport = () => {
        try {
            const totalInternal = monthlyData.reduce((a, b) => a + b.internalTraining, 0);
            const totalReading = monthlyData.reduce((a, b) => a + b.readingIncentive, 0);
            const totalExternal = monthlyData.reduce((a, b) => a + b.externalTraining, 0);
            const totalCert = monthlyData.reduce((a, b) => a + b.certIncentive, 0);
            const totalGrand = monthlyData.reduce((a, b) => a + b.total, 0);

            const noCol = t('export.noColumn');
            const monthCol = t('export.monthColumn');
            const internalCol = t('export.internalTrainingColumn');
            const readingCol = t('export.readingIncentivesColumn');
            const externalCol = t('export.externalTrainingColumn');
            const certCol = t('export.certIncentivesColumn');
            const grandTotalCol = t('export.grandTotalColumn');

            const dataToExport = [
                ...monthlyData.map((row, idx) => ({
                    [noCol]: idx + 1,
                    [monthCol]: monthLabel(idx).toUpperCase(),
                    [internalCol]: row.internalTraining,
                    [readingCol]: row.readingIncentive,
                    [externalCol]: row.externalTraining,
                    [certCol]: row.certIncentive,
                    [grandTotalCol]: row.total
                })),
                {
                    [noCol]: null as any,
                    [monthCol]: t('export.ytdTotalRow'),
                    [internalCol]: totalInternal,
                    [readingCol]: totalReading,
                    [externalCol]: totalExternal,
                    [certCol]: totalCert,
                    [grandTotalCol]: totalGrand
                }
            ];

            const ws = XLSX.utils.json_to_sheet(dataToExport);

            const colsWidths = [
                { wch: 6 },   // No.
                { wch: 15 },  // Month
                { wch: 22 },  // Internal Training
                { wch: 22 },  // Reading Incentives
                { wch: 22 },  // External Training
                { wch: 22 },  // Cert. Incentives
                { wch: 22 }   // Grand Total
            ];
            ws['!cols'] = colsWidths;

            const wb = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(wb, ws, t('export.sheetName'));
            XLSX.writeFile(wb, `L&D_Report_${year}_${selectedBranch.replace(/\s+/g, '_')}.xlsx`);
        } catch (error) {
            console.error('Failed to export XLSX', error);
            alert(t('export.failedAlert'));
        }
    };

    const details = detailMonth !== null ? getDetailTransactions(months.indexOf(detailMonth)) : [];
    const detailMonthLabel = detailMonth !== null ? monthLabel(months.indexOf(detailMonth)) : '';

    return (
        <div className="space-y-10 animate-fade-in max-w-[1600px] mx-auto py-6">
            {/* Professional Header */}
            <div className="flex flex-col xl:flex-row justify-between items-start xl:items-center gap-6">
                <div>
                    <h1 className="text-4xl font-black text-slate-900 tracking-tight flex items-center gap-4">
                        <Layers className="text-indigo-600" size={32} />
                        {t('header.title')}
                    </h1>
                    <p className="text-slate-400 font-bold uppercase tracking-widest text-[10px] mt-1 ml-12">{t('header.subtitle')}</p>
                </div>

                <div className="flex items-center gap-3">
                    <button
                        onClick={fetchData}
                        disabled={refreshing}
                        className="flex items-center gap-2 px-6 py-2.5 bg-white text-slate-600 border border-slate-200 rounded-2xl hover:bg-slate-50 font-black text-[10px] tracking-widest transition-all disabled:opacity-50 shadow-sm"
                    >
                        <RefreshCw size={14} className={refreshing ? "animate-spin" : ""} />
                        {t('header.refresh')}
                    </button>
                    <button
                        onClick={handleExport}
                        className="flex items-center gap-2 px-6 py-2.5 bg-emerald-600 text-white rounded-2xl font-black text-[10px] tracking-widest hover:bg-emerald-700 transition-all shadow-lg shadow-emerald-100"
                    >
                        <Download size={14} /> {t('header.exportXlsx')}
                    </button>
                </div>
            </div>

            {/* Insight Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                {[
                    { label: t('stats.ytdTotalInvestment'), value: formatCurrency(totalYTD), icon: DollarSign, color: 'text-indigo-600', bg: 'bg-indigo-50' },
                    { label: t('stats.avgMonthlySpend'), value: formatCurrency(avgMonthly), icon: TrendingUp, color: 'text-emerald-600', bg: 'bg-emerald-50' },
                    { label: t('stats.topAllocation'), value: topCategory?.label || '-', sub: formatCurrency(topCategory?.val || 0), icon: PieChart, color: 'text-amber-600', bg: 'bg-amber-50' },
                    { label: t('stats.yearAnalysis'), value: year, sub: t('stats.calendarPeriod'), icon: Calendar, color: 'text-blue-600', bg: 'bg-blue-50' }
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
                            <option value="All">{t('filters.allBranches')}</option>
                            {branchesList.map(b => <option key={b} value={b}>{b.toUpperCase()}</option>)}
                        </select>
                    </div>
                </div>
                <div className="ml-auto flex items-center gap-2 text-[10px] font-black text-slate-400 uppercase tracking-widest bg-slate-50 px-4 py-2 rounded-xl border border-slate-100">
                    <Filter size={14} /> {t('filters.filtersActive')}
                </div>
            </div>

            {/* Main Report Table */}
            <div className="bg-white rounded-[32px] shadow-sm border border-slate-100 overflow-hidden">
                <table className="w-full text-left border-collapse table-fixed">
                    <thead className="bg-slate-50 text-[9px] font-black text-slate-400 uppercase tracking-widest">
                        <tr>
                            <th className="px-5 py-5 w-[140px]">{t('table.month')}</th>
                            <th className="px-5 py-5 text-right">{t('table.internal')}</th>
                            <th className="px-5 py-5 text-right">{t('table.reading')}</th>
                            <th className="px-5 py-5 text-right">{t('table.external')}</th>
                            <th className="px-5 py-5 text-right">{t('table.certInc')}</th>
                            <th className="px-5 py-5 text-right bg-indigo-50/50 text-indigo-700 w-[160px]">{t('table.grandTotal')}</th>
                            <th className="px-5 py-5 text-center w-[80px]">{t('table.audit')}</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                        {monthlyData.map((row, idx) => (
                            <tr key={row.month} className="hover:bg-slate-50 transition-colors group">
                                <td className="px-5 py-4">
                                    <p className="font-black text-slate-800 text-xs">{monthLabel(idx).toUpperCase()}</p>
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
                            <td className="px-5 py-6">{t('table.ytdTotal')}</td>
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
                                    {t('modal.header', { month: detailMonthLabel.toUpperCase(), year })}
                                </h2>
                                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-1 ml-14">{t('modal.subtitle', { branch: selectedBranch.toUpperCase() })}</p>
                            </div>
                            <button onClick={() => setDetailMonth(null)} className="p-4 hover:bg-slate-100 rounded-3xl text-slate-300 transition-colors"><XCircle size={32} /></button>
                        </div>

                        <div className="overflow-y-auto p-12 bg-slate-50/30">
                            {details.length === 0 ? (
                                <div className="text-center py-32 bg-white rounded-[40px] border-2 border-dashed border-slate-100">
                                    <Layers className="mx-auto text-slate-200 mb-4" size={48} />
                                    <p className="text-sm font-black text-slate-400 uppercase tracking-[0.2em]">{t('modal.noTransactions')}</p>
                                </div>
                            ) : (
                                <div className="bg-white rounded-[40px] shadow-sm border border-slate-100 overflow-hidden">
                                    <table className="w-full text-left">
                                        <thead className="bg-slate-50 text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">
                                            <tr>
                                                <th className="px-8 py-6">{t('modal.timestamp')}</th>
                                                <th className="px-8 py-6">{t('modal.categorization')}</th>
                                                <th className="px-8 py-6">{t('modal.transactionItem')}</th>
                                                <th className="px-8 py-6">{t('modal.professionalPic')}</th>
                                                <th className="px-8 py-6 text-right">{t('modal.netAmount')}</th>
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
                                                            {categoryLabel(tx.category)}
                                                        </span>
                                                    </td>
                                                    <td className="px-8 py-6">
                                                        <p className="font-black text-slate-800 text-sm leading-tight">{tx.item}</p>
                                                        <p className="text-[9px] font-bold text-slate-400 mt-1 italic leading-tight">{tx.details}</p>
                                                    </td>
                                                    <td className="px-8 py-6 font-bold text-slate-600 text-xs uppercase">{tx.pic || t('modal.system')}</td>
                                                    <td className="px-8 py-6 text-right font-mono font-black text-slate-900 text-base">{formatCurrency(tx.amount)}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                        <tfoot className="bg-slate-50 font-black border-t border-slate-100 text-right">
                                            <tr>
                                                <td colSpan={4} className="px-8 py-6 text-slate-400 text-[10px] tracking-widest">{t('modal.monthlyAggregate')}</td>
                                                <td className="px-8 py-6 text-indigo-600 text-xl">{formatCurrency(details.reduce((a, b) => a + b.amount, 0))}</td>
                                            </tr>
                                        </tfoot>
                                    </table>
                                </div>
                            )}
                        </div>

                        <div className="p-10 border-t border-slate-50 bg-white text-right">
                            <button onClick={() => setDetailMonth(null)} className="px-10 py-4 bg-slate-900 text-white rounded-[24px] font-black text-xs tracking-widest hover:bg-black transition-all shadow-xl shadow-slate-200">
                                {t('modal.closeAuditHub')}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default HRReportGenerator;
