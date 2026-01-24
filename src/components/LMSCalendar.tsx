import { useState, useEffect, useCallback } from 'react';
import { ChevronLeft, ChevronRight, Calendar as CalendarIcon, Clock, MoreHorizontal, MapPin, Video, Plus, X } from 'lucide-react';
import { API_BASE_URL } from '../config';
import type { Role } from '../types';

interface CalendarEvent {
    id: number;
    title: string;
    type: 'INTERNAL' | 'EXTERNAL' | 'DEADLINE' | 'INCENTIVE';
    date: Date;
    time: string;
    description: string;
    location?: string;
    link?: string;
}

interface LMSCalendarProps {
    compact?: boolean;
    userEmail?: string;
    userRole?: Role;
}

const LMSCalendar = ({ compact = false, userEmail, userRole }: LMSCalendarProps) => {
    // --- State ---
    const [currentDate, setCurrentDate] = useState(new Date());
    const [selectedDate, setSelectedDate] = useState<Date>(new Date());
    const [events, setEvents] = useState<CalendarEvent[]>([]);

    // Quick Schedule Modal State
    const [isScheduleOpen, setIsScheduleOpen] = useState(false);
    const [scheduleData, setScheduleData] = useState({
        title: '',
        date: new Date().toISOString().split('T')[0],
        startTime: '09:00',
        endTime: '10:00',
        type: 'Online' as 'Online' | 'Offline' | 'Hybrid',
        host: 'HR Team'
    });

    // --- Fetch Data ---
    // Defined outside useEffect to be reusable after scheduling
    // --- Fetch Data ---
    // Defined outside useEffect to be reusable after scheduling
    const fetchEvents = useCallback(async () => {
        try {
            const [meetingsRes, incentivesRes, trainingRes] = await Promise.all([
                fetch(`${API_BASE_URL}/api/meetings`),
                fetch(`${API_BASE_URL}/api/incentives`),
                fetch(`${API_BASE_URL}/api/training`)
            ]);

            const meetings = await meetingsRes.json();
            const incentives = await incentivesRes.json();
            const training = await trainingRes.json();

            const loadedEvents: CalendarEvent[] = [];
            const isHR = userRole === 'HR' || userRole === 'HR_ADMIN';

            // 1. Process Meetings (Internal)
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            meetings.forEach((m: any) => {
                // Show if public (HR Host) OR user is invited OR User is HR (Access All)
                if (isHR || m.host === 'HR Team' || m.host === 'Admin' || (userEmail && m.guests?.emails?.includes(userEmail))) {
                    loadedEvents.push({
                        id: m.id,
                        title: m.title,
                        type: 'INTERNAL',
                        date: new Date(m.date),
                        time: m.time,
                        description: m.description,
                        location: m.location,
                        link: m.meetLink
                    });
                }
            });

            // 2. Process External Training (HR Only sees Approved External Training as schedule items?)
            // Usually regular users see their own requested training. HR sees all optimized.
            if (isHR) {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                training.forEach((t: any) => {
                    if (t.status === 'APPROVED' || t.status === 'COMPLETED') {
                        loadedEvents.push({
                            id: t.id,
                            title: `Training: ${t.title} (${t.employeeName})`,
                            type: 'EXTERNAL',
                            date: new Date(t.date),
                            time: 'All Day', // External training often full day or just date tracked
                            description: `Provider: ${t.vendor}. Justification: ${t.justification}`
                        });
                    }
                });
            } else if (userEmail) {
                // Regular user sees their own
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                training.forEach((t: any) => {
                    if (t.employeeName.toLowerCase().includes(userEmail.split('@')[0].toLowerCase())) {
                        loadedEvents.push({
                            id: t.id,
                            title: `Training: ${t.title}`,
                            type: 'EXTERNAL',
                            date: new Date(t.date),
                            time: 'All Day',
                            description: `Status: ${t.status}`
                        });
                    }
                });
            }

            // 3. Process Incentives
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            incentives.forEach((inc: any) => {
                if (isHR && inc.status === 'Active') {
                    // HR Sees all active incentives expiry
                    loadedEvents.push({
                        id: inc.id,
                        title: `Incentive End: ${inc.courseName} - ${inc.employeeName}`,
                        type: 'INCENTIVE',
                        date: new Date(inc.endDate),
                        time: '23:59',
                        description: `Incentive period ends.`
                    });
                }
            });

            setEvents(loadedEvents);
        } catch (err) {
            console.error("Calendar fetch error", err);
        }
    }, [userRole, userEmail]);

    useEffect(() => {
        // eslint-disable-next-line
        fetchEvents();
    }, [fetchEvents]);

    // --- Schedule Handler ---
    const handleQuickSchedule = async () => {
        try {
            const dateObj = new Date(scheduleData.date);
            const shortDate = `${dateObj.getDate()} ${dateObj.toLocaleString('default', { month: 'short' }).toUpperCase()}`;

            const meetingPayload = {
                title: scheduleData.title,
                date: scheduleData.date,
                time: `${scheduleData.startTime} - ${scheduleData.endTime}`,
                shortDate: shortDate,
                host: scheduleData.host,
                type: scheduleData.type,
                location: scheduleData.type === 'Online' ? 'Online Link Pending' : 'TBD', // simplified for quick add
                meetLink: scheduleData.type === 'Online' ? 'https://meet.google.com/new' : undefined,
                description: 'Scheduled via Calendar Quick Add',
                guests: { status: 'Awaiting', count: 0, emails: [] }
            };

            await fetch(`${API_BASE_URL}/api/meetings`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(meetingPayload)
            });

            setIsScheduleOpen(false);
            fetchEvents(); // Refresh calendar
        } catch (err) { console.error('Schedule failed', err); }
    };

    const openScheduleModal = (dateStr?: string) => {
        setScheduleData({
            ...scheduleData,
            date: dateStr || new Date().toISOString().split('T')[0],
            title: ''
        });
        setIsScheduleOpen(true);
    };

    // --- Calendar Logic ---
    const getDaysInMonth = (date: Date) => {
        const year = date.getFullYear();
        const month = date.getMonth();
        return new Date(year, month + 1, 0).getDate();
    };

    const getFirstDayOfMonth = (date: Date) => {
        const year = date.getFullYear();
        const month = date.getMonth();
        return new Date(year, month, 1).getDay();
    };

    const daysInMonth = getDaysInMonth(currentDate);
    const startDayOffset = getFirstDayOfMonth(currentDate);

    const prevMonth = () => {
        setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1));
    };

    const nextMonth = () => {
        setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1));
    };

    const isSameDay = (d1: Date, d2: Date) => {
        return d1.getFullYear() === d2.getFullYear() &&
            d1.getMonth() === d2.getMonth() &&
            d1.getDate() === d2.getDate();
    };

    const getEventsForDay = (day: number) => {
        const target = new Date(currentDate.getFullYear(), currentDate.getMonth(), day);
        return events.filter(e => isSameDay(e.date, target));
    };

    const getEventColor = (type: CalendarEvent['type']) => {
        switch (type) {
            case 'INTERNAL': return 'bg-blue-500 shadow-blue-500/50'; // Meetings
            case 'EXTERNAL': return 'bg-emerald-500 shadow-emerald-500/50';
            case 'DEADLINE': return 'bg-rose-500 shadow-rose-500/50';
            case 'INCENTIVE': return 'bg-amber-500 shadow-amber-500/50';
            default: return 'bg-slate-400';
        }
    };

    const getEventBadgeStyle = (type: CalendarEvent['type']) => {
        switch (type) {
            case 'INTERNAL': return 'bg-blue-50 text-blue-700 border-blue-200';
            case 'EXTERNAL': return 'bg-emerald-50 text-emerald-700 border-emerald-200';
            case 'DEADLINE': return 'bg-rose-50 text-rose-700 border-rose-200';
            case 'INCENTIVE': return 'bg-amber-50 text-amber-700 border-amber-200';
            default: return 'bg-slate-50 text-slate-700 border-slate-200';
        }
    };

    // --- Render Helpers ---
    const renderDay = (day: number) => {
        const dateObj = new Date(currentDate.getFullYear(), currentDate.getMonth(), day);
        const dayEvents = getEventsForDay(day);
        const isSelected = isSameDay(selectedDate, dateObj);
        const hasEvents = dayEvents.length > 0;
        const isToday = isSameDay(dateObj, new Date());

        return (
            <div
                key={day}
                onClick={() => setSelectedDate(dateObj)}
                className={`
                    relative aspect-square rounded-2xl transition-all cursor-pointer flex flex-col items-center justify-center group
                    ${compact ? 'gap-0.5' : 'gap-1'}
                    ${isSelected
                        ? 'bg-gradient-to-br from-blue-600 to-indigo-600 text-white shadow-xl shadow-blue-500/30 scale-110 z-10'
                        : 'bg-white/60 border border-white/50 text-slate-600 hover:bg-white hover:shadow-lg hover:scale-105 hover:z-10'
                    }
                    ${isToday && !isSelected ? 'ring-2 ring-blue-400 ring-offset-2 ring-offset-slate-50' : ''}
                `}
            >
                <span className={`${compact ? 'text-xs' : 'text-sm'} font-bold ${isSelected ? 'text-white' : 'text-slate-700'}`}>
                    {day}
                </span>
                {hasEvents && (
                    <div className="flex gap-1">
                        {dayEvents.slice(0, compact ? 2 : 3).map(ev => (
                            <div
                                key={ev.id}
                                className={`${compact ? 'h-1 w-1' : 'h-1.5 w-1.5'} rounded-full ${isSelected ? 'bg-white/80' : getEventColor(ev.type)} shadow-sm`}
                            />
                        ))}
                    </div>
                )}
            </div>
        );
    };

    const selectedDayEvents = events.filter(e => isSameDay(e.date, selectedDate));

    if (compact) {
        return (
            <div className="flex flex-col h-full bg-slate-50/50 rounded-3xl p-4">
                <div className="flex justify-between items-center mb-4">
                    <h2 className="text-lg font-bold text-slate-800">{currentDate.toLocaleString('default', { month: 'long', year: 'numeric' })}</h2>
                    <div className="flex gap-1">
                        {(userRole === 'HR' || userRole === 'HR_ADMIN') && (
                            <button
                                onClick={() => openScheduleModal(selectedDate.toISOString().split('T')[0])}
                                className="p-1 hover:bg-blue-50 text-blue-600 rounded-lg transition-colors mr-1"
                                title="Quick Schedule"
                            >
                                <Plus size={16} />
                            </button>
                        )}
                        <button onClick={prevMonth} className="p-1 hover:bg-white rounded-lg transition-colors text-slate-500"><ChevronLeft size={16} /></button>
                        <button onClick={nextMonth} className="p-1 hover:bg-white rounded-lg transition-colors text-slate-500"><ChevronRight size={16} /></button>
                    </div>
                </div>

                {/* Compact Days Header */}
                <div className="grid grid-cols-7 mb-2">
                    {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((day, i) => (
                        <div key={i} className="text-center text-[10px] font-bold text-slate-400">
                            {day}
                        </div>
                    ))}
                </div>

                {/* Compact Dates Grid */}
                <div className="grid grid-cols-7 gap-1 flex-1 content-start">
                    {/* Empty Slots */}
                    {Array.from({ length: startDayOffset }).map((_, i) => (
                        <div key={`empty-${i}`} />
                    ))}
                    {/* Days */}
                    {Array.from({ length: daysInMonth }).map((_, i) => renderDay(i + 1))}
                </div>

                <div className="mt-4 pt-4 border-t border-slate-100 flex-1 min-h-0 overflow-y-auto custom-scrollbar space-y-2">
                    <p className="text-xs font-bold text-slate-400 uppercase mb-2">
                        {selectedDate.getDate()} {selectedDate.toLocaleString('default', { month: 'short' })} Activities
                    </p>
                    {selectedDayEvents.length === 0 ? (
                        <p className="text-xs text-slate-400 italic text-center py-2">No activities scheduled.</p>
                    ) : (
                        selectedDayEvents.sort((a, b) => a.time.localeCompare(b.time)).map(ev => (
                            <div key={ev.id} className="flex items-start gap-2 p-2 rounded-lg bg-white border border-slate-100 hover:border-blue-200 transition-colors cursor-pointer group">
                                <div className={`w-1 h-full min-h-[24px] rounded-full shrink-0 ${ev.type === 'INTERNAL' ? 'bg-blue-500' :
                                    ev.type === 'EXTERNAL' ? 'bg-emerald-500' :
                                        ev.type === 'INCENTIVE' ? 'bg-amber-500' : 'bg-rose-500'
                                    }`} />
                                <div className="min-w-0 flex-1">
                                    <p className="text-xs font-bold text-slate-700 truncate group-hover:text-blue-600">{ev.title}</p>
                                    <div className="flex items-center gap-1.5 mt-0.5">
                                        <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded border ${getEventBadgeStyle(ev.type)}`}>
                                            {ev.type === 'INTERNAL' ? 'MEETING' : ev.type}
                                        </span>
                                        <span className="text-[10px] text-slate-400 flex items-center gap-0.5">
                                            <Clock size={10} /> {ev.time}
                                        </span>
                                    </div>
                                </div>
                            </div>
                        ))
                    )}
                </div>
            </div>
        );
    }

    return (
        <div className="grid lg:grid-cols-3 gap-8 h-auto min-h-[600px] animate-fade-in">

            {/* --- Left: Calendar Grid --- */}
            <div className="lg:col-span-2 flex flex-col">
                {/* Header */}
                <div className="flex justify-between items-center mb-8 px-2">
                    <div>
                        <h2 className="text-3xl font-black text-transparent bg-clip-text bg-gradient-to-r from-slate-800 to-slate-600">
                            {currentDate.toLocaleString('default', { month: 'long', year: 'numeric' })}
                        </h2>
                        <p className="text-slate-400 font-medium mt-1">Manage your learning schedule</p>
                    </div>

                    <div className="flex gap-2 bg-white/50 p-1.5 rounded-2xl border border-white/60 shadow-sm backdrop-blur-sm">
                        <button onClick={prevMonth} className="p-2.5 hover:bg-white hover:shadow-md rounded-xl transition-all text-slate-600 hover:text-blue-600">
                            <ChevronLeft size={20} strokeWidth={2.5} />
                        </button>
                        <button onClick={() => setCurrentDate(new Date())} className="px-3 py-1 hover:bg-white hover:shadow-md rounded-xl transition-all text-xs font-bold text-slate-500 hover:text-blue-600">
                            Today
                        </button>
                        <button onClick={nextMonth} className="p-2.5 hover:bg-white hover:shadow-md rounded-xl transition-all text-slate-600 hover:text-blue-600">
                            <ChevronRight size={20} strokeWidth={2.5} />
                        </button>
                    </div>
                </div>

                {/* Days Header */}
                <div className="grid grid-cols-7 mb-4 px-2">
                    {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => (
                        <div key={day} className="text-center text-xs font-bold text-slate-400 uppercase tracking-widest py-2">
                            {day}
                        </div>
                    ))}
                </div>

                {/* Dates Grid */}
                <div className="grid grid-cols-7 gap-3 sm:gap-4 lg:gap-5 flex-1 p-2">
                    {/* Empty Slots */}
                    {Array.from({ length: startDayOffset }).map((_, i) => (
                        <div key={`empty-${i}`} />
                    ))}

                    {/* Days */}
                    {Array.from({ length: daysInMonth }).map((_, i) => renderDay(i + 1))}
                </div>
            </div>

            {/* --- Right: Detail Panel --- */}
            <div className="relative">
                {/* Visual Connector on Desktop */}
                <div className="hidden lg:block absolute top-[10%] -left-4 w-4 h-full border-l-2 border-dashed border-slate-200/60" />

                <div className="h-full bg-white/40 backdrop-blur-md rounded-3xl border border-white/60 p-6 flex flex-col shadow-sm">
                    {/* Selected Date Header */}
                    <div className="mb-8 flex justify-between items-end">
                        <div className="flex-1">
                            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-2 flex items-center gap-2">
                                <CalendarIcon size={14} /> Selected Date
                            </h3>
                            <div className="flex items-baseline gap-2">
                                <span className="text-5xl font-black text-slate-800 tracking-tight">
                                    {selectedDate.getDate()}
                                </span>
                                <span className="text-2xl font-light text-slate-500">
                                    {selectedDate.toLocaleString('default', { month: 'long' })}
                                </span>
                            </div>
                        </div>
                        {(userRole === 'HR' || userRole === 'HR_ADMIN') && (
                            <button
                                onClick={() => openScheduleModal(selectedDate.toISOString().split('T')[0])}
                                className="bg-blue-600 hover:bg-blue-700 text-white p-3 rounded-xl shadow-lg shadow-blue-300 hover:shadow-blue-400 transition-all active:scale-95"
                                title="Add Event"
                            >
                                <Plus size={24} />
                            </button>
                        )}
                    </div>

                    {/* Events List */}
                    <div className="flex-1 overflow-y-auto space-y-4 pr-2 custom-scrollbar">
                        {selectedDayEvents.length === 0 ? (
                            <div className="h-full flex flex-col items-center justify-center text-center p-8 rounded-2xl border-2 border-dashed border-slate-200/60 bg-slate-50/30">
                                <div className="w-16 h-16 rounded-full bg-slate-100 flex items-center justify-center mb-4 text-slate-300">
                                    <Clock size={32} />
                                </div>
                                <p className="text-slate-500 font-medium">No events scheduled</p>
                                <p className="text-slate-400 text-xs mt-1">Enjoy your free time!</p>
                            </div>
                        ) : (
                            selectedDayEvents.map(ev => (
                                <div
                                    key={ev.id}
                                    className="group relative p-4 rounded-2xl bg-white border border-slate-100 shadow-sm hover:shadow-md hover:border-blue-100 transition-all cursor-pointer overflow-hidden"
                                >
                                    {/* Color Indicator Bar */}
                                    <div className={`absolute left-0 top-0 bottom-0 w-1 ${ev.type === 'INTERNAL' ? 'bg-blue-500' :
                                        ev.type === 'INCENTIVE' ? 'bg-amber-500' :
                                            ev.type === 'EXTERNAL' ? 'bg-emerald-500' : 'bg-rose-500'
                                        }`} />

                                    <div className="flex justify-between items-start mb-2 pl-3">
                                        <span className={`text-[10px] font-bold px-2 py-1 rounded-md border ${getEventBadgeStyle(ev.type)}`}>
                                            {ev.type === 'INTERNAL' ? 'MEETING' : ev.type}
                                        </span>
                                        <MoreHorizontal size={16} className="text-slate-300 group-hover:text-slate-500 transition-colors" />
                                    </div>

                                    <div className="pl-3">
                                        <h4 className="font-bold text-slate-800 text-sm mb-1 group-hover:text-blue-700 transition-colors">
                                            {ev.title}
                                        </h4>
                                        <div className="flex items-center gap-2 text-xs text-slate-500 font-medium mb-2">
                                            <Clock size={12} className="text-slate-400" />
                                            {ev.time}
                                        </div>
                                        <p className="text-xs text-slate-500 leading-relaxed bg-slate-50 p-2 rounded-lg mb-2">
                                            {ev.description}
                                        </p>

                                        {/* Meeting Location/Link Details */}
                                        {ev.type === 'INTERNAL' && (
                                            <div className="flex flex-wrap gap-2 text-[10px] mt-2 border-t border-slate-100 pt-2">
                                                {ev.location && (
                                                    <span className="flex items-center gap-1 text-slate-600 font-medium bg-slate-100 px-2 py-1 rounded">
                                                        <MapPin size={10} /> {ev.location}
                                                    </span>
                                                )}
                                                {ev.link && (
                                                    <a href={ev.link} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-white bg-blue-500 hover:bg-blue-600 px-2 py-1 rounded transition-colors font-bold no-underline">
                                                        <Video size={10} /> Join
                                                    </a>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                </div>
            </div>

            {/* Quick Schedule Modal */}
            {isScheduleOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm animate-in fade-in">
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 overflow-hidden">
                        <div className="flex justify-between items-center mb-4 border-b pb-4">
                            <h3 className="font-bold text-lg text-slate-800">Quick Schedule</h3>
                            <button onClick={() => setIsScheduleOpen(false)} className="bg-slate-100 p-1 rounded-full"><X size={16} /></button>
                        </div>
                        <div className="space-y-4">
                            <div>
                                <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Title</label>
                                <input className="w-full border rounded-lg p-2" value={scheduleData.title} onChange={e => setScheduleData({ ...scheduleData, title: e.target.value })} placeholder="Session Title" />
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Date</label>
                                <input type="date" className="w-full border rounded-lg p-2" value={scheduleData.date} onChange={e => setScheduleData({ ...scheduleData, date: e.target.value })} />
                            </div>
                            <div className="grid grid-cols-2 gap-2">
                                <div>
                                    <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Start</label>
                                    <input type="time" className="w-full border rounded-lg p-2" value={scheduleData.startTime} onChange={e => setScheduleData({ ...scheduleData, startTime: e.target.value })} />
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-slate-500 uppercase mb-1">End</label>
                                    <input type="time" className="w-full border rounded-lg p-2" value={scheduleData.endTime} onChange={e => setScheduleData({ ...scheduleData, endTime: e.target.value })} />
                                </div>
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Type</label>
                                <select className="w-full border rounded-lg p-2" value={scheduleData.type} onChange={e => setScheduleData({ ...scheduleData, type: e.target.value as 'Online' | 'Offline' | 'Hybrid' })}>
                                    <option value="Online">Online</option>
                                    <option value="Offline">Offline</option>
                                    <option value="Hybrid">Hybrid</option>
                                </select>
                            </div>
                            <button onClick={handleQuickSchedule} className="w-full py-3 bg-blue-600 text-white font-bold rounded-xl mt-2 hover:bg-blue-700">Schedule Event</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default LMSCalendar;
