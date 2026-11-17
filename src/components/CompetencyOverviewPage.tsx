import { useState, useEffect, useMemo } from 'react';
import { ArrowLeft, Search, Users } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { API_BASE_URL } from '../config';
import type { Role, TeamMember } from '../types';
import CompetencyAssessmentView from './CompetencyAssessmentView';
import PopupNotification from './PopupNotification';
import { buildPeriodOptions, getCurrentQuarter, getCurrentYear } from '../utils/competency';

type AssessmentStatus = 'assessed' | 'pending' | 'noForm';
type StatusFilter = 'all' | AssessmentStatus;

const STATUS_BADGE: Record<AssessmentStatus, string> = {
    assessed: 'bg-emerald-50 text-emerald-700',
    pending: 'bg-amber-50 text-amber-700',
    noForm: 'bg-slate-100 text-slate-500',
};

interface CompetencyOverviewPageProps {
    userRole: Role;
    onBack: () => void;
}

// HR-only, company-wide counterpart to CompetencyTeamPage (which is scoped to one leader's own
// reports): lets HR look up any employee and review their competency assessment read-only.
const CompetencyOverviewPage = ({ userRole, onBack }: CompetencyOverviewPageProps) => {
    const { t } = useTranslation('competencyTeam');
    const [employees, setEmployees] = useState<TeamMember[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [selected, setSelected] = useState<TeamMember | null>(null);
    const [notification, setNotification] = useState(false);
    const periodOptions = useMemo(buildPeriodOptions, []);
    const [period, setPeriod] = useState(`${getCurrentQuarter()}-${getCurrentYear()}`);
    const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
    const [assessedIds, setAssessedIds] = useState<Set<string> | null>(null);

    useEffect(() => {
        fetch(`${API_BASE_URL}/api/employees/directory`)
            .then(res => res.ok ? res.json() : Promise.reject(res))
            .then((data: TeamMember[]) => setEmployees(Array.isArray(data) ? data : []))
            .catch(err => { console.error(err); setNotification(true); })
            .finally(() => setIsLoading(false));
    }, []);

    useEffect(() => {
        const [quarter, year] = period.split('-');
        let cancelled = false;
        setAssessedIds(null);
        fetch(`${API_BASE_URL}/api/competency-assessments/assessed-employees?quarter=${quarter}&year=${year}`)
            .then(res => res.ok ? res.json() : Promise.reject(res))
            .then((ids: string[]) => { if (!cancelled) setAssessedIds(new Set(ids.map(String))); })
            .catch(err => { console.error(err); if (!cancelled) setNotification(true); });
        return () => { cancelled = true; };
    }, [period]);

    // null while the period's assessments are still loading
    const statusOf = (e: TeamMember): AssessmentStatus | null => {
        if (assessedIds?.has(String(e.employeeId))) return 'assessed';
        if (e.hasCompetencies === false) return 'noForm';
        return assessedIds ? 'pending' : null;
    };

    const searchedEmployees = useMemo(() => {
        const term = searchTerm.trim().toLowerCase();
        if (!term) return employees;
        return employees.filter(e =>
            e.fullName.toLowerCase().includes(term) ||
            e.employeeId.toLowerCase().includes(term) ||
            e.jobPosition?.toLowerCase().includes(term)
        );
    }, [employees, searchTerm]);

    const statusCounts = useMemo(() => {
        const counts: Record<StatusFilter, number> = { all: searchedEmployees.length, assessed: 0, pending: 0, noForm: 0 };
        if (assessedIds) searchedEmployees.forEach(e => { const s = statusOf(e); if (s) counts[s]++; });
        return counts;
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [searchedEmployees, assessedIds]);

    const filteredEmployees = statusFilter === 'all'
        ? searchedEmployees
        : searchedEmployees.filter(e => statusOf(e) === statusFilter);

    if (userRole !== 'HR' && userRole !== 'HR_ADMIN') {
        return <div className="p-8 text-center text-red-500">{t('allEmployees.accessDenied')}</div>;
    }

    return (
        <div className="max-w-6xl mx-auto py-6">
            <PopupNotification
                isOpen={notification}
                type="error"
                message={t('notifications.loadFailed')}
                onClose={() => setNotification(false)}
            />
            <button onClick={onBack} className="text-sm text-slate-500 hover:text-blue-600 flex items-center gap-1 mb-4 transition-colors">
                <ArrowLeft size={14} /> {t('backToDashboard')}
            </button>

            <div className="mb-6">
                <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
                    <Users className="text-indigo-600" /> {t('allEmployees.title')}
                </h1>
                <p className="text-sm text-slate-500 mt-1">{t('allEmployees.subtitle')}</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-[280px_1fr] gap-6 items-start">
                <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
                    <div className="p-3 border-b border-slate-100 space-y-2">
                        <select
                            value={period}
                            onChange={e => setPeriod(e.target.value)}
                            className="w-full px-3 py-1.5 rounded-lg border border-slate-200 outline-none focus:ring-2 focus:ring-indigo-500 bg-white text-sm text-slate-700"
                        >
                            {periodOptions.map(p => (
                                <option key={`${p.quarter}-${p.year}`} value={`${p.quarter}-${p.year}`}>
                                    {t('period.name', { quarter: p.quarter, year: p.year })}
                                </option>
                            ))}
                        </select>
                        <div className="relative">
                            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                            <input
                                type="text"
                                value={searchTerm}
                                onChange={e => setSearchTerm(e.target.value)}
                                placeholder={t('allEmployees.searchPlaceholder')}
                                className="w-full pl-8 pr-3 py-1.5 rounded-lg border border-slate-200 outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
                            />
                        </div>
                        <div className="flex flex-wrap gap-1.5">
                            {(['all', 'assessed', 'pending', 'noForm'] as StatusFilter[])
                                .filter(f => f !== 'noForm' || statusCounts.noForm > 0 || statusFilter === 'noForm')
                                .map(f => (
                                <button
                                    key={f}
                                    onClick={() => setStatusFilter(f)}
                                    disabled={f !== 'all' && !assessedIds}
                                    className={`px-2.5 py-1 rounded-full text-xs font-medium border transition-colors disabled:opacity-50 ${statusFilter === f ? 'bg-indigo-600 border-indigo-600 text-white' : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'}`}
                                >
                                    {t(`allEmployees.filter.${f}`)}{(f === 'all' || assessedIds) && ` (${statusCounts[f]})`}
                                </button>
                            ))}
                        </div>
                    </div>
                    <div className="max-h-[70vh] overflow-y-auto divide-y divide-slate-50">
                        {isLoading ? (
                            <p className="p-4 text-sm text-slate-400 text-center">{t('loading')}</p>
                        ) : filteredEmployees.length === 0 ? (
                            <p className="p-4 text-sm text-slate-400 text-center">{t('allEmployees.noResults')}</p>
                        ) : filteredEmployees.map(emp => {
                            const status = statusOf(emp);
                            return (
                            <button
                                key={emp.employeeId}
                                onClick={() => setSelected(emp)}
                                className={`w-full text-left px-4 py-2.5 hover:bg-slate-50 transition-colors ${selected?.employeeId === emp.employeeId ? 'bg-indigo-50' : ''}`}
                            >
                                <div className="flex items-start justify-between gap-2">
                                    <p className={`text-sm font-medium ${selected?.employeeId === emp.employeeId ? 'text-indigo-700' : 'text-slate-800'}`}>{emp.fullName}</p>
                                    {status && (
                                        <span className={`shrink-0 text-[10px] font-semibold px-1.5 py-0.5 rounded ${STATUS_BADGE[status]}`}>
                                            {t(`allEmployees.status.${status}`)}
                                        </span>
                                    )}
                                </div>
                                <p className="text-xs text-slate-400">{emp.jobPosition} &middot; {emp.employeeId}</p>
                            </button>
                            );
                        })}
                    </div>
                </div>

                <div>
                    {!selected ? (
                        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-8 text-center text-slate-500 italic">
                            {t('allEmployees.selectPrompt')}
                        </div>
                    ) : (
                        <>
                            <div className="mb-4">
                                <h2 className="text-lg font-bold text-slate-800">{selected.fullName}</h2>
                                <p className="text-sm text-slate-500">{selected.jobPosition} &middot; {t('employeeId')}: {selected.employeeId}</p>
                            </div>
                            {selected.hasCompetencies === false && (
                                <p className="mb-4 text-sm text-slate-500 italic">{t('allEmployees.noFormHint')}</p>
                            )}
                            <CompetencyAssessmentView
                                key={selected.employeeId}
                                employeeId={selected.employeeId}
                                isSupervisor={selected.isSupervisor}
                                initialPeriod={period}
                                onLoadError={() => setNotification(true)}
                            />
                        </>
                    )}
                </div>
            </div>
        </div>
    );
};

export default CompetencyOverviewPage;
