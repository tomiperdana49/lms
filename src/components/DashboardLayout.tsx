import { useState, useEffect, type ReactNode } from 'react';
import {
    LayoutDashboard,
    Library,
    BookOpen,
    Users,
    Globe,
    Calendar,
    Menu,
    X,
    Bell,
    Search,
    LogOut,
    Award,
    Shield,
    ChevronDown,
    ChevronUp,
    FileText,
    TrendingUp,
    GraduationCap
} from 'lucide-react';
import type { Page, Role, User } from '../types';

interface DashboardLayoutProps {
    children: ReactNode;
    activePage: Page;
    onNavigate: (page: Page, view?: string) => void;
    userRole: Role;
    user: User;
    onRoleChange: (role: Role) => void; 
    onLogout: () => void;
    adminView?: string;
}

const DashboardLayout = ({ children, activePage, onNavigate, userRole, user, onLogout, adminView }: DashboardLayoutProps) => {
    const [isSidebarOpen, setIsSidebarOpen] = useState(false);
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
    
    const toggleSidebar = () => setIsSidebarOpen(!isSidebarOpen);
    
    // List sub-menu admin agar sama dengan gambar
    const adminSubItems = [
        { icon: LayoutDashboard, label: 'Overview', id: 'admin-dashboard', view: 'overview' },
        { icon: Calendar, label: 'Calendar', id: 'admin-dashboard', view: 'calendar' },
        { header: 'MANAGEMENT' },
        { icon: Users, label: 'User Management', id: 'admin-dashboard', view: 'users' },
        { icon: BookOpen, label: 'Online Modules Management', id: 'admin-dashboard', view: 'courses' },
        { icon: FileText, label: 'Training Requests', id: 'admin-dashboard', view: 'training' },
        { header: 'REPORT' },
        { icon: Library, label: 'Reading Log', id: 'admin-dashboard', view: 'logs' },
        { icon: Award, label: 'Quiz Report', id: 'admin-dashboard', view: 'quiz-reports' },
        { icon: TrendingUp, label: 'HR Report', id: 'admin-dashboard', view: 'reports' },
        { icon: Award, label: 'Incentives', id: 'admin-dashboard', view: 'incentives' },
        { icon: Users, label: 'Training Internal', id: 'admin-dashboard', view: 'meetings' },
    ];

    const menuItems = [
        { icon: LayoutDashboard, label: 'Dashboard', id: 'dashboard' },
        { icon: Library, label: 'Reading Log', id: 'reading-log' },
        { icon: BookOpen, label: 'Online Modules', id: 'courses' },
        { icon: Calendar, label: 'Calendar', id: 'calendar' },
        { icon: Award, label: 'Incentives', id: 'incentives' },
    ];

    const trainingSubItems = [
        { icon: Users, label: 'Internal', id: 'internal' },
        { icon: Globe, label: 'External', id: 'external' },
        ...(userRole === 'SUPERVISOR' ? [{ icon: Shield, label: 'External Approval', id: 'external-approval' }] : []),
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
          fixed lg:static inset-y-0 left-0 z-50
          w-64 bg-slate-900 text-white transition-transform duration-300 ease-in-out
          ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
        `}
            >
                <div className="h-full flex flex-col">
                    {/* Logo / Brand */}
                    <div className="p-6 border-b border-slate-700 flex items-center justify-between">
                        <h1 className="text-xl font-bold tracking-wider">LMS NUSA</h1>
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

                        {/* Search Bar */}
                        <div className="hidden md:flex items-center bg-gray-100 rounded-full px-4 py-2 w-64">
                            <Search size={18} className="text-gray-400" />
                            <input
                                type="text"
                                placeholder="Search..."
                                className="bg-transparent border-none focus:outline-none text-sm ml-2 w-full text-slate-700"
                            />
                        </div>
                    </div>

                    <div className="flex items-center gap-6">
                        <button className="relative text-slate-500 hover:text-slate-700 transition-colors">
                            <Bell size={20} />
                            <span className="absolute top-0 right-0 w-2 h-2 bg-red-500 rounded-full border-2 border-white"></span>
                        </button>

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
        </div>
    );
};

export default DashboardLayout;
