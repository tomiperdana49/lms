import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { UserPlus, Check, X } from 'lucide-react';
import { API_BASE_URL } from '../config';

interface PendingJoinRequest {
    id: number;
    meeting_id: number;
    employee_id: string;
    employee_name: string | null;
    meeting_title: string;
    meeting_date: string;
    meeting_time: string | null;
    created_at: string;
}

interface MeetingJoinRequestsProps {
    // Called after an approval, so the training list can reload and show the new participant.
    onApproved?: () => void;
}

// HR: employees who asked to join an internal training from the Calendar. Approving adds them to
// the training's participants; rejecting (optionally with a reason) is shown back to the employee.
const MeetingJoinRequests = ({ onApproved }: MeetingJoinRequestsProps) => {
    const { t } = useTranslation('adminDashboard');
    const [requests, setRequests] = useState<PendingJoinRequest[]>([]);
    const [busyId, setBusyId] = useState<number | null>(null);
    const [rejectingId, setRejectingId] = useState<number | null>(null);
    const [reason, setReason] = useState('');
    const [error, setError] = useState<string | null>(null);

    const fetchRequests = useCallback(async () => {
        try {
            const res = await fetch(`${API_BASE_URL}/api/meeting-join-requests?status=Pending`);
            const data = await res.json();
            setRequests(Array.isArray(data) ? data : []);
        } catch (err) {
            console.error('Failed to fetch join requests:', err);
        }
    }, []);

    useEffect(() => {
        fetchRequests();
    }, [fetchRequests]);

    const decide = async (id: number, action: 'approve' | 'reject') => {
        setBusyId(id);
        setError(null);
        try {
            const res = await fetch(`${API_BASE_URL}/api/meeting-join-requests/${id}/decision`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action, reason: action === 'reject' ? reason.trim() || null : null })
            });
            if (!res.ok) {
                const data = await res.json().catch(() => ({}));
                setError(data.error || t('joinRequests.failed'));
            } else {
                setRejectingId(null);
                setReason('');
                if (action === 'approve') onApproved?.();
            }
            await fetchRequests();
        } catch (err) {
            console.error('Join request decision failed:', err);
            setError(t('joinRequests.failed'));
        } finally {
            setBusyId(null);
        }
    };

    if (requests.length === 0) return null;

    return (
        <div className="bg-white rounded-2xl border border-amber-200 shadow-sm p-5 mb-6">
            <div className="flex items-center gap-2 mb-4">
                <div className="p-2 rounded-xl bg-amber-50 text-amber-600"><UserPlus size={18} /></div>
                <h3 className="font-bold text-slate-800">{t('joinRequests.title')}</h3>
                <span className="px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 text-xs font-bold">{requests.length}</span>
            </div>
            {error && <p className="text-sm font-semibold text-rose-600 mb-3">{error}</p>}
            <div className="divide-y divide-slate-100">
                {requests.map(r => (
                    <div key={r.id} className="py-3 flex flex-col sm:flex-row sm:items-center gap-3">
                        <div className="flex-1 min-w-0">
                            <p className="font-semibold text-slate-800 text-sm">{r.employee_name || r.employee_id}</p>
                            <p className="text-xs text-slate-500 truncate">
                                {r.meeting_title} &middot; {new Date(r.meeting_date).toLocaleDateString('en-GB')}{r.meeting_time ? ` · ${r.meeting_time}` : ''}
                            </p>
                            <p className="text-[11px] text-slate-400">{t('joinRequests.requestedAt', { date: new Date(r.created_at).toLocaleDateString('en-GB') })}</p>
                        </div>
                        {rejectingId === r.id ? (
                            <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
                                <input
                                    value={reason}
                                    onChange={e => setReason(e.target.value)}
                                    placeholder={t('joinRequests.reasonPlaceholder')}
                                    className="text-sm border border-slate-200 rounded-lg px-3 py-2 sm:w-64 outline-none focus:ring-2 focus:ring-rose-200"
                                />
                                <div className="flex gap-2">
                                    <button type="button" disabled={busyId === r.id} onClick={() => decide(r.id, 'reject')} className="px-3 py-2 rounded-lg bg-rose-600 hover:bg-rose-700 disabled:opacity-60 text-white text-xs font-bold">
                                        {t('joinRequests.confirmReject')}
                                    </button>
                                    <button type="button" onClick={() => { setRejectingId(null); setReason(''); }} className="px-3 py-2 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-600 text-xs font-bold">
                                        {t('joinRequests.cancel')}
                                    </button>
                                </div>
                            </div>
                        ) : (
                            <div className="flex gap-2">
                                <button type="button" disabled={busyId === r.id} onClick={() => decide(r.id, 'approve')} className="flex items-center gap-1 px-3 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white text-xs font-bold">
                                    <Check size={14} /> {t('joinRequests.approve')}
                                </button>
                                <button type="button" disabled={busyId === r.id} onClick={() => { setRejectingId(r.id); setReason(''); }} className="flex items-center gap-1 px-3 py-2 rounded-lg bg-white border border-rose-200 hover:bg-rose-50 text-rose-600 text-xs font-bold">
                                    <X size={14} /> {t('joinRequests.reject')}
                                </button>
                            </div>
                        )}
                    </div>
                ))}
            </div>
        </div>
    );
};

export default MeetingJoinRequests;
