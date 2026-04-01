import { BookOpen, Users, Briefcase, Calendar as CalendarIcon, Video, GraduationCap, Shield, Award } from 'lucide-react';
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
            title: 'Baca Buku',
            subtitle: 'Log baca buku',
            icon: <BookOpen size={24} />,
            page: 'reading-log' as Page,
            color: 'text-orange-600',
            bg: 'bg-orange-50'
        },
        {
            title: 'Modul Online',
            subtitle: 'Modul & Quiz',
            icon: <Video size={24} />,
            page: 'courses' as Page,
            color: 'text-blue-600',
            bg: 'bg-blue-50'
        },
        {
            title: 'Internal',
            subtitle: 'Training internal',
            icon: <Users size={24} />,
            page: 'internal' as Page,
            color: 'text-purple-600',
            bg: 'bg-purple-50'
        },
        {
            title: 'Eksternal',
            subtitle: 'Training eksternal',
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
            title: 'Calendar Training',
            subtitle: 'Jadwal learning',
            icon: <CalendarIcon size={24} />,
            page: 'calendar' as Page,
            color: 'text-red-500',
            bg: 'bg-red-50',
            fullWidth: true
        }
    ];

    const adminItems = [];
    if (userRole === 'HR' || userRole === 'HR_ADMIN') {
        adminItems.push({
            title: 'Admin Panel',
            subtitle: 'Centralized Management',
            icon: <Shield size={24} />,
            page: 'admin-dashboard' as Page,
            color: 'text-indigo-600',
            bg: 'bg-indigo-50',
            fullWidth: true
        });
    }

    const menuItems = [...baseMenuItems, ...adminItems];

    return (
        <div className="max-w-[1600px] mx-auto pt-4 px-4 h-[calc(100vh-100px)] flex flex-col">
            {/* Header Bar */}
            <div className="bg-blue-600 text-white rounded-2xl p-4 flex items-center justify-between shadow-lg mb-6 shrink-0">
                <div className="flex items-center gap-3">
                    <div className="bg-white/20 p-2 rounded-xl backdrop-blur-sm">
                        <GraduationCap size={28} />
                    </div>
                    <div>
                        <h1 className="text-xl font-bold tracking-wide">Learning Management System</h1>
                        <p className="text-blue-100 text-xs font-medium">PT Media Antar Nusa</p>
                    </div>
                </div>
                <div className="hidden md:flex gap-4">
                    {/* Add profile or quick stats here later */}
                </div>
            </div>

            {/* 3-Column Layout */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 flex-1 overflow-hidden min-h-0">

                {/* --- Left Column: Compact Calendar (3 cols) --- */}
                <div className="hidden lg:block lg:col-span-3 h-full overflow-hidden">
                    <LMSCalendar compact={true} userEmail={userEmail} userRole={userRole} />
                </div>

                {/* --- Center Column: Features Menu (6 cols) --- */}
                <div className="lg:col-span-6 h-full overflow-y-auto custom-scrollbar">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {menuItems.map((item, index) => (
                            <div
                                key={index}
                                onClick={() => onNavigate && onNavigate(item.page)}
                                className={`
                                    ${item.fullWidth ? 'md:col-span-2' : ''}
                                    bg-white p-6 rounded-3xl shadow-sm hover:shadow-lg transition-all cursor-pointer border border-slate-100 group
                                    flex flex-col items-center text-center justify-center gap-4 py-10
                                    relative overflow-hidden
                                `}
                            >
                                <div className={`absolute top-0 right-0 p-3 opacity-10 group-hover:scale-150 transition-transform duration-700`}>
                                    {/* Background Icon Decoration */}
                                    <div className={`${item.color} scale-[2.5]`}>{item.icon}</div>
                                </div>

                                <div className={`relative p-5 rounded-2xl ${item.bg} ${item.color} group-hover:scale-110 group-hover:rotate-3 transition-all duration-300 shadow-sm ring-4 ring-white`}>
                                    {item.icon}
                                </div>
                                <div className="relative z-10">
                                    <h3 className="text-xl font-bold text-slate-800 mb-1">{item.title}</h3>
                                    <p className="text-sm text-slate-400 font-medium">{item.subtitle}</p>
                                </div>
                            </div>
                        ))}
                    </div>

                    {/* Add Calendar for Mobile/Tablet here if hidden on large screens */}
                    <div className="lg:hidden mt-6">
                        <LMSCalendar userEmail={userEmail} />
                    </div>

                    <div className="mt-8 text-center text-slate-300 text-xs pb-4">
                        © 2026 PT Media Antar Nusa
                    </div>
                </div>

                {/* --- Right Column: Notifications (3 cols) --- */}
                <div className="lg:col-span-3 h-full overflow-hidden">
                    <NotificationPanel userEmail={userEmail} userName={userName} userRole={userRole} />
                </div>

            </div>
        </div>
    );
};

export default DashboardHome;
