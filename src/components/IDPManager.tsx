import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Target, Search, ChevronDown, ShieldCheck, Download, Clock } from 'lucide-react';
import * as XLSX from 'xlsx';
import { API_BASE_URL } from '../config';
import type { IDPPlan } from '../types';

interface IDPManagerProps {
    userRole: string;
    userName?: string;
}

const MANDATORY_TARGET_HOURS = 48;

export default function IDPManager({ userName }: IDPManagerProps) {
    const { t } = useTranslation('idpPage');
    const [plans, setPlans] = useState<IDPPlan[]>([]);
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedYear, setSelectedYear] = useState<number | 'All'>(new Date().getFullYear());

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
        return true;
    });

    const [expandedId, setExpandedId] = useState<number | null>(null);
    const [detail, setDetail] = useState<IDPPlan | null>(null);
    const [verifyDrafts, setVerifyDrafts] = useState<Record<number, string>>({});

    const toggleExpand = async (id: number) => {
        if (expandedId === id) { setExpandedId(null); setDetail(null); return; }
        setExpandedId(id);
        try {
            const res = await fetch(`${API_BASE_URL}/api/idp/${id}`);
            if (res.ok) setDetail(await res.json());
        } catch (err) { console.error(err); }
    };

    const submitVerification = async (reviewId: number) => {
        const note = verifyDrafts[reviewId];
        if (!note?.trim()) return;
        try {
            await fetch(`${API_BASE_URL}/api/idp/reviews/${reviewId}/verify`, {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ hr_note: note, hr_verified_by: userName })
            });
            if (expandedId) {
                const res = await fetch(`${API_BASE_URL}/api/idp/${expandedId}`);
                if (res.ok) setDetail(await res.json());
            }
            setVerifyDrafts(d => { const next = { ...d }; delete next[reviewId]; return next; });
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
            rows.push(['Tanggal IDP Dibuat oleh Karyawan:', full.created_by_date ? new Date(full.created_by_date).toLocaleDateString('id-ID') : '', '', 'Tanggal IDP Disetujui oleh Atasan:', full.approved_date ? new Date(full.approved_date).toLocaleDateString('id-ID') : '']);
            rows.push([]);
            rows.push(['Tanggal Review', 'Evaluasi IDP (diisi oleh atasan langsung)', '', 'Tanggal Verifikasi', 'Verifikasi IDP (diisi oleh HR)']);
            for (const review of full.reviews || []) {
                rows.push([
                    new Date(review.review_date).toLocaleDateString('id-ID'),
                    review.supervisor_note,
                    '',
                    review.hr_verification_date ? new Date(review.hr_verification_date).toLocaleDateString('id-ID') : '',
                    review.hr_note || ''
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
                                <p className="text-xs text-gray-400">{t('team.idLabel', { id: plan.employee_id })} &middot; {plan.department || '-'} &middot; {t('form.period')} {plan.period_year}</p>
                            </div>
                            {statusBadge(plan.status)}
                        </div>
                        <button onClick={() => toggleExpand(plan.id)} className="mt-3 flex items-center gap-1.5 text-xs font-semibold text-indigo-600 hover:text-indigo-700">
                            <ChevronDown className={`w-4 h-4 transition-transform ${expandedId === plan.id ? 'rotate-180' : ''}`} />
                            {expandedId === plan.id ? t('team.hideDetail') : t('team.showDetail')}
                        </button>

                        {expandedId === plan.id && detail && (
                            <div className="mt-4 pt-4 border-t border-gray-100 space-y-4">
                                {detail.learningProgress && (
                                    <div className="p-3 bg-indigo-50 border border-indigo-100 rounded-xl flex items-center justify-between text-sm">
                                        <span className="font-semibold text-indigo-900 flex items-center gap-2"><Clock size={14} /> {t('form.mandatoryProgress')}</span>
                                        <span className="font-bold text-indigo-600">{detail.learningProgress.totalJam} / {MANDATORY_TARGET_HOURS} {t('form.hours')}</span>
                                    </div>
                                )}

                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
                                    <div><p className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-1">{t('form.achievements')}</p><p className="text-gray-700 whitespace-pre-wrap">{detail.achievements || '-'}</p></div>
                                    <div><p className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-1">{t('form.careerGoal')}</p><p className="text-gray-700 whitespace-pre-wrap">{detail.career_goal || '-'}</p></div>
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
                                                    <p className="text-gray-700 mb-2">{review.supervisor_note}</p>
                                                    {review.hr_note ? (
                                                        <div className="pt-2 border-t border-gray-200 flex items-start gap-2">
                                                            <ShieldCheck size={14} className="text-emerald-600 mt-0.5 shrink-0" />
                                                            <div>
                                                                <p className="text-xs text-emerald-700">{review.hr_note}</p>
                                                                <p className="text-[10px] text-gray-400 mt-0.5">{review.hr_verified_by} &middot; {review.hr_verification_date && new Date(review.hr_verification_date).toLocaleDateString()}</p>
                                                            </div>
                                                        </div>
                                                    ) : (
                                                        <div className="pt-2 border-t border-gray-200 flex gap-2">
                                                            <input
                                                                value={verifyDrafts[review.id] || ''}
                                                                onChange={e => setVerifyDrafts(d => ({ ...d, [review.id]: e.target.value }))}
                                                                placeholder={t('admin.verifyPlaceholder')}
                                                                className="flex-1 px-3 py-1.5 text-xs border border-gray-200 rounded-lg focus:border-indigo-500 outline-none"
                                                            />
                                                            <button onClick={() => submitVerification(review.id)} disabled={!verifyDrafts[review.id]?.trim()} className="px-3 py-1.5 bg-indigo-600 text-white rounded-lg text-xs font-bold hover:bg-indigo-700 disabled:opacity-50 transition-colors">
                                                                {t('admin.verify')}
                                                            </button>
                                                        </div>
                                                    )}
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
        </div>
    );
}
