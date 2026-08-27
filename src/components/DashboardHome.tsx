import { useState, useEffect } from 'react';
import { BookOpen, Users, Calendar as CalendarIcon, Video, GraduationCap, Star, Briefcase, Award, X, Clock, Wallet } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { Page, Role } from '../types';
import LMSCalendar from './LMSCalendar';
import { API_BASE_URL } from '../config';

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
    onNavigate?: (page: Page) => void;
    userRole?: Role;
    userEmail?: string;
    userName?: string;
    config?: { moduleInternal: boolean; moduleExternal: boolean; moduleIncentive: boolean };
}

const DashboardHome = ({ onNavigate, userRole, userEmail, userName, config }: DashboardHomeProps) => {
    const { t } = useTranslation('dashboardHome');
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
            icon: <BookOpen size={24} />,
            page: 'reading-log' as Page,
            color: 'text-orange-600',
            bg: 'bg-orange-50'
        },
        {
            title: t('menu.onlineCoursesTitle'),
            subtitle: t('menu.onlineCoursesSubtitle'),
            icon: <Video size={24} />,
            page: 'courses' as Page,
            color: 'text-blue-600',
            bg: 'bg-blue-50'
        },
        ...(config?.moduleInternal ? [{
            title: t('menu.internalTrainingTitle'),
            subtitle: t('menu.internalTrainingSubtitle'),
            icon: <Users size={24} />,
            page: 'internal' as Page,
            color: 'text-purple-600',
            bg: 'bg-purple-50'
        }] : []),
        ...(config?.moduleExternal ? [{
            title: t('menu.externalTrainingTitle'),
            subtitle: t('menu.externalTrainingSubtitle'),
            icon: <Briefcase size={24} />,
            page: 'external' as Page,
            color: 'text-teal-600',
            bg: 'bg-teal-50'
        }] : []),
        ...(config?.moduleIncentive ? [{
            title: t('menu.incentivesTitle'),
            subtitle: t('menu.incentivesSubtitle'),
            icon: <Award size={24} />,
            page: 'incentives' as Page,
            color: 'text-amber-500',
            bg: 'bg-amber-50'
        }] : []),
        {
            title: t('menu.calendarTitle'),
            subtitle: t('menu.calendarSubtitle'),
            icon: <CalendarIcon size={24} />,
            page: 'calendar' as Page,
            color: 'text-red-500',
            bg: 'bg-red-50',
            fullWidth: true
        }
    ];

    const menuItems = [...baseMenuItems];

    const getGreeting = () => {
        const hour = new Date().getHours();
        if (hour < 11) return t('goodMorning');
        if (hour < 15) return t('goodAfternoon');
        if (hour < 18) return t('goodEvening');
        return t('goodNight');
    };

    return (
        <div className="max-w-[1600px] mx-auto pt-4 md:pt-6 px-4 md:px-6 min-h-screen lg:h-[calc(100vh-100px)] flex flex-col gap-6">
            {/* Header / Hero Section */}
            <div className="bg-gradient-to-br from-blue-700 via-indigo-700 to-purple-800 rounded-3xl p-6 sm:p-8 text-white shadow-2xl relative overflow-hidden shrink-0 group">
                <div className="absolute top-0 right-0 p-12 opacity-10 rotate-12">
                    <GraduationCap size={200} />
                </div>
                <div className="absolute -right-10 -top-10 w-40 h-40 bg-white/10 rounded-full blur-3xl group-hover:bg-white/20 transition-all duration-700"></div>
                <div className="absolute -left-10 -bottom-10 w-60 h-60 bg-blue-400/10 rounded-full blur-3xl"></div>

                <div className="relative z-10 flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
                    <div className="space-y-1">
                        <div className="inline-flex items-center gap-2 bg-white/10 backdrop-blur-md px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest border border-white/10 mb-2">
                            <Star size={12} className="text-yellow-400 fill-yellow-400" /> {t('dashboardOverview')}
                        </div>
                        <h1 className="text-3xl md:text-4xl font-black tracking-tight leading-tight">
                            {getGreeting()}, <span className="text-blue-200">{userName || t('defaultUser')}</span>!
                        </h1>
                        <p className="text-blue-100/80 font-medium max-w-md text-sm sm:text-base">
                            {t('heroSubtitle')}
                        </p>
                    </div>

                    {/* Quick Stats Bar */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 w-full md:w-auto md:mr-12 lg:mr-24 md:min-w-[320px]">
                        <button
                            type="button"
                            onClick={() => setDetailModal('hours')}
                            className="bg-white/10 backdrop-blur-md rounded-2xl p-4 border border-white/10 hover:bg-white/15 transition-all text-left cursor-pointer flex flex-col"
                        >
                            <div className="flex items-start gap-3 mb-3">
                                <div className="p-2 bg-blue-500 rounded-lg shadow-lg shadow-blue-500/20 shrink-0">
                                    <Clock size={18} />
                                </div>
                                <span className="text-[11px] font-bold text-blue-100 uppercase tracking-wide leading-tight min-w-0 break-words">{t('learningHours')}</span>
                            </div>
                            <div className="flex items-baseline gap-1 mt-auto">
                                <span className="text-xl sm:text-2xl font-black tracking-tighter">{learningStats.totalJam}</span>
                                <span className="text-sm font-bold opacity-60">{t('hours')}</span>
                            </div>
                        </button>
                        <button
                            type="button"
                            onClick={() => setDetailModal('cost')}
                            className="bg-white/10 backdrop-blur-md rounded-2xl p-4 border border-white/10 hover:bg-white/15 transition-all text-left cursor-pointer flex flex-col"
                        >
                            <div className="flex items-start gap-3 mb-3">
                                <div className="p-2 bg-emerald-500 rounded-lg shadow-lg shadow-emerald-500/20 shrink-0">
                                    <Wallet size={18} />
                                </div>
                                <span className="text-[11px] font-bold text-blue-100 uppercase tracking-wide leading-tight min-w-0 break-words">{t('learningCost')}</span>
                            </div>
                            <span className="text-lg sm:text-xl font-black tracking-tighter text-emerald-300 mt-auto whitespace-nowrap" title={`Rp ${learningStats.totalBiaya.toLocaleString('id-ID')}`}>
                                Rp {learningStats.totalBiaya.toLocaleString('id-ID')}
                            </span>
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
                />
            )}

            {/* 3-Column Layout */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 flex-1 lg:overflow-hidden min-h-0">

                {/* --- Left Column: Compact Calendar (3 cols) --- */}
                <div className="hidden lg:block lg:col-span-3 h-full overflow-hidden bg-white rounded-3xl border border-slate-100 shadow-sm">
                    <LMSCalendar compact={true} userEmail={userEmail} userRole={userRole} />
                </div>

                {/* --- Center Column: Features Menu (9 cols) --- */}
                <div className="lg:col-span-9 h-full overflow-y-auto custom-scrollbar px-1">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                        {menuItems.map((item, index) => (
                            <div
                                key={index}
                                onClick={() => onNavigate && onNavigate(item.page)}
                                className={`
                                    ${item.fullWidth ? 'md:col-span-2' : ''}
                                    bg-white p-8 rounded-[2.5rem] shadow-[0_8px_30px_rgb(0,0,0,0.04)] hover:shadow-[0_20px_50px_rgb(0,0,0,0.08)] transition-all duration-500 cursor-pointer border border-slate-100/50 group
                                    flex flex-col items-center text-center justify-center gap-5 py-12
                                    relative overflow-hidden active:scale-[0.98]
                                `}
                            >
                                {/* Decorative Gradient Blobs */}
                                <div className={`absolute -right-4 -top-4 w-24 h-24 rounded-full opacity-0 group-hover:opacity-10 transition-opacity duration-700 blur-2xl ${item.bg}`}></div>
                                
                                <div className={`absolute top-4 right-4 p-3 opacity-5 group-hover:opacity-10 group-hover:scale-150 transition-all duration-1000 rotate-12`}>
                                    <div className={`${item.color} scale-[3]`}>{item.icon}</div>
                                </div>

                                <div className={`relative p-6 rounded-3xl ${item.bg} ${item.color} group-hover:scale-110 group-hover:rotate-6 transition-all duration-500 shadow-sm ring-8 ring-slate-50/50`}>
                                    {item.icon}
                                </div>
                                <div className="relative z-10 space-y-1">
                                    <h3 className="text-2xl font-black text-slate-800 tracking-tight">{item.title}</h3>
                                    <p className="text-sm text-slate-400 font-bold uppercase tracking-wider opacity-60">{item.subtitle}</p>
                                </div>

                                {/* Hover Button / Indicator */}
                                <div className="mt-2 w-10 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                                    <div className={`h-full w-0 group-hover:w-full transition-all duration-500 rounded-full ${item.bg.replace('bg-', 'bg-').replace('-50', '-500')}`}></div>
                                </div>
                            </div>
                        ))}
                    </div>

                    {/* Mobile Footer */}
                    <div className="lg:hidden mt-8 space-y-6">
                        <LMSCalendar userEmail={userEmail} />
                    </div>

                    <div className="mt-12 mb-8 flex items-center justify-center gap-4 text-slate-300">
                        <div className="h-px w-12 bg-slate-100"></div>
                        <div className="text-[10px] font-black uppercase tracking-widest">{t('footer')}</div>
                        <div className="h-px w-12 bg-slate-100"></div>
                    </div>
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
}

const LearningStatsDetailModal = ({ mode, stats, onClose, t }: LearningStatsDetailModalProps) => {
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
