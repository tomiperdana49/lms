import { useState, useEffect, type FormEvent } from 'react';
import { ClipboardList, Plus, Trash2, Eye, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { API_BASE_URL } from '../config';
import PopupNotification from './PopupNotification';

interface EvaluationQuestion {
    id?: number;
    type: 'SCALE' | 'TEXT';
    competency_label: string;
    question_text: string;
}

interface EvaluationFormSummary {
    id: number;
    category: string | null;
    title: string;
    status: 'DRAFT' | 'PUBLISHED';
    createdBy: string | null;
    createdAt: string;
}

interface EvaluationFormPreview {
    id: number;
    category: string | null;
    title: string;
    description: string | null;
    scaleMinLabel: string | null;
    scaleMaxLabel: string | null;
    status: 'DRAFT' | 'PUBLISHED';
    questions: (EvaluationQuestion & { id: number })[];
}

const emptyBuilder = (description = '') => ({
    category: '',
    title: '',
    description,
    questions: [{ type: 'TEXT', competency_label: '', question_text: '' }] as EvaluationQuestion[]
});

const PostTrainingEvaluationManager = ({ userName }: { userName?: string }) => {
    const { t } = useTranslation('postTrainingEvaluationManager');
    const [forms, setForms] = useState<EvaluationFormSummary[]>([]);
    const [categories, setCategories] = useState<string[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [notification, setNotification] = useState<{ show: boolean; type: 'success' | 'error'; message: string }>({ show: false, type: 'success', message: '' });

    const [isBuilderOpen, setIsBuilderOpen] = useState(false);
    const [editingFormId, setEditingFormId] = useState<number | null>(null);
    const [builder, setBuilder] = useState(emptyBuilder());

    const [previewForm, setPreviewForm] = useState<EvaluationFormPreview | null>(null);

    const fetchForms = async () => {
        try {
            const res = await fetch(`${API_BASE_URL}/api/post-training-evaluations`);
            if (res.ok) setForms(await res.json());
        } catch (err) {
            console.error(err);
            setNotification({ show: true, type: 'error', message: t('notifications.loadFailed') });
        }
    };

    useEffect(() => {
        const loadInitialData = async () => {
            setIsLoading(true);
            try {
                const [formsRes, categoriesRes] = await Promise.all([
                    fetch(`${API_BASE_URL}/api/post-training-evaluations`),
                    fetch(`${API_BASE_URL}/api/post-training-evaluations/categories`)
                ]);
                if (formsRes.ok) setForms(await formsRes.json());
                if (categoriesRes.ok) setCategories(await categoriesRes.json());
            } catch (err) {
                console.error(err);
                setNotification({ show: true, type: 'error', message: t('notifications.loadFailed') });
            } finally {
                setIsLoading(false);
            }
        };
        loadInitialData();
    }, []);

    const openCreate = () => {
        setEditingFormId(null);
        setBuilder(emptyBuilder(t('builder.defaultDescription')));
        setIsBuilderOpen(true);
    };

    const openEdit = async (formId: number) => {
        try {
            const res = await fetch(`${API_BASE_URL}/api/post-training-evaluations/${formId}`);
            if (!res.ok) throw new Error('Failed to load form');
            const data: EvaluationFormPreview = await res.json();
            setEditingFormId(formId);
            setBuilder({
                category: data.category || '',
                title: data.title,
                description: data.description || '',
                questions: data.questions.map(q => ({ id: q.id, type: q.type, competency_label: q.competency_label || '', question_text: q.question_text }))
            });
            setIsBuilderOpen(true);
        } catch (err) {
            console.error(err);
            setNotification({ show: true, type: 'error', message: t('notifications.loadFailed') });
        }
    };

    const openPreview = async (formId: number) => {
        try {
            const res = await fetch(`${API_BASE_URL}/api/post-training-evaluations/${formId}`);
            if (!res.ok) throw new Error('Failed to load form');
            setPreviewForm(await res.json());
        } catch (err) {
            console.error(err);
            setNotification({ show: true, type: 'error', message: t('notifications.loadFailed') });
        }
    };

    const addQuestion = (type: 'SCALE' | 'TEXT') => {
        setBuilder(prev => ({ ...prev, questions: [...prev.questions, { type, competency_label: '', question_text: '' }] }));
    };

    const removeQuestion = (index: number) => {
        setBuilder(prev => ({ ...prev, questions: prev.questions.filter((_, i) => i !== index) }));
    };

    const updateQuestion = (index: number, field: keyof EvaluationQuestion, value: string) => {
        setBuilder(prev => ({
            ...prev,
            questions: prev.questions.map((q, i) => i === index ? { ...q, [field]: value } : q)
        }));
    };

    const handleSubmitBuilder = async (e: FormEvent) => {
        e.preventDefault();
        const payload = {
            title: builder.title,
            category: builder.category || null,
            description: builder.description || null,
            questions: builder.questions,
            ...(editingFormId ? {} : { created_by: userName || null })
        };

        try {
            const res = editingFormId
                ? await fetch(`${API_BASE_URL}/api/post-training-evaluations/${editingFormId}`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                })
                : await fetch(`${API_BASE_URL}/api/post-training-evaluations`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });

            if (!res.ok) throw new Error('Request failed');
            setIsBuilderOpen(false);
            setNotification({ show: true, type: 'success', message: editingFormId ? t('notifications.updateSuccess') : t('notifications.createSuccess') });
            fetchForms();
        } catch (err) {
            console.error(err);
            setNotification({ show: true, type: 'error', message: editingFormId ? t('notifications.updateFailed') : t('notifications.createFailed') });
        }
    };

    const handleDelete = async (formId: number) => {
        if (!window.confirm(t('confirm.delete'))) return;
        try {
            const res = await fetch(`${API_BASE_URL}/api/post-training-evaluations/${formId}`, { method: 'DELETE' });
            if (!res.ok) throw new Error('Request failed');
            setNotification({ show: true, type: 'success', message: t('notifications.deleteSuccess') });
            setForms(forms.filter(f => f.id !== formId));
        } catch (err) {
            console.error(err);
            setNotification({ show: true, type: 'error', message: t('notifications.deleteFailed') });
        }
    };

    if (isLoading) return <div className="p-8 text-center">{t('loading')}</div>;

    return (
        <div className="max-w-5xl mx-auto py-6">
            <PopupNotification
                isOpen={notification.show}
                type={notification.type}
                message={notification.message}
                onClose={() => setNotification({ ...notification, show: false })}
            />

            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-8">
                <div>
                    <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
                        <ClipboardList className="text-purple-600" /> {t('title')}
                    </h1>
                    <p className="text-sm text-slate-500 mt-1">{t('subtitle')}</p>
                </div>
                <button
                    onClick={openCreate}
                    className="bg-purple-600 hover:bg-purple-700 text-white px-5 py-2.5 rounded-xl font-semibold shadow-lg shadow-purple-900/20 flex items-center gap-2 whitespace-nowrap"
                >
                    <Plus size={18} /> {t('addForm')}
                </button>
            </div>

            <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-x-auto">
                <div className="min-w-[720px]">
                    <div className="p-4 bg-slate-50 border-b border-slate-100 font-semibold text-slate-600 flex items-center text-sm">
                        <div className="w-32">{t('table.category')}</div>
                        <div className="flex-1">{t('table.title')}</div>
                        <div className="w-40">{t('table.createdBy')}</div>
                        <div className="w-32">{t('table.createdAt')}</div>
                        <div className="w-32 text-right pr-2">&nbsp;</div>
                    </div>
                    <div className="divide-y divide-slate-50">
                        {forms.map(form => (
                            <div key={form.id} className="p-4 flex items-center hover:bg-slate-50 transition-colors">
                                <div className="w-32">
                                    {form.category ? (
                                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-lg bg-purple-100 text-purple-700">
                                            {form.category}
                                        </span>
                                    ) : (
                                        <span className="text-xs text-slate-300">&mdash;</span>
                                    )}
                                </div>
                                <div className="flex-1 font-bold text-slate-800">{form.title}</div>
                                <div className="w-40 text-sm text-slate-500">{form.createdBy || t('table.unknownCreator')}</div>
                                <div className="w-32 text-sm text-slate-500">
                                    {new Date(form.createdAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                                </div>
                                <div className="w-32 flex justify-end gap-1">
                                    <button onClick={() => openPreview(form.id)} title={t('actions.viewForm')} className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors">
                                        <Eye size={18} />
                                    </button>
                                    <button onClick={() => openEdit(form.id)} title={t('actions.edit')} className="p-2 text-slate-400 hover:text-purple-600 hover:bg-purple-50 rounded-lg transition-colors">
                                        <ClipboardList size={18} />
                                    </button>
                                    <button onClick={() => handleDelete(form.id)} title={t('actions.delete')} className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors">
                                        <Trash2 size={18} />
                                    </button>
                                </div>
                            </div>
                        ))}
                        {forms.length === 0 && (
                            <div className="p-8 text-center text-slate-500 italic">{t('empty')}</div>
                        )}
                    </div>
                </div>
            </div>

            {isBuilderOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
                        <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50 sticky top-0">
                            <h2 className="font-bold text-lg text-slate-800">{editingFormId ? t('builder.editTitle') : t('builder.createTitle')}</h2>
                            <button onClick={() => setIsBuilderOpen(false)} className="text-slate-400 hover:text-slate-600"><X size={20} /></button>
                        </div>
                        <form onSubmit={handleSubmitBuilder} className="p-6 space-y-4">
                            <div>
                                <label className="block text-sm font-semibold text-slate-700 mb-1">{t('builder.categoryLabel')}</label>
                                <input
                                    list="pte-categories"
                                    value={builder.category}
                                    onChange={e => setBuilder({ ...builder, category: e.target.value })}
                                    placeholder={t('builder.categoryPlaceholder')}
                                    className="w-full px-4 py-2 rounded-xl border border-slate-200 outline-none focus:ring-2 focus:ring-purple-500"
                                />
                                <datalist id="pte-categories">
                                    {categories.map(c => <option key={c} value={c} />)}
                                </datalist>
                            </div>
                            <div>
                                <label className="block text-sm font-semibold text-slate-700 mb-1">{t('builder.titleLabel')}</label>
                                <input
                                    required
                                    value={builder.title}
                                    onChange={e => setBuilder({ ...builder, title: e.target.value })}
                                    className="w-full px-4 py-2 rounded-xl border border-slate-200 outline-none focus:ring-2 focus:ring-purple-500"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-semibold text-slate-700 mb-1">{t('builder.descriptionLabel')}</label>
                                <textarea
                                    value={builder.description}
                                    onChange={e => setBuilder({ ...builder, description: e.target.value })}
                                    rows={8}
                                    className="w-full px-4 py-2 rounded-xl border border-slate-200 outline-none focus:ring-2 focus:ring-purple-500 text-sm whitespace-pre-wrap"
                                />
                            </div>
                            <div className="pt-2 border-t border-slate-100">
                                <label className="block text-sm font-semibold text-slate-700 mb-2">{t('builder.questionsLabel')}</label>
                                <div className="space-y-3">
                                    {builder.questions.map((q, idx) => (
                                        <div key={idx} className="p-3 bg-slate-50 rounded-xl border border-slate-100 space-y-2">
                                            <div className="flex items-center justify-between">
                                                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-lg ${q.type === 'SCALE' ? 'bg-purple-100 text-purple-700' : 'bg-slate-200 text-slate-600'}`}>
                                                    {q.type === 'SCALE' ? 'SCALE 1-4' : 'TEXT'}
                                                </span>
                                                <button type="button" onClick={() => removeQuestion(idx)} className="text-slate-400 hover:text-red-600" title={t('builder.removeQuestion')}>
                                                    <Trash2 size={16} />
                                                </button>
                                            </div>
                                            <textarea
                                                required
                                                value={q.question_text}
                                                onChange={e => updateQuestion(idx, 'question_text', e.target.value)}
                                                placeholder={q.type === 'SCALE' ? t('builder.questionTextScalePlaceholder') : t('builder.questionTextTextPlaceholder')}
                                                rows={2}
                                                className="w-full px-3 py-1.5 rounded-lg border border-slate-200 outline-none focus:ring-2 focus:ring-purple-500 text-sm"
                                            />
                                        </div>
                                    ))}
                                    {builder.questions.length === 0 && (
                                        <p className="text-sm text-slate-400 italic">{t('builder.noQuestions')}</p>
                                    )}
                                </div>
                                <div className="flex gap-2 mt-3">
                                    <button type="button" onClick={() => addQuestion('SCALE')} className="text-xs font-bold text-purple-600 hover:text-purple-700 flex items-center gap-1">
                                        <Plus size={14} /> {t('builder.addScaleQuestion')}
                                    </button>
                                    <button type="button" onClick={() => addQuestion('TEXT')} className="text-xs font-bold text-slate-500 hover:text-slate-700 flex items-center gap-1">
                                        <Plus size={14} /> {t('builder.addTextQuestion')}
                                    </button>
                                </div>
                            </div>

                            <button className="w-full py-3 bg-purple-600 hover:bg-purple-700 text-white font-bold rounded-xl shadow-lg shadow-purple-900/20 mt-4">
                                {t('builder.save')}
                            </button>
                        </form>
                    </div>
                </div>
            )}

            {previewForm && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-xl max-h-[85vh] overflow-y-auto">
                        <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50 sticky top-0">
                            <div>
                                {previewForm.category && (
                                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-lg bg-purple-100 text-purple-700 mb-1 inline-block">
                                        {previewForm.category}
                                    </span>
                                )}
                                <h2 className="font-bold text-lg text-slate-800">{previewForm.title}</h2>
                            </div>
                            <button onClick={() => setPreviewForm(null)} className="text-slate-400 hover:text-slate-600"><X size={20} /></button>
                        </div>
                        <div className="p-6 space-y-6">
                            {previewForm.description && (
                                <p className="text-sm text-slate-600 whitespace-pre-wrap">{previewForm.description}</p>
                            )}
                            {previewForm.questions.map((q, idx) => (
                                <div key={q.id}>
                                    <p className="text-sm font-bold text-slate-700 mb-2">{idx + 1}. {q.question_text}</p>
                                    {q.type === 'SCALE' ? (
                                        <>
                                            <div className="flex gap-2">
                                                {[1, 2, 3, 4].map(v => (
                                                    <div key={v} className="flex-1 py-2 rounded-lg border border-slate-200 text-center text-sm font-bold text-slate-400">
                                                        {v}
                                                    </div>
                                                ))}
                                            </div>
                                            {(previewForm.scaleMinLabel || previewForm.scaleMaxLabel) && (
                                                <div className="flex justify-between gap-4 mt-1.5">
                                                    <span className="text-[10px] font-bold text-slate-400 flex-1">{previewForm.scaleMinLabel}</span>
                                                    <span className="text-[10px] font-bold text-slate-400 flex-1 text-right">{previewForm.scaleMaxLabel}</span>
                                                </div>
                                            )}
                                        </>
                                    ) : (
                                        <div className="w-full p-3 rounded-lg bg-slate-50 border border-slate-100 text-sm text-slate-400 italic">
                                            {t('preview.textAnswerPlaceholder')}
                                        </div>
                                    )}
                                </div>
                            ))}
                            {previewForm.questions.length === 0 && (
                                <p className="text-sm text-slate-400 italic">{t('preview.noQuestions')}</p>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default PostTrainingEvaluationManager;
