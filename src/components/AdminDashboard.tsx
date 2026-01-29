import { useState, useEffect } from 'react';
import type { ElementType } from 'react';
import {
    LayoutDashboard,
    Users,
    BookOpen,
    FileText,
    Calendar,
    LogOut,
    TrendingUp,
    AlertCircle,
    ChevronRight,
    Award
} from 'lucide-react';
import type { Page, User, ReadingLogEntry } from '../types';
import { API_BASE_URL } from '../config';
import UserManagement from './UserManagement';
import AdminReadingLog from './AdminReadingLog';
import TrainingInternalList from './TrainingInternalList';
import OnlineModulesManager from './OnlineModulesManager';

import TrainingExternalManager from './TrainingExternalManager';
import HRReportGenerator from './HRReportGenerator';
import IncentiveManager from './IncentiveManager';
import LMSCalendar from './LMSCalendar';

interface AdminDashboardProps {
    user: User;
    onNavigate: (page: Page) => void;
    onLogout: () => void;
}

type AdminView = 'overview' | 'users' | 'logs' | 'training' | 'meetings' | 'courses' | 'reports' | 'incentives' | 'calendar';

const SidebarItem = ({ view, icon: Icon, label, currentView, setCurrentView }: { view: AdminView, icon: ElementType, label: string, currentView: AdminView, setCurrentView: (v: AdminView) => void }) => (
    <button
        onClick={() => setCurrentView(view)}
        className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all font-medium
            ${currentView === view
                ? 'bg-blue-600 text-white shadow-lg shadow-blue-900/20'
                : 'text-slate-500 hover:bg-slate-100 hover:text-slate-900'
            }
        `}
    >
        <Icon size={20} />
        <span>{label}</span>
    </button>
);

interface StatCardProps {
    label: string;
    value: string | number;
    icon: ElementType;
    color: string;
    trend?: string;
}

const StatCard = ({ label, value, icon: Icon, color, trend }: StatCardProps) => (
    <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
        <div className="flex justify-between items-start">
            <div>
                <p className="text-slate-500 text-sm font-medium mb-1">{label}</p>
                <h3 className="text-3xl font-bold text-slate-800">{value}</h3>
            </div>
            <div className={`p-3 rounded-xl ${color} text-white`}>
                <Icon size={24} />
            </div>
        </div>
        {trend && (
            <div className="flex items-center gap-1 mt-4 text-xs font-medium text-green-600">
                <TrendingUp size={14} />
                <span>{trend} vs last month</span>
            </div>
        )}
    </div>
);

const AdminDashboard = ({ user, onLogout }: AdminDashboardProps) => {
    const [currentView, setCurrentView] = useState<AdminView>('overview');
    const [stats, setStats] = useState({
        totalUsers: 0,
        booksRead: 0,
        activeMeetings: 0,
        pendingTraining: 0
    });
    const [recentLogs, setRecentLogs] = useState<ReadingLogEntry[]>([]);

    useEffect(() => {
        // Fetch aggregated data
        const fetchData = async () => {
            try {
                const [usersRes, logsRes, meetingsRes, trainingRes] = await Promise.all([
                    fetch(`${API_BASE_URL}/api/users`),
                    fetch(`${API_BASE_URL}/api/logs`),
                    fetch(`${API_BASE_URL}/api/meetings`),
                    fetch(`${API_BASE_URL}/api/training`)
                ]);

                if (usersRes.ok && logsRes.ok && meetingsRes.ok) {
                    const users = await usersRes.json();
                    const logs: ReadingLogEntry[] = await logsRes.json();
                    const meetings = await meetingsRes.json();

                    // Process Training Data
                    let pendingCount = 0;
                    if (trainingRes.ok) {
                        const training = await trainingRes.json();
                        // eslint-disable-next-line @typescript-eslint/no-explicit-any
                        pendingCount = training.filter((t: any) => t.status && String(t.status).toUpperCase().includes('PENDING')).length;
                    }

                    setStats({
                        totalUsers: users.length,
                        booksRead: logs.filter(l => l.status === 'Finished').length,
                        activeMeetings: meetings.length,
                        pendingTraining: pendingCount
                    });

                    // sorting logs by date descending
                    const sortedLogs = logs.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()).slice(0, 5);
                    setRecentLogs(sortedLogs);
                }
            } catch (error) {
                console.error("Dashboard data fetch failed", error);
            }
        };
        fetchData();
    }, []);



    const renderContent = () => {
        switch (currentView) {
            case 'users':
            case 'users': return <UserManagement userRole={user.role} />;
            case 'logs': return <AdminReadingLog />;
            case 'training': return <TrainingExternalManager userRole={user.role} userName={user.name} />;
            case 'meetings': return <TrainingInternalList userRole={user.role} />;
            case 'courses': return <OnlineModulesManager userRole={user.role} />;
            case 'reports':
                return <HRReportGenerator />;
            case 'incentives':
                return <IncentiveManager user={user} />;
            case 'calendar':
                return <LMSCalendar compact={false} userEmail={user.email} userRole={user.role} />;
            case 'overview':
            default:
                return (
                    <div className="space-y-6">
                        {/* Stats Row */}
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                            <StatCard label="Total Staff" value={stats.totalUsers} icon={Users} color="bg-blue-500" trend="+12%" />
                            <StatCard label="Books Read" value={stats.booksRead} icon={BookOpen} color="bg-orange-500" trend="+8%" />
                            <StatCard label="Training Internal" value={stats.activeMeetings} icon={Calendar} color="bg-purple-500" />
                            <StatCard label="Pending Requests" value={stats.pendingTraining} icon={AlertCircle} color="bg-rose-500" />
                        </div>

                        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                            {/* Recent Activity Feed */}
                            <div className="lg:col-span-2 bg-white rounded-2xl shadow-sm border border-slate-100 p-6">
                                <div className="flex justify-between items-center mb-6">
                                    <h3 className="text-lg font-bold text-slate-800">Recent User Activity</h3>
                                    <button onClick={() => setCurrentView('logs')} className="text-sm text-blue-600 hover:text-blue-700 font-medium">View All</button>
                                </div>
                                <div className="space-y-4">
                                    {recentLogs.map((log) => (
                                        <div key={log.id} className="flex items-center gap-4 p-4 rounded-xl hover:bg-slate-50 transition-colors border border-slate-50">
                                            <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center text-slate-600 font-bold text-sm">
                                                {log.userName ? log.userName.charAt(0).toUpperCase() : 'U'}
                                            </div>
                                            <div className="flex-1">
                                                <p className="text-sm font-semibold text-slate-800">
                                                    {log.userName || 'Unknown User'} <span className="font-normal text-slate-500">read</span> {log.title}
                                                </p>
                                                <p className="text-xs text-slate-400 mt-0.5">{new Date(log.date).toLocaleDateString()} • {log.category}</p>
                                            </div>
                                            <span className={`text-xs font-bold px-2 py-1 rounded-lg ${log.status === 'Finished' ? 'bg-green-100 text-green-700' : 'bg-orange-100 text-orange-700'}`}>
                                                {log.status === 'Finished' ? 'Completed' : 'Reading'}
                                            </span>
                                        </div>
                                    ))}
                                    {recentLogs.length === 0 && <p className="text-slate-400 italic text-center py-4">No recent activity.</p>}
                                </div>
                            </div>

                            {/* Right Column: Quick Actions & Calendar */}
                            <div className="space-y-6">
                                {/* Notifications / Quick Actions */}
                                <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-6">
                                    <h3 className="text-lg font-bold text-slate-800 mb-4">Quick Actions</h3>
                                    <div className="space-y-3">
                                        <button
                                            onClick={() => setCurrentView('meetings')}
                                            className="w-full text-left p-3 rounded-xl bg-purple-50 text-purple-700 hover:bg-purple-100 transition-colors font-medium flex justify-between items-center group">
                                            Schedule Meeting
                                            <ChevronRight size={16} className="opacity-0 group-hover:opacity-100 transition-opacity" />
                                        </button>
                                        <button
                                            onClick={() => setCurrentView('users')}
                                            className="w-full text-left p-3 rounded-xl bg-blue-50 text-blue-700 hover:bg-blue-100 transition-colors font-medium flex justify-between items-center group">
                                            Add New Staff
                                            <ChevronRight size={16} className="opacity-0 group-hover:opacity-100 transition-opacity" />
                                        </button>
                                        <button
                                            onClick={() => setCurrentView('training')}
                                            className="w-full text-left p-3 rounded-xl bg-teal-50 text-teal-700 hover:bg-teal-100 transition-colors font-medium flex justify-between items-center group">
                                            Review Training Requests
                                            <ChevronRight size={16} className="opacity-0 group-hover:opacity-100 transition-opacity" />
                                        </button>
                                    </div>
                                </div>

                                {/* Calendar Widget */}
                                <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-6 overflow-hidden">
                                    <h3 className="text-lg font-bold text-slate-800 mb-4">Training Calendar</h3>
                                    <div className="h-[300px]">
                                        <LMSCalendar compact={true} userEmail={user.email} userRole={user.role} />
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                );
        }
    };

    return (
        <div className="min-h-screen bg-slate-50 flex">
            {/* Sidebar */}
            <aside className="w-64 bg-white border-r border-slate-200 fixed h-full z-10 hidden md:flex flex-col">
                <div className="p-6 border-b border-slate-100">
                    <h1 className="text-xl font-bold text-blue-600 flex items-center gap-2">
                        <LayoutDashboard className="fill-blue-600" /> Admin Panel
                    </h1>
                </div>

                <nav className="flex-1 p-4 space-y-2 overflow-y-auto">
                    <p className="px-4 text-xs font-bold text-slate-400 uppercase tracking-wider mb-2 mt-4">Main</p>
                    <SidebarItem view="overview" icon={LayoutDashboard} label="Overview" currentView={currentView} setCurrentView={setCurrentView} />
                    <SidebarItem view="calendar" icon={Calendar} label="Calendar" currentView={currentView} setCurrentView={setCurrentView} />

                    <p className="px-4 text-xs font-bold text-slate-400 uppercase tracking-wider mb-2 mt-6">Management</p>
                    <SidebarItem view="users" icon={Users} label="User Management" currentView={currentView} setCurrentView={setCurrentView} />
                    <SidebarItem view="courses" icon={BookOpen} label="Online Modules Management" currentView={currentView} setCurrentView={setCurrentView} />
                    <SidebarItem view="logs" icon={FileText} label="Reading Logs" currentView={currentView} setCurrentView={setCurrentView} />
                    <SidebarItem view="training" icon={FileText} label="Training Requests" currentView={currentView} setCurrentView={setCurrentView} />
                    <SidebarItem view="reports" icon={TrendingUp} label="HR Reports" currentView={currentView} setCurrentView={setCurrentView} />
                    <SidebarItem view="incentives" icon={Award} label="Incentives" currentView={currentView} setCurrentView={setCurrentView} />
                    <SidebarItem view="meetings" icon={Users} label="Training Internal" currentView={currentView} setCurrentView={setCurrentView} />
                </nav>

                <div className="p-4 border-t border-slate-100">
                    <div className="flex items-center gap-3 px-4 py-3 mb-2">
                        <div className="w-8 h-8 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center font-bold text-xs">
                            {user.name.charAt(0)}
                        </div>
                        <div className="flex-1 min-w-0">
                            <p className="text-sm font-bold text-slate-800 truncate">{user.name}</p>
                            <p className="text-xs text-slate-500 truncate">{user.role}</p>
                        </div>
                    </div>
                    <button
                        onClick={onLogout}
                        className="w-full flex items-center gap-3 px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50 rounded-xl transition-colors"
                    >
                        <LogOut size={18} /> Sign Out
                    </button>
                </div>
            </aside>

            {/* Main Content */}
            <main className="flex-1 md:ml-64 p-8">
                {/* Mobile Header (Simplified) */}
                <div className="md:hidden flex justify-between items-center mb-6">
                    <h1 className="text-xl font-bold text-slate-800">Admin Panel</h1>
                    {/* Add Mobile Menu Toggle Here if needed */}
                </div>

                {renderContent()}
            </main>
        </div>
    );
};

export default AdminDashboard;
