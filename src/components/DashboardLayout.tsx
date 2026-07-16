import { useState, useEffect, type ReactNode } from 'react';
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
    Globe
} from 'lucide-react';
import type { Page, Role, User } from '../types';
import FeedbackModal from './FeedbackModal';
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
    config?: { moduleInternal: boolean; moduleExternal: boolean; moduleIncentive: boolean };
}

const DashboardLayout = ({ children, activePage, onNavigate, userRole, user, onLogout, adminView, config }: DashboardLayoutProps) => {
    const [isSidebarOpen, setIsSidebarOpen] = useState(false);
    const [isFeedbackOpen, setIsFeedbackOpen] = useState(false);
    const [isTrainingOpen, setIsTrainingOpen] = useState(() => {
        return activePage === 'internal' || activePage === 'external' || activePage === 'external-approval';
    });
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

                // 1. Meetings
                const meetingNotifs = meetings
                    .filter((m: any) => m.guests?.emails?.includes(user.email))
                    .map((m: any) => {
                        const notifId = m.id;
                        return {
                            id: notifId,
                            title: 'Upcoming Meeting',
                            message: `${m.title} at ${m.time} (${m.type})`,
                            time: new Date(m.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
                            type: 'INFO',
                            isRead: readIds.includes(notifId)
                        };
                    });

                // 2. Training Requests
                const trainingNotifs = training
                    .filter((t: any) => t.userName === user.name || (user.employee_id && t.employee_id === user.employee_id))
                    .map((t: any) => {
                        const notifId = t.id + 50000;
                        return {
                            id: notifId,
                            title: `Training: ${t.status?.replace('_', ' ')}`,
                            message: `Request for "${t.title}" is ${t.status?.toLowerCase().replace('_', ' ')}.`,
                            time: new Date(t.submittedAt || Date.now()).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
                            type: t.status === 'APPROVED' ? 'SUCCESS' : t.status === 'REJECTED' ? 'WARNING' : 'INFO',
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
                        let statusLabel = 'diperbarui';
                        let type = 'INFO';
                        
                        if (l.hrApprovalStatus === 'Approved') {
                            statusLabel = 'disetujui oleh HRD';
                            type = 'SUCCESS';
                        } else if (l.hrApprovalStatus === 'Rejected') {
                            statusLabel = `ditolak oleh HRD${l.rejectionReason ? ` dengan alasan: "${l.rejectionReason}"` : ''}`;
                            type = 'WARNING';
                        } else if (l.hrApprovalStatus === 'Cancelled' || l.status === 'Cancelled') {
                            statusLabel = `dibatalkan/dihapus${l.rejectionReason ? ` dengan alasan: "${l.rejectionReason}"` : ''}`;
                            type = 'WARNING';
                        }

                        return {
                            id: notifId,
                            title: `Status Buku: ${l.hrApprovalStatus || l.status}`,
                            message: `Buku "${l.title}" Anda telah ${statusLabel}.`,
                            time: new Date(l.approvedAt || l.finishDate || l.date || Date.now()).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
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
        { icon: LayoutDashboard, label: 'Overview', id: 'admin-dashboard', view: 'overview' },
        { icon: Calendar, label: 'Calendar', id: 'admin-dashboard', view: 'calendar' },
        { header: 'MANAGEMENT' },
        { icon: Users, label: 'User Management', id: 'admin-dashboard', view: 'users' },
        { icon: BookOpen, label: 'Online Modules Management', id: 'admin-dashboard', view: 'courses' },
        ...((config?.moduleInternal || config?.moduleExternal) ? [{ header: 'TRAINING' }] : []),
        ...(config?.moduleInternal ? [{ icon: Users, label: 'Internal', id: 'admin-dashboard', view: 'meetings' }] : []),
        ...(config?.moduleExternal ? [{ icon: FileText, label: 'External', id: 'admin-dashboard', view: 'training' }] : []),
        { header: 'REPORT' },
        { icon: Library, label: 'Reading Log', id: 'admin-dashboard', view: 'logs' },
        { icon: Award, label: 'Quiz Report', id: 'admin-dashboard', view: 'quiz-reports' },
        { icon: TrendingUp, label: 'HR Report', id: 'admin-dashboard', view: 'reports' },
        ...(config?.moduleIncentive ? [{ icon: Award, label: 'Incentives', id: 'admin-dashboard', view: 'incentives' }] : []),
    ];

    const menuItems = [
        { icon: LayoutDashboard, label: 'Dashboard', id: 'dashboard' },
        { icon: Library, label: 'Reading Log', id: 'reading-log' },
        { icon: BookOpen, label: 'Online Modules', id: 'courses' },
        { icon: Calendar, label: 'Calendar', id: 'calendar' },
        ...(config?.moduleIncentive ? [{ icon: Award, label: 'Incentives', id: 'incentives' }] : []),
    ];

    const trainingSubItems = [
        ...(config?.moduleInternal ? [{ icon: Users, label: 'Internal', id: 'internal' }] : []),
        ...(config?.moduleExternal ? [{ icon: Globe, label: 'External', id: 'external' }] : []),
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
                            <div className="pt-1">
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
                                        <span className="font-medium">Training</span>
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
                                        <span className="font-medium">Admin Panel</span>
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

                    {/* Feedback Button */}
                    <div className="px-4 pt-4 border-t border-slate-800/60">
                        <button
                            type="button"
                            onClick={() => setIsFeedbackOpen(true)}
                            className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-emerald-400 hover:bg-slate-800 hover:text-emerald-300 transition-all text-left cursor-pointer"
                        >
                            <MessageSquarePlus size={20} />
                            <span className="font-medium">Feedback</span>
                        </button>
                    </div>

                    {/* Logout Button (Sidebar Bottom) */}
                    <div className="p-4">
                        <button
                            onClick={onLogout}
                            className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-red-400 hover:bg-slate-800 hover:text-red-300 transition-colors"
                        >
                            <LogOut size={20} />
                            <span className="font-medium">Sign Out</span>
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
                                            Notifications
                                        </h4>
                                        <span className="bg-blue-100 text-blue-700 text-[10px] font-black px-2 py-0.5 rounded-full">
                                            {notifications.filter(n => !n.isRead).length} New
                                        </span>
                                    </div>
                                    <div className="max-h-[320px] overflow-y-auto divide-y divide-slate-50 p-2 space-y-1">
                                        {notifications.length === 0 ? (
                                            <div className="text-center py-8 text-slate-400 text-xs font-bold uppercase tracking-wider">
                                                No notifications found
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
                                            Mark all as read
                                        </button>
                                    </div>
                                </div>
                            )}
                        </div>

                        <div className="flex items-center gap-3 pl-6 border-l border-gray-200">
                            <div className="text-right hidden sm:block">
                                <p className="text-sm font-semibold text-slate-800 leading-tight">{user?.name || 'User'}</p>
                                {user?.employee_id && <p className="text-[10px] text-slate-500 font-medium leading-tight">{user.employee_id}</p>}
                                <p className="text-xs text-blue-600 font-bold leading-tight mt-0.5">{user?.branch || 'Nusanet'}</p>
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
