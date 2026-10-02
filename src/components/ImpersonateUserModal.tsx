import { useEffect, useMemo, useState } from 'react';
import { Search, X, LogIn, Loader2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { API_BASE_URL } from '../config';
import type { User } from '../types';

interface ImpersonateUserModalProps {
    currentUserId?: number | string;
    onClose: () => void;
    // Resolves once the switch is done (the page reloads), rejects with a message to show.
    onSelect: (userId: number | string) => Promise<void>;
}

// HR picks which employee to sign in as (see /api/auth/impersonate) - HR accounts aren't offered.
const ImpersonateUserModal = ({ currentUserId, onClose, onSelect }: ImpersonateUserModalProps) => {
    const { t } = useTranslation('dashboardLayout');
    const [users, setUsers] = useState<User[]>([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [switchingId, setSwitchingId] = useState<number | string | null>(null);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        fetch(`${API_BASE_URL}/api/users`)
            .then((res) => (res.ok ? res.json() : Promise.reject(new Error(String(res.status)))))
            .then((data: User[]) => setUsers(data.filter((u) => u.role === 'STAFF' && String(u.id) !== String(currentUserId))))
            .catch(() => setError(t('impersonation.loadFailed')))
            .finally(() => setLoading(false));
    }, [currentUserId, t]);

    const filtered = useMemo(() => {
        const q = search.trim().toLowerCase();
        const list = q
            ? users.filter((u) => [u.name, u.email, u.employee_id, u.branch].some((v) => v?.toLowerCase().includes(q)))
            : users;
        return [...list].sort((a, b) => (a.name || '').localeCompare(b.name || ''));
    }, [users, search]);

    const handleSelect = async (userId: number | string) => {
        setSwitchingId(userId);
        setError(null);
        try {
            await onSelect(userId);
        } catch (err) {
            setError(err instanceof Error && err.message ? err.message : t('impersonation.switchFailed'));
            setSwitchingId(null);
        }
    };

    return (
        <div className="fixed inset-0 z-[80] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[80vh] flex flex-col overflow-hidden animate-in zoom-in-95">
                <div className="flex items-start justify-between gap-4 p-5 border-b border-slate-100">
                    <div>
                        <h3 className="text-lg font-bold text-slate-800">{t('impersonation.title')}</h3>
                        <p className="text-sm text-slate-500 mt-0.5">{t('impersonation.subtitle')}</p>
                    </div>
                    <button onClick={onClose} className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-xl transition-colors">
                        <X size={20} />
                    </button>
                </div>

                <div className="p-4 border-b border-slate-100">
                    <div className="relative">
                        <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                        <input
                            type="text"
                            autoFocus
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            placeholder={t('impersonation.searchPlaceholder')}
                            className="w-full pl-9 pr-3 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-400"
                        />
                    </div>
                    {error && <p className="text-sm text-red-600 mt-2">{error}</p>}
                </div>

                <div className="flex-1 overflow-y-auto p-2">
                    {loading ? (
                        <div className="flex justify-center py-10 text-slate-400"><Loader2 size={24} className="animate-spin" /></div>
                    ) : filtered.length === 0 ? (
                        <p className="text-sm text-slate-400 text-center py-10">{t('impersonation.noResults')}</p>
                    ) : (
                        filtered.map((u) => (
                            <button
                                key={u.id}
                                type="button"
                                disabled={switchingId !== null}
                                onClick={() => u.id != null && handleSelect(u.id)}
                                className="w-full flex items-center justify-between gap-3 px-3 py-2.5 rounded-xl text-left hover:bg-indigo-50 disabled:opacity-60 transition-colors"
                            >
                                <div className="min-w-0">
                                    <div className="font-semibold text-sm text-slate-800 truncate">{u.name}</div>
                                    <div className="text-xs text-slate-400 truncate">{[u.employee_id, u.email, u.branch].filter(Boolean).join(' · ')}</div>
                                </div>
                                {switchingId === u.id
                                    ? <Loader2 size={16} className="animate-spin text-indigo-600 shrink-0" />
                                    : <LogIn size={16} className="text-slate-300 shrink-0" />}
                            </button>
                        ))
                    )}
                </div>
            </div>
        </div>
    );
};

export default ImpersonateUserModal;
