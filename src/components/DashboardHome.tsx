import { useState, useEffect } from 'react';
import { BookOpen, Users, Calendar as CalendarIcon, Video, GraduationCap, Star, Briefcase, Award, X, Clock, Wallet, AlertCircle, ChevronRight } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { Page, Role, Meeting } from '../types';
import { API_BASE_URL } from '../config';
import { ANNUAL_LEARNING_BUDGET } from './LearningReport';

interface PendingActionItem {
    id: number;
    title: string;
    subtitle: string;
    date: string;
    target: { page: Page; view?: string };
}

interface LearningStatDetail {
    title: string;
    date: string;
    hours: number;
    cost: number;
}

const formatHoursMinutes = (value: number, t: (key: string) => string) => {
    const totalMinutes = Math.round(value * 60);
    const h = Math.floor(totalMinutes / 60);
    const m = totalMinutes % 60;
    if (h > 0 && m > 0) return `${h} ${t('hours')} ${m} ${t('minutes')}`;
    if (h > 0) return `${h} ${t('hours')}`;
    return `${m} ${t('minutes')}`;
};

interface LearningStats {
    totalJam: number;
    totalBiaya: number;
    jamTraining: number;
    jamTrainingExternal: number;
    jamOnline: number;
    jamBuku: number;
    biayaTraining: number;
    biayaTrainingExternal: number;
    biayaBuku: number;
    trainingDetails: LearningStatDetail[];
    trainingExternalDetails: LearningStatDetail[];
    onlineDetails: LearningStatDetail[];
    bookDetails: LearningStatDetail[];
}

interface DashboardHomeProps {
    onNavigate?: (page: Page, view?: string) => void;
    userRole?: Role;
    isSupervisor?: boolean;
    userEmail?: string;
    userName?: string;
    userEmployeeId?: string;
    // Interns get no annual learning budget - the cost widget shows their spend without a cap.
    isIntern?: boolean;
    config?: { moduleInternal: boolean; moduleExternal: boolean; moduleIncentive: boolean };
}

const DashboardHome = ({ onNavigate, userRole, isSupervisor, userEmail, userName, userEmployeeId, isIntern, config }: DashboardHomeProps) => {
    const { t } = useTranslation('dashboardHome');
    const [pendingActions, setPendingActions] = useState<PendingActionItem[]>([]);
    const [isPendingActionsModalOpen, setIsPendingActionsModalOpen] = useState(false);

    // "Perlu Tindakan Anda": surfaces items where THIS user is the one who needs to act next -
    // a supervisor's team external-training requests, or HR's employee IDP submissions. Each role
    // only ever sees the one category relevant to them, mirroring the header notification logic.
    useEffect(() => {
        if (isSupervisor && userEmployeeId) {
            fetch(`${API_BASE_URL}/api/external-training/subordinates?leader_id=${userEmployeeId}`)
                .then(res => res.json())
                .then(data => {
                    const pending = (Array.isArray(data) ? data : []).filter((r: any) => r.status === 'Pending');
                    setPendingActions(pending.map((r: any) => ({
                        id: r.id,
                        title: r.employee_name,
                        subtitle: r.title,
                        date: r.created_at,
                        target: { page: 'external', view: 'team_approvals' }
                    })));
                })
                .catch(err => console.error('Error fetching pending external training:', err));
        } else if (userRole === 'HR' || userRole === 'HR_ADMIN') {
            Promise.all([
                fetch(`${API_BASE_URL}/api/idp/all`).then(res => res.json()),
                fetch(`${API_BASE_URL}/api/competency-change-requests?status=PENDING`).then(res => res.json())
            ])
                .then(([idpData, competencyData]) => {
                    const pendingIdp = (Array.isArray(idpData) ? idpData : []).filter((p: any) => p.status === 'Pending');
                    const idpItems: PendingActionItem[] = pendingIdp.map((p: any) => ({
                        id: p.id,
                        title: p.employee_name,
                        subtitle: t('pendingActions.idpItem', { year: p.period_year }),
                        // created_by_date is empty on some imported plans - fall back to when the row was made
                        date: p.created_by_date || p.created_at,
                        target: { page: 'admin-dashboard', view: 'idp' }
                    }));
                    const competencyItems: PendingActionItem[] = (Array.isArray(competencyData) ? competencyData : []).map((r: any) => ({
                        id: 100000 + r.id,
                        title: r.competencyName,
                        subtitle: t('pendingActions.competencyItem', { position: r.position }),
                        date: r.createdAt,
                        target: { page: 'admin-dashboard', view: 'competency-approvals' }
                    }));
                    setPendingActions([...idpItems, ...competencyItems]);
                })
                .catch(err => console.error('Error fetching pending actions:', err));
        } else {
            setPendingActions([]);
        }
    }, [userRole, isSupervisor, userEmployeeId, t]);

    // "Training Mendatang": the next few scheduled internal training sessions, shown to everyone.
    const [upcomingTrainings, setUpcomingTrainings] = useState<Meeting[]>([]);
    useEffect(() => {
        fetch(`${API_BASE_URL}/api/meetings`)
            .then(res => res.json())
            .then(data => {
                const startOfToday = new Date();
                startOfToday.setHours(0, 0, 0, 0);
                const upcoming = (Array.isArray(data) ? data : [])
                    .filter((m: Meeting) => new Date(m.date) >= startOfToday)
                    .sort((a: Meeting, b: Meeting) => new Date(a.date).getTime() - new Date(b.date).getTime() || (a.time || '').localeCompare(b.time || ''));
                setUpcomingTrainings(upcoming.slice(0, 4));
            })
            .catch(err => console.error('Error fetching upcoming training:', err));
    }, []);

    const handlePendingActionClick = (item: PendingActionItem) => {
        setIsPendingActionsModalOpen(false);
        onNavigate?.(item.target.page, item.target.view);
    };
    const [learningStats, setLearningStats] = useState<LearningStats>({
        totalJam: 0, totalBiaya: 0,
        jamTraining: 0, jamTrainingExternal: 0, jamOnline: 0, jamBuku: 0,
        biayaTraining: 0, biayaTrainingExternal: 0, biayaBuku: 0,
        trainingDetails: [], trainingExternalDetails: [], onlineDetails: [], bookDetails: []
    });
    const [detailModal, setDetailModal] = useState<'hours' | 'cost' | null>(null);

    useEffect(() => {
        if (userEmail) {
            const currentYear = new Date().getFullYear();
            const startDate = `${currentYear}-01-01`;
            const endDate = `${currentYear}-12-31`;
            fetch(`${API_BASE_URL}/api/learning-stats?email=${encodeURIComponent(userEmail)}&startDate=${startDate}&endDate=${endDate}`)
                .then(res => res.json())
                .then(data => {
                    if (!data.error) {
                        setLearningStats(data);
                    }
                })
                .catch(err => console.error("Error fetching learning stats:", err));
        }
    }, [userEmail]);

    const baseMenuItems = [
        {
            title: t('menu.readingLogTitle'),
            subtitle: t('menu.readingLogSubtitle'),
            icon: <BookOpen size={20} />,
            page: 'reading-log' as Page,
            color: 'text-orange-600',
            bg: 'bg-orange-50'
        },
        {
            title: t('menu.onlineCoursesTitle'),
            subtitle: t('menu.onlineCoursesSubtitle'),
            icon: <Video size={20} />,
            page: 'courses' as Page,
            color: 'text-blue-600',
            bg: 'bg-blue-50'
        },
        ...(config?.moduleInternal ? [{
            title: t('menu.internalTrainingTitle'),
            subtitle: t('menu.internalTrainingSubtitle'),
            icon: <Users size={20} />,
            page: 'internal' as Page,
            color: 'text-purple-600',
            bg: 'bg-purple-50'
        }] : []),
        ...(config?.moduleExternal ? [{
            title: t('menu.externalTrainingTitle'),
            subtitle: t('menu.externalTrainingSubtitle'),
            icon: <Briefcase size={20} />,
            page: 'external' as Page,
            color: 'text-teal-600',
            bg: 'bg-teal-50'
        }] : []),
        ...(config?.moduleIncentive ? [{
            title: t('menu.incentivesTitle'),
            subtitle: t('menu.incentivesSubtitle'),
            icon: <Award size={20} />,
            page: 'incentives' as Page,
            color: 'text-amber-500',
            bg: 'bg-amber-50'
        }] : []),
        {
            title: t('menu.calendarTitle'),
            subtitle: t('menu.calendarSubtitle'),
            icon: <CalendarIcon size={20} />,
            page: 'calendar' as Page,
            color: 'text-red-500',
            bg: 'bg-red-50'
        }
    ];

    const menuItems = [...baseMenuItems];

    const remainingBudget = Math.max(ANNUAL_LEARNING_BUDGET - learningStats.totalBiaya, 0);

    const getGreeting = () => {
        const hour = new Date().getHours();
        if (hour < 11) return t('goodMorning');
        if (hour < 15) return t('goodAfternoon');
        if (hour < 18) return t('goodEvening');
        return t('goodNight');
    };

    const showPendingActions = isSupervisor || userRole === 'HR' || userRole === 'HR_ADMIN';
    const currentYear = new Date().getFullYear();

    return (
        <div className="max-w-[1600px] mx-auto pt-2 md:pt-4 md:px-4 flex flex-col gap-5 sm:gap-6">
            {/* Header / Hero Section */}
            <div className="bg-gradient-to-br from-blue-700 via-indigo-700 to-purple-800 rounded-3xl p-5 sm:p-6 text-white shadow-xl relative overflow-hidden shrink-0 group">
                <div className="absolute -top-6 right-0 p-8 opacity-10 rotate-12 hidden sm:block">
                    <GraduationCap size={150} />
                </div>
                <div className="absolute -right-10 -top-10 w-40 h-40 bg-white/10 rounded-full blur-3xl group-hover:bg-white/20 transition-all duration-700"></div>
                <div className="absolute -left-10 -bottom-10 w-60 h-60 bg-blue-400/10 rounded-full blur-3xl"></div>

                <div className="relative z-10 flex flex-col lg:flex-row justify-between lg:items-center gap-5">
                    <div className="space-y-1 min-w-0">
                        <div className="inline-flex items-center gap-2 bg-white/10 backdrop-blur-md px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest border border-white/10 mb-1">
                            <Star size={12} className="text-yellow-400 fill-yellow-400" /> {t('dashboardOverview')}
                        </div>
                        <h1 className="text-2xl sm:text-3xl font-black tracking-tight leading-tight">
                            {getGreeting()}, <span className="text-blue-200">{userName || t('defaultUser')}</span>!
                        </h1>
                        <p className="text-blue-100/80 font-medium max-w-md text-sm">
                            {t('heroSubtitle')}
                        </p>
                    </div>

                    {/* Quick Stats - both cards share one layout: label row on top, figure at the bottom */}
                    <div className="grid grid-cols-2 gap-3 w-full lg:w-[460px] shrink-0">
                        <button
                            type="button"
                            onClick={() => setDetailModal('hours')}
                            className="bg-white/10 backdrop-blur-md rounded-2xl p-3 sm:p-4 border border-white/10 hover:bg-white/15 transition-all text-left cursor-pointer flex flex-col gap-3"
                        >
                            <div className="flex items-center gap-2">
                                <div className="p-1.5 sm:p-2 bg-blue-500 rounded-lg shadow-lg shadow-blue-500/20 shrink-0">
                                    <Clock size={16} />
                                </div>
                                <span className="text-[10px] sm:text-[11px] font-bold text-blue-100 uppercase tracking-wide leading-tight min-w-0">{t('learningHours')}</span>
                            </div>
                            <div className="mt-auto space-y-1.5">
                                <div className="flex items-baseline gap-1 flex-wrap">
                                    <span className="text-lg sm:text-xl font-black tracking-tighter">{learningStats.totalJam}</span>
                                    <span className="text-[11px] font-bold text-blue-100/60">{t('hours')}</span>
                                </div>
                                <p className="text-[10px] font-bold text-blue-100/70">{t('thisYear', { year: currentYear })}</p>
                            </div>
                        </button>
                        <button
                            type="button"
                            onClick={() => setDetailModal('cost')}
                            className="bg-white/10 backdrop-blur-md rounded-2xl p-3 sm:p-4 border border-white/10 hover:bg-white/15 transition-all text-left cursor-pointer flex flex-col gap-3"
                        >
                            <div className="flex items-center gap-2">
                                <div className="p-1.5 sm:p-2 bg-emerald-500 rounded-lg shadow-lg shadow-emerald-500/20 shrink-0">
                                    <Wallet size={16} />
                                </div>
                                <span className="text-[10px] sm:text-[11px] font-bold text-blue-100 uppercase tracking-wide leading-tight min-w-0">{t('learningCost')}</span>
                            </div>
                            <div className="mt-auto space-y-1.5">
                                <div className="flex items-baseline gap-1 flex-wrap" title={`Rp ${learningStats.totalBiaya.toLocaleString('id-ID')}`}>
                                    <span className="text-lg sm:text-xl font-black tracking-tighter text-emerald-300 whitespace-nowrap">
                                        Rp {learningStats.totalBiaya.toLocaleString('id-ID')}
                                    </span>
                                    {!isIntern && (
                                        <span className="text-[11px] font-bold text-blue-100/60 whitespace-nowrap">
                                            / Rp {ANNUAL_LEARNING_BUDGET.toLocaleString('id-ID')}
                                        </span>
                                    )}
                                </div>
                                {isIntern ? (
                                    <p className="text-[10px] font-bold text-blue-100/70">{t('noBudget')}</p>
                                ) : (
                                    <>
                                        <div className="w-full h-1.5 bg-white/10 rounded-full overflow-hidden">
                                            <div
                                                className={`h-full rounded-full ${remainingBudget > 0 ? 'bg-emerald-400' : 'bg-rose-400'}`}
                                                style={{ width: `${Math.min((learningStats.totalBiaya / ANNUAL_LEARNING_BUDGET) * 100, 100)}%` }}
                                            />
                                        </div>
                                        <p className={`text-[10px] font-bold ${remainingBudget > 0 ? 'text-blue-100/70' : 'text-rose-300'}`}>
                                            {remainingBudget > 0
                                                ? `${t('remainingBudget')}: Rp ${remainingBudget.toLocaleString('id-ID')}`
                                                : t('budgetExceeded')}
                                        </p>
                                    </>
                                )}
                            </div>
                        </button>
                    </div>
                </div>
            </div>

            {detailModal && (
                <LearningStatsDetailModal
                    mode={detailModal}
                    stats={learningStats}
                    onClose={() => setDetailModal(null)}
                    t={t}
                    hasBudget={!isIntern}
                />
            )}

            {isPendingActionsModalOpen && (
                <PendingActionsModal
                    items={pendingActions}
                    onItemClick={handlePendingActionClick}
                    onClose={() => setIsPendingActionsModalOpen(false)}
                    t={t}
                />
            )}

            {/* Pending actions and upcoming training side by side on wide screens, stacked on phones */}
            <div className={`grid grid-cols-1 ${showPendingActions ? 'lg:grid-cols-2' : ''} gap-5 sm:gap-6`}>
                {/* Perlu Tindakan Anda - only shown to roles that actually approve something */}
                {showPendingActions && (
                    <div className="bg-white rounded-3xl border border-slate-100 shadow-sm p-4 sm:p-5 flex flex-col">
                        <div className="flex items-center justify-between gap-3 mb-4">
                            <div className="flex items-center gap-2.5 min-w-0">
                                <div className={`p-2 rounded-xl shrink-0 ${pendingActions.length > 0 ? 'bg-amber-50 text-amber-600' : 'bg-emerald-50 text-emerald-600'}`}>
                                    <AlertCircle size={18} />
                                </div>
                                <h2 className="font-black text-slate-800 text-base sm:text-lg truncate">{t('pendingActions.title')}</h2>
                                {pendingActions.length > 0 && (
                                    <span className="px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 text-xs font-bold shrink-0">{pendingActions.length}</span>
                                )}
                            </div>
                            {pendingActions.length > 0 && (
                                <button onClick={() => setIsPendingActionsModalOpen(true)} className="text-xs font-bold text-indigo-600 hover:text-indigo-700 flex items-center gap-1 shrink-0">
                                    {t('pendingActions.viewAll')} <ChevronRight size={14} />
                                </button>
                            )}
                        </div>

                        {pendingActions.length === 0 ? (
                            <p className="text-sm text-slate-400">{t('pendingActions.empty')}</p>
                        ) : (
                            <div className="space-y-2">
                                {pendingActions.slice(0, 3).map(item => (
                                    <button
                                        key={item.id}
                                        onClick={() => handlePendingActionClick(item)}
                                        className="w-full flex items-center gap-3 p-3 rounded-2xl bg-slate-50 hover:bg-slate-100 transition-colors text-left group"
                                    >
                                        <div className="min-w-0 flex-1">
                                            <p className="font-bold text-slate-700 text-sm truncate">{item.title}</p>
                                            <p className="text-xs text-slate-400 truncate">
                                                {item.subtitle} · {new Date(item.date).toLocaleDateString('id-ID', { day: 'numeric', month: 'short' })}
                                            </p>
                                        </div>
                                        <span className="shrink-0 flex items-center gap-1 px-3 py-1.5 rounded-xl bg-white border border-slate-200 text-xs font-bold text-indigo-600 group-hover:bg-indigo-600 group-hover:text-white group-hover:border-indigo-600 transition-colors">
                                            {t('pendingActions.review')} <ChevronRight size={12} />
                                        </span>
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>
                )}

                {/* Training Mendatang - the next scheduled internal sessions, open to everyone */}
                <div className="bg-white rounded-3xl border border-slate-100 shadow-sm p-4 sm:p-5 flex flex-col">
                    <div className="flex items-center justify-between gap-3 mb-4">
                        <div className="flex items-center gap-2.5 min-w-0">
                            <div className="p-2 rounded-xl bg-indigo-50 text-indigo-600 shrink-0">
                                <CalendarIcon size={18} />
                            </div>
                            <h2 className="font-black text-slate-800 text-base sm:text-lg truncate">{t('upcomingTraining.title')}</h2>
                        </div>
                        <button onClick={() => onNavigate?.('calendar')} className="text-xs font-bold text-indigo-600 hover:text-indigo-700 flex items-center gap-1 shrink-0">
                            {t('upcomingTraining.viewCalendar')} <ChevronRight size={14} />
                        </button>
                    </div>

                    {upcomingTrainings.length === 0 ? (
                        <p className="text-sm text-slate-400">{t('upcomingTraining.empty')}</p>
                    ) : (
                        <div className={`grid grid-cols-1 ${showPendingActions ? '' : 'md:grid-cols-2'} gap-2`}>
                            {upcomingTrainings.map(m => {
                                const d = new Date(m.date);
                                const isToday = d.toDateString() === new Date().toDateString();
                                return (
                                    <button
                                        key={m.id}
                                        onClick={() => onNavigate?.('calendar')}
                                        className="w-full flex items-center gap-3 p-2.5 rounded-2xl bg-slate-50 hover:bg-slate-100 transition-colors text-left"
                                    >
                                        <div className={`w-12 h-12 rounded-xl flex flex-col items-center justify-center shrink-0 ${isToday ? 'bg-indigo-600 text-white' : 'bg-white border border-slate-200 text-slate-700'}`}>
                                            <span className="text-base font-black leading-none">{d.getDate()}</span>
                                            <span className={`text-[9px] font-bold uppercase mt-0.5 ${isToday ? 'text-indigo-100' : 'text-slate-400'}`}>
                                                {d.toLocaleDateString('id-ID', { month: 'short' })}
                                            </span>
                                        </div>
                                        <div className="min-w-0 flex-1">
                                            <p className="font-bold text-slate-700 text-sm truncate">{m.title}</p>
                                            <p className="text-xs text-slate-400 truncate flex items-center gap-1">
                                                {isToday && <span className="text-indigo-600 font-bold">{t('upcomingTraining.today')} ·</span>}
                                                <Clock size={11} className="shrink-0" /> {m.time}{m.type ? ` · ${m.type}` : ''}
                                            </p>
                                        </div>
                                    </button>
                                );
                            })}
                        </div>
                    )}
                </div>
            </div>

            {/* Quick access tiles - small so the whole dashboard fits on one screen */}
            <div>
                <h2 className="text-[11px] font-black text-slate-400 uppercase tracking-widest mb-3 px-1">{t('quickAccess')}</h2>
                <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-3">
                    {menuItems.map((item, index) => (
                        <button
                            key={index}
                            onClick={() => onNavigate && onNavigate(item.page)}
                            className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 flex flex-col items-start gap-3 text-left hover:shadow-md hover:-translate-y-0.5 transition-all active:scale-[0.98] group"
                        >
                            <div className={`p-2.5 rounded-xl ${item.bg} ${item.color} group-hover:scale-110 transition-transform`}>
                                {item.icon}
                            </div>
                            <div className="min-w-0 w-full">
                                <h3 className="text-sm font-black text-slate-800 leading-tight truncate">{item.title}</h3>
                                <p className="text-xs text-slate-400 font-medium truncate mt-0.5">{item.subtitle}</p>
                            </div>
                        </button>
                    ))}
                </div>
            </div>

            <div className="mt-2 mb-6 flex items-center justify-center gap-4 text-slate-300">
                <div className="h-px w-12 bg-slate-100"></div>
                <div className="text-[10px] font-black uppercase tracking-widest">{t('footer')}</div>
                <div className="h-px w-12 bg-slate-100"></div>
            </div>
        </div>
    );
};

interface PendingActionsModalProps {
    items: PendingActionItem[];
    onItemClick: (item: PendingActionItem) => void;
    onClose: () => void;
    t: (key: string, opts?: Record<string, unknown>) => string;
}

const PendingActionsModal = ({ items, onItemClick, onClose, t }: PendingActionsModalProps) => {
    const formatDate = (dateStr: string) => {
        const d = new Date(dateStr);
        if (isNaN(d.getTime())) return dateStr || '-';
        return d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });
    };

    return (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl w-full max-w-lg max-h-[85vh] flex flex-col animate-in fade-in zoom-in duration-200">
                <div className="flex justify-between items-center p-6 pb-4 border-b border-slate-100 shrink-0">
                    <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                        <AlertCircle size={20} className="text-amber-600" />
                        {t('pendingActions.title')}
                    </h3>
                    <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X size={20} /></button>
                </div>

                <div className="overflow-y-auto p-6 space-y-2 flex-1">
                    {items.length === 0 ? (
                        <p className="text-sm text-slate-400 italic">{t('pendingActions.empty')}</p>
                    ) : (
                        items.map(item => (
                            <button
                                key={item.id}
                                onClick={() => onItemClick(item)}
                                className="w-full flex items-center justify-between gap-3 p-3 rounded-2xl bg-slate-50 hover:bg-slate-100 transition-colors text-left"
                            >
                                <div className="min-w-0">
                                    <p className="font-bold text-slate-700 text-sm truncate">{item.title}</p>
                                    <p className="text-xs text-slate-400 truncate">{item.subtitle}</p>
                                </div>
                                <span className="text-[11px] font-semibold text-slate-400 whitespace-nowrap shrink-0">
                                    {formatDate(item.date)}
                                </span>
                            </button>
                        ))
                    )}
                </div>
            </div>
        </div>
    );
};

interface LearningStatsDetailModalProps {
    mode: 'hours' | 'cost';
    stats: LearningStats;
    onClose: () => void;
    t: (key: string) => string;
    // False for interns - hides the annual budget footer, since they don't have one.
    hasBudget: boolean;
}

const LearningStatsDetailModal = ({ mode, stats, onClose, t, hasBudget }: LearningStatsDetailModalProps) => {
    const isHours = mode === 'hours';

    const formatDate = (dateStr: string) => {
        const d = new Date(dateStr);
        if (isNaN(d.getTime())) return dateStr || '-';
        const pad = (n: number) => String(n).padStart(2, '0');
        return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
    };

    const formatValue = (item: LearningStatDetail) =>
        isHours ? `${item.hours} ${t('hours')}` : `Rp ${item.cost.toLocaleString('id-ID')}`;

    const sections = [
        {
            key: 'trainingExternal',
            label: t('detailModal.trainingExternalSection'),
            icon: <Briefcase size={16} />,
            items: stats.trainingExternalDetails,
            subtotal: isHours ? stats.jamTrainingExternal : stats.biayaTrainingExternal,
            emptyLabel: t('detailModal.noTrainingExternal')
        },
        {
            key: 'training',
            label: t('detailModal.trainingSection'),
            icon: <Users size={16} />,
            items: stats.trainingDetails,
            subtotal: isHours ? stats.jamTraining : stats.biayaTraining,
            emptyLabel: t('detailModal.noTraining')
        },
        ...(isHours ? [{
            key: 'online',
            label: t('detailModal.onlineSection'),
            icon: <Video size={16} />,
            items: stats.onlineDetails,
            subtotal: stats.jamOnline,
            emptyLabel: t('detailModal.noOnline')
        }] : []),
        {
            key: 'reading',
            label: t('detailModal.readingSection'),
            icon: <BookOpen size={16} />,
            items: stats.bookDetails,
            subtotal: isHours ? stats.jamBuku : stats.biayaBuku,
            emptyLabel: t('detailModal.noReading')
        }
    ];

    const grandTotal = isHours ? stats.totalJam : stats.totalBiaya;

    return (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl w-full max-w-lg max-h-[85vh] flex flex-col animate-in fade-in zoom-in duration-200">
                <div className="flex justify-between items-center p-6 pb-4 border-b border-slate-100 shrink-0">
                    <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                        {isHours ? <Clock size={20} className="text-blue-600" /> : <Wallet size={20} className="text-blue-600" />}
                        {isHours ? t('detailModal.hoursTitle') : t('detailModal.costTitle')}
                    </h3>
                    <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X size={20} /></button>
                </div>

                <div className="overflow-y-auto p-6 space-y-6 flex-1">
                    {sections.map(section => (
                        <div key={section.key}>
                            <div className="flex items-center gap-2 text-slate-500 mb-2">
                                {section.icon}
                                <span className="text-xs font-black uppercase tracking-widest">{section.label}</span>
                            </div>
                            {section.items.length === 0 ? (
                                <p className="text-sm text-slate-400 italic pl-1">{section.emptyLabel}</p>
                            ) : (
                                <div className="rounded-xl border border-slate-100 divide-y divide-slate-100 overflow-hidden">
                                    {section.items.map((item, idx) => (
                                        <div key={idx} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                                            <div className="min-w-0">
                                                <p className="font-semibold text-slate-700 truncate">{item.title}</p>
                                                <p className="text-[11px] text-slate-400">{formatDate(item.date)}</p>
                                            </div>
                                            <span className="font-bold text-slate-700 whitespace-nowrap">{formatValue(item)}</span>
                                        </div>
                                    ))}
                                </div>
                            )}
                            <div className="flex justify-between items-center px-1 mt-2 text-xs font-bold text-slate-500">
                                <span>{t('detailModal.subtotal')}</span>
                                <span>{isHours ? `${section.subtotal} ${t('hours')}` : `Rp ${section.subtotal.toLocaleString('id-ID')}`}</span>
                            </div>
                        </div>
                    ))}
                </div>

                {!isHours && hasBudget && (
                    <div className="px-6 py-4 border-t border-slate-100 bg-slate-50 space-y-2 shrink-0">
                        <div className="flex items-center justify-between text-xs font-bold text-slate-500">
                            <span>{t('detailModal.annualBudget')}</span>
                            <span>Rp {ANNUAL_LEARNING_BUDGET.toLocaleString('id-ID')}</span>
                        </div>
                        <div className="w-full h-2 bg-slate-200 rounded-full overflow-hidden">
                            <div
                                className={`h-full rounded-full ${grandTotal <= ANNUAL_LEARNING_BUDGET ? 'bg-emerald-500' : 'bg-rose-500'}`}
                                style={{ width: `${Math.min((grandTotal / ANNUAL_LEARNING_BUDGET) * 100, 100)}%` }}
                            />
                        </div>
                        <div className="flex items-center justify-between">
                            <span className={`text-xs font-bold ${grandTotal <= ANNUAL_LEARNING_BUDGET ? 'text-slate-500' : 'text-rose-600'}`}>
                                {grandTotal <= ANNUAL_LEARNING_BUDGET ? t('detailModal.remainingBudget') : t('detailModal.budgetExceeded')}
                            </span>
                            <span className={`text-sm font-black ${grandTotal <= ANNUAL_LEARNING_BUDGET ? 'text-emerald-600' : 'text-rose-600'}`}>
                                Rp {Math.abs(ANNUAL_LEARNING_BUDGET - grandTotal).toLocaleString('id-ID')}
                            </span>
                        </div>
                    </div>
                )}

                <div className="flex items-center justify-between px-6 py-4 border-t border-slate-100 bg-slate-50 rounded-b-2xl shrink-0">
                    <span className="text-sm font-black text-slate-700 uppercase tracking-wide">{t('detailModal.grandTotal')}</span>
                    <span className="text-lg font-black text-blue-600">
                        {isHours ? formatHoursMinutes(grandTotal, t) : `Rp ${grandTotal.toLocaleString('id-ID')}`}
                    </span>
                </div>
            </div>
        </div>
    );
};

export default DashboardHome;
