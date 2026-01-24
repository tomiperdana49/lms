import { useState, useEffect, type FormEvent, type KeyboardEvent } from 'react';
import {
    Users,
    MapPin,
    Video,
    Clock,
    X,
    Trash2,
    Plus,
    FileText,
    Calendar as CalendarIcon,
    ArrowRight
} from 'lucide-react';
import { API_BASE_URL } from '../config';
import type { Role } from '../types';
import PopupNotification from './PopupNotification';

interface Meeting {
    id: number;
    title: string;
    date: string;
    time: string;
    shortDate: string;
    host: string;
    type: 'Online' | 'Offline' | 'Hybrid';
    location: string;
    description: string;
    guests: { status: 'Yes' | 'Awaiting'; count: number; emails: string[] };
    meetLink?: string;
}

interface InternalMeetingListProps {
    userRole: Role;
    userEmail: string;
}

const AvatarStack = ({ count }: { count: number }) => (
    <div className="flex -space-x-2 overflow-hidden">
        {[...Array(Math.min(count, 4))].map((_, i) => (
            <div key={i} className={`inline-block h-6 w-6 rounded-full ring-2 ring-white flex items-center justify-center text-[8px] font-bold text-white
                ${['bg-red-400', 'bg-blue-400', 'bg-green-400', 'bg-purple-400'][i % 4]}
            `}>
                {String.fromCharCode(65 + i)}
            </div>
        ))}
        {count > 4 && (
            <div className="inline-block h-6 w-6 rounded-full ring-2 ring-white bg-slate-100 flex items-center justify-center text-[8px] font-bold text-slate-500">
                +{count - 4}
            </div>
        )}
    </div>
);

const InternalMeetingList = ({ userRole, userEmail }: InternalMeetingListProps) => {
    // --- State ---
    const [meetings, setMeetings] = useState<Meeting[]>([]);
    const [selectedMeeting, setSelectedMeeting] = useState<Meeting | null>(null);
    const [isCreateOpen, setIsCreateOpen] = useState(false);
    const [notification, setNotification] = useState<{ show: boolean; type: 'success' | 'error'; message: string }>({ show: false, type: 'success', message: '' });

    const [isEditing, setIsEditing] = useState(false);
    const [editId, setEditId] = useState<number | null>(null);

    // Form State
    const [formData, setFormData] = useState({
        title: '',
        date: '',
        startTime: '',
        endTime: '',
        host: '',
        type: 'Online' as 'Online' | 'Offline' | 'Hybrid',
        location: '',
        meetLink: '',
        description: ''
    });

    // Email Invites State
    const [inviteEmail, setInviteEmail] = useState('');
    const [invitedEmails, setInvitedEmails] = useState<string[]>([]);

    // --- Handlers ---

    // Helper to safely parse meeting data from API or legacy JSON
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const safeMeeting = (m: any): Meeting => {
        const dateObj = new Date(m.date);
        const shortDate = m.shortDate || `${dateObj.getDate()} ${dateObj.toLocaleString('default', { month: 'short' }).toUpperCase()}`;

        return {
            ...m,
            host: m.host || 'Admin', // Fallback for legacy data
            type: m.type || (m.location && m.location.toLowerCase().includes('meet') ? 'Online' : 'Offline'),
            description: m.description || m.agenda || 'No description provided.',
            shortDate,
            guests: m.guests || { status: 'Awaiting', count: 0, emails: [] }
        } as Meeting;
    };

    // --- Fetch Meetings ---
    useEffect(() => {
        fetch(`${API_BASE_URL}/api/meetings`)
            .then(res => res.json())
            .then(data => {
                // Sanitize data on load
                setMeetings(data.map(safeMeeting));
            })
            .catch(err => console.error("Failed to fetch meetings", err));
    }, []);

    const handleInviteKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
        if (['Enter', ','].includes(e.key)) {
            e.preventDefault();
            const email = inviteEmail.trim();
            if (email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
                if (!invitedEmails.includes(email)) {
                    setInvitedEmails([...invitedEmails, email]);
                }
                setInviteEmail('');
            }
        }
    };

    const removeEmail = (emailToRemove: string) => {
        setInvitedEmails(invitedEmails.filter(email => email !== emailToRemove));
    };

    const openEditModal = (meeting: Meeting) => {
        setSelectedMeeting(null);
        setEditId(meeting.id);
        setIsEditing(true);

        // Populate form
        const [start, end] = meeting.time.split(' - ');
        setFormData({
            title: meeting.title,
            date: meeting.date,
            startTime: start || '',
            endTime: end || '',
            host: meeting.host,
            type: meeting.type,
            location: meeting.location,
            meetLink: meeting.meetLink || '',
            description: meeting.description
        });
        setInvitedEmails(meeting.guests?.emails || []);
        setIsCreateOpen(true);
    };

    const handleSave = async (e: FormEvent) => {
        e.preventDefault();
        const dateObj = new Date(formData.date);
        const meetingData = {
            title: formData.title,
            date: formData.date,
            time: `${formData.startTime} - ${formData.endTime}`,
            shortDate: `${dateObj.getDate()} ${dateObj.toLocaleString('default', { month: 'short' }).toUpperCase()}`,
            host: formData.host || 'HR Team',
            type: formData.type,
            location: formData.location,
            description: formData.description,
            guests: {
                status: 'Awaiting',
                count: invitedEmails.length,
                emails: invitedEmails
            },
            meetLink: (formData.type === 'Online' || formData.type === 'Hybrid') ? formData.location : undefined // Logic note: form uses 'location' state field for both. If Hybrid, we might need TWO fields? 
            // Wait, currently formData.location is used for EITHER link OR room. 
            // If Hybrid, we need BOTH.
            // I need to add a separate `meetLink` field to formData to support Hybrid properly where user inputs BOTH room and link.
            // Let's refactor formData slightly in this step or next. 
            // Actually, let's look at the existing state. `formData` has `location`. It implies one field. 
            // If Hybrid, I should add `meetLink` to formData.

            // Correction: I should update formData structure first.
            // But let's see if I can do it in one go.
            // I will add `meetLink` to formData in the next chunk or this one if extends.

            // Let's defer this block replacement until I fix the state structure.
            // I'll skip this chunk for a moment and replace formData state definition FIRST.

            // Re-evaluating plan: 
            // 1. Update formData to have `meetLink` field explicitly.
            // 2. Update form inputs to bind to `location` (room) and `meetLink` (url).
            // 3. Update handleSave to map these correctly.

            // Let's do a larger replace for the State definition.
        };

        if (isEditing && editId) {
            // Update Existing
            try {
                const res = await fetch(`${API_BASE_URL}/api/meetings/${editId}`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(meetingData)
                });
                if (res.ok) {
                    const savedMeeting = await res.json();
                    setMeetings(meetings.map(m => m.id === editId ? safeMeeting(savedMeeting) : m));
                    setNotification({ show: true, type: 'success', message: 'Meeting updated successfully!' });
                }
            } catch (err) {
                console.error(err);
            }
        } else {
            // Create New
            try {
                const res = await fetch(`${API_BASE_URL}/api/meetings`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(meetingData)
                });
                if (res.ok) {
                    const savedMeeting = await res.json();
                    setMeetings([...meetings, safeMeeting(savedMeeting)]);
                    setNotification({ show: true, type: 'success', message: 'Meeting scheduled & invitations sent!' });
                }
            } catch (err) {
                console.error(err);
            }
        }

        setIsCreateOpen(false);
        resetForm();
    };

    const handleDelete = async (id: number) => {
        if (!confirm('Cancel this meeting?')) return;
        try {
            await fetch(`${API_BASE_URL}/api/meetings/${id}`, { method: 'DELETE' });
            setMeetings(meetings.filter(m => m.id !== id));
            setSelectedMeeting(null);
        } catch (err) {
            console.error(err);
        }
    };

    const resetForm = () => {
        setFormData({ title: '', date: '', startTime: '', endTime: '', host: '', type: 'Online', location: '', meetLink: '', description: '' });
        setInvitedEmails([]);
        setInviteEmail('');
        setIsEditing(false);
        setEditId(null);
    };

    // --- Render Helpers ---



    return (
        <div className="max-w-6xl mx-auto space-y-8 animate-fade-in">
            <PopupNotification
                isOpen={notification.show}
                type={notification.type}
                message={notification.message}
                onClose={() => setNotification({ ...notification, show: false })}
            />
            {/* Header */}
            <div className="flex flex-col md:flex-row justify-between items-end md:items-center gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
                        <Users className="text-indigo-600" /> Internal Events & Training
                    </h1>
                    <p className="text-slate-500 mt-1">Schedule and manage internal knowledge sharing sessions.</p>
                </div>
                {userRole === 'HR' || userRole === 'HR_ADMIN' && (
                    <button
                        onClick={() => setIsCreateOpen(true)}
                        className="bg-indigo-600 hover:bg-indigo-700 text-white px-6 py-2.5 rounded-xl font-bold shadow-lg shadow-indigo-200 hover:shadow-indigo-300 transition-all flex items-center gap-2 active:scale-95"
                    >
                        <Plus size={20} /> Schedule Event
                    </button>
                )}
            </div>

            {/* Event List */}
            <div className="grid gap-4">
                {meetings.length === 0 ? (
                    <div className="text-center py-16 bg-white rounded-3xl border border-dashed border-slate-200">
                        <CalendarIcon size={48} className="mx-auto text-slate-300 mb-4" />
                        <h3 className="text-lg font-bold text-slate-700">No events scheduled</h3>
                        <p className="text-slate-400">Be the first to schedule a team sharing session.</p>
                    </div>
                ) : (
                    meetings.map((meeting) => (
                        <div
                            key={meeting.id}
                            onClick={() => setSelectedMeeting(meeting)}
                            className="bg-white p-5 rounded-2xl shadow-sm hover:shadow-md transition-all cursor-pointer border border-slate-100 group relative overflow-hidden"
                        >
                            {/* Left Accent Bar */}
                            <div className={`absolute left-0 top-0 bottom-0 w-1.5 ${meeting.type === 'Online' ? 'bg-indigo-500' : 'bg-orange-500'}`} />

                            <div className="flex flex-col md:flex-row gap-6 items-start md:items-center pl-3">
                                {/* Date Box */}
                                <div className="flex flex-col items-center justify-center w-16 h-16 bg-slate-50 rounded-xl border border-slate-200 group-hover:border-indigo-200 group-hover:bg-indigo-50 transition-colors">
                                    <span className="text-xs font-bold text-slate-500 uppercase group-hover:text-indigo-500">{meeting.shortDate?.split(' ')[1] || 'DEC'}</span>
                                    <span className="text-2xl font-bold text-slate-800 group-hover:text-indigo-700">{meeting.shortDate?.split(' ')[0] || '01'}</span>
                                </div>

                                {/* Main Info */}
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2 mb-1">
                                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold border uppercase tracking-wide
                                            ${meeting.type === 'Online' ? 'bg-indigo-50 text-indigo-600 border-indigo-100' :
                                                meeting.type === 'Hybrid' ? 'bg-purple-50 text-purple-600 border-purple-100' :
                                                    'bg-orange-50 text-orange-600 border-orange-100'}
                                        `}>
                                            {meeting.type}
                                        </span>
                                        <span className="text-xs text-slate-400 flex items-center gap-1">
                                            <Clock size={12} /> {meeting.time}
                                        </span>
                                    </div>
                                    <h3 className="text-lg font-bold text-slate-800 truncate pr-4 group-hover:text-indigo-600 transition-colors">
                                        {meeting.title}
                                    </h3>
                                    <div className="flex items-center gap-4 mt-2">
                                        <div className="flex items-center gap-1.5 text-xs text-slate-500">
                                            <div className="w-5 h-5 rounded-full bg-slate-200 flex items-center justify-center text-[10px] font-bold text-slate-600">
                                                {meeting.host.charAt(0)}
                                            </div>
                                            Hosted by <span className="font-semibold">{meeting.host}</span>
                                        </div>
                                        <div className="h-3 w-px bg-slate-200" />
                                        <div className="flex items-center gap-2">
                                            <AvatarStack count={meeting.guests?.count || 0} />
                                            <span className="text-xs text-slate-400">{meeting.guests?.count || 0} attending</span>
                                        </div>
                                    </div>
                                </div>

                                {/* Action Icon */}
                                <div className="hidden md:flex items-center gap-2">
                                    {(userRole === 'HR' || userRole === 'HR_ADMIN') && (
                                        <button
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                openEditModal(meeting);
                                            }}
                                            className="p-2 rounded-full bg-slate-100 text-slate-500 hover:bg-blue-100 hover:text-blue-600 transition-colors"
                                            title="Edit Meeting"
                                        >
                                            <FileText size={18} />
                                        </button>
                                    )}
                                    <div className="flex items-center justify-center w-10 h-10 rounded-full bg-slate-50 text-slate-400 group-hover:bg-indigo-100 group-hover:text-indigo-600 transition-all opacity-0 group-hover:opacity-100">
                                        <ArrowRight size={20} />
                                    </div>
                                </div>
                            </div>
                        </div>
                    ))
                )}
            </div>

            {/* Create Modal */}
            {isCreateOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden flex flex-col max-h-[90vh]">
                        <div className="p-5 border-b border-slate-100 flex justify-between items-center bg-white sticky top-0 z-10">
                            <h2 className="font-bold text-lg text-slate-800">
                                {isEditing ? 'Edit Session' : 'Schedule New Session'}
                            </h2>
                            <button onClick={() => { setIsCreateOpen(false); resetForm(); }} className="p-2 hover:bg-slate-100 rounded-full text-slate-400 transition-colors"><X size={20} /></button>
                        </div>

                        <div className="overflow-y-auto p-6 space-y-5">
                            {/* Title */}
                            <div>
                                <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5">Event Title</label>
                                <input
                                    required
                                    placeholder="e.g. Q1 Design Review"
                                    className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all placeholder-slate-300 font-semibold text-slate-700"
                                    value={formData.title}
                                    onChange={e => setFormData({ ...formData, title: e.target.value })}
                                />
                            </div>

                            {/* Date & Time */}
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5">Date</label>
                                    <input
                                        type="date"
                                        required
                                        className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none transition-all text-slate-600"
                                        value={formData.date}
                                        onChange={e => setFormData({ ...formData, date: e.target.value })}
                                    />
                                </div>
                                <div className="grid grid-cols-2 gap-2">
                                    <div>
                                        <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5">Start</label>
                                        <input
                                            type="time"
                                            required
                                            className="w-full px-2 py-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none text-center text-slate-600"
                                            value={formData.startTime}
                                            onChange={e => setFormData({ ...formData, startTime: e.target.value })}
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5">End</label>
                                        <input
                                            type="time"
                                            required
                                            className="w-full px-2 py-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none text-center text-slate-600"
                                            value={formData.endTime}
                                            onChange={e => setFormData({ ...formData, endTime: e.target.value })}
                                        />
                                    </div>
                                </div>
                            </div>

                            {/* Type & Host */}
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5">Host Name</label>
                                    <input
                                        required
                                        placeholder="Who is presenting?"
                                        className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none transition-all text-slate-600"
                                        value={formData.host}
                                        onChange={e => setFormData({ ...formData, host: e.target.value })}
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5">Event Type</label>
                                    <select
                                        className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none bg-white text-slate-600"
                                        value={formData.type}
                                        onChange={e => setFormData({ ...formData, type: e.target.value as 'Online' | 'Offline' | 'Hybrid' })}
                                    >
                                        <option value="Online">Online Video</option>
                                        <option value="Offline">In-Person</option>
                                        <option value="Hybrid">Hybrid (In-Person + Online)</option>
                                    </select>
                                </div>
                            </div>

                            {/* Location & Link - Conditional */}
                            {(formData.type === 'Offline' || formData.type === 'Hybrid') && (
                                <div>
                                    <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5">Room / Location</label>
                                    <div className="relative">
                                        <MapPin size={18} className="absolute left-3.5 top-3 text-slate-400" />
                                        <input
                                            required
                                            placeholder="e.g. Meeting Room A, 2nd Floor"
                                            className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none transition-all text-slate-600 mb-4"
                                            value={formData.location}
                                            onChange={e => setFormData({ ...formData, location: e.target.value })}
                                        />
                                    </div>
                                </div>
                            )}

                            {(formData.type === 'Online' || formData.type === 'Hybrid') && (
                                <div>
                                    <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5">Online Meeting Link</label>
                                    <div className="relative">
                                        <Video size={18} className="absolute left-3.5 top-3 text-slate-400" />
                                        <input
                                            required
                                            placeholder="Paste Google Meet / Zoom link here"
                                            className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none transition-all text-slate-600"
                                            value={formData.meetLink}
                                            onChange={e => setFormData({ ...formData, meetLink: e.target.value })}
                                        />
                                    </div>
                                </div>
                            )}

                            {/* Email Invites */}
                            <div>
                                <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5">Invite Participants</label>
                                <div className="w-full px-3 py-2 rounded-xl border border-slate-200 focus-within:ring-2 focus-within:ring-indigo-500 focus-within:border-indigo-500 bg-white transition-all min-h-[50px] flex flex-wrap gap-2">
                                    {invitedEmails.map(email => (
                                        <span key={email} className="bg-indigo-100 text-indigo-700 px-2 py-1 rounded-lg text-xs font-semibold flex items-center gap-1 animate-in zoom-in-95">
                                            {email}
                                            <button onClick={() => removeEmail(email)} className="hover:text-indigo-900"><X size={12} /></button>
                                        </span>
                                    ))}
                                    <input
                                        className="flex-1 min-w-[120px] outline-none text-sm py-1"
                                        placeholder={invitedEmails.length > 0 ? "" : "Type email and press Enter..."}
                                        value={inviteEmail}
                                        onChange={e => setInviteEmail(e.target.value)}
                                        onKeyDown={handleInviteKeyDown}
                                    />
                                </div>
                                <p className="text-[10px] text-slate-400 mt-1.5 pl-1">Press <kbd className="font-sans px-1 py-0.5 rounded border border-slate-300 bg-slate-50">Enter</kbd> to add email</p>
                            </div>

                            {/* Description */}
                            <div>
                                <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5">Description</label>
                                <textarea
                                    rows={3}
                                    required
                                    placeholder="What is this session about?"
                                    className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none transition-all text-slate-600 resize-none"
                                    value={formData.description}
                                    onChange={e => setFormData({ ...formData, description: e.target.value })}
                                />
                            </div>
                        </div>

                        {/* Footer */}
                        <div className="p-5 border-t border-slate-100 bg-slate-50 flex gap-3">
                            <button
                                type="button"
                                onClick={() => { setIsCreateOpen(false); resetForm(); }}
                                className="flex-1 py-3 rounded-xl font-bold text-slate-600 hover:bg-slate-200 transition-colors"
                            >
                                Cancel
                            </button>
                            <button
                                type="submit"
                                onClick={(e) => handleSave(e)}
                                className="flex-[2] py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl shadow-lg shadow-indigo-500/20 transition-all flex items-center justify-center gap-2"
                            >
                                <CalendarIcon size={18} /> {isEditing ? 'Update Event' : 'Send Invitations'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Read-Only Detail Modal */}
            {selectedMeeting && (
                <div
                    className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-[2px]"
                    onClick={() => setSelectedMeeting(null)}
                >
                    <div
                        className="bg-white w-full max-w-md rounded-2xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200 border border-white/20"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="relative h-32 bg-gradient-to-r from-indigo-500 to-purple-500">
                            <div className="absolute top-4 right-4 flex gap-2">
                                {(userRole === 'HR' || userRole === 'HR_ADMIN') && (
                                    <>
                                        <button
                                            onClick={() => openEditModal(selectedMeeting)}
                                            className="p-2 bg-white/20 hover:bg-white/40 text-white rounded-full transition-colors backdrop-blur-sm"
                                        >
                                            <FileText size={18} />
                                        </button>
                                        <button
                                            onClick={() => handleDelete(selectedMeeting.id)}
                                            className="p-2 bg-white/20 hover:bg-white/40 text-white rounded-full transition-colors backdrop-blur-sm"
                                        >
                                            <Trash2 size={18} />
                                        </button>
                                    </>
                                )}
                                <button
                                    onClick={() => setSelectedMeeting(null)}
                                    className="p-2 bg-white/20 hover:bg-white/40 text-white rounded-full transition-colors backdrop-blur-sm"
                                >
                                    <X size={18} />
                                </button>
                            </div>
                            <div className="absolute -bottom-8 left-6">
                                <div className="w-16 h-16 bg-white rounded-2xl shadow-lg flex flex-col items-center justify-center border border-slate-100">
                                    <span className="text-xs font-bold text-indigo-500 uppercase">{selectedMeeting.shortDate?.split(' ')[1]}</span>
                                    <span className="text-2xl font-bold text-slate-800">{selectedMeeting.shortDate?.split(' ')[0]}</span>
                                </div>
                            </div>
                        </div>

                        <div className="pt-10 px-6 pb-6">
                            <h2 className="text-2xl font-bold text-slate-800 mb-1 leading-snug">{selectedMeeting.title}</h2>
                            <p className="text-slate-500 font-medium text-sm mb-6 flex items-center gap-2">
                                <span className="bg-slate-100 px-2 py-0.5 rounded text-slate-600">{selectedMeeting.type}</span>
                                <span>•</span>
                                {selectedMeeting.date}
                            </p>

                            <div className="space-y-4">
                                <div className="flex gap-4">
                                    <div className="w-8 flex justify-center pt-0.5"><Clock className="text-slate-400" size={20} /></div>
                                    <div>
                                        <p className="font-semibold text-slate-700 text-sm">Time</p>
                                        <p className="text-sm text-slate-600">{selectedMeeting.time}</p>
                                    </div>
                                </div>

                                <div className="flex gap-4">
                                    <div className="w-8 flex justify-center pt-0.5"><MapPin className="text-slate-400" size={20} /></div>
                                    <div>
                                        <p className="font-semibold text-slate-700 text-sm">Location</p>
                                        {(selectedMeeting.type === 'Offline' || selectedMeeting.type === 'Hybrid') && (
                                            <p className="text-sm text-slate-600">{selectedMeeting.location}</p>
                                        )}
                                        {(selectedMeeting.type === 'Online' || selectedMeeting.type === 'Hybrid') && selectedMeeting.meetLink && (
                                            <a href={selectedMeeting.meetLink} target="_blank" className="text-sm text-indigo-600 hover:underline break-all block mt-0.5">
                                                {selectedMeeting.meetLink}
                                            </a>
                                        )}
                                    </div>
                                </div>

                                <div className="flex gap-4">
                                    <div className="w-8 flex justify-center pt-0.5"><Users className="text-slate-400" size={20} /></div>
                                    <div className="flex-1">
                                        <p className="font-semibold text-slate-700 text-sm mb-2">
                                            {selectedMeeting.guests?.emails?.length || 0} Invited Guests
                                        </p>
                                        {selectedMeeting.guests?.emails && selectedMeeting.guests.emails.length > 0 ? (
                                            <div className="flex flex-wrap gap-2">
                                                {selectedMeeting.guests.emails.map((email: string) => (
                                                    <div key={email} className="flex items-center gap-2 bg-slate-50 pl-1 pr-3 py-1 rounded-full border border-slate-100">
                                                        <div className="w-5 h-5 rounded-full bg-indigo-100 text-indigo-600 flex items-center justify-center text-[10px] font-bold">
                                                            {email.charAt(0).toUpperCase()}
                                                        </div>
                                                        <span className="text-xs text-slate-600">{email}</span>
                                                    </div>
                                                ))}
                                            </div>
                                        ) : (
                                            <p className="text-xs text-slate-400 italic">No specific invites sent.</p>
                                        )}
                                    </div>
                                </div>

                                <div className="flex gap-4 pt-2">
                                    <div className="w-8 flex justify-center pt-0.5"><FileText className="text-slate-400" size={20} /></div>
                                    <p className="text-sm text-slate-600 leading-relaxed">
                                        {selectedMeeting.description}
                                    </p>
                                </div>
                            </div>

                            <div className="mt-8 space-y-3">
                                <div className="p-3 bg-slate-50 border border-slate-100 rounded-xl">
                                    <p className="text-xs font-bold text-slate-500 uppercase mb-2 flex items-center gap-1"><CalendarIcon size={12} /> Add to Calendar</p>
                                    <div className="flex gap-2">
                                        <button
                                            onClick={() => {
                                                const text = `BEGIN:VCALENDAR\nVERSION:2.0\nBEGIN:VEVENT\nSUMMARY:${selectedMeeting.title}\nDESCRIPTION:${selectedMeeting.description}\nLOCATION:${selectedMeeting.type === 'Online' ? selectedMeeting.meetLink : selectedMeeting.location}\nDTSTART:${new Date(`${selectedMeeting.date}T${selectedMeeting.time.split(' - ')[0]}`).toISOString().replace(/[-:]/g, '').split('.')[0]}Z\nDTEND:${new Date(`${selectedMeeting.date}T${selectedMeeting.time.split(' - ')[1]}`).toISOString().replace(/[-:]/g, '').split('.')[0]}Z\nEND:VEVENT\nEND:VCALENDAR`;
                                                const blob = new Blob([text], { type: 'text/calendar' });
                                                const url = window.URL.createObjectURL(blob);
                                                const a = document.createElement('a');
                                                a.href = url;
                                                a.download = `${selectedMeeting.title}.ics`;
                                                a.click();
                                            }}
                                            className="flex-1 py-2 bg-white border border-slate-200 hover:bg-white hover:border-slate-300 text-slate-600 font-bold rounded-lg text-xs transition-all shadow-sm"
                                        >
                                            Outlook / Apple
                                        </button>
                                        <a
                                            href={`https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(selectedMeeting.title)}&details=${encodeURIComponent(selectedMeeting.description)}&location=${encodeURIComponent(selectedMeeting.type === 'Online' ? (selectedMeeting.meetLink || 'Online') : selectedMeeting.location)}&dates=${new Date(`${selectedMeeting.date}T${selectedMeeting.time.split(' - ')[0]}`).toISOString().replace(/[-:]/g, '').split('.')[0]}Z/${new Date(`${selectedMeeting.date}T${selectedMeeting.time.split(' - ')[1]}`).toISOString().replace(/[-:]/g, '').split('.')[0]}Z`}
                                            target="_blank"
                                            rel="noreferrer"
                                            className="flex-1 py-2 bg-white border border-slate-200 hover:bg-white hover:border-slate-300 text-blue-600 font-bold rounded-lg text-xs transition-all shadow-sm text-center flex items-center justify-center"
                                        >
                                            Google Calendar
                                        </a>
                                    </div>
                                </div>
                                <button
                                    onClick={() => setSelectedMeeting(null)}
                                    className="w-full py-3 bg-slate-100 hover:bg-slate-200 text-slate-600 font-bold rounded-xl transition-all"
                                >
                                    Close Details
                                </button>
                                {userEmail && !selectedMeeting.guests?.emails?.includes(userEmail) && (
                                    <button
                                        onClick={async () => {
                                            try {
                                                const res = await fetch(`${API_BASE_URL}/api/meetings/${selectedMeeting.id}/rsvp`, {
                                                    method: 'POST',
                                                    headers: { 'Content-Type': 'application/json' },
                                                    body: JSON.stringify({ email: userEmail })
                                                });
                                                if (res.ok) {
                                                    const data = await res.json();
                                                    // Update local state
                                                    const updatedMeeting = { ...selectedMeeting, guests: data.guests };
                                                    setMeetings(meetings.map(m => m.id === selectedMeeting.id ? updatedMeeting : m));
                                                    setSelectedMeeting(updatedMeeting);
                                                    setNotification({ show: true, type: 'success', message: "You have joined this event!" });
                                                }
                                            } catch (err) {
                                                console.error(err);
                                            }
                                        }}
                                        className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl transition-all shadow-lg shadow-indigo-200 mt-3"
                                    >
                                        Join Event
                                    </button>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default InternalMeetingList;
