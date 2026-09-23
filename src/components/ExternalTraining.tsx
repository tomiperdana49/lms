import { useState, useEffect, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import type { ExternalTrainingRequest, User } from '../types';
import { API_BASE_URL } from '../config';
import {
 BookOpen,
 CheckCircle,
 XCircle,

 Wallet,
 Briefcase,
 Link,
 Calendar,
 ChevronDown,
 MapPin,
 Award,
 Gift,
 Clock,
 Users,
 X,
 Check,
 MessageSquare,
 ClipboardCheck
} from 'lucide-react';
import PopupNotification from './PopupNotification';
import { ANNUAL_LEARNING_BUDGET } from './LearningReport';

interface CcOption {
    employeeId: string;
    fullName: string;
    jobPosition: string;
}

type TabType = 'my_requests' | 'team_approvals';

interface ExternalTrainingProps {
 currentUser: User | null;
 isManagementMode: boolean;
 defaultTab?: TabType;
}

export default function ExternalTraining({ currentUser, isManagementMode, defaultTab }: ExternalTrainingProps) {
 const { t } = useTranslation('externalTraining');
 const isSupervisor = !!currentUser?.isSupervisor;
 // Interns get no annual learning budget - the personal budget card shows their spend without a cap.
 const isIntern = !!currentUser?.isIntern;
 const [activeTab, setActiveTab] = useState<TabType>(defaultTab || 'my_requests');

 useEffect(() => {
 if (defaultTab) setActiveTab(defaultTab);
 }, [defaultTab]);

 useEffect(() => {
 if (activeTab === 'team_approvals' && !isSupervisor) setActiveTab('my_requests');
 }, [activeTab, isSupervisor]);
 const [requests, setRequests] = useState<ExternalTrainingRequest[]>([]);
 const [teamRequests, setTeamRequests] = useState<ExternalTrainingRequest[]>([]);
 const [expandedRequestIds, setExpandedRequestIds] = useState<Set<number>>(new Set());
 const toggleRequestDetail = (id: number) => {
 setExpandedRequestIds(prev => {
 const next = new Set(prev);
 if (next.has(id)) next.delete(id); else next.add(id);
 return next;
 });
 };

 const [notification, setNotification] = useState({ show: false, type: 'success' as 'success' | 'error', message: '' });
 const [isLoading, setIsLoading] = useState(false);

 // Post Training Evaluation score per request, once the leader has submitted one - keyed by
 // `${externalTrainingRequestId}-${evaluateeEmployeeId}` since a form can be reused across many
 // requests. Fetched once; the same flat list backs both My Requests and Team Approvals.
 const [pteScores, setPteScores] = useState<Record<string, number>>({});
 useEffect(() => {
 fetch(`${API_BASE_URL}/api/post-training-evaluations/responses/all`)
 .then(res => res.ok ? res.json() : [])
 .then((rows: { externalTrainingRequestId: number | null; evaluateeEmployeeId: string; averageScore: number | null }[]) => {
 const map: Record<string, number> = {};
 rows.forEach(r => {
 if (r.externalTrainingRequestId && r.averageScore !== null) {
 map[`${r.externalTrainingRequestId}-${r.evaluateeEmployeeId}`] = r.averageScore;
 }
 });
 setPteScores(map);
 })
 .catch(err => console.error('Error fetching PTE scores:', err));
 }, []);

    const [rejectModalOpen, setRejectModalOpen] = useState(false);
    const [selectedRequestId, setSelectedRequestId] = useState<number | null>(null);
    const [rejectionReason, setRejectionReason] = useState('');

    // Optional note a leader can leave on why they approved - separate modal from reject's since
    // the note isn't required (Approve still needs to work with the field left blank).
    const [approveModalOpen, setApproveModalOpen] = useState(false);
    const [approveNoteDraft, setApproveNoteDraft] = useState('');

    // CC picker for the request form - every non-resigned employee company-wide (same source
    // /api/team-members/Team Competencies already uses), searchable and multi-select.
    const [ccOptions, setCcOptions] = useState<CcOption[]>([]);
    const [selectedCcIds, setSelectedCcIds] = useState<string[]>([]);
    const [ccSearch, setCcSearch] = useState('');
    const [ccDropdownOpen, setCcDropdownOpen] = useState(false);

    // Personal learning budget so far this year - same figure/cap shown on the Dashboard
    // (ANNUAL_LEARNING_BUDGET), surfaced here too since it's exactly what a new request eats into.
    const [personalLearningCost, setPersonalLearningCost] = useState(0);

 // Form States for Request
 const [category, setCategory] = useState('Training');
 const [title, setTitle] = useState('');
 const [vendor, setVendor] = useState('');
 const [location, setLocation] = useState('');
 const [startDate, setStartDate] = useState('');
 const [endDate, setEndDate] = useState('');
 const [regFee, setRegFee] = useState('');
 const [attachmentFile, setAttachmentFile] = useState<File | null>(null);
 const [paymentMethod, setPaymentMethod] = useState<'Reimbursement' | 'Direct Payment'>('Direct Payment');


 useEffect(() => {
 if (!currentUser) return;
 if (activeTab === 'my_requests') fetchMyRequests();
 if (activeTab === 'team_approvals') fetchTeamRequests();
  }, [activeTab, currentUser, isManagementMode]);

 // CC options for the request form - fetched once, not per tab switch.
 useEffect(() => {
 fetch(`${API_BASE_URL}/api/employees/directory`)
 .then(res => res.json())
 .then((data: CcOption[]) => setCcOptions(Array.isArray(data) ? data : []))
 .catch(err => console.error('Error fetching CC options:', err));
 }, []);

 // Personal learning cost for the current calendar year - same query shape (Jan 1-Dec 31,
 // this year) as the Dashboard's own "Learning Cost" widget, so the two numbers always agree.
 useEffect(() => {
 if (!currentUser?.employee_id) return;
 const currentYear = new Date().getFullYear();
 fetch(`${API_BASE_URL}/api/learning-stats?employee_id=${currentUser.employee_id}&startDate=${currentYear}-01-01&endDate=${currentYear}-12-31`)
 .then(res => res.json())
 .then(data => { if (!data.error) setPersonalLearningCost(data.totalBiaya || 0); })
 .catch(err => console.error('Error fetching personal learning cost:', err));
 }, [currentUser?.employee_id]);

 const fetchMyRequests = async () => {
 try {
 const res = await fetch(`${API_BASE_URL}/api/external-training/my-requests?employee_id=${currentUser?.employee_id || ''}`);
 if (res.ok) setRequests(await res.json());
 } catch (err) { console.error(err); }
 };

 const fetchTeamRequests = async () => {
 try {
 const res = await fetch(`${API_BASE_URL}/api/external-training/subordinates?leader_id=${currentUser?.employee_id || ''}`);
 if (res.ok) setTeamRequests(await res.json());
 } catch (err) { console.error(err); }
 };

 const showNotif = (type: 'success'|'error', message: string) => {
 setNotification({ show: true, type, message });
 setTimeout(() => setNotification(n => ({ ...n, show: false })), 3000);
 };

 const handleRequestSubmit = async (e: FormEvent) => {
 e.preventDefault();
 if (!currentUser) return;
 setIsLoading(true);
 try {
 let attachmentLink = '';
 if (attachmentFile) {
 const formData = new FormData();
 formData.append('file', attachmentFile);
 const uploadRes = await fetch(`${API_BASE_URL}/api/upload`, {
 method: 'POST',
 body: formData
 });
 if (uploadRes.ok) {
 const uploadData = await uploadRes.json();
 attachmentLink = uploadData.fileUrl;
 }
 }
 const res = await fetch(`${API_BASE_URL}/api/external-training/request`, {
 method: 'POST',
 headers: { 'Content-Type': 'application/json' },
 body: JSON.stringify({
 employee_id: currentUser.employee_id,
 employee_name: currentUser.name,
 category,
 title,
 start_date: startDate,
 end_date: endDate,
 registration_fee: Number(regFee.replace(/\./g, '')) || 0,
 attachment_link: attachmentLink,
 vendor,
 location,
 payment_method: paymentMethod,
 cc_employee_ids: selectedCcIds
 })
 });
 if (res.ok) {
 showNotif('success', t('notifications.submitSuccess'));
 setTitle(''); setVendor(''); setLocation(''); setRegFee(''); setAttachmentFile(null); setStartDate(''); setEndDate(''); setPaymentMethod('Direct Payment'); setSelectedCcIds([]);
 fetchMyRequests();
 } else {
 throw new Error(t('notifications.submitFailed'));
 }
 } catch (err: any) {
 showNotif('error', err.message);
 } finally {
 setIsLoading(false);
 }
 };

 const handleApproveReject = async (id: number, status: 'Approved' | 'Rejected', reason?: string, note?: string) => {
 try {
 const bodyData: any = {
 id,
 status,
 approved_by: currentUser?.name || 'Leader'
 };
 if (status === 'Rejected' && reason) {
 bodyData.rejection_reason = reason;
 }
 if (status === 'Approved' && note && note.trim()) {
 bodyData.approval_note = note.trim();
 }

 const res = await fetch(`${API_BASE_URL}/api/external-training/approve`, {
 method: 'POST',
 headers: { 'Content-Type': 'application/json' },
 body: JSON.stringify(bodyData)
 });

 if (!res.ok) throw new Error(t('notifications.updateFailed'));
 setNotification({ show: true, type: 'success', message: t('notifications.statusUpdated', { status: status === 'Approved' ? t('notifications.statusApproved') : t('notifications.statusRejected') }) });
 fetchTeamRequests();
 if (status === 'Rejected') {
 setRejectModalOpen(false);
 setRejectionReason('');
 setSelectedRequestId(null);
 } else {
 setApproveModalOpen(false);
 setApproveNoteDraft('');
 setSelectedRequestId(null);
 }
 } catch (error) {
 console.error(error);
 setNotification({ show: true, type: 'error', message: t('notifications.updateError') });
 }
 };

 const confirmReject = () => {
 if (selectedRequestId !== null && rejectionReason.trim() !== '') {
 handleApproveReject(selectedRequestId, 'Rejected', rejectionReason);
 }
 };

 // Leaders must explain why they're approving, same requirement as reject's reason.
 const confirmApprove = () => {
 if (selectedRequestId !== null && approveNoteDraft.trim() !== '') {
 handleApproveReject(selectedRequestId, 'Approved', undefined, approveNoteDraft);
 }
 };

 const formatRp = (num: number) => new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR' }).format(num);
 const formatScheduleDateTime = (value: string) => new Date(value).toLocaleDateString();

 // DB status is a 3-stage pipeline (Pending -> Approved -> Processed) but "Approved" only means the
 // supervisor signed off — HR still has to process it — and "Processed" means HR has fully finished it.
 // Surface that as "Pending (HR)" / "Approved" respectively so neither reads as still-in-limbo to a
 // supervisor who already gave their own approval.
 const getStatusLabel = (status: string | undefined, leaderName?: string) => {
 if (status === 'Pending') return t('status.pendingWithApprover', { name: leaderName || t('status.defaultSupervisor') });
 if (status === 'Approved') return t('status.pendingHr');
 if (status === 'Processed') return t('status.approved');
 if (status === 'Rejected') return t('status.rejected');
 return status;
 };

 const getFullImageUrl = (path: string) => path.startsWith('http') ? path : `${API_BASE_URL}${path}`;

 // Google Drive "view" links can't be used directly as <img> src; convert to Drive's thumbnail endpoint.
 const getDisplayImageUrl = (path: string) => {
 const full = getFullImageUrl(path);
 const driveMatch = full.match(/drive\.google\.com\/file\/d\/([a-zA-Z0-9_-]+)/) || full.match(/drive\.google\.com\/.*[?&]id=([a-zA-Z0-9_-]+)/);
 if (driveMatch) return `https://drive.google.com/thumbnail?id=${driveMatch[1]}&sz=w1000`;
 return full;
 };

 const isPdfLink = (path: string) => /\.pdf(\?|$)/i.test(path);

 // Shared "Show Detail" breakdown, used by both the employee's own requests and their
 // supervisor's Team Approvals view so both sides see the exact same data.
 const renderRequestDetail = (req: ExternalTrainingRequest) => (
 <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-4 bg-gray-50 border border-gray-100 rounded-lg text-sm">
 {req.vendor && (
 <div className="flex items-center gap-2 text-gray-600">
 <Briefcase className="w-4 h-4 text-gray-400 shrink-0" />
 <span>{t('request.detailVendor')}: <span className="font-semibold text-gray-800">{req.vendor}</span></span>
 </div>
 )}
 {req.location && (
 <div className="flex items-center gap-2 text-gray-600">
 <MapPin className="w-4 h-4 text-gray-400 shrink-0" />
 <span>{t('request.detailLocation')}: <span className="font-semibold text-gray-800">{req.location}</span></span>
 </div>
 )}
 {req.training_gr_type && (
 <div className="flex items-center gap-2 text-gray-600">
 <Award className="w-4 h-4 text-gray-400 shrink-0" />
 <span>{t('request.detailGriType')}: <span className="font-semibold text-gray-800">{t(`form.gri${req.training_gr_type === 'ESG' ? 'Esg' : req.training_gr_type === 'HSE' ? 'Hse' : 'Other'}`)}</span></span>
 </div>
 )}
 {req.participation_type && (
 <div className="flex items-center gap-2 text-gray-600">
 <Award className="w-4 h-4 text-gray-400 shrink-0" />
 <span>{t('request.detailParticipationType')}: <span className="font-semibold text-gray-800">{req.participation_type}</span></span>
 </div>
 )}
 {Number(req.learning_hours) > 0 && (
 <div className="flex items-center gap-2 text-gray-600">
 <Clock className="w-4 h-4 text-gray-400 shrink-0" />
 <span>{t('request.detailLearningHours')}: <span className="font-semibold text-gray-800">{t('request.detailLearningHoursValue', { count: Number(req.learning_hours) })}</span></span>
 </div>
 )}
 {req.end_date && (
 <div className="flex items-center gap-2 text-gray-600">
 <Calendar className="w-4 h-4 text-gray-400 shrink-0" />
 <span>{t('request.detailSchedule')}: <span className="font-semibold text-gray-800">{req.start_date ? formatScheduleDateTime(req.start_date) : '-'} &mdash; {formatScheduleDateTime(req.end_date)}</span></span>
 </div>
 )}
 {Number(req.registration_fee) > 0 && (
 <div className="flex items-center gap-2 text-gray-600">
 <Wallet className="w-4 h-4 text-gray-400 shrink-0" />
 <span>{t('request.detailRegistrationFee')}: <span className="font-semibold text-gray-800">{formatRp(Number(req.registration_fee))}</span></span>
 </div>
 )}
 {Number(req.travel_flight_cost) > 0 && (
 <div className="flex items-center gap-2 text-gray-600">
 <Wallet className="w-4 h-4 text-gray-400 shrink-0" />
 <span>{t('request.detailTravelCost')}: <span className="font-semibold text-gray-800">{formatRp(Number(req.travel_flight_cost))}</span></span>
 </div>
 )}
 {Number(req.accommodation_cost) > 0 && (
 <div className="flex items-center gap-2 text-gray-600">
 <Wallet className="w-4 h-4 text-gray-400 shrink-0" />
 <span>{t('request.detailAccommodationCost')}: <span className="font-semibold text-gray-800">{formatRp(Number(req.accommodation_cost))}</span></span>
 </div>
 )}
 {Number(req.miscellaneous_cost) > 0 && (
 <div className="flex items-center gap-2 text-gray-600">
 <Wallet className="w-4 h-4 text-gray-400 shrink-0" />
 <span>{t('request.detailMiscCost')}: <span className="font-semibold text-gray-800">{formatRp(Number(req.miscellaneous_cost))}</span></span>
 </div>
 )}
 <div className="flex items-center gap-2 text-gray-600">
 <Wallet className="w-4 h-4 text-gray-400 shrink-0" />
 <span>{t('request.detailTotalCost')}: <span className="font-semibold text-gray-800">{formatRp(Number(req.registration_fee || 0) + Number(req.travel_flight_cost || 0) + Number(req.accommodation_cost || 0) + Number(req.miscellaneous_cost || 0))}</span></span>
 </div>
 {Number(req.incentive_reward) > 0 && (
 <div className="flex items-center gap-2 text-gray-600">
 <Gift className="w-4 h-4 text-gray-400 shrink-0" />
 <span>{t('request.detailIncentive')}: <span className="font-semibold text-gray-800">{formatRp(Number(req.incentive_reward))}{req.incentive_payment_type === 'Recurring' ? ` / ${t('request.detailIncentivePerMonth')}` : ''}</span></span>
 </div>
 )}
 {req.cc_employee_ids && req.cc_employee_ids.length > 0 && (
 <div className="flex items-start gap-2 text-gray-600 sm:col-span-2">
 <Users className="w-4 h-4 text-gray-400 shrink-0 mt-0.5" />
 <span>{t('request.detailCc')}: <span className="font-semibold text-gray-800">{req.cc_employee_ids.map(id => ccOptions.find(o => o.employeeId === id)?.fullName || id).join(', ')}</span></span>
 </div>
 )}
 {req.approved_by && (
 <div className="flex items-center gap-2 text-gray-600">
 <CheckCircle className="w-4 h-4 text-gray-400 shrink-0" />
 <span>{t('request.detailApprovedBy')}: <span className="font-semibold text-gray-800">{req.approved_by}</span></span>
 </div>
 )}
 {req.hr_name && (
 <div className="flex items-center gap-2 text-gray-600">
 <CheckCircle className="w-4 h-4 text-gray-400 shrink-0" />
 <span>{t('request.detailProcessedByHr')}: <span className="font-semibold text-gray-800">{req.hr_name}</span></span>
 </div>
 )}
 {pteScores[`${req.id}-${req.employee_id}`] !== undefined && (
 <div className="flex items-center gap-2 text-gray-600">
 <ClipboardCheck className="w-4 h-4 text-gray-400 shrink-0" />
 <span>{t('request.detailPteScore')}: <span className="font-semibold text-gray-800">{pteScores[`${req.id}-${req.employee_id}`]}</span></span>
 </div>
 )}
 {req.attachment_link && (
 <a href={req.attachment_link} target="_blank" rel="noreferrer" className="flex items-center gap-2 text-indigo-600 hover:text-indigo-700 font-semibold">
 <Link className="w-4 h-4 shrink-0" />
 {t('request.detailAttachment')}: {t('request.viewLink')}
 </a>
 )}
 {(req.certificate_link || req.renewal_certificate_link) && (
 <div className="sm:col-span-2">
 <span className="flex items-center gap-2 text-gray-600 mb-2">
 <Award className="w-4 h-4 shrink-0 text-gray-400" />
 {t('request.detailCertificate')}
 </span>
 <div className="flex flex-wrap gap-4">
 {[
 { url: req.certificate_link, label: t('request.detailCertificateOriginal'), expiry: req.original_certificate_expiry_date },
 { url: req.renewal_certificate_link, label: t('request.detailCertificateRenewed'), expiry: undefined }
 ].filter((cert): cert is { url: string; label: string; expiry: string | undefined } => !!cert.url).map((cert, idx, arr) => (
 <div key={idx} className="flex flex-col gap-1">
 {isPdfLink(cert.url) ? (
 <a href={getFullImageUrl(cert.url)} target="_blank" rel="noreferrer" className="flex items-center gap-2 text-indigo-600 hover:text-indigo-700 font-semibold w-48">
 <Link className="w-4 h-4 shrink-0" /> {t('request.viewLink')}
 </a>
 ) : (
 <a href={getFullImageUrl(cert.url)} target="_blank" rel="noreferrer" className="relative block w-48 h-32 rounded-lg overflow-hidden border border-gray-200 hover:opacity-90 transition-opacity bg-gray-50">
 <img
 src={getDisplayImageUrl(cert.url)}
 alt={cert.label}
 referrerPolicy="no-referrer"
 className="w-full h-full object-cover"
 onError={(e) => {
 // Google Drive's thumbnail endpoint occasionally refuses cross-origin <img> loads
 // (referrer/rate-limit heuristics on Google's end); fall back to a plain link instead
 // of leaving a broken-image icon.
 e.currentTarget.style.display = 'none';
 const fallback = e.currentTarget.nextElementSibling as HTMLElement | null;
 if (fallback) fallback.style.display = 'flex';
 }}
 />
 <div style={{ display: 'none' }} className="absolute inset-0 flex-col items-center justify-center gap-1 text-indigo-600 text-xs font-semibold bg-gray-50">
 <Link className="w-4 h-4" /> {t('request.viewLink')}
 </div>
 </a>
 )}
 {arr.length > 1 && <span className="text-xs font-semibold text-gray-500">{cert.label}</span>}
 {cert.expiry && (
 <span className="text-xs text-gray-500">{new Date(cert.expiry).toLocaleDateString()}</span>
 )}
 </div>
 ))}
 </div>
 </div>
 )}
 {req.certificate_expiry_date && (
 <div className="flex items-center gap-2 text-gray-600">
 <Calendar className="w-4 h-4 text-gray-400 shrink-0" />
 <span>{t('request.detailCertificateExpiry')}: <span className="font-semibold text-gray-800">{new Date(req.certificate_expiry_date).toLocaleDateString()}</span></span>
 </div>
 )}
 </div>
 );

 return (
 <div className="space-y-6 animate-in fade-in">
 {notification.show && (
 <PopupNotification isOpen={notification.show} type={notification.type} message={notification.message} onClose={() => setNotification(n => ({...n, show: false}))} />
 )}

 <div className="flex flex-wrap items-center justify-between gap-4">
 <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-3">
 <Briefcase className="w-8 h-8 text-blue-600 " />
 {t('title')}
 </h1>
 </div>

 {/* Tabs */}
 <div className="flex border-b border-gray-200 ">
 <button
 className={`px-4 py-2 border-b-2 font-medium text-sm transition-colors ${activeTab === 'my_requests' ? 'border-blue-600 text-blue-600 ' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
 onClick={() => setActiveTab('my_requests')}
 >
 {t('tabs.myRequests')}
 </button>
 {isSupervisor && (
 <button
 className={`px-4 py-2 border-b-2 font-medium text-sm transition-colors ${activeTab === 'team_approvals' ? 'border-blue-600 text-blue-600 ' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
 onClick={() => setActiveTab('team_approvals')}
 >
 {t('tabs.teamApprovals')}
 </button>
 )}

 </div>

 {/* My Requests Tab */}
 {activeTab === 'my_requests' && (
 <div className="space-y-6">
 {/* Personal Learning Budget - same figure/cap as the Dashboard's own widget, shown
 here since a new request is exactly what eats into it. */}
 <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
 <div className="flex items-center gap-2 text-gray-500 mb-2">
 <Wallet className="w-4 h-4" />
 <span className="text-xs font-bold uppercase tracking-wide">{t('budget.title')}</span>
 </div>
 <div className="flex items-baseline gap-2 flex-wrap">
 <span className={`text-2xl font-black ${!isIntern && personalLearningCost > ANNUAL_LEARNING_BUDGET ? 'text-rose-600' : 'text-gray-800'}`}>
 {formatRp(personalLearningCost)}
 </span>
 {!isIntern && <span className="text-sm font-semibold text-gray-400">/ {formatRp(ANNUAL_LEARNING_BUDGET)}</span>}
 </div>
 {isIntern ? (
 <p className="text-xs font-semibold mt-2 text-gray-500">{t('budget.none')}</p>
 ) : (
 <>
 <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden mt-2">
 <div
 className={`h-full rounded-full ${personalLearningCost <= ANNUAL_LEARNING_BUDGET ? 'bg-emerald-500' : 'bg-rose-500'}`}
 style={{ width: `${Math.min((personalLearningCost / ANNUAL_LEARNING_BUDGET) * 100, 100)}%` }}
 />
 </div>
 <p className={`text-xs font-semibold mt-2 ${personalLearningCost <= ANNUAL_LEARNING_BUDGET ? 'text-gray-500' : 'text-rose-600'}`}>
 {personalLearningCost <= ANNUAL_LEARNING_BUDGET
 ? t('budget.remaining', { amount: formatRp(ANNUAL_LEARNING_BUDGET - personalLearningCost) })
 : t('budget.exceeded', { amount: formatRp(personalLearningCost - ANNUAL_LEARNING_BUDGET) })}
 </p>
 </>
 )}
 </div>
 <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
 <div className="lg:col-span-1 bg-white rounded-xl shadow-sm border border-gray-100 p-6">
 <h2 className="text-lg font-semibold text-gray-800 mb-4">{t('form.newRequest')}</h2>
 <form onSubmit={handleRequestSubmit} className="space-y-4">
 <div>
 <label className="block text-sm font-medium text-gray-700 mb-1">{t('form.category')}</label>
 <select value={category} onChange={e => setCategory(e.target.value)} className="w-full px-4 py-2 bg-gray-50 border border-gray-200 rounded-lg">
 <option value="Sertifikat">{t('form.categoryCertificate')}</option>
 <option value="Training">{t('form.categoryTraining')}</option>
 <option value="Modul">{t('form.categoryModule')}</option>
 </select>
 </div>
 <div>
 <label className="block text-sm font-medium text-gray-700 mb-1">{t('form.titleLabel')} <span className="text-red-500">*</span></label>
 <input required type="text" value={title} onChange={e => setTitle(e.target.value)} className="w-full px-4 py-2 bg-gray-50 border border-gray-200 rounded-lg" placeholder={t('form.titlePlaceholder')} />
 </div>
 <div className="grid grid-cols-2 gap-4">
 <div>
 <label className="block text-sm font-medium text-gray-700 mb-1">{t('form.vendor')} <span className="text-red-500">*</span></label>
 <input required type="text" value={vendor} onChange={e => setVendor(e.target.value)} className="w-full px-4 py-2 bg-gray-50 border border-gray-200 rounded-lg" placeholder={t('form.vendorPlaceholder')} />
 </div>
 <div>
 <label className="block text-sm font-medium text-gray-700 mb-1">{t('form.location')} <span className="text-red-500">*</span></label>
 <input required type="text" value={location} onChange={e => setLocation(e.target.value)} className="w-full px-4 py-2 bg-gray-50 border border-gray-200 rounded-lg" placeholder={t('form.locationPlaceholder')} />
 </div>
 </div>
 <div>
 <label className="block text-sm font-medium text-gray-700 mb-1">{t('form.startDate')} <span className="text-red-500">*</span></label>
 <input required type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="w-full px-4 py-2 bg-gray-50 border border-gray-200 rounded-lg" />
 </div>
 <div>
 <label className="block text-sm font-medium text-gray-700 mb-1">{t('form.endDate')} <span className="text-red-500">*</span></label>
 <input required type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className="w-full px-4 py-2 bg-gray-50 border border-gray-200 rounded-lg" />
 </div>
 <div>
 <label className="block text-sm font-medium text-gray-700 mb-1">{t('form.registrationFee')}</label>
 <input
 type="text"
 value={regFee}
 onChange={e => {
 const rawValue = e.target.value.replace(/\D/g, '');
 if (rawValue === '') setRegFee('');
 else setRegFee(new Intl.NumberFormat('id-ID').format(Number(rawValue)));
 }}
 className="w-full px-4 py-2 bg-gray-50 border border-gray-200 rounded-lg"
 placeholder="0"
 />
 </div>
 <div>
 <label className="block text-sm font-medium text-gray-700 mb-1">{t('form.paymentMethod')}</label>
 <div className="grid grid-cols-2 gap-3">
 {(['Reimbursement', 'Direct Payment'] as const).map(method => (
 <button
 key={method}
 type="button"
 onClick={() => setPaymentMethod(method)}
 className={`py-2 rounded-lg text-sm font-medium border transition-colors ${
 paymentMethod === method
 ? 'bg-blue-600 text-white border-blue-600'
 : 'bg-gray-50 text-gray-600 border-gray-200 hover:border-blue-300'
 }`}
 >
 {method === 'Reimbursement' ? t('form.paymentMethodReimbursement') : t('form.paymentMethodDirectPayment')}
 </button>
 ))}
 </div>
 </div>
 <div>
 <label className="block text-sm font-medium text-gray-700 mb-1">{t('form.attachmentLink')}</label>
 <input
 type="file"
 accept="image/*,.pdf"
 onChange={e => setAttachmentFile(e.target.files ? e.target.files[0] : null)}
 className="w-full px-4 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm"
 />
 </div>
 <div>
 <label className="block text-sm font-medium text-gray-700 mb-1">{t('form.ccLabel')}</label>
 {selectedCcIds.length > 0 && (
 <div className="flex flex-wrap gap-1.5 mb-2">
 {selectedCcIds.map(id => {
 const opt = ccOptions.find(o => o.employeeId === id);
 return (
 <span key={id} className="inline-flex items-center gap-1 bg-indigo-50 text-indigo-700 text-xs font-semibold pl-2.5 pr-1 py-1 rounded-full">
 {opt?.fullName || id}
 <button type="button" onClick={() => setSelectedCcIds(prev => prev.filter(x => x !== id))} className="hover:bg-indigo-100 rounded-full p-0.5 transition-colors">
 <X size={11} />
 </button>
 </span>
 );
 })}
 </div>
 )}
 <div className="relative">
 <Users className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" size={16} />
 <input
 type="text"
 value={ccSearch}
 onFocus={() => setCcDropdownOpen(true)}
 onBlur={() => setTimeout(() => setCcDropdownOpen(false), 150)}
 onChange={e => { setCcSearch(e.target.value); setCcDropdownOpen(true); }}
 placeholder={t('form.ccPlaceholder')}
 className="w-full pl-9 pr-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm"
 />
 {ccDropdownOpen && (
 <div className="absolute z-20 mt-1 w-full max-h-56 overflow-y-auto bg-white border border-slate-100 rounded-lg shadow-lg divide-y divide-slate-50">
 {ccOptions
 .filter(o => o.employeeId !== currentUser?.employee_id)
 .filter(o => !ccSearch.trim() || o.fullName.toLowerCase().includes(ccSearch.trim().toLowerCase()))
 .slice(0, 30)
 .map(o => {
 const isChecked = selectedCcIds.includes(o.employeeId);
 return (
 // A real <label>/<input type="checkbox"> pair would blur this search input on
 // every pick (the label's click-forwarding focuses the checkbox as part of the
 // click event, not mousedown, so preventDefault on mousedown can't stop it) -
 // a plain button with a hand-drawn checkbox avoids that, keeping the dropdown
 // open across multiple picks.
 <button
 key={o.employeeId}
 type="button"
 onMouseDown={e => e.preventDefault()}
 onClick={() => setSelectedCcIds(prev => isChecked ? prev.filter(x => x !== o.employeeId) : [...prev, o.employeeId])}
 className="w-full flex items-center gap-2.5 text-left px-3 py-2 hover:bg-slate-50 transition-colors text-sm text-slate-700"
 >
 <span className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 ${isChecked ? 'bg-indigo-600 border-indigo-600' : 'border-slate-300'}`}>
 {isChecked && <Check size={12} className="text-white" strokeWidth={3} />}
 </span>
 <span className="truncate">{o.fullName}</span>
 </button>
 );
 })}
 </div>
 )}
 </div>
 </div>
 <button disabled={isLoading} type="submit" className="w-full py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors">
 {isLoading ? t('form.submitting') : t('form.submitRequest')}
 </button>
 </form>
 </div>
 <div className="lg:col-span-2 space-y-4">
 {requests.length === 0 ? (
 <div className="text-center py-12 bg-white rounded-xl border border-dashed border-gray-300 ">
 <BookOpen className="w-12 h-12 text-gray-400 mx-auto mb-3" />
 <p className="text-gray-500">{t('empty.noRequests')}</p>
 </div>
 ) : (
 requests.map(req => (
 <div key={req.id} className="bg-white p-5 rounded-xl shadow-sm border border-gray-100 flex flex-col gap-4">
 <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
 <div>
 <div className="flex items-center gap-2 mb-1">
 <span className="px-2.5 py-0.5 rounded-full text-xs font-medium bg-indigo-100 text-indigo-800 ">
 {t(`categoryLabels.${req.category}`, { defaultValue: req.category })}
 </span>
 <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium ${
 req.status === 'Processed' ? 'bg-green-100 text-green-800' :
 req.status === 'Approved' ? 'bg-indigo-100 text-indigo-800' :
 req.status === 'Rejected' ? 'bg-red-100 text-red-800' :
 'bg-amber-100 text-amber-800'
 }`}>
 {getStatusLabel(req.status, req.leader_name)}
 </span>
 </div>
 <h3 className="font-semibold text-gray-800 text-lg">{req.title}</h3>
 <div className="flex items-center gap-4 text-sm text-gray-500 mt-2">
 <span className="flex items-center gap-1"><Calendar className="w-4 h-4"/> {req.start_date ? new Date(req.start_date).toLocaleDateString() : '-'}</span>
 <span className="flex items-center gap-1"><Wallet className="w-4 h-4"/> {t('request.registrationLabel', { amount: formatRp(req.registration_fee || 0) })}</span>
 </div>
 </div>
 {req.status === 'Processed' && req.payment_method && (
 <div className="text-right">
 <p className="text-sm text-gray-500">{t('request.paymentVia')}</p>
 <p className="font-medium text-gray-800 ">{req.payment_method}</p>
 </div>
 )}
 </div>

 <button
 type="button"
 onClick={() => toggleRequestDetail(req.id)}
 className="flex items-center gap-1.5 text-xs font-semibold text-indigo-600 hover:text-indigo-700 w-fit"
 >
 <ChevronDown className={`w-4 h-4 transition-transform ${expandedRequestIds.has(req.id) ? 'rotate-180' : ''}`} />
 {expandedRequestIds.has(req.id) ? t('request.hideDetail') : t('request.showDetail')}
 </button>

 {expandedRequestIds.has(req.id) && renderRequestDetail(req)}

 {req.status === 'Rejected' && req.rejection_reason && (
 <div className="p-3 bg-red-50 border border-red-100 rounded-lg text-sm text-red-700 w-full">
 <span className="font-semibold block mb-1">{t('request.rejectionReasonLabel')}</span>
 <p>{req.rejection_reason}</p>
 </div>
 )}
 {req.approval_note && (
 <div className="p-3 bg-emerald-50 border border-emerald-100 rounded-lg text-sm text-emerald-700 w-full">
 <span className="font-semibold block mb-1">{t('request.approvalNoteLabel')}</span>
 <p>{req.approval_note}</p>
 </div>
 )}
 {req.budget_notice_message && (
 <div className="p-3 bg-amber-50 border border-amber-100 rounded-lg text-sm text-amber-700 w-full">
 <p>{req.budget_notice_message}</p>
 </div>
 )}
 </div>
 ))
 )}
 </div>
 </div>
 </div>
 )}

 {/* Team Approvals Tab */}
 {activeTab === 'team_approvals' && (
 <div className="space-y-6">
 {teamRequests.length === 0 ? (
 <div className="text-center py-16 bg-gradient-to-b from-slate-50 to-white rounded-3xl border border-dashed border-slate-300">
 <div className="bg-white w-16 h-16 rounded-2xl shadow-sm flex items-center justify-center mx-auto mb-4 border border-slate-100">
 <CheckCircle className="w-8 h-8 text-emerald-500" />
 </div>
 <h3 className="text-lg font-semibold text-slate-800 mb-1">{t('empty.allCaughtUpTitle')}</h3>
 <p className="text-slate-500 max-w-sm mx-auto">{t('empty.allCaughtUpMessage')}</p>
 </div>
 ) : (
 <div className="grid gap-6">
 {teamRequests.map(req => (
 <div key={req.id} className="group bg-white rounded-3xl p-6 shadow-sm hover:shadow-xl transition-all duration-300 border border-slate-100 hover:border-blue-100 flex flex-col md:flex-row justify-between gap-6 relative overflow-hidden">
 {/* Decorative background element */}
 <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-bl from-blue-50 to-transparent rounded-bl-full opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none"></div>
 
 <div className="flex-1 relative z-10">
 <div className="flex items-center gap-3 mb-4">
 <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-blue-600 to-indigo-600 flex items-center justify-center text-white shadow-md">
 <span className="font-bold text-sm">{req.employee_name?.charAt(0) || 'U'}</span>
 </div>
 <div>
 <p className="text-sm font-semibold text-slate-800">{req.employee_name}</p>
 <p className="text-xs text-slate-500 font-medium">{t('team.idLabel', { id: req.employee_id })}</p>
 </div>
 <div className="ml-auto flex gap-2">
 <span className="px-3 py-1 rounded-full text-xs font-semibold bg-slate-100 text-slate-600 border border-slate-200">
 {t(`categoryLabels.${req.category}`, { defaultValue: req.category })}
 </span>
 <span className={`px-3 py-1 rounded-full text-xs font-bold border ${
 req.status === 'Pending' ? 'bg-amber-50 text-amber-700 border-amber-200 shadow-[0_0_10px_rgba(251,191,36,0.2)]' :
 req.status === 'Approved' ? 'bg-indigo-50 text-indigo-700 border-indigo-200' :
 req.status === 'Rejected' ? 'bg-rose-50 text-rose-700 border-rose-200' :
 'bg-emerald-50 text-emerald-700 border-emerald-200'
 }`}>
 {getStatusLabel(req.status)}
 </span>
 </div>
 </div>
 
 <h3 className="font-bold text-slate-800 text-xl mb-4 group-hover:text-blue-700 transition-colors">{req.title}</h3>
 
 <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
 <div className="bg-slate-50 rounded-2xl p-4 border border-slate-100/50">
 <p className="text-xs text-slate-500 mb-1 font-medium flex items-center gap-1.5"><Calendar className="w-3.5 h-3.5"/> {t('team.schedule')}</p>
 <p className="text-sm font-semibold text-slate-700">{req.start_date ? new Date(req.start_date).toLocaleDateString('en-GB', {day: 'numeric', month: 'short', year: 'numeric'}) : '-'} &mdash; {req.end_date ? new Date(req.end_date).toLocaleDateString('en-GB', {day: 'numeric', month: 'short', year: 'numeric'}) : '-'}</p>
 </div>
 <div className="bg-slate-50 rounded-2xl p-4 border border-slate-100/50">
 <p className="text-xs text-slate-500 mb-1 font-medium flex items-center gap-1.5"><Wallet className="w-3.5 h-3.5"/> {t('team.registrationFee')}</p>
 <p className="text-sm font-bold text-slate-800">{formatRp(req.registration_fee || 0)}</p>
 </div>
 {req.vendor && (
 <div className="bg-slate-50 rounded-2xl p-4 border border-slate-100/50">
 <p className="text-xs text-slate-500 mb-1 font-medium flex items-center gap-1.5"><Briefcase className="w-3.5 h-3.5"/> {t('team.vendor')}</p>
 <p className="text-sm font-semibold text-slate-700">{req.vendor}</p>
 </div>
 )}
 {req.attachment_link && (
 <div className="bg-blue-50/50 rounded-2xl p-4 border border-blue-100/50 flex items-center">
 <a href={req.attachment_link} target="_blank" rel="noreferrer" className="text-blue-600 hover:text-blue-700 font-semibold text-sm flex items-center gap-2 group/link">
 <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center group-hover/link:bg-blue-200 transition-colors">
 <Link className="w-4 h-4"/>
 </div>
 {t('team.viewAttachment')}
 </a>
 </div>
 )}
 </div>

 <button
 type="button"
 onClick={() => toggleRequestDetail(req.id)}
 className="flex items-center gap-1.5 text-xs font-semibold text-indigo-600 hover:text-indigo-700 w-fit mt-4"
 >
 <ChevronDown className={`w-4 h-4 transition-transform ${expandedRequestIds.has(req.id) ? 'rotate-180' : ''}`} />
 {expandedRequestIds.has(req.id) ? t('request.hideDetail') : t('request.showDetail')}
 </button>

 {expandedRequestIds.has(req.id) && renderRequestDetail(req)}

 {req.status === 'Rejected' && req.rejection_reason && (
 <div className="mt-4 p-3 bg-red-50 border border-red-100 rounded-lg text-sm text-red-700">
 <span className="font-semibold block mb-1">{t('request.rejectionReasonLabel')}</span>
 <p>{req.rejection_reason}</p>
 </div>
 )}
 {req.approval_note && (
 <div className="mt-4 p-3 bg-emerald-50 border border-emerald-100 rounded-lg text-sm text-emerald-700">
 <span className="font-semibold block mb-1">{t('request.approvalNoteLabel')}</span>
 <p>{req.approval_note}</p>
 </div>
 )}
 {req.budget_notice_message && (
 <div className="mt-4 p-3 bg-amber-50 border border-amber-100 rounded-lg text-sm text-amber-700">
 <p>{req.budget_notice_message}</p>
 </div>
 )}
 </div>

 <div className="flex flex-row md:flex-col gap-3 md:justify-center items-center md:items-stretch md:pl-6 md:border-l border-slate-100 relative z-10">
 {req.status === 'Pending' ? (
 <>
 <button onClick={() => { setSelectedRequestId(req.id); setApproveModalOpen(true); }} className="flex-1 md:flex-none px-6 py-3 bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-600 hover:to-emerald-700 text-white rounded-xl font-bold flex items-center justify-center gap-2 shadow-lg shadow-emerald-500/30 transition-all hover:-translate-y-0.5">
 <CheckCircle className="w-5 h-5"/> {t('team.approve')}
 </button>
 <button onClick={() => { setSelectedRequestId(req.id); setRejectModalOpen(true); }} className="flex-1 md:flex-none px-6 py-3 bg-white text-rose-600 hover:bg-rose-50 hover:text-rose-700 border border-rose-200 rounded-xl font-bold flex items-center justify-center gap-2 transition-all hover:-translate-y-0.5 shadow-sm">
 <XCircle className="w-5 h-5"/> {t('team.reject')}
 </button>
 </>
 ) : (
 <div className="text-center p-4 bg-slate-50 rounded-2xl border border-slate-100 w-full md:w-32">
 <p className="text-xs text-slate-500 font-medium mb-1">{t('team.statusLabel')}</p>
 <p className={`font-bold ${req.status === 'Rejected' ? 'text-rose-600' : req.status === 'Approved' ? 'text-indigo-600' : 'text-emerald-600'}`}>{getStatusLabel(req.status)}</p>
 </div>
 )}
 </div>
 </div>
 ))
 }
 </div>
 )}
 </div>
 )}
 {/* HR Processing Tab */}

 
            {/* Rejection Modal */}
            {rejectModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
                    <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6">
                        <h3 className="text-xl font-bold text-slate-800 mb-2">{t('rejectModal.title')}</h3>
                        <p className="text-slate-500 text-sm mb-4">{t('rejectModal.subtitle')}</p>
                        <textarea
                            className="w-full border border-slate-300 rounded-xl p-3 focus:ring-2 focus:ring-rose-500 focus:border-rose-500 outline-none resize-none"
                            rows={4}
                            placeholder={t('rejectModal.placeholder')}
                            value={rejectionReason}
                            onChange={(e) => setRejectionReason(e.target.value)}
                        />
                        <div className="flex gap-3 mt-6">
                            <button
                                onClick={() => { setRejectModalOpen(false); setRejectionReason(''); setSelectedRequestId(null); }}
                                className="flex-1 px-4 py-2.5 rounded-xl border border-slate-300 text-slate-700 font-medium hover:bg-slate-50 transition-colors"
                            >
                                {t('rejectModal.cancel')}
                            </button>
                            <button
                                onClick={confirmReject}
                                disabled={!rejectionReason.trim()}
                                className="flex-1 px-4 py-2.5 rounded-xl bg-rose-600 text-white font-medium hover:bg-rose-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                            >
                                {t('rejectModal.confirmReject')}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Approve Modal - a note explaining the approval is required, same as reject's reason */}
            {approveModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
                    <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6">
                        <h3 className="text-xl font-bold text-slate-800 mb-2 flex items-center gap-2">
                            <MessageSquare className="w-5 h-5 text-emerald-600" /> {t('approveModal.title')}
                        </h3>
                        <p className="text-slate-500 text-sm mb-4">{t('approveModal.subtitle')}</p>
                        <textarea
                            className="w-full border border-slate-300 rounded-xl p-3 focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none resize-none"
                            rows={4}
                            placeholder={t('approveModal.placeholder')}
                            value={approveNoteDraft}
                            onChange={(e) => setApproveNoteDraft(e.target.value)}
                        />
                        <div className="flex gap-3 mt-6">
                            <button
                                onClick={() => { setApproveModalOpen(false); setApproveNoteDraft(''); setSelectedRequestId(null); }}
                                className="flex-1 px-4 py-2.5 rounded-xl border border-slate-300 text-slate-700 font-medium hover:bg-slate-50 transition-colors"
                            >
                                {t('approveModal.cancel')}
                            </button>
                            <button
                                onClick={confirmApprove}
                                disabled={!approveNoteDraft.trim()}
                                className="flex-1 px-4 py-2.5 rounded-xl bg-emerald-600 text-white font-medium hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                            >
                                {t('approveModal.confirmApprove')}
                            </button>
                        </div>
                    </div>
                </div>
            )}

 </div>
 );
}