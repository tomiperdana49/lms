import { useState, useEffect } from 'react';
import {
    Search,
    XCircle,
    CheckCircle2,
    FileText,
    DollarSign,
    Calendar,
    Trash2,
    Filter,
    Users,
    Clock,
    Briefcase,
    Link,
    Award,
    AlertTriangle,
    Download
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { useTranslation } from 'react-i18next';
import { API_BASE_URL } from '../config';
import type { TrainingRequest } from '../types';
import ConfirmationModal from './ConfirmationModal';

const INDONESIAN_MONTHS = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];

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

    // --- Filter State ---
    const [selectedYear, setSelectedYear] = useState<number | 'All'>(new Date().getFullYear());
    const [selectedPeriod, setSelectedPeriod] = useState<string>('All Year');
    const [selectedBranch, setSelectedBranch] = useState<string>('All Branches');
    const [branches, setBranches] = useState<string[]>(['All Branches']);
    const [searchQuery, setSearchQuery] = useState('');
    const [statusDrilldown, setStatusDrilldown] = useState<'PENDING' | 'APPROVED' | null>(null);
    const [deleteTargetId, setDeleteTargetId] = useState<number | null>(null);

    const fetchRequests = async () => {
        try {
            const trainRes = await fetch(`${API_BASE_URL}/api/external-training/all`);
            if (trainRes.ok) {
                const rawData = await trainRes.json();
                const mapped = rawData.map((req: any) => ({
                    id: req.id,
                    employeeName: req.employee_name,
                    employeeRole: req.category,
                    title: req.title,
                    vendor: req.vendor || t('common.notAvailable'),
                    location: req.location || t('common.notAvailable'),
                    cost: Number(req.registration_fee || 0) + Number(req.travel_flight_cost || 0) + Number(req.accommodation_cost || 0) + Number(req.miscellaneous_cost || 0),
                    date: req.created_at || req.start_date || new Date().toISOString(),
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
                    employeeRole: req.category,
                    title: req.title,
                    vendor: req.vendor || t('common.notAvailable'),
                    location: req.location || t('common.notAvailable'),
                    cost: Number(req.registration_fee || 0) + Number(req.travel_flight_cost || 0) + Number(req.accommodation_cost || 0) + Number(req.miscellaneous_cost || 0),
                    date: req.created_at || req.start_date || new Date().toISOString(),
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

    const toDatetimeLocalValue = (v: any) => {
        if (!v) return '';
        const d = new Date(v);
        if (isNaN(d.getTime())) return '';
        const pad = (n: number) => String(n).padStart(2, '0');
        return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
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
            setHrEditStartDate(toDatetimeLocalValue(selectedRequest._original?.start_date));
            setHrEditEndDate(toDatetimeLocalValue(selectedRequest._original?.end_date));
            setHrEditGriType(selectedRequest._original?.training_gr_type || '');
            setHrEditParticipationType(selectedRequest._original?.participation_type || '');
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

    // Own submitted requests are hidden from the actionable list (to avoid self-approval)
    // but must still count toward the aggregate stats above.
    const visibleRequests = drilldownFiltered.filter(req => req.employeeName !== userName);
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
            let certLink = selectedRequest?._original?.certificate_link;
            const isCertificateCategory = selectedRequest?._original?.category === 'Sertifikat';
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
                    participation_type: hrEditParticipationType || null
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
        averageCost: filteredRequests.length ? filteredRequests.reduce((sum, r) => sum + (Number(r.cost) || 0), 0) / filteredRequests.length : 0
    };

    // Export HR-processed ("APPROVED" in this component's vocabulary, i.e. DB status = 'Processed') requests
    // that are currently visible under the active year/period/branch/search filters.
    const handleExportProcessed = () => {
        const processedRequests = filteredRequests.filter(r => r.status === 'APPROVED');

        const formatExportDate = (value?: string | null) => {
            if (!value) return '';
            const d = new Date(value);
            if (isNaN(d.getTime())) return '';
            return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
        };

        const rows = processedRequests.map(req => {
            const raw = req._original || {};
            const startDate = raw.start_date ? new Date(raw.start_date) : null;
            const endDate = raw.end_date ? new Date(raw.end_date) : null;

            let trainingHours: number | string = '';
            if (startDate && endDate && !isNaN(startDate.getTime()) && !isNaN(endDate.getTime())) {
                const dayCount = Math.round((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)) + 1;
                trainingHours = dayCount > 0 ? dayCount * 8 : '';
            }

            const totalCost = (Number(req.costTraining) || 0) + (Number(req.costTransport) || 0) + (Number(req.costAccommodation) || 0) + (Number(req.costOthers) || 0);

            return {
                'Periode Bulan': startDate ? INDONESIAN_MONTHS[startDate.getMonth()] : '',
                'Start Time': formatExportDate(raw.start_date),
                'End Time': formatExportDate(raw.end_date),
                'Kategori': raw.category || req.employeeRole || '',
                'Judul': req.title || '',
                'Penyelenggara / Vendor': req.vendor || '',
                'Sertifikat': raw.certificate_link ? resolveFileUrl(raw.certificate_link) : '',
                'expired sertifikat': formatExportDate(raw.certificate_expiry_date),
                'Employee ID': req.employee_id || '',
                'Peserta': req.employeeName || '',
                'Biaya Training/Trainer': Number(req.costTraining) || 0,
                'Biaya Transportasi': Number(req.costTransport) || 0,
                'Biaya Akomodasi': Number(req.costAccommodation) || 0,
                'Biaya Lain-lain': Number(req.costOthers) || 0,
                'Total Biaya': totalCost,
                'Budget Learning per orang': Math.round(totalCost / 2),
                'Training Type': 'External',
                'Insentive sertifikat/bulan': req.incentivePaymentType === 'Recurring' ? (Number(req.incentiveReward) || 0) : '',
                'Training Hours': trainingHours,
                'Participation Type': raw.participation_type || '',
                'ESG, HSE, Other': raw.training_gr_type || ''
            };
        });

        const ws = XLSX.utils.json_to_sheet(rows);
        ws['!cols'] = [
            { wch: 12 }, { wch: 16 }, { wch: 16 }, { wch: 12 }, { wch: 24 }, { wch: 24 },
            { wch: 20 }, { wch: 16 }, { wch: 12 }, { wch: 22 }, { wch: 16 }, { wch: 16 },
            { wch: 16 }, { wch: 16 }, { wch: 16 }, { wch: 18 }, { wch: 12 }, { wch: 18 },
            { wch: 14 }, { wch: 18 }, { wch: 14 }
        ];
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
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                {[
                    { label: t('stats.totalInvestment'), value: formatCurrency(stats.totalBudget), icon: DollarSign, color: 'text-emerald-600', bg: 'bg-emerald-50', filter: null },
                    { label: t('stats.pendingApproval'), value: stats.pendingCount, icon: Clock, color: 'text-indigo-600', bg: 'bg-indigo-50', filter: 'PENDING' as const },
                    { label: t('stats.successfulEnrollments'), value: stats.approvedCount, icon: CheckCircle2, color: 'text-blue-600', bg: 'bg-blue-50', filter: 'APPROVED' as const },
                    { label: t('stats.averagePerHead'), value: formatCurrency(stats.averageCost), icon: Users, color: 'text-amber-600', bg: 'bg-amber-50', filter: null }
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
                            className={`bg-white p-6 rounded-[32px] border shadow-sm flex items-center gap-5 group transition-all duration-300 text-left ${
                                isClickable ? 'cursor-pointer hover:border-indigo-200 hover:shadow-md' : 'cursor-default'
                            } ${isActive ? 'border-indigo-300 ring-2 ring-indigo-100' : 'border-slate-100'}`}
                        >
                            <div className={`p-4 ${stat.bg} ${stat.color} rounded-2xl group-hover:scale-110 transition-transform duration-500`}>
                                <stat.icon size={24} strokeWidth={2.5} />
                            </div>
                            <div>
                                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">{stat.label}</p>
                                <p className="text-xl font-black text-slate-900 leading-none">{stat.value}</p>
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
            <div className="bg-white p-6 rounded-[32px] shadow-sm border border-slate-100 flex flex-row items-center gap-4 overflow-x-auto no-scrollbar">
                <div className="relative min-w-[300px] lg:w-[400px] flex-shrink-0">
                    <Search className="absolute left-5 top-4.5 text-slate-300" size={18} />
                    <input
                        type="text"
                        placeholder={t('filters.searchPlaceholder')}
                        className="w-full pl-14 pr-6 py-4 rounded-2xl bg-slate-50 border border-transparent focus:bg-white focus:border-indigo-500 focus:ring-4 focus:ring-indigo-100 outline-none font-bold text-slate-700 transition-all placeholder:text-slate-300"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                    />
                </div>

                <div className="flex items-center gap-3 flex-nowrap min-w-max ml-auto">
                    <div className="flex items-center gap-2 bg-slate-50 p-1 rounded-2xl border border-slate-100">
                        <div className="w-10 h-10 flex items-center justify-center bg-white rounded-xl shadow-sm text-slate-400">
                            <Filter size={16} />
                        </div>
                        <select
                            value={selectedBranch}
                            onChange={(e) => setSelectedBranch(e.target.value)}
                            className="bg-transparent px-3 py-2 rounded-xl font-black text-slate-600 text-[10px] outline-none tracking-widest cursor-pointer min-w-[140px]"
                        >
                            {branches.map(b => (
                                <option key={b} value={b}>{b.toUpperCase()}</option>
                            ))}
                        </select>
                    </div>

                    <div className="flex items-center gap-2 bg-slate-50 p-1 rounded-2xl border border-slate-100">
                        <div className="w-10 h-10 flex items-center justify-center bg-white rounded-xl shadow-sm text-slate-400">
                            <Calendar size={16} />
                        </div>
                        <select
                            value={selectedYear}
                            onChange={(e) => setSelectedYear(e.target.value === 'All' ? 'All' : parseInt(e.target.value))}
                            className="bg-transparent px-3 py-2 rounded-xl font-black text-slate-600 text-[10px] outline-none tracking-widest cursor-pointer min-w-[100px]"
                        >
                            <option value="All">{t('filters.allYears')}</option>
                            {Array.from({ length: Math.max(1, new Date().getFullYear() - 2026 + 1) }, (_, i) => 2026 + i).map(y => <option key={y} value={y}>{y}</option>)}
                        </select>
                    </div>

                    <div className="flex items-center gap-2 bg-slate-50 p-1 rounded-2xl border border-slate-100">
                        <div className="w-10 h-10 flex items-center justify-center bg-white rounded-xl shadow-sm text-slate-400">
                            <Clock size={16} />
                        </div>
                        <select
                            value={selectedPeriod}
                            onChange={(e) => setSelectedPeriod(e.target.value)}
                            className="bg-transparent px-3 py-2 rounded-xl font-black text-slate-600 text-[10px] outline-none tracking-widest cursor-pointer min-w-[140px]"
                        >
                            {periodOptions.map(opt => (
                                <option key={opt} value={opt}>{opt.toUpperCase()}</option>
                            ))}
                        </select>
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
                        visibleRequests.map(req => (
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

                                        <div className="flex flex-wrap items-center gap-2">
                                            <div className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-50 rounded-lg text-[10px] font-black text-slate-400 border border-slate-100">
                                                <Calendar size={14} className="text-slate-300" />
                                                {new Date(req.date).toLocaleDateString('en-GB')}
                                            </div>
                                            <div className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-50 rounded-lg text-[10px] font-black text-slate-400 border border-slate-100">
                                                <DollarSign size={14} className="text-slate-300" />
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
                                    </div>

                                    {(req.evidenceUrl || req.renewalCertificateUrl) && (
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
                        ))
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
                                        <input required type="datetime-local" value={hrEditStartDate} onChange={(e) => setHrEditStartDate(e.target.value)} className="w-full px-4 py-2 border border-slate-200 rounded-xl text-slate-700 focus:border-indigo-500 outline-none" />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-semibold text-slate-700 mb-1">{t('requestModal.endDate')} <span className="text-red-500">*</span></label>
                                        <input required type="datetime-local" value={hrEditEndDate} onChange={(e) => setHrEditEndDate(e.target.value)} className="w-full px-4 py-2 border border-slate-200 rounded-xl text-slate-700 focus:border-indigo-500 outline-none" />
                                    </div>
                                </div>
                            ) : (
                                <div>
                                    <label className="block text-sm font-semibold text-slate-700 mb-1">{t('requestModal.strategicJustification')}</label>
                                    <textarea readOnly value={selectedRequest.justification} className="w-full px-4 py-2 border border-slate-200 rounded-xl bg-slate-50 text-slate-700 cursor-not-allowed resize-none" rows={2} />
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
                                    {selectedRequest._original?.category === 'Sertifikat' && (
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
                            {selectedRequest.status === 'APPROVED' && selectedRequest._original?.category === 'Sertifikat' && selectedRequest.certificateExpiryDate && (userRole === 'HR' || userRole === 'HR_ADMIN') && (
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

                            {selectedRequest?._original?.category === 'Sertifikat' && (
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
