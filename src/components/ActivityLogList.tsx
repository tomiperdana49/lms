import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Search, Filter, ChevronLeft, ChevronRight, RefreshCw, History } from 'lucide-react';
import { API_BASE_URL } from '../config';

interface ActivityLog {
    id: number;
    actor_user_id: string | null;
    actor_employee_id: string | null;
    actor_name: string | null;
    actor_email: string | null;
    actor_role: string | null;
    module: string;
    action: string;
    target_id: string | null;
    target_label: string | null;
    changes: FieldChange[] | null;
    method: string;
    path: string;
    ip_address: string | null;
    created_at: string;
}

// Either a value change (from/to) or a list membership change (added/removed). `path` is absent
// on entries recorded before JSON columns were diffed field by field.
interface FieldChange {
    field: string;
    path?: string[];
    from?: string | null;
    to?: string | null;
    added?: string[];
    removed?: string[];
    opaque?: boolean; // question banks / form definitions - only "it changed" is recorded
}

interface ActivityLogListProps {
    onBack: () => void;
}

// Mirrors the module keys assigned by ACTIVITY_RULES in server/server.js.
const MODULES = ['reading_log', 'online_module', 'internal_training', 'external_training', 'pte', 'idp', 'incentive', 'competency', 'user', 'feedback', 'other'];

const MODULE_COLORS: Record<string, string> = {
    reading_log: 'bg-orange-100 text-orange-700',
    online_module: 'bg-blue-100 text-blue-700',
    internal_training: 'bg-purple-100 text-purple-700',
    external_training: 'bg-indigo-100 text-indigo-700',
    pte: 'bg-teal-100 text-teal-700',
    idp: 'bg-emerald-100 text-emerald-700',
    incentive: 'bg-amber-100 text-amber-700',
    competency: 'bg-pink-100 text-pink-700',
    user: 'bg-cyan-100 text-cyan-700',
    feedback: 'bg-lime-100 text-lime-700',
    other: 'bg-gray-100 text-gray-600',
};

const PAGE_SIZE = 50;
const COLLAPSED_CHANGES = 3;

// Fallback for a column without a label in activityLog.json's `fields` - still better than snake_case.
const humanizeField = (field: string) => {
    const words = field.replace(/_json$/, '').replace(/([a-z])([A-Z])/g, '$1 $2').replace(/_/g, ' ').trim();
    return words.charAt(0).toUpperCase() + words.slice(1);
};

const isListElementSegment = (segment: string) => segment.startsWith('[') && segment.endsWith(']');

// The key a value belongs to (e.g. snackCost), skipping "[Name]" list-element segments.
const leafKey = (change: FieldChange) => [...(change.path || [change.field])].reverse().find((seg) => !isListElementSegment(seg)) || change.field;

const MONEY_KEY = /(cost|fee|reward|incentive|amount)|^(trainer|snack|lunch|other|total)$/i;
const BOOLEAN_KEY = /^is(_|[A-Z])/;
const FILE_VALUE = /^(\/api)?\/uploads\/|^https?:\/\//;
const rupiah = new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 });

const ISO_DATE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/;

const ActivityLogList = ({ onBack }: ActivityLogListProps) => {
    const { t, i18n } = useTranslation('activityLog');
    const [logs, setLogs] = useState<ActivityLog[]>([]);
    const [total, setTotal] = useState(0);
    const [loading, setLoading] = useState(false);
    const [page, setPage] = useState(1);

    const [searchInput, setSearchInput] = useState('');
    const [search, setSearch] = useState('');
    const [module, setModule] = useState('');
    const [role, setRole] = useState('');
    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');
    const [expanded, setExpanded] = useState<Set<number>>(new Set());

    const toggleExpanded = (id: number) => setExpanded((prev) => {
        const next = new Set(prev);
        if (next.has(id)) next.delete(id); else next.add(id);
        return next;
    });

    // Debounce the search box so typing doesn't fire a request per keystroke.
    useEffect(() => {
        const timer = setTimeout(() => setSearch(searchInput.trim()), 400);
        return () => clearTimeout(timer);
    }, [searchInput]);

    useEffect(() => {
        setPage(1);
    }, [search, module, role, startDate, endDate]);

    const fetchLogs = async () => {
        setLoading(true);
        try {
            const params = new URLSearchParams({ page: String(page), pageSize: String(PAGE_SIZE) });
            if (search) params.set('search', search);
            if (module) params.set('module', module);
            if (role) params.set('role', role);
            if (startDate) params.set('startDate', startDate);
            if (endDate) params.set('endDate', endDate);
            const res = await fetch(`${API_BASE_URL}/api/activity-logs?${params}`);
            if (res.ok) {
                const data = await res.json();
                setLogs(data.rows || []);
                setTotal(data.total || 0);
            }
        } catch (err) {
            console.error('Failed to fetch activity logs', err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchLogs();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [page, search, module, role, startDate, endDate]);

    const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
    const isHR = (r: string | null) => r === 'HR' || r === 'HR_ADMIN';

    const formatTime = (value: string) => new Date(value).toLocaleString(i18n.language === 'id' ? 'id-ID' : 'en-GB', {
        day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit',
    });

    // "[Name]" segments identify a list element (e.g. one participant) and are shown as-is.
    const formatPath = (change: FieldChange) => (change.path || [change.field])
        .map((segment) => (isListElementSegment(segment) ? segment.slice(1, -1) : t(`fields.${segment}`, { defaultValue: humanizeField(segment) })))
        .join(' › ');

    const formatValue = (value: string | null | undefined, key: string) => {
        if (value === null || value === undefined || value === '') return <span className="italic text-slate-400">{t('changes.empty')}</span>;
        if (key === 'role' || key === 'actor_role') return t(`roleValues.${value}`, { defaultValue: value });
        if (value === 'true' || (BOOLEAN_KEY.test(key) && value === '1')) return t('changes.yes');
        if (value === 'false' || (BOOLEAN_KEY.test(key) && value === '0')) return t('changes.no');
        if (MONEY_KEY.test(key) && value.trim() !== '' && !isNaN(Number(value))) return rupiah.format(Number(value));
        if (ISO_DATE.test(value)) return formatTime(value);
        if (FILE_VALUE.test(value)) {
            const href = value.startsWith('/') ? `${API_BASE_URL}${value}` : value;
            return <a href={href} target="_blank" rel="noreferrer" className="underline hover:opacity-80" title={value}>{t('changes.viewFile')}</a>;
        }
        return value;
    };

    const inputClass = 'w-full min-w-0 h-10 px-3 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white text-sm';

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div className="flex items-center gap-4">
                    <button onClick={onBack} className="p-2 hover:bg-slate-100 rounded-full transition-colors">
                        <ChevronLeft size={24} className="text-slate-600" />
                    </button>
                    <div>
                        <h2 className="text-2xl font-bold text-slate-800">{t('header.title')}</h2>
                        <p className="text-slate-500">{t('header.subtitle')}</p>
                    </div>
                </div>
                <button
                    onClick={fetchLogs}
                    className="flex items-center gap-2 bg-white border border-slate-200 text-slate-700 px-4 py-2 rounded-xl hover:bg-slate-50 transition"
                >
                    <RefreshCw size={18} className={loading ? 'animate-spin' : ''} /> {t('refresh')}
                </button>
            </div>

            {/* Filters */}
            <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-100 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-6 gap-3">
                <div className="relative lg:col-span-2">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                    <input
                        type="text"
                        placeholder={t('filters.searchPlaceholder')}
                        value={searchInput}
                        onChange={(e) => setSearchInput(e.target.value)}
                        className={`${inputClass} pl-10`}
                    />
                </div>
                <div className="relative">
                    <Filter className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                    <select value={module} onChange={(e) => setModule(e.target.value)} className={`${inputClass} pl-10 appearance-none`}>
                        <option value="">{t('filters.allModules')}</option>
                        {MODULES.map((m) => <option key={m} value={m}>{t(`modules.${m}`)}</option>)}
                    </select>
                </div>
                <select value={role} onChange={(e) => setRole(e.target.value)} className={`${inputClass} appearance-none`}>
                    <option value="">{t('filters.allRoles')}</option>
                    <option value="HR">{t('roles.HR')}</option>
                    <option value="STAFF">{t('roles.STAFF')}</option>
                </select>
                <div className="flex items-center gap-2 min-w-0 md:col-span-2">
                    <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className={inputClass} aria-label={t('filters.startDate')} />
                    <span className="text-slate-400 shrink-0">–</span>
                    <input type="date" value={endDate} min={startDate || undefined} onChange={(e) => setEndDate(e.target.value)} className={inputClass} aria-label={t('filters.endDate')} />
                </div>
            </div>

            {/* Table */}
            <div className="bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead className="bg-slate-50 text-slate-500 text-xs uppercase tracking-wider">
                            <tr>
                                <th className="text-left px-4 py-3 font-semibold whitespace-nowrap">{t('table.time')}</th>
                                <th className="text-left px-4 py-3 font-semibold">{t('table.user')}</th>
                                <th className="text-left px-4 py-3 font-semibold">{t('table.module')}</th>
                                <th className="text-left px-4 py-3 font-semibold">{t('table.action')}</th>
                                <th className="text-left px-4 py-3 font-semibold">{t('table.detail')}</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {logs.length === 0 && !loading && (
                                <tr>
                                    <td colSpan={5} className="px-4 py-12 text-center text-slate-400">
                                        <History size={32} className="mx-auto mb-2 opacity-50" />
                                        {t('empty')}
                                    </td>
                                </tr>
                            )}
                            {logs.map((log) => (
                                <tr key={log.id} className="hover:bg-slate-50">
                                    <td className="px-4 py-3 text-slate-500 whitespace-nowrap">{formatTime(log.created_at)}</td>
                                    <td className="px-4 py-3">
                                        <div className="flex items-center gap-2">
                                            <span className="font-semibold text-slate-800">{log.actor_name || t('unknownUser')}</span>
                                            {log.actor_role && (
                                                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${isHR(log.actor_role) ? 'bg-rose-100 text-rose-700' : 'bg-slate-100 text-slate-600'}`}>
                                                    {isHR(log.actor_role) ? t('roles.HR') : t('roles.STAFF')}
                                                </span>
                                            )}
                                        </div>
                                        <div className="text-xs text-slate-400">{[log.actor_employee_id, log.actor_email].filter(Boolean).join(' · ')}</div>
                                    </td>
                                    <td className="px-4 py-3">
                                        <span className={`text-xs font-semibold px-2 py-1 rounded-full whitespace-nowrap ${MODULE_COLORS[log.module] || MODULE_COLORS.other}`}>
                                            {t(`modules.${log.module}`, { defaultValue: log.module })}
                                        </span>
                                    </td>
                                    <td className="px-4 py-3 text-slate-700 whitespace-nowrap">{t(`actions.${log.action}`, { defaultValue: log.action })}</td>
                                    <td className="px-4 py-3 text-slate-600 max-w-md">
                                        {log.target_label || (log.target_id ? `#${log.target_id}` : '-')}
                                        {log.changes && log.changes.length > 0 && (
                                            <ul className="mt-1.5 space-y-1 text-xs">
                                                {(expanded.has(log.id) ? log.changes : log.changes.slice(0, COLLAPSED_CHANGES)).map((c) => (
                                                    <li key={c.field} className="break-words">
                                                        <span className="font-semibold text-slate-700">{formatPath(c)}:</span>{' '}
                                                        {c.opaque ? (
                                                            <span className="text-slate-600">{t('changes.opaque')}</span>
                                                        ) : c.added || c.removed ? (
                                                            <>
                                                                {c.added && c.added.length > 0 && <span className="text-emerald-700">{t('changes.added', { items: c.added.join(', ') })}</span>}
                                                                {c.added && c.added.length > 0 && c.removed && c.removed.length > 0 && <span className="text-slate-400 mx-1">·</span>}
                                                                {c.removed && c.removed.length > 0 && <span className="text-rose-600">{t('changes.removed', { items: c.removed.join(', ') })}</span>}
                                                            </>
                                                        ) : (
                                                            <>
                                                                <span className="text-rose-600 line-through decoration-rose-300">{formatValue(c.from, leafKey(c))}</span>
                                                                <span className="text-slate-400 mx-1">→</span>
                                                                <span className="text-emerald-700">{formatValue(c.to, leafKey(c))}</span>
                                                            </>
                                                        )}
                                                    </li>
                                                ))}
                                                {log.changes.length > COLLAPSED_CHANGES && (
                                                    <li>
                                                        <button onClick={() => toggleExpanded(log.id)} className="text-blue-600 hover:text-blue-700 font-medium">
                                                            {expanded.has(log.id) ? t('changes.showLess') : t('changes.showMore', { count: log.changes.length - COLLAPSED_CHANGES })}
                                                        </button>
                                                    </li>
                                                )}
                                            </ul>
                                        )}
                                        {log.module === 'other' && <div className="text-xs text-slate-400 font-mono">{log.method} {log.path}</div>}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>

                {/* Pagination */}
                <div className="flex items-center justify-between px-4 py-3 border-t border-slate-100 text-sm text-slate-500">
                    <span>{t('totalCount', { count: total })}</span>
                    <div className="flex items-center gap-2">
                        <button
                            onClick={() => setPage((p) => Math.max(1, p - 1))}
                            disabled={page <= 1}
                            className="p-1.5 rounded-lg border border-slate-200 disabled:opacity-40 hover:bg-slate-50"
                        >
                            <ChevronLeft size={16} />
                        </button>
                        <span>{t('pagination', { current: page, total: totalPages })}</span>
                        <button
                            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                            disabled={page >= totalPages}
                            className="p-1.5 rounded-lg border border-slate-200 disabled:opacity-40 hover:bg-slate-50"
                        >
                            <ChevronRight size={16} />
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default ActivityLogList;
