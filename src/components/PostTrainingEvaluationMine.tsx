import { useState, useEffect } from 'react';
import { ClipboardList, X, ClipboardCheck, Clock } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { API_BASE_URL } from '../config';
import type { User } from '../types';

interface EvaluationItem {
    formId: number;
    meetingId: number;
    formTitle: string;
    meetingTitle: string;
    meetingDate: string | null;
    submitted: boolean;
    submittedAt: string | null;
    averageScore: number | null;
}

interface EvaluationQuestionDTO {
    id: number;
    type: 'SCALE' | 'TEXT';
    competency_label: string | null;
    question_text: string;
}

interface EvaluationResponseDetailDTO {
    title: string;
    description: string | null;
    scaleMinLabel: string | null;
    scaleMaxLabel: string | null;
    questions: EvaluationQuestionDTO[];
    answers: Record<string, number | string> | null;
}

const PostTrainingEvaluationMine = ({ user }: { user: User }) => {
    const { t } = useTranslation('postTrainingEvaluationMine');
    const [items, setItems] = useState<EvaluationItem[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [tab, setTab] = useState<'active' | 'closed'>('active');
    const [activeItem, setActiveItem] = useState<EvaluationItem | null>(null);

    useEffect(() => {
        if (!user.employee_id) return;
        setIsLoading(true);
        fetch(`${API_BASE_URL}/api/post-training-evaluations/mine?employee_id=${encodeURIComponent(user.employee_id)}`)
            .then(res => res.ok ? res.json() : [])
            .then(setItems)
            .catch(err => console.error(err))
            .finally(() => setIsLoading(false));
    }, [user.employee_id]);

    const activeCount = items.filter(i => !i.submitted).length;
    const closedCount = items.filter(i => i.submitted).length;
    const visibleItems = items.filter(i => tab === 'active' ? !i.submitted : i.submitted);

    return (
        <div className="py-6">
            <div className="mb-8">
                <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
                    <ClipboardList className="text-purple-600" /> {t('title')}
                </h1>
                <p className="text-sm text-slate-500 mt-1">{t('subtitle')}</p>
                <p className="text-sm text-slate-500 mt-3 bg-purple-50 border border-purple-100 rounded-2xl p-4 leading-relaxed">
                    {t('explanation')}
                </p>
            </div>

            <div className="flex gap-2 mb-4">
                <button
                    onClick={() => setTab('active')}
                    className={`px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wider transition-all ${tab === 'active' ? 'bg-purple-600 text-white shadow-md' : 'bg-white text-slate-500 border border-slate-200 hover:border-slate-300'}`}
                >
                    {t('tabs.active')} {activeCount > 0 && <span className="ml-1">({activeCount})</span>}
                </button>
                <button
                    onClick={() => setTab('closed')}
                    className={`px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wider transition-all ${tab === 'closed' ? 'bg-purple-600 text-white shadow-md' : 'bg-white text-slate-500 border border-slate-200 hover:border-slate-300'}`}
                >
                    {t('tabs.closed')} {closedCount > 0 && <span className="ml-1">({closedCount})</span>}
                </button>
            </div>

            {isLoading ? (
                <div className="p-8 text-center text-slate-400">{t('loading')}</div>
            ) : visibleItems.length === 0 ? (
                <div className="bg-white border border-slate-100 rounded-3xl p-16 text-center text-slate-400">
                    <ClipboardCheck size={40} className="mx-auto mb-3 opacity-40" />
                    <p>{tab === 'active' ? t('emptyActive') : t('emptyClosed')}</p>
                </div>
            ) : (
                <div className="bg-white rounded-2xl shadow-sm border border-slate-100 divide-y divide-slate-50">
                    {visibleItems.map(item => (
                        <div key={`${item.formId}-${item.meetingId}`} className="p-4 flex items-center justify-between gap-3">
                            <div className="min-w-0">
                                <p className="font-bold text-slate-800 truncate">{item.meetingTitle}</p>
                                <p className="text-sm text-slate-500 truncate">
                                    {item.formTitle}
                                    {item.meetingDate && (
                                        <span className="text-slate-400"> ({new Date(item.meetingDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })})</span>
                                    )}
                                </p>
                            </div>
                            {item.submitted ? (
                                <div className="flex items-center gap-3 shrink-0">
                                    {item.averageScore !== null && (
                                        <span className="px-2.5 py-1 rounded-lg bg-purple-50 text-purple-700 text-xs font-black">
                                            {t('score', { score: item.averageScore })}
                                        </span>
                                    )}
                                    <button
                                        onClick={() => setActiveItem(item)}
                                        className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-black uppercase tracking-wider rounded-xl shrink-0 transition-all"
                                    >
                                        {t('viewButton')}
                                    </button>
                                </div>
                            ) : (
                                <span className="flex items-center gap-1.5 text-[11px] font-bold text-amber-600 shrink-0">
                                    <Clock size={14} />
                                    {t('pendingLabel')}
                                </span>
                            )}
                        </div>
                    ))}
                </div>
            )}

            {activeItem && (
                <ViewModal
                    item={activeItem}
                    employeeId={user.employee_id || ''}
                    onClose={() => setActiveItem(null)}
                />
            )}
        </div>
    );
};

const ViewModal = ({ item, employeeId, onClose }: {
    item: EvaluationItem;
    employeeId: string;
    onClose: () => void;
}) => {
    const { t } = useTranslation('postTrainingEvaluationMine');
    const [detail, setDetail] = useState<EvaluationResponseDetailDTO | null>(null);

    useEffect(() => {
        fetch(`${API_BASE_URL}/api/post-training-evaluations/${item.formId}/response/${encodeURIComponent(employeeId)}?meetingId=${item.meetingId}`)
            .then(res => res.json())
            .then(setDetail)
            .catch(err => console.error(err));
    }, [item.formId, item.meetingId, employeeId]);

    const questions = detail?.questions || [];

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-xl max-h-[85vh] overflow-y-auto">
                <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50 sticky top-0">
                    <div>
                        <span className="text-[10px] font-black uppercase text-purple-500 tracking-widest">{t('formHeader')}</span>
                        <h2 className="font-black text-lg text-slate-800 leading-tight">{detail?.title || item.formTitle}</h2>
                        <p className="text-xs font-bold text-slate-400 mt-1">{item.meetingTitle}</p>
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-xl text-slate-400"><X size={20} /></button>
                </div>

                {!detail ? (
                    <div className="p-10 text-center text-slate-400 font-bold">{t('loadingForm')}</div>
                ) : (
                    <div className="p-6 space-y-6">
                        {detail.description && (
                            <p className="text-sm text-slate-600 whitespace-pre-wrap">{detail.description}</p>
                        )}
                        {questions.map((q, idx) => {
                            const answer = detail.answers?.[q.id];
                            return (
                                <div key={q.id}>
                                    <p className="text-sm font-bold text-slate-700 mb-2">{idx + 1}. {q.question_text}</p>
                                    {q.type === 'SCALE' ? (
                                        <>
                                            <div className="flex gap-2">
                                                {[1, 2, 3, 4].map(v => (
                                                    <div
                                                        key={v}
                                                        className={`flex-1 py-2.5 rounded-xl border-2 text-center text-sm font-black ${Number(answer) === v
                                                            ? 'bg-purple-600 border-purple-600 text-white shadow-lg shadow-purple-500/30'
                                                            : 'bg-white border-slate-100 text-slate-300'
                                                            }`}
                                                    >
                                                        {v}
                                                    </div>
                                                ))}
                                            </div>
                                            {(detail.scaleMinLabel || detail.scaleMaxLabel) && (
                                                <div className="flex justify-between gap-4 mt-1.5">
                                                    <span className="text-[10px] font-bold text-slate-400 flex-1">{detail.scaleMinLabel}</span>
                                                    <span className="text-[10px] font-bold text-slate-400 flex-1 text-right">{detail.scaleMaxLabel}</span>
                                                </div>
                                            )}
                                        </>
                                    ) : (
                                        <p className="w-full p-4 rounded-2xl bg-slate-50 border-2 border-slate-100 font-semibold text-slate-700 whitespace-pre-wrap">
                                            {String(answer || '-')}
                                        </p>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>
        </div>
    );
};

export default PostTrainingEvaluationMine;
