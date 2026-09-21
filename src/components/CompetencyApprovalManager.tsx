import { useState, useEffect } from 'react';
import { ArrowLeft, BadgeCheck } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { API_BASE_URL } from '../config';
import type { Role, CompetencyChangeRequest } from '../types';
import PopupNotification from './PopupNotification';
import ConfirmationModal from './ConfirmationModal';

interface CompetencyApprovalManagerProps {
    userRole: Role;
    reviewerId?: string;
    onBack: () => void;
}

const DIFF_FIELDS = ['competencyName', 'standardScore', 'operationalDefinition', 'standardLevelIndicator', 'jdReference'];

const ACTION_BADGE_STYLE: Record<string, string> = {
    ADD: 'bg-emerald-100 text-emerald-700',
    EDIT: 'bg-indigo-100 text-indigo-700',
    DELETE: 'bg-rose-100 text-rose-700',
    STANDARD_OVERRIDE: 'bg-amber-100 text-amber-700'
};

const CompetencyApprovalManager = ({ userRole, reviewerId, onBack }: CompetencyApprovalManagerProps) => {
    const { t } = useTranslation('competencyApprovals');
    const [activeTab, setActiveTab] = useState<'pending' | 'history'>('pending');
    const [requests, setRequests] = useState<CompetencyChangeRequest[]>([]);
    const [history, setHistory] = useState<CompetencyChangeRequest[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isLoadingHistory, setIsLoadingHistory] = useState(true);
    const [names, setNames] = useState<Record<string, string>>({});
    const [processingId, setProcessingId] = useState<number | null>(null);
    const [rejectTarget, setRejectTarget] = useState<CompetencyChangeRequest | null>(null);
    const [rejectReason, setRejectReason] = useState('');
    const [notification, setNotification] = useState<{ show: boolean; type: 'success' | 'error'; message: string }>({ show: false, type: 'success', message: '' });

    const fetchRequests = async () => {
        try {
            const res = await fetch(`${API_BASE_URL}/api/competency-change-requests?status=PENDING`);
            if (res.ok) {
                const data = await res.json();
                if (Array.isArray(data)) setRequests(data);
            }
        } catch (err) {
            console.error(err);
            setNotification({ show: true, type: 'error', message: t('notifications.loadFailed') });
        } finally {
            setIsLoading(false);
        }
    };

    // History (log) of every already-reviewed request, most recently reviewed first - HR asked to
    // be able to see what was approved/rejected in the past, not just what's currently pending.
    const fetchHistory = async () => {
        try {
            const [approvedRes, rejectedRes] = await Promise.all([
                fetch(`${API_BASE_URL}/api/competency-change-requests?status=APPROVED`),
                fetch(`${API_BASE_URL}/api/competency-change-requests?status=REJECTED`)
            ]);
            const approved = approvedRes.ok ? await approvedRes.json() : [];
            const rejected = rejectedRes.ok ? await rejectedRes.json() : [];
            const combined = [...(Array.isArray(approved) ? approved : []), ...(Array.isArray(rejected) ? rejected : [])];
            combined.sort((a, b) => new Date(b.reviewedAt || b.createdAt).getTime() - new Date(a.reviewedAt || a.createdAt).getTime());
            setHistory(combined);
        } catch (err) {
            console.error(err);
            setNotification({ show: true, type: 'error', message: t('notifications.loadFailed') });
        } finally {
            setIsLoadingHistory(false);
        }
    };

    useEffect(() => { fetchRequests(); fetchHistory(); }, []);

    useEffect(() => {
        const ids = new Set<string>();
        requests.forEach(r => ids.add(r.requesterId));
        history.forEach(r => { ids.add(r.requesterId); if (r.reviewedBy) ids.add(r.reviewedBy); });
        const missingIds = Array.from(ids).filter(id => !(id in names));
        if (missingIds.length === 0) return;
        (async () => {
            const entries = await Promise.all(missingIds.map(async id => {
                try {
                    const res = await fetch(`${API_BASE_URL}/api/employees/${id}`);
                    if (res.ok) {
                        const data = await res.json();
                        return [id, data.fullName || id] as const;
                    }
                } catch (err) { console.error(err); }
                return [id, id] as const;
            }));
            setNames(prev => ({ ...prev, ...Object.fromEntries(entries) }));
        })();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [requests, history]);

    const handleApprove = async (request: CompetencyChangeRequest) => {
        setProcessingId(request.id);
        try {
            const res = await fetch(`${API_BASE_URL}/api/competency-change-requests/${request.id}/approve`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ reviewerId })
            });
            if (res.ok) {
                setNotification({ show: true, type: 'success', message: t('notifications.approveSuccess') });
                await Promise.all([fetchRequests(), fetchHistory()]);
            } else {
                const err = await res.json().catch(() => ({}));
                setNotification({ show: true, type: 'error', message: err.error || t('notifications.approveFailed') });
            }
        } catch (err) {
            console.error(err);
            setNotification({ show: true, type: 'error', message: t('notifications.approveFailed') });
        } finally {
            setProcessingId(null);
        }
    };

    const confirmReject = async (reason?: string) => {
        if (!rejectTarget) return;
        const target = rejectTarget;
        setProcessingId(target.id);
        try {
            const res = await fetch(`${API_BASE_URL}/api/competency-change-requests/${target.id}/reject`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ reviewerId, reason: reason || null })
            });
            if (res.ok) {
                setNotification({ show: true, type: 'success', message: t('notifications.rejectSuccess') });
                await Promise.all([fetchRequests(), fetchHistory()]);
            } else {
                const err = await res.json().catch(() => ({}));
                setNotification({ show: true, type: 'error', message: err.error || t('notifications.rejectFailed') });
            }
        } catch (err) {
            console.error(err);
            setNotification({ show: true, type: 'error', message: t('notifications.rejectFailed') });
        } finally {
            setProcessingId(null);
        }
    };

    if (userRole !== 'HR' && userRole !== 'HR_ADMIN') {
        return <div className="p-8 text-center text-red-500">{t('accessDenied')}</div>;
    }

    if (isLoading) return <div className="p-8 text-center">{t('loading')}</div>;

    const renderChangeSummary = (r: CompetencyChangeRequest) => {
        const payload = (r.payload || {}) as Record<string, unknown>;
        const previous = (r.previous || {}) as Record<string, unknown>;

        if (r.action === 'ADD') {
            return <p className="text-sm text-slate-600">{t('summary.add', { name: String(payload.competencyName ?? r.competencyName), standard: String(payload.standardScore ?? '-') })}</p>;
        }
        if (r.action === 'DELETE') {
            return <p className="text-sm text-slate-600">{t('summary.delete', { name: String(previous.competencyName ?? r.competencyName), standard: String(previous.standardScore ?? '-') })}</p>;
        }
        if (r.action === 'STANDARD_OVERRIDE') {
            return <p className="text-sm text-slate-600">{t('summary.standard', { from: String(previous.standardScore ?? t('summary.hrDefault')), to: String(payload.standardScore ?? '-') })}</p>;
        }
        const changedFields = DIFF_FIELDS.filter(f => String(previous[f] ?? '') !== String(payload[f] ?? ''));
        if (changedFields.length === 0) return null;
        return (
            <div className="space-y-1">
                {changedFields.map(f => (
                    <p key={f} className="text-sm">
                        <span className="font-semibold text-slate-600">{t(`fields.${f}`)}: </span>
                        <span className="line-through text-slate-400">{String(previous[f] ?? '-') || '-'}</span>
                        <span className="text-slate-700"> {'→'} {String(payload[f] ?? '-') || '-'}</span>
                    </p>
                ))}
            </div>
        );
    };

    return (
        <div className="max-w-5xl mx-auto py-6">
            <PopupNotification
                isOpen={notification.show}
                type={notification.type}
                message={notification.message}
                onClose={() => setNotification({ ...notification, show: false })}
            />
            <button onClick={onBack} className="text-sm text-slate-500 hover:text-blue-600 flex items-center gap-1 mb-4 transition-colors">
                <ArrowLeft size={14} /> {t('backToDashboard')}
            </button>

            <div className="mb-6">
                <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
                    <BadgeCheck className="text-indigo-600" /> {t('title')}
                </h1>
                <p className="text-sm text-slate-500 mt-1">{t('subtitle', { count: requests.length })}</p>
            </div>

            <div className="flex gap-2 mb-6 border-b border-slate-200">
                <button
                    onClick={() => setActiveTab('pending')}
                    className={`px-4 py-2 text-sm font-semibold border-b-2 transition-colors ${activeTab === 'pending' ? 'border-indigo-600 text-indigo-700' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
                >
                    {t('tabs.pending')} {requests.length > 0 && `(${requests.length})`}
                </button>
                <button
                    onClick={() => setActiveTab('history')}
                    className={`px-4 py-2 text-sm font-semibold border-b-2 transition-colors ${activeTab === 'history' ? 'border-indigo-600 text-indigo-700' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
                >
                    {t('tabs.history')}
                </button>
            </div>

            {activeTab === 'pending' ? (
                requests.length === 0 ? (
                    <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-8 text-center text-slate-500 italic">
                        {t('noRequests')}
                    </div>
                ) : (
                    <div className="space-y-4">
                        {requests.map(r => (
                            <div key={r.id} className="bg-white rounded-2xl shadow-sm border border-slate-100 p-5">
                                <div className="flex flex-wrap items-start justify-between gap-3 mb-3">
                                    <div>
                                        <div className="flex items-center gap-2 flex-wrap mb-1">
                                            <span className={`text-[11px] font-bold px-2 py-1 rounded-lg ${ACTION_BADGE_STYLE[r.action]}`}>
                                                {t(`actions.${r.action}`)}
                                            </span>
                                            <span className="text-xs text-slate-400">{r.position}</span>
                                        </div>
                                        <h3 className="font-semibold text-slate-800">{r.competencyName}</h3>
                                        <p className="text-xs text-slate-500 mt-0.5">
                                            {t('requestedBy', { name: names[r.requesterId] || r.requesterId })}
                                        </p>
                                    </div>
                                    <div className="flex gap-2 shrink-0">
                                        <button
                                            onClick={() => { setRejectTarget(r); setRejectReason(''); }}
                                            disabled={processingId === r.id}
                                            className="px-3 py-1.5 rounded-lg border border-rose-200 text-rose-600 text-sm font-semibold hover:bg-rose-50 disabled:opacity-50"
                                        >
                                            {t('reject')}
                                        </button>
                                        <button
                                            onClick={() => handleApprove(r)}
                                            disabled={processingId === r.id}
                                            className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold disabled:opacity-50"
                                        >
                                            {t('approve')}
                                        </button>
                                    </div>
                                </div>
                                <div className="bg-slate-50 rounded-xl p-3">
                                    {renderChangeSummary(r)}
                                </div>
                            </div>
                        ))}
                    </div>
                )
            ) : isLoadingHistory ? (
                <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-8 text-center text-slate-500 italic">
                    {t('loading')}
                </div>
            ) : history.length === 0 ? (
                <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-8 text-center text-slate-500 italic">
                    {t('noHistory')}
                </div>
            ) : (
                <div className="space-y-4">
                    {history.map(r => (
                        <div key={r.id} className="bg-white rounded-2xl shadow-sm border border-slate-100 p-5">
                            <div className="flex flex-wrap items-start justify-between gap-3 mb-3">
                                <div>
                                    <div className="flex items-center gap-2 flex-wrap mb-1">
                                        <span className={`text-[11px] font-bold px-2 py-1 rounded-lg ${ACTION_BADGE_STYLE[r.action]}`}>
                                            {t(`actions.${r.action}`)}
                                        </span>
                                        <span className={`text-[11px] font-bold px-2 py-1 rounded-lg ${r.status === 'APPROVED' ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'}`}>
                                            {t(`statusLabel.${r.status}`)}
                                        </span>
                                        <span className="text-xs text-slate-400">{r.position}</span>
                                    </div>
                                    <h3 className="font-semibold text-slate-800">{r.competencyName}</h3>
                                    <p className="text-xs text-slate-500 mt-0.5">
                                        {t('requestedBy', { name: names[r.requesterId] || r.requesterId })}
                                        {r.reviewedBy && <> &middot; {t('reviewedBy', { name: names[r.reviewedBy] || r.reviewedBy })}</>}
                                        {r.reviewedAt && <> &middot; {new Date(r.reviewedAt).toLocaleDateString()}</>}
                                    </p>
                                    {r.status === 'REJECTED' && r.rejectionReason && (
                                        <p className="text-xs text-rose-600 mt-1 italic">{t('rejectionReason', { reason: r.rejectionReason })}</p>
                                    )}
                                </div>
                            </div>
                            <div className="bg-slate-50 rounded-xl p-3">
                                {renderChangeSummary(r)}
                            </div>
                        </div>
                    ))}
                </div>
            )}

            <ConfirmationModal
                isOpen={!!rejectTarget}
                onClose={() => setRejectTarget(null)}
                onConfirm={confirmReject}
                title={t('rejectModal.title')}
                message={t('rejectModal.message', { name: rejectTarget?.competencyName })}
                confirmText={t('rejectModal.confirm')}
                variant="danger"
                showInput
                inputPlaceholder={t('rejectModal.reasonPlaceholder')}
                inputValue={rejectReason}
                onInputChange={setRejectReason}
            />
        </div>
    );
};

export default CompetencyApprovalManager;
