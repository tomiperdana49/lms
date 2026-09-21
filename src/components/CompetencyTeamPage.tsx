import { Fragment, useState, useEffect, useMemo, type FormEvent } from 'react';
import { UsersRound, Briefcase, Shield, ArrowLeft, ChevronDown, ChevronRight, Plus, Pencil, Trash2, BookOpen, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { API_BASE_URL } from '../config';
import type { User, TeamMember, CompetencyTemplate, CompetencyStandardOverride, CompetencyChangeRequest } from '../types';
import { KNOWN_SECTION_TYPES, buildPeriodOptions, getCurrentQuarter, getCurrentYear, getMatchedCompetencies, groupByType, computeSummary, type Period } from '../utils/competency';
import PopupNotification from './PopupNotification';
import ConfirmationModal from './ConfirmationModal';

const emptyTemplateForm = {
    competencyType: 'FUNCTIONAL',
    competencyName: '',
    operationalDefinition: '',
    standardLevelIndicator: '',
    jdReference: '',
    standardScore: ''
};

interface CompetencyTeamPageProps {
    currentUser: User | null;
}

type MemberScores = {
    current: Record<number, number>;
    previousTotal: number | null;
    previousPeriod: Period | null;
    notes: string | null;
};

const CompetencyTeamPage = ({ currentUser }: CompetencyTeamPageProps) => {
    const { t } = useTranslation('competencyTeam');
    const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
    const [templates, setTemplates] = useState<CompetencyTemplate[]>([]);
    const [overrides, setOverrides] = useState<CompetencyStandardOverride[]>([]);
    const [pendingRequests, setPendingRequests] = useState<CompetencyChangeRequest[]>([]);
    const [viewMode, setViewMode] = useState<'overview' | 'detail'>('overview');
    const [selectedEmployeeId, setSelectedEmployeeId] = useState<string | null>(null);
    const [selectedQuarter, setSelectedQuarter] = useState(getCurrentQuarter());
    const [selectedYear, setSelectedYear] = useState(getCurrentYear());
    const [isLoading, setIsLoading] = useState(true);
    const [actualScores, setActualScores] = useState<Record<number, number>>({});
    const [isLocked, setIsLocked] = useState(false);
    const [previousTotal, setPreviousTotal] = useState<number | null>(null);
    const [previousPeriod, setPreviousPeriod] = useState<Period | null>(null);
    const [notes, setNotes] = useState('');
    const [isSaving, setIsSaving] = useState(false);
    const [teamScores, setTeamScores] = useState<Record<string, MemberScores>>({});
    const [expandedCompetencyIds, setExpandedCompetencyIds] = useState<Set<number>>(new Set());
    const [isLoadingOverview, setIsLoadingOverview] = useState(false);
    const [notification, setNotification] = useState<{ show: boolean; type: 'success' | 'error'; message: string }>({ show: false, type: 'success', message: '' });
    const [isDictionaryOpen, setIsDictionaryOpen] = useState(false);
    const [dictionaryPosition, setDictionaryPosition] = useState<string | null>(null);
    const [standardModal, setStandardModal] = useState<{ source: CompetencyTemplate; value: string } | null>(null);
    const [isSavingStandard, setIsSavingStandard] = useState(false);
    const [templateModal, setTemplateModal] = useState<{ editing: CompetencyTemplate | null; position: string } | null>(null);
    const [templateForm, setTemplateForm] = useState(emptyTemplateForm);
    const [isSavingTemplate, setIsSavingTemplate] = useState(false);
    const [confirmConfig, setConfirmConfig] = useState<{ isOpen: boolean; title: string; message: string; onConfirm: () => void }>({ isOpen: false, title: '', message: '', onConfirm: () => {} });
    const periodOptions = useMemo(buildPeriodOptions, []);
    const managedPositions = useMemo(
        () => Array.from(new Set(teamMembers.map(m => m.jobPosition).filter(Boolean))).sort(),
        [teamMembers]
    );
    // CORE stays HR-authored (Umum, or a row HR made directly for this position) - a leader only
    // ever sees it here to adjust the Standard, never to add, remove, or edit the name/definition.
    const dictionaryCoreCompetencies = useMemo(
        () => dictionaryPosition
            ? getMatchedCompetencies({ jobPosition: dictionaryPosition, isSupervisor: false }, templates, overrides).filter(c => c.competencyType === 'CORE')
            : [],
        [dictionaryPosition, templates, overrides]
    );
    // FUNCTIONAL is fully owned by the position - a leader can add/edit/delete it outright, and
    // since it's the same competency_templates row HR sees, those changes are HR's changes too.
    const dictionaryFunctionalCompetencies = useMemo(
        () => dictionaryPosition ? templates.filter(tpl => tpl.position === dictionaryPosition && tpl.competencyType === 'FUNCTIONAL') : [],
        [dictionaryPosition, templates]
    );
    // No leader action here takes effect until HR approves it - these are still awaiting review.
    const pendingForTemplate = (id: number) => pendingRequests.find(r => r.targetTemplateId === id);
    const pendingForCoreStandard = (c: CompetencyTemplate) => pendingRequests.find(
        r => r.action === 'STANDARD_OVERRIDE' && r.position === dictionaryPosition && r.competencyType === c.competencyType && r.competencyName === c.competencyName
    );
    const pendingNewFunctionalCompetencies = useMemo(
        () => pendingRequests.filter(r => r.action === 'ADD' && r.position === dictionaryPosition && r.competencyType === 'FUNCTIONAL'),
        [pendingRequests, dictionaryPosition]
    );

    useEffect(() => {
        const fetchData = async () => {
            if (!currentUser?.employee_id) {
                setIsLoading(false);
                return;
            }
            try {
                const [membersRes, templatesRes, overridesRes, pendingRes] = await Promise.all([
                    fetch(`${API_BASE_URL}/api/team-members?leader_id=${currentUser.employee_id}`),
                    fetch(`${API_BASE_URL}/api/competency-templates`),
                    fetch(`${API_BASE_URL}/api/competency-standard-overrides`),
                    fetch(`${API_BASE_URL}/api/competency-change-requests?status=PENDING&requesterId=${currentUser.employee_id}`)
                ]);
                if (membersRes.ok) {
                    const data = await membersRes.json();
                    if (Array.isArray(data)) {
                        setTeamMembers(data);
                        if (data.length > 0) setSelectedEmployeeId(data[0].employeeId);
                    }
                }
                if (templatesRes.ok) {
                    const data = await templatesRes.json();
                    if (Array.isArray(data)) setTemplates(data);
                }
                if (overridesRes.ok) {
                    const data = await overridesRes.json();
                    if (Array.isArray(data)) setOverrides(data);
                }
                if (pendingRes.ok) {
                    const data = await pendingRes.json();
                    if (Array.isArray(data)) setPendingRequests(data);
                }
            } catch (err) {
                console.error(err);
                setNotification({ show: true, type: 'error', message: t('notifications.loadFailed') });
            } finally {
                setIsLoading(false);
            }
        };
        fetchData();
    }, [currentUser?.employee_id]);

    const selectedMember = teamMembers.find(m => m.employeeId === selectedEmployeeId) || null;

    const matchedCompetencies = useMemo(
        () => selectedMember ? getMatchedCompetencies(selectedMember, templates, overrides) : [],
        [selectedMember, templates, overrides]
    );

    // Grid overview groups team members that share the exact same competency set (i.e. the
    // same position) so each grid's rows stay aligned across its member columns.
    const overviewGroups = useMemo(() => {
        const byKey = new Map<string, { competencies: CompetencyTemplate[]; members: TeamMember[] }>();
        teamMembers.forEach(member => {
            const competencies = getMatchedCompetencies(member, templates, overrides);
            const key = competencies.map(c => c.id).join(',');
            if (!byKey.has(key)) byKey.set(key, { competencies, members: [] });
            byKey.get(key)!.members.push(member);
        });
        return Array.from(byKey.entries()).map(([key, value]) => ({ key, ...value }));
    }, [teamMembers, templates, overrides]);

    useEffect(() => {
        if (teamMembers.length === 0) return;
        let cancelled = false;
        const fetchAll = async () => {
            setIsLoadingOverview(true);
            try {
                const results = await Promise.all(teamMembers.map(async member => {
                    const res = await fetch(`${API_BASE_URL}/api/competency-assessments/latest?employee_id=${member.employeeId}&quarter=${selectedQuarter}&year=${selectedYear}`);
                    if (!res.ok) return null;
                    const data = await res.json();
                    const current: Record<number, number> = {};
                    Object.entries(data.current || {}).forEach(([k, v]) => { current[Number(k)] = Number(v); });
                    const scores: MemberScores = {
                        current,
                        previousTotal: data.previousTotal !== null && data.previousTotal !== undefined ? Number(data.previousTotal) : null,
                        previousPeriod: data.previousPeriod ?? null,
                        notes: data.notes ?? null
                    };
                    return [member.employeeId, scores] as const;
                }));
                if (!cancelled) {
                    const map: Record<string, MemberScores> = {};
                    results.forEach(entry => { if (entry) map[entry[0]] = entry[1]; });
                    setTeamScores(map);
                }
            } catch (err) {
                console.error(err);
            } finally {
                if (!cancelled) setIsLoadingOverview(false);
            }
        };
        fetchAll();
        return () => { cancelled = true; };
    }, [teamMembers, selectedQuarter, selectedYear]);

    useEffect(() => {
        if (!selectedMember) return;
        const fetchAssessment = async () => {
            try {
                const res = await fetch(`${API_BASE_URL}/api/competency-assessments/latest?employee_id=${selectedMember.employeeId}&quarter=${selectedQuarter}&year=${selectedYear}`);
                if (res.ok) {
                    const data = await res.json();
                    const current: Record<string, number> = data.current || {};
                    const initialScores: Record<number, number> = {};
                    matchedCompetencies.forEach(c => {
                        if (current[c.id] !== undefined) initialScores[c.id] = Number(current[c.id]);
                    });
                    setActualScores(initialScores);
                    setIsLocked(!!data.isLocked);
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
    }, [selectedMember?.employeeId, selectedQuarter, selectedYear, matchedCompetencies]);

    const groupedCompetencies = useMemo(() => groupByType(matchedCompetencies), [matchedCompetencies]);

    const sectionLabel = (type: string) =>
        KNOWN_SECTION_TYPES.includes(type) ? t(`sectionHeaders.${type}`) : t('sectionHeaders.default', { type });

    const summary = computeSummary(matchedCompetencies, actualScores);

    const handleSave = async () => {
        if (!selectedMember) return;
        const scores = matchedCompetencies
            .filter(c => actualScores[c.id] !== undefined)
            .map(c => ({ competencyTemplateId: c.id, actualScore: actualScores[c.id] }));
        if (scores.length === 0) return;
        setIsSaving(true);
        try {
            const res = await fetch(`${API_BASE_URL}/api/competency-assessments`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    employeeId: selectedMember.employeeId,
                    quarter: selectedQuarter,
                    year: selectedYear,
                    assessedByEmployeeId: currentUser?.employee_id,
                    assessedByName: currentUser?.name,
                    scores,
                    notes
                })
            });
            if (res.ok) {
                setNotification({ show: true, type: 'success', message: t('notifications.saveSuccess') });
                const latestRes = await fetch(`${API_BASE_URL}/api/competency-assessments/latest?employee_id=${selectedMember.employeeId}&quarter=${selectedQuarter}&year=${selectedYear}`);
                if (latestRes.ok) {
                    const data = await latestRes.json();
                    setIsLocked(!!data.isLocked);
                    setPreviousTotal(data.previousTotal !== null && data.previousTotal !== undefined ? Number(data.previousTotal) : null);
                    setPreviousPeriod(data.previousPeriod ?? null);
                    setNotes(data.notes ?? '');
                }
                setTeamScores(prev => ({
                    ...prev,
                    [selectedMember.employeeId]: {
                        current: { ...actualScores },
                        previousTotal: prev[selectedMember.employeeId]?.previousTotal ?? null,
                        previousPeriod: prev[selectedMember.employeeId]?.previousPeriod ?? null,
                        notes
                    }
                }));
            } else if (res.status === 409) {
                setIsLocked(true);
                setNotification({ show: true, type: 'error', message: t('notifications.periodLocked') });
            } else {
                setNotification({ show: true, type: 'error', message: t('notifications.saveFailed') });
            }
        } catch (err) {
            console.error(err);
            setNotification({ show: true, type: 'error', message: t('notifications.saveFailed') });
        } finally {
            setIsSaving(false);
        }
    };

    const periodLabel = (p: Period) => t('period.name', { quarter: p.quarter, year: p.year });

    const openDetail = (employeeId: string) => {
        setSelectedEmployeeId(employeeId);
        setViewMode('detail');
    };

    const toggleExpandCompetency = (id: number) => {
        setExpandedCompetencyIds(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id); else next.add(id);
            return next;
        });
    };

    const refetchOverrides = async () => {
        const res = await fetch(`${API_BASE_URL}/api/competency-standard-overrides`);
        if (res.ok) {
            const data = await res.json();
            if (Array.isArray(data)) setOverrides(data);
        }
    };

    const refetchPendingRequests = async () => {
        if (!currentUser?.employee_id) return;
        const res = await fetch(`${API_BASE_URL}/api/competency-change-requests?status=PENDING&requesterId=${currentUser.employee_id}`);
        if (res.ok) {
            const data = await res.json();
            if (Array.isArray(data)) setPendingRequests(data);
        }
    };

    const openDictionary = () => {
        setDictionaryPosition(prev => prev && managedPositions.includes(prev) ? prev : (managedPositions[0] ?? null));
        setIsDictionaryOpen(true);
    };

    const closeDictionary = () => setIsDictionaryOpen(false);

    // Every competency in the dictionary (CORE or FUNCTIONAL) is HR-authored: a leader may only
    // tune its Standard for their own position, never its name/definition, and never add or
    // delete one. This never touches the HR row itself - it writes to a separate overrides table
    // keyed by (position, type, name), so HR's own data and every other position stay untouched.
    const openStandardModal = (source: CompetencyTemplate) => {
        setStandardModal({
            source,
            value: source.standardScore !== null && source.standardScore !== undefined ? String(source.standardScore) : ''
        });
    };

    const closeStandardModal = () => setStandardModal(null);

    const handleSubmitStandardOverride = async (e: FormEvent) => {
        e.preventDefault();
        if (!standardModal || !dictionaryPosition) return;
        const { source, value } = standardModal;
        setIsSavingStandard(true);
        try {
            const res = await fetch(`${API_BASE_URL}/api/competency-standard-overrides`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    position: dictionaryPosition,
                    competencyType: source.competencyType,
                    competencyName: source.competencyName,
                    standardScore: value,
                    requesterId: currentUser?.employee_id
                })
            });
            if (res.ok) {
                const data = await res.json();
                if (data.pending) {
                    await refetchPendingRequests();
                    setNotification({ show: true, type: 'success', message: t('templateActions.submittedForApproval') });
                } else {
                    await refetchOverrides();
                    setNotification({ show: true, type: 'success', message: t('templateActions.updateSuccess') });
                }
                closeStandardModal();
            } else {
                const err = await res.json().catch(() => ({}));
                setNotification({ show: true, type: 'error', message: err.error || t('templateActions.saveFailed') });
            }
        } catch (err) {
            console.error(err);
            setNotification({ show: true, type: 'error', message: t('templateActions.saveFailed') });
        } finally {
            setIsSavingStandard(false);
        }
    };

    const refetchTemplates = async () => {
        const res = await fetch(`${API_BASE_URL}/api/competency-templates`);
        if (res.ok) {
            const data = await res.json();
            if (Array.isArray(data)) setTemplates(data);
        }
    };

    const openAddTemplateModal = (position: string) => {
        setTemplateModal({ editing: null, position });
        setTemplateForm({ ...emptyTemplateForm, competencyType: 'FUNCTIONAL' });
    };

    const openEditTemplateModal = (template: CompetencyTemplate) => {
        setTemplateModal({ editing: template, position: template.position });
        setTemplateForm({
            competencyType: template.competencyType || 'FUNCTIONAL',
            competencyName: template.competencyName || '',
            operationalDefinition: template.operationalDefinition || '',
            standardLevelIndicator: template.standardLevelIndicator || '',
            jdReference: template.jdReference || '',
            standardScore: template.standardScore !== null && template.standardScore !== undefined ? String(template.standardScore) : ''
        });
    };

    const closeTemplateModal = () => {
        setTemplateModal(null);
        setTemplateForm(emptyTemplateForm);
    };

    // FUNCTIONAL is fully owned by the position - add/edit/delete write directly to the same
    // competency_templates row HR manages, unlike CORE's Standard-only override.
    const handleSubmitTemplate = async (e: FormEvent) => {
        e.preventDefault();
        if (!templateModal) return;
        setIsSavingTemplate(true);
        try {
            const payload = {
                ...templateForm,
                position: templateModal.position,
                requesterId: currentUser?.employee_id
            };
            const url = templateModal.editing
                ? `${API_BASE_URL}/api/competency-templates/${templateModal.editing.id}`
                : `${API_BASE_URL}/api/competency-templates`;
            const res = await fetch(url, {
                method: templateModal.editing ? 'PUT' : 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            if (res.ok) {
                const data = await res.json();
                if (data.pending) {
                    await refetchPendingRequests();
                    setNotification({ show: true, type: 'success', message: t('templateActions.submittedForApproval') });
                } else {
                    await refetchTemplates();
                    setNotification({ show: true, type: 'success', message: templateModal.editing ? t('templateActions.updateSuccess') : t('templateActions.addSuccess') });
                }
                closeTemplateModal();
            } else {
                const err = await res.json().catch(() => ({}));
                setNotification({ show: true, type: 'error', message: err.error || t('templateActions.saveFailed') });
            }
        } catch (err) {
            console.error(err);
            setNotification({ show: true, type: 'error', message: t('templateActions.saveFailed') });
        } finally {
            setIsSavingTemplate(false);
        }
    };

    const handleDeleteTemplate = (template: CompetencyTemplate) => {
        setConfirmConfig({
            isOpen: true,
            title: t('templateActions.deleteTitle'),
            message: t('templateActions.deleteMessage', { name: template.competencyName }),
            onConfirm: async () => {
                try {
                    const res = await fetch(`${API_BASE_URL}/api/competency-templates/${template.id}?requesterId=${encodeURIComponent(currentUser?.employee_id || '')}`, { method: 'DELETE' });
                    if (res.ok) {
                        const data = await res.json();
                        if (data.pending) {
                            await refetchPendingRequests();
                            setNotification({ show: true, type: 'success', message: t('templateActions.submittedForApproval') });
                            return;
                        }
                        await refetchTemplates();
                        setNotification({ show: true, type: 'success', message: t('templateActions.deleteSuccess') });
                    } else {
                        const err = await res.json().catch(() => ({}));
                        setNotification({ show: true, type: 'error', message: err.error || t('templateActions.deleteFailed') });
                    }
                } catch (err) {
                    console.error(err);
                    setNotification({ show: true, type: 'error', message: t('templateActions.deleteFailed') });
                }
            }
        });
    };

    if (isLoading) return <div className="p-8 text-center">{t('loading')}</div>;

    return (
        <div className="max-w-[1600px] mx-auto py-6 px-4">
            <PopupNotification
                isOpen={notification.show}
                type={notification.type}
                message={notification.message}
                onClose={() => setNotification({ ...notification, show: false })}
            />
            <div className="mb-8 flex flex-wrap items-start justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
                        <UsersRound className="text-indigo-600" /> {t('title')}
                    </h1>
                    <p className="text-sm text-slate-500 mt-1">{t('subtitle')}</p>
                </div>
                {teamMembers.length > 0 && (
                    <div className="flex flex-wrap items-center gap-2">
                        <button
                            type="button"
                            onClick={openDictionary}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold shadow-sm transition-colors"
                        >
                            <BookOpen size={16} /> {t('dictionary.openButton')}
                        </button>
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
                )}
            </div>

            {teamMembers.length === 0 ? (
                <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-8 text-center text-slate-500 italic">
                    {t('noTeamMembers')}
                </div>
            ) : viewMode === 'overview' ? (
                <div className="space-y-6">
                    <p className="text-xs text-slate-500">{t('overview.clickToAssess')}</p>
                    {isLoadingOverview && Object.keys(teamScores).length === 0 ? (
                        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-8 text-center text-slate-500 italic">
                            {t('loading')}
                        </div>
                    ) : (
                        overviewGroups.map(group => {
                            const groupedByType = groupByType(group.competencies);
                            const colCount = 3 + group.members.length * 2;
                            return (
                                <div key={group.key} className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
                                    <div className="p-4 bg-slate-50 border-b border-slate-100 font-semibold text-slate-600 text-sm">
                                        {group.members[0]?.jobPosition}
                                    </div>
                                    {group.competencies.length === 0 ? (
                                        <div className="p-6 text-center text-slate-500 italic text-sm">
                                            {t('noCompetenciesForPosition')}
                                        </div>
                                    ) : (
                                        <div className="overflow-x-auto">
                                            <table className="text-sm w-full">
                                                <thead>
                                                    <tr className="bg-gradient-to-r from-indigo-600 via-indigo-600 to-violet-600 text-white">
                                                        <th rowSpan={4} className="p-3 text-center align-middle w-12 border-r border-white/10">{t('table.no')}</th>
                                                        <th rowSpan={4} className="p-3 text-left align-middle min-w-[220px] border-r border-white/10">{t('table.competency')}</th>
                                                        <th rowSpan={4} className="p-3 text-center align-middle w-28 border-r border-white/10">{t('table.standard')}</th>
                                                        {group.members.map(member => (
                                                            <th key={member.employeeId} colSpan={2} className="p-0 border-r border-white/10 last:border-r-0">
                                                                <button
                                                                    type="button"
                                                                    onClick={() => openDetail(member.employeeId)}
                                                                    className="w-full h-full p-3 font-bold hover:bg-white/10 transition-colors"
                                                                >
                                                                    {member.fullName}
                                                                </button>
                                                            </th>
                                                        ))}
                                                    </tr>
                                                    <tr className="bg-indigo-50/70 text-indigo-900 text-xs">
                                                        {group.members.map(member => {
                                                            const memberScores = teamScores[member.employeeId];
                                                            const hasSubmitted = !!memberScores && Object.keys(memberScores.current).length > 0;
                                                            return (
                                                                <td key={member.employeeId} colSpan={2} className="p-2 text-center border-r border-indigo-100 last:border-r-0">
                                                                    <div>{t('employeeId')}: {member.employeeId}</div>
                                                                    {hasSubmitted && (
                                                                        <span className="inline-block mt-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-700">
                                                                            {t('period.locked')}
                                                                        </span>
                                                                    )}
                                                                </td>
                                                            );
                                                        })}
                                                    </tr>
                                                    <tr className="bg-slate-50 text-slate-500 text-xs italic">
                                                        {group.members.map(member => (
                                                            <td key={member.employeeId} colSpan={2} className="p-2 text-center border-r border-slate-100 last:border-r-0">
                                                                {t('previousScore')}: {teamScores[member.employeeId]?.previousTotal ?? '-'}
                                                            </td>
                                                        ))}
                                                    </tr>
                                                    <tr className="bg-indigo-500/90 text-white text-[11px] uppercase tracking-wide">
                                                        {group.members.map(member => (
                                                            <Fragment key={member.employeeId}>
                                                                <th className="p-2 text-center border-r border-white/10">{t('table.actual')}</th>
                                                                <th className="p-2 text-center border-r border-white/10 last:border-r-0">{t('table.gap')}</th>
                                                            </Fragment>
                                                        ))}
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {Object.entries(groupedByType).map(([type, comps]) => (
                                                        <Fragment key={type}>
                                                            <tr className="bg-slate-50">
                                                                <td colSpan={colCount} className="py-2 px-3 font-bold text-indigo-700 text-xs border-l-4 border-indigo-400">
                                                                    {sectionLabel(type)}
                                                                </td>
                                                            </tr>
                                                            {comps.map((c, idx) => {
                                                                const standard = c.standardScore ?? null;
                                                                return (
                                                                    <tr key={c.id} className={`${idx % 2 === 0 ? 'bg-white' : 'bg-slate-50/60'} hover:bg-indigo-50/50 transition-colors`}>
                                                                        <td className="p-2 text-center text-slate-500 border-b border-slate-100">{idx + 1}</td>
                                                                        <td className="p-2 font-medium text-slate-800 border-b border-slate-100">{c.competencyName}</td>
                                                                        <td className="p-2 text-center text-slate-600 border-b border-slate-100">{standard ?? '-'}</td>
                                                                        {group.members.map(member => {
                                                                            const actual = teamScores[member.employeeId]?.current[c.id];
                                                                            const gap = (standard !== null && actual !== undefined) ? actual - standard : null;
                                                                            return (
                                                                                <Fragment key={member.employeeId}>
                                                                                    <td className="p-2 text-center text-slate-700 border-b border-slate-100">{actual ?? '-'}</td>
                                                                                    <td className="p-2 text-center border-b border-slate-100">
                                                                                        {gap === null ? (
                                                                                            <span className="text-slate-400">-</span>
                                                                                        ) : (
                                                                                            <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-bold ${gap < 0 ? 'bg-rose-50 text-rose-600' : gap > 0 ? 'bg-emerald-50 text-emerald-600' : 'bg-slate-100 text-slate-500'}`}>
                                                                                                {gap > 0 ? `+${gap}` : gap}
                                                                                            </span>
                                                                                        )}
                                                                                    </td>
                                                                                </Fragment>
                                                                            );
                                                                        })}
                                                                    </tr>
                                                                );
                                                            })}
                                                        </Fragment>
                                                    ))}
                                                </tbody>
                                                <tfoot>
                                                    <tr className="bg-indigo-50/60 font-semibold">
                                                        <td colSpan={3} className="p-2 border-t border-indigo-100 text-slate-600">{t('summary.totalScore')}</td>
                                                        {group.members.map(member => {
                                                            const s = computeSummary(group.competencies, teamScores[member.employeeId]?.current ?? {});
                                                            return <td key={member.employeeId} colSpan={2} className="p-2 text-center border-t border-indigo-100 text-slate-800">{s.totalActual} / {s.totalStandard}</td>;
                                                        })}
                                                    </tr>
                                                    <tr className="bg-indigo-50/60 font-semibold">
                                                        <td colSpan={3} className="p-2 text-slate-600">{t('summary.achievementPercent')}</td>
                                                        {group.members.map(member => {
                                                            const s = computeSummary(group.competencies, teamScores[member.employeeId]?.current ?? {});
                                                            return <td key={member.employeeId} colSpan={2} className="p-2 text-center text-slate-800">{s.achievementPercent !== null ? `${s.achievementPercent}%` : '-'}</td>;
                                                        })}
                                                    </tr>
                                                    <tr className="bg-indigo-50/60 font-semibold">
                                                        <td colSpan={3} className="p-2 text-slate-600">{t('summary.gapCount')}</td>
                                                        {group.members.map(member => {
                                                            const s = computeSummary(group.competencies, teamScores[member.employeeId]?.current ?? {});
                                                            return <td key={member.employeeId} colSpan={2} className="p-2 text-center text-slate-800">{s.gapCount}</td>;
                                                        })}
                                                    </tr>
                                                    <tr className="bg-indigo-50/60 font-semibold">
                                                        <td colSpan={3} className="p-2 text-slate-600">{t('summary.readinessStatus')}</td>
                                                        {group.members.map(member => {
                                                            const s = computeSummary(group.competencies, teamScores[member.employeeId]?.current ?? {});
                                                            return (
                                                                <td key={member.employeeId} colSpan={2} className="p-2 text-center">
                                                                    <span className={`inline-block px-2 py-1 rounded-full text-xs font-bold ${s.readinessStatus === 'ready' ? 'bg-emerald-100 text-emerald-700' :
                                                                        s.readinessStatus === 'limitedDevelopment' ? 'bg-amber-100 text-amber-700' :
                                                                            'bg-rose-100 text-rose-700'
                                                                        }`}>
                                                                        {t(`status.${s.readinessStatus}`)}
                                                                    </span>
                                                                </td>
                                                            );
                                                        })}
                                                    </tr>
                                                    <tr className="bg-indigo-50/60 font-semibold align-top">
                                                        <td colSpan={3} className="p-2 rounded-bl-2xl text-slate-600">{t('notes.label')}</td>
                                                        {group.members.map((member, i) => (
                                                            <td key={member.employeeId} colSpan={2} className={`p-2 text-slate-700 font-normal text-xs whitespace-pre-wrap ${i === group.members.length - 1 ? 'rounded-br-2xl' : ''}`}>
                                                                {teamScores[member.employeeId]?.notes || '-'}
                                                            </td>
                                                        ))}
                                                    </tr>
                                                </tfoot>
                                            </table>
                                        </div>
                                    )}
                                </div>
                            );
                        })
                    )}
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden md:col-span-1">
                        <div className="p-4 bg-slate-50 border-b border-slate-100 font-semibold text-slate-600 text-sm">
                            {t('teamMembers')} ({teamMembers.length})
                        </div>
                        <div className="divide-y divide-slate-50 max-h-[600px] overflow-y-auto">
                            {teamMembers.map(member => (
                                <button
                                    key={member.employeeId}
                                    onClick={() => setSelectedEmployeeId(member.employeeId)}
                                    className={`w-full text-left p-4 transition-colors ${selectedEmployeeId === member.employeeId ? 'bg-indigo-50' : 'hover:bg-slate-50'}`}
                                >
                                    <div className="font-semibold text-slate-800 flex items-center gap-2">
                                        {member.fullName}
                                        {member.isSupervisor && <Shield size={14} className="text-indigo-500 shrink-0" />}
                                    </div>
                                    <div className="text-xs text-slate-500 flex items-center gap-1 mt-0.5">
                                        <Briefcase size={12} /> {member.jobPosition}
                                    </div>
                                </button>
                            ))}
                        </div>
                    </div>

                    <div className="md:col-span-2 space-y-4">
                        <button
                            onClick={() => setViewMode('overview')}
                            className="flex items-center gap-1.5 text-sm font-semibold text-indigo-600 hover:text-indigo-700"
                        >
                            <ArrowLeft size={16} /> {t('overview.backToOverview')}
                        </button>

                        {selectedMember && (
                            <>
                                <div className="flex flex-wrap items-center justify-between gap-3">
                                    <h2 className="font-bold text-slate-800">
                                        {t('assessmentFor', { name: selectedMember.fullName })}
                                    </h2>
                                    {isLocked && (
                                        <span className="text-xs font-bold px-2.5 py-1 rounded-lg bg-slate-200 text-slate-600">
                                            {t('period.locked')}
                                        </span>
                                    )}
                                </div>
                                <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-4 flex flex-wrap gap-6 text-sm">
                                    <div>
                                        <span className="text-slate-500">{t('employeeId')}: </span>
                                        <span className="font-semibold text-slate-800">{selectedMember.employeeId}</span>
                                    </div>
                                    <div>
                                        <span className="text-slate-500">
                                            {previousPeriod ? t('previousScoreFor', { period: periodLabel(previousPeriod) }) : t('previousScore')}:{' '}
                                        </span>
                                        <span className="font-semibold text-slate-800">{previousTotal ?? '-'}</span>
                                    </div>
                                </div>
                                {isLocked && (
                                    <p className="text-xs text-slate-500">{t('period.lockedNotice')}</p>
                                )}
                            </>
                        )}

                        {matchedCompetencies.length === 0 ? (
                            <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-8 text-center text-slate-500 italic">
                                {t('noCompetenciesForPosition')}
                            </div>
                        ) : (
                            <>
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
                                                <col className="w-36" />
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
                                                    const actual = actualScores[c.id];
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
                                                                <td className="p-3">
                                                                    {isLocked ? (
                                                                        <div className="flex justify-center">
                                                                            <span className="w-7 h-7 flex items-center justify-center rounded-lg bg-indigo-100 text-indigo-700 text-xs font-bold">
                                                                                {actual ?? '-'}
                                                                            </span>
                                                                        </div>
                                                                    ) : (
                                                                        <div className="flex justify-center gap-1">
                                                                            {[1, 2, 3, 4].map(v => (
                                                                                <button
                                                                                    key={v}
                                                                                    type="button"
                                                                                    onClick={() => setActualScores(prev => ({ ...prev, [c.id]: v }))}
                                                                                    className={`w-7 h-7 rounded-lg border-2 text-xs font-bold transition-all ${actual === v
                                                                                        ? 'bg-indigo-600 border-indigo-600 text-white'
                                                                                        : 'bg-white border-slate-200 text-slate-500 hover:border-slate-300'
                                                                                        }`}
                                                                                >
                                                                                    {v}
                                                                                </button>
                                                                            ))}
                                                                        </div>
                                                                    )}
                                                                </td>
                                                                <td className={`p-3 text-center font-bold ${gap === null ? 'text-slate-400' : gap < 0 ? 'text-rose-600' : 'text-emerald-600'
                                                                    }`}>
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

                                <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-5 space-y-2">
                                    <label className="block text-sm font-semibold text-slate-600">{t('notes.label')}</label>
                                    {isLocked ? (
                                        <p className="text-sm text-slate-700 whitespace-pre-wrap">{notes || t('notes.empty')}</p>
                                    ) : (
                                        <textarea
                                            value={notes}
                                            onChange={e => setNotes(e.target.value)}
                                            placeholder={t('notes.placeholder')}
                                            className="w-full px-3 py-2 rounded-xl border border-slate-200 outline-none focus:ring-2 focus:ring-indigo-500 text-sm resize-none min-h-[90px]"
                                        />
                                    )}
                                </div>

                                {!isLocked && (
                                    <>
                                        {summary.unassessedCount > 0 && (
                                            <p className="text-xs text-amber-600 text-center">
                                                {t('notifications.unassessedRemaining', { count: summary.unassessedCount })}
                                            </p>
                                        )}
                                        <button
                                            onClick={handleSave}
                                            disabled={isSaving || Object.keys(actualScores).length === 0}
                                            className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-300 text-white font-bold rounded-xl shadow-lg shadow-indigo-900/20"
                                        >
                                            {t('actions.save')}
                                        </button>
                                    </>
                                )}
                            </>
                        )}
                    </div>
                </div>
            )}

            {isDictionaryOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl overflow-hidden max-h-[85vh] flex flex-col">
                        <div className="p-6 border-b border-slate-100 flex justify-between items-start bg-slate-50">
                            <div>
                                <h2 className="font-bold text-lg text-slate-800 flex items-center gap-2">
                                    <BookOpen size={18} className="text-indigo-600" /> {t('dictionary.title')}
                                </h2>
                                <p className="text-xs text-slate-500 mt-1">{t('dictionary.subtitle')}</p>
                            </div>
                            <button onClick={closeDictionary} className="text-slate-400 hover:text-slate-600">
                                <X size={20} />
                            </button>
                        </div>

                        {managedPositions.length > 1 && (
                            <div className="flex flex-wrap gap-2 px-6 pt-4">
                                {managedPositions.map(pos => (
                                    <button
                                        key={pos}
                                        type="button"
                                        onClick={() => setDictionaryPosition(pos)}
                                        className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${dictionaryPosition === pos
                                            ? 'bg-indigo-600 text-white'
                                            : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                                            }`}
                                    >
                                        {pos}
                                    </button>
                                ))}
                            </div>
                        )}

                        <div className="flex-1 overflow-y-auto p-6 space-y-4">
                            {dictionaryPosition && (
                                <>
                                    <div className="border border-slate-100 rounded-xl overflow-hidden">
                                        <div className="bg-slate-50 px-4 py-2.5">
                                            <span className="text-xs font-bold text-slate-600">{sectionLabel('CORE')}</span>
                                            <p className="text-[11px] text-slate-400 mt-0.5">{t('dictionary.standardOnlyNotice')}</p>
                                        </div>
                                        {dictionaryCoreCompetencies.length === 0 ? (
                                            <div className="p-3 text-center text-xs text-slate-400 italic">{t('noCompetenciesForPosition')}</div>
                                        ) : (
                                            <table className="w-full text-sm">
                                                <tbody className="divide-y divide-slate-50">
                                                    {dictionaryCoreCompetencies.map(c => {
                                                        const pending = pendingForCoreStandard(c);
                                                        return (
                                                            <tr key={c.id}>
                                                                <td className="p-3 font-medium text-slate-800">
                                                                    {c.competencyName}
                                                                    {pending && (
                                                                        <span className="block mt-1 text-[11px] font-normal text-amber-600">
                                                                            {t('templateActions.pendingStandard', { value: pending.payload?.standardScore })}
                                                                        </span>
                                                                    )}
                                                                </td>
                                                                <td className="p-3 text-center text-slate-500 w-32">
                                                                    {t('templateActions.standardScoreShort')}: {c.standardScore ?? '-'}
                                                                </td>
                                                                <td className="p-3 w-14">
                                                                    <div className="flex items-center justify-center">
                                                                        <button
                                                                            type="button"
                                                                            disabled={!!pending}
                                                                            onClick={() => openStandardModal(c)}
                                                                            className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-slate-400"
                                                                            title={pending ? t('templateActions.awaitingApproval') : t('templateActions.editStandard')}
                                                                        >
                                                                            <Pencil size={14} />
                                                                        </button>
                                                                    </div>
                                                                </td>
                                                            </tr>
                                                        );
                                                    })}
                                                </tbody>
                                            </table>
                                        )}
                                    </div>

                                    <div className="border border-slate-100 rounded-xl overflow-hidden">
                                        <div className="bg-slate-50 px-4 py-2.5 flex items-center justify-between gap-2">
                                            <span className="text-xs font-bold text-slate-600">{sectionLabel('FUNCTIONAL')}</span>
                                            <button
                                                type="button"
                                                onClick={() => openAddTemplateModal(dictionaryPosition)}
                                                className="flex items-center gap-1 text-[11px] font-semibold text-indigo-600 hover:text-indigo-700"
                                            >
                                                <Plus size={12} /> {t('templateActions.add')}
                                            </button>
                                        </div>
                                        {dictionaryFunctionalCompetencies.length === 0 && pendingNewFunctionalCompetencies.length === 0 ? (
                                            <div className="p-3 text-center text-xs text-slate-400 italic">{t('noCompetenciesForPosition')}</div>
                                        ) : (
                                            <table className="w-full text-sm">
                                                <tbody className="divide-y divide-slate-50">
                                                    {dictionaryFunctionalCompetencies.map(c => {
                                                        const pending = pendingForTemplate(c.id);
                                                        return (
                                                            <tr key={c.id}>
                                                                <td className="p-3 font-medium text-slate-800">
                                                                    {c.competencyName}
                                                                    {pending && (
                                                                        <span className="block mt-1 text-[11px] font-normal text-amber-600">
                                                                            {pending.action === 'DELETE' ? t('templateActions.pendingDelete') : t('templateActions.pendingEdit')}
                                                                        </span>
                                                                    )}
                                                                </td>
                                                                <td className="p-3 text-center text-slate-500 w-32">
                                                                    {t('templateActions.standardScoreShort')}: {c.standardScore ?? '-'}
                                                                </td>
                                                                <td className="p-3 w-20">
                                                                    <div className="flex items-center justify-center gap-1">
                                                                        <button
                                                                            type="button"
                                                                            disabled={!!pending}
                                                                            onClick={() => openEditTemplateModal(c)}
                                                                            className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-slate-400"
                                                                            title={pending ? t('templateActions.awaitingApproval') : t('templateActions.edit')}
                                                                        >
                                                                            <Pencil size={14} />
                                                                        </button>
                                                                        <button
                                                                            type="button"
                                                                            disabled={!!pending}
                                                                            onClick={() => handleDeleteTemplate(c)}
                                                                            className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-slate-400"
                                                                            title={pending ? t('templateActions.awaitingApproval') : t('templateActions.delete')}
                                                                        >
                                                                            <Trash2 size={14} />
                                                                        </button>
                                                                    </div>
                                                                </td>
                                                            </tr>
                                                        );
                                                    })}
                                                    {pendingNewFunctionalCompetencies.map(r => (
                                                        <tr key={`pending-${r.id}`} className="bg-amber-50/40">
                                                            <td className="p-3 font-medium text-slate-500">
                                                                {String(r.payload?.competencyName ?? '')}
                                                                <span className="block mt-1 text-[11px] font-normal text-amber-600">
                                                                    {t('templateActions.pendingAdd')}
                                                                </span>
                                                            </td>
                                                            <td className="p-3 text-center text-slate-400 w-32">
                                                                {t('templateActions.standardScoreShort')}: {String(r.payload?.standardScore ?? '-')}
                                                            </td>
                                                            <td className="p-3 w-20"></td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        )}
                                    </div>
                                </>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {standardModal && (
                <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden">
                        <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50">
                            <h2 className="font-bold text-lg text-slate-800">{t('templateActions.editStandardTitle')}</h2>
                            <button onClick={closeStandardModal} className="text-slate-400 hover:text-slate-600">
                                <X size={20} />
                            </button>
                        </div>
                        <form onSubmit={handleSubmitStandardOverride} className="p-6 space-y-4">
                            <div>
                                <label className="block text-sm font-semibold text-slate-700 mb-1">{t('templateActions.competencyName')}</label>
                                <div className="w-full px-4 py-2 rounded-xl border border-slate-100 bg-slate-50 text-slate-500 text-sm">
                                    {standardModal.source.competencyName}
                                </div>
                            </div>
                            <div>
                                <label className="block text-sm font-semibold text-slate-700 mb-1">{t('templateActions.standardScore')}</label>
                                <select
                                    required
                                    value={standardModal.value}
                                    onChange={e => setStandardModal({ ...standardModal, value: e.target.value })}
                                    className="w-full px-4 py-2 rounded-xl border border-slate-200 outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
                                >
                                    <option value="">{t('templateActions.selectStandardScore')}</option>
                                    <option value="1">1 - {t('templateActions.scoreLabels.1')}</option>
                                    <option value="2">2 - {t('templateActions.scoreLabels.2')}</option>
                                    <option value="3">3 - {t('templateActions.scoreLabels.3')}</option>
                                    <option value="4">4 - {t('templateActions.scoreLabels.4')}</option>
                                </select>
                            </div>
                            <div className="flex gap-3 pt-2">
                                <button
                                    type="button"
                                    onClick={closeStandardModal}
                                    className="flex-1 py-3 rounded-xl border border-slate-200 text-slate-600 font-bold hover:bg-slate-50"
                                >
                                    {t('templateActions.cancel')}
                                </button>
                                <button
                                    disabled={isSavingStandard}
                                    className="flex-1 py-3 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-300 text-white font-bold rounded-xl shadow-lg shadow-indigo-900/20"
                                >
                                    {t('templateActions.save')}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {templateModal && (
                <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden max-h-[90vh] overflow-y-auto">
                        <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50">
                            <h2 className="font-bold text-lg text-slate-800">
                                {templateModal.editing ? t('templateActions.editTitle') : t('templateActions.addTitle')}
                            </h2>
                            <button onClick={closeTemplateModal} className="text-slate-400 hover:text-slate-600">
                                <X size={20} />
                            </button>
                        </div>
                        <form onSubmit={handleSubmitTemplate} className="p-6 space-y-4">
                            <div>
                                <label className="block text-sm font-semibold text-slate-700 mb-1">{t('templateActions.positionLabel')}</label>
                                <div className="w-full px-4 py-2 rounded-xl border border-slate-100 bg-slate-50 text-slate-500 text-sm">
                                    {templateModal.position}
                                </div>
                            </div>
                            <div>
                                <label className="block text-sm font-semibold text-slate-700 mb-1">{t('templateActions.competencyType')}</label>
                                <div className="w-full px-4 py-2 rounded-xl border border-slate-100 bg-slate-50 text-slate-500 text-sm">
                                    {sectionLabel('FUNCTIONAL')}
                                </div>
                            </div>
                            <div>
                                <label className="block text-sm font-semibold text-slate-700 mb-1">{t('templateActions.competencyName')}</label>
                                <input
                                    required
                                    value={templateForm.competencyName}
                                    onChange={e => setTemplateForm({ ...templateForm, competencyName: e.target.value })}
                                    className="w-full px-4 py-2 rounded-xl border border-slate-200 outline-none focus:ring-2 focus:ring-indigo-500"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-semibold text-slate-700 mb-1">{t('templateActions.standardScore')}</label>
                                <select
                                    value={templateForm.standardScore}
                                    onChange={e => setTemplateForm({ ...templateForm, standardScore: e.target.value })}
                                    className="w-full px-4 py-2 rounded-xl border border-slate-200 outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
                                >
                                    <option value="">{t('templateActions.selectStandardScore')}</option>
                                    <option value="1">1 - {t('templateActions.scoreLabels.1')}</option>
                                    <option value="2">2 - {t('templateActions.scoreLabels.2')}</option>
                                    <option value="3">3 - {t('templateActions.scoreLabels.3')}</option>
                                    <option value="4">4 - {t('templateActions.scoreLabels.4')}</option>
                                </select>
                            </div>
                            <div>
                                <label className="block text-sm font-semibold text-slate-700 mb-1">{t('templateActions.operationalDefinition')}</label>
                                <textarea
                                    value={templateForm.operationalDefinition}
                                    onChange={e => setTemplateForm({ ...templateForm, operationalDefinition: e.target.value })}
                                    className="w-full px-4 py-2 rounded-xl border border-slate-200 outline-none focus:ring-2 focus:ring-indigo-500 resize-none min-h-[70px]"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-semibold text-slate-700 mb-1">{t('templateActions.standardLevelIndicator')}</label>
                                <textarea
                                    value={templateForm.standardLevelIndicator}
                                    onChange={e => setTemplateForm({ ...templateForm, standardLevelIndicator: e.target.value })}
                                    className="w-full px-4 py-2 rounded-xl border border-slate-200 outline-none focus:ring-2 focus:ring-indigo-500 resize-none min-h-[70px]"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-semibold text-slate-700 mb-1">{t('templateActions.jdReference')}</label>
                                <input
                                    value={templateForm.jdReference}
                                    onChange={e => setTemplateForm({ ...templateForm, jdReference: e.target.value })}
                                    className="w-full px-4 py-2 rounded-xl border border-slate-200 outline-none focus:ring-2 focus:ring-indigo-500"
                                />
                            </div>
                            <div className="flex gap-3 pt-2">
                                <button
                                    type="button"
                                    onClick={closeTemplateModal}
                                    className="flex-1 py-3 rounded-xl border border-slate-200 text-slate-600 font-bold hover:bg-slate-50"
                                >
                                    {t('templateActions.cancel')}
                                </button>
                                <button
                                    disabled={isSavingTemplate}
                                    className="flex-1 py-3 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-300 text-white font-bold rounded-xl shadow-lg shadow-indigo-900/20"
                                >
                                    {t('templateActions.save')}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            <ConfirmationModal
                isOpen={confirmConfig.isOpen}
                onClose={() => setConfirmConfig({ ...confirmConfig, isOpen: false })}
                onConfirm={confirmConfig.onConfirm}
                title={confirmConfig.title}
                message={confirmConfig.message}
            />
        </div>
    );
};

export default CompetencyTeamPage;
