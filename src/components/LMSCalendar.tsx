import { useState, useEffect } from 'react';
import { ChevronLeft, ChevronRight, Calendar as CalendarIcon, Clock, MoreHorizontal } from 'lucide-react';
import { API_BASE_URL } from '../config';

interface CalendarEvent {
    id: number;
    title: string;
    type: 'INTERNAL' | 'EXTERNAL' | 'DEADLINE';
    date: number; // Day of month for simplicity in this demo
    time: string;
    description: string;
}

interface LMSCalendarProps {
    compact?: boolean;
    userEmail?: string;
}

const LMSCalendar = ({ compact = false, userEmail }: LMSCalendarProps) => {
    // --- State ---
    const [currentMonth] = useState<string>('January 2026');
    const [selectedDate, setSelectedDate] = useState<number | null>(new Date().getDate());
    const [fetchedEvents, setFetchedEvents] = useState<CalendarEvent[]>([]);

    // --- Mock Data (Static) Removed ---

    // --- Fetch & Merge Events ---
    useEffect(() => {
        const fetchMeetings = async () => {
            try {
                const res = await fetch(`${API_BASE_URL}/api/meetings`);
                const meetings = await res.json();

                // Filter meetings where user is invited OR meetings that are for everyone (no guests specified? optional logic)
                // For now, only show only if invited explicitly.
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const myMeetings = meetings.filter((m: any) =>
                    m.guests?.emails?.includes(userEmail) ||
                    m.host === 'HR Team' // Maybe show all global HR meetings? Let's just stick to invites + host for now.
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                ).map((m: any) => ({
                    id: m.id,
                    title: m.title,
                    type: 'INTERNAL' as const,
                    date: new Date(m.date).getDate(), // Extract Day
                    time: m.time.split('-')[0].trim(), // Take start time
                    description: m.description
                }));

                setFetchedEvents(myMeetings);
            } catch (err) {
                console.error("Calendar fetch error", err);
            }
        };

        if (userEmail) fetchMeetings();
    }, [userEmail]);

    // --- Static Events Removed for Real Data ---
    const events = fetchedEvents;

    // --- Calendar Logic ---
    const daysInMonth = 31;
    const startDayOffset = 4; // Jan 1 2026 is Thursday

    const getEventsForDay = (day: number) => events.filter(e => e.date === day);

    const getEventColor = (type: CalendarEvent['type']) => {
        switch (type) {
            case 'INTERNAL': return 'bg-blue-500 shadow-blue-500/50';
            case 'EXTERNAL': return 'bg-emerald-500 shadow-emerald-500/50';
            case 'DEADLINE': return 'bg-rose-500 shadow-rose-500/50';
            default: return 'bg-slate-400';
        }
    };

    const getEventBadgeStyle = (type: CalendarEvent['type']) => {
        switch (type) {
            case 'INTERNAL': return 'bg-blue-50 text-blue-700 border-blue-200';
            case 'EXTERNAL': return 'bg-emerald-50 text-emerald-700 border-emerald-200';
            case 'DEADLINE': return 'bg-rose-50 text-rose-700 border-rose-200';
            default: return 'bg-slate-50 text-slate-700 border-slate-200';
        }
    };


    // --- Render Helpers ---
    const renderDay = (day: number) => {
        const dayEvents = getEventsForDay(day);
        const isSelected = selectedDate === day;
        const hasEvents = dayEvents.length > 0;
        const isToday = day === new Date().getDate();

        return (
            <div
                key={day}
                onClick={() => setSelectedDate(day)}
                className={`
                    relative aspect-square rounded-2xl transition-all cursor-pointer flex flex-col items-center justify-center gap-1 group
                    ${isSelected
                        ? 'bg-gradient-to-br from-blue-600 to-indigo-600 text-white shadow-xl shadow-blue-500/30 scale-110 z-10'
                        : 'bg-white/60 border border-white/50 text-slate-600 hover:bg-white hover:shadow-lg hover:scale-105 hover:z-10'
                    }
                    ${isToday && !isSelected ? 'ring-2 ring-blue-400 ring-offset-2 ring-offset-slate-50' : ''}
                `}
            >
                <span className={`text-sm font-bold ${isSelected ? 'text-white' : 'text-slate-700'}`}>
                    {day}
                </span>
                {hasEvents && (
                    <div className="flex gap-1">
                        {dayEvents.slice(0, 3).map(ev => (
                            <div
                                key={ev.id}
                                className={`h-1.5 w-1.5 rounded-full ${isSelected ? 'bg-white/80' : getEventColor(ev.type)} shadow-sm`}
                            />
                        ))}
                    </div>
                )}
            </div>
        );
    };

    const selectedEvents = selectedDate ? getEventsForDay(selectedDate) : [];

    if (compact) {
        return (
            <div className="flex flex-col h-full bg-slate-50/50 rounded-3xl p-4">
                {/* Compact Header */}
                <div className="flex justify-between items-center mb-4">
                    <h2 className="text-xl font-bold text-slate-800">{currentMonth}</h2>
                    <div className="flex gap-1">
                        <button className="p-1 hover:bg-white rounded-lg transition-colors text-slate-500"><ChevronLeft size={16} /></button>
                        <button className="p-1 hover:bg-white rounded-lg transition-colors text-slate-500"><ChevronRight size={16} /></button>
                    </div>
                </div>

                {/* Compact Grid */}
                <div className="grid grid-cols-7 mb-2">
                    {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map(day => (
                        <div key={day} className="text-center text-[10px] font-bold text-slate-400 py-1">{day}</div>
                    ))}
                </div>
                <div className="grid grid-cols-7 gap-1">
                    {Array.from({ length: startDayOffset }).map((_, i) => <div key={`empty-${i}`} />)}
                    {Array.from({ length: daysInMonth }).map((_, i) => renderDay(i + 1))}
                </div>

                {/* Compact Event List (Selected Day Only) */}
                <div className="mt-6 flex-1 min-h-[150px]">
                    <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3">Events for {selectedDate} Jan</h3>
                    <div className="space-y-3">
                        {selectedEvents.length === 0 ? (
                            <p className="text-xs text-slate-400 text-center py-4">No events</p>
                        ) : (
                            selectedEvents.map(ev => (
                                <div key={ev.id} className="bg-white p-3 rounded-xl border border-blue-50 shadow-sm flex gap-3 items-start">
                                    <div className={`w-1 self-stretch rounded-full ${ev.type === 'INTERNAL' ? 'bg-blue-500' : ev.type === 'EXTERNAL' ? 'bg-emerald-500' : 'bg-rose-500'}`} />
                                    <div>
                                        <h4 className="text-xs font-bold text-slate-800 line-clamp-1">{ev.title}</h4>
                                        <p className="text-[10px] text-slate-500 mt-0.5">{ev.time}</p>
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="grid lg:grid-cols-3 gap-8 h-auto min-h-[600px]">

            {/* --- Left: Calendar Grid --- */}
            <div className="lg:col-span-2 flex flex-col">
                {/* Header */}
                <div className="flex justify-between items-center mb-8 px-2">
                    <div>
                        <h2 className="text-3xl font-black text-transparent bg-clip-text bg-gradient-to-r from-slate-800 to-slate-600">
                            {currentMonth}
                        </h2>
                        <p className="text-slate-400 font-medium mt-1">Manage your learning schedule</p>
                    </div>

                    <div className="flex gap-2 bg-white/50 p-1.5 rounded-2xl border border-white/60 shadow-sm backdrop-blur-sm">
                        <button className="p-2.5 hover:bg-white hover:shadow-md rounded-xl transition-all text-slate-600 hover:text-blue-600">
                            <ChevronLeft size={20} strokeWidth={2.5} />
                        </button>
                        <button className="p-2.5 hover:bg-white hover:shadow-md rounded-xl transition-all text-slate-600 hover:text-blue-600">
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
                    <div className="mb-8">
                        <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-2 flex items-center gap-2">
                            <CalendarIcon size={14} /> Selected Date
                        </h3>
                        <div className="flex items-baseline gap-2">
                            <span className="text-5xl font-black text-slate-800 tracking-tight">
                                {selectedDate}
                            </span>
                            <span className="text-2xl font-light text-slate-500">
                                January
                            </span>
                        </div>
                    </div>

                    {/* Events List */}
                    <div className="flex-1 overflow-y-auto space-y-4 pr-2 custom-scrollbar">
                        {selectedEvents.length === 0 ? (
                            <div className="h-full flex flex-col items-center justify-center text-center p-8 rounded-2xl border-2 border-dashed border-slate-200/60 bg-slate-50/30">
                                <div className="w-16 h-16 rounded-full bg-slate-100 flex items-center justify-center mb-4 text-slate-300">
                                    <Clock size={32} />
                                </div>
                                <p className="text-slate-500 font-medium">No events scheduled</p>
                                <p className="text-slate-400 text-xs mt-1">Enjoy your free time!</p>
                                <button className="mt-6 px-4 py-2 bg-white text-blue-600 text-xs font-bold rounded-lg border border-blue-100 shadow-sm hover:shadow-md transition-all">
                                    + Add Event
                                </button>
                            </div>
                        ) : (
                            selectedEvents.map(ev => (
                                <div
                                    key={ev.id}
                                    className="group relative p-4 rounded-2xl bg-white border border-slate-100 shadow-sm hover:shadow-md hover:border-blue-100 transition-all cursor-pointer overflow-hidden"
                                >
                                    {/* Color Indicator Bar */}
                                    <div className={`absolute left-0 top-0 bottom-0 w-1 ${ev.type === 'INTERNAL' ? 'bg-blue-500' : ev.type === 'EXTERNAL' ? 'bg-emerald-500' : 'bg-rose-500'}`} />

                                    <div className="flex justify-between items-start mb-2 pl-3">
                                        <span className={`text-[10px] font-bold px-2 py-1 rounded-md border ${getEventBadgeStyle(ev.type)}`}>
                                            {ev.type}
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
                                        <p className="text-xs text-slate-500 leading-relaxed bg-slate-50 p-2 rounded-lg">
                                            {ev.description}
                                        </p>
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default LMSCalendar;
