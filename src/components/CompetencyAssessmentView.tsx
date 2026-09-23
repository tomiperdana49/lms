import { Fragment, useState, useEffect, useMemo } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { API_BASE_URL } from '../config';
import type { CompetencyTemplate, CompetencyStandardOverride } from '../types';
import CompetencyScaleLegend from './CompetencyScaleLegend';
import { KNOWN_SECTION_TYPES, buildPeriodOptions, getMatchedCompetencies, groupByType, computeSummary, type Period } from '../utils/competency';

export const parsePeriodString = (value?: string | null): Period | null => {
    if (!value) return null;
    const [quarter, year] = value.split('-').map(Number);
    return quarter && year ? { quarter, year } : null;
};

interface CompetencyAssessmentViewProps {
    employeeId: string;
    isSupervisor?: boolean;
    initialPeriod?: string | null;
    onLoadError?: () => void;
}

// Read-only "Standard vs. Actual" competency table for one employee/quarter - shared by "My
// Competency" (viewing yourself) and HR's Competency Overview (viewing any employee).
const CompetencyAssessmentView = ({ employeeId, isSupervisor, initialPeriod, onLoadError }: CompetencyAssessmentViewProps) => {
    const { t } = useTranslation('competencyTeam');
    const [templates, setTemplates] = useState<CompetencyTemplate[]>([]);
    const [overrides, setOverrides] = useState<CompetencyStandardOverride[]>([]);
    const [jobPosition, setJobPosition] = useState<string | null>(null);
    const [selectedQuarter, setSelectedQuarter] = useState(() => parsePeriodString(initialPeriod)?.quarter ?? Math.ceil((new Date().getMonth() + 1) / 3));
    const [selectedYear, setSelectedYear] = useState(() => parsePeriodString(initialPeriod)?.year ?? new Date().getFullYear());
    const [isLoading, setIsLoading] = useState(true);
    const [scores, setScores] = useState<Record<number, number>>({});
    const [hasSubmitted, setHasSubmitted] = useState(false);
    const [assessedByName, setAssessedByName] = useState<string | null>(null);
    const [previousTotal, setPreviousTotal] = useState<number | null>(null);
    const [previousPeriod, setPreviousPeriod] = useState<Period | null>(null);
    const [notes, setNotes] = useState('');
    const [expandedCompetencyIds, setExpandedCompetencyIds] = useState<Set<number>>(new Set());
    const periodOptions = useMemo(buildPeriodOptions, []);

    // Re-applies when a caller changes initialPeriod (e.g. a new notification click) while this
    // view is already mounted - a prop change alone wouldn't otherwise touch the lazily
    // initialized state above.
    useEffect(() => {
        const period = parsePeriodString(initialPeriod);
        if (period) {
            setSelectedQuarter(period.quarter);
            setSelectedYear(period.year);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [initialPeriod]);

    useEffect(() => {
        setIsLoading(true);
        const fetchData = async () => {
            if (!employeeId) {
                setIsLoading(false);
                return;
            }
            try {
                const [profileRes, templatesRes, overridesRes] = await Promise.all([
                    fetch(`${API_BASE_URL}/api/employees/${employeeId}`),
                    fetch(`${API_BASE_URL}/api/competency-templates`),
                    fetch(`${API_BASE_URL}/api/competency-standard-overrides`)
                ]);
                if (profileRes.ok) {
                    const data = await profileRes.json();
                    setJobPosition(data.jobPosition || '');
                }
                if (templatesRes.ok) {
                    const data = await templatesRes.json();
                    if (Array.isArray(data)) setTemplates(data);
                }
                if (overridesRes.ok) {
                    const data = await overridesRes.json();
                    if (Array.isArray(data)) setOverrides(data);
                }
            } catch (err) {
                console.error(err);
                onLoadError?.();
            } finally {
                setIsLoading(false);
            }
        };
        fetchData();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [employeeId]);

    const matchedCompetencies = useMemo(
        () => jobPosition !== null
            ? getMatchedCompetencies({ jobPosition, isSupervisor: !!isSupervisor }, templates, overrides)
            : [],
        [jobPosition, templates, overrides, isSupervisor]
    );

    useEffect(() => {
        if (!employeeId || jobPosition === null) return;
        const fetchAssessment = async () => {
            try {
                const res = await fetch(`${API_BASE_URL}/api/competency-assessments/latest?employee_id=${employeeId}&quarter=${selectedQuarter}&year=${selectedYear}`);
                if (res.ok) {
                    const data = await res.json();
                    const current: Record<string, number> = data.current || {};
                    const initial: Record<number, number> = {};
                    matchedCompetencies.forEach(c => {
                        if (current[c.id] !== undefined) initial[c.id] = Number(current[c.id]);
                    });
                    setScores(initial);
                    setHasSubmitted(!!data.isLocked);
                    setAssessedByName(data.assessedByName ?? null);
                    setPreviousTotal(data.previousTotal !== null && data.previousTotal !== undefined ? Number(data.previousTotal) : null);
                    setPreviousPeriod(data.previousPeriod ?? null);
                    setNotes(data.notes ?? '');
                }
            } catch (err) {
                console.error(err);
            }
        };
        fetchAssessment();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [employeeId, selectedQuarter, selectedYear, matchedCompetencies]);

    const groupedCompetencies = useMemo(() => groupByType(matchedCompetencies), [matchedCompetencies]);
    const summary = computeSummary(matchedCompetencies, scores);

    const sectionLabel = (type: string) =>
        KNOWN_SECTION_TYPES.includes(type) ? t(`sectionHeaders.${type}`) : t('sectionHeaders.default', { type });

    const periodLabel = (p: Period) => t('period.name', { quarter: p.quarter, year: p.year });

    const toggleExpandCompetency = (id: number) => {
        setExpandedCompetencyIds(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id); else next.add(id);
            return next;
        });
    };

    if (isLoading) return <div className="p-8 text-center">{t('loading')}</div>;

    return (
        <div>
            <div className="mb-6 flex flex-wrap items-center justify-end gap-3">
                <select
                    value={`${selectedQuarter}-${selectedYear}`}
                    onChange={e => {
                        const [q, y] = e.target.value.split('-').map(Number);
                        setSelectedQuarter(q);
                        setSelectedYear(y);
                    }}
                    className="px-3 py-1.5 rounded-lg border border-slate-200 outline-none focus:ring-2 focus:ring-indigo-500 bg-white text-sm text-slate-700"
                >
                    {periodOptions.map(p => (
                        <option key={`${p.quarter}-${p.year}`} value={`${p.quarter}-${p.year}`}>
                            {periodLabel(p)}
                        </option>
                    ))}
                </select>
            </div>

            {!hasSubmitted ? (
                <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-8 text-center text-slate-500 italic">
                    {t('mine.noAssessmentYet')}
                </div>
            ) : (
                <div className="space-y-4">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                        <p className="text-sm text-slate-600">
                            {assessedByName ? t('mine.assessedBy', { name: assessedByName }) : ''}
                        </p>
                        <span className="text-xs font-bold px-2.5 py-1 rounded-lg bg-slate-200 text-slate-600">
                            {t('period.locked')}
                        </span>
                    </div>

                    <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-4 flex flex-wrap gap-6 text-sm">
                        <div>
                            <span className="text-slate-500">
                                {previousPeriod ? t('previousScoreFor', { period: periodLabel(previousPeriod) }) : t('previousScore')}:{' '}
                            </span>
                            <span className="font-semibold text-slate-800">{previousTotal ?? '-'}</span>
                        </div>
                    </div>

                    <CompetencyScaleLegend />

                    {Object.entries(groupedCompetencies).map(([type, comps]) => (
                        <div key={type} className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
                            <div className="bg-indigo-600 text-white font-bold text-xs px-4 py-2.5">
                                {sectionLabel(type)}
                            </div>
                            <table className="w-full text-sm table-fixed">
                                <colgroup>
                                    <col className="w-10" />
                                    <col />
                                    <col className="w-28" />
                                    <col className="w-20" />
                                    <col className="w-16" />
                                </colgroup>
                                <thead>
                                    <tr className="bg-slate-50 border-b border-slate-100 text-left font-semibold text-slate-600">
                                        <th className="p-3 text-center">{t('table.no')}</th>
                                        <th className="p-3">{t('table.competency')}</th>
                                        <th className="p-3 text-center">{t('table.standard')}</th>
                                        <th className="p-3 text-center">{t('table.actual')}</th>
                                        <th className="p-3 text-center">{t('table.gap')}</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-50">
                                    {comps.map((c, idx) => {
                                        const standard = c.standardScore ?? null;
                                        const actual = scores[c.id];
                                        const gap = (standard !== null && actual !== undefined) ? actual - standard : null;
                                        const isExpanded = expandedCompetencyIds.has(c.id);
                                        const hasDetails = !!(c.operationalDefinition || c.standardLevelIndicator || c.jdReference);
                                        return (
                                            <Fragment key={c.id}>
                                                <tr>
                                                    <td className="p-3 text-center text-slate-500">{idx + 1}</td>
                                                    <td className="p-3 font-medium text-slate-800 break-words">
                                                        {hasDetails ? (
                                                            <button
                                                                type="button"
                                                                onClick={() => toggleExpandCompetency(c.id)}
                                                                className="flex items-center gap-1.5 text-left hover:text-indigo-600"
                                                            >
                                                                {isExpanded ? <ChevronDown size={14} className="shrink-0 text-slate-400" /> : <ChevronRight size={14} className="shrink-0 text-slate-400" />}
                                                                {c.competencyName}
                                                            </button>
                                                        ) : c.competencyName}
                                                    </td>
                                                    <td className="p-3 text-center text-slate-600">{standard ?? '-'}</td>
                                                    <td className="p-3 text-center">
                                                        <span className="w-7 h-7 inline-flex items-center justify-center rounded-lg bg-indigo-100 text-indigo-700 text-xs font-bold">
                                                            {actual ?? '-'}
                                                        </span>
                                                    </td>
                                                    <td className={`p-3 text-center font-bold ${gap === null ? 'text-slate-400' : gap < 0 ? 'text-rose-600' : 'text-emerald-600'}`}>
                                                        {gap === null ? '-' : (gap > 0 ? `+${gap}` : gap)}
                                                    </td>
                                                </tr>
                                                {isExpanded && hasDetails && (
                                                    <tr>
                                                        <td></td>
                                                        <td colSpan={4} className="px-3 pb-4 pt-0 space-y-2 bg-slate-50/50 text-xs text-slate-600">
                                                            {c.operationalDefinition && (
                                                                <div>
                                                                    <span className="font-semibold text-slate-500">{t('table.operationalDefinition')}: </span>
                                                                    <span className="whitespace-pre-wrap">{c.operationalDefinition}</span>
                                                                </div>
                                                            )}
                                                            {c.standardLevelIndicator && (
                                                                <div>
                                                                    <span className="font-semibold text-slate-500">{t('table.standardLevelIndicator')}: </span>
                                                                    <span className="whitespace-pre-wrap">{c.standardLevelIndicator}</span>
                                                                </div>
                                                            )}
                                                            {c.jdReference && (
                                                                <div>
                                                                    <span className="font-semibold text-slate-500">{t('table.jdReference')}: </span>
                                                                    <span className="whitespace-pre-wrap">{c.jdReference}</span>
                                                                </div>
                                                            )}
                                                        </td>
                                                    </tr>
                                                )}
                                            </Fragment>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    ))}

                    <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-5 space-y-2 text-sm">
                        <div className="flex justify-between">
                            <span className="font-semibold text-slate-600">{t('summary.totalScore')}</span>
                            <span className="font-bold text-slate-800">{summary.totalActual} / {summary.totalStandard}</span>
                        </div>
                        <div className="flex justify-between">
                            <span className="font-semibold text-slate-600">{t('summary.achievementPercent')}</span>
                            <span className="font-bold text-slate-800">{summary.achievementPercent !== null ? `${summary.achievementPercent}%` : '-'}</span>
                        </div>
                        <div className="flex justify-between">
                            <span className="font-semibold text-slate-600">{t('summary.gapCount')}</span>
                            <span className="font-bold text-slate-800">{summary.gapCount}</span>
                        </div>
                        <div className="flex justify-between items-center">
                            <span className="font-semibold text-slate-600">{t('summary.readinessStatus')}</span>
                            <span className={`font-bold px-3 py-1 rounded-lg text-xs ${summary.readinessStatus === 'ready' ? 'bg-emerald-100 text-emerald-700' :
                                summary.readinessStatus === 'limitedDevelopment' ? 'bg-amber-100 text-amber-700' :
                                    'bg-rose-100 text-rose-700'
                                }`}>
                                {t(`status.${summary.readinessStatus}`)}
                            </span>
                        </div>
                    </div>

                    {notes && (
                        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-5 space-y-2">
                            <p className="text-sm font-semibold text-slate-600">{t('notes.label')}</p>
                            <p className="text-sm text-slate-700 whitespace-pre-wrap">{notes}</p>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};

export default CompetencyAssessmentView;
