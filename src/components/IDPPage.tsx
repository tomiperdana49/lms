import { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';
import {
    Target,
    Users,
    CheckCircle,
    Plus,
    Trash2,
    ChevronDown,
    Clock,
    MessageSquare,
    Lock,
    Pencil,
    Download,
    Search
} from 'lucide-react';
import { API_BASE_URL } from '../config';
import type { User, IDPPlan, Employee } from '../types';
import PopupNotification from './PopupNotification';
import IDPDetailInfoTable from './IDPDetailInfoTable';
import { idpLabelCell, idpValueCell, idpSectionHeaderCell, idpHintCell, idpContentCell } from './idpTableStyles';

interface IDPPageProps {
    currentUser: User | null;
}

interface ActionItemDraft {
    id?: number;
    action_description: string;
    target_time: string;
    is_completed: boolean;
    notes: string;
    is_mandatory?: boolean;
}

const CURRENT_YEAR = new Date().getFullYear();
const MANDATORY_TARGET_HOURS = 48;

const INDO_MONTHS = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
const formatIndoDate = (dateVal?: string) => {
    if (!dateVal) return '';
    const d = new Date(dateVal);
    if (isNaN(d.getTime())) return '';
    return `${d.getDate()} ${INDO_MONTHS[d.getMonth()]} ${d.getFullYear()}`;
};

const emptyDraft = () => ({
    achievements: '',
    career_goal: '',
    existing_skills: '',
    development_area: '',
    actionItems: [] as ActionItemDraft[]
});

export default function IDPPage({ currentUser }: IDPPageProps) {
    const { t } = useTranslation('idpPage');
    // A supervisor's own development is out of scope here — they only review their team's IDPs.
    const isSupervisor = !!currentUser?.isSupervisor;

    const [myPlans, setMyPlans] = useState<IDPPlan[]>([]);
    const [teamPlans, setTeamPlans] = useState<IDPPlan[]>([]);
    const [employees, setEmployees] = useState<Employee[]>([]);
    const [notification, setNotification] = useState<{ show: boolean; type: 'success' | 'error'; message: string }>({ show: false, type: 'success', message: '' });

    // --- Team IDP: search + period filter, so a leader with many reports can find someone quickly ---
    const [teamSearchQuery, setTeamSearchQuery] = useState('');
    const [teamSelectedYear, setTeamSelectedYear] = useState<number | 'All'>(CURRENT_YEAR);
    const teamYears = Array.from(new Set(teamPlans.map(p => p.period_year))).sort((a, b) => b - a);
    const filteredTeamPlans = teamPlans.filter(p => {
        if (teamSelectedYear !== 'All' && p.period_year !== teamSelectedYear) return false;
        if (teamSearchQuery) {
            const q = teamSearchQuery.toLowerCase();
            if (!p.employee_name?.toLowerCase().includes(q) && !p.employee_id?.toLowerCase().includes(q)) return false;
        }
        return true;
    });

    const fetchMyPlans = async () => {
        if (!currentUser?.employee_id) return;
        try {
            const res = await fetch(`${API_BASE_URL}/api/idp/my-plans?employee_id=${currentUser.employee_id}`);
            if (res.ok) setMyPlans(await res.json());
        } catch (err) { console.error(err); }
    };

    const fetchTeamPlans = async () => {
        if (!currentUser?.employee_id) return;
        try {
            const res = await fetch(`${API_BASE_URL}/api/idp/subordinates?leader_id=${currentUser.employee_id}`);
            if (res.ok) setTeamPlans(await res.json());
        } catch (err) { console.error(err); }
    };

    useEffect(() => {
        if (!currentUser) return;
        if (isSupervisor) fetchTeamPlans(); else fetchMyPlans();
    }, [isSupervisor, currentUser]);

    useEffect(() => {
        fetch(`${API_BASE_URL}/api/employees`).then(r => r.json()).then(setEmployees).catch(() => {});
    }, []);

    const myEmployee = employees.find(e => e.id_employee === currentUser?.employee_id);
    const currentYearPlan = myPlans.find(p => p.period_year === CURRENT_YEAR);
    const pastPlans = myPlans.filter(p => p.period_year !== CURRENT_YEAR);

    // Full detail (action items + reviews) is only fetched for the plan currently on screen.
    const [detail, setDetail] = useState<IDPPlan | null>(null);
    const fetchDetail = async (id: number) => {
        try {
            const res = await fetch(`${API_BASE_URL}/api/idp/${id}`);
            if (res.ok) setDetail(await res.json());
        } catch (err) { console.error(err); }
    };

    useEffect(() => {
        if (currentYearPlan?.id) fetchDetail(currentYearPlan.id);
        else setDetail(null);
    }, [currentYearPlan?.id]);

    // --- Past years' plans: read-only, expandable on demand (same detail table as the current year) ---
    const [pastExpandedId, setPastExpandedId] = useState<number | null>(null);
    const [pastDetail, setPastDetail] = useState<IDPPlan | null>(null);
    const togglePastPlan = async (id: number) => {
        if (pastExpandedId === id) { setPastExpandedId(null); setPastDetail(null); return; }
        setPastExpandedId(id);
        try {
            const res = await fetch(`${API_BASE_URL}/api/idp/${id}`);
            if (res.ok) setPastDetail(await res.json());
        } catch (err) { console.error(err); }
    };

    // --- Download a period's IDP as a PDF that matches the on-screen detail table exactly (captures
    // the rendered DOM via html2canvas, then paginates it across A4 pages in jsPDF). ---
    const currentDetailRef = useRef<HTMLDivElement>(null);
    const pastDetailRef = useRef<HTMLDivElement>(null);
    const [downloadingPeriod, setDownloadingPeriod] = useState<number | null>(null);
    const downloadIdpPdf = async (element: HTMLDivElement | null, periodYear: number) => {
        if (!element) return;
        setDownloadingPeriod(periodYear);
        try {
            const canvas = await html2canvas(element, { scale: 2, useCORS: true, backgroundColor: '#ffffff' });
            const pdf = new jsPDF('p', 'pt', 'a4');
            const pageWidth = pdf.internal.pageSize.getWidth();
            const pageHeight = pdf.internal.pageSize.getHeight();
            const imgWidth = pageWidth;
            const imgHeight = (canvas.height * imgWidth) / canvas.width;
            const imgData = canvas.toDataURL('image/png');
            let heightLeft = imgHeight;
            let position = 0;
            pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight);
            heightLeft -= pageHeight;
            while (heightLeft > 0) {
                position -= pageHeight;
                pdf.addPage();
                pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight);
                heightLeft -= pageHeight;
            }
            pdf.save(`IDP_${(currentUser?.name || '').replace(/\s+/g, '_')}_${periodYear}.pdf`);
        } catch (err) { console.error(err); } finally { setDownloadingPeriod(null); }
    };

    // --- Create/Edit form (Draft/Rejected, or brand-new plan) ---
    const [draft, setDraft] = useState(emptyDraft());
    const [isEditingForm, setIsEditingForm] = useState(false);
    // Lets an employee re-open the form for an already Pending/Approved plan to update it in place
    // (no re-submission/re-approval needed — see the PUT /api/idp/:id handler).
    const [manualEditMode, setManualEditMode] = useState(false);

    useEffect(() => {
        setManualEditMode(false);
        if (!currentYearPlan) {
            setDraft(emptyDraft());
            setIsEditingForm(true);
            return;
        }
        if (['Draft', 'Rejected'].includes(currentYearPlan.status) && detail) {
            setDraft({
                achievements: detail.achievements || '',
                career_goal: detail.career_goal || '',
                existing_skills: detail.existing_skills || '',
                development_area: detail.development_area || '',
                actionItems: (detail.action_items || []).filter(i => !i.is_mandatory).map(i => ({
                    id: i.id, action_description: i.action_description, target_time: i.target_time || '',
                    is_completed: !!i.is_completed, notes: i.notes || ''
                }))
            });
            setIsEditingForm(true);
        } else {
            setIsEditingForm(false);
        }
    }, [currentYearPlan?.id, currentYearPlan?.status, detail?.id]);

    const addActionRow = () => setDraft(d => ({ ...d, actionItems: [...d.actionItems, { action_description: '', target_time: '', is_completed: false, notes: '' }] }));
    const removeActionRow = (idx: number) => setDraft(d => ({ ...d, actionItems: d.actionItems.filter((_, i) => i !== idx) }));
    const updateActionRow = (idx: number, patch: Partial<ActionItemDraft>) => setDraft(d => ({
        ...d, actionItems: d.actionItems.map((item, i) => i === idx ? { ...item, ...patch } : item)
    }));

    const startManualEdit = () => {
        if (!detail) return;
        setDraft({
            achievements: detail.achievements || '',
            career_goal: detail.career_goal || '',
            existing_skills: detail.existing_skills || '',
            development_area: detail.development_area || '',
            actionItems: (detail.action_items || []).filter(i => !i.is_mandatory).map(i => ({
                id: i.id, action_description: i.action_description, target_time: i.target_time || '',
                is_completed: !!i.is_completed, notes: i.notes || ''
            }))
        });
        setManualEditMode(true);
    };

    const savePlan = async (submit: boolean) => {
        const payload = {
            employee_id: currentUser?.employee_id,
            employee_name: currentUser?.name,
            job_position: myEmployee?.job_position || '',
            period_year: CURRENT_YEAR,
            achievements: draft.achievements,
            career_goal: draft.career_goal,
            existing_skills: draft.existing_skills,
            development_area: draft.development_area,
            action_items: draft.actionItems
        };

        try {
            let planId = currentYearPlan?.id;
            if (planId) {
                const res = await fetch(`${API_BASE_URL}/api/idp/${planId}`, {
                    method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload)
                });
                if (!res.ok) throw new Error((await res.json()).error || t('notifications.saveFailed'));
            } else {
                const res = await fetch(`${API_BASE_URL}/api/idp`, {
                    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload)
                });
                const data = await res.json();
                if (!res.ok) throw new Error(data.error || t('notifications.saveFailed'));
                planId = data.id;
            }
            if (submit && planId) {
                const res = await fetch(`${API_BASE_URL}/api/idp/${planId}/submit`, { method: 'POST' });
                if (!res.ok) throw new Error((await res.json()).error || t('notifications.submitFailed'));
            }
            const successMessage = submit ? t('notifications.submitSuccess') : manualEditMode ? t('notifications.updateSuccess') : t('notifications.saveSuccess');
            setNotification({ show: true, type: 'success', message: successMessage });
            if (manualEditMode) {
                setManualEditMode(false);
                if (planId) fetchDetail(planId);
            }
            fetchMyPlans();
        } catch (err: any) {
            setNotification({ show: true, type: 'error', message: err.message });
        }
    };

    // --- Team IDP: add review (first approval is handled by HR in IDPManager, not the supervisor) ---
    const [teamDetailId, setTeamDetailId] = useState<number | null>(null);
    const [teamDetail, setTeamDetail] = useState<IDPPlan | null>(null);
    const fetchTeamDetail = async (id: number) => {
        try {
            const res = await fetch(`${API_BASE_URL}/api/idp/${id}`);
            if (res.ok) setTeamDetail(await res.json());
        } catch (err) { console.error(err); }
    };
    const toggleTeamDetail = (id: number) => {
        if (teamDetailId === id) { setTeamDetailId(null); setTeamDetail(null); return; }
        setTeamDetailId(id);
        fetchTeamDetail(id);
    };

    const [reviewModalOpen, setReviewModalOpen] = useState(false);
    const [reviewDate, setReviewDate] = useState(new Date().toISOString().split('T')[0]);
    const [reviewNote, setReviewNote] = useState('');

    const submitReview = async () => {
        if (!teamDetailId || !reviewNote.trim()) return;
        try {
            await fetch(`${API_BASE_URL}/api/idp/${teamDetailId}/review`, {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ review_date: reviewDate, supervisor_note: reviewNote, reviewed_by: currentUser?.name })
            });
            setNotification({ show: true, type: 'success', message: t('notifications.reviewSuccess') });
            setReviewModalOpen(false);
            setReviewNote('');
            fetchTeamDetail(teamDetailId);
        } catch (err) { console.error(err); }
    };

    // Closes the yearly IDP cycle: the supervisor's own final sign-off, only available once HR has
    // approved the plan. Distinct from HR's approval — see the /api/idp/:id/final-approve endpoint.
    const finalApprovePlan = async (id: number) => {
        try {
            await fetch(`${API_BASE_URL}/api/idp/${id}/final-approve`, {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ approved_by: currentUser?.name })
            });
            setNotification({ show: true, type: 'success', message: t('notifications.finalApproveSuccess') });
            fetchTeamPlans();
            fetchTeamDetail(id);
        } catch (err) { console.error(err); }
    };

    const statusBadge = (status: string) => {
        const map: Record<string, string> = {
            Draft: 'bg-slate-100 text-slate-600 border-slate-200',
            Pending: 'bg-amber-50 text-amber-700 border-amber-200',
            Approved: 'bg-emerald-50 text-emerald-700 border-emerald-200',
            Rejected: 'bg-rose-50 text-rose-700 border-rose-200'
        };
        return (
            <span className={`px-3 py-1 rounded-full text-xs font-bold border ${map[status] || map.Draft}`}>
                {t(`status.${status}`, { defaultValue: status })}
            </span>
        );
    };

    const mandatoryItem = detail?.action_items?.find(i => i.is_mandatory);
    const totalJam = detail?.learningProgress?.totalJam || 0;
    const progressPct = Math.min(100, Math.round((totalJam / MANDATORY_TARGET_HOURS) * 100));

    return (
        <div className="space-y-6 animate-in fade-in max-w-5xl mx-auto">
            {notification.show && (
                <PopupNotification isOpen={notification.show} type={notification.type} message={notification.message} onClose={() => setNotification(n => ({ ...n, show: false }))} />
            )}

            <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-2xl bg-indigo-50 flex items-center justify-center shrink-0">
                    <Target className="w-6 h-6 text-indigo-600" />
                </div>
                <div>
                    <h1 className="text-2xl font-bold text-gray-800">{isSupervisor ? t('header.titleTeam') : t('header.title')}</h1>
                    <p className="text-gray-500 text-sm">{isSupervisor ? t('header.subtitleTeam') : t('header.subtitle', { year: CURRENT_YEAR })}</p>
                </div>
            </div>

            {/* ===== MY IDP (staff without direct reports) ===== */}
            {!isSupervisor && (
                <div className="space-y-6">
                    <div className="bg-white rounded-3xl border border-gray-100 shadow-sm p-6 space-y-6">
                        {currentYearPlan?.status === 'Rejected' && currentYearPlan.rejection_reason && (
                            <div className="p-3 bg-rose-50 border border-rose-100 rounded-lg text-sm text-rose-700">
                                <span className="font-semibold block mb-1">{t('form.rejectionReasonLabel')}</span>
                                <p>{currentYearPlan.rejection_reason}</p>
                            </div>
                        )}

                        {currentYearPlan?.hr_note && (
                            <div className="p-3 bg-amber-50 border border-amber-100 rounded-lg text-sm text-amber-800">
                                <span className="font-semibold block mb-1">{t('form.hrNoteLabel')}</span>
                                <p className="whitespace-pre-wrap">{currentYearPlan.hr_note}</p>
                            </div>
                        )}

                        {(isEditingForm || manualEditMode) ? (
                            <>
                                {currentYearPlan && <div className="flex justify-end">{statusBadge(currentYearPlan.status)}</div>}

                                <div className="overflow-x-auto rounded-xl border border-slate-300">
                                    <table className="w-full border-collapse table-fixed min-w-[780px]">
                                        <colgroup>
                                            <col className="w-[13%]" /><col className="w-[20%]" />
                                            <col className="w-[13%]" /><col className="w-[20%]" />
                                            <col className="w-[13%]" /><col className="w-[20%]" />
                                        </colgroup>
                                        <tbody>
                                            <tr>
                                                <td className={idpLabelCell}>{t('form.employeeName')}:</td>
                                                <td className={idpValueCell}>{currentUser?.name}</td>
                                                <td className={idpLabelCell}>{t('form.jobPosition')}:</td>
                                                <td className={idpValueCell}>{myEmployee?.job_position || '-'}</td>
                                                <td className={idpLabelCell}>{t('form.supervisor')}:</td>
                                                <td className={idpValueCell}>{currentYearPlan?.supervisor_name || myEmployee?.id_report_to || '-'}</td>
                                            </tr>
                                            <tr>
                                                <td className={idpLabelCell}>{t('form.period')}:</td>
                                                <td className={idpValueCell}>{CURRENT_YEAR}</td>
                                                <td className={idpLabelCell}>{t('form.department')}:</td>
                                                <td className={idpValueCell}>{currentYearPlan?.department || myEmployee?.organization_name || '-'}</td>
                                                <td className={idpLabelCell}>{t('form.joinDate')}:</td>
                                                <td className={idpValueCell}>{currentYearPlan?.join_date_label || formatIndoDate(myEmployee?.join_date) || '-'}</td>
                                            </tr>

                                            <tr><td colSpan={6} className={idpSectionHeaderCell}>{t('form.achievements')}</td></tr>
                                            <tr><td colSpan={6} className={idpHintCell}>{t('form.achievementsHint')}</td></tr>
                                            <tr><td colSpan={6} className={idpContentCell}>
                                                <textarea value={draft.achievements} onChange={e => setDraft(d => ({ ...d, achievements: e.target.value }))} rows={3} className="w-full bg-transparent outline-none resize-none" />
                                            </td></tr>

                                            <tr><td colSpan={6} className={idpSectionHeaderCell}>{t('form.careerGoal')}</td></tr>
                                            <tr><td colSpan={6} className={idpHintCell}>{t('form.careerGoalHint')}</td></tr>
                                            <tr><td colSpan={6} className={idpContentCell}>
                                                <textarea value={draft.career_goal} onChange={e => setDraft(d => ({ ...d, career_goal: e.target.value }))} rows={3} className="w-full bg-transparent outline-none resize-none" />
                                            </td></tr>

                                            <tr>
                                                <td colSpan={3} className={idpSectionHeaderCell}>{t('form.existingSkills')}</td>
                                                <td colSpan={3} className={idpSectionHeaderCell}>{t('form.developmentArea')}</td>
                                            </tr>
                                            <tr>
                                                <td colSpan={3} className={idpHintCell}>{t('form.existingSkillsHint')}</td>
                                                <td colSpan={3} className={idpHintCell}>{t('form.developmentAreaHint')}</td>
                                            </tr>
                                            <tr>
                                                <td colSpan={3} className={idpContentCell}>
                                                    <textarea value={draft.existing_skills} onChange={e => setDraft(d => ({ ...d, existing_skills: e.target.value }))} rows={3} className="w-full bg-transparent outline-none resize-none" />
                                                </td>
                                                <td colSpan={3} className={idpContentCell}>
                                                    <textarea value={draft.development_area} onChange={e => setDraft(d => ({ ...d, development_area: e.target.value }))} rows={3} className="w-full bg-transparent outline-none resize-none" />
                                                </td>
                                            </tr>

                                            <tr>
                                                <td colSpan={2} className={idpSectionHeaderCell}>{t('form.actionPlan')}</td>
                                                <td className={idpSectionHeaderCell}>{t('form.targetTime')}</td>
                                                <td className={idpSectionHeaderCell}>{t('form.checklistProgress')}</td>
                                                <td colSpan={2} className={idpSectionHeaderCell}>
                                                    <div className="flex items-center justify-between">
                                                        <span>{t('form.notes')}</span>
                                                        <button type="button" onClick={addActionRow} className="flex items-center gap-1 text-xs font-bold text-indigo-600 hover:text-indigo-700"><Plus size={14} /> {t('form.addRow')}</button>
                                                    </div>
                                                </td>
                                            </tr>
                                            <tr>
                                                <td colSpan={2} className={idpHintCell}>{t('form.actionPlanHint')}</td>
                                                <td className={idpHintCell}>{t('form.targetTimeHint')}</td>
                                                <td className={idpHintCell}>{t('form.checklistProgressHint')}</td>
                                                <td colSpan={2} className={idpHintCell}>{t('form.notesHint')}</td>
                                            </tr>

                                            {mandatoryItem ? (
                                                <tr>
                                                    <td colSpan={2} className={idpContentCell}>
                                                        <div className="flex items-center gap-2 text-indigo-700">
                                                            <Lock size={14} className="shrink-0" />
                                                            <span>{mandatoryItem.action_description}</span>
                                                        </div>
                                                    </td>
                                                    <td className={idpValueCell}>{mandatoryItem.target_time}</td>
                                                    <td className={`${idpValueCell} text-center`}>
                                                        <input type="checkbox" disabled readOnly checked={!!detail?.learningProgress && detail.learningProgress.totalJam >= detail.learningProgress.target} className="w-4 h-4 accent-indigo-600" />
                                                    </td>
                                                    <td colSpan={2} className={idpValueCell}>{t('form.mandatoryRowNote', { hours: MANDATORY_TARGET_HOURS })}</td>
                                                </tr>
                                            ) : (
                                                <tr>
                                                    <td colSpan={6} className={idpContentCell}>
                                                        <div className="flex items-center gap-2 text-indigo-700">
                                                            <Lock size={14} className="shrink-0" />
                                                            <span>{t('form.mandatoryRowNote', { hours: MANDATORY_TARGET_HOURS })}</span>
                                                        </div>
                                                    </td>
                                                </tr>
                                            )}

                                            {draft.actionItems.map((item, idx) => (
                                                <tr key={idx}>
                                                    <td colSpan={2} className={idpContentCell}>
                                                        <input value={item.action_description} onChange={e => updateActionRow(idx, { action_description: e.target.value })} placeholder={t('form.actionDescriptionPlaceholder')} className="w-full bg-transparent outline-none" />
                                                    </td>
                                                    <td className={idpValueCell}>
                                                        <input value={item.target_time} onChange={e => updateActionRow(idx, { target_time: e.target.value })} placeholder={t('form.targetTimePlaceholder')} className="w-full bg-transparent outline-none" />
                                                    </td>
                                                    <td className={`${idpValueCell} text-center`}>
                                                        <input type="checkbox" checked={!!item.is_completed} onChange={e => updateActionRow(idx, { is_completed: e.target.checked })} className="w-4 h-4 accent-indigo-600" />
                                                    </td>
                                                    <td colSpan={2} className={idpValueCell}>
                                                        <div className="flex items-center gap-2">
                                                            <input value={item.notes} onChange={e => updateActionRow(idx, { notes: e.target.value })} placeholder={t('form.notesPlaceholder')} className="flex-1 bg-transparent outline-none" />
                                                            <button type="button" onClick={() => removeActionRow(idx)} className="text-gray-400 hover:text-rose-600 transition-colors shrink-0"><Trash2 size={14} /></button>
                                                        </div>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>

                                <div className="flex gap-3 pt-2">
                                    {manualEditMode ? (
                                        <>
                                            <button onClick={() => setManualEditMode(false)} className="px-6 py-2.5 rounded-xl border border-gray-200 text-gray-600 font-bold text-sm hover:bg-gray-50 transition-colors">{t('form.cancel')}</button>
                                            <button onClick={() => savePlan(false)} className="px-6 py-2.5 rounded-xl bg-indigo-600 text-white font-bold text-sm hover:bg-indigo-700 transition-colors">{t('form.saveChanges')}</button>
                                        </>
                                    ) : (
                                        <>
                                            <button onClick={() => savePlan(false)} className="px-6 py-2.5 rounded-xl border border-gray-200 text-gray-600 font-bold text-sm hover:bg-gray-50 transition-colors">{t('form.saveDraft')}</button>
                                            <button onClick={() => savePlan(true)} className="px-6 py-2.5 rounded-xl bg-indigo-600 text-white font-bold text-sm hover:bg-indigo-700 transition-colors">{t('form.submit')}</button>
                                        </>
                                    )}
                                </div>
                            </>
                        ) : detail && (
                            <div className="space-y-6">
                                <div className="flex items-center justify-end gap-3">
                                    <button onClick={() => downloadIdpPdf(currentDetailRef.current, detail.period_year)} disabled={downloadingPeriod === detail.period_year} className="flex items-center gap-1.5 text-xs font-bold text-emerald-600 hover:text-emerald-700 disabled:opacity-50">
                                        <Download size={14} /> {downloadingPeriod === detail.period_year ? t('form.downloading') : t('form.download')}
                                    </button>
                                    <button onClick={startManualEdit} className="flex items-center gap-1.5 text-xs font-bold text-indigo-600 hover:text-indigo-700">
                                        <Pencil size={14} /> {t('form.editIdp')}
                                    </button>
                                    {statusBadge(detail.status)}
                                </div>
                                <div ref={currentDetailRef}>
                                    <IDPDetailInfoTable plan={detail} />
                                </div>

                                {mandatoryItem && (
                                    <div className="p-4 bg-indigo-50 border border-indigo-100 rounded-xl">
                                        <div className="flex items-center justify-between mb-2">
                                            <p className="text-sm font-semibold text-indigo-900">{mandatoryItem.action_description}</p>
                                            <span className="text-xs font-bold text-indigo-600">{totalJam} / {MANDATORY_TARGET_HOURS} {t('form.hours')}</span>
                                        </div>
                                        <div className="w-full h-2 bg-indigo-100 rounded-full overflow-hidden">
                                            <div className="h-full bg-indigo-600 rounded-full transition-all" style={{ width: `${progressPct}%` }} />
                                        </div>
                                    </div>
                                )}

                                {(detail.reviews || []).length > 0 && (
                                    <div>
                                        <label className="block text-sm font-semibold text-gray-700 mb-2">{t('form.reviewHistory')}</label>
                                        <div className="space-y-2">
                                            {detail.reviews!.map(review => (
                                                <div key={review.id} className="p-3 bg-gray-50 border border-gray-100 rounded-xl text-sm">
                                                    <p className="text-xs font-bold text-gray-400 mb-1">{new Date(review.review_date).toLocaleDateString()}</p>
                                                    <p className="text-gray-700">{review.supervisor_note}</p>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>

                    {pastPlans.length > 0 && (
                        <div>
                            <h3 className="text-sm font-bold text-gray-500 uppercase tracking-widest mb-3">{t('form.pastPlans')}</h3>
                            <div className="space-y-2">
                                {pastPlans.map(p => (
                                    <div key={p.id} className="bg-white border border-gray-100 rounded-2xl p-4">
                                        <button onClick={() => togglePastPlan(p.id)} className="w-full flex items-center justify-between text-left">
                                            <span className="flex items-center gap-2 font-semibold text-gray-700">
                                                <ChevronDown className={`w-4 h-4 text-indigo-600 transition-transform ${pastExpandedId === p.id ? 'rotate-180' : ''}`} />
                                                {t('form.period')} {p.period_year}
                                            </span>
                                            {statusBadge(p.status)}
                                        </button>

                                        {pastExpandedId === p.id && pastDetail && (
                                            <div className="mt-4 pt-4 border-t border-gray-100 space-y-3">
                                                <div className="flex justify-end">
                                                    <button onClick={() => downloadIdpPdf(pastDetailRef.current, p.period_year)} disabled={downloadingPeriod === p.period_year} className="flex items-center gap-1.5 text-xs font-bold text-emerald-600 hover:text-emerald-700 disabled:opacity-50">
                                                        <Download size={14} /> {downloadingPeriod === p.period_year ? t('form.downloading') : t('form.download')}
                                                    </button>
                                                </div>
                                                <div ref={pastDetailRef}>
                                                    <IDPDetailInfoTable plan={pastDetail} />
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            )}

            {/* ===== TEAM IDP (supervisors only — reviewing is their role here, not their own IDP) ===== */}
            {isSupervisor && (
                <div className="space-y-4">
                    {teamPlans.length > 0 && (
                        <div className="flex flex-wrap gap-3">
                            <div className="flex-1 min-w-[240px] relative">
                                <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-300" size={18} />
                                <input value={teamSearchQuery} onChange={e => setTeamSearchQuery(e.target.value)} placeholder={t('team.searchPlaceholder')} className="w-full pl-11 pr-4 py-3 bg-white border border-gray-100 rounded-2xl text-sm focus:border-indigo-300 outline-none" />
                            </div>
                            <select value={teamSelectedYear} onChange={e => setTeamSelectedYear(e.target.value === 'All' ? 'All' : Number(e.target.value))} className="px-4 py-3 bg-white border border-gray-100 rounded-2xl text-sm font-semibold focus:border-indigo-300 outline-none">
                                <option value="All">{t('admin.allYears')}</option>
                                {teamYears.map(y => <option key={y} value={y}>{y}</option>)}
                            </select>
                        </div>
                    )}

                    {filteredTeamPlans.length === 0 ? (
                        <div className="text-center py-16 bg-gradient-to-b from-slate-50 to-white rounded-3xl border border-dashed border-slate-300">
                            <Users className="w-8 h-8 text-emerald-500 mx-auto mb-3" />
                            <p className="text-slate-500">{teamPlans.length === 0 ? t('team.empty') : t('admin.empty')}</p>
                        </div>
                    ) : filteredTeamPlans.map(plan => (
                        <div key={plan.id} className="bg-white rounded-3xl border border-gray-100 shadow-sm p-6">
                            <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
                                <div>
                                    <p className="font-bold text-gray-800">{plan.employee_name}</p>
                                    <p className="text-xs text-gray-400">{t('team.idLabel', { id: plan.employee_id })} &middot; {t('form.period')} {plan.period_year}</p>
                                </div>
                                <div className="flex items-center gap-3">
                                    {statusBadge(plan.status)}
                                </div>
                            </div>
                            <button onClick={() => toggleTeamDetail(plan.id)} className="flex items-center gap-1.5 text-xs font-semibold text-indigo-600 hover:text-indigo-700">
                                <ChevronDown className={`w-4 h-4 transition-transform ${teamDetailId === plan.id ? 'rotate-180' : ''}`} />
                                {teamDetailId === plan.id ? t('team.hideDetail') : t('team.showDetail')}
                            </button>

                            {teamDetailId === plan.id && teamDetail && (
                                <div className="mt-4 pt-4 border-t border-gray-100 space-y-4">
                                    <IDPDetailInfoTable plan={teamDetail} />

                                    {teamDetail.hr_note && (
                                        <div className="p-3 bg-amber-50 border border-amber-100 rounded-lg text-sm text-amber-800">
                                            <span className="font-semibold block mb-1">{t('form.hrNoteLabel')}</span>
                                            <p className="whitespace-pre-wrap">{teamDetail.hr_note}</p>
                                        </div>
                                    )}

                                    {teamDetail.learningProgress && (
                                        <div className="p-3 bg-indigo-50 border border-indigo-100 rounded-xl flex items-center justify-between text-sm">
                                            <span className="font-semibold text-indigo-900 flex items-center gap-2"><Clock size={14} /> {t('form.mandatoryProgress')}</span>
                                            <span className="font-bold text-indigo-600">{teamDetail.learningProgress.totalJam} / {MANDATORY_TARGET_HOURS} {t('form.hours')}</span>
                                        </div>
                                    )}

                                    {plan.status === 'Approved' ? (
                                        <div className="flex flex-wrap items-center gap-3">
                                            <button onClick={() => { setReviewDate(new Date().toISOString().split('T')[0]); setReviewNote(''); setReviewModalOpen(true); }} className="flex items-center gap-1.5 px-4 py-2 bg-indigo-50 text-indigo-600 rounded-xl text-xs font-bold hover:bg-indigo-100 transition-colors">
                                                <MessageSquare size={14} /> {t('team.addReview')}
                                            </button>
                                            {teamDetail.supervisor_approved_date ? (
                                                <span className="flex items-center gap-1.5 text-xs font-semibold text-emerald-700">
                                                    <CheckCircle size={14} /> {t('team.finalApprovedOn', { date: new Date(teamDetail.supervisor_approved_date).toLocaleDateString('id-ID') })}
                                                </span>
                                            ) : (
                                                <button onClick={() => finalApprovePlan(plan.id)} className="flex items-center gap-1.5 px-4 py-2 bg-emerald-600 text-white rounded-xl text-xs font-bold hover:bg-emerald-700 transition-colors">
                                                    <CheckCircle size={14} /> {t('team.finalApprove')}
                                                </button>
                                            )}
                                        </div>
                                    ) : plan.status === 'Pending' && (
                                        <p className="text-xs text-amber-600">{t('team.awaitingHrApproval')}</p>
                                    )}

                                    {(teamDetail.reviews || []).length > 0 && (
                                        <div className="space-y-2">
                                            <label className="block text-sm font-semibold text-gray-700">{t('form.reviewHistory')}</label>
                                            {teamDetail.reviews!.map(review => (
                                                <div key={review.id} className="p-3 bg-gray-50 border border-gray-100 rounded-xl text-sm">
                                                    <p className="text-xs font-bold text-gray-400 mb-1">{new Date(review.review_date).toLocaleDateString()}</p>
                                                    <p className="text-gray-700">{review.supervisor_note}</p>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            )}

            {/* Add Review Modal */}
            {reviewModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
                    <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6">
                        <h3 className="text-xl font-bold text-slate-800 mb-4">{t('team.addReviewModalTitle')}</h3>
                        <label className="block text-sm font-semibold text-gray-700 mb-1">{t('team.reviewDate')}</label>
                        <input type="date" value={reviewDate} onChange={e => setReviewDate(e.target.value)} className="w-full px-4 py-2 border border-gray-200 rounded-xl focus:border-indigo-500 outline-none mb-4" />
                        <label className="block text-sm font-semibold text-gray-700 mb-1">{t('team.reviewNote')}</label>
                        <textarea
                            className="w-full border border-slate-300 rounded-xl p-3 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none resize-none"
                            rows={4}
                            placeholder={t('team.reviewNotePlaceholder')}
                            value={reviewNote}
                            onChange={e => setReviewNote(e.target.value)}
                        />
                        <div className="flex gap-3 mt-6">
                            <button onClick={() => setReviewModalOpen(false)} className="flex-1 px-4 py-2.5 rounded-xl border border-slate-300 text-slate-700 font-medium hover:bg-slate-50 transition-colors">{t('team.cancel')}</button>
                            <button onClick={submitReview} disabled={!reviewNote.trim()} className="flex-1 px-4 py-2.5 rounded-xl bg-indigo-600 text-white font-medium hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors">{t('team.saveReview')}</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
