import { useState, useEffect } from 'react';
import { ClipboardList, X, UsersRound, CheckCircle2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { API_BASE_URL } from '../config';
import type { User } from '../types';

interface EvaluationItem {
    formId: number;
    meetingId: number;
    formTitle: string;
    meetingTitle: string;
    meetingDate: string | null;
    evaluateeEmployeeId: string;
    evaluateeName: string;
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

interface EvaluationFormDetailDTO {
    title: string;
    description: string | null;
    scaleMinLabel: string | null;
    scaleMaxLabel: string | null;
    questions: EvaluationQuestionDTO[];
}

const PostTrainingEvaluationTeam = ({ user }: { user: User }) => {
    const { t } = useTranslation('postTrainingEvaluationTeam');
    const [items, setItems] = useState<EvaluationItem[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [tab, setTab] = useState<'active' | 'closed'>('active');
    const [activeItem, setActiveItem] = useState<EvaluationItem | null>(null);

    const fetchItems = async () => {
        if (!user.employee_id) return;
        setIsLoading(true);
        try {
            const res = await fetch(`${API_BASE_URL}/api/post-training-evaluations/subordinates?leader_id=${user.employee_id}`);
            if (res.ok) setItems(await res.json());
        } catch (err) {
            console.error(err);
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => { fetchItems(); }, [user.employee_id]);

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
                    <UsersRound size={40} className="mx-auto mb-3 opacity-40" />
                    <p>{tab === 'active' ? t('emptyActive') : t('emptyClosed')}</p>
                </div>
            ) : (
                <div className="bg-white rounded-2xl shadow-sm border border-slate-100 divide-y divide-slate-50">
                    {visibleItems.map(item => (
                        <div key={`${item.formId}-${item.meetingId}-${item.evaluateeEmployeeId}`} className="p-4 flex items-center justify-between gap-3">
                            <div className="min-w-0">
                                <p className="font-bold text-slate-800 truncate">{item.evaluateeName}</p>
                                <p className="text-sm text-slate-500 truncate">
                                    {item.meetingTitle} &mdash; {item.formTitle}
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
                                    <span className="flex items-center gap-1.5 text-[11px] font-bold text-emerald-700">
                                        <CheckCircle2 size={14} />
                                        {t('submittedOn', { date: item.submittedAt ? new Date(item.submittedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '' })}
                                    </span>
                                </div>
                            ) : (
                                <button
                                    onClick={() => setActiveItem(item)}
                                    className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white text-xs font-black uppercase tracking-wider rounded-xl shrink-0 transition-all"
                                >
                                    {t('fillButton')}
                                </button>
                            )}
                        </div>
                    ))}
                </div>
            )}

            {activeItem && (
                <FillModal
                    pending={activeItem}
                    evaluatorEmployeeId={user.employee_id || ''}
                    onClose={() => setActiveItem(null)}
                    onSubmitted={() => {
                        setItems(prev => prev.map(i =>
                            i.formId === activeItem.formId && i.meetingId === activeItem.meetingId && i.evaluateeEmployeeId === activeItem.evaluateeEmployeeId
                                ? { ...i, submitted: true, submittedAt: new Date().toISOString() }
                                : i
                        ));
                        setActiveItem(null);
                        setTab('closed');
                    }}
                />
            )}
        </div>
    );
};

const FillModal = ({ pending, evaluatorEmployeeId, onClose, onSubmitted }: {
    pending: EvaluationItem;
    evaluatorEmployeeId: string;
    onClose: () => void;
    onSubmitted: () => void;
}) => {
    const { t } = useTranslation('postTrainingEvaluationTeam');
    const [form, setForm] = useState<EvaluationFormDetailDTO | null>(null);
    const [answers, setAnswers] = useState<Record<number, number | string>>({});
    const [isSubmitting, setIsSubmitting] = useState(false);

    useEffect(() => {
        fetch(`${API_BASE_URL}/api/post-training-evaluations/${pending.formId}`)
            .then(res => res.json())
            .then(setForm)
            .catch(err => console.error(err));
    }, [pending.formId]);

    const questions = form?.questions || [];
    const isComplete = questions.length > 0 && questions.every(q =>
        q.type === 'TEXT' ? String(answers[q.id] || '').length > 2 : answers[q.id] !== undefined
    );

    const handleSubmit = async () => {
        setIsSubmitting(true);
        try {
            const res = await fetch(`${API_BASE_URL}/api/post-training-evaluations/${pending.formId}/respond`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    evaluatee_employee_id: pending.evaluateeEmployeeId,
                    evaluator_employee_id: evaluatorEmployeeId,
                    meeting_id: pending.meetingId,
                    answers
                })
            });
            if (!res.ok) throw new Error('Failed to submit evaluation');
            onSubmitted();
        } catch (err) {
            console.error(err);
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-xl max-h-[85vh] overflow-y-auto">
                <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50 sticky top-0">
                    <div>
                        <span className="text-[10px] font-black uppercase text-purple-500 tracking-widest">{t('formHeader')}</span>
                        <h2 className="font-black text-lg text-slate-800 leading-tight">{form?.title || pending.formTitle}</h2>
                        <p className="text-xs font-bold text-slate-400 mt-1">{t('evaluating', { name: pending.evaluateeName })}</p>
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-xl text-slate-400"><X size={20} /></button>
                </div>

                {!form ? (
                    <div className="p-10 text-center text-slate-400 font-bold">{t('loadingForm')}</div>
                ) : (
                    <>
                        <div className="p-6 space-y-6">
                            {form.description && (
                                <p className="text-sm text-slate-600 whitespace-pre-wrap">{form.description}</p>
                            )}
                            {questions.map((q, idx) => (
                                <div key={q.id}>
                                    <p className="text-sm font-bold text-slate-700 mb-2">{idx + 1}. {q.question_text}</p>
                                    {q.type === 'SCALE' ? (
                                        <>
                                            <div className="flex gap-2">
                                                {[1, 2, 3, 4].map(v => (
                                                    <button
                                                        key={v}
                                                        onClick={() => setAnswers({ ...answers, [q.id]: v })}
                                                        className={`flex-1 py-2.5 rounded-xl border-2 transition-all text-center text-sm font-black ${answers[q.id] === v
                                                            ? 'bg-purple-600 border-purple-600 text-white shadow-lg shadow-purple-500/30'
                                                            : 'bg-white border-slate-100 text-slate-500 hover:border-slate-200 hover:bg-slate-50'
                                                            }`}
                                                    >
                                                        {v}
                                                    </button>
                                                ))}
                                            </div>
                                            {(form.scaleMinLabel || form.scaleMaxLabel) && (
                                                <div className="flex justify-between gap-4 mt-1.5">
                                                    <span className="text-[10px] font-bold text-slate-400 flex-1">{form.scaleMinLabel}</span>
                                                    <span className="text-[10px] font-bold text-slate-400 flex-1 text-right">{form.scaleMaxLabel}</span>
                                                </div>
                                            )}
                                        </>
                                    ) : (
                                        <textarea
                                            value={String(answers[q.id] || '')}
                                            onChange={e => setAnswers({ ...answers, [q.id]: e.target.value })}
                                            rows={4}
                                            className="w-full p-4 rounded-2xl bg-slate-50 border-2 border-slate-100 focus:border-purple-500 outline-none transition-all font-semibold text-slate-700"
                                            placeholder={t('textPlaceholder')}
                                        />
                                    )}
                                </div>
                            ))}
                        </div>
                        <div className="p-6 bg-slate-50 border-t border-slate-100">
                            <button
                                disabled={!isComplete || isSubmitting}
                                onClick={handleSubmit}
                                className="w-full py-4 bg-purple-600 hover:bg-purple-700 disabled:bg-slate-300 text-white font-black rounded-2xl shadow-xl shadow-purple-500/20 transition-all"
                            >
                                {isSubmitting ? t('sending') : t('submitButton')}
                            </button>
                        </div>
                    </>
                )}
            </div>
        </div>
    );
};

export default PostTrainingEvaluationTeam;
