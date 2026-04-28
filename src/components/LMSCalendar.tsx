import { useState, useEffect, useCallback } from 'react';
import { ChevronLeft, ChevronRight, Calendar as CalendarIcon, Clock, MoreHorizontal, MapPin, Video, Plus, X, ArrowUpRight } from 'lucide-react';
import { API_BASE_URL } from '../config';
import type { Role, Meeting, Incentive, TrainingRequest } from '../types';

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
            meetings.forEach((m: Meeting) => {
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

            // 2. Process External Training
            if (isHR) {
                training.forEach((t: TrainingRequest) => {
                    if (t.status === 'APPROVED') {
                        loadedEvents.push({
                            id: t.id,
                            title: `Training: ${t.title} (${t.employeeName})`,
                            type: 'EXTERNAL',
                            date: new Date(t.date),
                            time: 'All Day',
                            description: `Provider: ${t.vendor}. Justification: ${t.justification}`
                        });
                    }
                });
            } else if (userEmail) {
                training.forEach((t: TrainingRequest) => {
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
            incentives.forEach((inc: Incentive) => {
                if (isHR && inc.status === 'Active') {
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
                location: scheduleData.type === 'Online' ? 'Online Link Pending' : 'TBD',
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
            fetchEvents();
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
            case 'INTERNAL': return 'bg-blue-600 shadow-blue-500/50';
            case 'EXTERNAL': return 'bg-emerald-600 shadow-emerald-500/50';
            case 'DEADLINE': return 'bg-rose-600 shadow-rose-500/50';
            case 'INCENTIVE': return 'bg-amber-600 shadow-amber-500/50';
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
                    relative rounded-[20px] transition-all duration-300 cursor-pointer flex flex-col items-center justify-center group
                    ${compact ? 'aspect-square gap-0.5' : 'h-12 md:h-16 gap-0.5'}
                    ${isSelected
                        ? 'bg-slate-900 text-white shadow-2xl shadow-slate-900/40 scale-105 z-10'
                        : 'bg-white border border-slate-100 text-slate-600 hover:bg-slate-50 hover:border-slate-200 hover:shadow-xl'
                    }
                    ${isToday && !isSelected ? 'ring-2 ring-indigo-500 ring-offset-2' : ''}
                `}
            >
                <span className={`${compact ? 'text-xs' : 'text-base'} font-black ${isSelected ? 'text-white' : 'text-slate-700'}`}>
                    {day}
                </span>
                {hasEvents && (
                    <div className="flex gap-1">
                        {dayEvents.slice(0, compact ? 2 : 3).map(ev => (
                            <div
                                key={ev.id}
                                className={`${compact ? 'h-1 w-1' : 'h-1.5 w-1.5'} rounded-full ${isSelected ? 'bg-white/80' : getEventColor(ev.type)}`}
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
            <div className="flex flex-col h-full bg-white rounded-[32px] p-5 shadow-sm border border-slate-100">
                <div className="flex justify-between items-center mb-6">
                    <div>
                        <h2 className="text-xl font-black text-slate-800">{currentDate.toLocaleString('default', { month: 'long' })}</h2>
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{currentDate.getFullYear()}</p>
                    </div>
                    <div className="flex gap-1.5">
                        <button onClick={prevMonth} className="p-2 hover:bg-slate-100 rounded-xl transition-all text-slate-400 hover:text-slate-800"><ChevronLeft size={16} /></button>
                        <button onClick={nextMonth} className="p-2 hover:bg-slate-100 rounded-xl transition-all text-slate-400 hover:text-slate-800"><ChevronRight size={16} /></button>
                    </div>
                </div>

                <div className="grid grid-cols-7 mb-3">
                    {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((day, i) => (
                        <div key={i} className="text-center text-[10px] font-black text-slate-300 uppercase">
                            {day}
                        </div>
                    ))}
                </div>

                <div className="grid grid-cols-7 gap-1.5 flex-1 content-start">
                    {Array.from({ length: startDayOffset }).map((_, i) => (
                        <div key={`empty-${i}`} />
                    ))}
                    {Array.from({ length: daysInMonth }).map((_, i) => renderDay(i + 1))}
                </div>

                <div className="mt-6 pt-5 border-t border-slate-50 flex-1 min-h-0 overflow-y-auto custom-scrollbar space-y-3">
                    <div className="flex justify-between items-center mb-1">
                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                            Agenda • {selectedDate.getDate()} {selectedDate.toLocaleString('default', { month: 'short' })}
                        </p>
                        {selectedDayEvents.length > 0 && <span className="text-[10px] font-bold text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-full">{selectedDayEvents.length} Tasks</span>}
                    </div>
                    {selectedDayEvents.length === 0 ? (
                        <div className="py-8 text-center">
                            <p className="text-xs text-slate-400 italic">No events scheduled.</p>
                        </div>
                    ) : (
                        selectedDayEvents.sort((a, b) => a.time.localeCompare(b.time)).map(ev => (
                            <div key={ev.id} className="group flex items-start gap-3 p-3 rounded-2xl bg-slate-50/50 border border-transparent hover:border-slate-200 hover:bg-white transition-all cursor-pointer">
                                <div className={`w-1 h-8 rounded-full shrink-0 mt-0.5 ${getEventColor(ev.type)}`} />
                                <div className="min-w-0 flex-1">
                                    <p className="text-xs font-bold text-slate-800 truncate group-hover:text-indigo-600">{ev.title}</p>
                                    <div className="flex items-center gap-2 mt-1">
                                        <span className="text-[9px] font-black text-slate-400 flex items-center gap-1">
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
        <div className="grid lg:grid-cols-12 gap-6 h-full lg:h-[calc(100vh-180px)] animate-fade-in px-4 overflow-hidden">

            {/* --- Left: Calendar Grid --- */}
            <div className="lg:col-span-8 flex flex-col h-full overflow-hidden">
                {/* Header */}
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 mb-6">
                    <div>
                        <h2 className="text-4xl font-black text-slate-900 tracking-tight flex items-center gap-4">
                            {currentDate.toLocaleString('default', { month: 'long', year: 'numeric' })}
                            <div className="h-2 w-2 rounded-full bg-indigo-600 animate-pulse"></div>
                        </h2>
                        <p className="text-slate-400 font-bold uppercase tracking-[0.2em] text-[10px] mt-2">Nusa Learning Management System • Schedule</p>
                    </div>

                    <div className="flex items-center gap-3 bg-slate-100/80 p-2 rounded-[24px] border border-slate-200">
                        <button onClick={prevMonth} className="p-3 hover:bg-white hover:shadow-sm rounded-[18px] transition-all text-slate-500 hover:text-slate-900">
                            <ChevronLeft size={20} strokeWidth={3} />
                        </button>
                        <button onClick={() => setCurrentDate(new Date())} className="px-6 py-2 bg-white shadow-sm rounded-[18px] text-xs font-black text-slate-800 hover:bg-indigo-600 hover:text-white transition-all">
                            Today
                        </button>
                        <button onClick={nextMonth} className="p-3 hover:bg-white hover:shadow-sm rounded-[18px] transition-all text-slate-500 hover:text-slate-900">
                            <ChevronRight size={20} strokeWidth={3} />
                        </button>
                    </div>
                </div>

                {/* Days Header */}
                <div className="grid grid-cols-7 mb-4">
                    {['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'].map(day => (
                        <div key={day} className="text-center text-[11px] font-black text-slate-300 uppercase tracking-widest">
                            {day.substring(0, 3)}
                        </div>
                    ))}
                </div>

                {/* Dates Grid */}
                <div className="grid grid-cols-7 gap-2 flex-1">
                    {Array.from({ length: startDayOffset }).map((_, i) => (
                        <div key={`empty-${i}`} className="aspect-square opacity-20 border-b border-r border-slate-100" />
                    ))}
                    {Array.from({ length: daysInMonth }).map((_, i) => renderDay(i + 1))}
                </div>
            </div>

            {/* --- Right: Detail Panel --- */}
            <div className="lg:col-span-4 flex flex-col h-full overflow-hidden">
                <div className="flex-1 bg-slate-50 rounded-[40px] border border-slate-200 p-8 flex flex-col shadow-inner relative overflow-hidden h-full">
                    {/* Decorative Element */}
                    <div className="absolute -top-20 -right-20 w-60 h-60 bg-indigo-100/50 rounded-full blur-3xl" />
                    
                    <div className="relative z-10 flex flex-col h-full">
                        {/* Date Header */}
                        <div className="flex justify-between items-start mb-10">
                            <div>
                                <h3 className="text-[11px] font-black text-indigo-600 uppercase tracking-[0.2em] mb-4">Event Details</h3>
                                <div className="flex items-center gap-4">
                                    <div className="w-16 h-16 bg-slate-900 rounded-[22px] flex flex-col items-center justify-center text-white shadow-xl shadow-slate-900/20">
                                        <span className="text-2xl font-black">{selectedDate.getDate()}</span>
                                        <span className="text-[9px] font-bold uppercase">{selectedDate.toLocaleString('default', { month: 'short' })}</span>
                                    </div>
                                    <div>
                                        <h4 className="text-xl font-black text-slate-800 leading-tight">
                                            {selectedDate.toLocaleDateString('en-US', { weekday: 'long' })}
                                        </h4>
                                        <p className="text-slate-400 font-bold text-xs">{selectedDate.toLocaleDateString('en-US', { year: 'numeric' })}</p>
                                    </div>
                                </div>
                            </div>
                            {(userRole === 'HR' || userRole === 'HR_ADMIN') && (
                                <button
                                    onClick={() => openScheduleModal(selectedDate.toISOString().split('T')[0])}
                                    className="bg-slate-900 hover:bg-indigo-600 text-white p-4 rounded-[20px] shadow-xl transition-all hover:-translate-y-1 active:translate-y-0"
                                >
                                    <Plus size={24} />
                                </button>
                            )}
                        </div>

                        {/* Events Content */}
                        <div className="flex-1 overflow-y-auto space-y-5 pr-2 custom-scrollbar">
                            {selectedDayEvents.length === 0 ? (
                                <div className="h-full flex flex-col items-center justify-center text-center py-12 px-6">
                                    <div className="w-20 h-20 rounded-[28px] bg-white shadow-sm flex items-center justify-center mb-6 text-slate-200">
                                        <CalendarIcon size={36} />
                                    </div>
                                    <h5 className="text-slate-800 font-black text-lg">Clear Schedule</h5>
                                    <p className="text-slate-400 text-sm mt-2 max-w-[200px]">No events or deadlines for this specific date.</p>
                                </div>
                            ) : (
                                selectedDayEvents.map(ev => (
                                    <div
                                        key={ev.id}
                                        className="group relative p-6 rounded-[32px] bg-white border border-slate-100 shadow-sm hover:shadow-xl hover:border-indigo-100 transition-all duration-300"
                                    >
                                        <div className="flex justify-between items-start mb-4">
                                            <span className={`text-[9px] font-black px-3 py-1 rounded-full border tracking-widest ${getEventBadgeStyle(ev.type)}`}>
                                                {ev.type === 'INTERNAL' ? 'MEETING' : ev.type}
                                            </span>
                                            <MoreHorizontal size={18} className="text-slate-300 cursor-pointer hover:text-slate-900 transition-colors" />
                                        </div>

                                        <h4 className="font-black text-slate-800 text-base mb-3 leading-snug group-hover:text-indigo-600 transition-colors">
                                            {ev.title}
                                        </h4>
                                        
                                        <div className="flex items-center gap-4 text-xs text-slate-500 font-bold mb-4">
                                            <div className="flex items-center gap-1.5 bg-slate-50 px-3 py-1.5 rounded-xl">
                                                <Clock size={14} className="text-indigo-500" />
                                                {ev.time}
                                            </div>
                                            {ev.location && (
                                                <div className="flex items-center gap-1.5 bg-slate-50 px-3 py-1.5 rounded-xl truncate max-w-[120px]">
                                                    <MapPin size={14} className="text-rose-500" />
                                                    {ev.location}
                                                </div>
                                            )}
                                        </div>

                                        <p className="text-xs text-slate-500 leading-relaxed italic border-l-2 border-slate-100 pl-4 mb-5">
                                            {ev.description}
                                        </p>

                                        {ev.link && (
                                            <a 
                                                href={ev.link} 
                                                target="_blank" 
                                                rel="noreferrer" 
                                                className="w-full py-3.5 bg-slate-900 text-white rounded-2xl font-black text-xs flex items-center justify-center gap-2 transition-all hover:bg-indigo-600 hover:shadow-lg hover:shadow-indigo-200"
                                            >
                                                <Video size={16} /> JOIN MEETING <ArrowUpRight size={14} />
                                            </a>
                                        )}
                                    </div>
                                ))
                            )}
                        </div>
                    </div>
                </div>
            </div>

            {/* Quick Schedule Modal */}
            {isScheduleOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-md animate-in fade-in">
                    <div className="bg-white rounded-[40px] shadow-2xl w-full max-w-md p-10 overflow-hidden relative">
                        <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-50 rounded-bl-[100px] -mr-10 -mt-10 z-0"></div>
                        
                        <div className="relative z-10">
                            <div className="flex justify-between items-center mb-8">
                                <h3 className="font-black text-2xl text-slate-800 tracking-tight">New Schedule</h3>
                                <button onClick={() => setIsScheduleOpen(false)} className="bg-slate-100 hover:bg-rose-50 hover:text-rose-500 p-2.5 rounded-2xl transition-all"><X size={20} /></button>
                            </div>
                            
                            <div className="space-y-6">
                                <div>
                                    <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Event Title</label>
                                    <input className="w-full bg-slate-50 border border-slate-100 rounded-2xl p-4 font-bold text-slate-800 focus:bg-white focus:ring-2 focus:ring-indigo-500 outline-none transition-all" value={scheduleData.title} onChange={e => setScheduleData({ ...scheduleData, title: e.target.value })} placeholder="e.g. Project Sync Up" />
                                </div>
                                
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Date</label>
                                        <input type="date" className="w-full bg-slate-50 border border-slate-100 rounded-2xl p-4 font-bold text-slate-800 outline-none focus:bg-white" value={scheduleData.date} onChange={e => setScheduleData({ ...scheduleData, date: e.target.value })} />
                                    </div>
                                    <div>
                                        <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Platform</label>
                                        <select className="w-full bg-slate-50 border border-slate-100 rounded-2xl p-4 font-bold text-slate-800 outline-none focus:bg-white appearance-none" value={scheduleData.type} onChange={e => setScheduleData({ ...scheduleData, type: e.target.value as 'Online' | 'Offline' | 'Hybrid' })}>
                                            <option value="Online">Online Link</option>
                                            <option value="Offline">Offline / Room</option>
                                            <option value="Hybrid">Hybrid Session</option>
                                        </select>
                                    </div>
                                </div>
                                
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Start Time</label>
                                        <input type="time" className="w-full bg-slate-50 border border-slate-100 rounded-2xl p-4 font-bold text-slate-800 outline-none focus:bg-white" value={scheduleData.startTime} onChange={e => setScheduleData({ ...scheduleData, startTime: e.target.value })} />
                                    </div>
                                    <div>
                                        <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">End Time</label>
                                        <input type="time" className="w-full bg-slate-50 border border-slate-100 rounded-2xl p-4 font-bold text-slate-800 outline-none focus:bg-white" value={scheduleData.endTime} onChange={e => setScheduleData({ ...scheduleData, endTime: e.target.value })} />
                                    </div>
                                </div>
                                
                                <button onClick={handleQuickSchedule} className="w-full py-5 bg-slate-900 hover:bg-indigo-600 text-white font-black rounded-3xl shadow-2xl shadow-slate-900/20 transition-all transform active:scale-95 mt-4 tracking-widest text-xs">
                                    CONFIRM SCHEDULE
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default LMSCalendar;
