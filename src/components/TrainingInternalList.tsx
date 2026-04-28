import { useState, useEffect, useRef, Fragment, type FormEvent } from 'react';
import {
    Users,
    User as UserIcon,
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
    CheckCircle,
    ChevronDown,
    Zap,
    Lock
} from 'lucide-react';
import { API_BASE_URL } from '../config';
import type { Role, Meeting, CostReport, Employee, QuizResult, User } from '../types';
import PopupNotification from './PopupNotification';
import ConfirmationModal from './ConfirmationModal';

interface TrainingInternalListProps {
    userRole: Role;
    user: User;
    isManagementMode: boolean;
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

const TrainingInternalList = ({ userRole, user, isManagementMode }: TrainingInternalListProps) => {
    const userEmail = user.email;
    // Determine effective role: in non-management mode, everyone is treated as STAFF
    const effectiveRole = isManagementMode ? userRole : 'STAFF';

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
        description: '',
        pre_test_data: null as any,
        post_test_data: null as any
    });

    // Email Invites State
    const [invitedEmails, setInvitedEmails] = useState<string[]>([]);
    const [invitedEmployeeIds, setInvitedEmployeeIds] = useState<string[]>([]);

    // --- Filter State ---
    const [viewMode, setViewMode] = useState<'list' | 'recap'>('list');
    const [recapDetailHost, setRecapDetailHost] = useState<string | null>(null);
    const [allResults, setAllResults] = useState<any[]>([]);
    const [allFeedback, setAllFeedback] = useState<any[]>([]);

    const [expandedHosts, setExpandedHosts] = useState<Record<string, boolean>>({});
    const [expandedMeetings, setExpandedMeetings] = useState<Record<number, boolean>>({});
    const [startDate, setStartDate] = useState<string>(() => {
        const d = new Date();
        const year = d.getFullYear();
        const month = d.getMonth();
        const day = d.getDate();
        
        // If today is 26th or later, start from 26th of this month
        // Otherwise, start from 26th of last month
        const start = day >= 26 
            ? new Date(year, month, 26)
            : new Date(year, month - 1, 26);
            
        return `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, '0')}-${String(start.getDate()).padStart(2, '0')}`;
    });
    const [endDate, setEndDate] = useState<string>(() => {
        const d = new Date();
        const year = d.getFullYear();
        const month = d.getMonth();
        const day = d.getDate();
        
        // If today is 26th or later, end at 25th of next month
        // Otherwise, end at 25th of this month
        const end = day >= 26
            ? new Date(year, month + 1, 25)
            : new Date(year, month, 25);
            
        return `${end.getFullYear()}-${String(end.getMonth() + 1).padStart(2, '0')}-${String(end.getDate()).padStart(2, '0')}`;
    });
    const [selectedBranch, setSelectedBranch] = useState<string>('All Branches');
    const [branches, setBranches] = useState<string[]>(['All Branches']);
    const [searchQuery, setSearchQuery] = useState(''); // Unified search term

    // Search states for dropdowns
    const [hostSearch, setHostSearch] = useState('');
    const [participantSearch, setParticipantSearch] = useState('');
    const [showHostDropdown, setShowHostDropdown] = useState(false);
    const [showParticipantDropdown, setShowParticipantDropdown] = useState(false);
    const hostDropdownRef = useRef<HTMLDivElement>(null);
    const participantDropdownRef = useRef<HTMLDivElement>(null);
    const [activeCreateTab, setActiveCreateTab] = useState<'details' | 'assessment'>('details');
    const startDateRef = useRef<HTMLInputElement>(null);
    const endDateRef = useRef<HTMLInputElement>(null);


    // Interactive Quiz/Feedback State
    const [showQuiz, setShowQuiz] = useState<'PRE' | 'POST' | null>(null);
    const [showFeedback, setShowFeedback] = useState(false);
    const [meetingQuizResults, setMeetingQuizResults] = useState<QuizResult[]>([]);
    const [meetingSummary, setMeetingSummary] = useState<{ quiz: { quiz_type: string, count: number }[], feedback: number } | null>(null);
    const [userFeedback, setUserFeedback] = useState<any>(null);

    const fetchResults = async (mid: number) => {
        if (!user.email) return;
        try {
            const encodedEmail = encodeURIComponent(user.email);
            const encodedId = encodeURIComponent(String(user.id || user.employee_id || user.email));
            const empIdForUrl = user.employee_id ? encodeURIComponent(user.employee_id) : encodedId;

            // Attempt to fetch from multiple possible endpoints to ensure coverage
            const endpoints = [
                `${API_BASE_URL}/api/quiz/results/meeting/${encodedEmail}/${mid}`,
                `${API_BASE_URL}/api/quiz/results/meeting/${encodedId}/${mid}`,
                `${API_BASE_URL}/api/quiz/results/meeting/${empIdForUrl}/${mid}`,
                `${API_BASE_URL}/api/quiz/results/${encodedEmail}/${mid}`,
                `${API_BASE_URL}/api/quiz/results/${encodedId}/${mid}`
            ];

            let allFetchedResults: QuizResult[] = [];
            for (const url of endpoints) {
                try {
                    const res = await fetch(url);
                    if (res.ok) {
                        const data = await res.json();
                        if (Array.isArray(data) && data.length > 0) {
                            allFetchedResults = [...allFetchedResults, ...data];
                        } else if (data && !Array.isArray(data) && data.score !== undefined) {
                            allFetchedResults.push(data);
                        }
                    }
                } catch (e) { /* ignore individual fetch errors */ }
            }

            // Remove duplicates (by quizType)
            const uniqueResults: QuizResult[] = [];
            const types = new Set();
            allFetchedResults.forEach(r => {
                const type = r.quizType || (r as any).quiz_type;
                if (!types.has(type)) {
                    types.add(type);
                    uniqueResults.push(r);
                }
            });
            
            if (uniqueResults.length > 0) {
                setMeetingQuizResults(uniqueResults);
            }

            // Fetch feedback - similar multi-endpoint approach if needed, but keeping it simple for now
            const fRes = await fetch(`${API_BASE_URL}/api/feedback/meeting/${encodedEmail}/${mid}`);
            if (fRes.ok) {
                const fData = await fRes.json();
                try {
                    setUserFeedback(fData?.feedback_data ? (typeof fData.feedback_data === 'string' ? JSON.parse(fData.feedback_data) : fData.feedback_data) : null);
                } catch(e) { setUserFeedback(null); }
            }

            // Fetch summary for host/HR
            if (selectedMeeting && (effectiveRole === 'HR' || effectiveRole === 'HR_ADMIN' || (user.employee_id && selectedMeeting.employee_id && user.employee_id === selectedMeeting.employee_id))) {
                try {
                    const sRes = await fetch(`${API_BASE_URL}/api/meetings/summary/${mid}`);
                    if (sRes.ok) {
                        const sData = await sRes.json();
                        setMeetingSummary(sData);
                    }
                } catch (e) { console.error("Failed to fetch summary", e); }
            }
        } catch (err) { console.error(err);        }
    };

    const toggleMeetingStatus = async (field: 'is_pre_test_active' | 'is_post_test_active' | 'is_feedback_active' | 'is_closed', currentValue: any) => {
        if (!selectedMeeting) return;
        const newValue = currentValue ? 0 : 1;
        const updatedMeeting = { ...selectedMeeting, [field]: newValue };

        try {
            const res = await fetch(`${API_BASE_URL}/api/meetings/${selectedMeeting.id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(updatedMeeting)
            });

            if (res.ok) {
                const data = await res.json();
                setSelectedMeeting(data);
                setMeetings(prev => prev.map(m => m.id === data.id ? data : m));
                setNotification({ show: true, type: 'success', message: `Status updated successfully.` });
            } else {
                throw new Error("Failed to update status.");
            }
        } catch (err) {
            console.error(err);
            setNotification({ show: true, type: 'error', message: "An error occurred while updating status." });
        }
    };

    useEffect(() => {
        if (selectedMeeting) {
            fetchResults(selectedMeeting.id);
        } else {
            setMeetingQuizResults([]);
            setUserFeedback(null);
        }
    }, [selectedMeeting]);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (hostDropdownRef.current && !hostDropdownRef.current.contains(event.target as Node)) {
                setShowHostDropdown(false);
            }
            if (participantDropdownRef.current && !participantDropdownRef.current.contains(event.target as Node)) {
                setShowParticipantDropdown(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);



    const getPeriodDates = () => {
        return [new Date(startDate), new Date(endDate + 'T23:59:59')];
    };

    // List View State
    const [listType, setListType] = useState<'active' | 'history'>('active');
    const toggleView = (view: 'list' | 'recap') => setViewMode(view);

    // --- Filtered Data ---
    const filteredMeetings = meetings.filter(m => {

        // PERMISSION CHECK: Non-HR can ONLY see meetings they are invited to OR if they are the Host
        if (effectiveRole !== 'HR' && effectiveRole !== 'HR_ADMIN') {
            const invites = m.guests?.emails || [];
            const isInvited = userEmail && invites.some(email => email.toLowerCase() === userEmail.toLowerCase());
            const isHost = (m.employee_id && user.employee_id && m.employee_id === user.employee_id) || 
                           (m.host && user.name && m.host === user.name);

            if (!isInvited && !isHost) return false;
        }

        // Active vs History Filter (Only applies to List View, Recap shows all valid for period)
        if (viewMode === 'list') {
            const isPaid = m.costReport?.isPaid;
            if (listType === 'active' && isPaid) return false;
            if (listType === 'history' && !isPaid) return false;
        }

        const d = new Date(m.date);
        const [start, end] = getPeriodDates();

        // Date Range Range
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
    }).sort((a, b) => {
        // Active first (is_closed: 0/false), then Closed (is_closed: 1/true)
        const aClosed = a.is_closed ? 1 : 0;
        const bClosed = b.is_closed ? 1 : 0;
        if (aClosed !== bClosed) return aClosed - bClosed;
        
        // Then by date latest first
        return new Date(b.date).getTime() - new Date(a.date).getTime();
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
        if (isManagementMode) {
            fetch(`${API_BASE_URL}/api/quiz/results/all`)
                .then(res => res.json())
                .then(data => setAllResults(Array.isArray(data) ? data : (data.data || [])))
                .catch(err => console.error("Failed to fetch all quiz results", err));

            fetch(`${API_BASE_URL}/api/feedback/all`)
                .then(res => res.json())
                .then(data => setAllFeedback(Array.isArray(data) ? data : (data.data || [])))
                .catch(err => console.error("Failed to fetch all feedback", err));
        }
    }, [isManagementMode]);

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
            description: (meeting.description && meeting.description !== 'No description provided.') ? meeting.description : (meeting.agenda || ''),
            pre_test_data: meeting.pre_test_data || { questions: [] },
            post_test_data: meeting.post_test_data || { questions: [] }
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

        // Assessment Validation
        const preQuestions = formData.pre_test_data?.questions || [];
        const postQuestions = formData.post_test_data?.questions || [];
        if (preQuestions.length === 0 || postQuestions.length === 0) {
            setNotification({ 
                show: true, 
                type: 'error', 
                message: 'Pre-Test and Post-Test data must be filled in the Exam Configuration tab before sending invitations.' 
            });
            setActiveCreateTab('assessment');
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
            meetLink: formData.meetLink,
            pre_test_data: formData.pre_test_data,
            post_test_data: formData.post_test_data
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
        setFormData({ title: '', date: '', startTime: '', endTime: '', host: '', host_id: '', type: 'Online', location: '', meetLink: '', description: '', pre_test_data: { questions: [] }, post_test_data: { questions: [] } });
        setInvitedEmails([]);
        setInvitedEmployeeIds([]);
        setHostSearch('');
        setParticipantSearch('');
        setShowHostDropdown(false);
        setShowParticipantDropdown(false);
        setIsEditing(false);
        setEditId(null);
        setActiveCreateTab('details');
    };


    const getHostStats = () => {
        const [start, end] = getPeriodDates();

        // chunk meetings by host
        const hosts: Record<string, ExtendedMeeting[]> = {};

        meetings.forEach(m => {
            const d = new Date(m.date);

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

    const exportHostCSV = () => {
        const stats = getHostStats();
        const headers = ["Host Name", "Employee ID", "Sessions", "Total Audience", "Trainer Incentive", "Total Cost"];
        const rows = stats.map(s => [
            s.host,
            s.host_id || '-',
            s.sessions,
            s.totalParticipants,
            s.totalTrainerIncentive,
            s.totalCost
        ]);

        const csvContent = "data:text/csv;charset=utf-8," 
            + headers.join(",") + "\n"
            + rows.map(r => r.join(",")).join("\n");

        const encodedUri = encodeURI(csvContent);
        const link = document.createElement("a");
        link.setAttribute("href", encodedUri);
        link.setAttribute("download", `Internal_Training_Hosts_${startDate}_to_${endDate}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    const exportParticipantCSV = () => {
        const dataRows: any[] = [];
        const headers = ["Date", "Meeting Title", "Host", "Participant Name", "Email", "Pre-Test", "Post-Test", "Feedback Avg", "Status"];

        const filtered = filteredMeetings;

        filtered.forEach(m => {
            const meetingResults = allResults.filter(r => 
                Number(r.meetingId || (r as any).meeting_id) === Number(m.id) &&
                !(r as any).courseId && !(r as any).course_id
            );

            const meetingFeedback = allFeedback.filter(f => 
                Number(f.meetingId || (f as any).meeting_id || (f as any).id_meeting || (f as any).trainingId || (f as any).training_id || (f as any).session_id) === Number(m.id)
            );

            const isParticipantMatch = (item: any, email: string) => {
                const itemId = (item.userEmail || item.user_email || item.userId || item.user_id || item.email || item.studentId || item.student_id || item.employee_id || item.id || '').toString().toLowerCase().trim();
                const targetId = email.toLowerCase().trim();
                if (itemId === targetId) return true;
                if (targetId.includes('@') && itemId === targetId.split('@')[0]) return true;
                const emp = (employees || []).find(e => e.email?.toLowerCase() === targetId || String(e.id_employee).toLowerCase() === targetId || String(e.id).toLowerCase() === targetId);
                if (emp) {
                    const empIds = [String(emp.id_employee).toLowerCase(), String(emp.id).toLowerCase(), emp.email?.toLowerCase()].filter(Boolean);
                    if (empIds.includes(itemId)) return true;
                    const itemName = (item.student_name || item.studentName || item.name || "").toString().toLowerCase().trim();
                    const empName = (emp.full_name || emp.name || "").toString().toLowerCase().trim();
                    return itemName && empName && itemName === empName;
                }
                return false;
            };

            const allParticipantEmails = Array.from(new Set([
                ...meetingResults.map(r => r.userEmail || r.user_email || r.userId || r.user_id || r.email || r.studentId || r.student_id || r.employee_id || r.id).filter(Boolean).map(id => String(id).toLowerCase().trim()),
                ...meetingFeedback.map(f => f.userEmail || f.user_email || f.userId || f.user_id || f.email || f.studentId || f.student_id || f.employee_id || f.id).filter(Boolean).map(id => String(id).toLowerCase().trim())
            ])).reduce((acc: string[], id) => {
                const emp = (employees || []).find(e => e.email?.toLowerCase() === id || String(e.id_employee).toLowerCase() === id || String(e.id).toLowerCase() === id);
                const primary = (emp?.email || id).toLowerCase();
                if (!acc.includes(primary)) acc.push(primary);
                return acc;
            }, []);

            allParticipantEmails.forEach(email => {
                const emp = employees.find(e => e.email?.toLowerCase() === email || String(e.id_employee).toLowerCase() === email);
                const name = emp?.full_name || email;

                const preScores = meetingResults.filter(r => isParticipantMatch(r, email) && (r.quizType || (r as any).quiz_type || "").toUpperCase().includes('PRE')).map(r => Number(r.score) || 0);
                const avgPre = preScores.length > 0 ? Math.max(...preScores) : '-';

                const postScores = meetingResults.filter(r => isParticipantMatch(r, email) && (r.quizType || (r as any).quiz_type || "").toUpperCase().includes('POST')).map(r => Number(r.score) || 0);
                const avgPost = postScores.length > 0 ? Math.max(...postScores) : '-';

                const f = meetingFeedback.find(f => isParticipantMatch(f, email));
                let avgFB: any = '-';
                if (f) {
                    const fData = f?.feedbackData || f?.feedback_data || f?.data || f?.response || f?.feedback;
                    if (fData) {
                        try {
                            const data = typeof fData === 'string' ? JSON.parse(fData) : fData;
                            const scores = Object.values(data || {}).filter(v => typeof v === 'number' || !isNaN(Number(v))).map(v => Number(v));
                            if (scores.length > 0) avgFB = (scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(1);
                        } catch(e) {}
                    }
                }

                dataRows.push([
                    new Date(m.date).toLocaleDateString(),
                    m.title.replace(/,/g, ' '),
                    m.host,
                    name.replace(/,/g, ' '),
                    email,
                    avgPre,
                    avgPost,
                    avgFB,
                    m.costReport?.isPaid ? 'Paid' : 'Pending'
                ]);
            });
        });

        const csvContent = "data:text/csv;charset=utf-8," 
            + headers.join(",") + "\n"
            + dataRows.map(r => r.join(",")).join("\n");

        const encodedUri = encodeURI(csvContent);
        const link = document.createElement("a");
        link.setAttribute("href", encodedUri);
        link.setAttribute("download", `Internal_Training_Participants_${startDate}_to_${endDate}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
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

            {/* Header / Hero Section */}
            <div className="bg-gradient-to-br from-indigo-700 via-indigo-600 to-blue-600 rounded-3xl p-8 text-white shadow-2xl relative overflow-hidden shrink-0">
                <div className="absolute top-0 right-0 p-12 opacity-10 rotate-12">
                    <Users size={180} />
                </div>
                
                <div className="relative z-10 flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
                    <div className="space-y-1.5">
                        <div className="inline-flex items-center gap-2 bg-white/10 backdrop-blur-md px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest border border-white/10 mb-2">
                            <Zap size={12} className="text-yellow-400 fill-yellow-400" /> Professional Training
                        </div>
                        <h1 className="text-3xl md:text-4xl font-black tracking-tight leading-tight">
                            Training Internal
                        </h1>
                        <p className="text-blue-100/80 font-medium max-w-md">
                            Manage sharing sessions, town halls, and internal training programs with professional standards.
                        </p>
                    </div>

                    <div className="flex flex-col sm:flex-row gap-3 w-full sm:w-auto">
                        <div className="flex bg-white/10 backdrop-blur-xl p-1.5 rounded-2xl border border-white/10 self-start">
                            <button
                                onClick={() => setListType('active')}
                                className={`px-4 py-2 text-xs font-black uppercase tracking-wider rounded-xl transition-all ${listType === 'active' ? 'bg-white text-indigo-600 shadow-xl' : 'text-blue-100 hover:text-white'}`}
                            >
                                Active
                            </button>
                            <button
                                onClick={() => setListType('history')}
                                className={`px-4 py-2 text-xs font-black uppercase tracking-wider rounded-xl transition-all ${listType === 'history' ? 'bg-white text-indigo-600 shadow-xl' : 'text-blue-100 hover:text-white'}`}
                            >
                                History
                            </button>
                        </div>

                        {isManagementMode && (
                            <div className="flex bg-white/10 backdrop-blur-xl p-1.5 rounded-2xl border border-white/10 self-start">
                                <button
                                    onClick={() => toggleView('list')}
                                    className={`px-4 py-2 text-xs font-black uppercase tracking-wider rounded-xl transition-all ${viewMode === 'list' ? 'bg-white text-indigo-600 shadow-xl' : 'text-blue-100 hover:text-white'}`}
                                >
                                    List
                                </button>
                                <button
                                    onClick={() => toggleView('recap')}
                                    className={`px-4 py-2 text-xs font-black uppercase tracking-wider rounded-xl transition-all ${viewMode === 'recap' ? 'bg-white text-indigo-600 shadow-xl' : 'text-blue-100 hover:text-white'}`}
                                >
                                    Recap
                                </button>
                            </div>
                        )}

                        {viewMode === 'list' && (effectiveRole === 'HR' || effectiveRole === 'HR_ADMIN') && isManagementMode && (
                            <button
                                onClick={() => { setIsEditing(false); resetForm(); setIsCreateOpen(true); }}
                                className="bg-white text-indigo-600 px-6 py-3.5 rounded-2xl font-black text-xs uppercase tracking-widest shadow-xl hover:bg-blue-50 transition-all flex items-center justify-center gap-2"
                            >
                                <Plus size={18} /> New Session
                            </button>
                        )}
                    </div>
                </div>
            </div>

            {/* Export Bar (Above Filter) */}
            {viewMode === 'recap' && (effectiveRole === 'HR' || effectiveRole === 'HR_ADMIN') && (
                <div className="flex justify-end gap-3 -mb-4 relative z-10">
                    <button
                        onClick={exportParticipantCSV}
                        className="bg-white border border-slate-200 text-slate-600 px-5 py-3 rounded-2xl font-black text-[10px] uppercase tracking-widest shadow-sm hover:border-indigo-500 hover:text-indigo-600 transition-all flex items-center gap-2 group"
                    >
                        <FileText size={16} className="text-slate-400 group-hover:text-indigo-500" /> Export Participants
                    </button>
                    <button
                        onClick={exportHostCSV}
                        className="bg-white border border-slate-200 text-slate-600 px-5 py-3 rounded-2xl font-black text-[10px] uppercase tracking-widest shadow-sm hover:border-indigo-500 hover:text-indigo-600 transition-all flex items-center gap-2 group"
                    >
                        <Users size={16} className="text-slate-400 group-hover:text-indigo-500" /> Export Hosts
                    </button>
                </div>
            )}

            {/* Global Filter Bar */}
            <div className="bg-white/50 backdrop-blur-md p-4 rounded-3xl shadow-[0_4px_20px_rgb(0,0,0,0.03)] border border-slate-100 flex flex-col md:flex-row gap-5 items-center justify-between mb-8">
                <div className="relative w-full md:w-96 group">
                    <div className="absolute left-4 top-3.5 text-slate-400 group-focus-within:text-indigo-500 transition-colors">
                        <Clock size={18} />
                    </div>
                    <input
                        type="text"
                        placeholder="Search Host or Title..."
                        className="w-full pl-12 pr-4 py-3 rounded-2xl border border-slate-100 bg-white focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-500 outline-none font-bold text-slate-600 text-sm transition-all shadow-sm"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                    />
                </div>

                <div className="flex flex-col sm:flex-row gap-3 w-full md:w-auto">
                    <div className="relative">
                        <select
                            value={selectedBranch}
                            onChange={(e) => setSelectedBranch(e.target.value)}
                            className="w-full sm:w-auto pl-4 pr-10 py-3 rounded-2xl border border-slate-100 bg-white font-black text-slate-600 text-[11px] uppercase tracking-wider outline-none focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-500 shadow-sm appearance-none cursor-pointer"
                        >
                            {branches.map(b => <option key={b} value={b}>{b === 'Online' ? 'Online Only' : b}</option>)}
                        </select>
                        <ChevronDown size={14} className="absolute right-4 top-4 text-slate-400 pointer-events-none" />
                    </div>

                    <div className="flex items-center gap-3 bg-white px-5 py-3 rounded-2xl border border-slate-100 shadow-sm">
                        <CalendarIcon size={14} className="text-indigo-500" />
                        <div className="flex items-center gap-2">
                            <input 
                                ref={startDateRef}
                                type="date"
                                value={startDate}
                                onChange={(e) => setStartDate(e.target.value)}
                                onClick={() => startDateRef.current?.showPicker()}
                                className="bg-transparent font-black text-slate-600 text-[11px] outline-none cursor-pointer uppercase"
                            />
                            <span className="text-slate-200 font-bold">—</span>
                            <input 
                                ref={endDateRef}
                                type="date"
                                value={endDate}
                                onChange={(e) => setEndDate(e.target.value)}
                                onClick={() => endDateRef.current?.showPicker()}
                                className="bg-transparent font-black text-slate-600 text-[11px] outline-none cursor-pointer uppercase"
                            />
                        </div>
                    </div>
                </div>
            </div>


            {
                viewMode === 'recap' && (
                    <div className="space-y-6 animate-in fade-in duration-500">
                        <div className="grid grid-cols-1 gap-4">
                            {(() => {
                                const stats = getHostStats();
                                if (stats.length === 0) return <div className="py-12 text-center text-slate-400 italic bg-white rounded-3xl border border-dashed border-slate-200">No data available for the selected period.</div>;

                                return stats.map((stat, idx) => (
                                    <div key={idx} className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm hover:shadow-md transition-all">
                                        {/* Header Row */}
                                        <div 
                                            onClick={() => setExpandedHosts(prev => ({ ...prev, [stat.host]: !prev[stat.host] }))}
                                            className="p-4 flex items-center justify-between cursor-pointer group"
                                        >
                                            <div className="flex items-center gap-4">
                                                <div className="w-12 h-12 rounded-full bg-indigo-50 flex items-center justify-center text-indigo-600 font-black text-lg group-hover:bg-indigo-600 group-hover:text-white transition-all">
                                                    {stat.host.charAt(0)}
                                                </div>
                                                <div>
                                                    <h3 className="font-bold text-slate-800 text-lg leading-tight">{stat.host}</h3>
                                                    <p className="text-xs text-slate-500 font-medium">{stat.sessions} Sessions • {stat.totalParticipants} Audience</p>
                                                </div>
                                            </div>
                                            <div className="flex items-center gap-8">
                                                <div className="text-right hidden md:block">
                                                    <span className="block text-[10px] font-black text-slate-400 uppercase tracking-widest leading-none mb-1">Trainer Incentive</span>
                                                    <span className="text-lg font-black text-emerald-600 leading-none">{formatCurrency(stat.totalTrainerIncentive)}</span>
                                                </div>
                                                <div className="text-right">
                                                    <span className="block text-[10px] font-black text-slate-400 uppercase tracking-widest leading-none mb-1">Total Cost</span>
                                                    <span className="text-xl font-black text-slate-800 leading-none">{formatCurrency(stat.totalCost)}</span>
                                                </div>
                                                <ChevronDown className={`text-slate-400 transition-transform ${expandedHosts[stat.host] ? 'rotate-180' : ''}`} />
                                            </div>
                                        </div>

                                        {/* Dropdown Content */}
                                        {expandedHosts[stat.host] && (
                                            <div className="px-4 pb-4 animate-in slide-in-from-top-2 duration-200">
                                                <div className="border border-slate-100 rounded-xl overflow-hidden bg-slate-50/30">
                                                    <table className="w-full text-left text-sm">
                                                        <thead className="bg-slate-50 text-slate-500 font-bold uppercase text-[10px] tracking-wider">
                                                            <tr>
                                                                <th className="px-6 py-3">Date</th>
                                                                <th className="px-6 py-3">Course / Session</th>
                                                                <th className="px-6 py-3 text-center">Avg Pre-Test</th>
                                                                <th className="px-6 py-3 text-center">Avg Post-Test</th>
                                                                 <th className="px-6 py-3 text-center">Avg Feedback</th>
                                                                <th className="px-6 py-3 text-center">Status</th>
                                                            </tr>
                                                        </thead>
                                                        <tbody className="divide-y divide-white">
                                                            {meetings.filter(m => m.host === stat.host).map((m) => {
                                                                const meetingResults = allResults.filter(r => 
                                                                    Number(r.meetingId || (r as any).meeting_id) === Number(m.id) &&
                                                                    !(r as any).courseId && !(r as any).course_id
                                                                );

                                                                const meetingFeedback = allFeedback.filter(f => 
                                                                    Number(f.meetingId || (f as any).meeting_id || (f as any).id_meeting || (f as any).trainingId || (f as any).training_id || (f as any).session_id) === Number(m.id)
                                                                );

                                                                // Define participant matching logic
                                                                const isParticipantMatch = (item: any, email: string) => {
                                                                    const itemId = (item.userEmail || item.user_email || item.userId || item.user_id || item.email || item.studentId || item.student_id || item.employee_id || item.id || '').toString().toLowerCase().trim();
                                                                    const targetId = email.toLowerCase().trim();
                                                                    if (itemId === targetId) return true;
                                                                    if (targetId.includes('@') && itemId === targetId.split('@')[0]) return true;
                                                                    const emp = (employees || []).find(e => e.email?.toLowerCase() === targetId || String(e.id_employee).toLowerCase() === targetId || String(e.id).toLowerCase() === targetId);
                                                                    if (emp) {
                                                                        const empIds = [String(emp.id_employee).toLowerCase(), String(emp.id).toLowerCase(), emp.email?.toLowerCase()].filter(Boolean);
                                                                        if (empIds.includes(itemId)) return true;
                                                                        const itemName = (item.student_name || item.studentName || item.name || "").toString().toLowerCase().trim();
                                                                        const empName = (emp.full_name || emp.name || "").toString().toLowerCase().trim();
                                                                        return itemName && empName && itemName === empName;
                                                                    }
                                                                    return false;
                                                                };

                                                                // Identify participants who completed ALL 3 stages
                                                                const allParticipantIds = Array.from(new Set([
                                                                    ...meetingResults.map(r => r.userEmail || r.user_email || r.userId || r.user_id || r.email || r.studentId || r.student_id || r.employee_id || r.id).filter(Boolean).map(id => String(id).toLowerCase().trim()),
                                                                    ...meetingFeedback.map(f => f.userEmail || f.user_email || f.userId || f.user_id || f.email || f.studentId || f.student_id || f.employee_id || f.id).filter(Boolean).map(id => String(id).toLowerCase().trim())
                                                                ])).reduce((acc: string[], id) => {
                                                                    const emp = (employees || []).find(e => e.email?.toLowerCase() === id || String(e.id_employee).toLowerCase() === id || String(e.id).toLowerCase() === id);
                                                                    const primary = (emp?.email || id).toLowerCase();
                                                                    if (!acc.includes(primary)) acc.push(primary);
                                                                    return acc;
                                                                }, []);

                                                                const completedParticipants = allParticipantIds.filter(email => {
                                                                    const hasPre = meetingResults.some(r => isParticipantMatch(r, email) && (r.quizType || (r as any).quiz_type || "").toUpperCase().includes('PRE'));
                                                                    const hasPost = meetingResults.some(r => isParticipantMatch(r, email) && (r.quizType || (r as any).quiz_type || "").toUpperCase().includes('POST'));
                                                                    const hasFB = meetingFeedback.some(f => isParticipantMatch(f, email));
                                                                    return hasPre && hasPost && hasFB;
                                                                });

                                                                // Calculate Averages based only on completedParticipants
                                                                const preScores = completedParticipants.map(email => {
                                                                    const scores = meetingResults.filter(r => isParticipantMatch(r, email) && (r.quizType || (r as any).quiz_type || "").toUpperCase().includes('PRE')).map(r => Number(r.score) || 0);
                                                                    return Math.max(...scores, 0);
                                                                });
                                                                const postScores = completedParticipants.map(email => {
                                                                    const scores = meetingResults.filter(r => isParticipantMatch(r, email) && (r.quizType || (r as any).quiz_type || "").toUpperCase().includes('POST')).map(r => Number(r.score) || 0);
                                                                    return Math.max(...scores, 0);
                                                                });
                                                                const fbScoresList: number[] = [];
                                                                completedParticipants.forEach(email => {
                                                                    const f = meetingFeedback.find(f => isParticipantMatch(f, email));
                                                                    const fData = f?.feedbackData || f?.feedback_data || f?.data || f?.response || f?.feedback;
                                                                    if (fData) {
                                                                        try {
                                                                            const data = typeof fData === 'string' ? JSON.parse(fData) : fData;
                                                                            const scores = Object.values(data || {}).filter(v => typeof v === 'number' || !isNaN(Number(v))).map(v => Number(v));
                                                                            if (scores.length > 0) fbScoresList.push(Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 10) / 10);
                                                                        } catch(e) {}
                                                                    }
                                                                });

                                                                const avgPre = preScores.length > 0 ? Math.round(preScores.reduce((a,b) => a+b, 0) / preScores.length) : '-';
                                                                const avgPost = postScores.length > 0 ? Math.round(postScores.reduce((a,b) => a+b, 0) / postScores.length) : '-';
                                                                const avgFeedback = fbScoresList.length > 0 ? (Math.round((fbScoresList.reduce((a,b) => a+b, 0) / fbScoresList.length) * 10) / 10).toFixed(1) : '-';

                                                                const participantEmails = allParticipantIds.filter(email => {
                                                                    return (m.guests?.emails || []).some(ge => ge.toLowerCase() === email || ge.toLowerCase().split('@')[0] === email.split('@')[0]);
                                                                });

                                                                return (
                                                                    <Fragment key={m.id}>
                                                                        <tr 
                                                                            onClick={() => setExpandedMeetings(prev => ({ ...prev, [m.id]: !prev[m.id] }))}
                                                                            className="hover:bg-white transition-colors cursor-pointer group/row"
                                                                        >
                                                                            <td className="px-6 py-4 text-slate-500 whitespace-nowrap">{new Date(m.date).toLocaleDateString('en-US', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</td>
                                                                            <td className="px-6 py-4">
                                                                                <div className="flex items-center gap-2">
                                                                                    <div className={`transition-transform duration-200 ${expandedMeetings[m.id] ? 'rotate-90' : ''}`}>
                                                                                        <ArrowRight size={14} className="text-slate-300 group-hover/row:text-indigo-500" />
                                                                                    </div>
                                                                                    <div>
                                                                                        <span className="font-bold text-slate-700 block group-hover/row:text-indigo-600 transition-colors uppercase text-xs">{m.title}</span>
                                                                                        <span className="text-[10px] text-slate-400 capitalize font-medium">{m.type} • {m.location}</span>
                                                                                    </div>
                                                                                </div>
                                                                            </td>
                                                                            <td className="px-6 py-4 text-center">
                                                                                <span className="text-xs font-black text-slate-600">{avgPre}</span>
                                                                            </td>
                                                                            <td className="px-6 py-4 text-center">
                                                                                <span className={`text-xs font-black ${avgPost !== '-' && Number(avgPost) >= 80 ? 'text-indigo-600' : 'text-slate-600'}`}>{avgPost}</span>
                                                                             </td>
                                                                             <td className="px-6 py-4 text-center">
                                                                                 <span className="text-xs font-black text-emerald-600">{avgFeedback}</span>
                                                                             </td>
                                                                            <td className="px-6 py-4 text-center whitespace-nowrap">
                                                                                <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-black uppercase border ${m.costReport?.isPaid ? 'bg-emerald-50 text-emerald-600 border-emerald-100' : 'bg-blue-50 text-blue-600 border-blue-100'}`}>
                                                                                    {m.costReport?.isPaid ? <CheckCircle size={10} /> : null}
                                                                                    {m.costReport?.isPaid ? 'Paid' : 'Pending'}
                                                                                </span>
                                                                            </td>
                                                                        </tr>
                                                                        {expandedMeetings[m.id] && (
                                                                            <tr className="bg-indigo-50/20">
                                                                                <td colSpan={5} className="p-0">
                                                                                    <div className="mx-6 my-2 border border-indigo-100/50 rounded-xl overflow-hidden bg-white shadow-inner animate-in slide-in-from-top-2 duration-200">
                                                                                        <table className="w-full text-[10px]">
                                                                                            <thead className="bg-slate-50/50 text-slate-400 font-black uppercase tracking-widest border-b border-slate-50">
                                                                                                <tr>
                                                                                                    <th className="px-6 py-3 text-left">Participant Name</th>
                                                                                                    <th className="px-4 py-2 text-center">Pre-Test</th>
                                                                                                    <th className="px-4 py-2 text-center">Post-Test</th>
                                                                                                    <th className="px-4 py-2 text-center">Feedback</th>
                                                                                                    <th className="px-4 py-2 text-right pr-6">Cost</th>
                                                                                                </tr>
                                                                                            </thead>
<tbody className="divide-y divide-slate-50">
                                                                                                {participantEmails.length === 0 ? (
                                                                                                    <tr>
                                                                                                        <td colSpan={5} className="px-4 py-4 text-center italic text-slate-400">No participants recorded for this session.</td>
                                                                                                    </tr>
                                                                                                ) : participantEmails.map(email => {
                                                                                                    const findById = (item: any, id: string) => {
                                                                                                        const sid = String(id).toLowerCase().trim();
                                                                                                        const itemAllIds = [
                                                                                                            item.userEmail, item.user_email, item.email, 
                                                                                                            item.userId, item.user_id, item.studentId, item.student_id, item.employee_id,
                                                                                                            item.id_user, item.id_student, item.id
                                                                                                        ].filter(Boolean).map(v => String(v).toLowerCase().trim());

                                                                                                        if (itemAllIds.includes(sid)) return true;

                                                                                                        const emp = (employees || []).find(e => 
                                                                                                            e.email?.toLowerCase() === sid || 
                                                                                                            String(e.id_employee).toLowerCase() === sid || 
                                                                                                            String(e.id).toLowerCase() === sid
                                                                                                        );
                                                                                                        
                                                                                                        if (emp) {
                                                                                                            const empIds = [
                                                                                                                emp.email,
                                                                                                                String(emp.id_employee),
                                                                                                                String(emp.id),
                                                                                                                emp.email?.split('@')[0]
                                                                                                            ].filter(Boolean).map(v => String(v).toLowerCase().trim());

                                                                                                            const idMatch = itemAllIds.some(iid => empIds.includes(iid)); if (idMatch) return true; const iName = (item.student_name || item.studentName || item.name || "").toString().toLowerCase().trim(); const eName = (emp.full_name || emp.name || "").toString().toLowerCase().trim(); return iName && eName && iName === eName;
                                                                                                        }
                                                                                                        return false;
                                                                                                    };

                                                                                                    const participantQuizRes = meetingResults.filter(r => findById(r, email));
                                                                                                    const preData = participantQuizRes.filter(r => (r.quizType || (r as any).quiz_type || "").toUpperCase().includes('PRE')).sort((a,b) => (Number(b.score)||0) - (Number(a.score)||0))[0];
                                                                                                    const postData = participantQuizRes.filter(r => (r.quizType || (r as any).quiz_type || "").toUpperCase().includes('POST')).sort((a,b) => (Number(b.score)||0) - (Number(a.score)||0))[0];
                                                                                                    
                                                                                                    const pre = preData ? preData.score : '-';
                                                                                                    const post = postData ? postData.score : '-';
                                                                                                    const fItem = meetingFeedback.find(f => {
                                                                                                        const fId = (f.userEmail || f.user_email || f.userId || f.user_id || f.studentId || f.student_id || f.email || '').toString().toLowerCase().trim();
                                                                                                        const targetId = email.toLowerCase().trim();
                                                                                                        return fId === targetId || (targetId.includes('@') && fId === targetId.split('@')[0]);
                                                                                                     });
                                                                                                    
                                                                                                    const emp = (employees || []).find(e => 
                                                                                                        e.email?.toLowerCase() === email.toLowerCase() ||
                                                                                                        String(e.id_employee) === email ||
                                                                                                        String(e.id) === email
                                                                                                    );
                                                                                                    
                                                                                                    let feedbackDisplay = <span className="text-slate-300">-</span>;
                                                                                                    let targetFeedback = fItem || meetingFeedback.find(f => findById(f, email));
                                                                                                    
                                                                                                    // Global fallback search if not found in meeting list
                                                                                                    if (!targetFeedback) {
                                                                                                        targetFeedback = allFeedback.find(f => {
                                                                                                            const isUserMatch = (f.userEmail || f.user_email || f.userId || f.user_id || f.studentId || f.student_id || f.email || '').toString().toLowerCase().trim() === email.toLowerCase().trim();
                                                                                                            const isMeetingMatch = Number(f.meetingId || (f as any).meeting_id || (f as any).id_meeting || (f as any).trainingId || (f as any).training_id || (f as any).session_id) === Number(m.id);
                                                                                                            return isUserMatch && isMeetingMatch;
                                                                                                        });
                                                                                                    }
                                                                                                    
                                                                                                    if (targetFeedback) {
                                                                                                        const fData = targetFeedback.feedbackData || targetFeedback.feedback_data;
                                                                                                        if (fData) {
                                                                                                            try {
                                                                                                                const data = typeof fData === 'string' ? JSON.parse(fData) : fData;
                                                                                                                const scores = Object.values(data || {}).filter(v => typeof v === 'number' || !isNaN(Number(v))) as any[];
                                                                                                                if (scores.length > 0) {
                                                                                                                    const numericScores = scores.map(s => Number(s));
                                                                                                                    const avg = Math.round((numericScores.reduce((a, b) => a + b, 0) / numericScores.length) * 10) / 10;
                                                                                                                    feedbackDisplay = <span className="text-emerald-600 font-bold">{avg} / 4</span>;
                                                                                                                } else {
                                                                                                                    feedbackDisplay = <span className="text-emerald-500 font-bold">Sent</span>;
                                                                                                                }
                                                                                                            } catch(e) {
                                                                                                                feedbackDisplay = <span className="text-emerald-500 font-bold">Sent</span>;
                                                                                                            }
                                                                                                        } else {
                                                                                                            feedbackDisplay = <span className="text-emerald-500 font-bold">Sent</span>;
                                                                                                        }
                                                                                                    }

                                                                                                    return (
                                                                                                        <tr key={email} className="hover:bg-slate-50/50">
                                                                                                            <td className="px-4 py-2 text-slate-600 font-semibold">{emp?.full_name || email}</td>
                                                                                                            <td className="px-4 py-2 text-center font-bold text-slate-500">{pre}</td>
                                                                                                            <td className="px-4 py-2 text-center font-bold text-indigo-600">{post}</td>
                                                                                                            <td className="px-4 py-2 text-center">{feedbackDisplay}</td>
                                                                                                            <td className="px-4 py-2 text-right pr-6 font-bold text-slate-700">
                                                                                                                {(() => {
                                                                                                                    const totalCost = (m.costReport?.trainerIncentive || 0) + 
                                                                                                                                    (m.costReport?.snackCost || 0) + 
                                                                                                                                    (m.costReport?.lunchCost || 0) + 
                                                                                                                                    (m.costReport?.otherCost || 0);
                                                                                                                    const cpp = participantEmails.length > 0 ? totalCost / participantEmails.length : 0;
                                                                                                                    return cpp > 0 ? formatCurrency(cpp) : '-';
                                                                                                                })()}
                                                                                                            </td>
                                                                                                        </tr>
                                                                                                    );
                                                                                                })}
                                                                                            </tbody>
                                                                                        </table>
                                                                                    </div>
                                                                                </td>
                                                                            </tr>
                                                                        )}
                                                                    </Fragment>
                                                                );
                                                            })}
                                                        </tbody>
                                                    </table>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                ));
                            })()}
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
                                    className="group bg-white rounded-[2.5rem] p-8 border border-slate-100 shadow-[0_8px_30px_rgb(0,0,0,0.04)] hover:shadow-[0_20px_50px_rgb(0,0,0,0.08)] hover:-translate-y-2 transition-all duration-500 cursor-pointer relative overflow-hidden flex flex-col h-full active:scale-[0.98]"
                                    onClick={() => setSelectedMeeting(meeting)}
                                >
                                    {/* Accent Blob */}
                                    <div className={`absolute -right-6 -top-6 w-32 h-32 rounded-full opacity-5 group-hover:opacity-10 transition-opacity duration-700 blur-3xl ${meeting.type === 'Online' ? 'bg-blue-500' : 'bg-emerald-500'}`}></div>

                                    <div className="flex justify-between items-start mb-6">
                                        <div className="bg-slate-50 p-0.5 rounded-2xl border border-slate-100 shadow-inner overflow-hidden min-w-[70px]">
                                            <div className="bg-indigo-600 text-white py-1 px-2 text-[9px] font-black uppercase tracking-widest text-center">
                                                {(meeting.shortDate || 'TBD TBD').split(' ')[1]}
                                            </div>
                                            <div className="py-2 px-2 text-2xl font-black text-slate-800 leading-none text-center">
                                                {(meeting.shortDate || 'TBD').split(' ')[0]}
                                            </div>
                                        </div>
                                        <div className="flex flex-col items-end gap-2">
                                            {meeting.is_closed && (
                                                <span className="px-3 py-1 rounded-xl text-[9px] font-black uppercase tracking-widest bg-red-50 text-red-600 border border-red-100/50 flex items-center gap-1.5 shadow-sm">
                                                    <Lock size={10} /> CLOSED
                                                </span>
                                            )}
                                            <span className={`px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-widest border shadow-sm ${meeting.type === 'Online'
                                                ? 'bg-blue-50 text-blue-600 border-blue-100/50'
                                                : meeting.type === 'Hybrid' ? 'bg-purple-50 text-purple-600 border-purple-100/50' : 'bg-emerald-50 text-emerald-600 border-emerald-100/50'
                                                }`}>
                                                {meeting.type}
                                            </span>
                                        </div>
                                    </div>

                                    <h3 className="font-black text-xl text-slate-800 mb-3 line-clamp-2 leading-[1.2] group-hover:text-indigo-600 transition-colors tracking-tight">
                                        {meeting.title}
                                    </h3>

                                    <div className="space-y-3 mb-8">
                                        <div className="flex items-center gap-3 text-[11px] font-bold text-slate-500 bg-slate-50/50 p-2 rounded-xl border border-transparent group-hover:border-slate-100 transition-all">
                                            <Clock size={16} className="text-indigo-400" />
                                            {meeting.time}
                                        </div>
                                        <div className="flex items-center gap-3 text-[11px] font-bold text-slate-500 bg-slate-50/50 p-2 rounded-xl border border-transparent group-hover:border-slate-100 transition-all">
                                            <MapPin size={16} className="text-indigo-400" />
                                            <span className="line-clamp-1">{meeting.location || 'Online'}</span>
                                        </div>
                                        <div className="flex items-center gap-3 text-[11px] font-bold text-slate-500 bg-slate-50/50 p-2 rounded-xl border border-transparent group-hover:border-slate-100 transition-all">
                                            <div className="w-5 h-5 rounded-full bg-indigo-600 flex items-center justify-center text-[10px] font-black text-white shadow-lg shadow-indigo-200">
                                                {meeting.host.charAt(0)}
                                            </div>
                                            <span className="opacity-80">Host:</span> <span className="text-slate-700">{meeting.host}</span>
                                        </div>
                                    </div>

                                    <div className="flex items-center justify-between border-t border-slate-100 pt-6 mt-auto">
                                        <div className="space-y-1">
                                            <div className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Audience</div>
                                            <AvatarStack count={meeting.guests?.count || 0} />
                                        </div>

                                        <div className="flex items-center gap-3">
                                            {(effectiveRole === 'HR' || effectiveRole === 'HR_ADMIN') && (
                                                <div className="flex gap-2">
                                                    <button
                                                        onClick={(e) => { e.stopPropagation(); openReportModal(meeting); }}
                                                        className="w-10 h-10 flex items-center justify-center rounded-2xl bg-slate-50 text-slate-400 hover:bg-emerald-50 hover:text-emerald-600 transition-all border border-transparent hover:border-emerald-100 shadow-sm"
                                                        title="Financial Report"
                                                    >
                                                        <DollarSign size={18} />
                                                    </button>
                                                    <button
                                                        onClick={(e) => { e.stopPropagation(); openEditModal(meeting); }}
                                                        className="w-10 h-10 flex items-center justify-center rounded-2xl bg-slate-50 text-slate-400 hover:bg-blue-50 hover:text-blue-600 transition-all border border-transparent hover:border-blue-100 shadow-sm"
                                                        title="Edit Meeting"
                                                    >
                                                        <FileText size={18} />
                                                    </button>
                                                </div>
                                            )}
                                            <div className="w-12 h-12 rounded-2xl bg-slate-50 flex items-center justify-center text-slate-400 group-hover:bg-indigo-600 group-hover:text-white group-hover:shadow-xl group-hover:shadow-indigo-200 transition-all duration-500">
                                                <ArrowRight size={20} />
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

                            <div className="flex border-b border-slate-100 bg-slate-50/50">
                                <button 
                                    type="button"
                                    onClick={() => setActiveCreateTab('details')} 
                                    className={`flex-1 py-3 text-[10px] font-black uppercase tracking-widest transition-all ${activeCreateTab === 'details' ? 'text-indigo-600 border-b-2 border-indigo-600 bg-white' : 'text-slate-400 hover:text-slate-600'}`}
                                >
                                    Session Details
                                </button>
                                <button 
                                    type="button"
                                    onClick={() => setActiveCreateTab('assessment')} 
                                    className={`flex-1 py-3 text-[10px] font-black uppercase tracking-widest transition-all ${activeCreateTab === 'assessment' ? 'text-indigo-600 border-b-2 border-indigo-600 bg-white' : 'text-slate-400 hover:text-slate-600'}`}
                                >
                                    Exam Configuration
                                </button>
                            </div>

                            <div className="overflow-y-auto p-6 space-y-5 custom-scrollbar">
                                {activeCreateTab === 'details' ? (
                                    <>
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
                                            min={new Date().toISOString().split('T')[0]}
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
                                        <div className="relative" ref={hostDropdownRef}>
                                            <input
                                                type="text"
                                                placeholder={formData.host || "Search Host..."}
                                                className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none bg-white font-semibold text-slate-700"
                                                value={hostSearch}
                                                onFocus={() => setShowHostDropdown(true)}
                                                onChange={(e) => setHostSearch(e.target.value)}
                                            />
                                            <div className="absolute right-4 top-3.5 pointer-events-none text-slate-400">
                                                <Users size={16} />
                                            </div>

                                            {showHostDropdown && (
                                                <div className="absolute z-50 w-full mt-2 bg-white border border-slate-200 rounded-xl shadow-xl max-h-60 overflow-y-auto">
                                                    {(function() {
                                                        const filtered = employees.filter(emp =>
                                                            emp.full_name?.toLowerCase().includes(hostSearch.toLowerCase()) ||
                                                            emp.id_employee?.toLowerCase().includes(hostSearch.toLowerCase())
                                                        ).slice(0, 50);

                                                        if (filtered.length === 0) {
                                                            return <div className="p-4 text-center text-xs text-slate-400 italic">No matching hosts found.</div>;
                                                        }

                                                        return filtered.map(emp => (
                                                            <button
                                                                key={emp.id_employee}
                                                                type="button"
                                                                className="w-full text-left px-4 py-2.5 hover:bg-slate-50 text-sm border-b border-slate-50 last:border-none flex flex-col"
                                                                onClick={() => {
                                                                    setFormData({ ...formData, host_id: emp.id_employee, host: emp.full_name });
                                                                    setHostSearch("");
                                                                    setShowHostDropdown(false);
                                                                }}
                                                            >
                                                                <span className="font-bold text-slate-700">{emp.full_name}</span>
                                                                <span className="text-[10px] text-slate-400">{emp.id_employee} • {emp.branch_name}</span>
                                                            </button>
                                                        ));
                                                    })()}
                                                </div>
                                            )}
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
                                        <div className="relative" ref={participantDropdownRef}>
                                            <input
                                                type="text"
                                                placeholder="Search & Add Employee..."
                                                className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none bg-white text-sm font-semibold text-slate-700"
                                                value={participantSearch}
                                                onFocus={() => setShowParticipantDropdown(true)}
                                                onChange={(e) => setParticipantSearch(e.target.value)}
                                            />
                                            {showParticipantDropdown && (
                                                <div className="absolute z-50 w-full mt-2 bg-white border border-slate-200 rounded-xl shadow-xl max-h-60 overflow-y-auto">
                                                    {(function() {
                                                        const filtered = employees.filter(emp =>
                                                            !invitedEmployeeIds.includes(emp.id_employee) &&
                                                            (emp.full_name?.toLowerCase().includes(participantSearch.toLowerCase()) ||
                                                                emp.id_employee?.toLowerCase().includes(participantSearch.toLowerCase()))
                                                        ).slice(0, 50);

                                                        if (filtered.length === 0) {
                                                            return <div className="p-4 text-center text-xs text-slate-400 italic">No matching employees found.</div>;
                                                        }

                                                        return filtered.map(emp => (
                                                            <button
                                                                key={emp.id_employee}
                                                                type="button"
                                                                className="w-full text-left px-4 py-2.5 hover:bg-slate-50 text-sm border-b border-slate-50 last:border-none flex flex-col"
                                                                onClick={() => {
                                                                    if (!invitedEmployeeIds.includes(emp.id_employee)) {
                                                                        setInvitedEmployeeIds([...invitedEmployeeIds, emp.id_employee]);
                                                                        if (emp.email && !invitedEmails.includes(emp.email)) {
                                                                            setInvitedEmails([...invitedEmails, emp.email]);
                                                                        }
                                                                    }
                                                                    setParticipantSearch("");
                                                                    setShowParticipantDropdown(false);
                                                                }}
                                                            >
                                                                <span className="font-bold text-slate-700">{emp.full_name}</span>
                                                                <span className="text-[10px] text-slate-400">{emp.id_employee} • {emp.branch_name}</span>
                                                            </button>
                                                        ));
                                                    })()}
                                                </div>
                                            )}
                                        </div>

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
                                    </>
                                ) : (
                                    <div className="space-y-8 pb-10">
                                        <QuizEditor 
                                            type="Pre-Test" 
                                            data={formData.pre_test_data} 
                                            onChange={(data: any) => setFormData({ ...formData, pre_test_data: data })} 
                                        />
                                        <QuizEditor 
                                            type="Post-Test" 
                                            data={formData.post_test_data} 
                                            onChange={(data: any) => setFormData({ ...formData, post_test_data: data })} 
                                        />
                                    </div>
                                )}
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
                            <div className="p-6 space-y-5 overflow-y-auto custom-scrollbar">
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
                                            (reportData.otherCost || 0)
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
                                    <p className="text-xs text-slate-500 font-medium">{startDate} - {endDate} • {selectedBranch}</p>
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
                            className="bg-white w-full max-w-md rounded-2xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200 border border-white/20 flex flex-col max-h-[90vh]"
                            onClick={(e) => e.stopPropagation()}
                        >
                            <div className="relative h-32 flex-shrink-0 bg-gradient-to-r from-indigo-500 to-purple-500">
                                <div className="absolute top-4 right-4 flex gap-2">
                                    {(effectiveRole === 'HR' || effectiveRole === 'HR_ADMIN') && (
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

                            <div className="flex-1 overflow-y-auto pt-10 px-6 pb-6 custom-scrollbar">
                                <h2 className="text-2xl font-bold text-slate-800 mb-1 leading-snug">{selectedMeeting.title}</h2>
                                <p className="text-slate-500 font-medium text-sm mb-6 flex items-center gap-2">
                                    <span className="bg-slate-100 px-2 py-0.5 rounded text-slate-600">{selectedMeeting.type}</span>
                                    {selectedMeeting.is_closed ? (
                                        <span className="bg-red-500 px-2 py-0.5 rounded text-white text-[10px] font-black flex items-center gap-1">
                                            <Lock size={10} /> CLOSED
                                        </span>
                                    ) : (
                                        <span className="bg-emerald-500 px-2 py-0.5 rounded text-white text-[10px] font-black flex items-center gap-1">
                                            <Zap size={10} className="animate-pulse" /> ACTIVE
                                        </span>
                                    )}
                                    <span>•</span>
                                    {new Date(selectedMeeting.date).toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
                                </p>

                                <div className="space-y-4">
                                    <div className="flex gap-4">
                                        <div className="w-8 flex justify-center pt-0.5"><UserIcon className="text-slate-400" size={20} /></div>
                                        <div>
                                            <p className="font-semibold text-slate-700 text-sm">Host</p>
                                            <p className="text-sm text-slate-600">{selectedMeeting.host}</p>
                                        </div>
                                    </div>

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
                                                        const baseDate = new Date(selectedMeeting.date).toISOString().split('T')[0];
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
                                                        console.error(e);
                                                        setNotification({ show: true, type: 'error', message: "Failed to create calendar file." });
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
                                                        const baseDate = new Date(selectedMeeting.date).toISOString().split('T')[0];
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
                                                        console.error(e);
                                                        setNotification({ show: true, type: 'error', message: "Failed to open Google Calendar." });
                                                    }
                                                }}
                                                className="flex-1 py-2 bg-white border border-slate-200 hover:bg-white hover:border-slate-300 text-blue-600 font-bold rounded-lg text-xs transition-all shadow-sm text-center flex items-center justify-center"
                                            >
                                                Google Calendar
                                            </button>
                                        </div>
                                    </div>
                                </div>
                                 {/* Assessment Section */}
                                 {(() => {
                                     const isHostOrHR = effectiveRole === 'HR' || effectiveRole === 'HR_ADMIN' || (user.employee_id && selectedMeeting.employee_id && user.employee_id === selectedMeeting.employee_id);
                                     
                                     return (
                                         <div className="mt-6 space-y-3 border-t border-slate-100 pt-6">
                                             <div className="flex items-center justify-between mb-1">
                                                 <div className="flex items-center gap-2">
                                                     <h4 className="text-xs font-black text-slate-500 uppercase tracking-wider">Assessment & Feedback</h4>
                                                     {isHostOrHR && !selectedMeeting.is_closed && (
                                                         <span className="flex items-center gap-1 text-[8px] bg-indigo-50 text-indigo-600 px-1.5 py-0.5 rounded font-black border border-indigo-100">
                                                             <Zap size={8} /> HOST CONTROL
                                                         </span>
                                                     )}
                                                 </div>
                                                 <div className="flex items-center gap-1 text-[10px] text-indigo-500 font-bold">
                                                     <CheckCircle size={12} /> REQUIRED
                                                 </div>
                                             </div>

                                             {!!isHostOrHR && (
                                                <div className="flex flex-col gap-2">
                                                    {!selectedMeeting.is_closed ? (
                                                        <button 
                                                            onClick={() => {
                                                                if (window.confirm("Apakah Anda yakin ingin menutup sesi ini? Setelah ditutup, peserta tidak akan bisa lagi mengakses assessment dan feedback.")) {
                                                                    toggleMeetingStatus('is_closed', false);
                                                                }
                                                            }}
                                                            className="w-full mb-2 py-2 bg-red-50 hover:bg-red-100 text-red-600 text-xs font-black rounded-xl border border-red-200 flex items-center justify-center gap-2 transition-all shadow-sm"
                                                        >
                                                            <Lock size={14} /> CLOSE SESSION
                                                        </button>
                                                    ) : (
                                                        <div className="w-full mb-4 py-2 bg-slate-100 text-slate-500 text-xs font-black rounded-xl border border-slate-200 flex items-center justify-center gap-2 shadow-sm">
                                                            <Lock size={14} /> SESSION CLOSED
                                                        </div>
                                                    )}

                                                    {!!meetingSummary && (
                                                        <div className="mb-4 p-4 bg-slate-50 rounded-2xl border border-slate-100 flex flex-col gap-2 shadow-inner">
                                                            <div className="flex justify-between items-center">
                                                                <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Sudah Selesai</span>
                                                                <span className="text-sm font-black text-emerald-600 bg-emerald-50 px-3 py-0.5 rounded-full border border-emerald-100">
                                                                    {meetingSummary.feedback || 0}
                                                                </span>
                                                            </div>
                                                            <div className="flex justify-between items-center">
                                                                <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Belum Selesai</span>
                                                                <span className="text-sm font-black text-orange-600 bg-orange-50 px-3 py-0.5 rounded-full border border-orange-100">
                                                                    {Math.max(0, (selectedMeeting.guests?.emails?.length || 0) - (meetingSummary.feedback || 0))}
                                                                </span>
                                                            </div>
                                                        </div>
                                                    )}
                                                </div>
                                             )}

                                            <div className="space-y-2">
                                                {/* Pre-Test */}
                                                <div className="flex flex-col gap-2">
                                                    <button
                                                        onClick={() => {
                                                            if (isHostOrHR) return; // Host doesn't take the test here
                                                            if (selectedMeeting.is_closed) {
                                                                setNotification({ show: true, type: 'error', message: "Sesi ini sudah ditutup oleh Host." });
                                                                return;
                                                            }
                                                            if (!selectedMeeting.is_pre_test_active) {
                                                                setNotification({ show: true, type: 'error', message: "Pre-Test belum dibuka oleh Host." });
                                                                return;
                                                            }
                                                            if (meetingQuizResults.find(r => r.quizType === 'PRE')) return;
                                                            setShowQuiz('PRE');
                                                        }}
                                                        className={`w-full group bg-white border border-slate-200 p-3 rounded-xl flex items-center justify-between transition-all 
                                                            ${(meetingQuizResults.find(r => (r.quizType || "").toUpperCase().includes('PRE')) || isHostOrHR) 
                                                                ? 'cursor-default' 
                                                                : (selectedMeeting.is_pre_test_active && !selectedMeeting.is_closed) ? 'hover:border-indigo-300 cursor-pointer' : 'opacity-60 cursor-not-allowed'}`}
                                                    >
                                                        <div className="flex items-center gap-3">
                                                            <div className={`w-8 h-8 rounded-lg flex items-center justify-center transition-all ${
                                                                meetingQuizResults.find(r => r.quizType === 'PRE')
                                                                    ? 'bg-slate-100 text-slate-400'
                                                                    : (!selectedMeeting.is_pre_test_active || selectedMeeting.is_closed) && !isHostOrHR
                                                                        ? 'bg-slate-50 text-slate-300'
                                                                        : 'bg-orange-50 text-orange-600 group-hover:bg-orange-500 group-hover:text-white'
                                                            }`}>
                                                                {(selectedMeeting.is_pre_test_active && !selectedMeeting.is_closed) ? <FileText size={16} /> : <Lock size={16} />}
                                                            </div>
                                                            <div className="text-left">
                                                                <p className="font-bold text-slate-800 text-xs">Pre-Test Assessment</p>
                                                                <p className="text-[10px] text-slate-400">Evaluasi sebelum materi</p>
                                                            </div>
                                                        </div>
                                                        <div className="flex items-center gap-3">
                                                            {(() => {
                                                                const res = meetingQuizResults.find(r => {
                                                                    const type = (r.quizType || "").toUpperCase();
                                                                    const midMatches = Number(r.meetingId || (r as any).meeting_id) === Number(selectedMeeting.id);
                                                                    return (type === 'PRE' || type === 'PRE-TEST') && midMatches;
                                                                });
                                                                return res && <span className="text-[10px] font-black text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-100">Score: {res.score}</span>;
                                                            })()}
                                                            {!isHostOrHR && selectedMeeting.is_pre_test_active && !meetingQuizResults.find(r => r.quizType === 'PRE') && <ArrowRight size={14} className="text-slate-300 group-hover:text-indigo-500" />}
                                                        </div>
                                                    </button>
                                                    
                                                    {isHostOrHR && !selectedMeeting.is_closed && (
                                                        <div className="flex items-center justify-between px-3 py-2 bg-slate-50 rounded-lg border border-slate-100">
                                                            <div className="flex flex-col">
                                                                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Akses Pre-Test</span>
                                                            </div>
                                                            <button 
                                                                onClick={() => toggleMeetingStatus('is_pre_test_active', selectedMeeting.is_pre_test_active)}
                                                                className={`px-3 py-1 rounded-full text-[10px] font-black transition-all border ${selectedMeeting.is_pre_test_active 
                                                                    ? 'bg-emerald-500 text-white border-emerald-600' 
                                                                    : 'bg-white text-slate-400 border-slate-200'}`}
                                                            >
                                                                {selectedMeeting.is_pre_test_active ? 'AKTIF' : 'NON-AKTIF'}
                                                            </button>
                                                        </div>
                                                    )}
                                                </div>

                                                {/* Post-Test */}
                                                <div className="flex flex-col gap-2">
                                                    <button
                                                        onClick={() => {
                                                            if (isHostOrHR) return;
                                                            if (selectedMeeting.is_closed) {
                                                                setNotification({ show: true, type: 'error', message: "Sesi ini sudah ditutup oleh Host." });
                                                                return;
                                                            }
                                                            if (!selectedMeeting.is_post_test_active) {
                                                                setNotification({ show: true, type: 'error', message: "Post-Test belum dibuka oleh Host." });
                                                                return;
                                                            }
                                                            const preRes = meetingQuizResults.find(r => (r.quizType || "").toUpperCase().includes('PRE'));
                                                            if (!preRes) {
                                                                setNotification({ show: true, type: 'error', message: "Silakan kerjakan Pre-Test terlebih dahulu." });
                                                                return;
                                                            }
                                                            const postRes = meetingQuizResults.find(r => (r.quizType || "").toUpperCase().includes('POST'));
                                                            if (postRes && (Number(postRes.score) || 0) >= 80) return;
                                                            setShowQuiz('POST');
                                                        }}
                                                        className={`w-full group bg-white border border-slate-200 p-3 rounded-xl flex items-center justify-between transition-all 
                                                            ${(() => {
                                                                if (isHostOrHR) return 'cursor-default';
                                                                if (selectedMeeting.is_closed || !selectedMeeting.is_post_test_active) return 'opacity-60 cursor-not-allowed';
                                                                const preRes = meetingQuizResults.find(r => (r.quizType || "").toUpperCase().includes('PRE'));
                                                                const postRes = meetingQuizResults.find(r => (r.quizType || "").toUpperCase().includes('POST'));
                                                                if (!preRes) return 'opacity-60 cursor-not-allowed';
                                                                return (postRes && (Number(postRes.score) || 0) >= 80) ? 'cursor-default' : 'hover:border-indigo-300 cursor-pointer';
                                                            })()}`}
                                                    >
                                                        <div className="flex items-center gap-3">
                                                            <div className={`w-8 h-8 rounded-lg flex items-center justify-center transition-all ${(() => {
                                                                const postRes = meetingQuizResults.find(r => (r.quizType || "").toUpperCase().includes('POST'));
                                                                if (postRes && (Number(postRes.score) || 0) >= 80) return 'bg-emerald-100 text-emerald-600';
                                                                if ((selectedMeeting.is_closed || !selectedMeeting.is_post_test_active) && !isHostOrHR) return 'bg-slate-50 text-slate-300';
                                                                return 'bg-indigo-50 text-indigo-600 group-hover:bg-indigo-500 group-hover:text-white';
                                                            })()}`}>
                                                                {(selectedMeeting.is_post_test_active && !selectedMeeting.is_closed) ? <CheckCircle size={16} /> : <Lock size={16} />}
                                                            </div>
                                                            <div className="text-left">
                                                                <p className="font-bold text-slate-800 text-xs">Post-Test Assessment</p>
                                                                <p className="text-[10px] text-slate-400">Syarat kelulusan (Min. 80)</p>
                                                            </div>
                                                        </div>
                                                        <div className="flex items-center gap-3">
                                                            {(() => {
                                                                const res = meetingQuizResults.find(r => (r.quizType || "").toUpperCase().includes('POST'));
                                                                return res && <span className="text-[10px] font-black text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-100">Score: {res.score}</span>;
                                                            })()}
                                                            {!isHostOrHR && selectedMeeting.is_post_test_active && !meetingQuizResults.find(r => r.quizType === 'POST') && <ArrowRight size={14} className="text-slate-300 group-hover:text-indigo-500" />}
                                                        </div>
                                                    </button>
                                                    
                                                    {isHostOrHR && !selectedMeeting.is_closed && (
                                                        <div className="flex items-center justify-between px-3 py-2 bg-slate-50 rounded-lg border border-slate-100">
                                                            <div className="flex flex-col">
                                                                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Akses Post-Test</span>
                                                            </div>
                                                            <button 
                                                                onClick={() => toggleMeetingStatus('is_post_test_active', selectedMeeting.is_post_test_active)}
                                                                className={`px-3 py-1 rounded-full text-[10px] font-black transition-all border ${selectedMeeting.is_post_test_active 
                                                                    ? 'bg-emerald-500 text-white border-emerald-600' 
                                                                    : 'bg-white text-slate-400 border-slate-200'}`}
                                                            >
                                                                {selectedMeeting.is_post_test_active ? 'AKTIF' : 'NON-AKTIF'}
                                                            </button>
                                                        </div>
                                                    )}
                                                </div>

                                                {/* Feedback */}
                                                <div className="flex flex-col gap-2">
                                                    <button
                                                        onClick={() => {
                                                            if (isHostOrHR) return;
                                                            if (selectedMeeting.is_closed) {
                                                                setNotification({ show: true, type: 'error', message: "Sesi ini sudah ditutup oleh Host." });
                                                                return;
                                                            }
                                                            if (!selectedMeeting.is_feedback_active) {
                                                                setNotification({ show: true, type: 'error', message: "Form Feedback belum dibuka oleh Host." });
                                                                return;
                                                            }
                                                            const postRes = meetingQuizResults.find(r => (r.quizType || "").toUpperCase().includes('POST'));
                                                            if (!postRes || (Number(postRes.score) || 0) < 80) {
                                                                setNotification({ show: true, type: 'error', message: "Anda harus lulus Post-Test (Skor >= 80) sebelum mengisi feedback." });
                                                                return;
                                                            }
                                                            if (userFeedback) return;
                                                            setShowFeedback(true);
                                                        }}
                                                        className={`w-full group bg-white border border-slate-200 p-3 rounded-xl flex items-center justify-between transition-all 
                                                            ${(userFeedback || isHostOrHR) 
                                                                ? 'cursor-default' 
                                                                : (() => {
                                                                    const postRes = meetingQuizResults.find(r => (r.quizType || "").toUpperCase().includes('POST'));
                                                                    const hasPassed = postRes && (Number(postRes.score) || 0) >= 80;
                                                                    return (selectedMeeting.is_feedback_active && !selectedMeeting.is_closed && hasPassed) ? 'hover:border-indigo-300 cursor-pointer' : 'opacity-60 cursor-not-allowed';
                                                                })()}`}
                                                    >
                                                        <div className="flex items-center gap-3">
                                                            <div className={`w-8 h-8 rounded-lg flex items-center justify-center transition-all ${(() => {
                                                                const postRes = meetingQuizResults.find(r => (r.quizType || "").toUpperCase().includes('POST'));
                                                                const hasPassed = postRes && (Number(postRes.score) || 0) >= 80;
                                                                if (userFeedback) return 'bg-emerald-100 text-emerald-600';
                                                                if ((!selectedMeeting.is_feedback_active || selectedMeeting.is_closed || (!hasPassed && !isHostOrHR))) return 'bg-slate-50 text-slate-300';
                                                                return 'bg-purple-50 text-purple-600 group-hover:bg-purple-500 group-hover:text-white';
                                                            })()}`}>
                                                                {(() => {
                                                                    const postRes = meetingQuizResults.find(r => (r.quizType || "").toUpperCase().includes('POST'));
                                                                    const hasPassed = postRes && (Number(postRes.score) || 0) >= 80;
                                                                    return (selectedMeeting.is_feedback_active && !selectedMeeting.is_closed && (hasPassed || isHostOrHR)) ? <Users size={16} /> : <Lock size={16} />;
                                                                })()}
                                                            </div>
                                                            <div className="text-left">
                                                                <p className="font-bold text-slate-800 text-xs">Feedback Form</p>
                                                                <p className="text-[10px] text-slate-400">Evaluasi penyelenggara (Bahasa Indonesia)</p>
                                                            </div>
                                                        </div>
                                                        <div className="flex items-center gap-3">
                                                            {userFeedback && <span className="text-[10px] font-black text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-100">Submitted</span>}
                                                            {!isHostOrHR && selectedMeeting.is_feedback_active && !userFeedback && <ArrowRight size={14} className="text-slate-300 group-hover:text-indigo-500" />}
                                                        </div>
                                                    </button>
                                                    
                                                    {isHostOrHR && !selectedMeeting.is_closed && (
                                                        <div className="flex items-center justify-between px-3 py-2 bg-slate-50 rounded-lg border border-slate-100">
                                                            <div className="flex flex-col">
                                                                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Akses Feedback</span>
                                                            </div>
                                                            <button 
                                                                onClick={() => toggleMeetingStatus('is_feedback_active', selectedMeeting.is_feedback_active)}
                                                                className={`px-3 py-1 rounded-full text-[10px] font-black transition-all border ${selectedMeeting.is_feedback_active 
                                                                    ? 'bg-emerald-500 text-white border-emerald-600' 
                                                                    : 'bg-white text-slate-400 border-slate-200'}`}
                                                            >
                                                                {selectedMeeting.is_feedback_active ? 'AKTIF' : 'NON-AKTIF'}
                                                            </button>
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })()}


                                <button
                                    onClick={() => setSelectedMeeting(null)}
                                    className="w-full mt-6 py-3 bg-slate-100 hover:bg-slate-200 text-slate-600 font-bold rounded-xl transition-all"
                                >
                                    Tutup Detail
                                </button>
                            </div>
                        </div>
                    </div>
                )
            }

            {/* Quiz Modal */}
            {showQuiz && selectedMeeting && (
                <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-md animate-in fade-in duration-300">
                    <TrainingQuiz
                        type={showQuiz}
                        questions={showQuiz === 'PRE' ? (selectedMeeting.pre_test_data?.questions || []) : (selectedMeeting.post_test_data?.questions || [])}
                        onClose={() => setShowQuiz(null)}
                        onSubmit={async (score: number) => {
                            try {
                                const response = await fetch(`${API_BASE_URL}/api/quiz/submit`, {
                                    method: 'POST',
                                    headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify({
                                        userId: user.email,
                                        user_id: user.email,
                                        userEmail: user.email,
                                        user_email: user.email,
                                        studentId: user.id || null,
                                        studentName: user.name,
                                        employee_id: user.employee_id || null,
                                        meetingId: selectedMeeting.id,
                                        meeting_id: selectedMeeting.id,
                                        score: score,
                                        quizType: showQuiz,
                                        quiz_type: showQuiz,
                                        type: showQuiz
                                    })
                                });
                                if (response.ok) {
                                    fetchResults(selectedMeeting.id);
                                    if (isManagementMode) {
                                        fetch(`${API_BASE_URL}/api/quiz/results/all`).then(r => r.json()).then(setAllResults);
                                        fetch(`${API_BASE_URL}/api/feedback/all`).then(r => r.json()).then(setAllFeedback);
                                    }
                                    setShowQuiz(null);
                                    setNotification({ show: true, type: 'success', message: `${showQuiz} Test completed successfully!` });
                                }
                            } catch (err) { console.error(err); }
                        }}
                        meetingTitle={selectedMeeting.title}
                    />
                </div>
            )}

            {/* Feedback Modal */}
            {showFeedback && selectedMeeting && (
                <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-md animate-in fade-in duration-300">
                    <TrainingFeedbackForm
                        onClose={() => setShowFeedback(false)}
                        onSubmit={async (feedback: any) => {
                            try {
                                const response = await fetch(`${API_BASE_URL}/api/feedback/submit`, {
                                    method: 'POST',
                                    headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify({
                                        userId: user.email,
                                        user_id: user.email,
                                        userEmail: user.email,
                                        user_email: user.email,
                                        studentId: user.id || null,
                                        employee_id: user.employee_id || null,
                                        meetingId: selectedMeeting.id,
                                        meeting_id: selectedMeeting.id,
                                        feedbackData: feedback,
                                        feedback_data: feedback
                                    })
                                });
                                if (response.ok) {
                                    setUserFeedback(feedback);
                                    if (isManagementMode) {
                                        fetch(`${API_BASE_URL}/api/quiz/results/all`).then(r => r.json()).then(setAllResults);
                                        fetch(`${API_BASE_URL}/api/feedback/all`).then(r => r.json()).then(setAllFeedback);
                                    }
                                    setShowFeedback(false);
                                    setNotification({ show: true, type: 'success', message: "Terima kasih atas feedback Anda!" });
                                }
                            } catch (err) { console.error(err); }
                        }}
                        meetingTitle={selectedMeeting.title}
                    />
                </div>
            )}
        </div>
    );
};

// --- Sub-components for Interactive Training ---

const TrainingQuiz = ({ type, questions, onClose, onSubmit, meetingTitle }: any) => {
    const [currentStep, setCurrentStep] = useState(0);
    const [answers, setAnswers] = useState<number[]>([]);
    const [isSubmitting, setIsSubmitting] = useState(false);

    const handleSelect = (idx: number) => {
        const newAnswers = [...answers];
        newAnswers[currentStep] = idx;
        setAnswers(newAnswers);
    };

    const handleNext = () => {
        if (currentStep < questions.length - 1) setCurrentStep(currentStep + 1);
        else {
            let correct = 0;
            questions.forEach((q: any, i: number) => {
                if (answers[i] === q.correctAnswer) correct++;
            });
            const score = Math.round((correct / questions.length) * 100);
            setIsSubmitting(true);
            onSubmit(score);
        }
    };

    if (questions.length === 0) return (
        <div className="bg-white p-8 rounded-3xl text-center max-w-sm">
            <p className="text-slate-500 mb-4 italic">Soal belum dikonfigurasi untuk sesi ini.</p>
            <button onClick={onClose} className="px-6 py-2 bg-slate-100 rounded-xl font-bold">Tutup</button>
        </div>
    );

    const q = questions[currentStep];

    return (
        <div className="bg-white rounded-[32px] w-full max-w-lg shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
            <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-white sticky top-0 z-10">
                <div>
                    <span className="text-[10px] font-black uppercase text-indigo-500 tracking-widest">{type} TEST ASSESSMENT</span>
                    <h2 className="font-black text-xl text-slate-800 leading-tight">{meetingTitle}</h2>
                </div>
                <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-xl text-slate-400"><X size={20} /></button>
            </div>

            <div className="p-8 overflow-y-auto custom-scrollbar">
                <div className="mb-8">
                    {(() => {
                        const answeredCount = answers.filter(a => a !== undefined).length;
                        const progress = Math.round((answeredCount / questions.length) * 100);
                        return (
                            <>
                                <div className="flex justify-between items-end mb-4">
                                    <span className="text-sm font-black text-indigo-600 uppercase">Pertanyaan {currentStep + 1} dari {questions.length}</span>
                                    <span className="text-xs font-bold text-slate-400">{progress}% Terisi</span>
                                </div>
                                <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden">
                                    <div className="h-full bg-indigo-500 transition-all duration-500" style={{ width: `${progress}%` }} />
                                </div>
                            </>
                        );
                    })()}
                </div>

                <div className="animate-in slide-in-from-right-4 duration-300">
                    <h3 className="text-lg font-bold text-slate-800 mb-6 leading-relaxed">{q.question}</h3>
                    <div className="space-y-3">
                        {q.options.map((opt: string, i: number) => {
                            if (!opt || opt.trim() === '') return null;
                            return (
                                <button
                                    key={i}
                                    onClick={() => handleSelect(i)}
                                    className={`w-full p-4 rounded-2xl text-left border-2 transition-all flex justify-between items-center font-bold ${answers[currentStep] === i
                                        ? 'border-indigo-500 bg-indigo-50 text-indigo-700 shadow-md shadow-indigo-500/10'
                                        : 'border-slate-100 hover:border-slate-200 text-slate-600 hover:bg-slate-50'
                                        }`}
                                >
                                    <span>{opt}</span>
                                    {answers[currentStep] === i && <CheckCircle size={18} className="text-indigo-500" />}
                                </button>
                            );
                        })}
                    </div>
                </div>
            </div>

            <div className="p-6 bg-slate-50 border-t border-slate-100">
                <button
                    disabled={answers[currentStep] === undefined || isSubmitting}
                    onClick={handleNext}
                    className="w-full py-4 bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-300 text-white font-black rounded-2xl shadow-xl shadow-indigo-500/20 transition-all flex items-center justify-center gap-2"
                >
                    {isSubmitting ? 'Mengirim...' : (currentStep === questions.length - 1 ? 'SELESAIKAN TES' : 'PERTANYAAN BERIKUTNYA')}
                </button>
            </div>
        </div>
    );
};

const TrainingFeedbackForm = ({ onClose, onSubmit, meetingTitle }: any) => {
    const [isLoading, setIsLoading] = useState(false);
    const questions = [
        { id: 'q1', text: 'Materi training sesuai dengan kebutuhan pengembangan saya.', type: 'scale' },
        { id: 'q2', text: 'Materi training dapat diterapkan dalam pekerjaan saya.', type: 'scale' },
        { id: 'q3', text: 'Penyampaian materi training mudah dipahami.', type: 'scale' },
        { id: 'q4', text: 'Secara keseluruhan, training ini memenuhi ekspektasi saya.', type: 'scale' },
        { id: 'q5', text: 'Materi pendukung (handout/modul/ppt) membantu pemahaman saya.', type: 'scale' },
        { id: 'q6', text: 'Trainer menyampaikan materi dengan efektif.', type: 'scale' },
        { id: 'q7', text: 'Trainer menjawab pertanyaan dengan jelas.', type: 'scale' },
        { id: 'q8', text: 'Studi kasus/contoh yang diberikan membantu pemahaman saya.', type: 'scale' },
        { id: 'q9', text: 'Tempat training nyaman dan mendukung proses belajar.', type: 'scale' },
        { id: 'q10', text: 'Konsumsi yang disediakan selama training memuaskan.', type: 'scale' },
        { id: 'q11', text: 'Hal apa yang sudah baik dari training ini?', type: 'text' },
        { id: 'q12', text: 'Hal apa yang perlu ditingkatkan untuk training selanjutnya?', type: 'text' }
    ];

    const [form, setForm] = useState<any>({});

    const handleLevel = (id: string, val: number) => setForm({ ...form, [id]: val });

    const isComplete = questions.every(q => q.type === 'text' ? (form[q.id]?.length > 2) : (form[q.id] !== undefined));

    return (
        <div className="bg-white rounded-[32px] w-full max-w-lg shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
            <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-white sticky top-0 z-10">
                <div>
                    <span className="text-[10px] font-black uppercase text-purple-500 tracking-widest">FEEDBACK PENYELENGGARA</span>
                    <h2 className="font-black text-xl text-slate-800 leading-tight">{meetingTitle}</h2>
                </div>
                <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-xl text-slate-400"><X size={20} /></button>
            </div>

            <div className="p-8 overflow-y-auto space-y-8 custom-scrollbar">
                {questions.map((q, idx) => (
                    <div key={q.id} className="animate-in slide-in-from-bottom-4 transition-all" style={{ animationDelay: `${idx * 100}ms` }}>
                        <h4 className="text-sm font-black text-slate-700 mb-4 leading-tight uppercase tracking-tight">{idx + 1}. {q.text}</h4>
                        {q.type === 'scale' ? (
                            <div className="flex justify-between gap-2">
                                {[1, 2, 3, 4].map(v => {
                                    const labels = ["", "Strongly Disagree", "Disagree", "Agree", "Strongly Agree"];
                                    return (
                                        <button
                                            key={v}
                                            onClick={() => handleLevel(q.id, v)}
                                            className={`flex-1 py-2.5 rounded-xl border-2 transition-all flex flex-col items-center group ${form[q.id] === v
                                                ? 'bg-purple-600 border-purple-600 text-white shadow-lg shadow-purple-500/30 ring-2 ring-purple-100'
                                                : 'bg-white border-slate-100 text-slate-500 hover:border-slate-200 hover:bg-slate-50'
                                                }`}
                                        >
                                            <span className="text-sm font-black">{v}</span>
                                            <span className={`text-[7px] font-black uppercase text-center leading-none tracking-tighter ${form[q.id] === v ? 'text-purple-100' : 'text-slate-400'}`}>
                                                {labels[v]}
                                            </span>
                                        </button>
                                    );
                                })}
                            </div>
                        ) : (
                            <textarea
                                value={form[q.id] || ''}
                                onChange={e => setForm({ ...form, [q.id]: e.target.value })}
                                className="w-full p-4 rounded-2xl bg-slate-50 border-2 border-slate-100 focus:border-purple-500 outline-none transition-all font-semibold text-slate-700"
                                rows={4}
                                placeholder="Tuliskan masukan Anda di sini..."
                            />
                        )}
                    </div>
                ))}
            </div>

            <div className="p-6 bg-slate-50 border-t border-slate-100">
                <button
                    disabled={!isComplete || isLoading}
                    onClick={() => {
                        setIsLoading(true);
                        onSubmit(form);
                    }}
                    className="w-full py-4 bg-purple-600 hover:bg-purple-700 disabled:bg-slate-300 text-white font-black rounded-2xl shadow-xl shadow-purple-500/20 transition-all"
                >
                    {isLoading ? 'Sending...' : 'SUBMIT FEEDBACK'}
                </button>
            </div>
        </div>
    );
};

const QuizEditor = ({ type, data, onChange }: { type: string, data: any, onChange: (data: any) => void }) => {
    const questions = data?.questions || [];
    const lastQuestionRef = useRef<HTMLDivElement>(null);
    const lastInputRef = useRef<HTMLTextAreaElement>(null);

    const addQuestion = () => {
        const newQs = [...questions, { question: '', options: ['', ''], correctAnswer: 0 }];
        onChange({ ...data, questions: newQs });
        setTimeout(() => {
            lastQuestionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
            lastInputRef.current?.focus();
        }, 150);
    };

    const addOption = (qIdx: number) => {
        const newQs = [...questions];
        newQs[qIdx] = { ...newQs[qIdx], options: [...newQs[qIdx].options, ''] };
        onChange({ ...data, questions: newQs });
    };

    const removeOption = (qIdx: number, oIdx: number) => {
        const newQs = [...questions];
        if (newQs[qIdx].options.length <= 2) return;
        const newOpts = newQs[qIdx].options.filter((_: any, i: number) => i !== oIdx);
        
        // Adjust correctAnswer if needed
        let newCorrect = newQs[qIdx].correctAnswer;
        if (newCorrect === oIdx) newCorrect = 0;
        else if (newCorrect > oIdx) newCorrect -= 1;
        
        newQs[qIdx] = { ...newQs[qIdx], options: newOpts, correctAnswer: newCorrect };
        onChange({ ...data, questions: newQs });
    };
    
    const removeQuestion = (idx: number) => {
        const newQs = questions.filter((_: any, i: number) => i !== idx);
        onChange({ ...data, questions: newQs });
    };

    const updateQuestion = (idx: number, field: string, value: any) => {
        const newQs = [...questions];
        newQs[idx] = { ...newQs[idx], [field]: value };
        onChange({ ...data, questions: newQs });
    };

    const updateOption = (qIdx: number, oIdx: number, value: string) => {
        const newQs = [...questions];
        const newOpts = [...newQs[qIdx].options];
        newOpts[oIdx] = value;
        newQs[qIdx] = { ...newQs[qIdx], options: newOpts };
        onChange({ ...data, questions: newQs });
    };

    return (
        <div className="space-y-4">
             <div className="flex items-center justify-between">
                 <h4 className="text-sm font-black text-slate-700 uppercase tracking-tight flex items-center gap-2">
                     <div className={`w-2 h-2 rounded-full ${type === 'Pre-Test' ? 'bg-blue-500' : 'bg-indigo-500'}`} />
                     {type} Assessment
                 </h4>
                 <button type="button" onClick={addQuestion} className="bg-indigo-50 text-indigo-600 px-3 py-1.5 rounded-lg text-xs font-black hover:bg-indigo-600 hover:text-white transition-all flex items-center gap-1">
                     <Plus size={14} /> ADD QUESTION
                 </button>
             </div>
             {questions.length === 0 && (
                 <div className="py-8 px-4 border-2 border-dashed border-slate-100 rounded-2xl text-center">
                     <p className="text-xs text-slate-400 font-medium">Belum ada soal untuk {type}.</p>
                 </div>
             )}
             <div className="space-y-6">
                 {questions.map((q: any, i: number) => (
                     <div 
                        key={i} 
                        ref={i === questions.length - 1 ? lastQuestionRef : null}
                        style={{ scrollMarginTop: '20px' }}
                        className="bg-slate-50/50 p-5 rounded-2xl relative border border-slate-100 animate-in slide-in-from-bottom-2 duration-300"
                    >
                         <button type="button" onClick={() => removeQuestion(i)} className="absolute top-4 right-4 text-slate-300 hover:text-red-500 transition-colors">
                             <Trash2 size={16} />
                         </button>
                         <div className="mb-4 pr-8">
                             <label className="block text-[9px] font-black text-slate-400 uppercase mb-1.5">Pertanyaan {i + 1}</label>
                             <textarea 
                                 ref={i === questions.length - 1 ? lastInputRef : null}
                                 className="w-full px-4 py-2.5 rounded-xl border border-slate-200 text-xs font-bold text-slate-700 focus:ring-2 focus:ring-indigo-500 outline-none bg-white"
                                 value={q.question}
                                 onChange={e => updateQuestion(i, 'question', e.target.value)}
                                 placeholder="Tuliskan pertanyaan di sini..."
                                 rows={2}
                             />
                         </div>
                         <div className="grid grid-cols-1 gap-2.5">
                             <label className="block text-[9px] font-black text-slate-400 uppercase">Opsi Jawaban (Pilih satu yang benar)</label>
                             {q.options.map((opt: string, oi: number) => (
                                 <div 
                                    key={oi} 
                                    onClick={() => updateQuestion(i, 'correctAnswer', oi)}
                                    className={`flex items-center gap-3 p-2 rounded-xl transition-all border cursor-pointer group/opt ${q.correctAnswer === oi ? 'bg-emerald-50 border-emerald-200' : 'bg-white border-slate-100'}`}
                                 >
                                     <input 
                                         type="radio" 
                                         name={`${type.toLowerCase()}-correct-${i}`}
                                         checked={q.correctAnswer === oi} 
                                         onChange={() => updateQuestion(i, 'correctAnswer', oi)}
                                         className="w-4 h-4 text-emerald-600 focus:ring-emerald-500"
                                     />
                                     <input 
                                         className="flex-1 bg-transparent border-none focus:ring-0 text-xs font-semibold text-slate-600 cursor-text"
                                         value={opt}
                                         onClick={(e) => e.stopPropagation()}
                                         onChange={e => updateOption(i, oi, e.target.value)}
                                         placeholder={`Opsi ${oi + 1}`}
                                     />
                                     {q.options.length > 2 && (
                                         <button 
                                            type="button" 
                                            onClick={(e) => { e.stopPropagation(); removeOption(i, oi); }}
                                            className="opacity-0 group-hover/opt:opacity-100 text-slate-300 hover:text-red-500 transition-all p-1"
                                         >
                                             <X size={14} />
                                         </button>
                                     )}
                                 </div>
                             ))}
                             <button 
                                type="button" 
                                onClick={() => addOption(i)}
                                className="mt-1 w-fit text-[10px] font-black text-indigo-600 hover:text-indigo-800 flex items-center gap-1.5 bg-indigo-50/50 hover:bg-indigo-100/50 px-4 py-2 rounded-xl transition-all"
                             >
                                <Plus size={12} strokeWidth={3} /> ADD OPTION
                             </button>
                         </div>
                     </div>
                 ))}
             </div>
        </div>
    );
};

export default TrainingInternalList;
