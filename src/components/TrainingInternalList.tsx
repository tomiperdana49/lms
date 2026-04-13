import { useState, useEffect, type FormEvent } from 'react';
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
    ArrowRight,
    DollarSign,
    CheckCircle
} from 'lucide-react';
import { API_BASE_URL } from '../config';
import type { Role, Meeting, CostReport, Employee } from '../types';
import PopupNotification from './PopupNotification';
import ConfirmationModal from './ConfirmationModal';

interface TrainingInternalListProps {
    userRole: Role;
    userEmail?: string;
}

type ExtendedMeeting = Meeting & { shortDate?: string };

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

const TrainingInternalList = ({ userRole, userEmail }: TrainingInternalListProps) => {
    // --- State ---
    const [meetings, setMeetings] = useState<ExtendedMeeting[]>([]);
    const [selectedMeeting, setSelectedMeeting] = useState<ExtendedMeeting | null>(null);
    const [isCreateOpen, setIsCreateOpen] = useState(false);
    const [notification, setNotification] = useState<{ show: boolean; type: 'success' | 'error'; message: string }>({ show: false, type: 'success', message: '' });

    const [isEditing, setIsEditing] = useState(false);
    const [editId, setEditId] = useState<number | null>(null);

    const [meetingToDelete, setMeetingToDelete] = useState<number | null>(null);
    const [confirmMarkPaid, setConfirmMarkPaid] = useState<boolean>(false);


    // Reporting State
    const [isReportOpen, setIsReportOpen] = useState(false);
    const [reportData, setReportData] = useState<CostReport>({
        trainerIncentive: 0,
        snackCost: 0,
        lunchCost: 0,
        otherCost: 0,
        participantsCount: 0,
        isFinalized: false
    });
    const [reportingId, setReportingId] = useState<number | null>(null);
    const [employees, setEmployees] = useState<Employee[]>([]);

    // Form State
    const [formData, setFormData] = useState({
        title: '',
        date: '',
        startTime: '',
        endTime: '',
        host: '',
        host_id: '',
        type: 'Online' as 'Online' | 'Offline' | 'Hybrid',
        location: '',
        meetLink: '',
        description: ''
    });

    // Email Invites State
    const [invitedEmails, setInvitedEmails] = useState<string[]>([]);
    const [invitedEmployeeIds, setInvitedEmployeeIds] = useState<string[]>([]);

    // --- Filter State ---
    const [viewMode, setViewMode] = useState<'list' | 'recap'>('list');
    const [selectedYear, setSelectedYear] = useState<number | 'All'>(new Date().getFullYear());
    const [selectedPeriod, setSelectedPeriod] = useState<string>('All Year'); // Default to All Year for easier initial view
    const [selectedBranch, setSelectedBranch] = useState<string>('All Branches');
    const [branches, setBranches] = useState<string[]>(['All Branches']);
    const [searchQuery, setSearchQuery] = useState(''); // Unified search term

    // Recap Detail Modal
    const [recapDetailHost, setRecapDetailHost] = useState<string | null>(null);

    const periodOptions = [
        "All Year",
        "Q1 (Jan-Mar)", "Q2 (Apr-Jun)", "Q3 (Jul-Sep)", "Q4 (Oct-Dec)",
        "Semester 1 (Jan-Jun)", "Semester 2 (Jul-Dec)",
        "January", "February", "March", "April", "May", "June",
        "July", "August", "September", "October", "November", "December"
    ];

    const getPeriodDates = () => {
        const year = selectedYear === 'All' ? new Date().getFullYear() : selectedYear;
        // Default: Full Year
        let start = new Date(year, 0, 1);
        let end = new Date(year, 11, 31, 23, 59, 59);

        if (selectedPeriod === 'All Year') return [start, end];

        if (selectedPeriod.startsWith('Q1')) { end = new Date(year, 2, 31, 23, 59, 59); }
        else if (selectedPeriod.startsWith('Q2')) { start = new Date(year, 3, 1); end = new Date(year, 5, 30, 23, 59, 59); }
        else if (selectedPeriod.startsWith('Q3')) { start = new Date(year, 6, 1); end = new Date(year, 8, 30, 23, 59, 59); }
        else if (selectedPeriod.startsWith('Q4')) { start = new Date(year, 9, 1); end = new Date(year, 11, 31, 23, 59, 59); }
        else if (selectedPeriod.startsWith('Semester 1')) { end = new Date(year, 5, 30, 23, 59, 59); }
        else if (selectedPeriod.startsWith('Semester 2')) { start = new Date(year, 6, 1); }
        else {
            // Monthly
            const monthIdx = new Date(`${selectedPeriod} 1, ${year}`).getMonth();
            if (!isNaN(monthIdx)) {
                // Period: 26th of previous month to 25th of current month
                start = new Date(year, monthIdx - 1, 26);
                end = new Date(year, monthIdx, 25, 23, 59, 59, 999);
            }
        }
        return [start, end];
    };

    // List View State
    const [listType, setListType] = useState<'active' | 'history'>('active');
    const toggleView = (view: 'list' | 'recap') => setViewMode(view);

    // --- Filtered Data ---
    const filteredMeetings = meetings.filter(m => {

        // PERMISSION CHECK: Non-HR can ONLY see meetings they are invited to
        if (userRole !== 'HR' && userRole !== 'HR_ADMIN') {
            if (!userEmail) return false; // Guest without email sees nothing
            const invites = m.guests?.emails || [];
            const isInvited = invites.some(email => email.toLowerCase() === userEmail.toLowerCase());
            if (!isInvited) return false;
        }

        // Active vs History Filter (Only applies to List View, Recap shows all valid for period)
        if (viewMode === 'list') {
            const isPaid = m.costReport?.isPaid;
            if (listType === 'active' && isPaid) return false;
            if (listType === 'history' && !isPaid) return false;
        }

        const d = new Date(m.date);
        const [start, end] = getPeriodDates();

        // Year & Period
        if (selectedYear !== 'All' && d.getFullYear() !== selectedYear) return false;
        if (d < start || d > end) return false;

        // Branch Filter (Host Database Mapping)
        const hostEmp = employees.find(e =>
            (m.employee_id && e.id_employee === m.employee_id) ||
            (m.host && e.full_name && e.full_name.trim().toLowerCase() === m.host.trim().toLowerCase())
        );
        const hostBranch = hostEmp?.branch_name || 'Others';

        if (selectedBranch !== 'All Branches' && hostBranch !== selectedBranch) return false;

        // Search
        const lower = searchQuery.toLowerCase();
        return (
            m.title.toLowerCase().includes(lower) ||
            m.host.toLowerCase().includes(lower)
        );
    });

    // --- Handlers ---

    // Helper to safely parse meeting data
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const safeMeeting = (m: any): ExtendedMeeting => {
        let shortDate = m.shortDate || '';
        if (!shortDate && m.date) {
            const dateObj = new Date(m.date);
            if (!isNaN(dateObj.getTime())) {
                shortDate = `${dateObj.getDate()} ${dateObj.toLocaleString('default', { month: 'short' }).toUpperCase()}`;
            }
        }

        let host = m.host;
        if ((!host || host === 'Admin' || host === 'HR Team') && m.employee_id) {
            const emp = employees.find(e => e.id_employee === m.employee_id);
            if (emp) host = emp.full_name;
        }

        return {
            ...m,
            host: host || m.host || 'Admin',
            type: m.type || (m.location && (m.location.toLowerCase().includes('meet') || m.location.toLowerCase().includes('http')) ? 'Online' : 'Offline'),
            description: m.description || m.agenda || 'No description provided.',
            shortDate: shortDate || 'TBD',
            guests: m.guests || { status: 'Awaiting', count: 0, emails: [] }
        } as ExtendedMeeting;
    };

    // --- Fetch Meetings ---
    useEffect(() => {
        fetch(`${API_BASE_URL}/api/meetings`)
            .then(res => res.json())
            .then(data => {
                const sorted = data.map(safeMeeting).sort((a: ExtendedMeeting, b: ExtendedMeeting) => {
                    // Compare Dates
                    const dateA = new Date(a.date).getTime();
                    const dateB = new Date(b.date).getTime();
                    if (dateA !== dateB) return dateA - dateB;

                    // Compare Times (Extract Start Time)
                    const getMinutes = (timeStr: string) => {
                        if (!timeStr) return 0;
                        // Extract first valid HH:mm pattern
                        const match = timeStr.match(/(\d{1,2}):(\d{2})\s*(AM|PM)?/i);
                        if (!match) return 0;

                        const [, hrs, mins, rawPeriod] = match;
                        let hours = parseInt(hrs);
                        const minutes = parseInt(mins);

                        if (rawPeriod) {
                            const period = rawPeriod.toUpperCase();
                            if (period === 'PM' && hours < 12) hours += 12;
                            if (period === 'AM' && hours === 12) hours = 0;
                        }

                        return hours * 60 + minutes;
                    };

                    return getMinutes(a.time) - getMinutes(b.time);
                });
                setMeetings(sorted);
            })
            .catch(err => console.error("Failed to fetch meetings", err));
    }, []);

    useEffect(() => {
        fetch(`${API_BASE_URL}/api/employees`)
            .then(res => res.json())
            .then(data => setEmployees(data))
            .catch(err => console.error("Failed to fetch employees", err));
    }, []);

    useEffect(() => {
        fetch(`${API_BASE_URL}/api/branches`)
            .then(res => res.json())
            .then(data => {
                if (Array.isArray(data)) {
                    setBranches(['All Branches', ...data.map((b: any) => b.name)]);
                }
            })
            .catch(err => console.error("Failed to fetch branches", err));
    }, []);


    const openEditModal = (meeting: ExtendedMeeting) => {
        setSelectedMeeting(null);
        setEditId(meeting.id);
        setIsEditing(true);

        // Helper to format Date string to YYYY-MM-DD
        const formatDate = (dateStr: any) => {
            if (!dateStr) return '';
            const d = new Date(dateStr);
            if (isNaN(d.getTime())) return '';
            return d.toISOString().split('T')[0];
        };

        // Helper to format Time string (handles HH:mm and potential legacy formats)
        const formatTime = (t: string) => {
            if (!t) return '';
            const trimmed = t.trim();
            // If already HH:mm, use as is
            if (/^\d{1,2}:\d{2}$/.test(trimmed)) {
                const [h, m] = trimmed.split(':');
                return `${h.padStart(2, '0')}:${m}`;
            }
            // Fallback: try to parse with Date
            const d = new Date(`2000-01-01 ${trimmed}`);
            if (!isNaN(d.getTime())) {
                return d.toTimeString().split(' ')[0].substring(0, 5);
            }
            return trimmed;
        };

        // Populate form
        let start = '', end = '';
        if (meeting.time && meeting.time.includes(' - ')) {
            const parts = meeting.time.split(' - ');
            start = formatTime(parts[0]);
            end = formatTime(parts[1]);
        } else if (meeting.time) {
            start = formatTime(meeting.time);
        }

        // Find Host ID if missing (fallback for legacy data)
        let hostId = meeting.employee_id || '';
        if (!hostId && meeting.host) {
            const foundEmp = employees.find(e => e.full_name && e.full_name.trim().toLowerCase() === meeting.host.trim().toLowerCase());
            if (foundEmp) hostId = foundEmp.id_employee;
        }

        setFormData({
            title: meeting.title,
            date: formatDate(meeting.date),
            startTime: start || '',
            endTime: end || '',
            host: meeting.host,
            host_id: hostId,
            type: meeting.type || 'Offline',
            location: meeting.location || '',
            meetLink: meeting.meetLink || '',
            description: (meeting.description && meeting.description !== 'No description provided.') ? meeting.description : (meeting.agenda || '')
        });
        setInvitedEmails(meeting.guests?.emails || []);
        setInvitedEmployeeIds((meeting.guests as any).employee_ids || []);
        setIsCreateOpen(true);
    };

    const openReportModal = (meeting: ExtendedMeeting) => {
        setReportingId(meeting.id);
        setReportData({
            trainerIncentive: meeting.costReport?.trainerIncentive || 0,
            audienceFee: meeting.costReport?.audienceFee || 0,
            snackCost: meeting.costReport?.snackCost || 0,
            lunchCost: meeting.costReport?.lunchCost || 0,
            otherCost: meeting.costReport?.otherCost || 0,
            participantsCount: meeting.costReport?.participantsCount || meeting.guests?.count || 0,
            attendees: meeting.costReport?.attendees || [],
            attendee_ids: meeting.costReport?.attendee_ids || [],
            isFinalized: true,
            isPaid: meeting.costReport?.isPaid || false,
            evidenceLink: meeting.costReport?.evidenceLink || ''
        });
        setIsReportOpen(true);
    };

    const toggleAttendee = (email: string, employeeId?: string) => {
        const currentAttendees = reportData.attendees || [];
        const currentAttendeeIds = reportData.attendee_ids || [];

        let newAttendees = [...currentAttendees];
        let newAttendeeIds = [...currentAttendeeIds];

        if (employeeId) {
            newAttendeeIds = currentAttendeeIds.includes(employeeId)
                ? currentAttendeeIds.filter(id => id !== employeeId)
                : [...currentAttendeeIds, employeeId];

            // Sync email if found
            const emp = employees.find(e => e.id_employee === employeeId);
            if (emp && emp.email) {
                if (newAttendeeIds.includes(employeeId)) {
                    if (!newAttendees.includes(emp.email)) newAttendees.push(emp.email);
                } else {
                    newAttendees = newAttendees.filter(e => e !== emp.email);
                }
            }
        } else {
            newAttendees = currentAttendees.includes(email)
                ? currentAttendees.filter(e => e !== email)
                : [...currentAttendees, email];
        }

        setReportData({
            ...reportData,
            attendees: newAttendees,
            attendee_ids: newAttendeeIds,
            participantsCount: Math.max(newAttendees.length, newAttendeeIds.length)
        });
    };

    const handleSaveReport = async (e: FormEvent) => {
        e.preventDefault();
        if (!reportingId) return;

        // Validation
        if ((reportData.participantsCount || 0) <= 0) {
            setNotification({ show: true, type: 'error', message: 'Participants count must be at least 1.' });
            return;
        }

        if (!reportData.evidenceLink || reportData.evidenceLink.trim() === '') {
            setNotification({ show: true, type: 'error', message: 'Evidence Link is required.' });
            return;
        }

        // Optimistic update
        const updatedMeetings = meetings.map(m => m.id === reportingId ? { ...m, costReport: { ...reportData, isFinalized: true } } : m);
        setMeetings(updatedMeetings);
        setIsReportOpen(false);
        setNotification({ show: true, type: 'success', message: 'Financial report saved successfully!' });

        // Persist to backend
        try {
            const m = meetings.find(x => x.id === reportingId);
            if (m) {
                const body = { ...m, costReport: { ...reportData, isFinalized: true } };
                await fetch(`${API_BASE_URL}/api/meetings/${reportingId}`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(body)
                });
            }
        } catch (err) {
            console.error("Failed to save report", err);
        }
    };


    const handleSave = async (e: FormEvent) => {
        e.preventDefault();

        // Validation
        if (!formData.title || !formData.date || !formData.startTime || !formData.endTime || !formData.host || !formData.type) {
            setNotification({ show: true, type: 'error', message: 'Please fill in all required fields (Title, Date, Time, Host, Type).' });
            return;
        }

        if (formData.type === 'Offline' && !formData.location) {
            setNotification({ show: true, type: 'error', message: 'Please specify a Location for offline meetings.' });
            return;
        }

        const finalEmails = [...new Set(invitedEmails)];

        const dateObj = new Date(formData.date);
        const meetingData = {
            title: formData.title,
            date: formData.date,
            time: `${formData.startTime} - ${formData.endTime}`,
            shortDate: `${dateObj.getDate()} ${dateObj.toLocaleString('default', { month: 'short' }).toUpperCase()}`,
            host: formData.host || 'HR Team',
            employee_id: formData.host_id,
            type: formData.type,
            location: formData.location,
            description: formData.description,
            guests: {
                status: 'Awaiting',
                count: Math.max(finalEmails.length, invitedEmployeeIds.length),
                emails: finalEmails,
                employee_ids: invitedEmployeeIds
            },
            meetLink: formData.meetLink
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

    const confirmDelete = (id: number) => {
        setMeetingToDelete(id);
    };

    const handleDelete = async () => {
        if (!meetingToDelete) return;
        try {
            await fetch(`${API_BASE_URL}/api/meetings/${meetingToDelete}`, { method: 'DELETE' });
            setMeetings(meetings.filter(m => m.id !== meetingToDelete));
            if (selectedMeeting?.id === meetingToDelete) {
                setSelectedMeeting(null);
            }
            setNotification({ show: true, type: 'success', message: 'Meeting cancelled successfully.' });
        } catch (err) {
            console.error(err);
            setNotification({ show: true, type: 'error', message: 'Failed to cancel meeting.' });
        } finally {
            setMeetingToDelete(null);
        }
    };

    const resetForm = () => {
        setFormData({ title: '', date: '', startTime: '', endTime: '', host: '', host_id: '', type: 'Online', location: '', meetLink: '', description: '' });
        setInvitedEmails([]);
        setInvitedEmployeeIds([]);
        setIsEditing(false);
        setEditId(null);
    };

    const getHostStats = () => {
        const [start, end] = getPeriodDates();

        // chunk meetings by host
        const hosts: Record<string, ExtendedMeeting[]> = {};

        meetings.forEach(m => {
            const d = new Date(m.date);
            if (selectedYear !== 'All' && d.getFullYear() !== selectedYear) return;
            if (d < start || d > end) return;

            // Branch Filter (Host Database Mapping)
            const hostEmp = employees.find(e =>
                (m.employee_id && e.id_employee === m.employee_id) ||
                (m.host && e.full_name && e.full_name.trim().toLowerCase() === m.host.trim().toLowerCase())
            );
            const hostBranch = hostEmp?.branch_name || 'Others';

            if (selectedBranch !== 'All Branches' && hostBranch !== selectedBranch) return;


            // Search Filter
            if (searchQuery) {
                const lower = searchQuery.toLowerCase();
                if (!m.host.toLowerCase().includes(lower) &&
                    !m.title.toLowerCase().includes(lower)) return;
            }

            let hostName = m.host;
            // Robust check: if host is Admin/Generic, try to resolve from employee_id or the found hostEmp
            if ((hostName === 'Admin' || hostName === 'HR Team') && (m.employee_id || hostEmp)) {
                hostName = hostEmp?.full_name || hostName;
            }

            if (!hosts[hostName]) hosts[hostName] = [];
            hosts[hostName].push(m);
        });

        // Convert to array
        return Object.entries(hosts).map(([host, hostMeetings]) => {
            const sessions = hostMeetings.length;

            let totalParticipants = 0;
            let totalCost = 0;
            let totalTrainerIncentive = 0;

            hostMeetings.forEach(m => {
                const pCount = m.costReport?.participantsCount || m.guests?.count || 0;
                totalParticipants += pCount;

                if (m.costReport) {
                    totalCost += (
                        (m.costReport.trainerIncentive || 0) +
                        (m.costReport.snackCost || 0) +
                        (m.costReport.lunchCost || 0) +
                        (m.costReport.otherCost || 0) +
                        ((m.costReport.audienceFee || 0) * (Math.max(m.costReport.participantsCount || 0, m.costReport.attendee_ids?.length || 0)))
                    );
                    totalTrainerIncentive += m.costReport.trainerIncentive || 0;
                }
            });

            return {
                host,
                host_id: hostMeetings[0].employee_id,
                sessions,
                totalParticipants,
                totalCost,
                totalTrainerIncentive,
                meetings: hostMeetings
            };
        }).sort((a, b) => b.totalCost - a.totalCost);
    };

    const formatCurrency = (val: number) => new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(val);

    return (
        <div className="space-y-6 animate-fade-in">
            <PopupNotification
                isOpen={notification.show}
                type={notification.type}
                message={notification.message}
                onClose={() => setNotification({ ...notification, show: false })}
            />

            <ConfirmationModal
                isOpen={!!meetingToDelete}
                onClose={() => setMeetingToDelete(null)}
                onConfirm={handleDelete}
                title="Cancel Meeting"
                message="Are you sure you want to cancel this meeting? This action cannot be undone."
                confirmText="Yes, Cancel it"
                variant="danger"
            />

            {/* Header */}
            <div className="bg-white rounded-3xl p-6 border border-slate-100 flex flex-col md:flex-row justify-between md:items-center gap-4 shadow-sm">
                <div>
                    <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
                        <Users className="text-indigo-600" /> Training Internal
                    </h1>
                    <p className="text-slate-500 mt-1">Manage sharing sessions, townhalls, and internal training.</p>
                </div>
                <div className="flex gap-3">
                    <div className="flex items-center gap-2">
                        <div className="flex bg-slate-100 p-1 rounded-lg mr-2">
                            <button
                                onClick={() => setListType('active')}
                                className={`px-3 py-1.5 text-xs font-bold rounded-md transition-all ${listType === 'active' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                            >
                                Active
                            </button>
                            <button
                                onClick={() => setListType('history')}
                                className={`px-3 py-1.5 text-xs font-bold rounded-md transition-all ${listType === 'history' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                            >
                                History (Paid)
                            </button>
                        </div>

                        <div className="flex bg-slate-100 p-1 rounded-lg">
                            <button
                                onClick={() => toggleView('list')}
                                className={`px-3 py-1.5 text-xs font-bold rounded-md transition-all ${viewMode === 'list' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                            >
                                List View
                            </button>
                            <button
                                onClick={() => toggleView('recap')}
                                className={`px-3 py-1.5 text-xs font-bold rounded-md transition-all ${viewMode === 'recap' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                            >
                                Recap
                            </button>
                        </div>
                    </div>
                </div>

                {viewMode === 'list' && (userRole === 'HR' || userRole === 'HR_ADMIN') && (
                    <button
                        onClick={() => { setIsEditing(false); resetForm(); setIsCreateOpen(true); }}
                        className="bg-indigo-600 hover:bg-indigo-700 text-white px-5 py-3 rounded-xl font-bold shadow-lg shadow-indigo-500/20 flex items-center gap-2 transition-all"
                    >
                        <Plus size={18} /> New Session
                    </button>
                )}
            </div>

            {/* Global Filter Bar */}
            <div className="bg-white p-4 rounded-2xl shadow-sm border border-slate-200 flex flex-col md:flex-row gap-4 items-center justify-between mb-6">
                <div className="relative w-full md:w-96">
                    <Clock className="absolute left-4 top-3.5 text-slate-400" size={18} />
                    <input
                        type="text"
                        placeholder="Search Host or Title..."
                        className="w-full pl-11 pr-4 py-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none font-medium text-slate-600"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                    />
                </div>

                <div className="flex gap-2 w-full md:w-auto overflow-x-auto pb-2 md:pb-0">
                    <select
                        value={selectedBranch}
                        onChange={(e) => setSelectedBranch(e.target.value)}
                        className="px-4 py-2.5 rounded-xl border border-slate-200 font-bold text-slate-600 text-sm outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
                    >
                        {branches.map(b => <option key={b} value={b}>{b === 'Online' ? 'Online Only' : b}</option>)}
                    </select>

                    <select
                        value={selectedYear}
                        onChange={(e) => setSelectedYear(e.target.value === 'All' ? 'All' : parseInt(e.target.value))}
                        className="px-4 py-2.5 rounded-xl border border-slate-200 font-bold text-slate-600 text-sm outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
                    >
                        <option value="All">All Year</option>
                        {Array.from({ length: Math.max(1, new Date().getFullYear() - 2026 + 1) }, (_, i) => 2026 + i).map(y => <option key={y} value={y}>{y}</option>)}
                    </select>

                    <select
                        value={selectedPeriod}
                        onChange={(e) => setSelectedPeriod(e.target.value)}
                        className="px-4 py-2.5 rounded-xl border border-slate-200 font-bold text-slate-600 text-sm outline-none focus:ring-2 focus:ring-indigo-500 bg-white min-w-[140px]"
                    >
                        {periodOptions.map(p => <option key={p} value={p}>{p}</option>)}
                    </select>
                </div>
            </div>

            {
                viewMode === 'recap' && (
                    <div className="space-y-6 animate-in slide-in-from-bottom-4">


                        {/* Recapitulation Table */}
                        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
                            <table className="w-full text-left">
                                <thead className="bg-slate-50 text-slate-500 font-bold uppercase text-xs tracking-wider">
                                    <tr>
                                        <th className="px-6 py-4">Host Name</th>
                                        <th className="px-6 py-4 text-center">Sessions</th>
                                        <th className="px-6 py-4 text-center">Audience</th>
                                        <th className="px-6 py-4 text-right">Trainer Incentive</th>
                                        <th className="px-6 py-4 text-right">Total Cost</th>
                                        <th className="px-6 py-4 text-center">Action</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                    {getHostStats().length === 0 ? (
                                        <tr><td colSpan={6} className="p-8 text-center text-slate-400 italic">No data found matching filters.</td></tr>
                                    ) : (
                                        getHostStats().map((stat, idx) => (
                                            <tr key={idx} className="hover:bg-slate-50 transition-colors">
                                                <td className="px-6 py-4 font-bold text-slate-700">{stat.host}</td>
                                                <td className="px-6 py-4 text-center">
                                                    <span className="bg-blue-100 text-blue-700 px-2.5 py-1 rounded-lg text-xs font-bold">
                                                        {stat.sessions}x
                                                    </span>
                                                </td>
                                                <td className="px-6 py-4 text-center text-slate-600 font-semibold">{stat.totalParticipants}</td>
                                                <td className="px-6 py-4 text-right font-mono text-green-600 font-bold">
                                                    {formatCurrency(stat.totalTrainerIncentive)}
                                                </td>
                                                <td className="px-6 py-4 text-right font-mono text-slate-700 font-bold">
                                                    {formatCurrency(stat.totalCost)}
                                                </td>
                                                <td className="px-6 py-4 text-center">
                                                    <button
                                                        onClick={() => setRecapDetailHost(stat.host)}
                                                        className="px-3 py-1.5 bg-white border border-slate-200 hover:bg-indigo-50 hover:border-indigo-200 hover:text-indigo-600 text-slate-500 rounded-lg text-xs font-bold transition-all shadow-sm"
                                                    >
                                                        View Details
                                                    </button>
                                                </td>
                                            </tr>
                                        ))
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )
            }


            {
                viewMode === 'list' && (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {(filteredMeetings.length === 0) ? (
                            <div className="col-span-full py-12 text-center text-slate-400 italic bg-white rounded-3xl border border-dashed border-slate-200">
                                No meetings scheduled.
                            </div>
                        ) : (
                            filteredMeetings.map((meeting) => (
                                <div
                                    key={meeting.id}
                                    className="group bg-white rounded-3xl p-6 border border-slate-100 shadow-sm hover:shadow-xl hover:-translate-y-1 transition-all duration-300 cursor-pointer relative overflow-hidden"
                                    onClick={() => setSelectedMeeting(meeting)}
                                >
                                    <div className={`absolute top-0 left-0 w-1.5 h-full ${meeting.type === 'Online' ? 'bg-blue-400' : 'bg-emerald-400'}`} />

                                    <div className="flex justify-between items-start mb-4 pl-2">
                                        <div className="bg-slate-50 px-3 py-1.5 rounded-xl border border-slate-100 text-center min-w-[60px]">
                                            <span className="block text-xs font-bold text-slate-500 uppercase tracking-wider">
                                                {(meeting.shortDate || 'TBD TBD').split(' ')[1]}
                                            </span>
                                            <span className="block text-xl font-black text-slate-800 leading-none mt-0.5">
                                                {(meeting.shortDate || 'TBD').split(' ')[0]}
                                            </span>
                                        </div>
                                        <span className={`px-2.5 py-1 rounded-lg text-[10px] font-bold uppercase tracking-wider border ${meeting.type === 'Online'
                                            ? 'bg-blue-50 text-blue-600 border-blue-100'
                                            : 'bg-emerald-50 text-emerald-600 border-emerald-100'
                                            }`}>
                                            {meeting.type}
                                        </span>
                                    </div>

                                    <h3 className="font-bold text-lg text-slate-800 mb-2 pl-2 line-clamp-2 leading-tight group-hover:text-indigo-600 transition-colors">
                                        {meeting.title}
                                    </h3>

                                    <div className="space-y-2 pl-2 mb-6">
                                        <div className="flex items-center gap-2 text-xs font-medium text-slate-500">
                                            <Clock size={14} className="text-slate-400" />
                                            {meeting.time}
                                        </div>
                                        <div className="flex items-center gap-2 text-xs font-medium text-slate-500">
                                            <MapPin size={14} className="text-slate-400" />
                                            <span className="line-clamp-1">{meeting.location || 'Online'}</span>
                                        </div>
                                        <div className="flex items-center gap-2 text-xs font-medium text-slate-500">
                                            <div className="w-4 h-4 rounded-full bg-indigo-100 flex items-center justify-center text-[8px] font-bold text-indigo-600">
                                                {meeting.host.charAt(0)}
                                            </div>
                                            Host: {meeting.host}
                                        </div>
                                    </div>

                                    <div className="pl-2 flex items-center justify-between border-t border-slate-50 pt-4 mt-auto">
                                        <AvatarStack count={meeting.guests?.count || 0} />

                                        <div className="flex items-center gap-2">
                                            {(userRole === 'HR' || userRole === 'HR_ADMIN') && (
                                                <>
                                                    <button
                                                        onClick={(e) => { e.stopPropagation(); openReportModal(meeting); }}
                                                        className="p-1.5 rounded-full bg-slate-100 text-slate-500 hover:bg-green-100 hover:text-green-600 transition-colors"
                                                        title="Financial Report"
                                                    >
                                                        <DollarSign size={16} />
                                                    </button>
                                                    <button
                                                        onClick={(e) => { e.stopPropagation(); openEditModal(meeting); }}
                                                        className="p-1.5 rounded-full bg-slate-100 text-slate-500 hover:bg-blue-100 hover:text-blue-600 transition-colors"
                                                        title="Edit Meeting"
                                                    >
                                                        <FileText size={16} />
                                                    </button>
                                                </>
                                            )}
                                            <div className="w-8 h-8 rounded-full bg-slate-50 flex items-center justify-center text-slate-400 group-hover:bg-indigo-50 group-hover:text-indigo-600 transition-colors">
                                                <ArrowRight size={16} />
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                )
            }

            {/* Create Modal */}
            {
                isCreateOpen && (
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
                                        <div className="relative">
                                            <select
                                                required
                                                className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none bg-white font-semibold text-slate-700 appearance-none"
                                                value={formData.host_id}
                                                onChange={e => {
                                                    const emp = employees.find(emp => emp.id_employee === e.target.value);
                                                    setFormData({ ...formData, host_id: e.target.value, host: emp?.full_name || '' });
                                                }}
                                            >
                                                <option value="">Select Host...</option>
                                                {employees.map(emp => (
                                                    <option key={emp.id_employee} value={emp.id_employee}>
                                                        {emp.full_name} ({emp.id_employee})
                                                    </option>
                                                ))}
                                            </select>
                                            <div className="absolute right-4 top-3.5 pointer-events-none text-slate-400">
                                                <Users size={16} />
                                            </div>
                                        </div>
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
                                    <div className="flex flex-col gap-3">
                                        <select
                                            className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none bg-white text-sm font-semibold text-slate-700"
                                            onChange={(e) => {
                                                const id = e.target.value;
                                                if (!id) return;
                                                const emp = employees.find(emp => emp.id_employee === id);
                                                if (emp && !invitedEmployeeIds.includes(id)) {
                                                    setInvitedEmployeeIds([...invitedEmployeeIds, id]);
                                                    if (emp.email && !invitedEmails.includes(emp.email)) {
                                                        setInvitedEmails([...invitedEmails, emp.email]);
                                                    }
                                                }
                                                e.target.value = "";
                                            }}
                                        >
                                            <option value="">Search Employee...</option>
                                            {employees
                                                .filter(e => !invitedEmployeeIds.includes(e.id_employee))
                                                .map(emp => (
                                                    <option key={emp.id_employee} value={emp.id_employee}>
                                                        {emp.full_name} ({emp.id_employee})
                                                    </option>
                                                ))
                                            }
                                        </select>

                                        <div className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-slate-50 min-h-[50px] flex flex-wrap gap-2">
                                            {invitedEmployeeIds.map(id => {
                                                const emp = employees.find(e => e.id_employee === id);
                                                return (
                                                    <span key={id} className="bg-indigo-100 text-indigo-700 px-2 py-1 rounded-lg text-xs font-semibold flex items-center gap-1">
                                                        {emp?.full_name || id}
                                                        <button
                                                            onClick={() => {
                                                                setInvitedEmployeeIds(invitedEmployeeIds.filter(x => x !== id));
                                                                if (emp?.email) setInvitedEmails(invitedEmails.filter(x => x !== emp.email));
                                                            }}
                                                            className="hover:text-indigo-900"
                                                        >
                                                            <X size={12} />
                                                        </button>
                                                    </span>
                                                );
                                            })}
                                            {invitedEmails.length === 0 && invitedEmployeeIds.length === 0 && (
                                                <span className="text-slate-400 text-xs py-1 px-1 italic">No participants added yet.</span>
                                            )}
                                        </div>
                                    </div>
                                    <p className="text-[10px] text-slate-400 mt-1.5 pl-1">Select employees from the list to invite them to this session.</p>
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
                )
            }

            {/* Financial Report Modal */}
            {
                isReportOpen && (
                    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
                        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden flex flex-col max-h-[90vh]">
                            <div className="p-5 border-b border-slate-100 flex justify-between items-center bg-white sticky top-0 z-10">
                                <div>
                                    <h2 className="font-bold text-lg text-slate-800">Finalize Report</h2>
                                    <p className="text-xs text-slate-500">Input post-training costs for HR Reporting.</p>
                                </div>
                                <button onClick={() => setIsReportOpen(false)} className="p-2 hover:bg-slate-100 rounded-full text-slate-400 transition-colors"><X size={20} /></button>
                            </div>
                            <div className="p-6 space-y-5 overflow-y-auto">
                                <div>
                                    <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Attendance Checklist</label>
                                    <div className={`bg-slate-50 rounded-xl border border-slate-200 p-3 max-h-[150px] overflow-y-auto space-y-2 ${reportData.isPaid ? 'opacity-60 pointer-events-none' : ''}`}>
                                        {(() => {
                                            const meeting = meetings.find(m => m.id === reportingId);
                                            const invitedEmailsList = meeting?.guests?.emails || [];
                                            const invitedEmployeeIdsList = (meeting?.guests as any)?.employee_ids || [];

                                            if (invitedEmailsList.length === 0 && invitedEmployeeIdsList.length === 0) {
                                                return <p className="text-xs text-slate-400 italic text-center py-2">No invited guests found.</p>;
                                            }

                                            // Combined checklist
                                            return (
                                                <div className="space-y-2">
                                                    {invitedEmployeeIdsList.map((id: string) => {
                                                        const emp = employees.find(e => e.id_employee === id);
                                                        return (
                                                            <label key={id} className="flex items-center gap-3 p-2 bg-white rounded-lg border border-slate-100 cursor-pointer hover:border-indigo-200 transition-colors">
                                                                <input
                                                                    type="checkbox"
                                                                    className="w-4 h-4 text-indigo-600 rounded border-slate-300 focus:ring-indigo-500"
                                                                    checked={(reportData.attendee_ids || []).includes(id)}
                                                                    onChange={() => toggleAttendee("", id)}
                                                                />
                                                                <div className="flex flex-col">
                                                                    <span className="text-sm text-slate-700 font-bold">{emp?.full_name || id}</span>
                                                                    <span className="text-[10px] text-slate-400">{id} {emp?.branch_name ? `• ${emp.branch_name}` : ''}</span>
                                                                </div>
                                                            </label>
                                                        );
                                                    })}
                                                    {invitedEmailsList.filter((email: string) => !employees.some(emp => emp.email === email)).map((email: string) => (
                                                        <label key={email} className="flex items-center gap-3 p-2 bg-white rounded-lg border border-slate-100 cursor-pointer hover:border-slate-200 transition-colors">
                                                            <input
                                                                type="checkbox"
                                                                className="w-4 h-4 text-indigo-600 rounded border-slate-300 focus:ring-indigo-500"
                                                                checked={(reportData.attendees || []).includes(email)}
                                                                onChange={() => toggleAttendee(email)}
                                                            />
                                                            <span className="text-sm text-slate-700 font-medium truncate">{email}</span>
                                                        </label>
                                                    ))}
                                                </div>
                                            );
                                        })()}
                                    </div>
                                    <div className="flex justify-between items-center mt-2 px-1">
                                        <span className="text-xs text-slate-400">Checked: {Math.max((reportData.attendees || []).length, (reportData.attendee_ids || []).length)} / {Math.max(meetings.find(m => m.id === reportingId)?.guests?.emails?.length || 0, (meetings.find(m => m.id === reportingId)?.guests as any)?.employee_ids?.length || 0)}</span>
                                        <button
                                            type="button"
                                            onClick={() => {
                                                const meeting = meetings.find(m => m.id === reportingId);
                                                const allEmails = meeting?.guests?.emails || [];
                                                const allIds = (meeting?.guests as any)?.employee_ids || [];
                                                setReportData({ ...reportData, attendees: allEmails, attendee_ids: allIds, participantsCount: Math.max(allEmails.length, allIds.length) });
                                            }}
                                            className="text-[10px] font-bold text-blue-600 hover:underline"
                                        >
                                            Select All
                                        </button>
                                    </div>
                                </div>

                                <div>
                                    <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5">Actual Participants</label>
                                    <input
                                        type="number"
                                        className="w-full px-4 py-2.5 rounded-xl border border-slate-200 bg-slate-50 text-slate-500 cursor-not-allowed outline-none font-bold"
                                        value={reportData.participantsCount}
                                        readOnly
                                    />
                                </div>

                                <div>
                                    <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5 flex items-center gap-1">
                                        Evidence Link <span className="text-slate-400 font-normal normal-case">(Drive / Materials)</span>
                                    </label>
                                    <div className="relative">
                                        <span className="absolute left-4 top-2.5 text-slate-400"><FileText size={18} /></span>
                                        <input
                                            type="text"
                                            placeholder="https://drive.google.com/..."
                                            className="w-full pl-12 pr-4 py-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-blue-500 outline-none font-medium text-slate-700 disabled:bg-slate-50 disabled:text-slate-500"
                                            value={reportData.evidenceLink || ''}
                                            onChange={e => setReportData({ ...reportData, evidenceLink: e.target.value })}
                                            disabled={reportData.isPaid}
                                        />
                                        {reportData.evidenceLink && (
                                            <a
                                                href={reportData.evidenceLink}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="absolute right-3 top-2.5 text-blue-600 hover:text-blue-800"
                                                title="Open Link"
                                            >
                                                <ArrowRight size={18} />
                                            </a>
                                        )}
                                    </div>
                                </div>

                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5">Trainer Incentive</label>
                                        <div className="relative">
                                            <span className="absolute left-4 top-2.5 text-slate-500 font-bold">Rp</span>
                                            <input
                                                type="text"
                                                className="w-full pl-12 pr-4 py-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-blue-500 outline-none font-medium text-slate-700"
                                                value={(reportData.trainerIncentive || 0).toLocaleString('id-ID')}
                                                onChange={e => {
                                                    const val = parseInt(e.target.value.replace(/\./g, '')) || 0;
                                                    setReportData({ ...reportData, trainerIncentive: val });
                                                }}
                                            />
                                        </div>
                                    </div>
                                    <div>
                                        <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5">Audience Fee (Per Person)</label>
                                        <div className="relative">
                                            <span className="absolute left-4 top-2.5 text-slate-500 font-bold">Rp</span>
                                            <input
                                                type="text"
                                                className="w-full pl-12 pr-4 py-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-blue-500 outline-none font-medium text-slate-700"
                                                value={(reportData.audienceFee || 0).toLocaleString('id-ID')}
                                                onChange={e => {
                                                    const val = parseInt(e.target.value.replace(/\./g, '')) || 0;
                                                    setReportData({ ...reportData, audienceFee: val });
                                                }}
                                            />
                                        </div>
                                    </div>
                                </div>

                                <div className="grid grid-cols-3 gap-3">
                                    <div>
                                        <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5">Snack Cost</label>
                                        <div className="relative">
                                            <span className="absolute left-3 top-2.5 text-xs text-slate-500 font-bold">Rp</span>
                                            <input
                                                type="text"
                                                className="w-full pl-9 pr-3 py-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-blue-500 outline-none font-medium text-slate-700 text-sm"
                                                value={(reportData.snackCost || 0).toLocaleString('id-ID')}
                                                onChange={e => {
                                                    const val = parseInt(e.target.value.replace(/\./g, '')) || 0;
                                                    setReportData({ ...reportData, snackCost: val });
                                                }}
                                            />
                                        </div>
                                    </div>
                                    <div>
                                        <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5">Lunch Cost</label>
                                        <div className="relative">
                                            <span className="absolute left-3 top-2.5 text-xs text-slate-500 font-bold">Rp</span>
                                            <input
                                                type="text"
                                                className="w-full pl-9 pr-3 py-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-blue-500 outline-none font-medium text-slate-700 text-sm"
                                                value={(reportData.lunchCost || 0).toLocaleString('id-ID')}
                                                onChange={e => {
                                                    const val = parseInt(e.target.value.replace(/\./g, '')) || 0;
                                                    setReportData({ ...reportData, lunchCost: val });
                                                }}
                                            />
                                        </div>
                                    </div>
                                    <div>
                                        <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5">Other Cost</label>
                                        <div className="relative">
                                            <span className="absolute left-3 top-2.5 text-xs text-slate-500 font-bold">Rp</span>
                                            <input
                                                type="text"
                                                className="w-full pl-9 pr-3 py-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-blue-500 outline-none font-medium text-slate-700 text-sm"
                                                value={(reportData.otherCost || 0).toLocaleString('id-ID')}
                                                onChange={e => {
                                                    const val = parseInt(e.target.value.replace(/\./g, '')) || 0;
                                                    setReportData({ ...reportData, otherCost: val });
                                                }}
                                            />
                                        </div>
                                    </div>
                                </div>
                            </div >
                            <div className="mt-4 p-4 bg-slate-100 rounded-xl border border-slate-200">
                                <div className="flex justify-between items-center">
                                    <span className="text-sm font-bold text-slate-600 uppercase">Total Estimated Cost</span>
                                    <span className="text-xl font-bold text-indigo-600">
                                        {formatCurrency(
                                            (reportData.trainerIncentive || 0) +
                                            (reportData.snackCost || 0) +
                                            (reportData.lunchCost || 0) +
                                            (reportData.otherCost || 0) +
                                            ((reportData.audienceFee || 0) * reportData.participantsCount)
                                        )}
                                    </span>
                                </div>
                            </div>
                            <div className="p-5 border-t border-slate-100 bg-slate-50 flex gap-3">
                                <button
                                    onClick={() => setIsReportOpen(false)}
                                    className="flex-1 py-3 rounded-xl font-bold text-slate-600 hover:bg-slate-200 transition-colors"
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={handleSaveReport}
                                    disabled={reportData.isPaid}
                                    className={`flex-[2] py-3 text-white font-bold rounded-xl shadow-lg transition-all ${reportData.isPaid ? 'bg-slate-400 cursor-not-allowed shadow-none' : 'bg-blue-600 hover:bg-blue-700 shadow-blue-500/20'}`}
                                >
                                    {reportData.isPaid ? 'Report Locked (Paid)' : 'Save Report'}
                                </button>

                                {!reportData.isPaid && (
                                    <button
                                        onClick={(e) => { e.preventDefault(); setConfirmMarkPaid(true); }}
                                        className="flex-1 py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl shadow-lg shadow-emerald-500/20 transition-all flex items-center justify-center gap-2"
                                    >
                                        <DollarSign size={18} /> Mark Paid
                                    </button>
                                )}
                            </div>
                        </div >
                    </div >
                )
            }

            {/* Confirm Paid Modal */}
            <ConfirmationModal
                isOpen={confirmMarkPaid}
                onClose={() => setConfirmMarkPaid(false)}
                onConfirm={async () => {
                    const updatedData = { ...reportData, isFinalized: true, isPaid: true };

                    // Optimistic update
                    const updatedMeetings = meetings.map(m => m.id === reportingId ? { ...m, costReport: updatedData } : m);
                    setMeetings(updatedMeetings);
                    setIsReportOpen(false);
                    setNotification({ show: true, type: 'success', message: 'Report marked as PAID and locked.' });

                    // Persist
                    try {
                        const m = meetings.find(x => x.id === reportingId);
                        if (m) {
                            const body = { ...m, costReport: updatedData };
                            await fetch(`${API_BASE_URL}/api/meetings/${reportingId}`, {
                                method: 'PUT',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify(body)
                            });
                        }
                    } catch (err) {
                        console.error(err);
                    }
                }}
                title="Confirm Payment"
                message="Are you sure you want to mark this as PAID? This will lock the report and costs cannot be changed anymore."
                confirmText="Yes, Mark Paid"
                variant="success"
            />

            {/* Recap Detail Modal */}
            {
                recapDetailHost && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in">
                        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl overflow-hidden flex flex-col max-h-[90vh]">
                            <div className="p-5 border-b border-slate-100 flex justify-between items-center bg-white">
                                <div>
                                    <h2 className="font-bold text-lg text-slate-800 flex items-center gap-2">
                                        <Users className="text-indigo-600" size={20} /> {recapDetailHost} - Session Details
                                    </h2>
                                    <p className="text-xs text-slate-500 font-medium">{selectedPeriod} • {selectedYear} • {selectedBranch}</p>
                                </div>
                                <button onClick={() => setRecapDetailHost(null)} className="p-2 hover:bg-slate-100 rounded-full text-slate-400 transition-colors"><X size={20} /></button>
                            </div>

                            <div className="overflow-y-auto p-6">
                                <table className="w-full text-left text-sm">
                                    <thead className="bg-slate-50 text-slate-500 font-bold uppercase text-xs">
                                        <tr>
                                            <th className="px-4 py-3">Date</th>
                                            <th className="px-4 py-3">Title</th>
                                            <th className="px-4 py-3">Type</th>
                                            <th className="px-4 py-3 text-center">Guests</th>
                                            <th className="px-4 py-3 text-right">Trainer Inc.</th>
                                            <th className="px-4 py-3 text-right">Total Cost</th>
                                            <th className="px-4 py-3 text-center">Status</th>
                                            <th className="px-4 py-3 text-center">Action</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100">
                                        {getHostStats().find(h => h.host === recapDetailHost)?.meetings.map((m) => (
                                            <tr key={m.id} className="hover:bg-slate-50">
                                                <td className="px-4 py-3 text-slate-600">{m.shortDate}</td>
                                                <td className="px-4 py-3 font-bold text-slate-700">{m.title}</td>
                                                <td className="px-4 py-3">
                                                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase border ${m.type === 'Online' ? 'bg-blue-50 text-blue-600 border-blue-100' : 'bg-emerald-50 text-emerald-600 border-emerald-100'
                                                        }`}>
                                                        {m.type}
                                                    </span>
                                                </td>
                                                <td className="px-4 py-3 text-center">
                                                    <span className="bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full text-xs font-bold">
                                                        {m.costReport?.participantsCount || m.guests?.count || 0}
                                                    </span>
                                                </td>
                                                <td className="px-4 py-3 text-right font-mono text-green-600 font-bold">
                                                    {formatCurrency(m.costReport?.trainerIncentive || 0)}
                                                </td>
                                                <td className="px-4 py-3 text-right font-mono text-slate-700">
                                                    {formatCurrency(
                                                        (m.costReport?.trainerIncentive || 0) +
                                                        (m.costReport?.snackCost || 0) +
                                                        (m.costReport?.lunchCost || 0) +
                                                        (m.costReport?.otherCost || 0) +
                                                        ((m.costReport?.audienceFee || 0) * (m.costReport?.participantsCount || 0))
                                                    )}
                                                </td>
                                                <td className="px-4 py-3 text-center">
                                                    {m.costReport?.isPaid ? (
                                                        <div className="flex items-center justify-center gap-1 text-emerald-700 font-black text-xs uppercase bg-emerald-100 px-2 py-1 rounded-full">
                                                            <CheckCircle size={14} /> PAID
                                                        </div>
                                                    ) : m.costReport?.isFinalized ? (
                                                        <div className="flex items-center justify-center gap-1 text-blue-600 font-bold text-xs uppercase">
                                                            <CheckCircle size={14} /> Reported
                                                        </div>
                                                    ) : (
                                                        <span className="text-orange-500 font-bold text-xs uppercase">Pending</span>
                                                    )}
                                                </td>
                                                <td className="px-4 py-3 text-center">
                                                    <button
                                                        onClick={() => openReportModal(m)}
                                                        className="text-xs font-bold text-indigo-600 hover:text-indigo-800 hover:underline"
                                                    >
                                                        View Details
                                                    </button>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>

                            <div className="p-4 border-t border-slate-100 bg-slate-50 text-right">
                                <button onClick={() => setRecapDetailHost(null)} className="px-6 py-2 bg-white border border-slate-200 text-slate-600 font-bold rounded-xl hover:bg-slate-100 transition-colors shadow-sm">
                                    Close
                                </button>
                            </div>
                        </div>
                    </div>
                )
            }

            {/* Read-Only Detail Modal */}
            {
                selectedMeeting && (
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
                                                onClick={() => confirmDelete(selectedMeeting.id)}
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
                                                    if (!selectedMeeting) return;
                                                    try {
                                                        const parts = selectedMeeting.time.split(' - ');
                                                        const startRaw = parts[0] ? parts[0].trim() : '09:00';
                                                        const endRaw = parts[1] ? parts[1].trim() : '10:00';

                                                        // Robust Date Extraction
                                                        const baseDate = new Date(selectedMeeting.date).toISOString().split('T')[0];

                                                        // Ensure HH:mm format
                                                        const formatT = (t: string) => {
                                                            const match = t.match(/(\d{1,2}):(\d{2})/);
                                                            if (!match) return "00:00";
                                                            return `${match[1].padStart(2, '0')}:${match[2]}`;
                                                        };

                                                        const startDate = new Date(`${baseDate}T${formatT(startRaw)}`);
                                                        const endDate = new Date(`${baseDate}T${formatT(endRaw)}`);

                                                        if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) throw new Error("Invalid Date");

                                                        const fmt = (d: Date) => d.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
                                                        const text = `BEGIN:VCALENDAR\nVERSION:2.0\nBEGIN:VEVENT\nSUMMARY:${selectedMeeting.title}\nDESCRIPTION:${selectedMeeting.description}\nLOCATION:${selectedMeeting.type === 'Online' ? selectedMeeting.meetLink : selectedMeeting.location}\nDTSTART:${fmt(startDate)}\nDTEND:${fmt(endDate)}\nEND:VEVENT\nEND:VCALENDAR`;
                                                        const blob = new Blob([text], { type: 'text/calendar' });
                                                        const url = window.URL.createObjectURL(blob);
                                                        const a = document.createElement('a');
                                                        a.href = url;
                                                        a.download = `${selectedMeeting.title}.ics`;
                                                        a.click();
                                                    } catch (e) {
                                                        console.error("Error generating ICS", e);
                                                        setNotification({ show: true, type: 'error', message: "Could not generate calendar file due to invalid date format." });
                                                    }
                                                }}
                                                className="flex-1 py-2 bg-white border border-slate-200 hover:bg-white hover:border-slate-300 text-slate-600 font-bold rounded-lg text-xs transition-all shadow-sm"
                                            >
                                                Outlook / Apple
                                            </button>
                                            <button
                                                onClick={() => {
                                                    if (!selectedMeeting) return;
                                                    try {
                                                        const parts = selectedMeeting.time.split(' - ');
                                                        const startRaw = parts[0] ? parts[0].trim() : '09:00';
                                                        const endRaw = parts[1] ? parts[1].trim() : '10:00';

                                                        // Robust Date Extraction
                                                        const baseDate = new Date(selectedMeeting.date).toISOString().split('T')[0];

                                                        // Ensure HH:mm format
                                                        const formatT = (t: string) => {
                                                            const match = t.match(/(\d{1,2}):(\d{2})/);
                                                            if (!match) return "00:00";
                                                            return `${match[1].padStart(2, '0')}:${match[2]}`;
                                                        };

                                                        const startDate = new Date(`${baseDate}T${formatT(startRaw)}`);
                                                        const endDate = new Date(`${baseDate}T${formatT(endRaw)}`);

                                                        if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) throw new Error("Invalid Date");

                                                        const fmt = (d: Date) => d.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
                                                        const url = `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(selectedMeeting.title)}&details=${encodeURIComponent(selectedMeeting.description)}&location=${encodeURIComponent(selectedMeeting.type === 'Online' ? (selectedMeeting.meetLink || 'Online') : (selectedMeeting.location || ''))}&dates=${fmt(startDate)}/${fmt(endDate)}`;
                                                        window.open(url, '_blank');
                                                    } catch (e) {
                                                        console.error("Error opening Google Calendar", e);
                                                        setNotification({ show: true, type: 'error', message: "Could not open calendar due to invalid date format." });
                                                    }
                                                }}
                                                className="flex-1 py-2 bg-white border border-slate-200 hover:bg-white hover:border-slate-300 text-blue-600 font-bold rounded-lg text-xs transition-all shadow-sm text-center flex items-center justify-center"
                                            >
                                                Google Calendar
                                            </button>
                                        </div>
                                    </div>
                                    <button
                                        onClick={() => setSelectedMeeting(null)}
                                        className="w-full py-3 bg-slate-100 hover:bg-slate-200 text-slate-600 font-bold rounded-xl transition-all"
                                    >
                                        Close Details
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                )
            }
        </div >
    );
};

export default TrainingInternalList;
