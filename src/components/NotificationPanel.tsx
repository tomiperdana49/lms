import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Bell, CheckCircle, AlertCircle, Clock } from 'lucide-react';
import { API_BASE_URL } from '../config';
import type { Meeting, TrainingRequest } from '../types';

interface Notification {
    id: number;
    title: string;
    message: string;
    time: string;
    type: 'INFO' | 'SUCCESS' | 'WARNING';
    isRead: boolean;
}

interface NotificationPanelProps {
    userEmail?: string;
    userName?: string;
    userRole?: string;
}

const NotificationPanel = ({ userEmail, userName, userRole }: NotificationPanelProps) => {
    const { t } = useTranslation('notificationPanel');
    const [notifications, setNotifications] = useState<Notification[]>([]);

    useEffect(() => {
        const fetchNotifications = async () => {
            if (!userEmail || !userName) return; // Wait for user details

            try {
                const [meetingsRes, trainingRes, logsRes] = await Promise.all([
                    fetch(`${API_BASE_URL}/api/meetings`),
                    fetch(`${API_BASE_URL}/api/training`),
                    fetch(`${API_BASE_URL}/api/logs`)
                ]);

                const meetings = await meetingsRes.json();
                const training = await trainingRes.json();
                const logs = await logsRes.json();

                // 1. Transform Meetings to Notifications
                // Filter: Only include meetings where the user is invited (in guest list)
                const meetingNotifs: Notification[] = meetings
                    .filter((m: Meeting) => m.guests?.emails?.includes(userEmail))
                    .map((m: Meeting) => ({
                        id: m.id,
                        title: t('meeting.title'),
                        message: t('meeting.message', { title: m.title, time: m.time, type: m.type }),
                        time: new Date(m.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
                        type: 'INFO',
                        isRead: false
                    }));

                // 2. Transform Training Requests to Notifications
                // Filter: Only include requests submitted by the current user
                const trainingNotifs: Notification[] = training
                    .filter((t: TrainingRequest) => t.userName === userName)
                    .map((req: TrainingRequest) => ({
                        id: req.id,
                        title: t('training.title', { status: req.status?.replace('_', ' ') }),
                        message: t('training.message', { title: req.title, status: req.status?.toLowerCase().replace('_', ' ') }),
                        time: new Date(req.submittedAt || Date.now()).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
                        type: req.status === 'APPROVED' ? 'SUCCESS' : req.status === 'REJECTED' ? 'WARNING' : 'INFO',
                        isRead: req.status !== 'PENDING_SUPERVISOR'
                    }));

                // 3. Transform Reading Logs to Notifications for HR
                let readingNotifs: Notification[] = [];
                if (userRole === 'HR' || userRole === 'HR_ADMIN') {
                    readingNotifs = logs
                        .filter((l: any) => l.status === 'Finished' && l.hrApprovalStatus === 'Pending')
                        .map((l: any) => ({
                            id: l.id + 100000,
                            title: t('readingClaim.title'),
                            message: t('readingClaim.message', { userName: l.userName || t('readingClaim.defaultUserName'), title: l.title }),
                            time: new Date(l.date || Date.now()).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
                            type: 'INFO',
                            isRead: false
                        }));
                }

                // Combine and Sort by latest
                const all = [...meetingNotifs, ...trainingNotifs, ...readingNotifs].sort((a, b) => b.id - a.id);
                setNotifications(all);
            } catch (error) {
                console.error("Failed to fetch notifications", error);
            }
        };

        fetchNotifications();
    }, [userEmail, userName, userRole]);

    const getIcon = (type: Notification['type']) => {
        switch (type) {
            case 'SUCCESS': return <CheckCircle size={20} className="text-emerald-500" />;
            case 'WARNING': return <AlertCircle size={20} className="text-amber-500" />;
            default: return <Bell size={20} className="text-blue-500" />;
        }
    };

    return (
        <div className="bg-white/80 backdrop-blur-md rounded-3xl p-6 shadow-sm border border-slate-100 h-full flex flex-col">
            <div className="flex items-center justify-between mb-6">
                <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                    <Bell size={20} className="text-blue-600" />
                    {t('title')}
                </h3>
                <span className="bg-blue-100 text-blue-700 text-xs font-bold px-2 py-0.5 rounded-full">
                    {t('newCount', { count: notifications.filter(n => !n.isRead).length })}
                </span>
            </div>

            <div className="space-y-4 overflow-y-auto flex-1 pr-2 custom-scrollbar">
                {notifications.map(notif => (
                    <div
                        key={notif.id}
                        className={`p-4 rounded-2xl border transition-all hover:bg-white hover:shadow-md ${notif.isRead ? 'bg-slate-50 border-slate-100 opacity-70' : 'bg-white border-blue-100 shadow-sm'}`}
                    >
                        <div className="flex gap-3">
                            <div className={`mt-0.5 p-2 rounded-full ${notif.isRead ? 'bg-slate-100' : 'bg-blue-50'}`}>
                                {getIcon(notif.type)}
                            </div>
                            <div>
                                <h4 className={`text-sm font-bold ${notif.isRead ? 'text-slate-600' : 'text-slate-800'}`}>
                                    {notif.title}
                                </h4>
                                <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                                    {notif.message}
                                </p>
                                <p className="text-[10px] text-slate-400 mt-2 flex items-center gap-1">
                                    <Clock size={10} /> {notif.time}
                                </p>
                            </div>
                        </div>
                    </div>
                ))}
            </div>

            <button className="mt-4 w-full py-2 text-xs font-bold text-slate-500 hover:text-blue-600 border border-transparent hover:border-blue-100 rounded-xl transition-all">
                {t('viewAll')}
            </button>
        </div>
    );
};

export default NotificationPanel;
