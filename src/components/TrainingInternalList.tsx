import { useState, useEffect, useRef, Fragment, type FormEvent } from 'react';
import * as XLSX from 'xlsx-js-style';
import { useTranslation } from 'react-i18next';
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
    Lock,
    Camera,
    Image as ImageIcon,
    Search,
    Link,
    UploadCloud,
    MessageSquare
} from 'lucide-react';
import { API_BASE_URL } from '../config';
import type { Role, Meeting, CostReport, Employee, QuizResult, User } from '../types';
import PopupNotification from './PopupNotification';
import ConfirmationModal from './ConfirmationModal';

const renderTextWithLinks = (text: string) => {
    if (!text) return null;
    const urlRegex = /(https?:\/\/[^\s]+)/g;
    return text.split(urlRegex).map((part, i) => {
        if (part.match(urlRegex)) {
            return <a key={i} href={part} target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:underline break-all">{part}</a>;
        }
        return <span key={i} className="whitespace-pre-wrap">{part}</span>;
    });
};

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
    const { t } = useTranslation('trainingInternalList');
    const userEmail = user.email;
    // Determine effective role: in non-management mode, everyone is treated as STAFF
    const effectiveRole = isManagementMode ? userRole : 'STAFF';

    // --- State ---
    const [learningStats, setLearningStats] = useState({ totalJam: 0, totalBiaya: 0, jamTraining: 0 });
    const [meetings, setMeetings] = useState<ExtendedMeeting[]>([]);
    const [selectedMeeting, setSelectedMeeting] = useState<ExtendedMeeting | null>(null);
    const [isCreateOpen, setIsCreateOpen] = useState(false);
    const [notification, setNotification] = useState<{ show: boolean; type: 'success' | 'error' | 'info'; message: string; onClose?: () => void }>({ show: false, type: 'success', message: '' });

    const [isEditing, setIsEditing] = useState(false);
    const [editId, setEditId] = useState<number | null>(null);
    const [editIsClosed, setEditIsClosed] = useState(false);

    const [meetingToDelete, setMeetingToDelete] = useState<number | null>(null);
    const [confirmMarkPaid, setConfirmMarkPaid] = useState<boolean>(false);
    const [isCloseModalOpen, setIsCloseModalOpen] = useState(false);
    const [closeSessionPhotoUrl, setCloseSessionPhotoUrl] = useState('');
    const [isUploadingPhoto, setIsUploadingPhoto] = useState(false);


    // Reporting State
    const [isReportOpen, setIsReportOpen] = useState(false);
    const [reportData, setReportData] = useState<CostReport>({
        trainerIncentive: 0,
        snackCost: 0,
        lunchCost: 0,
        otherCost: 0,
        participantsCount: 0,
        participationType: 'Targeted Participants',
        isFinalized: false,
        trainingPhotos: ''
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
        competency_type: '' as string,
        competency_name: '',
        pre_test_data: null as any,
        post_test_data: null as any,
        material_link: '',
        training_gr_type: '' as string
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
    const photoInputRef = useRef<HTMLInputElement>(null);
    const endDateRef = useRef<HTMLInputElement>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);


    // Interactive Quiz/Feedback State
    const [showQuiz, setShowQuiz] = useState<'PRE' | 'POST' | null>(null);
    const [showFeedback, setShowFeedback] = useState(false);
    const [meetingQuizResults, setMeetingQuizResults] = useState<QuizResult[]>([]);
    const [meetingSummary, setMeetingSummary] = useState<{ quiz: { quiz_type: string, count: number }[], feedback: number, allQuizResults?: any[], allFeedbackResults?: any[] } | null>(null);
    const [userFeedback, setUserFeedback] = useState<any>(null);
    const [showParticipantModal, setShowParticipantModal] = useState<'sudah' | 'belum' | null>(null);
    const [showFeedbackList, setShowFeedbackList] = useState(false);

    // No longer using force update since refresh button was removed

    const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = async (evt) => {
            try {
                const bstr = evt.target?.result;
                const wb = XLSX.read(bstr, { type: 'binary' });
                const wsname = wb.SheetNames[0];
                const ws = wb.Sheets[wsname];
                const rawData = XLSX.utils.sheet_to_json(ws, { header: 1 }) as any[][];
                if (rawData.length === 0) throw new Error('Empty Excel file');
                
                // Find header row by finding the row with the most string elements
                let headerRowIndex = 0;
                let maxCols = 0;
                for (let i = 0; i < Math.min(20, rawData.length); i++) {
                    const cols = (rawData[i] || []).filter((c: any) => typeof c === 'string' && c.trim() !== '').length;
                    if (cols > maxCols) {
                        maxCols = cols;
                        headerRowIndex = i;
                    }
                }
                
                const headers = rawData[headerRowIndex].map((h: any) => String(h || '').trim());
                
                // Convert back to object array using the found headers
                const data = [];
                const duplicateCount: Record<string, number> = {};
                const finalHeaders = headers.map(h => {
                    if (!h) return '';
                    if (duplicateCount[h]) {
                        duplicateCount[h]++;
                        return `${h}_${duplicateCount[h] - 1}`;
                    } else {
                        duplicateCount[h] = 1;
                        return h;
                    }
                });
                
                for (let i = headerRowIndex + 1; i < rawData.length; i++) {
                    const rowArr = rawData[i];
                    if (!rowArr || rowArr.length === 0 || rowArr.every(x => !x)) continue; // skip empty rows
                    
                    const rowObj: any = {};
                    finalHeaders.forEach((h, colIdx) => {
                        if (h) rowObj[h] = rowArr[colIdx];
                    });
                    data.push(rowObj);
                }
                
                const groupedMeetings = new Map();
                
                // Helper to parse Indonesian month dates
                const parseIndonesianDate = (dateStr: string) => {
                    if (!dateStr) return null;
                    const months: Record<string, string> = {
                        'januari': '01', 'februari': '02', 'maret': '03', 'april': '04',
                        'mei': '05', 'juni': '06', 'juli': '07', 'agustus': '08',
                        'september': '09', 'oktober': '10', 'november': '11', 'desember': '12',
                        'jan': '01', 'feb': '02', 'mar': '03', 'apr': '04', 'may': '05',
                        'jun': '06', 'jul': '07', 'aug': '08', 'sep': '09', 'oct': '10', 'nov': '11', 'dec': '12'
                    };
                    const lower = String(dateStr).toLowerCase();
                    for (const [idMonth, numMonth] of Object.entries(months)) {
                        if (lower.includes(idMonth)) {
                            // Extract day, month, year
                            const parts = lower.replace(/,/g, '').split(/\s+/);
                            // Simple heuristic: parts usually [day, month, year]
                            let day = parts.find(p => /^\d{1,2}$/.test(p)) || '01';
                            let year = parts.find(p => /^\d{4}$/.test(p)) || new Date().getFullYear().toString();
                            return `${year}-${numMonth}-${day.padStart(2, '0')}`;
                        }
                    }
                    return null;
                };

                // Helper to parse Indonesian number format (125,000 -> 125000)
                const parseIndonesianNumber = (val: any): number => {
                    if (val === undefined || val === null || val === '') return 0;
                    if (typeof val === 'number') return val;
                    // Remove comma as thousands separator
                    const cleaned = String(val).replace(/,/g, '');
                    const num = parseFloat(cleaned);
                    return isNaN(num) ? 0 : num;
                };
                
                data.forEach((row: any) => {
                    // Handle new date format: "2 Januari 2026" or "Januari" + "2 Januari 2026"
                    let parsedDate = row.Date || row.date || row.Tanggal;

                    // If we have separate month and date columns, combine them
                    const monthColumn = row['Periode Bulan'] || row.PeriodeBulan || row.Bulan;
                    if (monthColumn && !parsedDate) {
                        parsedDate = `${String(monthColumn).trim()} ${String(row.Tanggal || '').replace(String(monthColumn).trim(), '').trim()}`;
                    } else if (monthColumn && typeof parsedDate === 'string') {
                        // Append month to existing date if needed
                        parsedDate = `${String(monthColumn).trim()} ${parsedDate}`;
                    }

                    if (typeof parsedDate === 'number') {
                        parsedDate = new Date((parsedDate - (25567 + 1)) * 86400 * 1000).toISOString().split('T')[0];
                    } else if (typeof parsedDate === 'string') {
                        const indoDate = parseIndonesianDate(parsedDate);
                        if (indoDate) {
                            parsedDate = indoDate;
                        } else {
                            const d = new Date(parsedDate);
                            if (!isNaN(d.getTime())) {
                                parsedDate = d.toISOString().split('T')[0];
                            }
                        }
                    }

                    // Handle competency type and name from new columns
                    const competencyType = row['Competency Type'] || row.CompetencyType || row['Kompetensi Jenis'] || '';
                    const competencyName = row['Competency Name'] || row.CompetencyName || row['Nama Kompetensi'] || '';

                    // Handle Training GRI Type (ESG, HSE, Other)
                    const trainingGrType = row['ESG, HSE, Other'] || row['ESG_HSE_Other'] || row.training_gr_type || null;

                    const title = row.Title || row.title || row['Judul / Training Name'] || row.Judul || 'Imported Training';
                    
                    const parseExcelTime = (val: any) => {
                        if (typeof val === 'number') {
                            const totalMinutes = Math.round(val * 24 * 60);
                            let h = Math.floor(totalMinutes / 60);
                            let m = totalMinutes % 60;
                            return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
                        }
                        return val ? String(val) : '';
                    };

                    const timeStart = parseExcelTime(row['Jam (Start)'] || row.Time || row.time || row.Waktu) || '09:00';
                    const timeEnd = parseExcelTime(row['Jam (End)']);
                    const time = timeEnd ? `${timeStart} - ${timeEnd}` : timeStart;
                    const host = row['Nama Trainer / Facilitator'] || row.Host || row.host || row.Trainer || 'HR Team';
                    
                    const groupKey = `${title}_${parsedDate}_${time}_${host}`;

                    if (!groupedMeetings.has(groupKey)) {
                        groupedMeetings.set(groupKey, {
                            title,
                            date: parsedDate || new Date().toISOString().split('T')[0],
                            time,
                            host,
                            competency_type: competencyType,
                            competency_name: competencyName,
                            training_gr_type: trainingGrType,
                            type: row['Training Type'] || row.Type || row.type || row.Tipe || 'Offline',
                            location: row.Location || row.location || row.Lokasi || '',
                            description: row.Description || row.description || row.Deskripsi || '',
                            material_link: row['Link Materi'] || '',
                            is_closed: true,
                            cost_report: {
                                trainer: parseIndonesianNumber(row['Insentif Trainer']),
                                snack: parseIndonesianNumber(row['Insentif Snack']),
                                lunch: parseIndonesianNumber(row['Insentif Lunch']),
                                other: parseIndonesianNumber(row['Insentif Other']),
                                total: parseIndonesianNumber(row['Insentif Total'] || row['Budget Learning per orang / Total Cost']),
                                isPaid: row['Lapor Insentif']?.toString().toLowerCase().trim() === 'sudah' ? true : false,
                                isFinalized: row['Lapor Insentif']?.toString().toLowerCase().trim() === 'sudah' ? true : false
                            },
                            participants: []
                        });
                    }
                    
                    const employeeId = row['Employee ID'] || row['EmployeeID'] || row.EmployeeID || '';

                    // Handle Pre-Test and Post-Test from various column names (old and new format)
                    const rawPreTest = row['Pre-Test_1'] ?? row['Pre-Test'] ?? row.PRE_TEST_DATA ?? null;
                    const rawPostTest = row['Post-Test_1'] ?? row['Post-Test'] ?? row.POST_TEST_DATA ?? null;

                    // Handle Participation Type per participant
                    const participationType = row['Participation Type'] || row['participation_type'] || 'Targeted Participants';

                    const parseScore = (val: any) => {
                        if (val === undefined || val === null || val === '') return null;
                        if (typeof val === 'number') return val;
                        const num = Number(val);
                        if (!isNaN(num)) return num;
                        return null;
                    };

                    // Store participation type for this participant (use employee_id as key)
                    if (employeeId && !((groupedMeetings.get(groupKey) as any).participationTypesByEmployee?.[employeeId])) {
                        groupedMeetings.get(groupKey).participationTypesByEmployee =
                            groupedMeetings.get(groupKey).participationTypesByEmployee || {};
                        groupedMeetings.get(groupKey).participationTypesByEmployee[employeeId] = participationType;
                    }

                    const participant = {
                        name: row['Peserta / Employee Name'] || row.Peserta || row.EmployeeName || '',
                        employee_id: employeeId,
                        pre_test_score: parseScore(rawPreTest),
                        post_test_score: parseScore(rawPostTest),
                        feedback_score: parseScore(row['Feedback Training / PTE 1 Score'] ?? row.Feedback_Training ?? row.PTE_1_Score ?? null)
                    };

                    if (participant.name || participant.employee_id) {
                        groupedMeetings.get(groupKey).participants.push(participant);
                    }
                });

                // Build participationTypesByEmployee from parsed data into cost_report
                const formattedMeetings = Array.from(groupedMeetings.values()).map(m => {
                    if (m.cost_report?.isPaid) {
                        m.cost_report.attendee_ids = m.participants.map((p: any) => p.employee_id).filter(Boolean);
                        m.cost_report.attendees = m.participants.map((p: any) => p.name).filter(Boolean);
                        m.cost_report.participantsCount = m.participants.length;
                    }

                    // Copy participationTypesByEmployee from meeting to cost_report if exists
                    if ((m as any).participationTypesByEmployee) {
                        if (!m.cost_report) m.cost_report = {};
                        (m.cost_report as any).participationTypesByEmployee = (m as any).participationTypesByEmployee;
                    }

                    return m;
                });
                
                if (formattedMeetings.length > 0) {
                    const res = await fetch(`${API_BASE_URL}/api/meetings/bulk`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ meetings: formattedMeetings })
                    });
                    
                    if (res.ok) {
                        const result = await res.json();
                        setNotification({ show: true, type: 'success', message: t('notifications.importSuccess', { count: result.count }) });
                        // Refresh meetings
                        fetch(`${API_BASE_URL}/api/meetings`)
                            .then(res => res.json())
                            .then(data => {
                                const sorted = data.map(safeMeeting).sort((a: any, b: any) => new Date(b.date).getTime() - new Date(a.date).getTime());
                                setMeetings(sorted);
                            });
                            
                        // Refresh results and feedback for UI update
                        if (isManagementMode) {
                            fetch(`${API_BASE_URL}/api/quiz/results/all`)
                                .then(r => r.json())
                                .then(data => setAllResults(Array.isArray(data) ? data : (data.data || [])));
                            fetch(`${API_BASE_URL}/api/feedback/all`)
                                .then(r => r.json())
                                .then(data => setAllFeedback(Array.isArray(data) ? data : (data.data || [])));
                        }
                    } else {
                        const errData = await res.json().catch(() => ({}));
                        throw new Error(errData.error || t('notifications.importBackendFailed'));
                    }
                }
            } catch (err: any) {
                console.error("Import error:", err);
                setNotification({ show: true, type: 'error', message: t('notifications.importFailed', { message: err.message }) });
            } finally {
                if (fileInputRef.current) {
                    fileInputRef.current.value = '';
                }
            }
        };
        reader.readAsBinaryString(file);
    };

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
                const safeData = safeMeeting(data);
                setSelectedMeeting(safeData);
                setMeetings(prev => prev.map(m => m.id === safeData.id ? safeData : m));
                setNotification({ show: true, type: 'success', message: t('notifications.statusUpdated') });
            } else {
                throw new Error("Failed to update status.");
            }
        } catch (err) {
            console.error(err);
            setNotification({ show: true, type: 'error', message: t('notifications.statusUpdateError') });
        }
    };

    useEffect(() => {
        if (selectedMeeting) {
            fetchResults(selectedMeeting.id);

            // Re-fetch meeting details from server to get latest settings (pre-test/post-test/feedback toggles)
            // This ensures participants see the updated status when host changes them
            const refetchMeeting = async () => {
                try {
                    const res = await fetch(`${API_BASE_URL}/api/meetings/${selectedMeeting.id}`);
                    if (res.ok) {
                        const data = await res.json();
                        // Update selectedMeeting with fresh data from server
                        setSelectedMeeting(safeMeeting(data));
                    }
                } catch (err) {
                    console.error('Failed to refetch meeting details:', err);
                }
            };
            refetchMeeting();
        } else {
            setMeetingQuizResults([]);
            setUserFeedback(null);
        }
    }, [selectedMeeting?.id]); // Only re-run when ID changes, not on every selectedMeeting change

    // Track previous meeting data for change detection across intervals
    const prevMeetingRef = useRef(selectedMeeting);
    
    // Update ref when selectedMeeting changes
    useEffect(() => {
        if (selectedMeeting) {
            prevMeetingRef.current = selectedMeeting;
        }
    }, [selectedMeeting?.id]);

    // Auto-refresh: poll every 3 seconds when detail modal is open.
    // Participants get notified when the host toggles pre-test/post-test/feedback availability.
    // Hosts/HR get the meetingSummary refreshed so participant progress (e.g. "Peserta Belum/Sudah Selesai")
    // updates live without needing to reload the page.
    useEffect(() => {
        if (!selectedMeeting) return;

        const isHostOrHR = effectiveRole === 'HR' || effectiveRole === 'HR_ADMIN' ||
                          (user.employee_id && selectedMeeting.employee_id && user.employee_id === selectedMeeting.employee_id);

        console.log('[AUTO-REFRESH] Starting poll interval for meeting', selectedMeeting.id);

        const intervalId = setInterval(async () => {
            try {
                // Fetch fresh data from server
                const res = await fetch(`${API_BASE_URL}/api/meetings/${selectedMeeting.id}`);
                if (res.ok) {
                    const data = await res.json();

                    const prev = prevMeetingRef.current || selectedMeeting;
                    console.log('[AUTO-REFRESH] Server:', {
                        pre: data.is_pre_test_active, post: data.is_post_test_active, feedback: data.is_feedback_active, closed: data.is_closed
                    }, 'Previous:', {
                        pre: Number(prev?.is_pre_test_active), post: Number(prev?.is_post_test_active), feedback: Number(prev?.is_feedback_active), closed: Number(prev?.is_closed)
                    });

                    // Compare with previous server state (not local selectedMeeting which is stale in closure)
                    const needsUpdate =
                        Number(data.is_pre_test_active) !== Number(prev?.is_pre_test_active) ||
                        Number(data.is_post_test_active) !== Number(prev?.is_post_test_active) ||
                        Number(data.is_feedback_active) !== Number(prev?.is_feedback_active) ||
                        Number(data.is_closed) !== Number(prev?.is_closed);

                    if (needsUpdate) {
                        console.log('[AUTO-REFRESH] Change detected! Updating...');

                        // Toggle-availability notifications are only meaningful for participants
                        // reacting to the host's changes, not for the host themselves.
                        if (!isHostOrHR) {
                            if (!prev?.is_pre_test_active && data.is_pre_test_active) {
                                setNotification({ show: true, type: 'success', message: t('notifications.preTestAvailable') });
                            } else if (!prev?.is_post_test_active && data.is_post_test_active) {
                                setNotification({ show: true, type: 'success', message: t('notifications.postTestAvailable') });
                            } else if (!prev?.is_feedback_active && data.is_feedback_active) {
                                setNotification({ show: true, type: 'success', message: t('notifications.feedbackNowOpen') });
                            }
                        }

                        // Update selectedMeeting AND update ref
                        const safeData = safeMeeting(data);
                        setSelectedMeeting(safeData);
                        prevMeetingRef.current = safeData;
                        setMeetings(prev => prev.map(m => m.id === safeData.id ? safeData : m));
                    }

                    // CRITICAL: Always refresh meetingSummary to get latest quiz/feedback results
                    // This ensures counter and participant data auto-update without page reload
                    try {
                        const summaryRes = await fetch(`${API_BASE_URL}/api/meetings/summary/${selectedMeeting.id}`);
                        if (summaryRes.ok) {
                            const summaryData = await summaryRes.json();
                            console.log('[AUTO-REFRESH] Summary refreshed:', {
                                feedbackCount: summaryData.feedback,
                                quizResultsCount: summaryData.allQuizResults?.length || 0,
                                allFeedbackCount: summaryData.allFeedbackResults?.length || 0,
                                feedbacks: summaryData.allFeedbackResults,
                                quizResults: summaryData.allQuizResults
                            });

                            // Always update state with fresh data (new reference to force React update)
                            const newSummary = {
                                ...summaryData,
                                allFeedbackResults: [...(summaryData.allFeedbackResults || [])],
                                allQuizResults: [...(summaryData.allQuizResults || [])],  // CRITICAL: Copy quiz results too!
                                __timestamp: Date.now()
                            };

                            setMeetingSummary(newSummary);
                            console.log('[AUTO-REFRESH] New meetingSummary state:', {
                                feedbackCount: newSummary.feedback,
                                allQuizResultsLength: newSummary.allQuizResults?.length || 0,
                                quizTypes: newSummary.allQuizResults?.map((r: any) => r.quizType || r.quiz_type)
                            });

                            // Trigger re-render by updating selectedMeeting with a new reference
                            setSelectedMeeting(prev => prev ? ({...prev}) : null);
                        }
                    } catch (e) { console.error('[AUTO-REFRESH] Summary refresh failed:', e); }
                }
            } catch (err) {
                console.error('[AUTO-REFRESH] Failed:', err);
            }
        }, 3000); // Poll every 3 seconds for faster auto-update

        return () => {
            console.log('[AUTO-REFRESH] Clearing interval');
            clearInterval(intervalId);
        };
    }, [selectedMeeting?.id, effectiveRole]);

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



    // Helper to get local date string YYYY-MM-DD from a Date object
    const getLocalDateString = (date: Date): string => {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    };

    // Helper to compare dates by local date string (ignores time/timezone)
    const isWithinDateRange = (meetingDate: Date, startLocal: string, endLocal: string): boolean => {
        const meetingDateString = getLocalDateString(meetingDate);
        return meetingDateString >= startLocal && meetingDateString <= endLocal;
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

        // Date Range Filter - use local date comparison to avoid timezone issues
        if (!isWithinDateRange(d, startDate, endDate)) return false;

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

        let mappedCostReport = m.costReport;
        if (mappedCostReport) {
            // Map imported keys to UI expected keys if necessary
            if ('trainer' in mappedCostReport && !('trainerIncentive' in mappedCostReport)) mappedCostReport.trainerIncentive = mappedCostReport.trainer;
            if ('snack' in mappedCostReport && !('snackCost' in mappedCostReport)) mappedCostReport.snackCost = mappedCostReport.snack;
            if ('lunch' in mappedCostReport && !('lunchCost' in mappedCostReport)) mappedCostReport.lunchCost = mappedCostReport.lunch;
            if ('other' in mappedCostReport && !('otherCost' in mappedCostReport)) mappedCostReport.otherCost = mappedCostReport.other;

            // Map participationTypesByEmployee to m.participation_types for export compatibility (if needed)
            if (mappedCostReport.participationTypesByEmployee) {
                m.participation_types = mappedCostReport.participationTypesByEmployee;
            }
        }

        return {
            ...m,
            host: host || m.host || 'Admin',
            type: m.type || (m.location && (m.location.toLowerCase().includes('meet') || m.location.toLowerCase().includes('http')) ? 'Online' : 'Offline'),
            description: m.description || m.agenda || 'No description provided.',
            shortDate: shortDate || 'TBD',
            guests: m.guests || { status: 'Awaiting', count: 0, emails: [] },
            costReport: mappedCostReport
        } as ExtendedMeeting;
    };

    // --- Fetch Data ---
    useEffect(() => {
        if (userEmail) {
            fetch(`${API_BASE_URL}/api/learning-stats?email=${encodeURIComponent(userEmail)}`)
                .then(res => res.json())
                .then(data => {
                    if (!data.error) {
                        setLearningStats(data);
                    }
                })
                .catch(err => console.error("Error fetching learning stats:", err));
        }
    }, [userEmail]);

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
            const year = d.getFullYear();
            const month = String(d.getMonth() + 1).padStart(2, '0');
            const day = String(d.getDate()).padStart(2, '0');
            return `${year}-${month}-${day}`;
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

        // Check if meeting is already closed - if so, lock the form to prevent reopening
        const isMeetingClosed = meeting.is_closed === true || meeting.is_closed === 1;

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
            competency_type: meeting.competency_type || '',
            competency_name: meeting.competency_name || '',
            pre_test_data: meeting.pre_test_data || { questions: [] },
            post_test_data: meeting.post_test_data || { questions: [] },
            material_link: meeting.material_link || '',
            training_gr_type: meeting.training_gr_type || ''
        });

        // Preserve is_closed status - do not allow reopening a closed meeting
        if (isMeetingClosed) {
            setEditIsClosed(true);
        }

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
            evidenceLink: meeting.costReport?.evidenceLink || '',
            trainingPhotos: meeting.costReport?.trainingPhotos || ''
        });
        setIsReportOpen(true);

        // Auto-check attendance for invited participants who already submitted feedback.
        // Skip once the report is paid/locked, so a finalized attendance record isn't silently altered.
        if (meeting.costReport?.isPaid) return;
        const invitedEmployeeIds = (meeting.guests as any)?.employee_ids || [];
        if (invitedEmployeeIds.length === 0) return;

        fetch(`${API_BASE_URL}/api/meetings/summary/${meeting.id}`)
            .then(res => (res.ok ? res.json() : null))
            .then(summary => {
                const feedbacks = summary?.allFeedbackResults || [];
                if (feedbacks.length === 0) return;

                // Resolve each feedback entry to an employee_id (direct field, or via email lookup)
                const feedbackEmployeeIds = new Set<string>();
                feedbacks.forEach((f: any) => {
                    let empId = String(f.employee_id || '').trim();
                    if (!empId && f.user_id) {
                        const emp = employees.find(e => (e.email || '').toLowerCase() === String(f.user_id).toLowerCase().trim());
                        if (emp) empId = String(emp.id_employee || emp.id || '');
                    }
                    if (empId) feedbackEmployeeIds.add(empId);
                });
                if (feedbackEmployeeIds.size === 0) return;

                setReportData(prev => {
                    const attendeeIds = [...(prev.attendee_ids || [])];
                    const attendees = [...(prev.attendees || [])];
                    let changed = false;

                    invitedEmployeeIds.forEach((id: string) => {
                        if (feedbackEmployeeIds.has(String(id)) && !attendeeIds.includes(id)) {
                            attendeeIds.push(id);
                            changed = true;
                            const emp = employees.find(e => e.id_employee === id);
                            if (emp?.email && !attendees.includes(emp.email)) attendees.push(emp.email);
                        }
                    });

                    if (!changed) return prev;
                    return {
                        ...prev,
                        attendees,
                        attendee_ids: attendeeIds,
                        participantsCount: Math.max(prev.participantsCount || 0, attendeeIds.length)
                    };
                });
            })
            .catch(err => console.error('Failed to auto-check attendance from feedback:', err));
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

    const validateReport = () => {
        // Check if meeting is closed - only closed meetings can be finalized by HR
        const meeting = meetings.find(m => m.id === reportingId);
        if (meeting && !meeting.is_closed) {
            setNotification({
                show: true,
                type: 'error',
                message: t('notifications.reportStillActive')
            });
            return false;
        }

        if ((reportData.participantsCount || 0) <= 0) {
            setNotification({ show: true, type: 'error', message: t('notifications.participantsCountRequired') });
            return false;
        }
        if (!reportData.trainingPhotos || reportData.trainingPhotos.trim() === '') {
            setNotification({ show: true, type: 'error', message: t('notifications.trainingPhotosRequired') });
            return false;
        }
        return true;
    };

    const handleSave = async (e: FormEvent) => {
        e.preventDefault();

        // Validation
        if (!formData.title || !formData.date || !formData.startTime || !formData.endTime || !formData.host || !formData.type) {
            setNotification({ show: true, type: 'error', message: t('notifications.fillRequiredFields') });
            return;
        }

        if (formData.type === 'Offline' && !formData.location) {
            setNotification({ show: true, type: 'error', message: t('notifications.locationRequired') });
            return;
        }

        // Assessment Validation
        const preQuestions = formData.pre_test_data?.questions || [];
        const postQuestions = formData.post_test_data?.questions || [];
        if (userRole !== 'HR' && userRole !== 'HR_ADMIN' && (preQuestions.length === 0 || postQuestions.length === 0)) {
            setNotification({
                show: true,
                type: 'error',
                message: t('notifications.assessmentDataRequired')
            });
            setActiveCreateTab('assessment');
            return;
        }

        const hostEmail = employees.find(e => e.id_employee === formData.host_id)?.email;

        // Build guest emails from employee_ids for email invites
        const guestEmailsFromEmployees = invitedEmployeeIds
            .map(id => employees.find(e => e.id_employee === id)?.email)
            .filter((email): email is string => Boolean(email));

        const allInviteeEmailsForCalendar = hostEmail ? [...guestEmailsFromEmployees, hostEmail] : guestEmailsFromEmployees;

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
            competency_type: formData.competency_type,
            competency_name: formData.competency_name,
            guests: {
                status: 'Awaiting',
                count: invitedEmployeeIds.length,  // Only employees (not host)
                emails: guestEmailsFromEmployees,
                employee_ids: invitedEmployeeIds
            },
            meetLink: formData.meetLink,
            pre_test_data: formData.pre_test_data,
            post_test_data: formData.post_test_data,
            material_link: formData.material_link,
            training_gr_type: formData.training_gr_type
        };

        if (isEditing && editId) {
            // Update Existing
            try {
                console.log('DEBUG: training_gr_type value:', formData.training_gr_type);
                console.log('DEBUG: updatePayload:', JSON.stringify({
                    title: meetingData.title,
                    competency_name: meetingData.competency_name,
                    training_gr_type: meetingData.training_gr_type
                }, null, 2));

                // Preserve is_closed status - do not allow reopening a closed meeting
                const updatePayload = {
                    ...meetingData,
                    is_closed: editIsClosed ? true : false
                };

                const res = await fetch(`${API_BASE_URL}/api/meetings/${editId}`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(updatePayload)
                });
                if (res.ok) {
                    const savedMeeting = await res.json();
                    // Preserve is_closed status in local state after update
                    setMeetings(meetings.map(m => m.id === editId ? safeMeeting(savedMeeting) : m));
                    setNotification({ show: true, type: 'success', message: t('notifications.meetingUpdated') });
                    // Do NOT reset editIsClosed - keep it locked until modal closes
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
                    setNotification({ show: true, type: 'success', message: t('notifications.meetingScheduled') });

                    // Open Google Calendar
                    const fmtDate = formData.date.replace(/-/g, '');
                    const startTimeStr = formData.startTime.replace(':', '') + '00';
                    const endTimeStr = formData.endTime.replace(':', '') + '00';
                    const startStr = `${fmtDate}T${startTimeStr}`;
                    const endStr = `${fmtDate}T${endTimeStr}`;
                    
                    const gcalUrl = `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(formData.title)}&details=${encodeURIComponent(formData.description)}&location=${encodeURIComponent(formData.type === 'Online' ? (formData.meetLink || 'Online') : (formData.location || ''))}&dates=${startStr}/${endStr}&add=${allInviteeEmailsForCalendar.join(',')}`;
                    window.open(gcalUrl, '_blank');
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
            setNotification({ show: true, type: 'success', message: t('notifications.meetingCancelled') });
        } catch (err) {
            console.error(err);
            setNotification({ show: true, type: 'error', message: t('notifications.meetingCancelError') });
        } finally {
            setMeetingToDelete(null);
        }
    };

    const resetForm = () => {
        setFormData({ title: '', date: '', startTime: '', endTime: '', host: '', host_id: '', type: 'Online', location: '', meetLink: '', description: '', competency_type: '', competency_name: '', pre_test_data: { questions: [] }, post_test_data: { questions: [] }, material_link: '', training_gr_type: '' });
        setInvitedEmails([]);
        setInvitedEmployeeIds([]);
        setHostSearch('');
        setParticipantSearch('');
        setShowHostDropdown(false);
        setShowParticipantDropdown(false);
        setIsEditing(false);
        setEditId(null);
        setEditIsClosed(false);
        setActiveCreateTab('details');
    };


    const getHostStats = () => {
        // chunk meetings by host
        const hosts: Record<string, ExtendedMeeting[]> = {};

        meetings.forEach(m => {
            const d = new Date(m.date);

            // Date Range Filter - use local date comparison to avoid timezone issues
            if (!isWithinDateRange(d, startDate, endDate)) return;

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

    const exportHostExcel = async () => {
        const stats = getHostStats();
        const dataRows: any[] = [];
        let globalIndex = 1; // Start from 1

        // Fetch all quiz results and feedback for meetings in the filtered range
        let allQuizResults: any[] = [];
        const meetingFeedbackMap = new Map<number, any[]>();

        try {
            for (const hostStat of stats) {
                for (const m of hostStat.meetings) {
                    const mid = m.id;

                    // Fetch ALL quiz results for this meeting (without user filter) using new endpoint
                    try {
                        const qRes = await fetch(`${API_BASE_URL}/api/quiz/results/meeting-all/${mid}`);
                        if (qRes.ok) {
                            const data = await qRes.json();
                            if (Array.isArray(data)) {
                                allQuizResults.push(...data);
                            }
                        }
                    } catch(e) {}

                    // Fetch feedback for this meeting - get from summary endpoint
                    try {
                        const sRes = await fetch(`${API_BASE_URL}/api/meetings/summary/${mid}`);
                        if (sRes.ok) {
                            const sData = await sRes.json();
                            if (sData.allFeedbackResults && Array.isArray(sData.allFeedbackResults)) {
                                meetingFeedbackMap.set(mid, sData.allFeedbackResults);
                            } else {
                                meetingFeedbackMap.set(mid, []);
                            }
                        } else {
                            meetingFeedbackMap.set(mid, []);
                        }
                    } catch(e) {
                        meetingFeedbackMap.set(mid, []);
                    }
                }
            }
        } catch(e) { console.error('Failed to fetch quiz results', e); }

        stats.forEach(hostStat => {
            hostStat.meetings.forEach(m => {
                const meetingDate = new Date(m.date);

                // Calculate quarter
                const monthNum = meetingDate.getMonth() + 1;
                const quarter = Math.ceil(monthNum / 3);

                // Get ALL participants count (include Internship/PKL for Number of Participants)
                // Use Map-based deduplication with employee_id as unique key to avoid counting same person twice
                const participantMap = new Map<string, string>();

                // Add from guests.employee_ids first
                ((m.guests as any)?.employee_ids || []).forEach((empId: string) => {
                    if (empId) participantMap.set(String(empId).toLowerCase().trim(), String(empId).toLowerCase().trim());
                });

                // Add from guests.emails, map to employee_id if possible
                (m.guests?.emails || []).forEach((email: string) => {
                    if (!email) return;
                    const emp = employees.find(e => e.email?.toLowerCase() === email.toLowerCase());
                    if (emp && String(emp.id_employee)) {
                        participantMap.set(String(emp.id_employee).toLowerCase().trim(), String(emp.id_employee).toLowerCase().trim());
                    } else {
                        // Fallback: use email as key if no matching employee found
                        participantMap.set(email.toLowerCase().trim(), email.toLowerCase().trim());
                    }
                });

                const allParticipantEmails = Array.from(participantMap.values());

                // Get attended participants from attendance checklist
                const attendedIdsSet = new Set((m.costReport?.attendee_ids || []).map(id => String(id).toLowerCase().trim()));

                // Get valid participants count (only attended + exclude Internship/PKL)
                const validParticipants = allParticipantEmails.filter(email => {
                    const emp = employees.find(e =>
                        e.email?.toLowerCase() === email ||
                        String(e.id_employee) === email ||
                        String(e.id) === email
                    );
                    // Exclude non-attended participants
                        if (!attendedIdsSet.has(String(emp?.id_employee || email).toLowerCase().trim())) {
                            return false;
                        }
                        // Exclude Internship/PKL
                        if (emp && (emp.status_join === 'Internship' || emp.status_join === 'PKL')) {
                            return false;
                        }
                        return true;
                }).length;

                // Get training hours from meeting time
                let trainingHours = 0;
                if (m.time) {
                    const parts = m.time.split('-');
                    if (parts.length === 2) {
                        const parseTime = (t: string) => {
                            const [h, min] = t.trim().split(':').map(Number);
                            return (h || 0) + (min || 0) / 60;
                        };
                        const startH = parseTime(parts[0]);
                        const endH = parseTime(parts[1]);
                        if (endH > startH) {
                            trainingHours = Math.round(endH - startH);
                        }
                    }
                }

                // Calculate costs
                const costReport: any = m.costReport || {};
                const trainingCost = Number(costReport.trainerIncentive || 0) +
                                    Number(costReport.audienceFee || 0) * validParticipants;
                const venueMealsCost = Number(costReport.snackCost || 0) +
                                      Number(costReport.lunchCost || 0) +
                                      Number(costReport.otherCost || 0);
                const totalCost = trainingCost + venueMealsCost;

                // Get feedback scores - calculate average from all participants for this meeting
                let pte1: string | number = '-';
                const meetingFeedbacks = meetingFeedbackMap.get(m.id) || [];

                if (meetingFeedbacks && meetingFeedbacks.length > 0) {
                    const allScores: number[] = [];
                    for (const fb of meetingFeedbacks) {
                        try {
                            // Handle different feedback data formats
                            let fbData = fb.feedback_data || fb.data || fb.response;
                            if (typeof fbData === 'string') {
                                fbData = JSON.parse(fbData);
                            }
                            if (fbData && typeof fbData === 'object') {
                                const scores = Object.values(fbData)
                                    .filter(v => typeof v === 'number' || !isNaN(Number(v)))
                                    .map(v => Number(v));
                                allScores.push(...scores);
                            }
                        } catch(e) {}
                    }
                    if (allScores.length > 0) {
                        const avg = allScores.reduce((a, b) => a + b, 0) / allScores.length;
                        pte1 = avg.toFixed(2);
                    }
                }

                // Get pre-test and post-test averages from fetched quiz results
                let avgPre: string | number = '-';
                let avgPost: string | number = '-';
                const meetingQuizResults = allQuizResults.filter(r => {
                    const rMeetingId = Number(r.meeting_id || r.meetingId);
                    return rMeetingId === m.id;
                });

                const preScores = meetingQuizResults
                    .filter(r => (r.quiz_type || r.quizType || '').toUpperCase().includes('PRE'))
                    .map(r => Number(r.score) || 0);
                const postScores = meetingQuizResults
                    .filter(r => (r.quiz_type || r.quizType || '').toUpperCase().includes('POST'))
                    .map(r => Number(r.score) || 0);

                if (preScores.length > 0) avgPre = Math.round(preScores.reduce((a, b) => a + b, 0) / preScores.length);
                if (postScores.length > 0) avgPost = Math.round(postScores.reduce((a, b) => a + b, 0) / postScores.length);

                // Calculate % increment
                let percentIncrement = '-';
                if (avgPre !== '-' && avgPost !== '-' && Number(avgPre) > 0) {
                                        percentIncrement = (((Number(avgPost) - Number(avgPre)) / Number(avgPre)) * 100).toFixed(2) + '%';
                }

                dataRows.push({
                    "No": globalIndex++,
                    "Quarter": quarter,
                    "Month": meetingDate.toLocaleString('en-US', { month: 'long' }),
                    "Date": meetingDate.getDate(),
                    "Years": meetingDate.getFullYear(),
                    "Training Name": m.title,
                    "Number of Participants\n(Jumlah peserta yang hadir training)": validParticipants,
                    "Training Type": m.type || 'Internal',
                    "ESG/HSE/OTHER": m.training_gr_type || 'Other',
                    "Competency Type": m.competency_type || '-',
                    "Competency Name": m.competency_name || '-',
                    "Training Days": 1,
                    "Training Hours": trainingHours,
                    "Man Hours\n(Jumlah peserta present x Training hours)": validParticipants * trainingHours,
                    "Vendor": 'Internal',  // Internal training - always "Internal" for vendor column
                    "Facilitator": m.host || '-',
                    "Training Cost\n(Fee dari vendor)": Math.round(trainingCost),
                    "Venue/Meals Cost\n(Fee dari tempat pelaksanaan training)": Math.round(venueMealsCost),
                    "Total Cost\n(Training Cost + Venue/Meals)": Math.round(totalCost),
                    "PTE 1\n(Average feedback survey)": pte1,
                    "Material\n(Average penilaian feedbacksurvey terkait materi training)": '',
                    "Facilitator2": '',
                    "Venue & Meals": '',
                    "Pre-Test": avgPre === '-' ? '-' : String(avgPre),
                    "Post-Test": avgPost === '-' ? '-' : String(avgPost),
                    "% Increment\n(Nilai Post Test - Nilai Pre Test)/ Nilai Pre Test": percentIncrement,
                    "PTE 3": '',
                    "Notes": ''
                });
            });
        });

        const ws = XLSX.utils.json_to_sheet(dataRows);

        // These columns are intentionally left blank for manual/offline input;
        // highlight both header and data cells with the same gray fill so they stand out for the person filling them in.
        const placeholderColumns = [
            "Material\n(Average penilaian feedbacksurvey terkait materi training)",
            "Facilitator2",
            "Venue & Meals",
            "PTE 3",
            "Notes"
        ];
        if (dataRows.length > 0) {
            const headers = Object.keys(dataRows[0]);
            const grayFillStyle = {
                fill: { fgColor: { rgb: "D9D9D9" }, patternType: "solid" as const }
            };

            placeholderColumns.forEach(colName => {
                const colIdx = headers.indexOf(colName);
                if (colIdx === -1) return;
                const colLetter = XLSX.utils.encode_col(colIdx);

                const headerCellRef = `${colLetter}1`;
                if (ws[headerCellRef]) ws[headerCellRef].s = grayFillStyle;

                for (let r = 0; r < dataRows.length; r++) {
                    const cellRef = `${colLetter}${r + 2}`;
                    if (!ws[cellRef]) ws[cellRef] = { t: 's', v: '' };
                    ws[cellRef].s = grayFillStyle;
                }
            });
        }

        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Hosts");
        XLSX.writeFile(wb, `Internal_Training_Hosts_${startDate}_to_${endDate}.xlsx`);
    };

    const exportParticipantExcel = () => {
        const dataRows: any[] = [];
        const headers = [
            "No", "Employee Name", "ID", "Training Type", "Designation",
            "Company Group", "Company", "Grade", "Band", "Directorate",
            "Division", "Department", "LOB", "Divison Type Mapping",
            "Quarter", "Year", "Month", "Month by number", "Start Date",
            "End Date", "Training Hours", "Competencies Type", "Competency Detail",
            "ESG, HSE, Other", "Training Name", "Attendance", "Participation Type", "Vendor",
            "Facilitator", "Total Cost", "PTE 1 Score", "Pre-Test",
            "Post-Test", "% Increment", "PTE 3", "Age", "Age Group",
            "Gender", "Action Plan", "Detail Participant Type"
        ];

        const filtered = [...filteredMeetings].sort((a, b) => {
            const aTime = new Date(a.date).getTime();
            const bTime = new Date(b.date).getTime();
            if (isNaN(aTime) && isNaN(bTime)) return 0;
            if (isNaN(aTime)) return 1;
            if (isNaN(bTime)) return -1;
            return aTime - bTime;
        });
        let globalIndex = 1;

        // Helper to calculate duration from time string like '09:30 - 15:30'
        const calculateDuration = (timeStr: string): number => {
            if (!timeStr || !timeStr.includes('-')) return 0;
            try {
                const parts = timeStr.split('-');
                if (parts.length !== 2) return 0;

                const start = parts[0].trim(); // '09:30'
                const end = parts[1].trim();   // '15:30'

                const [startH, startM] = start.split(':').map(Number) as [number, number];
                const [endH, endM] = end.split(':').map(Number) as [number, number];

                if (isNaN(startH) || isNaN(startM) || isNaN(endH) || isNaN(endM)) return 0;

                // Convert to minutes for calculation
                const startMinutes = startH * 60 + startM;
                const endMinutes = endH * 60 + endM;

                // Handle case where end time is next day (e.g., 22:00 - 02:00)
                let totalMinutes = endMinutes - startMinutes;
                if (totalMinutes < 0) {
                    totalMinutes += 24 * 60;
                }

                const diffHours = Math.round((totalMinutes / 60) * 2) / 2; // Round to nearest 0.5 hour
                return diffHours;
                return Math.round(diffHours * 2) / 2; // Round to nearest 0.5 hour
            } catch (e) {
                return 0;
            }
        };

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
                ...meetingResults.map(r => r.employee_id || r.employeeId || r.userEmail || r.user_email || r.email || r.studentId || r.student_id || r.userId || r.user_id || r.id).filter(Boolean).map(id => String(id).toLowerCase().trim()),
                ...meetingFeedback.map(f => f.employee_id || f.employeeId || f.userEmail || f.user_email || f.userId || f.user_id || f.email || f.studentId || f.student_id || f.id).filter(Boolean).map(id => String(id).toLowerCase().trim())
            ])).reduce((acc: string[], id) => {
                const emp = (employees || []).find(e => e.email?.toLowerCase() === id || String(e.id_employee).toLowerCase() === id || String(e.id).toLowerCase() === id);
                const primary = (emp?.email || id).toLowerCase();
                if (!acc.includes(primary)) acc.push(primary);
                return acc;
            }, []);

            // Filter participants: exclude Internship/PKL from cost calculation
            const validParticipantIds = allParticipantEmails.filter(id => {
                const emp = employees.find(e => e.email?.toLowerCase() === id || String(e.id_employee).toLowerCase() === id || String(e.id).toLowerCase() === id);
                if (emp && (emp.status_join === 'Internship' || emp.status_join === 'PKL')) {
                    return false; // Exclude Internship/PKL
                }
                return true;
            });

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

                const mDate = new Date(m.date);
                // Format date as DD/MM/YYYY for Start Date and End Date columns
                const formatDDMMYYYY = (date: Date) => {
                    const day = String(date.getDate()).padStart(2, '0');
                    const month = String(date.getMonth() + 1).padStart(2, '0');
                    const year = date.getFullYear();
                    return `${day}/${month}/${year}`;
                };
                // Format date as DD/MM/YYYY HH:mm, appending a time string (e.g. "09:30") when available
                const formatDDMMYYYYWithTime = (date: Date, timeStr?: string) => {
                    const datePart = formatDDMMYYYY(date);
                    const cleanTime = (timeStr || '').trim();
                    return cleanTime ? `${datePart} ${cleanTime}` : datePart;
                };
                const [meetingStartTime, meetingEndTime] = (() => {
                    if (m.time && m.time.includes('-')) {
                        const [start, end] = m.time.split('-');
                        return [start?.trim() || '', end?.trim() || ''];
                    }
                    return ['', ''];
                })();
                // Helper to escape commas in CSV
                const esc = (val: any) => {
                    if (val === null || val === undefined) return "";
                    return String(val).replace(/,/g, ' ');
                };

                // Calculate % increment: (Post Test - Pre Test) / Pre Test
                // Calculate % increment: (Post Test - Pre Test) / Pre Test as percentage
                const increment = (avgPre !== '-' && avgPost !== '-' && Number(avgPre) > 0) 
                    ? (((Number(avgPost) - Number(avgPre)) / Number(avgPre)) * 100).toFixed(2) + '%'
                    : '-';

                const totalCost = (m.costReport?.trainerIncentive || 0) +
                                  (m.costReport?.snackCost || 0) +
                                  (m.costReport?.lunchCost || 0) +
                                  (m.costReport?.otherCost || 0);

                // Calculate cost per valid participant (exclude Internship/PKL from divisor)
                const validCount = validParticipantIds.length;
                const totalCostPerParticipant = validCount > 0 ? (totalCost / validCount) : 0;

                // Check if current employee is Internship/PKL - if so, cost = 0
                const isInternshipOrPKL = emp && (emp.status_join === 'Internship' || emp.status_join === 'PKL');
                const participantCost = isInternshipOrPKL ? 0 : Math.round(totalCostPerParticipant);

                dataRows.push([
                    globalIndex++,
                    esc(name),
                    emp?.id_employee ? String(emp.id_employee).padStart(7, '0') : '-',  // ID dengan leading zeros (0202127)
                    "Internal",
                    esc(emp?.job_position || '-'),
                    esc((emp as any)?.company_group || 'MAN'),  // Default to "MAN" for company group
                    esc(emp?.branch_name || '-'), // Swapped: branch_name to Company column
                    esc(emp?.job_level || '-'),
                    esc((emp as any)?.band || '-'),
                    esc((emp as any)?.directorate || '-'),
                    esc(emp?.organization_name || '-'), // Updated: Division taken from organization_name
                    esc((emp as any)?.department || '-'),
                    '', // LOB (intentionally left blank for manual/offline input)
                    '', // Divison Type Mapping (intentionally left blank for manual/offline input)
                    Math.floor((mDate.getMonth() + 3) / 3),
                    mDate.getFullYear(),
                    mDate.toLocaleString('default', { month: 'long' }),
                    mDate.getMonth() + 1,

                    // Start Date = meeting date + start time (e.g. "02/01/2026 09:30")
                    (() => {
                        const startDate = m.date || '';
                        return formatDDMMYYYYWithTime(new Date(startDate), meetingStartTime);
                    })(),  // Start Date

                    // End Date = meeting date + end time (assumes single-day events)
                    (() => {
                        const endDate = m.date || ''; // Default to same date
                        return formatDDMMYYYYWithTime(new Date(endDate), meetingEndTime);
                    })(),  // End Date

                    // Calculate Training Hours from time string like '09:30 - 15:30'
                    (() => {
                        const hours = calculateDuration(m.time || '');
                        return `${hours}:00`;  // Format as "X:00" or "X.5:00"
                    })(),
                    esc((m as any).competency_type || 'Core'),
                    esc((m as any).competency_name || '-'),
                    esc((m as any).training_gr_type || 'Other'),  // ESG, HSE, Other - posisi sesuai template
                    esc(m.title),
                    (avgPre !== '-' || avgPost !== '-' || avgFB !== '-') ? 'Present' : 'Absent',
                    (() => {
                        // Get participation type for this employee from costReport.participationTypesByEmployee
                        const participationTypes = (m as any).costReport?.participationTypesByEmployee;
                        if (!participationTypes) return 'Targeted Participants';

                        // Try to match by employee_id first, then email
                        const empId = emp?.id_employee || email;
                        if (participationTypes[empId]) {
                            return participationTypes[empId];
                        }
                        if (emp?.email && participationTypes[emp.email]) {
                            return participationTypes[emp.email];
                        }
                        return 'Targeted Participants'; // Default
                    })(),
                    'Internal',
                    esc(m.host),
                    participantCost,
                    avgFB !== '-' ? avgFB : '-',  // PTE 1 Score - use actual feedback score
                    avgPre,
                    avgPost,
                    increment,
                    '-', // PTE 3
                    (() => {
                        if ((emp as any)?.age) return (emp as any).age + ' Tahun';
                        if ((emp as any)?.birth_date) {
                            const birth = new Date((emp as any).birth_date);
                            const ageDifMs = Date.now() - birth.getTime();
                            const ageDate = new Date(ageDifMs);
                            return Math.abs(ageDate.getUTCFullYear() - 1970) + ' Tahun';
                        }
                        return '-';
                    })(),
                    // Calculate Age Group based on age from birth_date
                    (() => {
                        let age = 0;

                        // Try to get age directly or calculate from birth_date
                        if ((emp as any)?.age) {
                            age = parseInt((emp as any).age);
                        } else if ((emp as any)?.birth_date) {
                            const birth = new Date((emp as any).birth_date);
                            const diff = Date.now() - birth.getTime();
                            const ageDate = new Date(diff);
                            age = Math.abs(ageDate.getUTCFullYear() - 1970);
                        }

                        if (age <= 0) return '-';

                        // Determine age group range
                        if (age < 25) return '20-30 years';
                        if (age <= 30) return '20-30 years';
                        if (age <= 40) return '31-40 years';
                        if (age <= 50) return '41-50 years';
                        if (age <= 60) return '51-60 years';
                        return '>60 years';
                    })(),
                    esc((emp as any)?.gender || '-'),
                    '', // Action Plan (intentionally left blank for manual/offline input)
                    ''  // Detail Participant Type (intentionally left blank for manual/offline input)
                ]);
            });
        });

        const ws = XLSX.utils.aoa_to_sheet([headers, ...dataRows]);

        // These columns are intentionally left blank for manual/offline input;
        // highlight both header and data cells with the same gray fill so they stand out for the person filling them in.
        const placeholderColumns = ["LOB", "Divison Type Mapping", "Action Plan", "Detail Participant Type"];
        const grayFillStyle = {
            fill: { fgColor: { rgb: "D9D9D9" }, patternType: "solid" as const }
        };
        placeholderColumns.forEach(colName => {
            const colIdx = headers.indexOf(colName);
            if (colIdx === -1) return;
            const colLetter = XLSX.utils.encode_col(colIdx);

            const headerCellRef = `${colLetter}1`;
            if (ws[headerCellRef]) ws[headerCellRef].s = grayFillStyle;

            for (let r = 0; r < dataRows.length; r++) {
                const cellRef = `${colLetter}${r + 2}`;
                if (!ws[cellRef]) ws[cellRef] = { t: 's', v: '' };
                ws[cellRef].s = grayFillStyle;
            }
        });

        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Participants");
        XLSX.writeFile(wb, `Internal_Training_Participants_${startDate}_to_${endDate}.xlsx`);
    };

    const formatCurrency = (val: number) => new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(val);

    const uploadFileToServer = async (file: File): Promise<string> => {
        const formData = new FormData();
        formData.append('file', file);
        const res = await fetch(`${API_BASE_URL}/api/upload`, {
            method: 'POST',
            body: formData
        });
        if (!res.ok) throw new Error('Upload failed');
        const data = await res.json();
        return data.fileUrl;
    };

    const getFullImageUrl = (path?: string) => {
        if (!path) return '';
        if (path.startsWith('http')) return path;
        return `${API_BASE_URL}${path}`;
    };

    const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        try {
            setNotification({ show: true, type: 'success', message: t('notifications.uploadingPhoto') });
            const url = await uploadFileToServer(file);
            setReportData(prev => ({ ...prev, trainingPhotos: url }));
            setNotification({ show: true, type: 'success', message: t('notifications.photoUploadSuccess') });
        } catch (err) {
            console.error(err);
            setNotification({ show: true, type: 'error', message: t('notifications.photoUploadError') });
        }
    };

    return (
        <div className="space-y-6 animate-fade-in">
             <PopupNotification
                isOpen={notification.show}
                type={notification.type}
                message={notification.message}
                onClose={() => {
                    setNotification({ ...notification, show: false });
                    if (notification.onClose) notification.onClose();
                }}
            />

            <ConfirmationModal
                isOpen={!!meetingToDelete}
                onClose={() => setMeetingToDelete(null)}
                onConfirm={handleDelete}
                title={t('cancelMeetingModal.title')}
                message={t('cancelMeetingModal.message')}
                confirmText={t('cancelMeetingModal.confirmText')}
                variant="danger"
            />

            {showParticipantModal && selectedMeeting && meetingSummary && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6">
                    <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={() => setShowParticipantModal(null)} />
                    <div className="relative bg-white rounded-3xl w-full max-w-3xl max-h-[85vh] flex flex-col shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
                        <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
                            <div>
                                <h3 className="text-xl font-black text-slate-800">
                                    {showParticipantModal === 'sudah' ? t('participantModal.titleDone') : t('participantModal.titlePending')}
                                </h3>
                                <p className="text-xs font-medium text-slate-500 mt-1">{t('participantModal.subtitle')}</p>
                            </div>
                            <button onClick={() => setShowParticipantModal(null)} className="w-10 h-10 flex items-center justify-center rounded-full bg-slate-100 text-slate-500 hover:bg-slate-200 hover:text-slate-700 transition-colors">
                                <X size={20} />
                            </button>
                        </div>
                        <div className="flex-1 overflow-y-auto p-0">
                            <table className="w-full text-left text-sm">
                                <thead className="bg-slate-50 sticky top-0 z-10 border-b border-slate-200">
                                    <tr>
                                        <th className="px-6 py-4 text-xs font-black text-slate-500 uppercase tracking-widest">{t('participantModal.colParticipantName')}</th>
                                        <th className="px-6 py-4 text-xs font-black text-slate-500 uppercase tracking-widest text-center">{t('participantModal.colPreTest')}</th>
                                        <th className="px-6 py-4 text-xs font-black text-slate-500 uppercase tracking-widest text-center">{t('participantModal.colPostTest')}</th>
                                        <th className="px-6 py-4 text-xs font-black text-slate-500 uppercase tracking-widest text-center">{t('participantModal.colFeedback')}</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                    {(() => {
                                        const results = meetingSummary.allQuizResults || [];
                                        const feedbacks = meetingSummary.allFeedbackResults || [];

                                        // Debug: Log the actual data structure
                                        console.log('[Modal Data] allQuizResults:', results);
                                        console.log('[Modal Data] participants from guests:', (selectedMeeting.guests as any)?.details || []);

                                        // Get participant list from multiple possible sources
                                        let participants: string[] = [];
                                        if (selectedMeeting.guests?.emails && selectedMeeting.guests.emails.length > 0) {
                                            // Primary source: emails array
                                            participants = selectedMeeting.guests.emails;
                                        } else if (selectedMeeting.guests?.employee_ids && selectedMeeting.guests.employee_ids.length > 0) {
                                            // Fallback: employee_ids array
                                            participants = selectedMeeting.guests.employee_ids;
                                        } else if (selectedMeeting.guests && Array.isArray((selectedMeeting.guests as any).details)) {
                                            // Fallback: details array - extract employee_ids or names
                                            participants = (selectedMeeting.guests as any).details.map((d: any) => d.employee_id || d.name).filter(Boolean);
                                        } else if (results.length > 0 && (!selectedMeeting.guests || Object.keys(selectedMeeting.guests).length === 0)) {
                                            // CRITICAL FALLBACK: If guests.details is empty, get participants from quiz results!
                                            console.log('[RenderRow] No guests found - using quizResults for participant list');
                                            const ids = new Set<string>();
                                            results.forEach(r => {
                                                const id = (r.student_id || r.employee_id);
                                                if (id) ids.add(String(id));
                                            });

                                            // Also add user_ids from feedback results
                                            feedbacks.forEach(f => {
                                                const uid = f.user_id;
                                                if (uid) ids.add(String(uid));
                                            });
                                            participants = (selectedMeeting.guests as any).details.map((d: any) => d.employee_id || d.name).filter(Boolean);
                                        } else if (results.length > 0) {
                                            // Last resort: get unique student/employee IDs from quiz results
                                            const ids = new Set<string>();
                                            results.forEach(r => {
                                                const id = r.student_id || r.employee_id;
                                                if (id) ids.add(String(id));
                                            });
                                            participants = Array.from(ids);
                                        }

                                        const isMatch = (item: any, participantId: string) => {
                                            if (!item) return false;

                                            // Normalize strings for comparison
                                            const target = String(participantId).toLowerCase().trim();

                                            // Get all possible IDs from the item (quiz result or feedback)
                                            const itemIdStr = (item.student_id || item.user_id || '').toString().toLowerCase().trim();
                                            const itemEmployeeIdForMatch = String(item.employee_id || '').toLowerCase().trim();
                                            const itemUserIdForMatch = String(item.user_id || '').toLowerCase().trim();
                                            const itemEmailForMatch = String(item.email || item.user_email || '').toLowerCase().trim();

                                            // CRITICAL: Match by user_id/email first (for feedback data)
                                            if (target.includes('@') && itemUserIdForMatch === target) {
                                                console.log('[isMatch] SUCCESS: user_id match (email):', target);
                                                return true;
                                            }
                                            if (itemEmailForMatch === target) {
                                                console.log('[isMatch] SUCCESS: email match:', target);
                                                return true;
                                            }

                                            // CRITICAL: Match participant email to employee, then check if item has that employee_id
                                            let matchedEmployeeId = null;
                                            const empByEmail = employees.find(e => {
                                                const eEmail = (e.email || '').toLowerCase().trim();
                                                return eEmail === target || eEmail === target.split('@')[0];
                                            });
                                            if (empByEmail) {
                                                matchedEmployeeId = String(empByEmail.id_employee || empByEmail.id || '');
                                                console.log('[isMatch] Found employee by email:', empByEmail.full_name, 'employee_id:', matchedEmployeeId);
                                                // Check if item has matching employee_id
                                                if (itemEmployeeIdForMatch && itemEmployeeIdForMatch === String(matchedEmployeeId).toLowerCase().trim()) {
                                                    console.log('[isMatch] SUCCESS: Matched via employee lookup from email');
                                                    return true;
                                                }
                                            }

                                            // Match by name from guest details
                                            const emp = employees.find(e => {
                                                const eId = String(e.id_employee || '').toLowerCase().trim();
                                                const eEmail = (e.email || '').toLowerCase().trim();
                                                return eId === target || eEmail === target || eEmail === target.split('@')[0];
                                            });
                                            if (emp) {
                                                // Check if item's employee_id matches found employee
                                                const empEmployeeId = String(emp.id_employee || emp.id || '').toLowerCase().trim();
                                                if (itemEmployeeIdForMatch === empEmployeeId) {
                                                    console.log('[isMatch] SUCCESS: Employee match via employees list');
                                                    return true;
                                                }
                                            }

                                            // No match found
                                            console.log('[isMatch] FAILED for target:', target, 'itemIdStr:', itemIdStr, 'itemEmployeeId:', itemEmployeeIdForMatch);
                                            return false;
                                        };

                                        const renderedRows = participants.map((participantId: string) => {
                                            // Get quiz results for this participant
                                            console.log('[RenderRow] Processing participantID:', participantId, '(type:', typeof participantId + ')');

                                            // Debug: Log all results and their types
                                            console.log('[RenderRow] All quizResults from server:', results.map(r => ({
                                                student_id: r.student_id,
                                                employee_id: r.employee_id,
                                                student_name: r.student_name,
                                                quizType: r.quizType || r.quiz_type,
                                                score: r.score
                                            })));

                                            // First filter by match, then check type - ensure isMatch is called consistently
                                            const matchedResults = results.filter(r => {
                                                const matched = isMatch(r, participantId);
                                                if (matched) {
                                                    console.log('[RenderRow] MATCHED result:', r.student_name, 'quizType:', r.quizType || r.quiz_type);
                                                }
                                                return matched;
                                            });

                                            const preScores = matchedResults.filter(r => ((r.quizType || r.quiz_type || "")).toUpperCase().includes('PRE')).map(r => Number(r.score) || 0);
                                            const postScores = matchedResults.filter(r => ((r.quizType || r.quiz_type || "")).toUpperCase().includes('POST')).map(r => Number(r.score) || 0);

                                            console.log('[RenderRow] MATCHED results for', participantId, '- count:', matchedResults.length, 'preScores:', preScores, 'postScores:', postScores);

                                            // Get pre/post test questions from meeting data to determine if tests are required
                                            let preQuestions: any[] = [];
                                            let postQuestions: any[] = [];
                                            try {
                                                const preTestData = typeof selectedMeeting.pre_test_data === 'string'
                                                    ? JSON.parse(selectedMeeting.pre_test_data || '{}')
                                                    : (selectedMeeting.pre_test_data || {});
                                                preQuestions = preTestData.questions || [];
                                            } catch(e) {}

                                            try {
                                                const postTestData = typeof selectedMeeting.post_test_data === 'string'
                                                    ? JSON.parse(selectedMeeting.post_test_data || '{}')
                                                    : (selectedMeeting.post_test_data || {});
                                                postQuestions = postTestData.questions || [];
                                            } catch(e) {}

                                            // Check if pre/post tests are required (have questions defined)
                                            const requiresPreTest = preQuestions.length > 0;
                                            const requiresPostTest = postQuestions.length > 0;

                                            const hasPreTest = preScores.length > 0;
                                            const hasPostTest = postScores.length > 0;

                                            // Enhanced feedback matching - try multiple approaches
                                            let hasFeedback = false;
                                            console.log('[Feedback Match] Checking participant:', participantId, 'with', feedbacks.length, 'feedback records');

                                            for (const f of feedbacks) {
                                                console.log('[Feedback Match] Trying to match:', {
                                                    participantId,
                                                    fb_employee_id: f.employee_id,
                                                    fb_user_id: f.user_id
                                                });

                                                // Direct user_id match (primary method for feedback)
                                                const fbUserId = String(f.user_id || '').toLowerCase().trim();
                                                if (fbUserId && fbUserId === participantId.toLowerCase().trim()) {
                                                    hasFeedback = true;
                                                    console.log('[Feedback Match] SUCCESS via direct user_id match:', fbUserId);
                                                    break;
                                                }

                                                // Direct employee_id match via employee lookup
                                                const fbEmployeeId = String(f.employee_id || '').toLowerCase().trim();
                                                if (fbEmployeeId) {
                                                    const emp = employees.find(e => {
                                                        const eEmail = (e.email || '').toLowerCase().trim();
                                                        return eEmail === participantId.toLowerCase().trim() ||
                                                               eEmail === participantId.toLowerCase().split('@')[0];
                                                    });
                                                    if (emp && fbEmployeeId === String(emp.id_employee || emp.id).toLowerCase().trim()) {
                                                        hasFeedback = true;
                                                        console.log('[Feedback Match] SUCCESS via employee_id match:', fbEmployeeId);
                                                        break;
                                                    }
                                                }

                                                // Try standard isMatch as fallback
                                                if (isMatch(f, participantId)) {
                                                    hasFeedback = true;
                                                    console.log('[Feedback Match] SUCCESS via isMatch');
                                                    break;
                                                }
                                            }

                                            // Participant is "done" if:
                                            // - They completed Feedback (required for all)
                                            // - AND they completed Pre-Test (if required)
                                            // - AND they completed Post-Test (if required)
                                            // If no tests are defined (external training), only feedback completion matters
                                            const isDone = hasFeedback &&
                                                (!requiresPreTest || hasPreTest) &&
                                                (!requiresPostTest || hasPostTest);

                                            if (showParticipantModal === 'sudah' && !isDone) return null;
                                            if (showParticipantModal === 'belum' && isDone) return null;

                                            const emp = employees.find(e => e.email?.toLowerCase() === participantId.toLowerCase() || String(e.id_employee).toLowerCase() === participantId.toLowerCase());
                                            // Try to get name from guest details if not found in employees list
                                            const guestDetails = (selectedMeeting.guests as any)?.details || [];
                                            const matchingGuest = guestDetails.find((g: any) =>
                                                String(g.employee_id) === String(participantId) ||
                                                g.name?.toLowerCase() === participantId.toLowerCase()
                                            );
                                            const name = emp?.full_name || matchingGuest?.name || participantId;

                                            const preScore = hasPreTest ? Math.max(...preScores) : '-';
                                            const postScore = hasPostTest ? Math.max(...postScores) : '-';

                                            let fbScore: any = '-';
                                            // Find the matching feedback using same logic as hasFeedback
                                            if (hasFeedback) {
                                                const f = feedbacks.find(feedback => {
                                                    const fbUserId = String(feedback.user_id || '').toLowerCase().trim();
                                                    const fbEmployeeId = String(feedback.employee_id || '').toLowerCase().trim();
                                                    const target = participantId.toLowerCase().trim();

                                                    // Direct user_id match
                                                    if (fbUserId === target) return true;

                                                    // Match via employee lookup
                                                    if (fbEmployeeId) {
                                                        const emp = employees.find(e => {
                                                            const eEmail = (e.email || '').toLowerCase().trim();
                                                            return eEmail === target || eEmail === target.split('@')[0];
                                                        });
                                                        if (emp && fbEmployeeId === String(emp.id_employee || emp.id).toLowerCase().trim()) return true;
                                                    }

                                                    return false;
                                                });

                                                if (f) {
                                                    console.log('[Feedback Score] Found feedback for', participantId);
                                                    const fData = f.feedbackData || f.feedback_data || f.data;
                                                    if (fData) {
                                                        try {
                                                            const data = typeof fData === 'string' ? JSON.parse(fData) : fData;
                                                            const scores = Object.values(data || {}).filter(v => typeof v === 'number' || !isNaN(Number(v as any))).map(v => Number(v as any));
                                                            if (scores.length > 0) fbScore = (scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(1);
                                                        } catch(e) {}
                                                    }
                                                }
                                            }

                                            return (
                                                <tr key={participantId} className="hover:bg-slate-50/50 transition-colors">
                                                    <td className="px-6 py-4 font-bold text-slate-700">{name}</td>
                                                    <td className="px-6 py-4 text-center font-black text-slate-600">{preScore}</td>
                                                    <td className="px-6 py-4 text-center font-black text-slate-600">{postScore}</td>
                                                    <td className="px-6 py-4 text-center font-black text-emerald-600">{fbScore}</td>
                                                </tr>
                                            );
                                        }).filter(Boolean);

                                        if (renderedRows.length === 0) {
                                            return (
                                                <tr>
                                                    <td colSpan={4} className="px-6 py-12 text-center text-slate-400 italic">
                                                        {t('participantModal.noData')}
                                                    </td>
                                                </tr>
                                            );
                                        }

                                        return renderedRows;
                                    })()}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            )}

            {/* Header / Hero Section */}
            <div className="bg-gradient-to-br from-indigo-700 via-indigo-600 to-blue-600 rounded-3xl p-8 text-white shadow-2xl relative overflow-hidden shrink-0">
                <div className="absolute top-0 right-0 p-12 opacity-10 rotate-12">
                    <Users size={180} />
                </div>
                
                <div className="relative z-10 flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
                    <div className="space-y-1.5">
                        <div className="inline-flex items-center gap-2 bg-white/10 backdrop-blur-md px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest border border-white/10 mb-2">
                            <Zap size={12} className="text-yellow-400 fill-yellow-400" /> {t('hero.badge')}
                        </div>
                        <h1 className="text-3xl md:text-4xl font-black tracking-tight leading-tight">
                            {t('hero.title')}
                        </h1>
                        <p className="text-blue-100/80 font-medium max-w-md">
                            {t('hero.subtitle')}
                        </p>
                    </div>

                    <div className="flex flex-col sm:flex-row gap-4 w-full md:w-auto items-center">
                        {!isManagementMode && (
                            <div className="bg-white/10 backdrop-blur-xl rounded-2xl p-4 border border-white/10 md:min-w-[140px] text-center shadow-lg">
                                <div className="text-[10px] font-bold text-blue-200 uppercase tracking-widest mb-1 opacity-80">{t('hero.internalTrainingHours')}</div>
                                <div className="text-2xl font-black tracking-tighter text-white">{learningStats.jamTraining} <span className="text-base font-bold opacity-80 tracking-normal">{t('hero.hoursUnit')}</span></div>
                                <div className="text-[9px] font-medium text-blue-200 mt-1">{t('hero.totalHours')}</div>
                            </div>
                        )}

                        <div className="flex flex-col sm:flex-row gap-3 w-full md:w-auto">
                            <div className="flex bg-white/10 backdrop-blur-xl p-1.5 rounded-2xl border border-white/10 self-start">
                                <button
                                    onClick={() => setListType('active')}
                                    className={`px-4 py-2 text-xs font-black uppercase tracking-wider rounded-xl transition-all ${listType === 'active' ? 'bg-white text-indigo-600 shadow-xl' : 'text-blue-100 hover:text-white'}`}
                                >
                                    {t('hero.active')}
                                </button>
                                <button
                                    onClick={() => setListType('history')}
                                    className={`px-4 py-2 text-xs font-black uppercase tracking-wider rounded-xl transition-all ${listType === 'history' ? 'bg-white text-indigo-600 shadow-xl' : 'text-blue-100 hover:text-white'}`}
                                >
                                    {t('hero.history')}
                                </button>
                            </div>

                            {isManagementMode && (
                                <div className="flex bg-white/10 backdrop-blur-xl p-1.5 rounded-2xl border border-white/10 self-start">
                                    <button
                                        onClick={() => toggleView('list')}
                                        className={`px-4 py-2 text-xs font-black uppercase tracking-wider rounded-xl transition-all ${viewMode === 'list' ? 'bg-white text-indigo-600 shadow-xl' : 'text-blue-100 hover:text-white'}`}
                                    >
                                        {t('hero.list')}
                                    </button>
                                    <button
                                        onClick={() => toggleView('recap')}
                                        className={`px-4 py-2 text-xs font-black uppercase tracking-wider rounded-xl transition-all ${viewMode === 'recap' ? 'bg-white text-indigo-600 shadow-xl' : 'text-blue-100 hover:text-white'}`}
                                    >
                                        {t('hero.recap')}
                                    </button>
                                </div>
                            )}

                            {viewMode === 'list' && (effectiveRole === 'HR' || effectiveRole === 'HR_ADMIN') && isManagementMode && (
                                <button
                                    onClick={() => { setIsEditing(false); resetForm(); setIsCreateOpen(true); }}
                                    className="px-6 py-3 bg-white text-indigo-600 rounded-2xl font-black uppercase tracking-wider text-sm hover:shadow-xl hover:shadow-white/20 transition-all hover:scale-105 active:scale-95 border border-white/20 flex items-center gap-2 self-start"
                                >
                                    <Plus size={18} /> {t('hero.createSession')}
                                </button>
                            )}
                        </div>
                    </div>
                </div>
            </div>

            {/* Export & Import Bar (Above Filter) */}
            {(effectiveRole === 'HR' || effectiveRole === 'HR_ADMIN') && isManagementMode && (
                <div className="flex justify-end gap-3 -mb-4 relative z-10">
                    <input
                        type="file"
                        ref={fileInputRef}
                        style={{ display: 'none' }}
                        accept=".xlsx, .xls, .csv"
                        onChange={handleImport}
                    />
                    <button
                        onClick={() => fileInputRef.current?.click()}
                        className="bg-white border border-slate-200 text-slate-600 px-5 py-3 rounded-2xl font-black text-[10px] uppercase tracking-widest shadow-sm hover:border-indigo-500 hover:text-indigo-600 transition-all flex items-center gap-2 group"
                    >
                        <UploadCloud size={16} className="text-slate-400 group-hover:text-indigo-500" /> {t('exportImportBar.importData')}
                    </button>
                    {viewMode === 'recap' && (
                        <>
                            <button
                                onClick={exportParticipantExcel}
                                className="bg-white border border-slate-200 text-slate-600 px-5 py-3 rounded-2xl font-black text-[10px] uppercase tracking-widest shadow-sm hover:border-emerald-500 hover:text-emerald-600 transition-all flex items-center gap-2 group"
                            >
                                <FileText size={16} className="text-slate-400 group-hover:text-emerald-500" /> {t('exportImportBar.exportParticipants')}
                            </button>
                            <button
                                onClick={exportHostExcel}
                                className="bg-white border border-slate-200 text-slate-600 px-5 py-3 rounded-2xl font-black text-[10px] uppercase tracking-widest shadow-sm hover:border-emerald-500 hover:text-emerald-600 transition-all flex items-center gap-2 group"
                            >
                                <Users size={16} className="text-slate-400 group-hover:text-emerald-500" /> {t('exportImportBar.exportHosts')}
                            </button>
                        </>
                    )}
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
                        placeholder={t('filterBar.searchPlaceholder')}
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
                            {branches.map(b => <option key={b} value={b}>{b === 'Online' ? t('filterBar.onlineOnly') : b}</option>)}
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
                                if (stats.length === 0) return <div className="py-12 text-center text-slate-400 italic bg-white rounded-3xl border border-dashed border-slate-200">{t('recap.noData')}</div>;

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
                                                    <p className="text-xs text-slate-500 font-medium">{t('recap.sessionsAudience', { sessions: stat.sessions, participants: stat.totalParticipants })}</p>
                                                </div>
                                            </div>
                                            <div className="flex items-center gap-8">
                                                <div className="text-right hidden md:block">
                                                    <span className="block text-[10px] font-black text-slate-400 uppercase tracking-widest leading-none mb-1">{t('recap.trainerIncentive')}</span>
                                                    <span className="text-lg font-black text-emerald-600 leading-none">{formatCurrency(stat.totalTrainerIncentive)}</span>
                                                </div>
                                                <div className="text-right">
                                                    <span className="block text-[10px] font-black text-slate-400 uppercase tracking-widest leading-none mb-1">{t('recap.totalCost')}</span>
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
                                                                <th className="px-6 py-3">{t('recap.colDate')}</th>
                                                                <th className="px-6 py-3">{t('recap.colCourseSession')}</th>
                                                                <th className="px-6 py-3 text-center">{t('recap.colAvgPreTest')}</th>
                                                                <th className="px-6 py-3 text-center">{t('recap.colAvgPostTest')}</th>
                                                                 <th className="px-6 py-3 text-center">{t('recap.colAvgFeedback')}</th>
                                                                 <th className="px-6 py-3 text-right">{t('recap.colCost')}</th>
                                                                <th className="px-6 py-3 text-center">{t('recap.colStatus')}</th>
                                                            </tr>
                                                        </thead>
                                                        <tbody className="divide-y divide-white">
                                                            {filteredMeetings.filter(m => m.host === stat.host).map((m) => {
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

                                                                // Averages should only reflect participants marked present in the Attendance checklist
                                                                const attendedIdsSetForAvg = new Set((m.costReport?.attendee_ids || []).map(id => String(id).toLowerCase().trim()));
                                                                const isAttendedEmail = (email: string) => {
                                                                    const target = email.toLowerCase().trim();
                                                                    if (attendedIdsSetForAvg.has(target)) return true;
                                                                    const emp = (employees || []).find(e => e.email?.toLowerCase() === target || String(e.id_employee).toLowerCase() === target || String(e.id).toLowerCase() === target);
                                                                    return !!emp && attendedIdsSetForAvg.has(String(emp.id_employee).toLowerCase().trim());
                                                                };
                                                                const attendedParticipantIds = allParticipantIds.filter(isAttendedEmail);

                                                                const preParticipants = attendedParticipantIds.filter(email => meetingResults.some(r => isParticipantMatch(r, email) && (r.quizType || (r as any).quiz_type || "").toUpperCase().includes('PRE')));
                                                                const postParticipants = attendedParticipantIds.filter(email => meetingResults.some(r => isParticipantMatch(r, email) && (r.quizType || (r as any).quiz_type || "").toUpperCase().includes('POST')));
                                                                const fbParticipants = attendedParticipantIds.filter(email => meetingFeedback.some(f => isParticipantMatch(f, email)));

                                                                const preScores = preParticipants.map(email => {
                                                                    const scores = meetingResults.filter(r => isParticipantMatch(r, email) && (r.quizType || (r as any).quiz_type || "").toUpperCase().includes('PRE')).map(r => Number(r.score) || 0);
                                                                    return Math.max(...scores, 0);
                                                                });
                                                                const postScores = postParticipants.map(email => {
                                                                    const scores = meetingResults.filter(r => isParticipantMatch(r, email) && (r.quizType || (r as any).quiz_type || "").toUpperCase().includes('POST')).map(r => Number(r.score) || 0);
                                                                    return Math.max(...scores, 0);
                                                                });
                                                                const fbScoresList: number[] = [];
                                                                fbParticipants.forEach(email => {
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

                                                                // Build unique participant list based on employee_id (primary key)
                                                                const participantMap = new Map<string, string>();

                                                                // Add from guests.employee_ids first
                                                                ((m.guests as any)?.employee_ids || []).forEach((empId: string) => {
                                                                    if (empId) participantMap.set(String(empId).toLowerCase().trim(), String(empId).toLowerCase().trim());
                                                                });

                                                                // Add from guests.emails, map to employee_id if possible
                                                                (m.guests?.emails || []).forEach((email: string) => {
                                                                    if (!email) return;
                                                                    const emp = employees?.find(e => e.email?.toLowerCase() === email.toLowerCase());
                                                                    if (emp && String(emp.id_employee)) {
                                                                        participantMap.set(String(emp.id_employee).toLowerCase().trim(), String(emp.id_employee).toLowerCase().trim());
                                                                    } else {
                                                                        participantMap.set(email.toLowerCase().trim(), email.toLowerCase().trim());
                                                                    }
                                                                });

                                                                // Add from allParticipantIds that match meeting guests
                                                                allParticipantIds.forEach(email => {
                                                                    const emp = employees?.find(e => e.email?.toLowerCase() === email.toLowerCase());
                                                                    if (emp && String(emp.id_employee)) {
                                                                        participantMap.set(String(emp.id_employee).toLowerCase().trim(), String(emp.id_employee).toLowerCase().trim());
                                                                    } else if ((m.guests?.emails || []).some((ge: string) => ge.toLowerCase() === email.toLowerCase())) {
                                                                        participantMap.set(email.toLowerCase().trim(), email.toLowerCase().trim());
                                                                    } else if (((m.guests as any)?.employee_ids || []).some((ge: string) => String(ge).toLowerCase() === String(email).toLowerCase())) {
                                                                        participantMap.set(String(email).toLowerCase().trim(), String(email).toLowerCase().trim());
                                                                    }
                                                                });

                                                                const participantEmails = Array.from(participantMap.values());

                                                                // Filter out Internship/PKL from cost calculation
                                                                // Get attended participants for cost division
                                                                const attendedIdsSet = new Set((m.costReport?.attendee_ids || []).map(id => String(id).toLowerCase().trim()));
                                                                const validParticipantEmails = participantEmails.filter(email => {
                                                                    const emp = employees?.find(e =>
                                                                        e.email?.toLowerCase() === email ||
                                                                        String(e.id_employee) === email ||
                                                                        String(e.id) === email
                                                                    );
                                                                    // Exclude non-attended participants from cost calculation
                                                                    if (!attendedIdsSet.has(String(emp?.id_employee || email).toLowerCase().trim())) {
                                                                        return false;
                                                                    }
                                                                    // Exclude Internship/PKL from cost calculation
                                                                    if (emp && (emp.status_join === 'Internship' || emp.status_join === 'PKL')) {
                                                                        return false;
                                                                    }
                                                                    return true;
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
                                                                             <td className="px-6 py-4 text-right">
                                                                                 <span className="text-xs font-bold text-slate-700">
                                                                                     {(() => {
                                                                                         const totalCost = (m.costReport?.trainerIncentive || 0) + 
                                                                                                         (m.costReport?.snackCost || 0) + 
                                                                                                         (m.costReport?.lunchCost || 0) + 
                                                                                                         (m.costReport?.otherCost || 0);
                                                                                         return totalCost > 0 ? formatCurrency(totalCost) : '-';
                                                                                     })()}
                                                                                 </span>
                                                                             </td>
                                                                            <td className="px-6 py-4 text-center whitespace-nowrap">
                                                                                <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-black uppercase border ${m.costReport?.isPaid ? 'bg-emerald-50 text-emerald-600 border-emerald-100' : 'bg-blue-50 text-blue-600 border-blue-100'}`}>
                                                                                    {m.costReport?.isPaid ? <CheckCircle size={10} /> : null}
                                                                                    {m.costReport?.isPaid ? t('recap.paid') : t('recap.pending')}
                                                                                </span>
                                                                            </td>
                                                                        </tr>
                                                                        {expandedMeetings[m.id] && (
                                                                            <tr className="bg-indigo-50/20">
                                                                                <td colSpan={7} className="p-0">
                                                                                    <div className="mx-6 my-2 border border-indigo-100/50 rounded-xl overflow-hidden bg-white shadow-inner animate-in slide-in-from-top-2 duration-200">
                                                                                        <table className="w-full text-[10px]">
                                                                                            <thead className="bg-slate-50/50 text-slate-400 font-black uppercase tracking-widest border-b border-slate-50">
                                                                                                <tr>
                                                                                                    <th className="px-6 py-3 text-left">{t('recap.colParticipantName')}</th>
                                                                                                    <th className="px-4 py-2 text-center">{t('recap.colPreTest')}</th>
                                                                                                    <th className="px-4 py-2 text-center">{t('recap.colPostTest')}</th>
                                                                                                    <th className="px-4 py-2 text-center">{t('recap.colFeedback')}</th>
                                                                                                    <th className="px-4 py-2 text-center">{t('recap.colAttendance')}</th>
                                                                                                    <th className="px-4 py-2 text-center">{t('recap.colParticipationType')}</th>
                                                                                                    <th className="px-4 py-2 text-right pr-6">{t('recap.colCost')}</th>
                                                                                                </tr>
                                                                                            </thead>
<tbody className="divide-y divide-slate-50">
                                                                                                {participantEmails.length === 0 ? (
                                                                                                    <tr>
                                                                                                        <td colSpan={7} className="px-4 py-4 text-center italic text-slate-400">{t('recap.noParticipants')}</td>
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
                                                                                                                // Calculate average of ALL numeric values (same as popup modal)
                                                                                const allScores = Object.values(data || {}).filter(v => typeof v === "number" && !isNaN(v)).map(v => Number(v));
                                                                                const ratingVal = allScores.length > 0 ? allScores.reduce((a, b) => a + b, 0) / allScores.length : null;
                                                                                                                if (ratingVal !== undefined && ratingVal !== null && !isNaN(Number(ratingVal))) {
                                                                                                                    const avg = Number(ratingVal);
                                                                                                                    feedbackDisplay = <span className="text-emerald-600 font-bold">{avg} / 4</span>;
                                                                                                                } else {
                                                                                                                    feedbackDisplay = <span className="text-emerald-500 font-bold">{t('recap.feedbackSent')}</span>;
                                                                                                                }
                                                                                                            } catch(e) {
                                                                                                                feedbackDisplay = <span className="text-emerald-500 font-bold">{t('recap.feedbackSent')}</span>;
                                                                                                            }
                                                                                                        } else {
                                                                                                            feedbackDisplay = <span className="text-emerald-500 font-bold">{t('recap.feedbackSent')}</span>;
                                                                                                        }
                                                                                                    }

                                                                                                    const isInternshipOrPKL = emp && (emp.status_join === 'Internship' || emp.status_join === 'PKL');

                                                                                                    return (
                                                                                                        <tr key={email} className="hover:bg-slate-50/50">
                                                                                                            <td className="px-4 py-2 text-slate-600 font-semibold">{emp?.full_name || email}</td>
                                                                                                            <td className="px-4 py-2 text-center font-bold text-slate-500">{pre}</td>
                                                                                                            <td className="px-4 py-2 text-center font-bold text-indigo-600">{post}</td>
                                                                                                            <td className="px-4 py-2 text-center">{feedbackDisplay}</td>
                                                                                                            {/* Attendance */}
                                                                                                            <td className="px-4 py-2 text-center">
                                                                                                                {(() => {
                                                                                                                    const attendedIds = m.costReport?.attendee_ids || [];
                                                                                                                    const isAttended = attendedIds.some(id => 
                                                                                                                        String(id).toLowerCase() === email.toLowerCase() ||
                                                                                                                        String(emp?.id_employee).toLowerCase() === String(id).toLowerCase()
                                                                                                                    );
                                                                                                                    return isAttended ? 
                                                                                                                        <svg className="w-5 h-5 text-green-500 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg> :
                                                                                                                        <svg className="w-5 h-5 text-slate-300 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>;
                                                                                                                })()}
                                                                                                            </td>
                                                                                                            {/* Participation Type */}
                                                                                                            <td className="px-4 py-2 text-center">
                                                                                                                {(() => {
                                                                                                                    const participationTypes = m.costReport?.participationTypesByEmployee || {};
                                                                                                                    let pType: string = 'Targeted Participants';
                                                                                                                    if (emp && participationTypes[emp.id_employee]) {
                                                                                                                        pType = participationTypes[emp.id_employee];
                                                                                                                    } else if (participationTypes[email]) {
                                                                                                                        pType = participationTypes[email];
                                                                                                                    }
                                                                                                                    return <span className="text-xs font-semibold">{pType}</span>;
                                                                                                                })()}
                                                                                                            </td>
                                                                                                            <td className="px-4 py-2 text-right pr-6 font-bold text-slate-700">
                                                                                                                {(() => {
                                                                                                                    // Internship/PKL get cost = 0
                                                                                                                    if (isInternshipOrPKL) return <span className="text-xs text-slate-400">-</span>;

                                                                                                                    // Non-attended participants get cost = 0
                                                                                                                    const attendedIds = m.costReport?.attendee_ids || [];
                                                                                                                    const isAttendedThis = attendedIds.some(id => 
                                                                                                                        String(id).toLowerCase() === email.toLowerCase() ||
                                                                                                                        String(emp?.id_employee).toLowerCase() === String(id).toLowerCase()
                                                                                                                    );
                                                                                                                    if (!isAttendedThis) return <span className="text-xs text-slate-400">-</span>;

                                                                                                                    const totalCost = (m.costReport?.trainerIncentive || 0) +
                                                                                                                                    (m.costReport?.snackCost || 0) +
                                                                                                                                    (m.costReport?.lunchCost || 0) +
                                                                                                                                    (m.costReport?.otherCost || 0);
                                                                                                                    // Divide by valid participants only (exclude Internship/PKL)
                                                                                                                    const cpp = validParticipantEmails.length > 0 ? totalCost / validParticipantEmails.length : 0;
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
                                {t('listView.noMeetings')}
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
                                            {meeting.is_closed ? (
                                                <span className="px-3 py-1 rounded-xl text-[9px] font-black uppercase tracking-widest bg-red-50 text-red-600 border border-red-100/50 flex items-center gap-1.5 shadow-sm">
                                                    <Lock size={10} /> {t('listView.closed')}
                                                </span>
                                            ) : (
                                                <span className="px-3 py-1 rounded-xl text-[9px] font-black uppercase tracking-widest bg-emerald-50 text-emerald-600 border border-emerald-100/50 flex items-center gap-1.5 shadow-sm">
                                                    <Zap size={10} className="animate-pulse" /> {t('listView.active')}
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
                                            <span className="line-clamp-1">{meeting.location || t('listView.onlineLocation')}</span>
                                        </div>
                                        <div className="flex items-center gap-3 text-[11px] font-bold text-slate-500 bg-slate-50/50 p-2 rounded-xl border border-transparent group-hover:border-slate-100 transition-all">
                                            <div className="w-5 h-5 rounded-full bg-indigo-600 flex items-center justify-center text-[10px] font-black text-white shadow-lg shadow-indigo-200">
                                                {meeting.host.charAt(0)}
                                            </div>
                                            <span className="opacity-80">{t('listView.hostLabel')}</span> <span className="text-slate-700">{meeting.host}</span>
                                        </div>
                                    </div>

                                    <div className="flex items-center justify-between border-t border-slate-100 pt-6 mt-auto">
                                        <div className="space-y-1">
                                            <div className="text-[9px] font-black text-slate-400 uppercase tracking-widest">{t('listView.audience')}</div>
                                            <AvatarStack count={meeting.guests?.count || 0} />
                                        </div>

                                        <div className="flex items-center gap-3">
                                            {(effectiveRole === 'HR' || effectiveRole === 'HR_ADMIN') && (
                                                <div className="flex gap-2">
                                                    <button
                                                        onClick={(e) => { e.stopPropagation(); openReportModal(meeting); }}
                                                        className="w-10 h-10 flex items-center justify-center rounded-2xl bg-slate-50 text-slate-400 hover:bg-emerald-50 hover:text-emerald-600 transition-all border border-transparent hover:border-emerald-100 shadow-sm"
                                                        title={t('listView.financialReportTitle')}
                                                    >
                                                        <DollarSign size={18} />
                                                    </button>
                                                    <button
                                                        onClick={(e) => { e.stopPropagation(); openEditModal(meeting); }}
                                                        className="w-10 h-10 flex items-center justify-center rounded-2xl bg-slate-50 text-slate-400 hover:bg-blue-50 hover:text-blue-600 transition-all border border-transparent hover:border-blue-100 shadow-sm"
                                                        title={t('listView.editMeetingTitle')}
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
                                    {isEditing ? t('createModal.editTitle') : t('createModal.createTitle')}
                                </h2>
                                <button onClick={() => { setIsCreateOpen(false); resetForm(); }} className="p-2 hover:bg-slate-100 rounded-full text-slate-400 transition-colors"><X size={20} /></button>
                            </div>

                            <div className="flex border-b border-slate-100 bg-slate-50/50">
                                <button 
                                    type="button"
                                    onClick={() => setActiveCreateTab('details')} 
                                    className={`flex-1 py-3 text-[10px] font-black uppercase tracking-widest transition-all ${activeCreateTab === 'details' ? 'text-indigo-600 border-b-2 border-indigo-600 bg-white' : 'text-slate-400 hover:text-slate-600'}`}
                                >
                                    {t('createModal.tabDetails')}
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setActiveCreateTab('assessment')}
                                    className={`flex-1 py-3 text-[10px] font-black uppercase tracking-widest transition-all ${activeCreateTab === 'assessment' ? 'text-indigo-600 border-b-2 border-indigo-600 bg-white' : 'text-slate-400 hover:text-slate-600'}`}
                                >
                                    {t('createModal.tabAssessment')}
                                </button>
                            </div>

                            <div className="overflow-y-auto p-6 space-y-5 custom-scrollbar">
                                {activeCreateTab === 'details' ? (
                                    <>
                                {/* Title */}
                                <div>
                                    <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5">{t('createModal.eventTitleLabel')}</label>
                                    <input
                                        required
                                        placeholder={t('createModal.eventTitlePlaceholder')}
                                        className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all placeholder-slate-300 font-semibold text-slate-700"
                                        value={formData.title}
                                        onChange={e => setFormData({ ...formData, title: e.target.value })}
                                    />
                                </div>

                                {/* Date & Time */}
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5">{t('createModal.dateLabel')}</label>
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
                                            <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5">{t('createModal.startLabel')}</label>
                                            <input
                                                type="time"
                                                required
                                                className="w-full px-2 py-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none text-center text-slate-600"
                                                value={formData.startTime}
                                                onChange={e => setFormData({ ...formData, startTime: e.target.value })}
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5">{t('createModal.endLabel')}</label>
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
                                        <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5">{t('createModal.hostNameLabel')}</label>
                                        <div className="relative" ref={hostDropdownRef}>
                                            <input
                                                type="text"
                                                title={formData.host || t('createModal.hostSearchPlaceholder')}
                                                placeholder={formData.host || t('createModal.hostSearchPlaceholder')}
                                                className="w-full pl-4 pr-10 py-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none bg-white font-semibold text-slate-700 truncate"
                                                value={hostSearch}
                                                onFocus={() => setShowHostDropdown(true)}
                                                onChange={(e) => setHostSearch(e.target.value)}
                                            />
                                            <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400">
                                                <Users size={16} />
                                            </div>

                                            {showHostDropdown && (
                                                <div className="absolute z-50 w-full mt-2 bg-white border border-slate-200 rounded-xl shadow-xl max-h-60 overflow-y-auto">
                                                    {(function() {
                                                        const filtered = employees.filter(emp =>
                                                            emp.active_status === 'Active' &&
                                                            (emp.full_name?.toLowerCase().includes(hostSearch.toLowerCase()) ||
                                                            emp.id_employee?.toLowerCase().includes(hostSearch.toLowerCase()))
                                                        ).slice(0, 50);

                                                        if (filtered.length === 0) {
                                                            return <div className="p-4 text-center text-xs text-slate-400 italic">{t('createModal.noMatchingHosts')}</div>;
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
                                        <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5">{t('createModal.eventTypeLabel')}</label>
                                        <select
                                            className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none bg-white text-slate-600"
                                            value={formData.type}
                                            onChange={e => setFormData({ ...formData, type: e.target.value as 'Online' | 'Offline' | 'Hybrid' })}
                                        >
                                            <option value="Online">{t('createModal.typeOnlineVideo')}</option>
                                            <option value="Offline">{t('createModal.typeInPerson')}</option>
                                            <option value="Hybrid">{t('createModal.typeHybrid')}</option>
                                        </select>
                                    </div>
                                </div>

                                {/* Competency Type & Name */}
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5">{t('createModal.competencyTypeLabel')}</label>
                                        <select
                                            className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none bg-white text-slate-600"
                                            value={formData.competency_type}
                                            onChange={e => setFormData({ ...formData, competency_type: e.target.value })}
                                        >
                                            <option value="">{t('createModal.selectTypePlaceholder')}</option>
                                            <option value="Behavioral">{t('createModal.competencyBehavioral')}</option>
                                            <option value="Core">{t('createModal.competencyCore')}</option>
                                            <option value="Technical/Functional">{t('createModal.competencyTechnical')}</option>
                                            <option value="Managerial">{t('createModal.competencyManagerial')}</option>
                                        </select>
                                    </div>
                                    <div>
                                        <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5">{t('createModal.competencyNameLabel')}</label>
                                        <input
                                            type="text"
                                            placeholder={t('createModal.competencyNamePlaceholder')}
                                            className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none transition-all font-semibold text-slate-700"
                                            value={formData.competency_name}
                                            onChange={e => setFormData({ ...formData, competency_name: e.target.value })}
                                        />
                                    </div>
                                </div>

                                {/* Training GRI Type */}
                                <div>
                                    <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5">{t('createModal.griTypeLabel')}</label>
                                    <select
                                        className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none bg-white text-slate-600"
                                        value={formData.training_gr_type}
                                        onChange={e => setFormData({ ...formData, training_gr_type: e.target.value })}
                                    >
                                        <option value="">{t('createModal.selectGriPlaceholder')}</option>
                                        <option value="ESG">{t('createModal.griEsg')}</option>
                                        <option value="HSE">{t('createModal.griHse')}</option>
                                        <option value="Other">{t('createModal.griOther')}</option>
                                    </select>
                                </div>

                                {/* Location & Link - Conditional */}
                                {(formData.type === 'Offline' || formData.type === 'Hybrid') && (
                                    <div>
                                        <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5">{t('createModal.locationLabel')}</label>
                                        <div className="relative">
                                            <MapPin size={18} className="absolute left-3.5 top-3 text-slate-400" />
                                            <input
                                                required
                                                placeholder={t('createModal.locationPlaceholder')}
                                                className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none transition-all text-slate-600 mb-4"
                                                value={formData.location}
                                                onChange={e => setFormData({ ...formData, location: e.target.value })}
                                            />
                                        </div>
                                    </div>
                                )}

                                {(formData.type === 'Online' || formData.type === 'Hybrid') && (
                                    <div>
                                        <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5">{t('createModal.meetLinkLabel')}</label>
                                        <div className="relative">
                                            <Video size={18} className="absolute left-3.5 top-3 text-slate-400" />
                                            <input
                                                required
                                                placeholder={t('createModal.meetLinkPlaceholder')}
                                                className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none transition-all text-slate-600"
                                                value={formData.meetLink}
                                                onChange={e => setFormData({ ...formData, meetLink: e.target.value })}
                                            />
                                        </div>
                                </div>
                                )}

                                <div>
                                    <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5">{t('createModal.materialLinkLabel')}</label>
                                    <div className="relative mb-4">
                                        <FileText size={18} className="absolute left-3.5 top-3 text-slate-400" />
                                        <input
                                            placeholder={t('createModal.materialLinkPlaceholder')}
                                            className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none transition-all text-slate-600"
                                            value={formData.material_link}
                                            onChange={e => setFormData({ ...formData, material_link: e.target.value })}
                                        />
                                    </div>
                                </div>

                                {/* Email Invites */}
                                <div>
                                    <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5">{t('createModal.inviteParticipantsLabel')}</label>
                                    <div className="flex flex-col gap-3">
                                        <div className="relative" ref={participantDropdownRef}>
                                            <input
                                                type="text"
                                                placeholder={t('createModal.participantSearchPlaceholder')}
                                                className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none bg-white text-sm font-semibold text-slate-700"
                                                value={participantSearch}
                                                onFocus={() => setShowParticipantDropdown(true)}
                                                onChange={(e) => setParticipantSearch(e.target.value)}
                                            />
                                            {showParticipantDropdown && (
                                                <div className="absolute z-50 w-full mt-2 bg-white border border-slate-200 rounded-xl shadow-xl max-h-60 overflow-y-auto">
                                                    {(function() {
                                                        const filtered = employees.filter(emp =>
                                                            emp.active_status === 'Active' &&
                                                            !invitedEmployeeIds.includes(emp.id_employee) &&
                                                            (emp.full_name?.toLowerCase().includes(participantSearch.toLowerCase()) ||
                                                                emp.id_employee?.toLowerCase().includes(participantSearch.toLowerCase()))
                                                        ).slice(0, 50);

                                                        if (filtered.length === 0) {
                                                            return <div className="p-4 text-center text-xs text-slate-400 italic">{t('createModal.noMatchingEmployees')}</div>;
                                                        }

                                                        return filtered.map(emp => (
                                                            <button
                                                                key={emp.id_employee}
                                                                type="button"
                                                                className="w-full text-left px-4 py-2.5 hover:bg-slate-50 text-sm border-b border-slate-50 last:border-none flex flex-col"
                                                                onClick={() => {
                                                                    if (!invitedEmployeeIds.includes(emp.id_employee)) {
                                                                        setInvitedEmployeeIds([...invitedEmployeeIds, emp.id_employee]);
                                                                        // Don't add email separately - we'll use employee_id for display
                                                                        // Only track emails for external guests without employee records
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
                                                <span className="text-slate-400 text-xs py-1 px-1 italic">{t('createModal.noParticipantsAdded')}</span>
                                            )}
                                        </div>
                                    </div>
                                    <p className="text-[10px] text-slate-400 mt-1.5 pl-1">{t('createModal.inviteHelperText')}</p>
                                </div>

                                {/* Description */}
                                <div>
                                    <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5">{t('createModal.descriptionLabel')}</label>
                                    <textarea
                                        rows={3}
                                        required
                                        placeholder={t('createModal.descriptionPlaceholder')}
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
                                    {t('createModal.cancelButton')}
                                </button>
                                <button
                                    type="submit"
                                    onClick={(e) => handleSave(e)}
                                    className="flex-[2] py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl shadow-lg shadow-indigo-500/20 transition-all flex items-center justify-center gap-2"
                                >
                                    <CalendarIcon size={18} /> {isEditing ? t('createModal.updateEventButton') : t('createModal.sendInvitationsButton')}
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
                                    <h2 className="font-bold text-lg text-slate-800">{t('reportModal.title')}</h2>
                                    <p className="text-xs text-slate-500">{t('reportModal.subtitle')}</p>
                                </div>
                                <button onClick={() => setIsReportOpen(false)} className="p-2 hover:bg-slate-100 rounded-full text-slate-400 transition-colors"><X size={20} /></button>
                            </div>
                            <div className="p-6 space-y-5 overflow-y-auto custom-scrollbar">
                                <div>
                                    <label className="block text-xs font-bold text-slate-500 uppercase mb-2">{t('reportModal.attendanceChecklistLabel')}</label>
                                    <div className={`bg-slate-50 rounded-xl border border-slate-200 p-3 max-h-[150px] overflow-y-auto space-y-2 ${reportData.isPaid ? 'opacity-60 pointer-events-none' : ''}`}>
                                        {(() => {
                                            const meeting = meetings.find(m => m.id === reportingId);
                                            const invitedEmailsList = meeting?.guests?.emails || [];
                                            const invitedEmployeeIdsList = (meeting?.guests as any)?.employee_ids || [];

                                            if (invitedEmailsList.length === 0 && invitedEmployeeIdsList.length === 0) {
                                                return <p className="text-xs text-slate-400 italic text-center py-2">{t('reportModal.noInvitedGuests')}</p>;
                                            }

                                            // Combined checklist
                                            return (
                                                <div className="space-y-2">
                                                    {invitedEmployeeIdsList.map((id: string) => {
                                                        const emp = employees.find(e => e.id_employee === id);
                                                        const participationTypes = reportData.participationTypesByEmployee || {};
                                                        const currentType = participationTypes[id] || 'Targeted Participants';

                                                        return (
                                                            <div key={id} className={`flex items-center gap-3 p-2 bg-white rounded-lg border border-slate-100 ${reportData.isPaid ? 'opacity-60 pointer-events-none' : ''}`}>
                                                                <label className="flex items-center gap-3 flex-1 cursor-pointer hover:border-indigo-200 transition-colors">
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
                                                                <div className="flex items-center justify-between">
                                                                    <label className="flex items-center gap-2 cursor-pointer hover:text-indigo-600 transition-colors flex-1">
                                                                        <input
                                                                            type="checkbox"
                                                                            name={`participation-${id}`}
                                                                            className="w-3.5 h-3.5 text-indigo-600 border-slate-300 focus:ring-indigo-500 rounded"
                                                                            checked={currentType === 'Self Registered'}
                                                                            onChange={(e) => {
                                                                                const newTypes = { ...participationTypes, [id]: (e.target.checked ? 'Self Registered' : 'Targeted Participants') };
                                                                                setReportData({ ...reportData, participationTypesByEmployee: newTypes as any });
                                                                            }}
                                                                        />
                                                                    </label>
                                                                    <span className="text-xs text-slate-600 font-semibold">
                                                                        {t('reportModal.selfRegistered')}
                                                                    </span>
                                                                </div>
                                                            </div>
                                                        );
                                                    })}
                                                    {invitedEmailsList.filter((email: string) => !employees.some(emp => emp.email === email)).map((email: string) => {
                                                        const participationTypes = reportData.participationTypesByEmployee || {};
                                                        const currentType = participationTypes[email] || 'Targeted Participants';

                                                        return (
                                                            <div key={email} className={`flex items-center gap-3 p-2 bg-white rounded-lg border border-slate-100 ${reportData.isPaid ? 'opacity-60 pointer-events-none' : ''}`}>
                                                                <label className="flex items-center gap-3 flex-1 cursor-pointer hover:border-indigo-200 transition-colors">
                                                                    <input
                                                                        type="checkbox"
                                                                        className="w-4 h-4 text-indigo-600 rounded border-slate-300 focus:ring-indigo-500"
                                                                        checked={(reportData.attendees || []).includes(email)}
                                                                        onChange={() => toggleAttendee(email)}
                                                                    />
                                                                    <span className="text-sm text-slate-700 font-medium truncate">{email}</span>
                                                                </label>
                                                                <div className="flex items-center justify-between">
                                                                    <label className="flex items-center gap-2 cursor-pointer hover:text-indigo-600 transition-colors flex-1">
                                                                        <input
                                                                            type="checkbox"
                                                                            name={`participation-${email}`}
                                                                            className="w-3.5 h-3.5 text-indigo-600 border-slate-300 focus:ring-indigo-500 rounded"
                                                                            checked={currentType === 'Self Registered'}
                                                                            onChange={(e) => {
                                                                                const newTypes = { ...participationTypes, [email]: e.target.checked ? 'Self Registered' : 'Targeted Participants' };
                                                                                setReportData({ ...reportData, participationTypesByEmployee: newTypes as any });
                                                                            }}
                                                                        />
                                                                    </label>
                                                                    <span className="text-xs text-slate-600 font-semibold">
                                                                        {t('reportModal.selfRegistered')}
                                                                    </span>
                                                                </div>
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            );
                                        })()}
                                    </div>
                                    <div className="flex justify-between items-center mt-2 px-1">
                                        <span className="text-xs text-slate-400">{t('reportModal.checkedCount', { checked: Math.max((reportData.attendees || []).length, (reportData.attendee_ids || []).length), total: Math.max(meetings.find(m => m.id === reportingId)?.guests?.emails?.length || 0, (meetings.find(m => m.id === reportingId)?.guests as any)?.employee_ids?.length || 0) })}</span>
                                        <button
                                            type="button"
                                            onClick={() => {
                                                const meeting = meetings.find(m => m.id === reportingId);
                                                const allEmails = meeting?.guests?.emails || [];
                                                const allIds = (meeting?.guests as any)?.employee_ids || [];

                                                // Filter out employees with status_join = 'Internship' or 'PKL' for cost calculation
                                                const filteredIds = allIds.filter((empId: string) => {
                                                    const emp = employees.find(e =>
                                                        String(e.id_employee) === String(empId) ||
                                                        String(e.id) === String(empId)
                                                    );
                                                    // Exclude Internship/PKL from cost calculation
                                                    if (emp && (emp.status_join === 'Internship' || emp.status_join === 'PKL')) {
                                                        return false;
                                                    }
                                                    return true;
                                                });

                                                setReportData({
                                                    ...reportData,
                                                    attendees: allEmails,
                                                    attendee_ids: filteredIds,
                                                    participantsCount: filteredIds.length
                                                });
                                            }}
                                            className="text-[10px] font-bold text-blue-600 hover:underline"
                                        >
                                            {t('reportModal.selectAll')}
                                        </button>
                                    </div>
                                </div>

                                <div>
                                    <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5">{t('reportModal.actualParticipantsLabel')}</label>
                                    <input
                                        type="number"
                                        className="w-full px-4 py-2.5 rounded-xl border border-slate-200 bg-slate-50 text-slate-500 cursor-not-allowed outline-none font-bold"
                                        value={reportData.participantsCount}
                                        readOnly
                                    />
                                </div>

                                <div>
                                    <label className="block text-xs font-bold text-slate-500 uppercase mb-2">{t('reportModal.trainingPhotosLabel')}</label>
                                    <div 
                                        onClick={() => !reportData.isPaid && photoInputRef.current?.click()}
                                        className={`relative group h-40 rounded-2xl border-2 border-dashed transition-all flex flex-col items-center justify-center gap-3 overflow-hidden
                                            ${reportData.trainingPhotos 
                                                ? 'border-indigo-200 bg-indigo-50/30' 
                                                : 'border-slate-200 bg-slate-50/50 hover:bg-slate-50 hover:border-slate-300'
                                            }
                                            ${reportData.isPaid ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer'}
                                        `}
                                    >
                                        {reportData.trainingPhotos ? (
                                            <>
                                                <img src={getFullImageUrl(reportData.trainingPhotos)} alt={t('reportModal.trainingPhotoAlt')} className="absolute inset-0 w-full h-full object-cover" />
                                                {!reportData.isPaid && (
                                                    <div className="absolute inset-0 bg-slate-900/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                                        <div className="bg-white/20 backdrop-blur-md p-3 rounded-full text-white">
                                                            <Camera size={24} />
                                                        </div>
                                                    </div>
                                                )}
                                            </>
                                        ) : (
                                            <>
                                                <div className="p-4 bg-white rounded-2xl shadow-sm group-hover:scale-110 transition-transform">
                                                    <Camera size={28} className="text-slate-400" />
                                                </div>
                                                <div className="text-center">
                                                    <p className="text-sm font-bold text-slate-600">{t('reportModal.clickToUploadPhoto')}</p>
                                                    <p className="text-[10px] text-slate-400">{t('reportModal.documentationEvidence')}</p>
                                                </div>
                                            </>
                                        )}
                                        <input 
                                            type="file" 
                                            ref={photoInputRef}
                                            onChange={handlePhotoUpload}
                                            className="hidden"
                                            accept="image/*"
                                            disabled={reportData.isPaid}
                                        />
                                    </div>
                                </div>

                                <div>
                                    <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5">{t('reportModal.trainerIncentiveLabel')}</label>
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
                                        <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5">{t('reportModal.snackCostLabel')}</label>
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
                                        <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5">{t('reportModal.lunchCostLabel')}</label>
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
                                        <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5">{t('reportModal.otherCostLabel')}</label>
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
                                    <span className="text-sm font-bold text-slate-600 uppercase">{t('reportModal.totalEstimatedCost')}</span>
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
                                    {t('reportModal.cancelButton')}
                                </button>

                                {reportData.isPaid ? (
                                    <div className="flex-[2] py-3 bg-slate-100 text-slate-400 font-bold rounded-xl flex items-center justify-center gap-2 border border-slate-200">
                                        <CheckCircle size={18} /> {t('reportModal.reportPaidLocked')}
                                    </div>
                                ) : (
                                    (() => {
                                        // Check if meeting is closed - only closed meetings can be paid by HR
                                        const meeting = meetings.find(m => m.id === reportingId);
                                        const isClosed = meeting?.is_closed;

                                        return (
                                            <button
                                                onClick={(e) => {
                                                    e.preventDefault();
                                                    if (isClosed && validateReport()) {
                                                        setConfirmMarkPaid(true);
                                                    }
                                                }}
                                                disabled={!isClosed}
                                                className={`flex-[2] py-3 font-bold rounded-xl flex items-center justify-center gap-2 transition-all ${
                                                    isClosed
                                                        ? 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-lg shadow-emerald-500/20 cursor-pointer'
                                                        : 'bg-slate-300 text-slate-500 cursor-not-allowed'
                                                }`}
                                            >
                                                {!isClosed ? (
                                                    <>
                                                        <Lock size={18} /> {t('reportModal.sessionStillOpen')}
                                                    </>
                                                ) : (
                                                    <>{t('reportModal.markPaid')}</>
                                                )}
                                            </button>
                                        );
                                    })()
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
                    setNotification({ show: true, type: 'success', message: t('notifications.reportMarkedPaid') });

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
                title={t('confirmPaidModal.title')}
                message={t('confirmPaidModal.message')}
                confirmText={t('confirmPaidModal.confirmText')}
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
                                        <Users className="text-indigo-600" size={20} /> {t('recapDetailModal.titleSuffix', { host: recapDetailHost })}
                                    </h2>
                                    <p className="text-xs text-slate-500 font-medium">{startDate} - {endDate} • {selectedBranch}</p>
                                </div>
                                <button onClick={() => setRecapDetailHost(null)} className="p-2 hover:bg-slate-100 rounded-full text-slate-400 transition-colors"><X size={20} /></button>
                            </div>

                            <div className="overflow-y-auto p-6">
                                <table className="w-full text-left text-sm">
                                    <thead className="bg-slate-50 text-slate-500 font-bold uppercase text-xs">
                                        <tr>
                                            <th className="px-4 py-3">{t('recapDetailModal.colDate')}</th>
                                            <th className="px-4 py-3">{t('recapDetailModal.colTitle')}</th>
                                            <th className="px-4 py-3">{t('recapDetailModal.colType')}</th>
                                            <th className="px-4 py-3 text-center">{t('recapDetailModal.colGuests')}</th>
                                            <th className="px-4 py-3 text-right">{t('recapDetailModal.colTrainerInc')}</th>
                                            <th className="px-4 py-3 text-right">{t('recapDetailModal.colTotalCost')}</th>
                                            <th className="px-4 py-3 text-center">{t('recapDetailModal.colStatus')}</th>
                                            <th className="px-4 py-3 text-center">{t('recapDetailModal.colAction')}</th>
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
                                                            <CheckCircle size={14} /> {t('recapDetailModal.paid')}
                                                        </div>
                                                    ) : m.costReport?.isFinalized ? (
                                                        <div className="flex items-center justify-center gap-1 text-blue-600 font-bold text-xs uppercase">
                                                            <CheckCircle size={14} /> {t('recapDetailModal.reported')}
                                                        </div>
                                                    ) : (
                                                        <span className="text-orange-500 font-bold text-xs uppercase">{t('recapDetailModal.pending')}</span>
                                                    )}
                                                </td>
                                                <td className="px-4 py-3 text-center">
                                                    <button
                                                        onClick={() => openReportModal(m)}
                                                        className="text-xs font-bold text-indigo-600 hover:text-indigo-800 hover:underline"
                                                    >
                                                        {t('recapDetailModal.viewDetails')}
                                                    </button>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>

                            <div className="p-4 border-t border-slate-100 bg-slate-50 text-right">
                                <button onClick={() => setRecapDetailHost(null)} className="px-6 py-2 bg-white border border-slate-200 text-slate-600 font-bold rounded-xl hover:bg-slate-100 transition-colors shadow-sm">
                                    {t('recapDetailModal.close')}
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
                                    {(effectiveRole === 'HR' || effectiveRole === 'HR_ADMIN' || (user.employee_id && selectedMeeting.employee_id && user.employee_id === selectedMeeting.employee_id)) && (
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
                                    <div className="w-16 h-16 bg-white rounded-2xl shadow-lg border border-slate-100 overflow-hidden flex flex-col">
                                        <div className="bg-indigo-600 text-white py-1 text-[10px] font-black uppercase tracking-widest text-center">
                                            {(selectedMeeting.shortDate || 'TBD TBD').split(' ')[1]}
                                        </div>
                                        <div className="flex-1 flex items-center justify-center text-2xl font-black text-slate-800 leading-none">
                                            {(selectedMeeting.shortDate || 'TBD').split(' ')[0]}
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <div className="flex-1 overflow-y-auto pt-10 px-6 pb-6 custom-scrollbar">
                                <h2 className="text-2xl font-bold text-slate-800 mb-1 leading-snug">{selectedMeeting.title}</h2>
                                <p className="text-slate-500 font-medium text-sm mb-6 flex items-center gap-2">
                                    <span className="bg-slate-100 px-2 py-0.5 rounded text-slate-600">{selectedMeeting.type}</span>
                                    {selectedMeeting.is_closed ? (
                                        <span className="bg-red-500 px-2 py-0.5 rounded text-white text-[10px] font-black flex items-center gap-1">
                                            <Lock size={10} /> {t('detailModal.closed')}
                                        </span>
                                    ) : (
                                        <span className="bg-emerald-500 px-2 py-0.5 rounded text-white text-[10px] font-black flex items-center gap-1">
                                            <Zap size={10} className="animate-pulse" /> {t('detailModal.active')}
                                        </span>
                                    )}
                                    <span>•</span>
                                    {new Date(selectedMeeting.date).toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
                                </p>

                                <div className="space-y-4">
                                    <div className="flex gap-4">
                                        <div className="w-8 flex justify-center pt-0.5"><UserIcon className="text-slate-400" size={20} /></div>
                                        <div>
                                            <p className="font-semibold text-slate-700 text-sm">{t('detailModal.hostLabel')}</p>
                                            <p className="text-sm text-slate-600">{selectedMeeting.host}</p>
                                        </div>
                                    </div>

                                    <div className="flex gap-4">
                                        <div className="w-8 flex justify-center pt-0.5"><Clock className="text-slate-400" size={20} /></div>
                                        <div>
                                            <p className="font-semibold text-slate-700 text-sm">{t('detailModal.timeLabel')}</p>
                                            <p className="text-sm text-slate-600">{selectedMeeting.time}</p>
                                        </div>
                                    </div>

                                    <div className="flex gap-4">
                                        <div className="w-8 flex justify-center pt-0.5"><MapPin className="text-slate-400" size={20} /></div>
                                        <div>
                                            <p className="font-semibold text-slate-700 text-sm">{t('detailModal.locationLabel')}</p>
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

                                    {selectedMeeting.material_link && (
                                        <div className="flex gap-4">
                                            <div className="w-8 flex justify-center pt-0.5"><Link className="text-slate-400" size={20} /></div>
                                            <div className="flex-1">
                                                <p className="font-semibold text-slate-700 text-sm mb-1">{t('detailModal.materialLinkLabel')}</p>
                                                <a
                                                    href={selectedMeeting.material_link}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-lg transition-colors"
                                                >
                                                    {t('detailModal.openPresentation')}
                                                </a>
                                            </div>
                                        </div>
                                    )}

                                    <div className="flex gap-4">
                                        <div className="w-8 flex justify-center pt-0.5"><Users className="text-slate-400" size={20} /></div>
                                        <div className="flex-1">
                                            <p className="font-semibold text-slate-700 text-sm mb-2">
                                                {t('detailModal.invitedGuests', { count: selectedMeeting.guests?.count || (selectedMeeting.guests as any)?.employee_ids?.length || 0 })}
                                            </p>
                                            {(selectedMeeting.guests?.count > 0) ? (
                                                <div className="flex flex-wrap gap-2">
                                                    {/* Display invited employees by employee_id */}
                                                    {((selectedMeeting.guests as any)?.employee_ids || []).map((empId: string) => {
                                                        const emp = (employees || []).find(e => e.id_employee === empId);
                                                        const displayName = emp?.full_name || empId;
                                                        return (
                                                            <div key={empId} className="flex items-center gap-2 bg-slate-50 pl-1 pr-3 py-1 rounded-full border border-slate-100">
                                                                <div className="w-5 h-5 rounded-full bg-indigo-100 text-indigo-600 flex items-center justify-center text-[10px] font-bold">
                                                                    {displayName.charAt(0).toUpperCase()}
                                                                </div>
                                                                <span className="text-xs text-slate-600">{displayName}</span>
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            ) : (
                                                <p className="text-xs text-slate-400 italic">{t('detailModal.noInvitesSent')}</p>
                                            )}
                                        </div>
                                    </div>

                                    <div className="flex gap-4 pt-2">
                                        <div className="w-8 flex justify-center pt-0.5"><FileText className="text-slate-400" size={20} /></div>
                                        <p className="text-sm text-slate-600 leading-relaxed">
                                            {renderTextWithLinks(selectedMeeting.description)}
                                        </p>
                                    </div>

                                    {/* Feedback Peserta - Show/Hide (Host & HR only) */}
                                    {(() => {
                                        const isHostOrHR = effectiveRole === 'HR' || effectiveRole === 'HR_ADMIN' ||
                                            (user.employee_id && selectedMeeting.employee_id && user.employee_id === selectedMeeting.employee_id);
                                        if (!isHostOrHR) return null;

                                        const allFeedback = meetingSummary?.allFeedbackResults || [];
                                        if (allFeedback.length === 0) return null;

                                        // Group feedback by participant - use unique key based on email or employee_id
                                        const feedbackByParticipant: any[] = [];
                                        const processedKeys = new Set<string>();

                                        for (const fb of allFeedback) {
                                            // Get user identifier from multiple possible sources
                                            const userEmail = (fb.user_email || fb.email || fb.user_id || '').toString().toLowerCase().trim();
                                            const employeeId = (fb.employee_id || '').toString().toLowerCase().trim();

                                            if (!userEmail && !employeeId) continue;

                                            // Use email as primary key, fallback to employee_id
                                            const uniqueKey = userEmail || `emp_${employeeId}`;
                                            if (processedKeys.has(uniqueKey)) continue;

                                            // Find matching employee
                                            let emp: any = null;
                                            if (userEmail) {
                                                emp = employees.find(e => e.email?.toLowerCase() === userEmail);
                                            }
                                            if (!emp && employeeId) {
                                                emp = employees.find(e => String(e.id_employee).toLowerCase() === employeeId);
                                            }

                                            // Get feedback answers from feedback_data JSON
                                            let q11_text = '';
                                            let q12_text = '';
                                            try {
                                                const fData = fb.feedback_data ? (typeof fb.feedback_data === 'string' ? JSON.parse(fb.feedback_data) : fb.feedback_data) : null;
                                                if (fData && typeof fData === 'object') {
                                                    q11_text = fData.q11 || '';
                                                    q12_text = fData.q12 || '';
                                                }
                                            } catch(e) {}

                                            // Only show participants with text answers for q11 or q12
                                            if (q11_text || q12_text) {
                                                feedbackByParticipant.push({
                                                    name: emp?.full_name || userEmail || `Employee ${employeeId}`, // Display participant name
                                                    email: emp?.email || userEmail,
                                                    q11: q11_text,
                                                    q12: q12_text
                                                });
                                            }
                                            processedKeys.add(uniqueKey);
                                        }

                                        if (feedbackByParticipant.length === 0) return null;

                                        return (
                                            <div className="mt-6 pt-4 border-t border-slate-50">
                                                <button
                                                    onClick={() => setShowFeedbackList(prev => !prev)}
                                                    className="w-full flex items-center justify-between gap-2 px-3 py-2 bg-purple-50 hover:bg-purple-100 rounded-lg transition-all"
                                                >
                                                    <h4 className="text-[10px] font-black text-purple-600 uppercase tracking-widest flex items-center gap-2">
                                                        <MessageSquare size={14} /> {t('detailModal.participantFeedback')}
                                                    </h4>
                                                    <ChevronDown className={`text-purple-400 transition-transform ${showFeedbackList ? 'rotate-180' : ''}`} />
                                                </button>

                                                {showFeedbackList && (
                                                    <div className="mt-3 space-y-2 max-h-[300px] overflow-y-auto custom-scrollbar">
                                                        {feedbackByParticipant.map((fb, idx) => (
                                                            <div key={idx} className="bg-white border border-slate-100 rounded-xl p-3 shadow-sm">
                                                                <p className="text-xs font-bold text-slate-700 mb-2">{fb.name}</p>
                                                                {fb.q11 && (
                                                                    <div className="mb-2">
                                                                        <p className="text-[9px] font-bold text-purple-500 uppercase tracking-wider mb-1">{t('detailModal.whatWentWell')}</p>
                                                                        <p className="text-xs text-slate-600">{fb.q11}</p>
                                                                    </div>
                                                                )}
                                                                {fb.q12 && (
                                                                    <div>
                                                                        <p className="text-[9px] font-bold text-purple-500 uppercase tracking-wider mb-1">{t('detailModal.whatToImprove')}</p>
                                                                        <p className="text-xs text-slate-600">{fb.q12}</p>
                                                                    </div>
                                                                )}
                                                            </div>
                                                        ))}
                                                    </div>
                                                )}
                                            </div>
                                        );
                                    })()}

                                    {selectedMeeting.costReport?.trainingPhotos && (
                                        <div className="mt-6 pt-4 border-t border-slate-50">
                                            <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3 flex items-center gap-2">
                                                <ImageIcon size={12} /> {t('detailModal.trainingDocumentation')}
                                            </h4>
                                            <div 
                                                className="relative h-40 rounded-2xl overflow-hidden border border-slate-100 group cursor-pointer shadow-sm hover:shadow-md transition-all"
                                                onClick={() => window.open(getFullImageUrl(selectedMeeting.costReport?.trainingPhotos), '_blank')}
                                            >
                                                <img 
                                                    src={getFullImageUrl(selectedMeeting.costReport.trainingPhotos)} 
                                                    alt={t('detailModal.trainingEvidenceAlt')}
                                                    className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110" 
                                                />
                                                <div className="absolute inset-0 bg-slate-900/0 group-hover:bg-slate-900/20 transition-colors flex items-center justify-center">
                                                    <div className="bg-white/20 backdrop-blur-md p-2 rounded-full text-white opacity-0 group-hover:opacity-100 transition-opacity">
                                                        <Search size={18} />
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    )}
                                </div>

                                <div className="mt-8 space-y-3">
                                    <div className="p-3 bg-slate-50 border border-slate-100 rounded-xl">
                                        <p className="text-xs font-bold text-slate-500 uppercase mb-2 flex items-center gap-1"><CalendarIcon size={12} /> {t('detailModal.addToCalendar')}</p>
                                        <div className="flex gap-2">
                                            <button
                                                onClick={() => {
                                                    if (!selectedMeeting) return;
                                                    try {
                                                        const parts = selectedMeeting.time.split(' - ');
                                                        const startRaw = parts[0] ? parts[0].trim() : '09:00';
                                                        const endRaw = parts[1] ? parts[1].trim() : '10:00';
                                                        const d = new Date(selectedMeeting.date);
                                                        const baseDate = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
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
                                                        setNotification({ show: true, type: 'error', message: t('notifications.calendarFileError') });
                                                    }
                                                }}
                                                className="flex-1 py-2 bg-white border border-slate-200 hover:bg-white hover:border-slate-300 text-slate-600 font-bold rounded-lg text-xs transition-all shadow-sm"
                                            >
                                                {t('detailModal.outlookApple')}
                                            </button>
                                            <button
                                                onClick={() => {
                                                    if (!selectedMeeting) return;
                                                    try {
                                                        const parts = selectedMeeting.time.split(' - ');
                                                        const startRaw = parts[0] ? parts[0].trim() : '09:00';
                                                        const endRaw = parts[1] ? parts[1].trim() : '10:00';
                                                        const d = new Date(selectedMeeting.date);
                                                        const baseDate = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
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
                                                        setNotification({ show: true, type: 'error', message: t('notifications.googleCalendarError') });
                                                    }
                                                }}
                                                className="flex-1 py-2 bg-white border border-slate-200 hover:bg-white hover:border-slate-300 text-blue-600 font-bold rounded-lg text-xs transition-all shadow-sm text-center flex items-center justify-center"
                                            >
                                                {t('detailModal.googleCalendar')}
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
                                                     <h4 className="text-xs font-black text-slate-500 uppercase tracking-wider">{t('detailModal.assessmentFeedback')}</h4>
                                                     {isHostOrHR && !selectedMeeting.is_closed && (
                                                         <span className="flex items-center gap-1 text-[8px] bg-indigo-50 text-indigo-600 px-1.5 py-0.5 rounded font-black border border-indigo-100">
                                                             <Zap size={8} /> {t('detailModal.hostControl')}
                                                         </span>
                                                     )}
                                                 </div>
                                                 <div className="flex items-center gap-1 text-[10px] text-indigo-500 font-bold">
                                                     <CheckCircle size={12} /> {t('detailModal.required')}
                                                 </div>
                                             </div>

                                             {!!isHostOrHR && (
                                                <div className="flex flex-col gap-2">
                                                    {!selectedMeeting.is_closed ? (
                                                        <button 
                                                            onClick={() => setIsCloseModalOpen(true)}
                                                            className="w-full mb-2 py-2 bg-red-50 hover:bg-red-100 text-red-600 text-xs font-black rounded-xl border border-red-200 flex items-center justify-center gap-2 transition-all shadow-sm"
                                                        >
                                                            <Lock size={14} /> {t('detailModal.closeSession')}
                                                        </button>
                                                    ) : (
                                                        <div className="w-full mb-4 py-2 bg-slate-100 text-slate-500 text-xs font-black rounded-xl border border-slate-200 flex items-center justify-center gap-2 shadow-sm">
                                                            <Lock size={14} /> {t('detailModal.sessionClosed')}
                                                        </div>
                                                    )}

                                                    {!!meetingSummary && (
                                                        <div className="mb-4 p-4 bg-slate-50 rounded-2xl border border-slate-100 flex flex-col gap-2 shadow-inner">
                                                            <div 
                                                                className="flex justify-between items-center p-2 hover:bg-slate-100 rounded-xl cursor-pointer transition-colors"
                                                                onClick={() => setShowParticipantModal('sudah')}
                                                            >
                                                                <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">{t('detailModal.done')}</span>
                                                                <span className="text-sm font-black text-emerald-600 bg-emerald-50 px-3 py-0.5 rounded-full border border-emerald-100">
                                                                    {meetingSummary.feedback || 0}
                                                                </span>
                                                            </div>
                                                            <div
                                                                className="flex justify-between items-center p-2 hover:bg-slate-100 rounded-xl cursor-pointer transition-colors"
                                                                onClick={() => setShowParticipantModal('belum')}
                                                            >
                                                                <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">{t('detailModal.pendingCount')}</span>
                                                                <span className="text-sm font-black text-orange-600 bg-orange-50 px-3 py-0.5 rounded-full border border-orange-100">
                                                                    {(() => {
                                                                        // Get total participants from multiple possible sources
                                                                        const guests = selectedMeeting.guests;
                                                                        let totalParticipants = 0;

                                                                        if (guests?.emails && Array.isArray(guests.emails) && guests.emails.length > 0) {
                                                                            totalParticipants = guests.emails.length;
                                                                        } else if (guests?.employee_ids && Array.isArray(guests.employee_ids) && guests.employee_ids.length > 0) {
                                                                            totalParticipants = guests.employee_ids.length;
                                                                        } else if (Array.isArray((guests as any).details) && (guests as any).details.length > 0) {
                                                                            totalParticipants = (guests as any).details.length;
                                                                        } else if (guests?.count) {
                                                                            // Fallback to count field
                                                                            totalParticipants = guests.count;
                                                                        }

                                                                        const completed = meetingSummary?.feedback || 0;
                                                                        return Math.max(0, totalParticipants - completed);
                                                                    })()}
                                                                </span>
                                                            </div>
                                                        </div>
                                                    )}
                                                </div>
                                             )}

                                            <div className="space-y-2">
                                                {/* Pre-Test */}
                                                {(() => {
                                                    let preTestData;
                                                    try { preTestData = typeof selectedMeeting.pre_test_data === 'string' ? JSON.parse(selectedMeeting.pre_test_data || '{}') : (selectedMeeting.pre_test_data || {}); } catch(e) { preTestData = {}; }
                                                    // Don't show Pre-Test card if no questions
                                                    if (!Array.isArray(preTestData?.questions) || preTestData.questions.length === 0) return null;
                                                    const isHostOrHR = effectiveRole === 'HR' || effectiveRole === 'HR_ADMIN' ||
                                                                       (user.employee_id && selectedMeeting.employee_id && user.employee_id === selectedMeeting.employee_id);
                                                    return (
                                                        <div className="flex flex-col gap-2">
                                                    <button
                                                        onClick={() => {
                                                            if (isHostOrHR) return; // Host doesn't take the test here
                                                            if (selectedMeeting.is_closed) {
                                                                setNotification({ show: true, type: 'info', message: t('notifications.sessionClosedByHost') });
                                                                return;
                                                            }
                                                            if (!selectedMeeting.is_pre_test_active) {
                                                                setNotification({ show: true, type: 'info', message: t('notifications.preTestNotOpen') });
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
                                                                <p className="font-bold text-slate-800 text-xs">{t('detailModal.preTestTitle')}</p>
                                                                <p className="text-[10px] text-slate-400">{t('detailModal.preTestSubtitle')}</p>
                                                            </div>
                                                        </div>
                                                        <div className="flex items-center gap-3">
                                                            {(() => {
                                                                const res = meetingQuizResults.find(r => {
                                                                    const type = (r.quizType || "").toUpperCase();
                                                                    const midMatches = Number(r.meetingId || (r as any).meeting_id) === Number(selectedMeeting.id);
                                                                    return (type === 'PRE' || type === 'PRE-TEST') && midMatches;
                                                                });
                                                                return res && <span className="text-[10px] font-black text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-100">{t('detailModal.score', { score: res.score })}</span>;
                                                            })()}
                                                            {!isHostOrHR && selectedMeeting.is_pre_test_active && !meetingQuizResults.find(r => r.quizType === 'PRE') && <ArrowRight size={14} className="text-slate-300 group-hover:text-indigo-500" />}
                                                        </div>
                                                    </button>
                                                    
                                                    {isHostOrHR && !selectedMeeting.is_closed && (
                                                        <div className="flex items-center justify-between px-3 py-2 bg-slate-50 rounded-lg border border-slate-100">
                                                            <div className="flex flex-col">
                                                                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">{t('detailModal.accessPreTest')}</span>
                                                            </div>
                                                            <button
                                                                onClick={() => toggleMeetingStatus('is_pre_test_active', selectedMeeting.is_pre_test_active)}
                                                                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${selectedMeeting.is_pre_test_active ? 'bg-emerald-500' : 'bg-slate-300'}`}
                                                            >
                                                                <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${selectedMeeting.is_pre_test_active ? 'translate-x-6' : 'translate-x-1'}`}/>
                                                            </button>
                                                        </div>
                                                    )}
                                                </div>
                                                    );
                                                })()}

                                                {/* Post-Test */}
                                                {(() => {
                                                    let postTestData;
                                                    try { postTestData = typeof selectedMeeting.post_test_data === 'string' ? JSON.parse(selectedMeeting.post_test_data || '{}') : (selectedMeeting.post_test_data || {}); } catch(e) { postTestData = {}; }
                                                    if (!Array.isArray(postTestData?.questions) || postTestData.questions.length === 0) return null;
                                                    return (
                                                        <div className="flex flex-col gap-2">
                                                    <button
                                                        onClick={() => {
                                                            if (isHostOrHR) return;
                                                            if (selectedMeeting.is_closed) {
                                                                setNotification({ show: true, type: 'info', message: t('notifications.sessionClosedByHost') });
                                                                return;
                                                            }
                                                            if (!selectedMeeting.is_post_test_active) {
                                                                setNotification({ show: true, type: 'info', message: t('notifications.postTestNotOpen') });
                                                                return;
                                                            }
                                                            const preRes = meetingQuizResults.find(r => (r.quizType || "").toUpperCase().includes('PRE'));
                                                            if (!preRes) {
                                                                setNotification({ show: true, type: 'info', message: t('notifications.completePreTestFirst') });
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
                                                                <p className="font-bold text-slate-800 text-xs">{t('detailModal.postTestTitle')}</p>
                                                                <p className="text-[10px] text-slate-400">{t('detailModal.postTestSubtitle')}</p>
                                                            </div>
                                                        </div>
                                                        <div className="flex items-center gap-3">
                                                            {(() => {
                                                                const res = meetingQuizResults.find(r => (r.quizType || "").toUpperCase().includes('POST'));
                                                                return res && <span className="text-[10px] font-black text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-100">{t('detailModal.score', { score: res.score })}</span>;
                                                            })()}
                                                            {!isHostOrHR && selectedMeeting.is_post_test_active && !meetingQuizResults.find(r => r.quizType === 'POST') && <ArrowRight size={14} className="text-slate-300 group-hover:text-indigo-500" />}
                                                        </div>
                                                    </button>
                                                    
                                                    {isHostOrHR && !selectedMeeting.is_closed && (
                                                        <div className="flex items-center justify-between px-3 py-2 bg-slate-50 rounded-lg border border-slate-100">
                                                            <div className="flex flex-col">
                                                                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">{t('detailModal.accessPostTest')}</span>
                                                            </div>
                                                            <button
                                                                onClick={() => toggleMeetingStatus('is_post_test_active', selectedMeeting.is_post_test_active)}
                                                                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${selectedMeeting.is_post_test_active ? 'bg-emerald-500' : 'bg-slate-300'}`}
                                                            >
                                                                <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${selectedMeeting.is_post_test_active ? 'translate-x-6' : 'translate-x-1'}`}/>
                                                            </button>
                                                        </div>
                                                    )}
                                                </div>
                                                    );
                                                })()}

                                                {/* Feedback */}
                                                <div className="flex flex-col gap-2">
                                                    <button
                                                        onClick={() => {
                                                            if (isHostOrHR) return;
                                                            if (selectedMeeting.is_closed) {
                                                                setNotification({ show: true, type: 'info', message: t('notifications.sessionClosedByHost') });
                                                                return;
                                                            }
                                                            if (!selectedMeeting.is_feedback_active) {
                                                                setNotification({ show: true, type: 'info', message: t('notifications.feedbackNotOpen') });
                                                                return;
                                                            }
                                                            const hasPostTest = (() => {
                                                                try {
                                                                    const data = typeof selectedMeeting.post_test_data === 'string' ? JSON.parse(selectedMeeting.post_test_data || '{}') : (selectedMeeting.post_test_data || {});
                                                                    return Array.isArray(data?.questions) && data.questions.length > 0;
                                                                } catch (e) { return false; }
                                                            })();
                                                            if (hasPostTest) {
                                                                const postRes = meetingQuizResults.find(r => (r.quizType || "").toUpperCase().includes('POST'));
                                                                if (!postRes || (Number(postRes.score) || 0) < 80) {
                                                                    setNotification({ show: true, type: 'info', message: t('notifications.mustPassPostTest') });
                                                                    return;
                                                                }
                                                            }
                                                            if (userFeedback) return;
                                                            setShowFeedback(true);
                                                        }}
                                                        className={`w-full group bg-white border border-slate-200 p-3 rounded-xl flex items-center justify-between transition-all 
                                                            ${(userFeedback || isHostOrHR) 
                                                                ? 'cursor-default' 
                                                                : (() => {
                                                                    const hasPostTest = (() => {
                                                                        try {
                                                                            const data = typeof selectedMeeting.post_test_data === 'string' ? JSON.parse(selectedMeeting.post_test_data || '{}') : (selectedMeeting.post_test_data || {});
                                                                            return Array.isArray(data?.questions) && data.questions.length > 0;
                                                                        } catch (e) { return false; }
                                                                    })();
                                                                    const postRes = meetingQuizResults.find(r => (r.quizType || "").toUpperCase().includes('POST'));
                                                                    const hasPassed = hasPostTest ? (postRes && (Number(postRes.score) || 0) >= 80) : true;
                                                                    return (selectedMeeting.is_feedback_active && !selectedMeeting.is_closed && hasPassed) ? 'hover:border-indigo-300 cursor-pointer' : 'opacity-60 cursor-not-allowed';
                                                                })()}`}
                                                    >
                                                        <div className="flex items-center gap-3">
                                                            <div className={`w-8 h-8 rounded-lg flex items-center justify-center transition-all ${(() => {
                                                                const hasPostTest = (() => {
                                                                    try {
                                                                        const data = typeof selectedMeeting.post_test_data === 'string' ? JSON.parse(selectedMeeting.post_test_data || '{}') : (selectedMeeting.post_test_data || {});
                                                                        return Array.isArray(data?.questions) && data.questions.length > 0;
                                                                    } catch (e) { return false; }
                                                                })();
                                                                const postRes = meetingQuizResults.find(r => (r.quizType || "").toUpperCase().includes('POST'));
                                                                const hasPassed = hasPostTest ? (postRes && (Number(postRes.score) || 0) >= 80) : true;
                                                                if (userFeedback) return 'bg-emerald-100 text-emerald-600';
                                                                if ((!selectedMeeting.is_feedback_active || selectedMeeting.is_closed || (!hasPassed && !isHostOrHR))) return 'bg-slate-50 text-slate-300';
                                                                return 'bg-purple-50 text-purple-600 group-hover:bg-purple-500 group-hover:text-white';
                                                            })()}`}>
                                                                {(() => {
                                                                    const hasPostTest = (() => {
                                                                        try {
                                                                            const data = typeof selectedMeeting.post_test_data === 'string' ? JSON.parse(selectedMeeting.post_test_data || '{}') : (selectedMeeting.post_test_data || {});
                                                                            return Array.isArray(data?.questions) && data.questions.length > 0;
                                                                        } catch (e) { return false; }
                                                                    })();
                                                                    const postRes = meetingQuizResults.find(r => (r.quizType || "").toUpperCase().includes('POST'));
                                                                    const hasPassed = hasPostTest ? (postRes && (Number(postRes.score) || 0) >= 80) : true;
                                                                    return (selectedMeeting.is_feedback_active && !selectedMeeting.is_closed && (hasPassed || isHostOrHR)) ? <Users size={16} /> : <Lock size={16} />;
                                                                })()}
                                                            </div>
                                                            <div className="text-left">
                                                                <p className="font-bold text-slate-800 text-xs">{t('detailModal.feedbackFormTitle')}</p>
                                                                <p className="text-[10px] text-slate-400">{t('detailModal.feedbackFormSubtitle')}</p>
                                                            </div>
                                                        </div>
                                                        <div className="flex items-center gap-3">
                                                            {userFeedback && <span className="text-[10px] font-black text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-100">{t('detailModal.submitted')}</span>}
                                                            {!isHostOrHR && selectedMeeting.is_feedback_active && !userFeedback && <ArrowRight size={14} className="text-slate-300 group-hover:text-indigo-500" />}
                                                        </div>
                                                    </button>
                                                    
                                                    {isHostOrHR && !selectedMeeting.is_closed && (
                                                        <div className="flex items-center justify-between px-3 py-2 bg-slate-50 rounded-lg border border-slate-100">
                                                            <div className="flex flex-col">
                                                                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">{t('detailModal.accessFeedback')}</span>
                                                            </div>
                                                            <button
                                                                onClick={() => toggleMeetingStatus('is_feedback_active', selectedMeeting.is_feedback_active)}
                                                                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${selectedMeeting.is_feedback_active ? 'bg-emerald-500' : 'bg-slate-300'}`}
                                                            >
                                                                <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${selectedMeeting.is_feedback_active ? 'translate-x-6' : 'translate-x-1'}`}/>
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
                                    {t('detailModal.closeDetail')}
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
                                    // Also refresh meetingSummary to update "Sudah Selesai/Belum Selesai" counters
                                    try {
                                        const sRes = await fetch(`${API_BASE_URL}/api/meetings/summary/${selectedMeeting.id}`);
                                        if (sRes.ok) {
                                            const sData = await sRes.json();
                                            setMeetingSummary(sData);
                                        }
                                    } catch (e) { console.error("Failed to refresh summary", e); }
                                    if (isManagementMode) {
                                        fetch(`${API_BASE_URL}/api/quiz/results/all`).then(r => r.json()).then(setAllResults);
                                        fetch(`${API_BASE_URL}/api/feedback/all`).then(r => r.json()).then(setAllFeedback);
                                    }
                                    setShowQuiz(null);
                                    
                                    if (showQuiz === 'POST' && score < 80) {
                                        setNotification({
                                            show: true,
                                            type: 'success',
                                            message: t('notifications.postTestRetry', { score }),
                                            onClose: () => {
                                                // Reopen the quiz
                                                setShowQuiz('POST');
                                            }
                                        });
                                    } else {
                                        setNotification({
                                            show: true,
                                            type: 'success',
                                            message: t('notifications.testCompleted', { type: showQuiz, scoreSuffix: showQuiz === 'POST' ? t('notifications.yourScore', { score }) : '' })
                                        });
                                    }
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
                                    // Also refresh meetingSummary to update "Sudah Selesai/Belum Selesai" counters
                                    try {
                                        console.log('[DEBUG] Submitting feedback, refreshing summary...');
                                        // Add small delay to ensure database commit is complete
                                        await new Promise(r => setTimeout(r, 500));
                                        const sRes = await fetch(`${API_BASE_URL}/api/meetings/summary/${selectedMeeting.id}`);
                                        if (sRes.ok) {
                                            const sData = await sRes.json();
                                            console.log('[DEBUG] New summary data:', sData);
                                            setMeetingSummary(sData);
                                            // Also update selectedMeeting to trigger any dependent renders
                                            setSelectedMeeting(prev => prev ? ({...prev, __summaryRefreshed: Date.now()} as any) : prev);
                                        } else {
                                            console.error('[DEBUG] Failed to fetch summary, status:', sRes.status);
                                        }
                                    } catch (e) { console.error("Failed to refresh summary", e); }
                                    if (isManagementMode) {
                                        fetch(`${API_BASE_URL}/api/quiz/results/all`).then(r => r.json()).then(setAllResults);
                                        fetch(`${API_BASE_URL}/api/feedback/all`).then(r => r.json()).then(setAllFeedback);
                                    }
                                    setShowFeedback(false);
                                    setNotification({ show: true, type: 'success', message: t('notifications.feedbackThanks') });
                                }
                            } catch (err) { console.error(err); }
                        }}
                        meetingTitle={selectedMeeting.title}
                    />
                </div>
            )}
            {/* Custom Modal for Closing Session with Photo Upload */}
            {isCloseModalOpen && (
                <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in">
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden p-6 scale-100 animate-in zoom-in-95">
                        <div className="flex flex-col items-center text-center">
                            <div className={`p-3 rounded-full mb-4 bg-red-100 text-red-600`}>
                                <Lock size={32} />
                            </div>

                            <h3 className="text-xl font-bold text-slate-800 mb-2">{t('closeSessionModal.title')}</h3>
                            <p className="text-slate-500 mb-4 text-sm">{t('closeSessionModal.message')}</p>

                            <div className="w-full text-left mb-6 relative">
                                <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2">{t('closeSessionModal.uploadPhotosLabel')} <span className="text-red-500">*</span></label>
                                <div className="relative">
                                    <ImageIcon size={16} className="absolute left-3.5 top-3.5 text-slate-400" />
                                    <input 
                                        type="file" 
                                        accept="image/*" 
                                        onChange={async (e) => {
                                            const file = e.target.files?.[0];
                                            if (!file) return;
                                            try {
                                                setIsUploadingPhoto(true);
                                                const url = await uploadFileToServer(file);
                                                setCloseSessionPhotoUrl(url);
                                            } catch (err) {
                                                setNotification({ show: true, type: 'error', message: t('notifications.photoUploadError') });
                                            } finally {
                                                setIsUploadingPhoto(false);
                                            }
                                        }}
                                        className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none transition-all text-slate-600 bg-slate-50 text-sm file:mr-4 file:py-1 file:px-3 file:rounded-full file:border-0 file:text-xs file:font-semibold file:bg-indigo-50 file:text-indigo-600 hover:file:bg-indigo-100 cursor-pointer"
                                        disabled={isUploadingPhoto}
                                    />
                                </div>
                                {isUploadingPhoto && <p className="text-xs text-indigo-600 font-bold mt-2">{t('closeSessionModal.uploading')}</p>}
                                {closeSessionPhotoUrl && (
                                    <p className="text-xs text-emerald-600 font-bold mt-2 flex items-center gap-1"><CheckCircle size={12}/> {t('closeSessionModal.photoUploadedSuccess')}</p>
                                )}
                            </div>

                            <div className="flex gap-3 w-full">
                                <button
                                    onClick={() => { setIsCloseModalOpen(false); setCloseSessionPhotoUrl(''); }}
                                    className={`flex-1 py-2.5 rounded-xl border border-slate-200 font-bold transition-colors text-slate-600 hover:bg-slate-50`}
                                >
                                    {t('closeSessionModal.cancelButton')}
                                </button>
                                <button
                                    onClick={async () => { 
                                        if(!selectedMeeting) return;
                                        
                                        const costReportPayload = {
                                            ...selectedMeeting.costReport,
                                            trainingPhotos: closeSessionPhotoUrl
                                        };
                                        const updatedMeeting = { 
                                            ...selectedMeeting, 
                                            is_closed: 1,
                                            costReport: costReportPayload 
                                        };

                                        try {
                                            const res = await fetch(`${API_BASE_URL}/api/meetings/${selectedMeeting.id}`, {
                                                method: 'PUT',
                                                headers: { 'Content-Type': 'application/json' },
                                                body: JSON.stringify(updatedMeeting)
                                            });

                                            if (res.ok) {
                                                const data = await res.json();
                                                const safeData = safeMeeting(data);
                                                setSelectedMeeting(safeData);
                                                setMeetings(prev => prev.map(m => m.id === safeData.id ? safeData : m));
                                                setNotification({ show: true, type: 'success', message: t('notifications.sessionClosed') });
                                            } else {
                                                throw new Error("Failed to close session.");
                                            }
                                        } catch (e) {
                                            console.error(e);
                                            setNotification({ show: true, type: 'error', message: t('notifications.sessionCloseError') });
                                        }

                                        setIsCloseModalOpen(false);
                                        setCloseSessionPhotoUrl('');
                                    }}
                                    className={`flex-1 py-2.5 rounded-xl text-white font-bold shadow-lg transition-colors bg-red-600 hover:bg-red-700 shadow-red-200 disabled:opacity-50 disabled:cursor-not-allowed`}
                                    disabled={!closeSessionPhotoUrl || isUploadingPhoto}
                                >
                                    {t('closeSessionModal.confirmButton')}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

// --- Sub-components for Interactive Training ---

const TrainingQuiz = ({ type, questions, onClose, onSubmit, meetingTitle }: any) => {
    const { t } = useTranslation('trainingInternalList');
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
            <p className="text-slate-500 mb-4 italic">{t('quiz.notConfigured')}</p>
            <button onClick={onClose} className="px-6 py-2 bg-slate-100 rounded-xl font-bold">{t('quiz.close')}</button>
        </div>
    );

    const q = questions[currentStep];

    return (
        <div className="bg-white rounded-[32px] w-full max-w-lg shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
            <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-white sticky top-0 z-10">
                <div>
                    <span className="text-[10px] font-black uppercase text-indigo-500 tracking-widest">{type} {t('quiz.testAssessment')}</span>
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
                                    <span className="text-sm font-black text-indigo-600 uppercase">{t('quiz.questionProgress', { current: currentStep + 1, total: questions.length })}</span>
                                    <span className="text-xs font-bold text-slate-400">{t('quiz.percentFilled', { progress })}</span>
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
                    {isSubmitting ? t('quiz.sending') : (currentStep === questions.length - 1 ? t('quiz.finishTest') : t('quiz.nextQuestion'))}
                </button>
            </div>
        </div>
    );
};

const TrainingFeedbackForm = ({ onClose, onSubmit, meetingTitle }: any) => {
    const { t } = useTranslation('trainingInternalList');
    const [isLoading, setIsLoading] = useState(false);
    const questions = [
        { id: 'q1', text: t('feedbackForm.q1'), type: 'scale' },
        { id: 'q2', text: t('feedbackForm.q2'), type: 'scale' },
        { id: 'q3', text: t('feedbackForm.q3'), type: 'scale' },
        { id: 'q4', text: t('feedbackForm.q4'), type: 'scale' },
        { id: 'q5', text: t('feedbackForm.q5'), type: 'scale' },
        { id: 'q6', text: t('feedbackForm.q6'), type: 'scale' },
        { id: 'q7', text: t('feedbackForm.q7'), type: 'scale' },
        { id: 'q8', text: t('feedbackForm.q8'), type: 'scale' },
        { id: 'q9', text: t('feedbackForm.q9'), type: 'scale' },
        { id: 'q10', text: t('feedbackForm.q10'), type: 'scale' },
        { id: 'q11', text: t('feedbackForm.q11'), type: 'text' },
        { id: 'q12', text: t('feedbackForm.q12'), type: 'text' }
    ];

    const [form, setForm] = useState<any>({});

    const handleLevel = (id: string, val: number) => setForm({ ...form, [id]: val });

    const isComplete = questions.every(q => q.type === 'text' ? (form[q.id]?.length > 2) : (form[q.id] !== undefined));

    return (
        <div className="bg-white rounded-[32px] w-full max-w-lg shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
            <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-white sticky top-0 z-10">
                <div>
                    <span className="text-[10px] font-black uppercase text-purple-500 tracking-widest">{t('feedbackForm.header')}</span>
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
                                    const labels = ["", t('feedbackForm.scaleStronglyDisagree'), t('feedbackForm.scaleDisagree'), t('feedbackForm.scaleAgree'), t('feedbackForm.scaleStronglyAgree')];
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
                                placeholder={t('feedbackForm.textPlaceholder')}
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
                    {isLoading ? t('feedbackForm.sending') : t('feedbackForm.submitButton')}
                </button>
            </div>
        </div>
    );
};

const QuizEditor = ({ type, data, onChange }: { type: string, data: any, onChange: (data: any) => void }) => {
    const { t } = useTranslation('trainingInternalList');
    const questions = data?.questions || [];
    const lastQuestionRef = useRef<HTMLDivElement>(null);
    const lastInputRef = useRef<HTMLTextAreaElement>(null);
    const [showImportModal, setShowImportModal] = useState(false);
    const [importUrl, setImportUrl] = useState('');
    const [isImporting, setIsImporting] = useState(false);

    const addQuestion = () => {
        const newQs = [...questions, { question: '', options: ['', ''], correctAnswer: 0 }];
        onChange({ ...data, questions: newQs });
        setTimeout(() => {
            lastQuestionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
            lastInputRef.current?.focus();
        }, 150);
    };

    const importGForm = async () => {
        if (!importUrl) return;
        setIsImporting(true);
        try {
            const res = await fetch(`${API_BASE_URL}/api/utils/import-gform`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ url: importUrl })
            });
            const result = await res.json();
            if (!res.ok) throw new Error(result.error || 'Failed to import form');
            if (result.questions && result.questions.length > 0) {
                const newQs = [...questions, ...result.questions];
                onChange({ ...data, questions: newQs });
                alert(t('quizEditor.importSuccessAlert', { count: result.questions.length }));
                setShowImportModal(false);
                setImportUrl('');
            } else {
                alert(t('quizEditor.importNoQuestionsAlert'));
            }
        } catch (e: any) {
            alert(t('quizEditor.importFailedAlert', { message: e.message }));
        } finally {
            setIsImporting(false);
        }
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
                     {type} {t('quizEditor.assessmentSuffix')}
                 </h4>
                 <div className="flex items-center gap-2">
                     <button type="button" onClick={() => setShowImportModal(true)} className="bg-emerald-50 text-emerald-600 px-3 py-1.5 rounded-lg text-xs font-black hover:bg-emerald-600 hover:text-white transition-all flex items-center gap-1" title={t('quizEditor.importTooltip')}>
                         <Link size={14} /> {t('quizEditor.importGoogleForm')}
                     </button>
                     <button type="button" onClick={addQuestion} className="bg-indigo-50 text-indigo-600 px-3 py-1.5 rounded-lg text-xs font-black hover:bg-indigo-600 hover:text-white transition-all flex items-center gap-1">
                         <Plus size={14} /> {t('quizEditor.addQuestion')}
                     </button>
                 </div>
             </div>
             {questions.length === 0 && (
                 <div className="py-8 px-4 border-2 border-dashed border-slate-100 rounded-2xl text-center">
                     <p className="text-xs text-slate-400 font-medium">{t('quizEditor.noQuestionsFor', { type })}</p>
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
                             <label className="block text-[9px] font-black text-slate-400 uppercase mb-1.5">{t('quizEditor.questionLabel', { number: i + 1 })}</label>
                             <textarea
                                 ref={i === questions.length - 1 ? lastInputRef : null}
                                 className="w-full px-4 py-2.5 rounded-xl border border-slate-200 text-xs font-bold text-slate-700 focus:ring-2 focus:ring-indigo-500 outline-none bg-white"
                                 value={q.question}
                                 onChange={e => updateQuestion(i, 'question', e.target.value)}
                                 placeholder={t('quizEditor.questionPlaceholder')}
                                 rows={2}
                             />
                         </div>
                         <div className="grid grid-cols-1 gap-2.5">
                             <label className="block text-[9px] font-black text-slate-400 uppercase">{t('quizEditor.answerOptionsLabel')}</label>
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
                                         placeholder={t('quizEditor.optionPlaceholder', { number: oi + 1 })}
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
                                <Plus size={12} strokeWidth={3} /> {t('quizEditor.addOption')}
                             </button>
                         </div>
                     </div>
                 ))}
             </div>
             
             {showImportModal && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 backdrop-blur-sm px-4">
                    <div className="bg-white rounded-2xl w-full max-w-md p-6 shadow-2xl animate-in zoom-in-95 duration-200">
                        <div className="flex justify-between items-center mb-4">
                            <h3 className="font-bold text-slate-800 text-lg flex items-center gap-2">
                                <Link size={18} className="text-emerald-500" /> {t('quizEditor.importModalTitle')}
                            </h3>
                            <button type="button" onClick={() => setShowImportModal(false)} className="text-slate-400 hover:text-slate-600 transition-colors">
                                <X size={20} />
                            </button>
                        </div>
                        <p className="text-sm text-slate-500 mb-4">{t('quizEditor.importModalMessage')}</p>
                        <input 
                            type="url"
                            autoFocus
                            placeholder="https://docs.google.com/forms/d/..."
                            className="w-full px-4 py-3 rounded-xl border border-slate-200 text-sm font-semibold text-slate-700 focus:ring-2 focus:ring-emerald-500 outline-none transition-all mb-6 bg-slate-50 focus:bg-white"
                            value={importUrl}
                            onChange={(e) => setImportUrl(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && importGForm()}
                        />
                        <div className="flex justify-end gap-3">
                            <button 
                                type="button" 
                                onClick={() => setShowImportModal(false)}
                                className="px-5 py-2.5 rounded-xl font-bold text-slate-600 hover:bg-slate-100 transition-colors text-sm"
                            >
                                {t('quizEditor.cancelButton')}
                            </button>
                            <button
                                type="button"
                                disabled={isImporting || !importUrl}
                                onClick={importGForm}
                                className="px-5 py-2.5 rounded-xl font-bold bg-emerald-500 text-white hover:bg-emerald-600 transition-colors text-sm flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                {isImporting ? t('quizEditor.importing') : t('quizEditor.importSubmit')}
                            </button>
                        </div>
                    </div>
                </div>
             )}
        </div>
    );
};

export default TrainingInternalList;
