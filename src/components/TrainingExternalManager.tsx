import { useState, useEffect, useRef } from 'react';
import {
    Search,
    XCircle,
    CheckCircle2,
    FileText,
    Wallet,
    Calendar,
    Trash2,
    Filter,
    Users,
    Clock,
    Briefcase,
    Link,
    Award,
    AlertTriangle,
    Download,
    UploadCloud,
    CreditCard,
    Tag,
    ChevronDown,
    ChevronUp
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { useTranslation } from 'react-i18next';
import { API_BASE_URL } from '../config';
import type { TrainingRequest } from '../types';
import ConfirmationModal from './ConfirmationModal';

const resolveFileUrl = (link?: string | null) => {
    if (!link) return undefined;
    return link.startsWith('/') ? `${API_BASE_URL}${link}` : link;
};

const getStatusColor = (status: string) => {
    switch (status) {
        case 'APPROVED': return 'bg-emerald-50 text-emerald-700 border-emerald-100';
        case 'REJECTED': return 'bg-rose-50 text-rose-700 border-rose-100';
        case 'PENDING_HR': return 'bg-indigo-50 text-indigo-700 border-indigo-100';
        default: return 'bg-amber-50 text-amber-700 border-amber-100';
    }
};

// The `category` value in the database is inconsistent: manual "New Request" submissions store the raw
// key ('Sertifikat'/'Training'/'Modul'), while bulk Excel imports store whatever free-text label was in
// the spreadsheet's "Kategori" column (e.g. "Training with Certification"). Normalize every known variant
// down to the 3 canonical keys so filtering and display both work regardless of which path created the row.
const normalizeCategory = (raw: string | null | undefined): 'Sertifikat' | 'Training' | 'Modul' => {
    const v = (raw || '').trim().toLowerCase();
    if (v === 'sertifikat' || v.includes('with certification') || v.includes('dengan sertifikasi')) return 'Sertifikat';
    if (v === 'modul' || v.includes('modul') || v.includes('module') || v.includes('self-paced') || v.includes('mandiri')) return 'Modul';
    return 'Training';
};

const StatusBadge = ({ status }: { status: string }) => {
    const { t } = useTranslation('trainingExternalManager');
    const labels: Record<string, string> = {
        'APPROVED': t('statusBadge.approved'),
        'REJECTED': t('statusBadge.rejected'),
        'PENDING_HR': t('statusBadge.reviewHr'),
        'PENDING_SUPERVISOR': t('statusBadge.reviewSupervisor')
    };
    return (
        <span className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider border ${getStatusColor(status)}`}>
            {labels[status] || status}
        </span>
    );
};

const TrainingExternalManager = ({ userRole, userName, user }: { userRole: string; userName?: string; user?: any }) => {
    const { t } = useTranslation('trainingExternalManager');
    // --- Data State ---
    const [requests, setRequests] = useState<TrainingRequest[]>([]);
    const [employees, setEmployees] = useState<any[]>([]);
    const [expandedRequestIds, setExpandedRequestIds] = useState<Set<number>>(new Set());
    const toggleRequestDetail = (id: number) => {
        setExpandedRequestIds(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id); else next.add(id);
            return next;
        });
    };

    // --- Filter State ---
    const [selectedYear, setSelectedYear] = useState<number | 'All'>(new Date().getFullYear());
    const [selectedPeriod, setSelectedPeriod] = useState<string>('All Year');
    const [selectedBranch, setSelectedBranch] = useState<string>('All Branches');
    const [branches, setBranches] = useState<string[]>(['All Branches']);
    const [selectedCategory, setSelectedCategory] = useState<string>('All Categories');
    const categoryOptions = ['Sertifikat', 'Training', 'Modul'];
    const [searchQuery, setSearchQuery] = useState('');
    const [statusDrilldown, setStatusDrilldown] = useState<'PENDING' | 'APPROVED' | null>(null);
    const [deleteTargetId, setDeleteTargetId] = useState<number | null>(null);
    const [isImporting, setIsImporting] = useState(false);
    const importFileInputRef = useRef<HTMLInputElement>(null);

    const fetchRequests = async () => {
        try {
            const trainRes = await fetch(`${API_BASE_URL}/api/external-training/all`);
            if (trainRes.ok) {
                const rawData = await trainRes.json();
                const mapped = rawData.map((req: any) => ({
                    id: req.id,
                    employeeName: req.employee_name,
                    employeeRole: normalizeCategory(req.category),
                    title: req.title,
                    vendor: req.vendor || t('common.notAvailable'),
                    location: req.location || t('common.notAvailable'),
                    cost: Number(req.registration_fee || 0) + Number(req.travel_flight_cost || 0) + Number(req.accommodation_cost || 0) + Number(req.miscellaneous_cost || 0),
                    // The card badge (and the Year/Period filter) should reflect when the training actually
                    // happened, not when the record was created — those diverge for bulk-imported historical
                    // data, which all gets the same created_at ("today") regardless of the real training date.
                    date: req.start_date || req.created_at || new Date().toISOString(),
                    status: req.status === 'Processed' ? 'APPROVED' : (req.status === 'Approved' ? 'PENDING_HR' : (req.status === 'Pending' ? 'PENDING_SUPERVISOR' : 'REJECTED')),
                    justification: t('requestModal.dateRange', {
                        start: req.start_date ? new Date(req.start_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '',
                        end: req.end_date ? new Date(req.end_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : ''
                    }),
                    costTraining: req.registration_fee || 0,
                    costTransport: req.travel_flight_cost || 0,
                    costAccommodation: req.accommodation_cost || 0,
                    costOthers: req.miscellaneous_cost || 0,
                    evidenceUrl: resolveFileUrl(req.certificate_link || req.attachment_link),
                    renewalCertificateUrl: resolveFileUrl(req.renewal_certificate_link),
                    hrName: req.status === 'Processed' ? (req.hr_name || t('common.hrProcessed')) : '',
                    supervisorName: req.approved_by,
                    employee_id: req.employee_id,
                    certificateExpiryDate: req.certificate_expiry_date,
                    originalCertificateExpiryDate: req.original_certificate_expiry_date,
                    incentiveReward: req.incentive_reward ? Number(req.incentive_reward) : undefined,
                    incentivePaymentType: req.incentive_payment_type,
                    _original: req
                }));
                setRequests(mapped);
            }
        } catch (err) { console.error(err); }
    };

    // --- Data Loading ---
    useEffect(() => {
        const loadInitialData = async () => {
            const [trainRes, empRes, branchRes] = await Promise.all([
                fetch(`${API_BASE_URL}/api/external-training/all`),
                fetch(`${API_BASE_URL}/api/employees`),
                fetch(`${API_BASE_URL}/api/branches`)
            ]);

            if (trainRes.ok) {
                const rawData = await trainRes.json();
                const mapped = rawData.map((req: any) => ({
                    id: req.id,
                    employeeName: req.employee_name,
                    employeeRole: normalizeCategory(req.category),
                    title: req.title,
                    vendor: req.vendor || t('common.notAvailable'),
                    location: req.location || t('common.notAvailable'),
                    cost: Number(req.registration_fee || 0) + Number(req.travel_flight_cost || 0) + Number(req.accommodation_cost || 0) + Number(req.miscellaneous_cost || 0),
                    // The card badge (and the Year/Period filter) should reflect when the training actually
                    // happened, not when the record was created — those diverge for bulk-imported historical
                    // data, which all gets the same created_at ("today") regardless of the real training date.
                    date: req.start_date || req.created_at || new Date().toISOString(),
                    status: req.status === 'Processed' ? 'APPROVED' : (req.status === 'Approved' ? 'PENDING_HR' : (req.status === 'Pending' ? 'PENDING_SUPERVISOR' : 'REJECTED')),
                    justification: t('requestModal.dateRange', {
                        start: req.start_date ? new Date(req.start_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '',
                        end: req.end_date ? new Date(req.end_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : ''
                    }),
                    costTraining: req.registration_fee || 0,
                    costTransport: req.travel_flight_cost || 0,
                    costAccommodation: req.accommodation_cost || 0,
                    costOthers: req.miscellaneous_cost || 0,
                    evidenceUrl: resolveFileUrl(req.certificate_link || req.attachment_link),
                    renewalCertificateUrl: resolveFileUrl(req.renewal_certificate_link),
                    hrName: req.status === 'Processed' ? (req.hr_name || t('common.hrProcessed')) : '',
                    supervisorName: req.approved_by,
                    employee_id: req.employee_id,
                    certificateExpiryDate: req.certificate_expiry_date,
                    originalCertificateExpiryDate: req.original_certificate_expiry_date,
                    incentiveReward: req.incentive_reward ? Number(req.incentive_reward) : undefined,
                    incentivePaymentType: req.incentive_payment_type,
                    _original: req
                }));
                setRequests(mapped);
            }
            if (empRes.ok) setEmployees(await empRes.json());
            if (branchRes.ok) {
                const bData = await branchRes.json();
                if (Array.isArray(bData)) {
                    setBranches(['All Branches', ...bData.map((b: any) => b.name)]);
                }
            }
        };
        loadInitialData();
    }, []);

    // --- Modal State ---
    const [selectedRequest, setSelectedRequest] = useState<TrainingRequest | null>(null);
    const [hrCertificateFile, setHrCertificateFile] = useState<File | null>(null);
    const [hrCertificateExpiryDate, setHrCertificateExpiryDate] = useState('');
    const [hrCertificationResult, setHrCertificationResult] = useState<'Passed' | 'Not Passed'>('Passed');

    // Certificate Renewal State (HR-only: extends an already-processed certificate's expiry date)
    const [renewTarget, setRenewTarget] = useState<TrainingRequest | null>(null);
    const [renewExpiryDate, setRenewExpiryDate] = useState('');
    const [renewGrantIncentive, setRenewGrantIncentive] = useState(false);
    const [renewIncentiveReward, setRenewIncentiveReward] = useState('');
    const [renewIncentivePaymentType, setRenewIncentivePaymentType] = useState<'One-Time' | 'Recurring'>('One-Time');
    const [renewCertificateFile, setRenewCertificateFile] = useState<File | null>(null);

    const openRenewModal = (req: TrainingRequest) => {
        setRenewTarget(req);
        setRenewExpiryDate(req.certificateExpiryDate ? req.certificateExpiryDate.slice(0, 10) : '');
        setRenewGrantIncentive(false);
        setRenewIncentiveReward('');
        setRenewIncentivePaymentType('One-Time');
        setRenewCertificateFile(null);
    };

    const handleRenewCertificate = async () => {
        if (!renewTarget || !renewExpiryDate || !renewCertificateFile) return;
        try {
            let renewalCertificateLink: string | undefined;
            if (renewCertificateFile) {
                const formData = new FormData();
                formData.append('file', renewCertificateFile);
                const uploadRes = await fetch(`${API_BASE_URL}/api/upload`, {
                    method: 'POST',
                    body: formData
                });
                if (uploadRes.ok) {
                    const uploadData = await uploadRes.json();
                    renewalCertificateLink = uploadData.fileUrl;
                }
            }
            const res = await fetch(`${API_BASE_URL}/api/external-training/renew-certificate`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    id: renewTarget.id,
                    certificate_expiry_date: renewExpiryDate,
                    incentive_reward: renewGrantIncentive ? renewIncentiveReward : undefined,
                    incentive_payment_type: renewGrantIncentive ? renewIncentivePaymentType : undefined,
                    renewal_certificate_link: renewalCertificateLink
                })
            });
            if (res.ok && renewGrantIncentive && renewIncentiveReward) {
                await fetch(`${API_BASE_URL}/api/incentives`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        employeeName: renewTarget.employeeName,
                        employee_id: renewTarget.employee_id,
                        courseName: renewTarget.title,
                        description: t('requestModal.renewIncentiveAutoDescription', { vendor: renewTarget.vendor }),
                        startDate: new Date().toISOString(),
                        endDate: renewExpiryDate,
                        status: 'Active',
                        reward: renewIncentiveReward,
                        paymentType: renewIncentivePaymentType
                    })
                });
            }
            if (res.ok) {
                await fetchRequests();
                setRenewTarget(null);
                if (selectedRequest?.id === renewTarget.id) setSelectedRequest(null);
            }
        } catch (err) { console.error(err); }
    };

    // Cost Breakdown State
    const [breakdownCost, setBreakdownCost] = useState({
        training: 0,
        transport: 0,
        accommodation: 0,
        others: 0
    });
    const [hrPaymentMethod, setHrPaymentMethod] = useState<'Reimbursement' | 'Direct Payment'>('Reimbursement');
    const [hrGrantIncentive, setHrGrantIncentive] = useState(false);
    const [hrIncentiveReward, setHrIncentiveReward] = useState('');
    const [hrIncentivePaymentType, setHrIncentivePaymentType] = useState<'One-Time' | 'Recurring'>('One-Time');

    // HR correction fields - lets HR fix data submitted by the employee before processing
    const [hrEditTitle, setHrEditTitle] = useState('');
    const [hrEditVendor, setHrEditVendor] = useState('');
    const [hrEditLocation, setHrEditLocation] = useState('');
    const [hrEditStartDate, setHrEditStartDate] = useState('');
    const [hrEditEndDate, setHrEditEndDate] = useState('');
    const [hrEditGriType, setHrEditGriType] = useState('');
    const [hrEditParticipationType, setHrEditParticipationType] = useState('');
    const [hrEditLearningHours, setHrEditLearningHours] = useState('');

    const toDateValue = (v: any) => {
        if (!v) return '';
        const d = new Date(v);
        if (isNaN(d.getTime())) return '';
        const pad = (n: number) => String(n).padStart(2, '0');
        return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    };

    useEffect(() => {
        if (selectedRequest) {
            setBreakdownCost({
                training: Number(selectedRequest.costTraining) || 0,
                transport: Number(selectedRequest.costTransport) || 0,
                accommodation: Number(selectedRequest.costAccommodation) || 0,
                others: Number(selectedRequest.costOthers) || 0
            });
            setHrPaymentMethod(selectedRequest._original?.payment_method === 'Direct Payment' ? 'Direct Payment' : 'Reimbursement');
            const expiry = selectedRequest._original?.certificate_expiry_date;
            setHrCertificateExpiryDate(expiry ? String(expiry).slice(0, 10) : '');
            setHrCertificationResult(selectedRequest._original?.certification_result === 'Not Passed' ? 'Not Passed' : 'Passed');
            setHrCertificateFile(null);
            setHrGrantIncentive(false);
            setHrIncentiveReward('');
            setHrIncentivePaymentType('One-Time');
            setHrEditTitle(selectedRequest.title || '');
            setHrEditVendor(selectedRequest._original?.vendor || '');
            setHrEditLocation(selectedRequest._original?.location || '');
            setHrEditStartDate(toDateValue(selectedRequest._original?.start_date));
            setHrEditEndDate(toDateValue(selectedRequest._original?.end_date));
            setHrEditGriType(selectedRequest._original?.training_gr_type || '');
            setHrEditParticipationType(selectedRequest._original?.participation_type || '');
            setHrEditLearningHours(selectedRequest._original?.learning_hours != null ? String(selectedRequest._original.learning_hours) : '');
        }
    }, [selectedRequest]);

    const [isSettlementOpen, setIsSettlementOpen] = useState(false);
    const [settleCertificate, setSettleCertificate] = useState<File | null>(null);
    const [settleData, setSettleData] = useState({
        training: 0,
        transport: 0,
        accommodation: 0,
        others: 0,
        settlementNotes: ''
    });

    const periodOptions = [
        "All Year",
        "Q1 (Jan-Mar)", "Q2 (Apr-Jun)", "Q3 (Jul-Sep)", "Q4 (Oct-Dec)",
        "Semester 1 (Jan-Jun)", "Semester 2 (Jul-Dec)",
        "January", "February", "March", "April", "May", "June",
        "July", "August", "September", "October", "November", "December"
    ];

    const getPeriodDates = () => {
        // "ALL YEARS" + "All Year" period means no date restriction at all — previously this silently
        // fell back to the current year's range, so anything outside it (e.g. historical imported data)
        // vanished from the list even with "All Years" selected.
        if (selectedYear === 'All' && selectedPeriod === 'All Year') {
            return [new Date(0), new Date(8640000000000000)];
        }
        const year = selectedYear === 'All' ? new Date().getFullYear() : selectedYear;
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
            const monthIdx = new Date(`${selectedPeriod} 1, ${year}`).getMonth();
            if (!isNaN(monthIdx)) {
                start = new Date(year, monthIdx, 1);
                end = new Date(year, monthIdx + 1, 0, 23, 59, 59);
            }
        }
        return [start, end];
    };

    const filteredRequests = requests.filter(req => {
        const d = new Date(req.date);
        const [start, end] = getPeriodDates();

        if (selectedYear !== 'All' && d.getFullYear() !== selectedYear) return false;
        if (d < start || d > end) return false;

        const emp = employees.find(e =>
            (req.employee_id && e.id_employee === req.employee_id) ||
            (req.employeeName && e.full_name && e.full_name.trim().toLowerCase() === req.employeeName.trim().toLowerCase())
        );

        // If the logged-in user is a supervisor (and not HR), only show requests of their subordinates
        if (userRole === 'SUPERVISOR' && user && !user.role.includes('HR')) {
            if (!emp) return false;
            const supervisorId = user.employee_id || '___INVALID___';
            const supervisorName = user.name || '___INVALID___';
            const supervisorEmailPrefix = user.email ? user.email.split('@')[0] : '___INVALID___';
            const supervisorEmail = user.email || '___INVALID___';
            const reportsTo = emp.id_report_to;
            if (!reportsTo) return false;

            const isMySubordinate = 
                reportsTo === supervisorId || 
                reportsTo === supervisorName || 
                reportsTo.toLowerCase() === supervisorEmailPrefix.toLowerCase() || 
                reportsTo.toLowerCase() === supervisorEmail.toLowerCase();

            if (!isMySubordinate) return false;
        }

        const empBranch = emp?.branch_name || 'Others';

        if (selectedBranch !== 'All Branches' && empBranch !== selectedBranch) return false;

        if (selectedCategory !== 'All Categories' && req.employeeRole !== selectedCategory) return false;

        const lowerSearch = searchQuery.toLowerCase();
        return (
            (req.employeeName || '').toLowerCase().includes(lowerSearch) ||
            (req.title || '').toLowerCase().includes(lowerSearch) ||
            (req.vendor || '').toLowerCase().includes(lowerSearch)
        );
    });

    const drilldownFiltered = filteredRequests.filter(req => {
        if (statusDrilldown === 'PENDING') return req.status.startsWith('PENDING');
        if (statusDrilldown === 'APPROVED') return req.status === 'APPROVED';
        return true;
    });

    // Own PENDING requests are hidden from the actionable list (to avoid self-approval),
    // but resolved ones (APPROVED/REJECTED) stay visible so HR can still see their own history.
    // Own requests still count toward the aggregate stats above regardless of status.
    const visibleRequests = drilldownFiltered
        .filter(req => !(req.employeeName === userName && req.status.startsWith('PENDING')))
        .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    const onlyOwnRequestsHidden = statusDrilldown !== null && visibleRequests.length === 0 && drilldownFiltered.length > 0;


    const formatCurrency = (amount: number) => {
        return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(amount);
    };

    const handleApprove = async () => {
        if (!selectedRequest) return;

        try {
            if (!hrEditTitle.trim()) {
                alert(t('alerts.titleRequired'));
                return;
            }
            if (!hrEditVendor.trim()) {
                alert(t('alerts.vendorRequired'));
                return;
            }
            if (!hrEditLocation.trim()) {
                alert(t('alerts.locationRequired'));
                return;
            }
            if (!hrEditStartDate) {
                alert(t('alerts.startDateRequired'));
                return;
            }
            if (!hrEditEndDate) {
                alert(t('alerts.endDateRequired'));
                return;
            }
            if (!hrEditGriType) {
                alert(t('alerts.griTypeRequired'));
                return;
            }
            if (!hrEditParticipationType) {
                alert(t('alerts.participationTypeRequired'));
                return;
            }
            if (!hrEditLearningHours || Number(hrEditLearningHours) <= 0) {
                alert(t('alerts.learningHoursRequired'));
                return;
            }
            let certLink = selectedRequest?._original?.certificate_link;
            const isCertificateCategory = selectedRequest?.employeeRole === 'Sertifikat';
            const requiresCertificateProof = isCertificateCategory && hrCertificationResult === 'Passed';
            if (requiresCertificateProof && !certLink && !hrCertificateFile) {
                alert(t('alerts.certificateEvidenceRequired'));
                return;
            }
            if (requiresCertificateProof && !hrCertificateExpiryDate) {
                alert(t('alerts.certificateExpiryRequired'));
                return;
            }
            if (requiresCertificateProof && hrGrantIncentive && !hrIncentiveReward) {
                alert(t('alerts.incentiveRewardRequired'));
                return;
            }
            if (hrCertificateFile) {
                const formData = new FormData();
                formData.append('file', hrCertificateFile);
                const uploadRes = await fetch(`${API_BASE_URL}/api/upload`, {
                    method: 'POST',
                    body: formData
                });
                if (uploadRes.ok) {
                    const uploadData = await uploadRes.json();
                    certLink = uploadData.fileUrl;
                }
            }
            const res = await fetch(`${API_BASE_URL}/api/external-training/hr-process`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    id: selectedRequest.id,
                    travel_flight_cost: breakdownCost.transport,
                    accommodation_cost: breakdownCost.accommodation,
                    miscellaneous_cost: breakdownCost.others,
                    payment_method: hrPaymentMethod,
                    registration_fee: breakdownCost.training,
                    hr_name: userName,
                    certificate_link: certLink,
                    certificate_expiry_date: requiresCertificateProof ? hrCertificateExpiryDate : undefined,
                    certification_result: isCertificateCategory ? hrCertificationResult : undefined,
                    incentive_reward: (requiresCertificateProof && hrGrantIncentive) ? hrIncentiveReward : undefined,
                    incentive_payment_type: (requiresCertificateProof && hrGrantIncentive) ? hrIncentivePaymentType : undefined,
                    title: hrEditTitle,
                    vendor: hrEditVendor,
                    location: hrEditLocation,
                    start_date: hrEditStartDate,
                    end_date: hrEditEndDate,
                    training_gr_type: hrEditGriType || null,
                    participation_type: hrEditParticipationType || null,
                    learning_hours: hrEditLearningHours ? Number(hrEditLearningHours) : null
                })
            });
            if (res.ok && requiresCertificateProof && hrGrantIncentive) {
                await fetch(`${API_BASE_URL}/api/incentives`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        employeeName: selectedRequest.employeeName,
                        employee_id: selectedRequest.employee_id,
                        courseName: selectedRequest.title,
                        description: t('requestModal.incentiveAutoDescription', { vendor: selectedRequest.vendor }),
                        startDate: selectedRequest._original?.start_date || new Date().toISOString(),
                        endDate: hrCertificateExpiryDate,
                        evidenceUrl: certLink,
                        status: 'Active',
                        reward: hrIncentiveReward,
                        paymentType: hrIncentivePaymentType
                    })
                });
            }
            if (res.ok) {
                await fetchRequests();
                setSelectedRequest(null);
            }
        } catch (err) {
            console.error("Action failed", err);
        }
    };

    const handleDeleteRequest = (id: number) => {
        setDeleteTargetId(id);
    };

    const confirmDeleteRequest = async () => {
        if (deleteTargetId === null) return;
        const id = deleteTargetId;
        try {
            const res = await fetch(`${API_BASE_URL}/api/external-training/${id}`, { method: 'DELETE' });
            if (res.ok) {
                setRequests(requests.filter(r => r.id !== id));
            }
        } catch (err) { console.error(err); }
    };

    const handleOpenSettlement = (req: TrainingRequest) => {
        setSettleData({
            training: Number(req.costTraining) || Number(req.cost) || 0,
            transport: Number(req.costTransport) || 0,
            accommodation: Number(req.costAccommodation) || 0,
            others: Number(req.costOthers) || 0,
            settlementNotes: req.rejectionReason || ''
        });
        setIsSettlementOpen(true);
        setSettleCertificate(null);
    };

    const handleSaveSettlement = async () => {
        if (!selectedRequest) return;
        try {
            const newTotal = settleData.training + settleData.transport + settleData.accommodation + settleData.others;
            const excess = Math.max(0, newTotal - (selectedRequest.cost || 0));

            let certLink = undefined;
            if (settleCertificate) {
                const formData = new FormData();
                formData.append('file', settleCertificate);
                const uploadRes = await fetch(`${API_BASE_URL}/api/upload`, {
                    method: 'POST',
                    body: formData
                });
                if (uploadRes.ok) {
                    const uploadData = await uploadRes.json();
                    certLink = uploadData.fileUrl;
                }
            }

            const res = await fetch(`${API_BASE_URL}/api/external-training/${selectedRequest.id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    cost: newTotal,
                    costTraining: settleData.training,
                    costTransport: settleData.transport,
                    costAccommodation: settleData.accommodation,
                    costOthers: settleData.others,
                    additionalCost: excess,
                    settlementNote: settleData.settlementNotes,
                    certificateLink: certLink
                })
            });

            if (res.ok) {
                await fetchRequests();
                setIsSettlementOpen(false);
                setSelectedRequest(null);
            }
        } catch (err) { console.error(err); }
    };

    // --- Statistics ---
    const stats = {
        totalBudget: filteredRequests.reduce((sum, r) => r.status === 'APPROVED' ? sum + (Number(r.cost) || 0) : sum, 0),
        pendingCount: filteredRequests.filter(r => r.status.startsWith('PENDING')).length,
        approvedCount: filteredRequests.filter(r => r.status === 'APPROVED').length,
        averageCost: filteredRequests.length ? filteredRequests.reduce((sum, r) => sum + (Number(r.cost) || 0), 0) / filteredRequests.length : 0,
        totalIncentive: filteredRequests.reduce((sum, r) => r.status === 'APPROVED' ? sum + (Number(r.incentiveReward) || 0) : sum, 0)
    };

    // Import already-processed external training records from an Excel file. Expects the detailed raw-data
    // header layout (Judul, Penyelenggara / Vendor, Sertifikat, Location, Payment Method, etc.) — a separate,
    // narrower format than the HR training report handleExportProcessed() now produces, since the report
    // layout doesn't carry everything needed to reconstruct a record (certificate link, location, payment
    // method, ...). Each row is inserted with status 'Processed'.
    const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = async (evt) => {
            try {
                setIsImporting(true);
                const bstr = evt.target?.result;
                const wb = XLSX.read(bstr, { type: 'binary' });
                const wsname = wb.SheetNames[0];
                const ws = wb.Sheets[wsname];
                const rawData = XLSX.utils.sheet_to_json(ws, { header: 1 }) as any[][];
                if (rawData.length === 0) throw new Error(t('import.emptyFile'));

                // Find header row by finding the row with the most string elements
                let headerRowIndex = 0;
                let maxCols = 0;
                for (let i = 0; i < Math.min(20, rawData.length); i++) {
                    const cols = (rawData[i] || []).filter((c: any) => typeof c === 'string' && c.trim() !== '').length;
                    if (cols > maxCols) { maxCols = cols; headerRowIndex = i; }
                }
                const headers = rawData[headerRowIndex].map((h: any) => String(h || '').trim());

                const data: any[] = [];
                for (let i = headerRowIndex + 1; i < rawData.length; i++) {
                    const rowArr = rawData[i];
                    if (!rowArr || rowArr.length === 0 || rowArr.every((x: any) => x === undefined || x === null || x === '')) continue;
                    const rowObj: any = {};
                    headers.forEach((h, colIdx) => { if (h) rowObj[h] = rowArr[colIdx]; });
                    data.push(rowObj);
                }

                // Both Indonesian and English month names/abbreviations, since exports use English
                // ("3 January 2026") but users may paste Indonesian-authored sheets too.
                const monthMap: Record<string, string> = {
                    januari: '01', februari: '02', maret: '03', april: '04', mei: '05', juni: '06',
                    juli: '07', agustus: '08', september: '09', oktober: '10', november: '11', desember: '12',
                    january: '01', february: '02', march: '03', june: '06', july: '07', august: '08', october: '10', december: '12',
                    jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06', jul: '07', aug: '08',
                    sep: '09', sept: '09', oct: '10', nov: '11', dec: '12'
                };

                // Resolves to a plain YYYY-MM-DD string without ever going through the Date constructor's
                // local-timezone interpretation, which previously shifted dates back a day (e.g. "3 January
                // 2026" -> local midnight -> toISOString() in a negative-UTC-offset timezone -> "2026-01-02").
                const parseImportDate = (val: any): string | null => {
                    if (val === undefined || val === null || val === '') return null;
                    if (typeof val === 'number') {
                        // Excel serial date: days since 1899-12-30, computed directly in UTC millis.
                        const d = new Date(Math.round((val - 25569) * 86400 * 1000));
                        return isNaN(d.getTime()) ? null : d.toISOString().split('T')[0];
                    }
                    const str = String(val).trim();
                    if (!str || str === '-') return null;
                    const slashMatch = str.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
                    if (slashMatch) {
                        const [, dd, mm, yyyy] = slashMatch;
                        return `${yyyy}-${mm.padStart(2, '0')}-${dd.padStart(2, '0')}`;
                    }
                    const isoMatch = str.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
                    if (isoMatch) {
                        const [, yyyy, mm, dd] = isoMatch;
                        return `${yyyy}-${mm.padStart(2, '0')}-${dd.padStart(2, '0')}`;
                    }
                    const parts = str.toLowerCase().replace(/,/g, '').split(/\s+/);
                    const dayPart = parts.find(p => /^\d{1,2}$/.test(p));
                    const yearPart = parts.find(p => /^\d{4}$/.test(p));
                    const monthPart = parts.find(p => monthMap[p]);
                    if (dayPart && yearPart && monthPart) {
                        return `${yearPart}-${monthMap[monthPart]}-${dayPart.padStart(2, '0')}`;
                    }
                    return null;
                };

                const parseImportNumber = (val: any): number => {
                    if (val === undefined || val === null || val === '' || val === '-') return 0;
                    if (typeof val === 'number') return val;
                    const cleaned = String(val).replace(/,/g, '').trim();
                    const num = parseFloat(cleaned);
                    return isNaN(num) ? 0 : num;
                };

                const rows = data.map(row => {
                    const employeeIdRaw = row['Employee ID'];
                    const employeeId = (employeeIdRaw !== undefined && employeeIdRaw !== null && String(employeeIdRaw).trim() !== '')
                        ? String(employeeIdRaw).trim().padStart(7, '0')
                        : '';
                    const incentiveReward = parseImportNumber(row['Insentive sertifikat/bulan']);
                    const learningHoursRaw = row['Training Hours'];

                    return {
                        employee_id: employeeId,
                        employee_name: String(row['Peserta'] || '').trim(),
                        category: String(row['Kategori'] || '').trim(),
                        title: String(row['Judul'] || '').trim(),
                        vendor: String(row['Penyelenggara / Vendor'] || '').trim(),
                        location: String(row['Location'] || '').trim(),
                        start_date: parseImportDate(row['Start Date'] ?? row['Start Time']),
                        end_date: parseImportDate(row['End Date'] ?? row['End Time']),
                        registration_fee: parseImportNumber(row['Biaya Training/Trainer']),
                        travel_flight_cost: parseImportNumber(row['Biaya Transportasi']),
                        accommodation_cost: parseImportNumber(row['Biaya Akomodasi']),
                        miscellaneous_cost: parseImportNumber(row['Biaya Lain-lain']),
                        payment_method: String(row['Payment Method'] || '').trim() || 'Reimbursement',
                        certificate_link: row['Sertifikat'] && String(row['Sertifikat']).trim() !== '-' ? String(row['Sertifikat']).trim() : null,
                        certificate_expiry_date: parseImportDate(row['expired sertifikat']),
                        incentive_reward: incentiveReward > 0 ? incentiveReward : null,
                        incentive_payment_type: incentiveReward > 0 ? 'Recurring' : null,
                        learning_hours: learningHoursRaw !== undefined && learningHoursRaw !== '' ? parseImportNumber(learningHoursRaw) : null,
                        participation_type: String(row['Participation Type'] || '').trim() || null,
                        training_gr_type: String(row['ESG, HSE, Other'] || '').trim() || null
                    };
                }).filter(r => r.employee_id && r.title);

                if (rows.length === 0) throw new Error(t('import.noValidRows'));

                const res = await fetch(`${API_BASE_URL}/api/external-training/bulk-import`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ rows, hr_name: userName })
                });

                if (res.ok) {
                    const result = await res.json();
                    console.log('External training import result:', result);

                    const parts: string[] = [t('import.insertedCount', { count: result.inserted })];
                    if (result.skipped) {
                        parts.push(t('import.skippedCount', { count: result.skipped }));
                        const lines = (result.duplicates || []).map((d: any) =>
                            t('import.duplicateLine', { row: d.row, name: d.employee_name || d.employee_id, title: d.title })
                        );
                        if (lines.length) parts.push('\n' + lines.join('\n'));
                    }
                    if (result.errors?.length) {
                        parts.push(t('import.failedCount', { count: result.errors.length }));
                        const lines = result.errors.map((e: any) => t('import.errorLine', { row: e.row, message: e.error }));
                        if (lines.length) parts.push('\n' + lines.join('\n'));
                    }
                    alert(parts.join(' '));
                    fetchRequests();
                } else {
                    const errData = await res.json().catch(() => ({}));
                    throw new Error(errData.error || t('import.backendFailed'));
                }
            } catch (err: any) {
                console.error('External training import error:', err);
                alert(t('import.failed', { message: err.message }));
            } finally {
                setIsImporting(false);
                if (importFileInputRef.current) importFileInputRef.current.value = '';
            }
        };
        reader.readAsBinaryString(file);
    };

    // Export HR-processed ("APPROVED" in this component's vocabulary, i.e. DB status = 'Processed') requests
    // that are currently visible under the active year/period/branch/search filters, in the company-wide
    // HR training report layout (matches the combined internal+external report template). Columns with no
    // source in this app (Competencies Type/Detail, Facilitator, PTE/Pre-Test/Post-Test scores used only by
    // internal training, Action Plan, Detail Participant Type) are left blank for HR to fill in manually.
    const handleExportProcessed = () => {
        const processedRequests = filteredRequests.filter(r => r.status === 'APPROVED');

        const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

        const formatDDMMYYYY = (value?: string | null) => {
            if (!value) return '';
            const d = new Date(value);
            if (isNaN(d.getTime())) return '';
            return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
        };

        // e.g. "27 Tahun" -> "20-30 years"
        const ageGroupFor = (ageLabel?: string) => {
            const n = parseInt(String(ageLabel || '').replace(/\D/g, ''), 10);
            if (isNaN(n)) return '';
            if (n < 20) return '<20 years';
            if (n <= 30) return '20-30 years';
            if (n <= 40) return '31-40 years';
            if (n <= 50) return '41-50 years';
            if (n <= 60) return '51-60 years';
            return '>60 years';
        };

        const header = [
            '', 'Employee Name', 'ID', 'Training Type', 'Designation', 'Company Group', 'Company', 'Grade', 'Band',
            'Directorate', 'Division', 'Department', 'LOB', 'Divison Type Mapping', 'Quarter', 'Year', 'Month',
            'Month by number', 'Start Date', 'End Date', 'Training Hours', 'Competencies Type', 'Competency Detail',
            'Training Name', 'Attendance', 'Participation Type', 'Vendor', 'Facilitator', 'Total Cost', 'PTE 1 Score',
            'Pre-Test', 'Post-Test', '%Increment', 'PTE 3', 'Age', 'Age Group', 'Gender', 'ESG, HSE, Other',
            'Action Plan', 'Detail Participant Type'
        ];

        const rows = processedRequests.map((req, idx) => {
            const raw = req._original || {};
            const emp = employees.find((e: any) => e.id_employee === req.employee_id);
            const startDate = raw.start_date ? new Date(raw.start_date) : null;
            const totalCost = (Number(req.costTraining) || 0) + (Number(req.costTransport) || 0) + (Number(req.costAccommodation) || 0) + (Number(req.costOthers) || 0);

            return [
                idx + 1,
                req.employeeName || '',
                req.employee_id || '',
                'External',
                emp?.job_position || '',
                emp?.company_group || '',
                emp?.company || '',
                emp?.grade || '',
                emp?.band || '',
                emp?.directorate || '',
                emp?.organization_name || '',
                emp?.department || '',
                emp?.lob || '',
                emp?.division_type_mapping || '',
                startDate ? Math.ceil((startDate.getMonth() + 1) / 3) : '',
                startDate ? startDate.getFullYear() : '',
                startDate ? monthNames[startDate.getMonth()] : '',
                startDate ? startDate.getMonth() + 1 : '',
                formatDDMMYYYY(raw.start_date),
                formatDDMMYYYY(raw.end_date),
                raw.learning_hours ? Number(raw.learning_hours) : '',
                '',
                '',
                req.title || '',
                'Present',
                raw.participation_type || '',
                req.vendor || '',
                '',
                totalCost,
                '', '', '', '', '',
                emp?.age || '',
                ageGroupFor(emp?.age),
                emp?.gender || '',
                raw.training_gr_type || '',
                '',
                ''
            ];
        });

        const ws = XLSX.utils.aoa_to_sheet([header, ...rows]);
        ws['!cols'] = header.map(() => ({ wch: 16 }));
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'External Training');
        const periodLabel = selectedYear === 'All' ? 'AllYears' : String(selectedYear);
        XLSX.writeFile(wb, `External_Training_Processed_${periodLabel}.xlsx`);
    };

    return (
        <div className="space-y-10 animate-fade-in max-w-[1600px] mx-auto py-6">
            {/* Header & View Switcher */}
            <div className="flex flex-col xl:flex-row justify-between items-start xl:items-center gap-6">
                <div>
                    <h1 className="text-4xl font-black text-slate-900 tracking-tight">{t('header.title')}</h1>
                    <p className="text-slate-400 font-bold uppercase tracking-widest text-[10px] mt-1">{t('header.subtitle')}</p>
                </div>

                <div className="flex items-center gap-3">
                    {(userRole === 'HR' || userRole === 'HR_ADMIN') && (
                        <>
                            <input
                                type="file"
                                ref={importFileInputRef}
                                style={{ display: 'none' }}
                                accept=".xlsx, .xls, .csv"
                                onChange={handleImport}
                            />
                            <button
                                onClick={() => importFileInputRef.current?.click()}
                                disabled={isImporting}
                                title={t('import.buttonTooltip')}
                                className="flex items-center gap-2 px-5 py-[15px] rounded-2xl text-xs font-black tracking-widest bg-white border border-slate-200 text-slate-600 shadow-sm hover:border-indigo-500 hover:text-indigo-600 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                <UploadCloud size={16} /> {isImporting ? t('import.importing') : t('import.button')}
                            </button>
                        </>
                    )}
                    <button
                        onClick={handleExportProcessed}
                        title="Export data training yang sudah diproses HR ke Excel"
                        className="flex items-center gap-2 px-5 py-[15px] rounded-2xl text-xs font-black tracking-widest bg-emerald-600 text-white shadow-sm hover:bg-emerald-700 transition-all"
                    >
                        <Download size={16} /> EXPORT
                    </button>
                </div>
            </div>

            {/* Insight Cards */}
            <div className="grid grid-cols-2 lg:grid-cols-3 2xl:grid-cols-5 gap-4">
                {[
                    { label: t('stats.totalInvestment'), value: formatCurrency(stats.totalBudget), icon: Wallet, color: 'text-emerald-600', bg: 'bg-emerald-50', filter: null },
                    { label: t('stats.totalIncentive'), value: formatCurrency(stats.totalIncentive), icon: Award, color: 'text-rose-600', bg: 'bg-rose-50', filter: null },
                    { label: t('stats.averagePerHead'), value: formatCurrency(stats.averageCost), icon: Users, color: 'text-amber-600', bg: 'bg-amber-50', filter: null },
                    { label: t('stats.pendingApproval'), value: stats.pendingCount, icon: Clock, color: 'text-indigo-600', bg: 'bg-indigo-50', filter: 'PENDING' as const },
                    { label: t('stats.successfulEnrollments'), value: stats.approvedCount, icon: CheckCircle2, color: 'text-blue-600', bg: 'bg-blue-50', filter: 'APPROVED' as const }
                ].map((stat, i) => {
                    const isActive = stat.filter !== null && statusDrilldown === stat.filter;
                    const isClickable = stat.filter !== null;
                    return (
                        <button
                            key={i}
                            type="button"
                            disabled={!isClickable}
                            onClick={() => {
                                if (!isClickable) return;
                                setStatusDrilldown(prev => prev === stat.filter ? null : stat.filter);
                            }}
                            title={typeof stat.value === 'string' ? stat.value : undefined}
                            className={`bg-white p-4 lg:p-5 rounded-3xl border shadow-sm flex items-center gap-3 group transition-all duration-300 text-left min-w-0 ${
                                isClickable ? 'cursor-pointer hover:border-indigo-200 hover:shadow-md' : 'cursor-default'
                            } ${isActive ? 'border-indigo-300 ring-2 ring-indigo-100' : 'border-slate-100'}`}
                        >
                            <div className={`shrink-0 p-3 ${stat.bg} ${stat.color} rounded-2xl group-hover:scale-110 transition-transform duration-500`}>
                                <stat.icon size={20} strokeWidth={2.5} />
                            </div>
                            <div className="min-w-0">
                                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1 truncate">{stat.label}</p>
                                <p className="text-lg font-black text-slate-900 leading-none truncate">{stat.value}</p>
                            </div>
                        </button>
                    );
                })}
            </div>

            {statusDrilldown && (
                <div className="flex items-center gap-2 -mt-2">
                    <span className="text-xs font-bold text-indigo-600 bg-indigo-50 border border-indigo-100 px-3 py-1.5 rounded-full">
                        {statusDrilldown === 'PENDING' ? t('stats.pendingApproval') : t('stats.successfulEnrollments')}
                    </span>
                    <button onClick={() => setStatusDrilldown(null)} className="text-xs font-bold text-slate-400 hover:text-slate-600">
                        {t('stats.clearFilter')}
                    </button>
                </div>
            )}

            {/* Global Filter Bar */}
            <div className="bg-white p-6 rounded-[32px] shadow-sm border border-slate-100 flex flex-col gap-4">
                <div className="relative w-full">
                    <Search className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-300" size={18} />
                    <input
                        type="text"
                        placeholder={t('filters.searchPlaceholder')}
                        className="w-full pl-14 pr-6 py-4 rounded-2xl bg-slate-50 border border-transparent focus:bg-white focus:border-indigo-500 focus:ring-4 focus:ring-indigo-100 outline-none font-bold text-slate-700 transition-all placeholder:text-slate-300"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                    />
                </div>

                <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                    <div className="flex items-center gap-2 bg-slate-50 pl-1 pr-3 py-1 rounded-2xl border border-slate-100 min-w-0">
                        <div className="w-10 h-10 shrink-0 flex items-center justify-center bg-white rounded-xl shadow-sm text-slate-400">
                            <Filter size={16} />
                        </div>
                        <select
                            value={selectedBranch}
                            onChange={(e) => setSelectedBranch(e.target.value)}
                            className="appearance-none bg-transparent flex-1 min-w-0 px-2 py-2 rounded-xl font-black text-slate-600 text-[10px] outline-none tracking-widest cursor-pointer truncate"
                        >
                            {branches.map(b => (
                                <option key={b} value={b}>{b.toUpperCase()}</option>
                            ))}
                        </select>
                        <ChevronDown size={14} className="shrink-0 text-slate-400 pointer-events-none" />
                    </div>

                    <div className="flex items-center gap-2 bg-slate-50 pl-1 pr-3 py-1 rounded-2xl border border-slate-100 min-w-0">
                        <div className="w-10 h-10 shrink-0 flex items-center justify-center bg-white rounded-xl shadow-sm text-slate-400">
                            <Tag size={16} />
                        </div>
                        <select
                            value={selectedCategory}
                            onChange={(e) => setSelectedCategory(e.target.value)}
                            className="appearance-none bg-transparent flex-1 min-w-0 px-2 py-2 rounded-xl font-black text-slate-600 text-[10px] outline-none tracking-widest cursor-pointer truncate"
                        >
                            <option value="All Categories">{t('filters.allCategories')}</option>
                            {categoryOptions.map(c => (
                                <option key={c} value={c}>{t(`categoryLabels.${c}`, { defaultValue: c }).toUpperCase()}</option>
                            ))}
                        </select>
                        <ChevronDown size={14} className="shrink-0 text-slate-400 pointer-events-none" />
                    </div>

                    <div className="flex items-center gap-2 bg-slate-50 pl-1 pr-3 py-1 rounded-2xl border border-slate-100 min-w-0">
                        <div className="w-10 h-10 shrink-0 flex items-center justify-center bg-white rounded-xl shadow-sm text-slate-400">
                            <Calendar size={16} />
                        </div>
                        <select
                            value={selectedYear}
                            onChange={(e) => setSelectedYear(e.target.value === 'All' ? 'All' : parseInt(e.target.value))}
                            className="appearance-none bg-transparent flex-1 min-w-0 px-2 py-2 rounded-xl font-black text-slate-600 text-[10px] outline-none tracking-widest cursor-pointer truncate"
                        >
                            <option value="All">{t('filters.allYears')}</option>
                            {Array.from({ length: Math.max(1, new Date().getFullYear() - 2026 + 1) }, (_, i) => 2026 + i).map(y => <option key={y} value={y}>{y}</option>)}
                        </select>
                        <ChevronDown size={14} className="shrink-0 text-slate-400 pointer-events-none" />
                    </div>

                    <div className="flex items-center gap-2 bg-slate-50 pl-1 pr-3 py-1 rounded-2xl border border-slate-100 min-w-0">
                        <div className="w-10 h-10 shrink-0 flex items-center justify-center bg-white rounded-xl shadow-sm text-slate-400">
                            <Clock size={16} />
                        </div>
                        <select
                            value={selectedPeriod}
                            onChange={(e) => setSelectedPeriod(e.target.value)}
                            className="appearance-none bg-transparent flex-1 min-w-0 px-2 py-2 rounded-xl font-black text-slate-600 text-[10px] outline-none tracking-widest cursor-pointer truncate"
                        >
                            {periodOptions.map(opt => (
                                <option key={opt} value={opt}>{opt.toUpperCase()}</option>
                            ))}
                        </select>
                        <ChevronDown size={14} className="shrink-0 text-slate-400 pointer-events-none" />
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-1 gap-4">
                    {visibleRequests.length === 0 ? (
                        <div className="bg-white p-20 rounded-[40px] border border-slate-100 flex flex-col items-center gap-3">
                            <div className="w-16 h-16 rounded-3xl bg-slate-50 flex items-center justify-center text-slate-200">
                                <FileText size={32} />
                            </div>
                            <p className="text-sm font-black text-slate-400 uppercase tracking-widest">{t('list.empty')}</p>
                            {onlyOwnRequestsHidden && (
                                <p className="text-xs text-slate-400 max-w-sm text-center">{t('list.onlyOwnHidden')}</p>
                            )}
                        </div>
                    ) : (
                        visibleRequests.map(req => {
                            const isExpanded = expandedRequestIds.has(req.id);
                            return (
                            <div key={req.id} className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm hover:shadow-md transition-all group relative">
                                <div className="flex flex-col md:flex-row md:items-start gap-4">
                                    <div className="space-y-3 flex-1">
                                        <div className="flex items-center gap-3">
                                            <h4 className="text-lg font-black text-slate-900 group-hover:text-indigo-600 transition-colors leading-none">{req.title}</h4>
                                            <StatusBadge status={req.status} />
                                        </div>

                                        <p className="text-sm font-bold text-slate-500">
                                            {req.employeeName} <span className="mx-2 text-slate-300">—</span> {t(`categoryLabels.${req.employeeRole}`, { defaultValue: req.employeeRole })}
                                        </p>

                                        <button
                                            type="button"
                                            onClick={() => toggleRequestDetail(req.id)}
                                            className="flex items-center gap-1.5 text-xs font-black text-indigo-600 hover:text-indigo-700 uppercase tracking-widest"
                                        >
                                            {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                                            {isExpanded ? t('list.hideDetail') : t('list.showDetail')}
                                        </button>

                                        {isExpanded && (
                                        <>
                                        <div className="flex flex-wrap items-center gap-2">
                                            <div className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-50 rounded-lg text-[10px] font-black text-slate-400 border border-slate-100">
                                                <Calendar size={14} className="text-slate-300" />
                                                {new Date(req.date).toLocaleDateString('en-GB')}
                                            </div>
                                            <div className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-50 rounded-lg text-[10px] font-black text-slate-400 border border-slate-100">
                                                <Wallet size={14} className="text-slate-300" />
                                                {formatCurrency(req.cost || 0)}
                                            </div>
                                            <div className="px-3 py-1.5 bg-slate-50 rounded-lg text-[10px] font-black text-slate-400 border border-slate-100 uppercase tracking-wider">
                                                {req.vendor}
                                            </div>
                                            {req.certificateExpiryDate && (() => {
                                                const isExpired = new Date(req.certificateExpiryDate) < new Date();
                                                return (
                                                    <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-black border uppercase tracking-wider ${isExpired ? 'bg-rose-50 text-rose-600 border-rose-100' : 'bg-amber-50 text-amber-700 border-amber-100'}`}>
                                                        <AlertTriangle size={14} className={isExpired ? 'text-rose-400' : 'text-amber-400'} />
                                                        {isExpired ? t('list.certificateExpired') : t('list.certificateExpires')}: {new Date(req.certificateExpiryDate).toLocaleDateString('en-GB')}
                                                    </div>
                                                );
                                            })()}
                                            {!!req.incentiveReward && (
                                                <div className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-50 rounded-lg text-[10px] font-black text-emerald-700 border border-emerald-100 uppercase tracking-wider">
                                                    <Award size={14} className="text-emerald-500" />
                                                    {t('list.incentive')}: {formatCurrency(req.incentiveReward)}
                                                    {req.incentivePaymentType === 'Recurring' ? ` / ${t('list.month')}` : ''}
                                                </div>
                                            )}
                                        </div>

                                        <div className="flex items-center gap-3 pt-2">
                                            <div className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border text-[9px] font-black uppercase tracking-tighter ${req.supervisorName ? 'bg-emerald-50 text-emerald-700 border-emerald-100' : 'bg-slate-50 text-slate-400 border-slate-100'}`}>
                                                <div className={`w-4 h-4 rounded-full flex items-center justify-center ${req.supervisorName ? 'bg-emerald-100' : 'bg-slate-200'}`}>
                                                    <CheckCircle2 size={10} />
                                                </div>
                                                <div>
                                                    <p className="opacity-60 leading-none mb-0.5">{t('list.supervisor')}</p>
                                                    <p className="leading-none">{req.supervisorName || t('list.pending')}</p>
                                                </div>
                                            </div>
                                            <div className="w-8 h-px bg-slate-100" />
                                            <div className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border text-[9px] font-black uppercase tracking-tighter ${req.hrName ? 'bg-emerald-50 text-emerald-700 border-emerald-100' : 'bg-slate-50 text-slate-400 border-slate-100'}`}>
                                                <div className={`w-4 h-4 rounded-full flex items-center justify-center ${req.hrName ? 'bg-emerald-100' : 'bg-slate-200'}`}>
                                                    <CheckCircle2 size={10} />
                                                </div>
                                                <div>
                                                    <p className="opacity-60 leading-none mb-0.5">{t('list.hrDept')}</p>
                                                    <p className="leading-none">{req.hrName || t('list.pending')}</p>
                                                </div>
                                            </div>
                                        </div>
                                        </>
                                        )}
                                    </div>

                                    {isExpanded && (req.evidenceUrl || req.renewalCertificateUrl) && (
                                        <div className="hidden lg:flex items-center gap-3 mr-4">
                                            {[
                                                { url: req.evidenceUrl, label: t('list.certificateOriginal'), expiry: req.originalCertificateExpiryDate || req.certificateExpiryDate },
                                                { url: req.renewalCertificateUrl, label: t('list.certificateRenewed'), expiry: req.certificateExpiryDate }
                                            ].filter(cert => cert.url).map((cert, idx) => (
                                                <div key={idx} className="flex flex-col items-center gap-1">
                                                    {cert.url!.match(/\.(jpeg|jpg|gif|png|webp)$/i) ? (
                                                        <a href={cert.url} target="_blank" rel="noreferrer" className="group/img relative block overflow-hidden rounded-xl border border-slate-100 shadow-sm w-36 h-24 shrink-0">
                                                            <img src={cert.url} alt={t('list.certificateAlt')} className="w-full h-full object-cover group-hover/img:scale-110 transition-transform duration-500" />
                                                            <div className="absolute inset-0 bg-black/40 opacity-0 group-hover/img:opacity-100 transition-opacity flex items-center justify-center">
                                                                <span className="text-white text-[10px] font-black uppercase tracking-widest">{t('list.viewDocument')}</span>
                                                            </div>
                                                        </a>
                                                    ) : (
                                                        <a href={cert.url} target="_blank" rel="noreferrer" className="flex flex-col items-center justify-center w-36 h-24 bg-slate-50 border border-slate-100 rounded-xl hover:bg-slate-100 hover:border-slate-300 transition-colors group/doc text-slate-400 hover:text-indigo-600 shrink-0">
                                                            <FileText size={24} className="mb-2" />
                                                            <span className="text-[9px] font-black uppercase tracking-widest text-center px-2">{t('list.openDocument')}</span>
                                                        </a>
                                                    )}
                                                    <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">{cert.label}</span>
                                                    {cert.expiry && (() => {
                                                        const isExpired = new Date(cert.expiry) < new Date();
                                                        return (
                                                            <span className={`text-[9px] font-bold ${isExpired ? 'text-rose-500' : 'text-amber-600'}`}>
                                                                {isExpired ? t('list.certificateExpired') : t('list.certificateExpires')}: {new Date(cert.expiry).toLocaleDateString('en-GB')}
                                                            </span>
                                                        );
                                                    })()}
                                                </div>
                                            ))}
                                        </div>
                                    )}

                                    <div className="flex items-center gap-2">
                                        {req.evidenceUrl && (
                                            <a href={req.evidenceUrl} target="_blank" rel="noreferrer" className="p-3 text-slate-300 hover:text-emerald-600 hover:bg-emerald-50 rounded-xl transition-all lg:hidden" title={t('list.viewCertificateAttachment')}>
                                                <Link size={20} />
                                            </a>
                                        )}
                                        {req.status === 'APPROVED' ? (
                                            <button onClick={() => setSelectedRequest(req)} className="flex items-center gap-1.5 px-3 py-2 bg-emerald-50 text-emerald-700 border border-emerald-100 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-emerald-100 transition-all" title={t('list.viewDossier')}>
                                                <CheckCircle2 size={14} /> {t('statusBadge.approved')}
                                            </button>
                                        ) : (
                                            <button onClick={() => setSelectedRequest(req)} className="flex items-center gap-1.5 px-3 py-2 text-slate-600 border border-slate-200 hover:text-indigo-600 hover:bg-indigo-50 hover:border-indigo-200 rounded-xl text-xs font-bold transition-all" title={t('list.viewDossier')}>
                                                <FileText size={16} /> {t('list.detail')}
                                            </button>
                                        )}
                                        {(userRole === 'HR' || userRole === 'HR_ADMIN') && (
                                            <button onClick={() => handleDeleteRequest(req.id)} className="flex items-center gap-1.5 px-3 py-2 text-slate-600 border border-slate-200 hover:text-rose-600 hover:bg-rose-50 hover:border-rose-200 rounded-xl text-xs font-bold transition-all">
                                                <Trash2 size={16} /> {t('list.delete')}
                                            </button>
                                        )}
                                    </div>
                                </div>
                            </div>
                            );
                        })
                    )}
                </div>

            {/* Modal Components */}
            {selectedRequest && (() => {
                const isHrEditable = (userRole === 'HR' || userRole === 'HR_ADMIN') && selectedRequest.status === 'PENDING_HR';
                return (
                <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in">
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg flex flex-col max-h-[90vh]">
                        <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50 rounded-t-2xl">
                            <div>
                                <h3 className="text-xl font-bold text-slate-800 flex items-center gap-2">
                                    <Briefcase size={20} className="text-indigo-600" /> {t('requestModal.processTitle')}
                                </h3>
                                <p className="text-sm text-slate-500">{t('requestModal.ltrId', { id: selectedRequest.id, name: selectedRequest.employeeName })}</p>
                            </div>
                            <button onClick={() => setSelectedRequest(null)} className="text-slate-400 hover:text-slate-600"><XCircle size={24} /></button>
                        </div>
                        <div className="p-6 space-y-4 overflow-y-auto">
                            <div>
                                <label className="block text-sm font-semibold text-slate-700 mb-1">{isHrEditable ? t('requestModal.titleLabel') : t('requestModal.trainingTitle')} {isHrEditable && <span className="text-red-500">*</span>}</label>
                                {isHrEditable ? (
                                    <input required value={hrEditTitle} onChange={(e) => setHrEditTitle(e.target.value)} className="w-full px-4 py-2 border border-slate-200 rounded-xl text-slate-700 focus:border-indigo-500 outline-none" />
                                ) : (
                                    <input readOnly value={selectedRequest.title} className="w-full px-4 py-2 border border-slate-200 rounded-xl bg-slate-50 text-slate-700 cursor-not-allowed" />
                                )}
                            </div>
                            {isHrEditable ? (
                                <div className="grid grid-cols-2 gap-3">
                                    <div>
                                        <label className="block text-sm font-semibold text-slate-700 mb-1">{t('requestModal.vendor')} <span className="text-red-500">*</span></label>
                                        <input required value={hrEditVendor} onChange={(e) => setHrEditVendor(e.target.value)} placeholder={t('requestModal.vendor')} className="w-full px-4 py-2 border border-slate-200 rounded-xl text-slate-700 focus:border-indigo-500 outline-none" />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-semibold text-slate-700 mb-1">{t('requestModal.location')} <span className="text-red-500">*</span></label>
                                        <input required value={hrEditLocation} onChange={(e) => setHrEditLocation(e.target.value)} placeholder={t('requestModal.location')} className="w-full px-4 py-2 border border-slate-200 rounded-xl text-slate-700 focus:border-indigo-500 outline-none" />
                                    </div>
                                </div>
                            ) : (
                                <div>
                                    <label className="block text-sm font-semibold text-slate-700 mb-1">{t('requestModal.vendorLocation')}</label>
                                    <input readOnly value={`${selectedRequest.vendor} - ${selectedRequest.location}`} className="w-full px-4 py-2 border border-slate-200 rounded-xl bg-slate-50 text-slate-700 cursor-not-allowed" />
                                </div>
                            )}
                            {isHrEditable ? (
                                <div className="grid grid-cols-2 gap-3">
                                    <div>
                                        <label className="block text-sm font-semibold text-slate-700 mb-1">{t('requestModal.startDate')} <span className="text-red-500">*</span></label>
                                        <input required type="date" value={hrEditStartDate} onChange={(e) => setHrEditStartDate(e.target.value)} className="w-full px-4 py-2 border border-slate-200 rounded-xl text-slate-700 focus:border-indigo-500 outline-none" />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-semibold text-slate-700 mb-1">{t('requestModal.endDate')} <span className="text-red-500">*</span></label>
                                        <input required type="date" value={hrEditEndDate} onChange={(e) => setHrEditEndDate(e.target.value)} className="w-full px-4 py-2 border border-slate-200 rounded-xl text-slate-700 focus:border-indigo-500 outline-none" />
                                    </div>
                                </div>
                            ) : (
                                <div>
                                    <label className="block text-sm font-semibold text-slate-700 mb-1">{t('requestModal.strategicJustification')}</label>
                                    <textarea readOnly value={selectedRequest.justification} className="w-full px-4 py-2 border border-slate-200 rounded-xl bg-slate-50 text-slate-700 cursor-not-allowed resize-none" rows={2} />
                                </div>
                            )}

                            {/* Read-only dossier detail: full cost breakdown, GRI/participation/learning hours,
                                approvals and certificate, mirroring what the employee & their supervisor already see. */}
                            {!isHrEditable && (
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-4 bg-slate-50 border border-slate-100 rounded-xl text-sm">
                                    {selectedRequest._original?.training_gr_type && (
                                        <div className="flex items-center gap-2 text-slate-600">
                                            <Award className="w-4 h-4 text-slate-400 shrink-0" />
                                            <span>{t('requestModal.griType')}: <span className="font-semibold text-slate-800">{selectedRequest._original.training_gr_type}</span></span>
                                        </div>
                                    )}
                                    {selectedRequest._original?.participation_type && (
                                        <div className="flex items-center gap-2 text-slate-600">
                                            <Users className="w-4 h-4 text-slate-400 shrink-0" />
                                            <span>{t('requestModal.participationType')}: <span className="font-semibold text-slate-800">{selectedRequest._original.participation_type}</span></span>
                                        </div>
                                    )}
                                    {Number(selectedRequest._original?.learning_hours) > 0 && (
                                        <div className="flex items-center gap-2 text-slate-600">
                                            <Clock className="w-4 h-4 text-slate-400 shrink-0" />
                                            <span>{t('requestModal.learningHours')}: <span className="font-semibold text-slate-800">{Number(selectedRequest._original.learning_hours)}</span></span>
                                        </div>
                                    )}
                                    {selectedRequest._original?.payment_method && (
                                        <div className="flex items-center gap-2 text-slate-600">
                                            <CreditCard className="w-4 h-4 text-slate-400 shrink-0" />
                                            <span>{t('requestModal.paymentMethod')}: <span className="font-semibold text-slate-800">{selectedRequest._original.payment_method}</span></span>
                                        </div>
                                    )}
                                    {Number(selectedRequest.costTraining) > 0 && (
                                        <div className="flex items-center gap-2 text-slate-600">
                                            <Wallet className="w-4 h-4 text-slate-400 shrink-0" />
                                            <span>{t('requestModal.trainingFee')}: <span className="font-semibold text-slate-800">{formatCurrency(Number(selectedRequest.costTraining))}</span></span>
                                        </div>
                                    )}
                                    {Number(selectedRequest.costTransport) > 0 && (
                                        <div className="flex items-center gap-2 text-slate-600">
                                            <Wallet className="w-4 h-4 text-slate-400 shrink-0" />
                                            <span>{t('requestModal.travelCost')}: <span className="font-semibold text-slate-800">{formatCurrency(Number(selectedRequest.costTransport))}</span></span>
                                        </div>
                                    )}
                                    {Number(selectedRequest.costAccommodation) > 0 && (
                                        <div className="flex items-center gap-2 text-slate-600">
                                            <Wallet className="w-4 h-4 text-slate-400 shrink-0" />
                                            <span>{t('requestModal.accommodation')}: <span className="font-semibold text-slate-800">{formatCurrency(Number(selectedRequest.costAccommodation))}</span></span>
                                        </div>
                                    )}
                                    {Number(selectedRequest.costOthers) > 0 && (
                                        <div className="flex items-center gap-2 text-slate-600">
                                            <Wallet className="w-4 h-4 text-slate-400 shrink-0" />
                                            <span>{t('requestModal.miscellaneous')}: <span className="font-semibold text-slate-800">{formatCurrency(Number(selectedRequest.costOthers))}</span></span>
                                        </div>
                                    )}
                                    {Number(selectedRequest.incentiveReward) > 0 && (
                                        <div className="flex items-center gap-2 text-slate-600">
                                            <Award className="w-4 h-4 text-slate-400 shrink-0" />
                                            <span>{t('requestModal.incentiveReward')}: <span className="font-semibold text-slate-800">{formatCurrency(Number(selectedRequest.incentiveReward))}{selectedRequest.incentivePaymentType === 'Recurring' ? ` / ${t('list.month')}` : ''}</span></span>
                                        </div>
                                    )}
                                    {selectedRequest.supervisorName && (
                                        <div className="flex items-center gap-2 text-slate-600">
                                            <CheckCircle2 className="w-4 h-4 text-slate-400 shrink-0" />
                                            <span>{t('list.supervisor')}: <span className="font-semibold text-slate-800">{selectedRequest.supervisorName}</span></span>
                                        </div>
                                    )}
                                    {selectedRequest.hrName && (
                                        <div className="flex items-center gap-2 text-slate-600">
                                            <CheckCircle2 className="w-4 h-4 text-slate-400 shrink-0" />
                                            <span>{t('list.hrDept')}: <span className="font-semibold text-slate-800">{selectedRequest.hrName}</span></span>
                                        </div>
                                    )}
                                    {(selectedRequest.evidenceUrl || selectedRequest.renewalCertificateUrl) && (
                                        <div className="sm:col-span-2">
                                            <span className="flex items-center gap-2 text-slate-600 mb-2">
                                                <Award className="w-4 h-4 shrink-0 text-slate-400" />
                                                {t('list.certificateAlt')}
                                            </span>
                                            <div className="flex flex-wrap gap-4">
                                                {[
                                                    { url: selectedRequest.evidenceUrl, label: t('list.certificateOriginal'), expiry: selectedRequest.originalCertificateExpiryDate || selectedRequest.certificateExpiryDate },
                                                    { url: selectedRequest.renewalCertificateUrl, label: t('list.certificateRenewed'), expiry: selectedRequest.certificateExpiryDate }
                                                ].filter((cert): cert is { url: string; label: string; expiry: string | undefined } => !!cert.url).map((cert, idx, arr) => (
                                                    <div key={idx} className="flex flex-col gap-1">
                                                        {cert.url.match(/\.(jpeg|jpg|gif|png|webp)$/i) ? (
                                                            <a href={cert.url} target="_blank" rel="noreferrer" className="block w-32 h-24 rounded-lg overflow-hidden border border-slate-200 hover:opacity-90 transition-opacity">
                                                                <img src={cert.url} alt={cert.label} referrerPolicy="no-referrer" className="w-full h-full object-cover" />
                                                            </a>
                                                        ) : (
                                                            <a href={cert.url} target="_blank" rel="noreferrer" className="flex flex-col items-center justify-center w-32 h-24 bg-white border border-slate-200 rounded-lg hover:border-indigo-300 transition-colors text-slate-400 hover:text-indigo-600">
                                                                <FileText size={20} className="mb-1" />
                                                                <span className="text-[9px] font-black uppercase tracking-widest">{t('list.openDocument')}</span>
                                                            </a>
                                                        )}
                                                        {arr.length > 1 && <span className="text-xs font-semibold text-slate-500">{cert.label}</span>}
                                                        {cert.expiry && (
                                                            <span className="text-xs text-slate-500">{new Date(cert.expiry).toLocaleDateString()}</span>
                                                        )}
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            )}

                            {(userRole === 'HR' || userRole === 'HR_ADMIN') && selectedRequest.status === 'PENDING_HR' && (
                                <>
                                    <div className="grid grid-cols-2 gap-3">
                                        <div>
                                            <label className="block text-sm font-semibold text-slate-700 mb-1">{t('requestModal.griType')} <span className="text-red-500">*</span></label>
                                            <select value={hrEditGriType} onChange={(e) => setHrEditGriType(e.target.value)} className="w-full px-4 py-2 border border-slate-200 rounded-xl text-slate-700 focus:border-indigo-500 outline-none bg-white">
                                                <option value="">{t('requestModal.griTypePlaceholder')}</option>
                                                <option value="ESG">{t('requestModal.griEsg')}</option>
                                                <option value="HSE">{t('requestModal.griHse')}</option>
                                                <option value="Other">{t('requestModal.griOther')}</option>
                                            </select>
                                        </div>
                                        <div>
                                            <label className="block text-sm font-semibold text-slate-700 mb-1">{t('requestModal.participationType')} <span className="text-red-500">*</span></label>
                                            <select value={hrEditParticipationType} onChange={(e) => setHrEditParticipationType(e.target.value)} className="w-full px-4 py-2 border border-slate-200 rounded-xl text-slate-700 focus:border-indigo-500 outline-none bg-white">
                                                <option value="">{t('requestModal.participationTypePlaceholder')}</option>
                                                <option value="Self Registered">{t('requestModal.selfRegistered')}</option>
                                                <option value="Targeted Participants">{t('requestModal.targetedParticipants')}</option>
                                            </select>
                                        </div>
                                        <div>
                                            <label className="block text-sm font-semibold text-slate-700 mb-1">{t('requestModal.learningHours')} <span className="text-red-500">*</span></label>
                                            <input required type="number" min="0" step="0.5" value={hrEditLearningHours} onChange={(e) => setHrEditLearningHours(e.target.value)} placeholder={t('requestModal.learningHoursPlaceholder')} className="w-full px-4 py-2 border border-slate-200 rounded-xl text-slate-700 focus:border-indigo-500 outline-none" />
                                        </div>
                                    </div>
                                    <div className="pt-4 border-t border-slate-100">
                                        <h4 className="font-bold text-slate-800 mb-3">{t('requestModal.financeAllocation')}</h4>
                                        <div className="grid grid-cols-2 gap-3">
                                            {[
                                                { label: t('requestModal.trainingFee'), field: 'training' },
                                                { label: t('requestModal.travelCost'), field: 'transport' },
                                                { label: t('requestModal.accommodation'), field: 'accommodation' },
                                                { label: t('requestModal.miscellaneous'), field: 'others' }
                                            ].map((item) => (
                                                <div key={item.field}>
                                                    <label className="block text-xs font-semibold text-slate-700 mb-1">{item.label}</label>
                                                    <div className="relative">
                                                        <span className="absolute left-3 top-2.5 text-slate-400 text-sm">Rp</span>
                                                        <input
                                                            type="text"
                                                            value={new Intl.NumberFormat('id-ID').format((breakdownCost as any)[item.field])}
                                                            onChange={(e) => {
                                                                const val = Number(e.target.value.replace(/\D/g, ''));
                                                                setBreakdownCost(prev => ({ ...prev, [item.field]: val }));
                                                            }}
                                                            className="w-full pl-8 pr-3 py-2 border border-slate-200 rounded-xl outline-none text-sm focus:border-indigo-500"
                                                        />
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                    <div className="mt-4">
                                        <label className="block text-sm font-semibold text-slate-700 mb-1">{t('requestModal.paymentMethod')}</label>
                                        <div className="grid grid-cols-2 gap-3">
                                            {(['Reimbursement', 'Direct Payment'] as const).map(method => (
                                                <button
                                                    key={method}
                                                    type="button"
                                                    onClick={() => setHrPaymentMethod(method)}
                                                    className={`py-2 rounded-xl text-sm font-bold border transition-colors ${
                                                        hrPaymentMethod === method
                                                            ? 'bg-indigo-600 text-white border-indigo-600'
                                                            : 'bg-white text-slate-600 border-slate-200 hover:border-indigo-300'
                                                    }`}
                                                >
                                                    {method === 'Reimbursement' ? t('requestModal.paymentMethodReimbursement') : t('requestModal.paymentMethodDirectPayment')}
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                    {selectedRequest.employeeRole === 'Sertifikat' && (
                                        <div className="mt-4 space-y-4">
                                            <div>
                                                <label className="block text-sm font-semibold text-slate-700 mb-1">{t('requestModal.certificationResult')}</label>
                                                <div className="grid grid-cols-2 gap-3">
                                                    {(['Passed', 'Not Passed'] as const).map(result => (
                                                        <button
                                                            key={result}
                                                            type="button"
                                                            onClick={() => setHrCertificationResult(result)}
                                                            className={`py-2 rounded-xl text-sm font-bold border transition-colors ${
                                                                hrCertificationResult === result
                                                                    ? (result === 'Passed' ? 'bg-emerald-600 text-white border-emerald-600' : 'bg-rose-600 text-white border-rose-600')
                                                                    : 'bg-white text-slate-600 border-slate-200 hover:border-indigo-300'
                                                            }`}
                                                        >
                                                            {result === 'Passed' ? t('requestModal.certificationPassed') : t('requestModal.certificationNotPassed')}
                                                        </button>
                                                    ))}
                                                </div>
                                            </div>
                                            {hrCertificationResult === 'Passed' && (
                                            <div>
                                                <label className="block text-sm font-semibold text-slate-700 mb-1">
                                                    {t('requestModal.uploadCertificateEvidence')} <span className="text-red-500">*</span>
                                                </label>
                                                <input
                                                    type="file"
                                                    accept="image/*,.pdf"
                                                    onChange={(e) => setHrCertificateFile(e.target.files ? e.target.files[0] : null)}
                                                    className="w-full px-4 py-2 border border-slate-200 rounded-xl outline-none text-sm"
                                                />
                                                {selectedRequest._original?.certificate_link && !hrCertificateFile && (
                                                    <p className="text-xs text-emerald-600 mt-1">{t('requestModal.certificateAlreadyUploaded')}</p>
                                                )}
                                            </div>
                                            )}
                                            {hrCertificationResult === 'Passed' && (
                                            <div>
                                                <label className="block text-sm font-semibold text-slate-700 mb-1">
                                                    {t('requestModal.certificateExpiryDate')} <span className="text-red-500">*</span>
                                                </label>
                                                <input
                                                    type="date"
                                                    value={hrCertificateExpiryDate}
                                                    onChange={(e) => setHrCertificateExpiryDate(e.target.value)}
                                                    className="w-full px-4 py-2 border border-slate-200 rounded-xl outline-none text-sm focus:border-indigo-500"
                                                />
                                            </div>
                                            )}
                                            {hrCertificationResult === 'Passed' && (
                                            <div className="pt-2 border-t border-slate-100">
                                                <label className="flex items-center gap-2 cursor-pointer select-none">
                                                    <input
                                                        type="checkbox"
                                                        checked={hrGrantIncentive}
                                                        onChange={(e) => setHrGrantIncentive(e.target.checked)}
                                                        className="w-4 h-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                                                    />
                                                    <span className="text-sm font-semibold text-slate-700">{t('requestModal.grantIncentive')}</span>
                                                </label>
                                                {hrGrantIncentive && (
                                                    <div className="grid grid-cols-2 gap-3 mt-3">
                                                        <div>
                                                            <label className="block text-xs font-semibold text-slate-700 mb-1">
                                                                {t('requestModal.incentiveReward')} <span className="text-red-500">*</span>
                                                            </label>
                                                            <div className="relative">
                                                                <span className="absolute left-3 top-2.5 text-slate-400 text-sm">Rp</span>
                                                                <input
                                                                    type="text"
                                                                    value={new Intl.NumberFormat('id-ID').format(Number(hrIncentiveReward.replace(/\D/g, '')) || 0)}
                                                                    onChange={(e) => setHrIncentiveReward(e.target.value.replace(/\D/g, ''))}
                                                                    className="w-full pl-8 pr-3 py-2 border border-slate-200 rounded-xl outline-none text-sm focus:border-indigo-500"
                                                                />
                                                            </div>
                                                        </div>
                                                        <div>
                                                            <label className="block text-xs font-semibold text-slate-700 mb-1">{t('requestModal.incentivePaymentType')}</label>
                                                            <div className="grid grid-cols-2 gap-2">
                                                                {(['One-Time', 'Recurring'] as const).map(type => (
                                                                    <button
                                                                        key={type}
                                                                        type="button"
                                                                        onClick={() => setHrIncentivePaymentType(type)}
                                                                        className={`py-2 rounded-xl text-xs font-bold border transition-colors ${
                                                                            hrIncentivePaymentType === type
                                                                                ? 'bg-indigo-600 text-white border-indigo-600'
                                                                                : 'bg-white text-slate-600 border-slate-200 hover:border-indigo-300'
                                                                        }`}
                                                                    >
                                                                        {type === 'One-Time' ? t('requestModal.incentiveOneTime') : t('requestModal.incentiveRecurring')}
                                                                    </button>
                                                                ))}
                                                            </div>
                                                            {hrIncentivePaymentType === 'Recurring' && (
                                                                <p className="text-[11px] text-slate-500 mt-1.5">
                                                                    {hrCertificateExpiryDate
                                                                        ? t('requestModal.incentiveRecurringStopHint', { date: new Date(hrCertificateExpiryDate).toLocaleDateString('id-ID') })
                                                                        : t('requestModal.incentiveRecurringStopHintNoDate')}
                                                                </p>
                                                            )}
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                            )}
                                        </div>
                                    )}
                                </>
                            )}

                        </div>

                        <div className="p-6 border-t border-slate-100 bg-slate-50 flex flex-wrap gap-3 rounded-b-2xl">
                            {((userRole === 'SUPERVISOR' && selectedRequest.status === 'PENDING_SUPERVISOR') || (userRole === 'HR' && selectedRequest.status === 'PENDING_HR')) && (
                                <button onClick={handleApprove} className="flex-[2] py-2 bg-indigo-600 text-white font-bold rounded-xl text-sm shadow-md hover:bg-indigo-700 transition-colors">{t('requestModal.approveRequest')}</button>
                            )}

                            {selectedRequest.status === 'APPROVED' && (userRole === 'HR' || userRole === 'HR_ADMIN') && (
                                <button onClick={() => handleOpenSettlement(selectedRequest)} className="flex-[2] py-2 bg-emerald-600 text-white font-bold rounded-xl text-sm shadow-md hover:bg-emerald-700 transition-colors">{t('requestModal.updateSettlement')}</button>
                            )}
                            {selectedRequest.status === 'APPROVED' && selectedRequest.employeeRole === 'Sertifikat' && selectedRequest.certificateExpiryDate && (userRole === 'HR' || userRole === 'HR_ADMIN') && (
                                <button onClick={() => openRenewModal(selectedRequest)} className="flex-[2] py-2 bg-amber-500 text-white font-bold rounded-xl text-sm shadow-md hover:bg-amber-600 transition-colors flex items-center justify-center gap-1.5">
                                    <Award size={16} /> {t('requestModal.renewCertificate')}
                                </button>
                            )}
                        </div>
                    </div>
                </div>
                ); })()}

            {/* Settlement Modal */}
            {isSettlementOpen && (
                <div className="fixed inset-0 z-[60] flex items-center justify-center p-6 bg-slate-900/60 backdrop-blur-md animate-in fade-in">
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden animate-in zoom-in-95 flex flex-col max-h-[90vh]">
                        <div className="p-6 border-b border-slate-50 flex justify-between items-center bg-slate-50/50 shrink-0">
                            <div>
                                <h2 className="font-black text-2xl text-slate-900 tracking-tight">{t('settlementModal.title')}</h2>
                                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-1">{t('settlementModal.subtitle')}</p>
                            </div>
                            <button onClick={() => setIsSettlementOpen(false)} className="p-3 hover:bg-slate-100 rounded-2xl text-slate-300 transition-colors"><XCircle size={24} /></button>
                        </div>

                        <div className="p-6 space-y-6 overflow-y-auto">
                            <div className="grid grid-cols-2 gap-4">
                                {[
                                    { label: t('settlementModal.trainingCost'), field: 'training' },
                                    { label: t('settlementModal.transport'), field: 'transport' },
                                    { label: t('settlementModal.accommodation'), field: 'accommodation' },
                                    { label: t('settlementModal.others'), field: 'others' }
                                ].map((item) => (
                                    <div key={item.field}>
                                        <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 ml-1">{item.label}</label>
                                        <div className="relative">
                                            <span className="absolute left-4 top-3 text-xs font-black text-slate-300">Rp</span>
                                            <input
                                                type="text"
                                                value={new Intl.NumberFormat('id-ID').format((settleData as any)[item.field])}
                                                onChange={(e) => {
                                                    const val = Number(e.target.value.replace(/\D/g, ''));
                                                    setSettleData(prev => ({ ...prev, [item.field]: val }));
                                                }}
                                                className="w-full pl-10 pr-4 py-2.5 rounded-2xl border-2 border-slate-100 focus:border-emerald-500 outline-none text-sm font-black text-slate-700 bg-white transition-all"
                                            />
                                        </div>
                                    </div>
                                ))}
                            </div>

                            <div className="bg-emerald-900 p-5 rounded-xl text-white shadow-xl shadow-emerald-100">
                                <div className="flex justify-between items-center">
                                    <span className="text-[10px] font-black uppercase tracking-[0.2em] opacity-60">{t('settlementModal.totalActualExpenditure')}</span>
                                    <span className="text-2xl font-black">
                                        {formatCurrency(settleData.training + settleData.transport + settleData.accommodation + settleData.others)}
                                    </span>
                                </div>
                            </div>

                            {selectedRequest?.employeeRole === 'Sertifikat' && (
                                <div>
                                    <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 ml-1">{t('settlementModal.uploadCertificateEvidenceOptional')}</label>
                                    <input
                                        type="file"
                                        accept="image/*,.pdf"
                                        onChange={(e) => setSettleCertificate(e.target.files ? e.target.files[0] : null)}
                                        className="w-full px-4 py-3 rounded-xl border border-slate-200 outline-none text-sm text-slate-600 bg-white"
                                    />
                                </div>
                            )}

                            <div>
                                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 ml-1">{t('settlementModal.settlementNotes')}</label>
                                <textarea
                                    className="w-full px-6 py-4 rounded-lg bg-slate-50 border border-slate-100 focus:bg-white outline-none font-bold text-slate-700 text-sm resize-none"
                                    rows={3}
                                    placeholder={t('settlementModal.settlementNotesPlaceholder')}
                                    value={settleData.settlementNotes}
                                    onChange={(e) => setSettleData(prev => ({ ...prev, settlementNotes: e.target.value }))}
                                />
                            </div>
                        </div>

                        <div className="p-5 bg-slate-50 border-t border-slate-100 flex justify-end gap-4 shrink-0">
                            <button onClick={() => setIsSettlementOpen(false)} className="px-8 py-3 bg-white text-slate-400 rounded-2xl font-black text-xs tracking-widest border border-slate-200">{t('settlementModal.cancel')}</button>
                            <button onClick={handleSaveSettlement} className="px-8 py-3 bg-emerald-600 text-white rounded-2xl font-black text-xs tracking-widest shadow-lg shadow-emerald-100 hover:bg-emerald-700 transition-all">{t('settlementModal.confirmSettlement')}</button>
                        </div>
                    </div>
                </div>
            )}

            {renewTarget && (
                <div className="fixed inset-0 z-[60] flex items-center justify-center p-6 bg-slate-900/60 backdrop-blur-md animate-in fade-in">
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden animate-in zoom-in-95 flex flex-col max-h-[90vh]">
                        <div className="p-6 border-b border-slate-50 flex justify-between items-center bg-amber-50/60 shrink-0">
                            <div>
                                <h2 className="font-black text-xl text-slate-900 tracking-tight flex items-center gap-2"><Award size={20} className="text-amber-500" /> {t('requestModal.renewCertificate')}</h2>
                                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-1">{renewTarget.title}</p>
                            </div>
                            <button onClick={() => setRenewTarget(null)} className="p-3 hover:bg-slate-100 rounded-2xl text-slate-300 transition-colors"><XCircle size={24} /></button>
                        </div>

                        <div className="p-6 space-y-5 overflow-y-auto">
                            <div>
                                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 ml-1">
                                    {t('requestModal.newExpiryDate')} <span className="text-red-500">*</span>
                                </label>
                                <input
                                    type="date"
                                    value={renewExpiryDate}
                                    onChange={(e) => setRenewExpiryDate(e.target.value)}
                                    className="w-full px-4 py-2.5 rounded-2xl border-2 border-slate-100 focus:border-amber-500 outline-none text-sm font-black text-slate-700 bg-white transition-all"
                                />
                            </div>

                            <div>
                                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 ml-1">
                                    {t('requestModal.uploadRenewedCertificate')} <span className="text-red-500">*</span>
                                </label>
                                <input
                                    type="file"
                                    accept="image/*,.pdf"
                                    onChange={(e) => setRenewCertificateFile(e.target.files ? e.target.files[0] : null)}
                                    className="w-full px-4 py-3 rounded-xl border border-slate-200 outline-none text-sm text-slate-600 bg-white"
                                />
                                <p className="text-[10px] text-slate-400 mt-1.5 ml-1">{t('requestModal.renewedCertificateHint')}</p>
                            </div>

                            <label className="flex items-center gap-3 cursor-pointer">
                                <input
                                    type="checkbox"
                                    checked={renewGrantIncentive}
                                    onChange={(e) => setRenewGrantIncentive(e.target.checked)}
                                    className="w-4 h-4 rounded accent-amber-500"
                                />
                                <span className="text-sm font-bold text-slate-700">{t('requestModal.grantIncentiveForRenewal')}</span>
                            </label>

                            {renewGrantIncentive && (
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 ml-1">
                                            {t('requestModal.incentiveReward')} <span className="text-red-500">*</span>
                                        </label>
                                        <div className="relative">
                                            <span className="absolute left-4 top-3 text-xs font-black text-slate-300">Rp</span>
                                            <input
                                                type="text"
                                                value={renewIncentiveReward ? new Intl.NumberFormat('id-ID').format(Number(renewIncentiveReward)) : ''}
                                                onChange={(e) => setRenewIncentiveReward(e.target.value.replace(/\D/g, ''))}
                                                className="w-full pl-10 pr-4 py-2.5 rounded-2xl border-2 border-slate-100 focus:border-amber-500 outline-none text-sm font-black text-slate-700 bg-white transition-all"
                                            />
                                        </div>
                                    </div>
                                    <div>
                                        <label className="block text-xs font-semibold text-slate-700 mb-1">{t('requestModal.incentivePaymentType')}</label>
                                        <div className="flex gap-2">
                                            {(['One-Time', 'Recurring'] as const).map(type => (
                                                <button
                                                    key={type}
                                                    type="button"
                                                    onClick={() => setRenewIncentivePaymentType(type)}
                                                    className={`flex-1 px-3 py-2.5 rounded-2xl text-xs font-black uppercase tracking-wider border-2 transition-all ${renewIncentivePaymentType === type ? 'bg-amber-500 border-amber-500 text-white' : 'bg-white border-slate-100 text-slate-500'}`}
                                                >
                                                    {type === 'One-Time' ? t('requestModal.incentiveOneTime') : t('requestModal.incentiveRecurring')}
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>

                        <div className="p-5 bg-slate-50 border-t border-slate-100 flex justify-end gap-4 shrink-0">
                            <button onClick={() => setRenewTarget(null)} className="px-8 py-3 bg-white text-slate-400 rounded-2xl font-black text-xs tracking-widest border border-slate-200">{t('settlementModal.cancel')}</button>
                            <button
                                onClick={handleRenewCertificate}
                                disabled={!renewExpiryDate || !renewCertificateFile || (renewGrantIncentive && !renewIncentiveReward)}
                                className="px-8 py-3 bg-amber-500 text-white rounded-2xl font-black text-xs tracking-widest shadow-lg shadow-amber-100 hover:bg-amber-600 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                            >
                                {t('requestModal.confirmRenewal')}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            <ConfirmationModal
                isOpen={deleteTargetId !== null}
                onClose={() => setDeleteTargetId(null)}
                onConfirm={confirmDeleteRequest}
                title={t('alerts.confirmDeleteTitle')}
                message={t('alerts.confirmDeleteRequest')}
                variant="danger"
            />
        </div>
    );
};

export default TrainingExternalManager;
