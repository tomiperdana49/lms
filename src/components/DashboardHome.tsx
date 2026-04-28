import { BookOpen, Users, Briefcase, Calendar as CalendarIcon, Video, GraduationCap, Award, Star } from 'lucide-react';
import type { Page, Role } from '../types';
import LMSCalendar from './LMSCalendar';

interface DashboardHomeProps {
    onNavigate?: (page: Page) => void;
    userRole?: Role;
    userEmail?: string;
    userName?: string;
}

import NotificationPanel from './NotificationPanel';

const DashboardHome = ({ onNavigate, userRole, userEmail, userName }: DashboardHomeProps) => {
    const baseMenuItems = [
        {
            title: 'Reading Log',
            subtitle: 'Book reading logs',
            icon: <BookOpen size={24} />,
            page: 'reading-log' as Page,
            color: 'text-orange-600',
            bg: 'bg-orange-50'
        },
        {
            title: 'Online Courses',
            subtitle: 'Modules & Quizzes',
            icon: <Video size={24} />,
            page: 'courses' as Page,
            color: 'text-blue-600',
            bg: 'bg-blue-50'
        },
        {
            title: 'Internal Training',
            subtitle: 'Internal sessions',
            icon: <Users size={24} />,
            page: 'internal' as Page,
            color: 'text-purple-600',
            bg: 'bg-purple-50'
        },
        {
            title: 'External Training',
            subtitle: 'External workshops',
            icon: <Briefcase size={24} />,
            page: 'external' as Page,
            color: 'text-teal-600',
            bg: 'bg-teal-50'
        },
        {
            title: 'Incentives',
            subtitle: 'Claim rewards',
            icon: <Award size={24} />,
            page: 'incentives' as Page,
            color: 'text-amber-500',
            bg: 'bg-amber-50'
        },
        {
            title: 'Training Calendar',
            subtitle: 'Learning schedule',
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
        if (hour < 11) return 'Good Morning';
        if (hour < 15) return 'Good Afternoon';
        if (hour < 18) return 'Good Evening';
        return 'Good Night';
    };

    return (
        <div className="max-w-[1600px] mx-auto pt-6 px-6 h-[calc(100vh-100px)] flex flex-col gap-6">
            {/* Header / Hero Section */}
            <div className="bg-gradient-to-br from-indigo-600 via-blue-600 to-blue-700 rounded-3xl p-8 text-white shadow-2xl relative overflow-hidden shrink-0">
                <div className="absolute top-0 right-0 p-12 opacity-10 rotate-12">
                    <GraduationCap size={200} />
                </div>
                
                <div className="relative z-10 flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
                    <div className="space-y-1">
                        <div className="inline-flex items-center gap-2 bg-white/10 backdrop-blur-md px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest border border-white/10 mb-2">
                            <Star size={12} className="text-yellow-400 fill-yellow-400" /> Dashboard Overview
                        </div>
                        <h1 className="text-3xl md:text-4xl font-black tracking-tight leading-tight">
                            {getGreeting()}, <span className="text-blue-200">{userName || 'User'}</span>!
                        </h1>
                        <p className="text-blue-100/80 font-medium max-w-md">
                            Ready to level up your skills today? You have several activities waiting to be completed.
                        </p>
                    </div>

                    {/* Quick Stats Bar */}
                    <div className="flex gap-4 w-full md:w-auto">
                        <div className="bg-white/10 backdrop-blur-xl rounded-2xl p-4 border border-white/10 flex-1 md:flex-none md:min-w-[140px] group hover:bg-white/15 transition-all text-center">
                            <div className="text-[10px] font-bold text-blue-200 uppercase tracking-widest mb-1 opacity-70">Learning Pulse</div>
                            <div className="text-2xl font-black tracking-tighter">Active</div>
                            <div className="text-[9px] font-medium text-blue-200 mt-1">Account Status</div>
                        </div>
                        <div className="bg-white/10 backdrop-blur-xl rounded-2xl p-4 border border-white/10 flex-1 md:flex-none md:min-w-[140px] group hover:bg-white/15 transition-all text-center">
                            <div className="text-[10px] font-bold text-blue-200 uppercase tracking-widest mb-1 opacity-70">Year {new Date().getFullYear()}</div>
                            <div className="text-2xl font-black tracking-tighter">Premium</div>
                            <div className="text-[9px] font-medium text-blue-200 mt-1">Membership</div>
                        </div>
                    </div>
                </div>
            </div>

            {/* 3-Column Layout */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 flex-1 overflow-hidden min-h-0">

                {/* --- Left Column: Compact Calendar (3 cols) --- */}
                <div className="hidden lg:block lg:col-span-3 h-full overflow-hidden bg-white rounded-3xl border border-slate-100 shadow-sm">
                    <LMSCalendar compact={true} userEmail={userEmail} userRole={userRole} />
                </div>

                {/* --- Center Column: Features Menu (6 cols) --- */}
                <div className="lg:col-span-6 h-full overflow-y-auto custom-scrollbar px-1">
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
                        <div className="text-[10px] font-black uppercase tracking-widest">© 2026 PT Media Antar Nusa</div>
                        <div className="h-px w-12 bg-slate-100"></div>
                    </div>
                </div>

                {/* --- Right Column: Notifications (3 cols) --- */}
                <div className="lg:col-span-3 h-full overflow-hidden bg-white rounded-3xl border border-slate-100 shadow-sm">
                    <NotificationPanel userEmail={userEmail} userName={userName} userRole={userRole} />
                </div>

            </div>
        </div>
    );
};

export default DashboardHome;
