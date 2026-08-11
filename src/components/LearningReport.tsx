import { useState, useEffect, useMemo, useCallback } from 'react';
import * as XLSX from 'xlsx';
import { Users, Globe, Video, BookOpen, Clock, Wallet, Download, Loader2, CheckCircle2, XCircle, FileQuestion, CalendarRange, UsersRound, ChevronDown } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { API_BASE_URL } from '../config';

interface LearningStatDetail {
    title: string;
    date: string;
    hours: number;
    cost: number;
    // Internal training only
    preTestScore?: number | null;
    postTestScore?: number | null;
    feedbackSubmitted?: boolean;
    // Organizer / certificate metadata (availability varies by category)
    organizer?: string | null;
    certificateLink?: string | null;
}

export interface LearningStats {
    totalJam: number;
    totalBiaya: number;
    jamTraining: number;
    jamTrainingExternal: number;
    jamOnline: number;
    jamBuku: number;
    biayaTraining: number;
    biayaTrainingExternal: number;
    biayaBuku: number;
    trainingDetails: LearningStatDetail[];
    trainingExternalDetails: LearningStatDetail[];
    onlineDetails: LearningStatDetail[];
    bookDetails: LearningStatDetail[];
}

export const EMPTY_STATS: LearningStats = {
    totalJam: 0, totalBiaya: 0,
    jamTraining: 0, jamTrainingExternal: 0, jamOnline: 0, jamBuku: 0,
    biayaTraining: 0, biayaTrainingExternal: 0, biayaBuku: 0,
    trainingDetails: [], trainingExternalDetails: [], onlineDetails: [], bookDetails: []
};

const formatHoursMinutes = (value: number, t: (key: string) => string) => {
    const totalMinutes = Math.round(value * 60);
    const h = Math.floor(totalMinutes / 60);
    const m = totalMinutes % 60;
    if (h > 0 && m > 0) return `${h} ${t('hours')} ${m} ${t('minutes')}`;
    if (h > 0) return `${h} ${t('hours')}`;
    return `${m} ${t('minutes')}`;
};

export const formatDate = (dateStr: string) => {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr || '-';
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
};

const dayOfMonth = (dateStr: string) => {
    const d = new Date(dateStr);
    return isNaN(d.getTime()) ? '' : d.getDate();
};

const monthOfYear = (dateStr: string) => {
    const d = new Date(dateStr);
    return isNaN(d.getTime()) ? '' : d.getMonth() + 1;
};

const toDateInputValue = (date: Date) => {
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
};

export const getDefaultRange = () => {
    const today = new Date();
    const jan1 = new Date(today.getFullYear(), 0, 1);
    return { startDate: toDateInputValue(jan1), endDate: toDateInputValue(today) };
};

export const buildSections = (stats: LearningStats, t: (key: string) => string) => [
    {
        key: 'trainingExternal',
        label: t('sections.trainingExternal'),
        icon: <Globe size={16} />,
        color: 'text-purple-600',
        bg: 'bg-purple-50',
        items: stats.trainingExternalDetails,
        hours: stats.jamTrainingExternal,
        cost: stats.biayaTrainingExternal,
        emptyLabel: t('sections.emptyTrainingExternal')
    },
    {
        key: 'training',
        label: t('sections.training'),
        icon: <Users size={16} />,
        color: 'text-blue-600',
        bg: 'bg-blue-50',
        items: stats.trainingDetails,
        hours: stats.jamTraining,
        cost: stats.biayaTraining,
        emptyLabel: t('sections.emptyTraining')
    },
    {
        key: 'online',
        label: t('sections.online'),
        icon: <Video size={16} />,
        color: 'text-emerald-600',
        bg: 'bg-emerald-50',
        items: stats.onlineDetails,
        hours: stats.jamOnline,
        cost: 0,
        emptyLabel: t('sections.emptyOnline')
    },
    {
        key: 'reading',
        label: t('sections.reading'),
        icon: <BookOpen size={16} />,
        color: 'text-orange-600',
        bg: 'bg-orange-50',
        items: stats.bookDetails,
        hours: stats.jamBuku,
        cost: stats.biayaBuku,
        emptyLabel: t('sections.emptyReading')
    }
];

interface EmployeeRecord {
    id_employee: string;
    full_name: string;
    email?: string;
    id_report_to?: string;
}

interface TeamMemberSummary {
    employeeId: string;
    name: string;
    email?: string;
    stats: LearningStats;
    isSelf?: boolean;
}

interface LearningReportProps {
    userEmail?: string;
    userName?: string;
    userEmployeeId?: string;
    isSupervisor?: boolean;
}

const LearningReport = ({ userEmail, userName, userEmployeeId, isSupervisor }: LearningReportProps) => {
    const { t } = useTranslation('learningReport');
    const [stats, setStats] = useState<LearningStats>(EMPTY_STATS);
    const [loading, setLoading] = useState(true);
    const [{ startDate, endDate }, setRange] = useState(getDefaultRange);

    const [viewMode, setViewMode] = useState<'me' | 'team'>('me');
    const [teamMembers, setTeamMembers] = useState<TeamMemberSummary[]>([]);
    const [teamLoading, setTeamLoading] = useState(false);

    useEffect(() => {
        if (!userEmail) return;
        const params = new URLSearchParams({ email: userEmail });
        if (startDate) params.set('startDate', startDate);
        if (endDate) params.set('endDate', endDate);
        fetch(`${API_BASE_URL}/api/learning-stats?${params.toString()}`)
            .then(res => res.json())
            .then(data => {
                if (!data.error) setStats(data);
            })
            .catch(err => console.error('Error fetching learning stats:', err))
            .finally(() => setLoading(false));
    }, [userEmail, startDate, endDate]);

    const fetchTeam = useCallback(async () => {
        setTeamLoading(true);
        try {
            const empRes = await fetch(`${API_BASE_URL}/api/employees`);
            const employees: EmployeeRecord[] = await empRes.json();

            const supervisorId = userEmployeeId || '___INVALID___';
            const supervisorName = userName || '___INVALID___';
            const supervisorEmailPrefix = userEmail ? userEmail.split('@')[0] : '___INVALID___';
            const supervisorEmailFull = userEmail || '___INVALID___';

            const subordinates = (employees || []).filter(emp => {
                const reportsTo = emp.id_report_to;
                if (!reportsTo) return false;
                return reportsTo === supervisorId ||
                    reportsTo === supervisorName ||
                    reportsTo.toLowerCase() === supervisorEmailPrefix.toLowerCase() ||
                    reportsTo.toLowerCase() === supervisorEmailFull.toLowerCase();
            });

            const rangeParams = new URLSearchParams();
            if (startDate) rangeParams.set('startDate', startDate);
            if (endDate) rangeParams.set('endDate', endDate);

            const fetchMemberStats = async (email?: string, employeeId?: string): Promise<LearningStats> => {
                const memberParams = new URLSearchParams(rangeParams);
                if (employeeId) memberParams.set('employee_id', employeeId);
                if (email) memberParams.set('email', email);
                if (!employeeId && !email) return EMPTY_STATS;
                try {
                    const r = await fetch(`${API_BASE_URL}/api/learning-stats?${memberParams.toString()}`);
                    const data = await r.json();
                    return data.error ? EMPTY_STATS : data;
                } catch {
                    return EMPTY_STATS;
                }
            };

            const [selfStats, subordinateResults] = await Promise.all([
                fetchMemberStats(userEmail, userEmployeeId),
                Promise.all(subordinates.map(async (emp): Promise<TeamMemberSummary> => ({
                    employeeId: emp.id_employee,
                    name: emp.full_name,
                    email: emp.email,
                    stats: await fetchMemberStats(emp.email, emp.id_employee)
                })))
            ]);

            subordinateResults.sort((a, b) => a.name.localeCompare(b.name));
            setTeamMembers([
                { employeeId: userEmployeeId || '___self___', name: userName || '', email: userEmail, stats: selfStats, isSelf: true },
                ...subordinateResults
            ]);
        } catch (err) {
            console.error('Error fetching team learning stats:', err);
        } finally {
            setTeamLoading(false);
        }
    }, [userEmployeeId, userName, userEmail, startDate, endDate]);

    useEffect(() => {
        if (viewMode === 'team') fetchTeam();
    }, [viewMode, fetchTeam]);

    const sections = useMemo(() => buildSections(stats, t), [stats, t]);

    const handleExport = () => {
        const rows = sections.flatMap(section =>
            section.items.map(item => ({
                [t('export.categoryColumn')]: section.label,
                [t('export.titleColumn')]: item.title,
                [t('export.dateColumn')]: formatDate(item.date),
                [t('export.hoursColumn')]: item.hours,
                [t('export.costColumn')]: item.cost,
                [t('export.preTestColumn')]: section.key === 'training' ? (item.preTestScore ?? t('export.notTaken')) : '',
                [t('export.postTestColumn')]: section.key === 'training' ? (item.postTestScore ?? t('export.notTaken')) : '',
                [t('export.feedbackColumn')]: section.key === 'training' ? (item.feedbackSubmitted ? t('export.submitted') : t('export.notSubmitted')) : ''
            }))
        );
        rows.push({
            [t('export.categoryColumn')]: t('export.grandTotalRow'),
            [t('export.titleColumn')]: '',
            [t('export.dateColumn')]: '',
            [t('export.hoursColumn')]: stats.totalJam,
            [t('export.costColumn')]: stats.totalBiaya,
            [t('export.preTestColumn')]: '',
            [t('export.postTestColumn')]: '',
            [t('export.feedbackColumn')]: ''
        });

        const ws = XLSX.utils.json_to_sheet(rows);
        ws['!cols'] = [{ wch: 20 }, { wch: 45 }, { wch: 14 }, { wch: 12 }, { wch: 18 }, { wch: 12 }, { wch: 12 }, { wch: 14 }];
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, t('export.sheetName'));
        XLSX.writeFile(wb, `Learning_Report_${(userName || 'Employee').replace(/\s+/g, '_')}_${startDate}_to_${endDate}.xlsx`);
    };

    const handleExportTeam = () => {
        const rows = teamMembers.flatMap(member => {
            const sections = buildSections(member.stats, t);
            return sections.flatMap(section =>
                section.items.map(item => ({
                    [t('team.export.nameColumn')]: member.name,
                    [t('team.export.typeColumn')]: t(`team.export.type.${section.key}`),
                    [t('team.export.materialTitleColumn')]: item.title,
                    [t('team.export.materialLinkColumn')]: '',
                    [t('team.export.certificateLinkColumn')]: section.key === 'trainingExternal' ? (item.certificateLink || '') : '',
                    [t('team.export.organizerColumn')]: item.organizer || '',
                    [t('team.export.dateColumn')]: dayOfMonth(item.date),
                    [t('team.export.monthColumn')]: monthOfYear(item.date),
                    [t('team.export.durationColumn')]: item.hours,
                    [t('team.export.preTestColumn')]: item.preTestScore ?? '',
                    [t('team.export.postTestColumn')]: item.postTestScore ?? '',
                    [t('team.export.costColumn')]: item.cost || '',
                    [t('team.export.feedbackColumn')]: section.key === 'training' ? (item.feedbackSubmitted ? t('export.submitted') : t('export.notSubmitted')) : ''
                }))
            );
        });

        const ws = XLSX.utils.json_to_sheet(rows);
        ws['!cols'] = [
            { wch: 24 }, { wch: 10 }, { wch: 40 }, { wch: 30 }, { wch: 30 },
            { wch: 20 }, { wch: 10 }, { wch: 8 }, { wch: 14 }, { wch: 10 },
            { wch: 10 }, { wch: 14 }, { wch: 16 }
        ];
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, t('team.export.sheetName'));
        XLSX.writeFile(wb, `Team_Learning_Report_${(userName || 'Team').replace(/\s+/g, '_')}_${startDate}_to_${endDate}.xlsx`);
    };

    const showRoster = viewMode === 'team';

    return (
        <div className="p-4 sm:p-6 lg:p-8 space-y-6 max-w-6xl mx-auto">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-black text-slate-800 tracking-tight">
                        {showRoster ? t('team.title') : t('title')}
                    </h1>
                    <p className="text-slate-400 text-sm font-medium mt-1">
                        {showRoster ? t('team.subtitle', { name: userName || '' }) : t('subtitle', { name: userName || '' })}
                    </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                    {isSupervisor && (
                        <button
                            onClick={() => setViewMode(viewMode === 'me' ? 'team' : 'me')}
                            className={`inline-flex items-center gap-2 font-bold px-5 py-3 rounded-xl transition-all border ${viewMode === 'team' ? 'bg-slate-800 text-white border-slate-800' : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'}`}
                        >
                            <UsersRound size={18} /> {viewMode === 'team' ? t('team.myReportButton') : t('team.myTeamsButton')}
                        </button>
                    )}
                    <button
                        onClick={showRoster ? handleExportTeam : handleExport}
                        disabled={showRoster ? (teamLoading || teamMembers.length === 0) : loading}
                        className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white font-bold px-5 py-3 rounded-xl shadow-lg shadow-blue-200 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        <Download size={18} /> {t('exportButton')}
                    </button>
                </div>
            </div>

            {/* Date Range Filter */}
            <div className="bg-white border border-slate-100 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center gap-3">
                <div className="flex items-center gap-2 text-slate-400 shrink-0">
                    <CalendarRange size={16} />
                    <span className="text-xs font-black uppercase tracking-widest">{t('filter.label')}</span>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                    <input
                        type="date"
                        value={startDate}
                        max={endDate}
                        onChange={e => setRange(prev => ({ ...prev, startDate: e.target.value }))}
                        className="border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                    <span className="text-slate-400 text-sm">{t('filter.to')}</span>
                    <input
                        type="date"
                        value={endDate}
                        min={startDate}
                        onChange={e => setRange(prev => ({ ...prev, endDate: e.target.value }))}
                        className="border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                </div>
                <button
                    onClick={() => setRange(getDefaultRange())}
                    className="text-xs font-bold text-blue-600 hover:text-blue-700 sm:ml-auto"
                >
                    {t('filter.reset')}
                </button>
            </div>

            {showRoster ? (
                teamLoading ? (
                    <div className="flex flex-col items-center justify-center py-24 text-slate-400">
                        <Loader2 className="animate-spin mb-3" size={32} />
                        <p>{t('team.loading')}</p>
                    </div>
                ) : teamMembers.filter(m => !m.isSelf).length === 0 ? (
                    <div className="bg-white border border-slate-100 rounded-3xl p-16 text-center text-slate-400">
                        <UsersRound size={40} className="mx-auto mb-3 opacity-40" />
                        <p>{t('team.noSubordinates')}</p>
                    </div>
                ) : (
                    <TeamRoster members={teamMembers} t={t} />
                )
            ) : loading ? (
                <div className="flex flex-col items-center justify-center py-24 text-slate-400">
                    <Loader2 className="animate-spin mb-3" size={32} />
                    <p>{t('loading')}</p>
                </div>
            ) : (
                <LearningStatsBreakdown stats={stats} t={t} />
            )}
        </div>
    );
};

interface LearningStatsBreakdownProps {
    stats: LearningStats;
    t: (key: string) => string;
}

export const LearningStatsBreakdown = ({ stats, t }: LearningStatsBreakdownProps) => {
    const sections = buildSections(stats, t);

    return (
        <>
            {/* Grand Total Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="bg-gradient-to-br from-blue-600 to-indigo-700 text-white rounded-3xl p-6 shadow-lg shadow-blue-200/50 relative overflow-hidden">
                    <Clock className="absolute -right-4 -bottom-4 opacity-10" size={100} />
                    <div className="relative z-10">
                        <div className="text-[11px] font-bold text-blue-100 uppercase tracking-widest mb-2 opacity-80">{t('totalHours')}</div>
                        <div className="text-3xl font-black tracking-tight">{formatHoursMinutes(stats.totalJam, t)}</div>
                    </div>
                </div>
                <div className="bg-white border border-slate-100 rounded-3xl p-6 shadow-sm relative overflow-hidden">
                    <Wallet className="absolute -right-4 -bottom-4 opacity-5 text-slate-800" size={100} />
                    <div className="relative z-10">
                        <div className="text-[11px] font-bold text-slate-400 uppercase tracking-widest mb-2">{t('totalCost')}</div>
                        <div className="text-3xl font-black tracking-tight text-slate-800">Rp {stats.totalBiaya.toLocaleString('id-ID')}</div>
                    </div>
                </div>
            </div>

            {/* Category Summary Cards */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                {sections.map(section => (
                    <div key={section.key} className="bg-white border border-slate-100 rounded-2xl p-5 shadow-sm">
                        <div className={`w-10 h-10 rounded-xl ${section.bg} ${section.color} flex items-center justify-center mb-3`}>
                            {section.icon}
                        </div>
                        <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">{section.label}</p>
                        <p className="text-lg font-black text-slate-800">{section.hours} {t('hours')}</p>
                        {section.key !== 'online' && (
                            <p className="text-xs text-slate-400 font-semibold mt-0.5">Rp {section.cost.toLocaleString('id-ID')}</p>
                        )}
                    </div>
                ))}
            </div>

            {/* Detail Sections */}
            <div className="space-y-6">
                {sections.map(section => (
                    <div key={section.key} className="bg-white border border-slate-100 rounded-3xl shadow-sm overflow-hidden">
                        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
                            <div className="flex items-center gap-2 text-slate-700">
                                <span className={section.color}>{section.icon}</span>
                                <span className="text-sm font-black uppercase tracking-widest">{section.label}</span>
                            </div>
                            <span className="text-xs font-bold text-slate-400">
                                {section.hours} {t('hours')}{section.key !== 'online' ? ` · Rp ${section.cost.toLocaleString('id-ID')}` : ''}
                            </span>
                        </div>
                        {section.items.length === 0 ? (
                            <p className="text-sm text-slate-400 italic px-6 py-6">{section.emptyLabel}</p>
                        ) : (
                            <div className="divide-y divide-slate-50">
                                {section.items.map((item, idx) => (
                                    <div key={idx} className="flex items-center justify-between gap-4 px-6 py-3">
                                        <div className="min-w-0 flex-1">
                                            <p className="font-semibold text-slate-700 text-sm truncate">{item.title}</p>
                                            <p className="text-[11px] text-slate-400">{formatDate(item.date)}</p>
                                            {section.key === 'training' && (
                                                <div className="flex flex-wrap gap-1.5 mt-2">
                                                    <ScoreBadge label={t('assessment.preTest')} score={item.preTestScore} />
                                                    <ScoreBadge label={t('assessment.postTest')} score={item.postTestScore} />
                                                    <FeedbackBadge submitted={!!item.feedbackSubmitted} t={t} />
                                                </div>
                                            )}
                                        </div>
                                        <div className="text-right shrink-0">
                                            <p className="font-bold text-slate-700 text-sm">{item.hours} {t('hours')}</p>
                                            {item.cost > 0 && <p className="text-[11px] text-slate-400">Rp {item.cost.toLocaleString('id-ID')}</p>}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                ))}
            </div>
        </>
    );
};

interface LearningStatsTableProps {
    stats: LearningStats;
    t: (key: string) => string;
}

const LearningStatsTable = ({ stats, t }: LearningStatsTableProps) => {
    const sections = buildSections(stats, t);
    const rows = sections.flatMap(section =>
        section.items.map(item => ({ ...item, categoryLabel: section.label, categoryKey: section.key }))
    );

    return (
        <div className="bg-white border border-slate-100 rounded-2xl shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
                <table className="w-full text-sm">
                    <thead>
                        <tr className="bg-slate-50 border-b border-slate-100">
                            <th className="text-left font-bold text-slate-500 uppercase tracking-wider text-[11px] px-4 py-3">{t('table.category')}</th>
                            <th className="text-left font-bold text-slate-500 uppercase tracking-wider text-[11px] px-4 py-3">{t('table.title')}</th>
                            <th className="text-left font-bold text-slate-500 uppercase tracking-wider text-[11px] px-4 py-3">{t('table.date')}</th>
                            <th className="text-right font-bold text-slate-500 uppercase tracking-wider text-[11px] px-4 py-3">{t('table.hours')}</th>
                            <th className="text-right font-bold text-slate-500 uppercase tracking-wider text-[11px] px-4 py-3">{t('table.cost')}</th>
                            <th className="text-center font-bold text-slate-500 uppercase tracking-wider text-[11px] px-4 py-3">{t('table.preTest')}</th>
                            <th className="text-center font-bold text-slate-500 uppercase tracking-wider text-[11px] px-4 py-3">{t('table.postTest')}</th>
                            <th className="text-center font-bold text-slate-500 uppercase tracking-wider text-[11px] px-4 py-3">{t('table.feedback')}</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                        {rows.length === 0 ? (
                            <tr>
                                <td colSpan={8} className="text-center text-slate-400 italic py-8">{t('table.noData')}</td>
                            </tr>
                        ) : rows.map((item, idx) => (
                            <tr key={idx} className="hover:bg-slate-50/60">
                                <td className="px-4 py-3 text-slate-500 text-xs font-semibold whitespace-nowrap">{item.categoryLabel}</td>
                                <td className="px-4 py-3 text-slate-700 font-medium">{item.title}</td>
                                <td className="px-4 py-3 text-slate-400 text-xs whitespace-nowrap">{formatDate(item.date)}</td>
                                <td className="px-4 py-3 text-right text-slate-700 font-semibold whitespace-nowrap">{item.hours} {t('hours')}</td>
                                <td className="px-4 py-3 text-right text-slate-500 whitespace-nowrap">{item.cost > 0 ? `Rp ${item.cost.toLocaleString('id-ID')}` : '-'}</td>
                                <td className="px-4 py-3 text-center text-slate-500 whitespace-nowrap">{item.categoryKey === 'training' ? (item.preTestScore ?? '-') : '-'}</td>
                                <td className="px-4 py-3 text-center text-slate-500 whitespace-nowrap">{item.categoryKey === 'training' ? (item.postTestScore ?? '-') : '-'}</td>
                                <td className="px-4 py-3 text-center whitespace-nowrap">
                                    {item.categoryKey === 'training' ? (
                                        item.feedbackSubmitted
                                            ? <CheckCircle2 size={14} className="inline text-emerald-600" />
                                            : <XCircle size={14} className="inline text-slate-300" />
                                    ) : '-'}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                    {rows.length > 0 && (
                        <tfoot>
                            <tr className="bg-slate-50 border-t border-slate-100 font-bold">
                                <td className="px-4 py-3 text-slate-700" colSpan={3}>{t('table.total')}</td>
                                <td className="px-4 py-3 text-right text-slate-800 whitespace-nowrap">{formatHoursMinutes(stats.totalJam, t)}</td>
                                <td className="px-4 py-3 text-right text-slate-800 whitespace-nowrap">Rp {stats.totalBiaya.toLocaleString('id-ID')}</td>
                                <td colSpan={3}></td>
                            </tr>
                        </tfoot>
                    )}
                </table>
            </div>
        </div>
    );
};

const ScoreBadge = ({ label, score }: { label: string; score?: number | null }) => {
    const taken = score !== undefined && score !== null;
    return (
        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold ${taken ? 'bg-blue-50 text-blue-700' : 'bg-slate-100 text-slate-400'}`}>
            {taken ? <CheckCircle2 size={11} /> : <FileQuestion size={11} />}
            {label}{taken ? `: ${score}` : ''}
        </span>
    );
};

const FeedbackBadge = ({ submitted, t }: { submitted: boolean; t: (key: string) => string }) => (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold ${submitted ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-400'}`}>
        {submitted ? <CheckCircle2 size={11} /> : <XCircle size={11} />}
        {t('assessment.feedback')}{submitted ? '' : `: ${t('assessment.notSubmitted')}`}
    </span>
);

interface TeamRosterProps {
    members: TeamMemberSummary[];
    t: (key: string) => string;
}

const TeamRoster = ({ members, t }: TeamRosterProps) => {
    const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
    const toggleExpanded = (employeeId: string) => {
        setExpandedIds(prev => {
            const next = new Set(prev);
            if (next.has(employeeId)) next.delete(employeeId);
            else next.add(employeeId);
            return next;
        });
    };

    const teamTotalHours = Math.round(members.reduce((sum, m) => sum + m.stats.totalJam, 0) * 100) / 100;
    const teamTotalCost = members.reduce((sum, m) => sum + m.stats.totalBiaya, 0);

    return (
        <>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="bg-gradient-to-br from-slate-800 to-slate-900 text-white rounded-3xl p-6 shadow-lg relative overflow-hidden">
                    <UsersRound className="absolute -right-4 -bottom-4 opacity-10" size={100} />
                    <div className="relative z-10">
                        <div className="text-[11px] font-bold text-slate-300 uppercase tracking-widest mb-2 opacity-80">{t('team.totalMembers')}</div>
                        <div className="text-3xl font-black tracking-tight">{members.length}</div>
                    </div>
                </div>
                <div className="bg-gradient-to-br from-blue-600 to-indigo-700 text-white rounded-3xl p-6 shadow-lg shadow-blue-200/50 relative overflow-hidden">
                    <Clock className="absolute -right-4 -bottom-4 opacity-10" size={100} />
                    <div className="relative z-10">
                        <div className="text-[11px] font-bold text-blue-100 uppercase tracking-widest mb-2 opacity-80">{t('totalHours')}</div>
                        <div className="text-3xl font-black tracking-tight">{teamTotalHours} {t('hours')}</div>
                    </div>
                </div>
                <div className="bg-white border border-slate-100 rounded-3xl p-6 shadow-sm relative overflow-hidden">
                    <Wallet className="absolute -right-4 -bottom-4 opacity-5 text-slate-800" size={100} />
                    <div className="relative z-10">
                        <div className="text-[11px] font-bold text-slate-400 uppercase tracking-widest mb-2">{t('totalCost')}</div>
                        <div className="text-2xl font-black tracking-tight text-slate-800">Rp {teamTotalCost.toLocaleString('id-ID')}</div>
                    </div>
                </div>
            </div>

            <div className="bg-white border border-slate-100 rounded-3xl shadow-sm overflow-hidden">
                <div className="px-6 py-4 border-b border-slate-100">
                    <span className="text-sm font-black uppercase tracking-widest text-slate-700">{t('team.rosterTitle')}</span>
                </div>
                <div className="divide-y divide-slate-50">
                    {members.map(member => {
                        const isExpanded = expandedIds.has(member.employeeId);
                        return (
                            <div key={member.employeeId}>
                                <button
                                    onClick={() => toggleExpanded(member.employeeId)}
                                    className="w-full flex items-center justify-between gap-4 px-6 py-4 hover:bg-slate-50 transition-colors text-left"
                                >
                                    <div className="min-w-0">
                                        <p className="font-semibold text-slate-700 text-sm truncate flex items-center gap-2">
                                            {member.name}
                                            {member.isSelf && (
                                                <span className="shrink-0 text-[10px] font-bold uppercase tracking-wider bg-blue-50 text-blue-600 px-1.5 py-0.5 rounded-full">{t('team.youBadge')}</span>
                                            )}
                                        </p>
                                        <p className="text-[11px] text-slate-400 truncate">
                                            {t('sections.training')}: {member.stats.jamTraining}{t('hours')} · {t('sections.online')}: {member.stats.jamOnline}{t('hours')} · {t('sections.reading')}: {member.stats.jamBuku}{t('hours')}
                                        </p>
                                    </div>
                                    <div className="flex items-center gap-3 shrink-0">
                                        <div className="text-right">
                                            <p className="font-bold text-slate-700 text-sm">{member.stats.totalJam} {t('hours')}</p>
                                            <p className="text-[11px] text-slate-400">Rp {member.stats.totalBiaya.toLocaleString('id-ID')}</p>
                                        </div>
                                        <ChevronDown size={16} className={`text-slate-300 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                                    </div>
                                </button>
                                {isExpanded && (
                                    <div className="bg-slate-50 px-6 py-6 border-t border-slate-100">
                                        <LearningStatsTable stats={member.stats} t={t} />
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            </div>
        </>
    );
};

export default LearningReport;
