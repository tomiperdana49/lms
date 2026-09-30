import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Trophy, Medal, Search, Loader2, Users, User as UserIcon, Info, ChevronDown, Crown } from 'lucide-react';
import { API_BASE_URL } from '../config';
import type { User } from '../types';
import { PROGRAM_START_YEAR, getCurrentYear } from '../utils/competency';

type ComponentKey = 'reading' | 'module' | 'internal' | 'host' | 'external' | 'idp' | 'competency' | 'pte';
const COMPONENT_ORDER: ComponentKey[] = ['reading', 'module', 'internal', 'host', 'external', 'idp', 'competency', 'pte'];

interface ComponentScore {
    points: number;
    max: number;
    done?: number;
    due?: number;
}

interface IndividualRow {
    employeeId: string;
    name: string;
    jobPosition: string | null;
    department: string | null;
    isLeader: boolean;
    teamLeaderIds: string[];
    score: number;
    rank: number;
    // Only sent for the viewer's own row, or for every row when HR is viewing.
    components?: Partial<Record<ComponentKey, ComponentScore>>;
}

interface TeamRow {
    leaderId: string;
    leaderName: string;
    department: string | null;
    size: number;
    memberIds: string[];
    score: number;
    rank: number;
}

interface LeaderboardData {
    year: number;
    generatedAt: string;
    viewerEmployeeId: string | null;
    individuals: IndividualRow[];
    teams: TeamRow[];
}

const categoryOf = (score: number): { key: 'excellent' | 'good' | 'fair' | 'low'; className: string } => {
    if (score >= 90) return { key: 'excellent', className: 'bg-emerald-50 text-emerald-700' };
    if (score >= 75) return { key: 'good', className: 'bg-blue-50 text-blue-700' };
    if (score >= 60) return { key: 'fair', className: 'bg-amber-50 text-amber-700' };
    return { key: 'low', className: 'bg-slate-100 text-slate-500' };
};

const RankBadge = ({ rank }: { rank: number }) => {
    if (rank === 1) return <Crown className="w-5 h-5 text-amber-500" aria-label="1" />;
    if (rank === 2) return <Medal className="w-5 h-5 text-slate-400" aria-label="2" />;
    if (rank === 3) return <Medal className="w-5 h-5 text-orange-400" aria-label="3" />;
    return <span className="text-sm font-bold text-slate-400">{rank}</span>;
};

const ScoreBar = ({ score }: { score: number }) => (
    <div className="flex items-center gap-3 min-w-[140px]">
        <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
            <div className="h-full bg-blue-500 rounded-full" style={{ width: `${Math.max(0, Math.min(100, score))}%` }} />
        </div>
        <span className="w-10 text-right text-sm font-black text-slate-800 tabular-nums">{score}</span>
    </div>
);

const ComponentBreakdown = ({ components }: { components: Partial<Record<ComponentKey, ComponentScore>> }) => {
    const { t } = useTranslation('leaderboard');
    return (
        <div className="grid sm:grid-cols-2 gap-x-6 gap-y-3">
            {COMPONENT_ORDER.filter(k => components[k]).map(k => {
                const c = components[k]!;
                const pct = Math.max(0, Math.min(100, (c.points / c.max) * 100));
                return (
                    <div key={k}>
                        <div className="flex items-center justify-between text-xs mb-1">
                            <span className="font-semibold text-slate-600">{t(`components.${k}`)}</span>
                            <span className={`font-bold tabular-nums ${c.points < 0 ? 'text-rose-600' : 'text-slate-700'}`}>
                                {c.points} / {c.max}
                            </span>
                        </div>
                        <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                            <div className={`h-full rounded-full ${c.points < 0 ? 'bg-rose-400' : 'bg-emerald-500'}`} style={{ width: `${c.points < 0 ? 100 : pct}%` }} />
                        </div>
                        {c.due !== undefined && (
                            <p className="text-[11px] text-slate-400 mt-0.5">{t('dutyProgress', { done: c.done, due: c.due })}</p>
                        )}
                    </div>
                );
            })}
        </div>
    );
};

export default function LeaderboardPage({ currentUser }: { currentUser: User }) {
    const { t, i18n } = useTranslation('leaderboard');
    const currentYear = getCurrentYear();
    const [year, setYear] = useState(currentYear);
    const [data, setData] = useState<LeaderboardData | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState(false);
    const [tab, setTab] = useState<'individual' | 'team'>('individual');
    const [search, setSearch] = useState('');
    const [expandedId, setExpandedId] = useState<string | null>(null);
    const [showHow, setShowHow] = useState(false);

    const load = async (targetYear: number) => {
        setIsLoading(true);
        setError(false);
        try {
            const res = await fetch(`${API_BASE_URL}/api/leaderboard?year=${targetYear}`);
            if (!res.ok) throw new Error(String(res.status));
            setData(await res.json());
        } catch (err) {
            console.error('[LEADERBOARD] Failed to load:', err);
            setError(true);
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => { load(year); }, [year]);

    const yearOptions = useMemo(() => {
        const years: number[] = [];
        for (let y = currentYear; y >= PROGRAM_START_YEAR; y--) years.push(y);
        return years;
    }, [currentYear]);

    const viewerId = data?.viewerEmployeeId || currentUser.employee_id || null;
    const me = data?.individuals.find(r => r.employeeId === viewerId) || null;
    const myTeams = data?.teams.filter(team => viewerId && team.memberIds.includes(viewerId)) || [];

    const query = search.trim().toLowerCase();
    const individuals = (data?.individuals || []).filter(r => !query ||
        r.name.toLowerCase().includes(query) ||
        (r.jobPosition || '').toLowerCase().includes(query) ||
        (r.department || '').toLowerCase().includes(query));
    const teams = (data?.teams || []).filter(team => !query ||
        team.leaderName.toLowerCase().includes(query) ||
        (team.department || '').toLowerCase().includes(query));

    const updatedAt = data ? new Date(data.generatedAt).toLocaleString(i18n.language === 'id' ? 'id-ID' : 'en-GB', { dateStyle: 'medium', timeStyle: 'short' }) : '';

    return (
        <div className="p-4 sm:p-6 lg:p-8 space-y-6 max-w-6xl mx-auto">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-black text-slate-800 tracking-tight flex items-center gap-2">
                        <Trophy className="w-6 h-6 text-amber-500" /> {t('title')}
                    </h1>
                    <p className="text-slate-400 text-sm font-medium mt-1">{t('subtitle')}</p>
                </div>
                <div className="flex items-center gap-3">
                    {data && !isLoading && <span className="text-xs text-slate-400">{t('updatedAt', { time: updatedAt })}</span>}
                    <label className="sr-only" htmlFor="leaderboard-year">{t('year')}</label>
                    <select
                        id="leaderboard-year"
                        value={year}
                        onChange={e => setYear(Number(e.target.value))}
                        className="px-4 py-2.5 bg-white border border-slate-200 rounded-xl text-sm font-semibold text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                        {yearOptions.map(y => <option key={y} value={y}>{y}</option>)}
                    </select>
                </div>
            </div>

            {isLoading ? (
                <div className="flex flex-col items-center justify-center py-24 text-slate-400 gap-3">
                    <Loader2 className="w-8 h-8 animate-spin" />
                    <p className="text-sm font-medium">{t('loading')}</p>
                </div>
            ) : error || !data ? (
                <div className="bg-white border border-slate-100 rounded-2xl p-8 text-center space-y-3">
                    <p className="text-slate-500">{t('loadError')}</p>
                    <button onClick={() => load(year)} className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold rounded-xl">
                        {t('retry')}
                    </button>
                </div>
            ) : (
                <>
                    {/* My score */}
                    <div className="bg-white border border-slate-100 rounded-2xl p-5 sm:p-6 shadow-sm">
                        <p className="text-xs font-black uppercase tracking-widest text-slate-400 mb-3">{t('myScore.title')}</p>
                        {me ? (
                            <div className="flex flex-col lg:flex-row gap-6">
                                <div className="lg:w-56 shrink-0">
                                    <div className="flex items-end gap-2">
                                        <span className="text-5xl font-black text-slate-800 tabular-nums">{me.score}</span>
                                        <span className="text-slate-400 font-bold mb-1.5">/ 100</span>
                                    </div>
                                    <span className={`inline-block mt-2 px-2.5 py-1 rounded-full text-xs font-bold ${categoryOf(me.score).className}`}>
                                        {t(`category.${categoryOf(me.score).key}`)}
                                    </span>
                                    <p className="text-sm font-semibold text-slate-600 mt-3">{t('myScore.rankOf', { rank: me.rank, total: data.individuals.length })}</p>
                                    {myTeams.map(team => (
                                        <p key={team.leaderId} className="text-xs text-slate-500 mt-1">
                                            {t('myScore.myTeam', { name: team.leaderName, rank: team.rank, score: team.score })}
                                        </p>
                                    ))}
                                </div>
                                {me.components && (
                                    <div className="flex-1">
                                        <p className="text-xs font-bold text-slate-400 mb-3">{t('myScore.breakdown')}</p>
                                        <ComponentBreakdown components={me.components} />
                                    </div>
                                )}
                            </div>
                        ) : (
                            <p className="text-sm text-slate-500">{t('myScore.notRanked')}</p>
                        )}
                    </div>

                    {/* How it's scored */}
                    <div className="bg-blue-50/60 border border-blue-100 rounded-2xl">
                        <button
                            onClick={() => setShowHow(v => !v)}
                            className="w-full flex items-center justify-between px-5 py-3 text-sm font-bold text-blue-700"
                            aria-expanded={showHow}
                        >
                            <span className="flex items-center gap-2"><Info className="w-4 h-4" /> {t('howTitle')}</span>
                            <ChevronDown className={`w-4 h-4 transition-transform ${showHow ? 'rotate-180' : ''}`} />
                        </button>
                        {showHow && (
                            <ul className="px-5 pb-4 space-y-1.5 text-sm text-slate-600 list-disc list-inside">
                                {(['intro', 'reading', 'module', 'internal', 'host', 'external', 'leader', 'team'] as const).map(k => (
                                    <li key={k}>{t(`how.${k}`)}</li>
                                ))}
                            </ul>
                        )}
                    </div>

                    {/* Rankings */}
                    <div className="bg-white border border-slate-100 rounded-2xl shadow-sm overflow-hidden">
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 border-b border-slate-100">
                            <div className="inline-flex bg-slate-100 rounded-xl p-1">
                                {(['individual', 'team'] as const).map(key => (
                                    <button
                                        key={key}
                                        onClick={() => { setTab(key); setExpandedId(null); }}
                                        className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-bold transition-colors ${tab === key ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                                    >
                                        {key === 'individual' ? <UserIcon className="w-4 h-4" /> : <Users className="w-4 h-4" />}
                                        {t(`tabs.${key}`)}
                                    </button>
                                ))}
                            </div>
                            <div className="relative sm:w-80">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                                <input
                                    value={search}
                                    onChange={e => setSearch(e.target.value)}
                                    placeholder={t('searchPlaceholder')}
                                    className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
                                />
                            </div>
                        </div>

                        {tab === 'individual' ? (
                            individuals.length === 0 ? (
                                <p className="text-sm text-slate-400 italic text-center py-10">{t('empty')}</p>
                            ) : (
                                <ul className="divide-y divide-slate-50">
                                    {individuals.map(row => {
                                        const isMe = row.employeeId === viewerId;
                                        const canExpand = !!row.components && !isMe;
                                        const isExpanded = expandedId === row.employeeId;
                                        return (
                                            <li key={row.employeeId} className={isMe ? 'bg-blue-50/60' : ''}>
                                                <div className="flex items-center gap-3 sm:gap-4 px-4 py-3">
                                                    <div className="w-8 flex justify-center shrink-0"><RankBadge rank={row.rank} /></div>
                                                    <div className="flex-1 min-w-0">
                                                        <p className="text-sm font-bold text-slate-800 truncate flex items-center gap-2">
                                                            {row.name}
                                                            {row.isLeader && <span className="px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-600 text-[10px] font-bold">{t('leaderBadge')}</span>}
                                                            {isMe && <span className="px-1.5 py-0.5 rounded bg-blue-600 text-white text-[10px] font-bold">{t('you')}</span>}
                                                        </p>
                                                        <p className="text-xs text-slate-400 truncate">{[row.jobPosition, row.department].filter(Boolean).join(' · ')}</p>
                                                    </div>
                                                    <ScoreBar score={row.score} />
                                                    {canExpand && (
                                                        <button
                                                            onClick={() => setExpandedId(isExpanded ? null : row.employeeId)}
                                                            className="p-1.5 text-slate-400 hover:text-slate-700"
                                                            aria-label={isExpanded ? t('hideDetail') : t('showDetail')}
                                                            aria-expanded={isExpanded}
                                                        >
                                                            <ChevronDown className={`w-4 h-4 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                                                        </button>
                                                    )}
                                                </div>
                                                {canExpand && isExpanded && row.components && (
                                                    <div className="px-4 sm:pl-16 pb-4">
                                                        <ComponentBreakdown components={row.components} />
                                                    </div>
                                                )}
                                            </li>
                                        );
                                    })}
                                </ul>
                            )
                        ) : teams.length === 0 ? (
                            <p className="text-sm text-slate-400 italic text-center py-10">{t('empty')}</p>
                        ) : (
                            <ul className="divide-y divide-slate-50">
                                {teams.map(team => {
                                    const isMine = !!viewerId && team.memberIds.includes(viewerId);
                                    return (
                                        <li key={team.leaderId} className={`flex items-center gap-3 sm:gap-4 px-4 py-3 ${isMine ? 'bg-blue-50/60' : ''}`}>
                                            <div className="w-8 flex justify-center shrink-0"><RankBadge rank={team.rank} /></div>
                                            <div className="flex-1 min-w-0">
                                                <p className="text-sm font-bold text-slate-800 truncate flex items-center gap-2">
                                                    {t('teamOf', { name: team.leaderName })}
                                                    {isMine && <span className="px-1.5 py-0.5 rounded bg-blue-600 text-white text-[10px] font-bold">{t('yourTeam')}</span>}
                                                </p>
                                                <p className="text-xs text-slate-400 truncate">
                                                    {[team.department, t('membersCount', { count: team.size })].filter(Boolean).join(' · ')}
                                                </p>
                                            </div>
                                            <ScoreBar score={team.score} />
                                        </li>
                                    );
                                })}
                            </ul>
                        )}
                    </div>
                </>
            )}
        </div>
    );
}
