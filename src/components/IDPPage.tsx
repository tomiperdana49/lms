import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import {
    Target,
    Users,
    CheckCircle,
    XCircle,
    Plus,
    Trash2,
    ChevronDown,
    Clock,
    MessageSquare,
    ShieldCheck,
    Lock
} from 'lucide-react';
import { API_BASE_URL } from '../config';
import type { User, IDPPlan, IDPActionItem, Employee } from '../types';
import PopupNotification from './PopupNotification';

type TabType = 'my_idp' | 'team_idp';

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

const emptyDraft = () => ({
    department: '',
    join_date_label: '',
    achievements: '',
    career_goal: '',
    existing_skills: '',
    development_area: '',
    actionItems: [] as ActionItemDraft[]
});

export default function IDPPage({ currentUser }: IDPPageProps) {
    const { t } = useTranslation('idpPage');
    const isSupervisor = !!currentUser?.isSupervisor;
    const [activeTab, setActiveTab] = useState<TabType>('my_idp');

    useEffect(() => {
        if (activeTab === 'team_idp' && !isSupervisor) setActiveTab('my_idp');
    }, [activeTab, isSupervisor]);

    const [myPlans, setMyPlans] = useState<IDPPlan[]>([]);
    const [teamPlans, setTeamPlans] = useState<IDPPlan[]>([]);
    const [employees, setEmployees] = useState<Employee[]>([]);
    const [notification, setNotification] = useState<{ show: boolean; type: 'success' | 'error'; message: string }>({ show: false, type: 'success', message: '' });

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
        if (activeTab === 'my_idp') fetchMyPlans();
        if (activeTab === 'team_idp') fetchTeamPlans();
    }, [activeTab, currentUser]);

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

    // --- Create/Edit form (Draft/Rejected, or brand-new plan) ---
    const [draft, setDraft] = useState(emptyDraft());
    const [isEditingForm, setIsEditingForm] = useState(false);

    useEffect(() => {
        if (!currentYearPlan) {
            setDraft(emptyDraft());
            setIsEditingForm(true);
            return;
        }
        if (['Draft', 'Rejected'].includes(currentYearPlan.status) && detail) {
            setDraft({
                department: detail.department || '',
                join_date_label: detail.join_date_label || '',
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

    const savePlan = async (submit: boolean) => {
        const payload = {
            employee_id: currentUser?.employee_id,
            employee_name: currentUser?.name,
            job_position: myEmployee?.job_position || '',
            department: draft.department,
            period_year: CURRENT_YEAR,
            join_date_label: draft.join_date_label,
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
            setNotification({ show: true, type: 'success', message: submit ? t('notifications.submitSuccess') : t('notifications.saveSuccess') });
            fetchMyPlans();
        } catch (err: any) {
            setNotification({ show: true, type: 'error', message: err.message });
        }
    };

    // --- Action item quick-toggle (available on Pending/Approved plans, and on the mandatory row's display) ---
    const toggleActionItem = async (item: IDPActionItem, isCompleted: boolean) => {
        try {
            await fetch(`${API_BASE_URL}/api/idp/action-items/${item.id}`, {
                method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ is_completed: isCompleted })
            });
            if (currentYearPlan?.id) fetchDetail(currentYearPlan.id);
        } catch (err) { console.error(err); }
    };

    const updateActionItemNotes = async (item: IDPActionItem, notes: string) => {
        try {
            await fetch(`${API_BASE_URL}/api/idp/action-items/${item.id}`, {
                method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ notes })
            });
        } catch (err) { console.error(err); }
    };

    // --- Team IDP: approve/reject + add review ---
    const [rejectModalOpen, setRejectModalOpen] = useState(false);
    const [rejectTargetId, setRejectTargetId] = useState<number | null>(null);
    const [rejectionReason, setRejectionReason] = useState('');

    const approvePlan = async (id: number) => {
        try {
            await fetch(`${API_BASE_URL}/api/idp/${id}/approve`, {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ status: 'Approved', approved_by: currentUser?.name })
            });
            setNotification({ show: true, type: 'success', message: t('notifications.approveSuccess') });
            fetchTeamPlans();
            if (teamDetailId === id) fetchTeamDetail(id);
        } catch (err) { console.error(err); }
    };

    const confirmReject = async () => {
        if (!rejectTargetId || !rejectionReason.trim()) return;
        try {
            await fetch(`${API_BASE_URL}/api/idp/${rejectTargetId}/approve`, {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ status: 'Rejected', rejection_reason: rejectionReason })
            });
            setNotification({ show: true, type: 'success', message: t('notifications.rejectSuccess') });
            setRejectModalOpen(false);
            setRejectionReason('');
            fetchTeamPlans();
        } catch (err) { console.error(err); }
    };

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
                    <h1 className="text-2xl font-bold text-gray-800">{t('header.title')}</h1>
                    <p className="text-gray-500 text-sm">{t('header.subtitle', { year: CURRENT_YEAR })}</p>
                </div>
            </div>

            <div className="flex gap-2 border-b border-gray-200">
                <button onClick={() => setActiveTab('my_idp')} className={`px-4 py-2.5 font-semibold text-sm border-b-2 transition-colors ${activeTab === 'my_idp' ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-gray-400 hover:text-gray-600'}`}>
                    {t('tabs.myIdp')}
                </button>
                {isSupervisor && (
                    <button onClick={() => setActiveTab('team_idp')} className={`px-4 py-2.5 font-semibold text-sm border-b-2 transition-colors ${activeTab === 'team_idp' ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-gray-400 hover:text-gray-600'}`}>
                        {t('tabs.teamIdp')}
                    </button>
                )}
            </div>

            {/* ===== MY IDP ===== */}
            {activeTab === 'my_idp' && (
                <div className="space-y-6">
                    <div className="bg-white rounded-3xl border border-gray-100 shadow-sm p-6 space-y-6">
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
                            <div><p className="text-gray-400 text-xs font-bold uppercase tracking-widest mb-1">{t('form.employeeName')}</p><p className="font-semibold text-gray-800">{currentUser?.name}</p></div>
                            <div><p className="text-gray-400 text-xs font-bold uppercase tracking-widest mb-1">{t('form.jobPosition')}</p><p className="font-semibold text-gray-800">{myEmployee?.job_position || '-'}</p></div>
                            <div><p className="text-gray-400 text-xs font-bold uppercase tracking-widest mb-1">{t('form.period')}</p><p className="font-semibold text-gray-800">{CURRENT_YEAR}</p></div>
                            {currentYearPlan && <div>{statusBadge(currentYearPlan.status)}</div>}
                        </div>

                        {currentYearPlan?.status === 'Rejected' && currentYearPlan.rejection_reason && (
                            <div className="p-3 bg-rose-50 border border-rose-100 rounded-lg text-sm text-rose-700">
                                <span className="font-semibold block mb-1">{t('form.rejectionReasonLabel')}</span>
                                <p>{currentYearPlan.rejection_reason}</p>
                            </div>
                        )}

                        {isEditingForm ? (
                            <>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-sm font-semibold text-gray-700 mb-1">{t('form.department')}</label>
                                        <input value={draft.department} onChange={e => setDraft(d => ({ ...d, department: e.target.value }))} className="w-full px-4 py-2 border border-gray-200 rounded-xl focus:border-indigo-500 outline-none" placeholder={t('form.departmentPlaceholder')} />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-semibold text-gray-700 mb-1">{t('form.joinDate')}</label>
                                        <input value={draft.join_date_label} onChange={e => setDraft(d => ({ ...d, join_date_label: e.target.value }))} className="w-full px-4 py-2 border border-gray-200 rounded-xl focus:border-indigo-500 outline-none" placeholder={t('form.joinDatePlaceholder')} />
                                    </div>
                                </div>
                                <div>
                                    <label className="block text-sm font-semibold text-gray-700 mb-1">{t('form.achievements')}</label>
                                    <p className="text-xs text-gray-400 mb-1">{t('form.achievementsHint')}</p>
                                    <textarea value={draft.achievements} onChange={e => setDraft(d => ({ ...d, achievements: e.target.value }))} rows={4} className="w-full px-4 py-2 border border-gray-200 rounded-xl focus:border-indigo-500 outline-none resize-none" />
                                </div>
                                <div>
                                    <label className="block text-sm font-semibold text-gray-700 mb-1">{t('form.careerGoal')}</label>
                                    <p className="text-xs text-gray-400 mb-1">{t('form.careerGoalHint')}</p>
                                    <textarea value={draft.career_goal} onChange={e => setDraft(d => ({ ...d, career_goal: e.target.value }))} rows={4} className="w-full px-4 py-2 border border-gray-200 rounded-xl focus:border-indigo-500 outline-none resize-none" />
                                </div>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-sm font-semibold text-gray-700 mb-1">{t('form.existingSkills')}</label>
                                        <p className="text-xs text-gray-400 mb-1">{t('form.existingSkillsHint')}</p>
                                        <textarea value={draft.existing_skills} onChange={e => setDraft(d => ({ ...d, existing_skills: e.target.value }))} rows={4} className="w-full px-4 py-2 border border-gray-200 rounded-xl focus:border-indigo-500 outline-none resize-none" />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-semibold text-gray-700 mb-1">{t('form.developmentArea')}</label>
                                        <p className="text-xs text-gray-400 mb-1">{t('form.developmentAreaHint')}</p>
                                        <textarea value={draft.development_area} onChange={e => setDraft(d => ({ ...d, development_area: e.target.value }))} rows={4} className="w-full px-4 py-2 border border-gray-200 rounded-xl focus:border-indigo-500 outline-none resize-none" />
                                    </div>
                                </div>

                                <div>
                                    <div className="flex items-center justify-between mb-2">
                                        <label className="block text-sm font-semibold text-gray-700">{t('form.actionPlan')}</label>
                                        <button type="button" onClick={addActionRow} className="flex items-center gap-1 text-xs font-bold text-indigo-600 hover:text-indigo-700"><Plus size={14} /> {t('form.addRow')}</button>
                                    </div>
                                    <p className="text-xs text-gray-400 mb-3">{t('form.actionPlanHint')}</p>
                                    <div className="flex items-center gap-2 p-3 bg-indigo-50 border border-indigo-100 rounded-xl text-sm text-indigo-700 mb-3">
                                        <Lock size={14} className="shrink-0" />
                                        {t('form.mandatoryRowNote', { hours: MANDATORY_TARGET_HOURS })}
                                    </div>
                                    <div className="space-y-3">
                                        {draft.actionItems.map((item, idx) => (
                                            <div key={idx} className="flex gap-2 items-start p-3 bg-gray-50 border border-gray-100 rounded-xl">
                                                <div className="flex-1 grid grid-cols-1 sm:grid-cols-[1fr_140px] gap-2">
                                                    <input value={item.action_description} onChange={e => updateActionRow(idx, { action_description: e.target.value })} placeholder={t('form.actionDescriptionPlaceholder')} className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:border-indigo-500 outline-none" />
                                                    <input value={item.target_time} onChange={e => updateActionRow(idx, { target_time: e.target.value })} placeholder={t('form.targetTimePlaceholder')} className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:border-indigo-500 outline-none" />
                                                </div>
                                                <button type="button" onClick={() => removeActionRow(idx)} className="p-2 text-gray-400 hover:text-rose-600 transition-colors"><Trash2 size={16} /></button>
                                            </div>
                                        ))}
                                    </div>
                                </div>

                                <div className="flex gap-3 pt-2">
                                    <button onClick={() => savePlan(false)} className="px-6 py-2.5 rounded-xl border border-gray-200 text-gray-600 font-bold text-sm hover:bg-gray-50 transition-colors">{t('form.saveDraft')}</button>
                                    <button onClick={() => savePlan(true)} className="px-6 py-2.5 rounded-xl bg-indigo-600 text-white font-bold text-sm hover:bg-indigo-700 transition-colors">{t('form.submit')}</button>
                                </div>
                            </>
                        ) : detail && (
                            <div className="space-y-6">
                                <ReadonlyField label={t('form.achievements')} value={detail.achievements} />
                                <ReadonlyField label={t('form.careerGoal')} value={detail.career_goal} />
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                    <ReadonlyField label={t('form.existingSkills')} value={detail.existing_skills} />
                                    <ReadonlyField label={t('form.developmentArea')} value={detail.development_area} />
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

                                <div>
                                    <label className="block text-sm font-semibold text-gray-700 mb-2">{t('form.actionPlan')}</label>
                                    <div className="space-y-2">
                                        {(detail.action_items || []).filter(i => !i.is_mandatory).map(item => (
                                            <div key={item.id} className="flex items-start gap-3 p-3 bg-gray-50 border border-gray-100 rounded-xl">
                                                <input type="checkbox" checked={!!item.is_completed} onChange={e => toggleActionItem(item, e.target.checked)} className="mt-1 w-4 h-4 rounded border-gray-300 text-indigo-600" />
                                                <div className="flex-1">
                                                    <p className={`text-sm font-medium ${item.is_completed ? 'text-gray-400 line-through' : 'text-gray-800'}`}>{item.action_description}</p>
                                                    {item.target_time && <p className="text-xs text-gray-400">{item.target_time}</p>}
                                                    <input
                                                        defaultValue={item.notes || ''}
                                                        onBlur={e => updateActionItemNotes(item, e.target.value)}
                                                        placeholder={t('form.notesPlaceholder')}
                                                        className="mt-1.5 w-full px-2 py-1.5 text-xs border border-gray-200 rounded-lg focus:border-indigo-500 outline-none"
                                                    />
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>

                                {(detail.reviews || []).length > 0 && (
                                    <div>
                                        <label className="block text-sm font-semibold text-gray-700 mb-2">{t('form.reviewHistory')}</label>
                                        <div className="space-y-2">
                                            {detail.reviews!.map(review => (
                                                <div key={review.id} className="p-3 bg-gray-50 border border-gray-100 rounded-xl text-sm">
                                                    <p className="text-xs font-bold text-gray-400 mb-1">{new Date(review.review_date).toLocaleDateString()}</p>
                                                    <p className="text-gray-700">{review.supervisor_note}</p>
                                                    {review.hr_note && (
                                                        <div className="mt-2 pt-2 border-t border-gray-200 flex items-start gap-2">
                                                            <ShieldCheck size={14} className="text-emerald-600 mt-0.5 shrink-0" />
                                                            <p className="text-xs text-emerald-700">{review.hr_note}</p>
                                                        </div>
                                                    )}
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
                                    <div key={p.id} className="flex items-center justify-between p-4 bg-white border border-gray-100 rounded-2xl">
                                        <span className="font-semibold text-gray-700">{t('form.period')} {p.period_year}</span>
                                        {statusBadge(p.status)}
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            )}

            {/* ===== TEAM IDP ===== */}
            {activeTab === 'team_idp' && (
                <div className="space-y-4">
                    {teamPlans.length === 0 ? (
                        <div className="text-center py-16 bg-gradient-to-b from-slate-50 to-white rounded-3xl border border-dashed border-slate-300">
                            <Users className="w-8 h-8 text-emerald-500 mx-auto mb-3" />
                            <p className="text-slate-500">{t('team.empty')}</p>
                        </div>
                    ) : teamPlans.map(plan => (
                        <div key={plan.id} className="bg-white rounded-3xl border border-gray-100 shadow-sm p-6">
                            <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
                                <div>
                                    <p className="font-bold text-gray-800">{plan.employee_name}</p>
                                    <p className="text-xs text-gray-400">{t('team.idLabel', { id: plan.employee_id })} &middot; {t('form.period')} {plan.period_year}</p>
                                </div>
                                <div className="flex items-center gap-3">
                                    {statusBadge(plan.status)}
                                    {plan.status === 'Pending' && (
                                        <>
                                            <button onClick={() => approvePlan(plan.id)} className="flex items-center gap-1.5 px-4 py-2 bg-emerald-600 text-white rounded-xl text-xs font-bold hover:bg-emerald-700 transition-colors"><CheckCircle size={14} /> {t('team.approve')}</button>
                                            <button onClick={() => { setRejectTargetId(plan.id); setRejectModalOpen(true); }} className="flex items-center gap-1.5 px-4 py-2 bg-white border border-rose-200 text-rose-600 rounded-xl text-xs font-bold hover:bg-rose-50 transition-colors"><XCircle size={14} /> {t('team.reject')}</button>
                                        </>
                                    )}
                                </div>
                            </div>
                            <button onClick={() => toggleTeamDetail(plan.id)} className="flex items-center gap-1.5 text-xs font-semibold text-indigo-600 hover:text-indigo-700">
                                <ChevronDown className={`w-4 h-4 transition-transform ${teamDetailId === plan.id ? 'rotate-180' : ''}`} />
                                {teamDetailId === plan.id ? t('team.hideDetail') : t('team.showDetail')}
                            </button>

                            {teamDetailId === plan.id && teamDetail && (
                                <div className="mt-4 pt-4 border-t border-gray-100 space-y-4">
                                    <ReadonlyField label={t('form.achievements')} value={teamDetail.achievements} />
                                    <ReadonlyField label={t('form.careerGoal')} value={teamDetail.career_goal} />
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                        <ReadonlyField label={t('form.existingSkills')} value={teamDetail.existing_skills} />
                                        <ReadonlyField label={t('form.developmentArea')} value={teamDetail.development_area} />
                                    </div>

                                    {teamDetail.learningProgress && (
                                        <div className="p-3 bg-indigo-50 border border-indigo-100 rounded-xl flex items-center justify-between text-sm">
                                            <span className="font-semibold text-indigo-900 flex items-center gap-2"><Clock size={14} /> {t('form.mandatoryProgress')}</span>
                                            <span className="font-bold text-indigo-600">{teamDetail.learningProgress.totalJam} / {MANDATORY_TARGET_HOURS} {t('form.hours')}</span>
                                        </div>
                                    )}

                                    <div>
                                        <label className="block text-sm font-semibold text-gray-700 mb-2">{t('form.actionPlan')}</label>
                                        <div className="space-y-1.5">
                                            {(teamDetail.action_items || []).filter(i => !i.is_mandatory).map(item => (
                                                <div key={item.id} className="flex items-center gap-2 text-sm text-gray-700">
                                                    <span className={item.is_completed ? 'text-emerald-600' : 'text-gray-300'}>{item.is_completed ? '✓' : '○'}</span>
                                                    {item.action_description}
                                                </div>
                                            ))}
                                        </div>
                                    </div>

                                    {plan.status === 'Approved' && (
                                        <button onClick={() => { setReviewDate(new Date().toISOString().split('T')[0]); setReviewNote(''); setReviewModalOpen(true); }} className="flex items-center gap-1.5 px-4 py-2 bg-indigo-50 text-indigo-600 rounded-xl text-xs font-bold hover:bg-indigo-100 transition-colors">
                                            <MessageSquare size={14} /> {t('team.addReview')}
                                        </button>
                                    )}

                                    {(teamDetail.reviews || []).length > 0 && (
                                        <div className="space-y-2">
                                            <label className="block text-sm font-semibold text-gray-700">{t('form.reviewHistory')}</label>
                                            {teamDetail.reviews!.map(review => (
                                                <div key={review.id} className="p-3 bg-gray-50 border border-gray-100 rounded-xl text-sm">
                                                    <p className="text-xs font-bold text-gray-400 mb-1">{new Date(review.review_date).toLocaleDateString()}</p>
                                                    <p className="text-gray-700">{review.supervisor_note}</p>
                                                    {review.hr_note ? (
                                                        <div className="mt-2 pt-2 border-t border-gray-200 flex items-start gap-2">
                                                            <ShieldCheck size={14} className="text-emerald-600 mt-0.5 shrink-0" />
                                                            <p className="text-xs text-emerald-700">{review.hr_note}</p>
                                                        </div>
                                                    ) : (
                                                        <p className="text-xs text-gray-400 mt-1.5">{t('form.awaitingHrVerification')}</p>
                                                    )}
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

            {/* Reject Modal */}
            {rejectModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
                    <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6">
                        <h3 className="text-xl font-bold text-slate-800 mb-2">{t('team.rejectModalTitle')}</h3>
                        <textarea
                            className="w-full border border-slate-300 rounded-xl p-3 focus:ring-2 focus:ring-rose-500 focus:border-rose-500 outline-none resize-none"
                            rows={4}
                            placeholder={t('team.rejectionReasonPlaceholder')}
                            value={rejectionReason}
                            onChange={e => setRejectionReason(e.target.value)}
                        />
                        <div className="flex gap-3 mt-6">
                            <button onClick={() => { setRejectModalOpen(false); setRejectionReason(''); }} className="flex-1 px-4 py-2.5 rounded-xl border border-slate-300 text-slate-700 font-medium hover:bg-slate-50 transition-colors">{t('team.cancel')}</button>
                            <button onClick={confirmReject} disabled={!rejectionReason.trim()} className="flex-1 px-4 py-2.5 rounded-xl bg-rose-600 text-white font-medium hover:bg-rose-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors">{t('team.confirmReject')}</button>
                        </div>
                    </div>
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

const ReadonlyField = ({ label, value }: { label: string; value?: string }) => (
    <div>
        <p className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-1">{label}</p>
        <p className="text-gray-700 text-sm whitespace-pre-wrap">{value || '-'}</p>
    </div>
);
