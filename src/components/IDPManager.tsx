import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Target, Search, ChevronDown, Download, Clock, CheckCircle, XCircle, MessageSquare } from 'lucide-react';
import * as XLSX from 'xlsx';
import { API_BASE_URL } from '../config';
import type { IDPPlan } from '../types';
import IDPDetailInfoTable from './IDPDetailInfoTable';

interface IDPManagerProps {
    userRole: string;
    userName?: string;
}

const MANDATORY_TARGET_HOURS = 48;

// Builds the monthly review strip: one entry per calendar month from when the employee created the
// IDP through the current month (or through December if the plan's period year has already fully
// elapsed), marking whether a supervisor review landed in that month.
const reviewMonthStrip = (plan: IDPPlan): { index: number; reviewed: boolean }[] => {
    if (!plan.created_by_date) return [];
    const start = new Date(plan.created_by_date);
    if (isNaN(start.getTime())) return [];

    const now = new Date();
    const startY = start.getFullYear();
    const startM = start.getMonth();
    const endY = plan.period_year < now.getFullYear() ? plan.period_year : now.getFullYear();
    const endM = plan.period_year < now.getFullYear() ? 11 : now.getMonth();

    const reviewedSet = new Set((plan.reviewed_year_months || '').split(',').filter(Boolean));

    const months: { index: number; reviewed: boolean }[] = [];
    let y = startY, m = startM, index = 1;
    while ((y < endY || (y === endY && m <= endM)) && index <= 36) {
        const key = `${y}-${String(m + 1).padStart(2, '0')}`;
        months.push({ index, reviewed: reviewedSet.has(key) });
        index++;
        m++;
        if (m > 11) { m = 0; y++; }
    }
    return months;
};

// Whether the plan already has a supervisor review logged for the current calendar month.
const isReviewedThisMonth = (plan: IDPPlan): boolean => {
    const now = new Date();
    const currentKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    return (plan.reviewed_year_months || '').split(',').includes(currentKey);
};

export default function IDPManager({ userName }: IDPManagerProps) {
    const { t } = useTranslation('idpPage');
    const [plans, setPlans] = useState<IDPPlan[]>([]);
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedYear, setSelectedYear] = useState<number | 'All'>(new Date().getFullYear());
    const [onlyNotReviewedThisMonth, setOnlyNotReviewedThisMonth] = useState(false);
    const [onlyPendingHrApproval, setOnlyPendingHrApproval] = useState(false);

    const fetchPlans = async () => {
        try {
            const res = await fetch(`${API_BASE_URL}/api/idp/all`);
            if (res.ok) setPlans(await res.json());
        } catch (err) { console.error(err); }
    };

    useEffect(() => { fetchPlans(); }, []);

    const years = Array.from(new Set(plans.map(p => p.period_year))).sort((a, b) => b - a);

    const filteredPlans = plans.filter(p => {
        if (selectedYear !== 'All' && p.period_year !== selectedYear) return false;
        if (searchQuery) {
            const q = searchQuery.toLowerCase();
            if (!p.employee_name?.toLowerCase().includes(q) && !p.employee_id?.toLowerCase().includes(q)) return false;
        }
        if (onlyNotReviewedThisMonth && (p.status !== 'Approved' || isReviewedThisMonth(p))) return false;
        if (onlyPendingHrApproval && p.status !== 'Pending') return false;
        return true;
    });

    const [expandedId, setExpandedId] = useState<number | null>(null);
    const [detail, setDetail] = useState<IDPPlan | null>(null);
    const [hrNoteDraft, setHrNoteDraft] = useState('');
    const [savingHrNote, setSavingHrNote] = useState(false);

    const toggleExpand = async (id: number) => {
        if (expandedId === id) { setExpandedId(null); setDetail(null); return; }
        setExpandedId(id);
        try {
            const res = await fetch(`${API_BASE_URL}/api/idp/${id}`);
            if (res.ok) {
                const data = await res.json();
                setDetail(data);
                setHrNoteDraft(data.hr_note || '');
            }
        } catch (err) { console.error(err); }
    };

    // --- HR feedback note: general guidance on what's missing/needs adding, independent of approve/reject ---
    const saveHrNote = async (id: number) => {
        setSavingHrNote(true);
        try {
            await fetch(`${API_BASE_URL}/api/idp/${id}/hr-note`, {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ hr_note: hrNoteDraft })
            });
            setDetail(d => d ? { ...d, hr_note: hrNoteDraft } : d);
            fetchPlans();
        } catch (err) { console.error(err); } finally { setSavingHrNote(false); }
    };

    // --- HR approval: the first approval step on a submitted (Pending) IDP. Only after this does
    // the employee's supervisor gain the ability to log monthly 1-on-1 reviews (see IDPPage.tsx).
    const [rejectModalOpen, setRejectModalOpen] = useState(false);
    const [rejectTargetId, setRejectTargetId] = useState<number | null>(null);
    const [rejectionReason, setRejectionReason] = useState('');

    const approvePlan = async (id: number) => {
        try {
            await fetch(`${API_BASE_URL}/api/idp/${id}/approve`, {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ status: 'Approved', approved_by: userName })
            });
            fetchPlans();
            if (expandedId === id) {
                const res = await fetch(`${API_BASE_URL}/api/idp/${id}`);
                if (res.ok) setDetail(await res.json());
            }
        } catch (err) { console.error(err); }
    };

    const confirmReject = async () => {
        if (!rejectTargetId || !rejectionReason.trim()) return;
        try {
            await fetch(`${API_BASE_URL}/api/idp/${rejectTargetId}/approve`, {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ status: 'Rejected', rejection_reason: rejectionReason })
            });
            setRejectModalOpen(false);
            setRejectionReason('');
            setRejectTargetId(null);
            fetchPlans();
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

    // Per-employee export matching the original spreadsheet template layout: one sheet per plan, with
    // a header block, narrative sections, the action-item table, and the review/HR-verification table.
    const exportExcel = async () => {
        const wb = XLSX.utils.book_new();

        for (const plan of filteredPlans) {
            let full = plan;
            try {
                const res = await fetch(`${API_BASE_URL}/api/idp/${plan.id}`);
                if (res.ok) full = await res.json();
            } catch (e) { /* fall back to summary row */ }

            const rows: any[][] = [
                ['Nama Karyawan:', full.employee_name || '', '', 'Jabatan:', full.job_position || ''],
                ['Atasan Langsung:', full.supervisor_name || '', '', 'Periode IDP:', full.period_year],
                ['Departemen:', full.department || '', '', 'Tanggal Mulai Bekerja:', full.join_date_label || ''],
                [],
                ['Pencapaian / Prestasi Kerja'],
                [full.achievements || ''],
                [],
                ['Tujuan / Aspirasi Karir (Goal)'],
                [full.career_goal || ''],
                [],
                ['Skill yang Dimiliki', '', '', 'Area Pengembangan'],
                [full.existing_skills || '', '', '', full.development_area || ''],
                [],
                ['Rencana Aksi Pengembangan', 'Target Waktu', 'Checklist Progress', 'Keterangan']
            ];

            for (const item of full.action_items || []) {
                rows.push([item.action_description, item.target_time || '', item.is_completed ? 'TRUE' : 'FALSE', item.notes || '']);
            }

            rows.push([]);
            rows.push(['Tanggal IDP Dibuat oleh Karyawan:', full.created_by_date ? new Date(full.created_by_date).toLocaleDateString('id-ID') : '', '', 'Tanggal IDP Disetujui oleh HR:', full.approved_date ? new Date(full.approved_date).toLocaleDateString('id-ID') : '']);
            rows.push([]);
            rows.push(['Tanggal Review', 'Evaluasi IDP (diisi oleh atasan langsung)']);
            for (const review of full.reviews || []) {
                rows.push([
                    new Date(review.review_date).toLocaleDateString('id-ID'),
                    review.supervisor_note
                ]);
            }

            const ws = XLSX.utils.aoa_to_sheet(rows);
            ws['!cols'] = [{ wch: 30 }, { wch: 35 }, { wch: 18 }, { wch: 22 }, { wch: 35 }];
            const sheetName = (full.employee_name || `IDP ${full.id}`).slice(0, 31).replace(/[[\]*/\\?:]/g, '');
            XLSX.utils.book_append_sheet(wb, ws, sheetName);
        }

        if (filteredPlans.length === 0) {
            XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['Tidak ada data']]), 'IDP');
        }

        const periodLabel = selectedYear === 'All' ? 'AllYears' : String(selectedYear);
        XLSX.writeFile(wb, `IDP_${periodLabel}.xlsx`);
    };

    return (
        <div className="space-y-6 animate-in fade-in max-w-6xl mx-auto">
            <div className="flex flex-wrap items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-2xl bg-indigo-50 flex items-center justify-center shrink-0">
                        <Target className="w-6 h-6 text-indigo-600" />
                    </div>
                    <div>
                        <h1 className="text-2xl font-bold text-gray-800">{t('admin.title')}</h1>
                        <p className="text-gray-500 text-sm">{t('admin.subtitle')}</p>
                    </div>
                </div>
                <button onClick={exportExcel} className="flex items-center gap-2 px-5 py-3 rounded-2xl text-xs font-black tracking-widest bg-emerald-600 text-white shadow-sm hover:bg-emerald-700 transition-all">
                    <Download size={16} /> EXPORT
                </button>
            </div>

            <div className="flex flex-wrap gap-3">
                <div className="flex-1 min-w-[240px] relative">
                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-300" size={18} />
                    <input value={searchQuery} onChange={e => setSearchQuery(e.target.value)} placeholder={t('admin.searchPlaceholder')} className="w-full pl-11 pr-4 py-3 bg-white border border-gray-100 rounded-2xl text-sm focus:border-indigo-300 outline-none" />
                </div>
                <select value={selectedYear} onChange={e => setSelectedYear(e.target.value === 'All' ? 'All' : Number(e.target.value))} className="px-4 py-3 bg-white border border-gray-100 rounded-2xl text-sm font-semibold focus:border-indigo-300 outline-none">
                    <option value="All">{t('admin.allYears')}</option>
                    {years.map(y => <option key={y} value={y}>{y}</option>)}
                </select>
                <button
                    onClick={() => setOnlyPendingHrApproval(v => !v)}
                    className={`px-4 py-3 rounded-2xl text-sm font-semibold border transition-colors ${onlyPendingHrApproval ? 'bg-amber-600 border-amber-600 text-white' : 'bg-white border-gray-100 text-gray-600 hover:border-amber-200'}`}
                >
                    {t('admin.pendingHrApprovalFilter')}
                </button>
                <button
                    onClick={() => setOnlyNotReviewedThisMonth(v => !v)}
                    className={`px-4 py-3 rounded-2xl text-sm font-semibold border transition-colors ${onlyNotReviewedThisMonth ? 'bg-rose-600 border-rose-600 text-white' : 'bg-white border-gray-100 text-gray-600 hover:border-rose-200'}`}
                >
                    {t('admin.notReviewedThisMonthFilter')}
                </button>
            </div>

            <div className="space-y-3">
                {filteredPlans.length === 0 ? (
                    <div className="text-center py-16 bg-gradient-to-b from-slate-50 to-white rounded-3xl border border-dashed border-slate-300 text-gray-400">
                        {t('admin.empty')}
                    </div>
                ) : filteredPlans.map(plan => (
                    <div key={plan.id} className="bg-white rounded-3xl border border-gray-100 shadow-sm p-6">
                        <div className="flex flex-wrap items-center justify-between gap-3">
                            <div>
                                <p className="font-bold text-gray-800">{plan.employee_name}</p>
                                <p className="text-xs text-gray-400">{t('team.idLabel', { id: plan.employee_id })} &middot; {plan.department || '-'} &middot; {t('form.period')} {plan.period_year} &middot; {t('form.supervisor')}: {plan.supervisor_name || '-'}</p>
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

                        {plan.status === 'Approved' && (() => {
                            const strip = reviewMonthStrip(plan);
                            return strip.length > 0 && (
                                <div className="mt-3 flex items-center flex-wrap gap-2">
                                    <span className="text-xs font-semibold text-gray-400">{t('admin.reviewStripLabel')}</span>
                                    {strip.map(({ index, reviewed }) => (
                                        <span
                                            key={index}
                                            title={reviewed ? t('admin.reviewedThisMonth') : t('admin.notReviewedThisMonth')}
                                            className={`w-6 h-6 flex items-center justify-center rounded-full text-[11px] font-bold text-white shrink-0 ${reviewed ? 'bg-emerald-500' : 'bg-rose-500'}`}
                                        >
                                            {index}
                                        </span>
                                    ))}
                                </div>
                            );
                        })()}

                        <button onClick={() => toggleExpand(plan.id)} className="mt-3 flex items-center gap-1.5 text-xs font-semibold text-indigo-600 hover:text-indigo-700">
                            <ChevronDown className={`w-4 h-4 transition-transform ${expandedId === plan.id ? 'rotate-180' : ''}`} />
                            {expandedId === plan.id ? t('team.hideDetail') : t('team.showDetail')}
                        </button>

                        {expandedId === plan.id && detail && (
                            <div className="mt-4 pt-4 border-t border-gray-100 space-y-4">
                                <IDPDetailInfoTable plan={detail} />

                                {detail.learningProgress && (
                                    <div className="p-3 bg-indigo-50 border border-indigo-100 rounded-xl flex items-center justify-between text-sm">
                                        <span className="font-semibold text-indigo-900 flex items-center gap-2"><Clock size={14} /> {t('form.mandatoryProgress')}</span>
                                        <span className="font-bold text-indigo-600">{detail.learningProgress.totalJam} / {MANDATORY_TARGET_HOURS} {t('form.hours')}</span>
                                    </div>
                                )}

                                <div className="p-4 bg-amber-50 border border-amber-100 rounded-xl space-y-2">
                                    <label className="flex items-center gap-1.5 text-sm font-semibold text-amber-900">
                                        <MessageSquare size={14} /> {t('admin.hrNoteLabel')}
                                    </label>
                                    <p className="text-xs text-amber-700">{t('admin.hrNoteHint')}</p>
                                    <textarea
                                        value={hrNoteDraft}
                                        onChange={e => setHrNoteDraft(e.target.value)}
                                        rows={3}
                                        placeholder={t('admin.hrNotePlaceholder')}
                                        className="w-full px-3 py-2 text-sm border border-amber-200 rounded-lg focus:border-amber-500 outline-none resize-none bg-white"
                                    />
                                    <button
                                        onClick={() => saveHrNote(plan.id)}
                                        disabled={savingHrNote || hrNoteDraft === (detail.hr_note || '')}
                                        className="px-4 py-1.5 bg-amber-600 text-white rounded-lg text-xs font-bold hover:bg-amber-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                                    >
                                        {t('admin.saveHrNote')}
                                    </button>
                                </div>

                                <div>
                                    <label className="block text-sm font-semibold text-gray-700 mb-2">{t('form.reviewHistory')}</label>
                                    {(detail.reviews || []).length === 0 ? (
                                        <p className="text-xs text-gray-400">{t('admin.noReviews')}</p>
                                    ) : (
                                        <div className="space-y-3">
                                            {detail.reviews!.map(review => (
                                                <div key={review.id} className="p-3 bg-gray-50 border border-gray-100 rounded-xl text-sm">
                                                    <p className="text-xs font-bold text-gray-400 mb-1">{new Date(review.review_date).toLocaleDateString()} &middot; {review.reviewed_by}</p>
                                                    <p className="text-gray-700">{review.supervisor_note}</p>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}
                    </div>
                ))}
            </div>

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
                            <button onClick={() => { setRejectModalOpen(false); setRejectionReason(''); setRejectTargetId(null); }} className="flex-1 px-4 py-2.5 rounded-xl border border-slate-300 text-slate-700 font-medium hover:bg-slate-50 transition-colors">{t('team.cancel')}</button>
                            <button onClick={confirmReject} disabled={!rejectionReason.trim()} className="flex-1 px-4 py-2.5 rounded-xl bg-rose-600 text-white font-medium hover:bg-rose-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors">{t('team.confirmReject')}</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
