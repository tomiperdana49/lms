import { useState, useEffect, useRef, type ReactNode } from 'react';
import {
    LayoutDashboard,
    Library,
    BookOpen,
    Users,
    Calendar,
    Menu,
    X,
    Bell,
    LogOut,
    Award,
    Shield,
    ChevronDown,
    ChevronUp,
    TrendingUp,
    GraduationCap,
    MessageSquarePlus,
    CheckCircle,
    AlertCircle,
    FileText,
    Globe,
    UsersRound,
    HelpCircle,
    Target
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { Page, Role, User } from '../types';
import FeedbackModal from './FeedbackModal';
import LanguageSwitcher from './LanguageSwitcher';
import { API_BASE_URL } from '../config';

interface DashboardLayoutProps {
    children: ReactNode;
    activePage: Page;
    onNavigate: (page: Page, view?: string) => void;
    userRole: Role;
    user: User;
    onRoleChange: (role: Role) => void; 
    onLogout: () => void;
    adminView?: string;
    config?: { moduleInternal: boolean; moduleExternal: boolean; moduleIncentive: boolean; moduleIDP: boolean };
}

const DashboardLayout = ({ children, activePage, onNavigate, userRole, user, onLogout, adminView, config }: DashboardLayoutProps) => {
    const { t, i18n } = useTranslation('dashboardLayout');
    const [isSidebarOpen, setIsSidebarOpen] = useState(false);
    const [isFeedbackOpen, setIsFeedbackOpen] = useState(false);
    const [isTrainingOpen, setIsTrainingOpen] = useState(() => {
        return activePage === 'internal' || activePage === 'external' || activePage === 'external-approval';
    });
    const trainingRef = useRef<HTMLDivElement>(null);
    useEffect(() => {
        if (isTrainingOpen) trainingRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, [isTrainingOpen]);
    const [isAdminOpen, setIsAdminOpen] = useState(() => {
        const saved = localStorage.getItem('lms_admin_sidebar_open');
        if (saved !== null) return saved === 'true';
        return activePage === 'admin-dashboard';
    });

    // Sync admin sidebar state to localStorage
    useEffect(() => {
        localStorage.setItem('lms_admin_sidebar_open', String(isAdminOpen));
    }, [isAdminOpen]);

    // Force open if navigated from outside
    useEffect(() => {
        if (activePage === 'admin-dashboard') {
            setIsAdminOpen(true);
        }
    }, [activePage]);

    // --- Header Notifications State & Logic ---
    const [isNotificationsOpen, setIsNotificationsOpen] = useState(false);
    const [notifications, setNotifications] = useState<any[]>([]);

    useEffect(() => {
        const fetchNotifications = async () => {
            if (!user?.email || !user?.name) return;

            try {
                const [meetingsRes, trainingRes, logsRes] = await Promise.all([
                    fetch(`${API_BASE_URL}/api/meetings`),
                    fetch(`${API_BASE_URL}/api/training`),
                    fetch(`${API_BASE_URL}/api/logs`)
                ]);

                if (!meetingsRes.ok || !trainingRes.ok || !logsRes.ok) return;

                const meetings = await meetingsRes.json();
                const training = await trainingRes.json();
                const logs = await logsRes.json();

                // Get already read notification IDs from LocalStorage
                let readIds: number[] = [];
                try {
                    const saved = localStorage.getItem(`lms_read_notifs_${user.email}`);
                    if (saved) readIds = JSON.parse(saved);
                } catch (e) { console.error(e); }

                const dateLocale = i18n.language?.startsWith('id') ? 'id-ID' : 'en-US';

                // 1. Meetings
                const meetingNotifs = meetings
                    .filter((m: any) => m.guests?.emails?.includes(user.email))
                    .map((m: any) => {
                        const notifId = m.id;
                        return {
                            id: notifId,
                            title: t('notifications.upcomingMeeting'),
                            message: t('notifications.meetingMessage', { title: m.title, time: m.time, type: m.type }),
                            time: new Date(m.date).toLocaleDateString(dateLocale, { month: 'short', day: 'numeric' }),
                            type: 'INFO',
                            isRead: readIds.includes(notifId)
                        };
                    });

                // 2. Training Requests
                const trainingNotifs = training
                    .filter((tr: any) => tr.userName === user.name || (user.employee_id && tr.employee_id === user.employee_id))
                    .map((tr: any) => {
                        const notifId = tr.id + 50000;
                        return {
                            id: notifId,
                            title: t('notifications.trainingStatus', { status: tr.status?.replace('_', ' ') }),
                            message: t('notifications.trainingMessage', { title: tr.title, status: tr.status?.toLowerCase().replace('_', ' ') }),
                            time: new Date(tr.submittedAt || Date.now()).toLocaleDateString(dateLocale, { month: 'short', day: 'numeric' }),
                            type: tr.status === 'APPROVED' ? 'SUCCESS' : tr.status === 'REJECTED' ? 'WARNING' : 'INFO',
                            isRead: readIds.includes(notifId)
                        };
                    });

                // 3. Reading Logs
                const readingNotifs = logs
                    .filter((l: any) => {
                        const isOwnLog = (l.userName && l.userName.trim().toLowerCase() === user.name.trim().toLowerCase()) ||
                                         (user.employee_id && l.employee_id === user.employee_id);
                        const hasUpdate = ['Approved', 'Rejected', 'Cancelled'].includes(l.hrApprovalStatus) || l.status === 'Cancelled';
                        return isOwnLog && hasUpdate;
                    })
                    .map((l: any) => {
                        const notifId = l.id + 100000;
                        let statusLabel = t('notifications.statusUpdated');
                        let type = 'INFO';

                        if (l.hrApprovalStatus === 'Approved') {
                            statusLabel = t('notifications.statusApproved');
                            type = 'SUCCESS';
                        } else if (l.hrApprovalStatus === 'Rejected') {
                            statusLabel = l.rejectionReason
                                ? t('notifications.statusRejectedWithReason', { reason: l.rejectionReason })
                                : t('notifications.statusRejected');
                            type = 'WARNING';
                        } else if (l.hrApprovalStatus === 'Cancelled' || l.status === 'Cancelled') {
                            statusLabel = l.rejectionReason
                                ? t('notifications.statusCancelledWithReason', { reason: l.rejectionReason })
                                : t('notifications.statusCancelled');
                            type = 'WARNING';
                        }

                        return {
                            id: notifId,
                            title: t('notifications.readingStatusTitle', { status: l.hrApprovalStatus || l.status }),
                            message: t('notifications.readingMessage', { title: l.title, statusLabel }),
                            time: new Date(l.approvedAt || l.finishDate || l.date || Date.now()).toLocaleDateString(dateLocale, { month: 'short', day: 'numeric' }),
                            type,
                            isRead: readIds.includes(notifId)
                        };
                    });

                // Combine and Sort by latest (higher id means more recent)
                const all = [...meetingNotifs, ...trainingNotifs, ...readingNotifs].sort((a, b) => b.id - a.id);
                setNotifications(all);
            } catch (error) {
                console.error("Failed to fetch header notifications", error);
            }
        };

        fetchNotifications();
        
        // Refresh notifications every 60 seconds
        const interval = setInterval(fetchNotifications, 60000);
        return () => clearInterval(interval);
    }, [user, userRole]);

    useEffect(() => {
        if (!isNotificationsOpen) return;
        const handleOutsideClick = (e: MouseEvent) => {
            const target = e.target as HTMLElement;
            if (!target.closest('.notification-btn-container')) {
                setIsNotificationsOpen(false);
            }
        };
        document.addEventListener('click', handleOutsideClick);
        return () => document.removeEventListener('click', handleOutsideClick);
    }, [isNotificationsOpen]);

    const handleNotificationClick = (id: number) => {
        setNotifications(prev => prev.map(n => n.id === id ? { ...n, isRead: true } : n));
        try {
            const saved = localStorage.getItem(`lms_read_notifs_${user?.email || 'guest'}`);
            const readList = saved ? JSON.parse(saved) : [];
            if (!readList.includes(id)) {
                readList.push(id);
                localStorage.setItem(`lms_read_notifs_${user?.email || 'guest'}`, JSON.stringify(readList));
            }
        } catch (e) {
            console.error(e);
        }
    };

    const getNotificationIcon = (type: 'INFO' | 'SUCCESS' | 'WARNING') => {
        switch (type) {
            case 'SUCCESS':
                return <CheckCircle size={14} className="text-emerald-600" />;
            case 'WARNING':
                return <AlertCircle size={14} className="text-amber-600" />;
            default:
                return <Bell size={14} className="text-blue-600" />;
        }
    };
    
    const toggleSidebar = () => setIsSidebarOpen(!isSidebarOpen);
    
    // List sub-menu admin agar sama dengan gambar
    const adminSubItems = [
        { icon: LayoutDashboard, label: t('admin.overview'), id: 'admin-dashboard', view: 'overview' },
        { icon: Calendar, label: t('admin.calendar'), id: 'admin-dashboard', view: 'calendar' },
        { header: t('admin.managementHeader') },
        { icon: Users, label: t('admin.userManagement'), id: 'admin-dashboard', view: 'users' },
        { icon: BookOpen, label: t('admin.onlineModulesManagement'), id: 'admin-dashboard', view: 'courses' },
        ...((config?.moduleInternal || config?.moduleExternal) ? [{ header: t('admin.trainingHeader') }] : []),
        ...(config?.moduleInternal ? [{ icon: Users, label: t('admin.internal'), id: 'admin-dashboard', view: 'meetings' }] : []),
        ...(config?.moduleExternal ? [{ icon: FileText, label: t('admin.external'), id: 'admin-dashboard', view: 'training' }] : []),
        { header: t('admin.reportHeader') },
        { icon: Library, label: t('admin.readingLog'), id: 'admin-dashboard', view: 'logs' },
        { icon: Award, label: t('admin.quizReport'), id: 'admin-dashboard', view: 'quiz-reports' },
        { icon: TrendingUp, label: t('admin.hrReport'), id: 'admin-dashboard', view: 'reports' },
        { icon: UsersRound, label: t('admin.employeeLearningReport'), id: 'admin-dashboard', view: 'employee-learning-report' },
        ...(config?.moduleIDP ? [{ icon: Target, label: t('admin.idp'), id: 'admin-dashboard', view: 'idp' }] : []),
    ];

    const menuItems = [
        { icon: LayoutDashboard, label: t('menu.dashboard'), id: 'dashboard' },
        { icon: Library, label: t('menu.readingLog'), id: 'reading-log' },
        { icon: BookOpen, label: t('menu.onlineModules'), id: 'courses' },
        { icon: Calendar, label: t('menu.calendar'), id: 'calendar' },
        { icon: TrendingUp, label: t('menu.learningReport'), id: 'learning-report' },
        ...(config?.moduleIDP ? [{ icon: Target, label: t('menu.idp'), id: 'idp' }] : []),
        ...(config?.moduleIncentive ? [{ icon: Award, label: t('menu.incentives'), id: 'incentives' }] : []),
    ];

    const trainingSubItems = [
        ...(config?.moduleInternal ? [{ icon: Users, label: t('menu.internal'), id: 'internal' }] : []),
        ...(config?.moduleExternal ? [{ icon: Globe, label: t('menu.external'), id: 'external' }] : []),
    ];

    const getInitials = (name: string) => {
        return name
            .split(' ')
            .map(n => (n && n[0]) || '')
            .join('')
            .toUpperCase()
            .substring(0, 2);
    };


    return (
        <div className="min-h-screen bg-gray-50 flex font-sans text-slate-800">
            {/* Mobile Sidebar Overlay */}
            {isSidebarOpen && (
                <div
                    className="fixed inset-0 bg-black/50 z-40 lg:hidden"
                    onClick={() => setIsSidebarOpen(false)}
                />
            )}

            {/* Sidebar */}
            <aside
                className={`
          fixed inset-y-0 left-0 z-50 lg:sticky lg:top-0 lg:h-screen
          w-64 bg-slate-900 text-white transition-transform duration-300 ease-in-out
          ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
        `}
            >
                <style dangerouslySetInnerHTML={{ __html: `
                    aside nav::-webkit-scrollbar { width: 4px; }
                    aside nav::-webkit-scrollbar-track { background: transparent; }
                    aside nav::-webkit-scrollbar-thumb { background: #334155; border-radius: 10px; }
                    aside nav::-webkit-scrollbar-thumb:hover { background: #475569; }
                `}} />
                <div className="h-full flex flex-col">
                    <div className="p-6 border-b border-slate-700 flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <img src="/favicon.svg" alt="Logo" className="w-10 h-10 rounded-xl shadow-md" />
                            <h1 className="text-xl font-bold tracking-wider">LMS NUSA</h1>
                        </div>
                        <button onClick={toggleSidebar} className="lg:hidden text-slate-400 hover:text-white">
                            <X size={24} />
                        </button>
                    </div>

                    {/* Menu */}
                    <nav className="flex-1 p-4 space-y-2 overflow-y-auto">
                        {menuItems.map((item) => (
                            <button
                                key={item.label}
                                onClick={() => {
                                    onNavigate(item.id as Page);
                                    setIsSidebarOpen(false);
                                }}
                                className={`
                                    w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-colors text-left
                                    ${activePage === item.id
                                        ? 'bg-blue-600 text-white shadow-lg shadow-blue-900/20'
                                        : 'text-slate-400 hover:bg-slate-800 hover:text-white'
                                    }
                                `}
                            >
                                <item.icon size={20} />
                                <span className="font-medium">{item.label}</span>
                            </button>
                        ))}

                        {/* Training Dropdown */}
                        {(config?.moduleInternal || config?.moduleExternal) && (
                            <div className="pt-1" ref={trainingRef}>
                                <button
                                    onClick={() => setIsTrainingOpen(!isTrainingOpen)}
                                    className={`
                                        w-full flex items-center justify-between px-4 py-3 rounded-xl transition-colors text-left
                                        ${activePage === 'internal' || activePage === 'external' || activePage === 'external-approval' || isTrainingOpen
                                            ? 'bg-slate-800 text-white'
                                            : 'text-slate-400 hover:bg-slate-800 hover:text-white'
                                        }
                                    `}
                                >
                                    <div className="flex items-center gap-3">
                                        <GraduationCap size={20} />
                                        <span className="font-medium">{t('menu.training')}</span>
                                    </div>
                                    {isTrainingOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                                </button>
                                
                                {isTrainingOpen && (
                                    <div className="mt-1 ml-4 space-y-1">
                                        {trainingSubItems.map((sub, idx) => (
                                            <button
                                                key={idx}
                                                onClick={() => {
                                                    onNavigate(sub.id as Page);
                                                    setIsSidebarOpen(false);
                                                }}
                                                className={`w-full flex items-center gap-3 px-6 py-2.5 text-sm rounded-xl transition-all
                                                    ${activePage === sub.id 
                                                        ? 'text-white font-bold bg-blue-600 shadow-md translate-x-1' 
                                                        : 'text-slate-400 hover:text-white hover:bg-slate-800'}
                                                `}
                                            >
                                                <sub.icon size={16} className={activePage === sub.id ? 'opacity-100' : 'opacity-60'} />
                                                <span>{sub.label}</span>
                                            </button>
                                        ))}
                                    </div>
                                )}
                            </div>
                        )}

                        {/* Admin Panel Expandable */}
                        {(userRole === 'HR' || userRole === 'HR_ADMIN') && (
                            <div className="pt-2">
                                <button
                                    onClick={() => setIsAdminOpen(!isAdminOpen)}
                                    className={`
                                        w-full flex items-center justify-between px-4 py-3 rounded-xl transition-colors text-left
                                        ${activePage === 'admin-dashboard' || isAdminOpen
                                            ? 'bg-slate-800 text-white'
                                            : 'text-slate-400 hover:bg-slate-800 hover:text-white'
                                        }
                                    `}
                                >
                                    <div className="flex items-center gap-3">
                                        <Shield size={20} />
                                        <span className="font-medium">{t('menu.adminPanel')}</span>
                                    </div>
                                    {isAdminOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                                </button>

                                {/* SUB-MENU (Accordion) */}
                                {isAdminOpen && (
                                    <div className="mt-2 ml-4 space-y-1 border-l border-slate-700">
                                        {adminSubItems.map((sub, idx) => (
                                            sub.header ? (
                                                <p key={idx} className="px-6 text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2 mt-6">{sub.header}</p>
                                            ) : (
                                                <button
                                                    key={idx}
                                                    onClick={() => {
                                                        onNavigate(sub.id as Page, sub.view);
                                                        setIsSidebarOpen(false);
                                                    }}
                                                    className={`w-full flex items-center gap-3 px-6 py-2 text-sm transition-colors text-left
                                                        ${activePage === 'admin-dashboard' && sub.view === adminView ? 'text-white font-semibold' : 'text-slate-400 hover:text-white'}
                                                    `}
                                                >
                                                    {sub.icon && <sub.icon size={16} className="opacity-70" />}
                                                    <span>{sub.label}</span>
                                                </button>
                                            )
                                        ))}
                                    </div>
                                )}
                            </div>
                        )}
                    </nav>

                    {/* Help & Feedback Buttons */}
                    <div className="px-4 pt-4 border-t border-slate-800/60 space-y-1">
                        <button
                            type="button"
                            onClick={() => {
                                onNavigate('help');
                                setIsSidebarOpen(false);
                            }}
                            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all text-left cursor-pointer
                                ${activePage === 'help'
                                    ? 'bg-blue-600 text-white shadow-lg shadow-blue-900/20'
                                    : 'text-slate-400 hover:bg-slate-800 hover:text-white'
                                }
                            `}
                        >
                            <HelpCircle size={20} />
                            <span className="font-medium">{t('menu.help')}</span>
                        </button>
                        <button
                            type="button"
                            onClick={() => setIsFeedbackOpen(true)}
                            className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-emerald-400 hover:bg-slate-800 hover:text-emerald-300 transition-all text-left cursor-pointer"
                        >
                            <MessageSquarePlus size={20} />
                            <span className="font-medium">{t('menu.feedback')}</span>
                        </button>
                    </div>

                    {/* Logout Button (Sidebar Bottom) */}
                    <div className="p-4">
                        <button
                            onClick={onLogout}
                            className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-red-400 hover:bg-slate-800 hover:text-red-300 transition-colors"
                        >
                            <LogOut size={20} />
                            <span className="font-medium">{t('menu.signOut')}</span>
                        </button>
                    </div>

                    {/* User Profile Mini */}
                    <div className="p-4 border-t border-slate-800 text-xs text-slate-500 text-center">
                        &copy; 2026 PT Media Antar Nusa
                    </div>
                </div>
            </aside>

            {/* Main Content Wrapper */}
            <div className="flex-1 flex flex-col min-w-0">
                {/* Top Header */}
                <header className="sticky top-0 z-30 px-6 py-4 bg-white/80 backdrop-blur-md border-b border-gray-200 flex items-center justify-between">
                    <div className="flex items-center gap-4">
                        <button
                            onClick={toggleSidebar}
                            className="p-2 -ml-2 text-slate-600 hover:bg-gray-100 rounded-lg lg:hidden"
                        >
                            <Menu size={24} />
                        </button>
                    </div>

                    <div className="flex items-center gap-6">
                        <LanguageSwitcher />

                        <div className="relative notification-btn-container">
                            <button 
                                onClick={() => setIsNotificationsOpen(!isNotificationsOpen)}
                                className="relative text-slate-500 hover:text-slate-700 transition-colors p-2 hover:bg-gray-100 rounded-full cursor-pointer flex items-center justify-center focus:outline-none"
                            >
                                <Bell size={20} />
                                {notifications.filter(n => !n.isRead).length > 0 && (
                                    <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-red-500 rounded-full border-2 border-white"></span>
                                )}
                            </button>

                            {/* Notifications Dropdown */}
                            {isNotificationsOpen && (
                                <div className="absolute right-0 mt-2 w-80 md:w-96 bg-white/95 backdrop-blur-md border border-slate-100 shadow-2xl rounded-3xl overflow-hidden z-50 animate-in fade-in slide-in-from-top-2 duration-200">
                                    <div className="p-4 border-b border-slate-50 flex items-center justify-between bg-slate-50/50">
                                        <h4 className="font-bold text-slate-800 flex items-center gap-2 text-sm">
                                            <Bell size={16} className="text-blue-600" />
                                            {t('notifications.title')}
                                        </h4>
                                        <span className="bg-blue-100 text-blue-700 text-[10px] font-black px-2 py-0.5 rounded-full">
                                            {notifications.filter(n => !n.isRead).length} {t('notifications.new')}
                                        </span>
                                    </div>
                                    <div className="max-h-[320px] overflow-y-auto divide-y divide-slate-50 p-2 space-y-1">
                                        {notifications.length === 0 ? (
                                            <div className="text-center py-8 text-slate-400 text-xs font-bold uppercase tracking-wider">
                                                {t('notifications.noNotifications')}
                                            </div>
                                        ) : (
                                            notifications.map(notif => (
                                                <div 
                                                    key={notif.id} 
                                                    onClick={() => handleNotificationClick(notif.id)}
                                                    className={`p-3 rounded-2xl transition-all cursor-pointer flex gap-3 text-left 
                                                        ${notif.isRead 
                                                            ? 'bg-transparent opacity-60 hover:opacity-100' 
                                                            : 'bg-blue-50/50 hover:bg-blue-50 border border-blue-50/50 shadow-sm'
                                                        }
                                                    `}
                                                >
                                                    <div className={`p-2 h-fit rounded-xl ${notif.isRead ? 'bg-slate-100 text-slate-400' : 'bg-blue-100 text-blue-600'}`}>
                                                        {getNotificationIcon(notif.type)}
                                                    </div>
                                                    <div className="min-w-0 flex-1">
                                                        <p className={`text-xs font-bold ${notif.isRead ? 'text-slate-600' : 'text-slate-800'} truncate`}>{notif.title}</p>
                                                        <p className="text-[11px] text-slate-500 mt-0.5 leading-snug break-words">{notif.message}</p>
                                                        <p className="text-[9px] text-slate-400 mt-1">{notif.time}</p>
                                                    </div>
                                                </div>
                                            ))
                                        )}
                                    </div>
                                    <div className="p-3 border-t border-slate-50 text-center bg-slate-50/30">
                                        <button 
                                            onClick={() => {
                                                setNotifications(notifications.map(n => ({ ...n, isRead: true })));
                                                const readIds = notifications.map(n => n.id);
                                                localStorage.setItem(`lms_read_notifs_${user?.email || 'guest'}`, JSON.stringify(readIds));
                                            }}
                                            className="text-[10px] font-black text-blue-600 hover:text-blue-700 tracking-wider uppercase bg-transparent border-none cursor-pointer outline-none"
                                        >
                                            {t('notifications.markAllAsRead')}
                                        </button>
                                    </div>
                                </div>
                            )}
                        </div>

                        <div className="flex items-center gap-3 pl-6 border-l border-gray-200">
                            <div className="text-right hidden sm:block">
                                <p className="text-sm font-semibold text-slate-800 leading-tight">{user?.name || t('userFallback')}</p>
                                {user?.employee_id && <p className="text-[10px] text-slate-500 font-medium leading-tight">{user.employee_id}</p>}
                                <p className="text-xs text-blue-600 font-bold leading-tight mt-0.5">{user?.branch || t('branchFallback')}</p>
                            </div>
                            <div className={`w-10 h-10 rounded-full flex items-center justify-center text-white font-bold shadow-md ring-2 ring-white
                                ${userRole === 'HR' || userRole === 'HR_ADMIN' ? 'bg-gradient-to-tr from-purple-500 to-pink-600' :
                                    userRole === 'SUPERVISOR' ? 'bg-gradient-to-tr from-orange-500 to-red-500' :
                                        'bg-gradient-to-tr from-blue-500 to-teal-500'}
                            `}>
                                {user?.name ? getInitials(user.name) : 'U'}
                            </div>
                        </div>
                    </div>
                </header>

                {/* Page Content */}
                <main className="flex-1 p-6 lg:p-8 overflow-y-auto">
                    {children}
                </main>
            </div>
            
            {/* Feedback Popup Modal */}
            <FeedbackModal
                isOpen={isFeedbackOpen}
                onClose={() => setIsFeedbackOpen(false)}
                user={user}
            />
        </div>
    );
};

export default DashboardLayout;
