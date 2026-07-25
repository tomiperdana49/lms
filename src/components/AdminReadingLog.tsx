import { useState, useEffect } from 'react';
import { ArrowLeft, Search, CheckCircle, XCircle, Clock, Edit, ExternalLink, Image as ImageIcon, Trash2, RefreshCw, BookOpen, Trophy, ArrowUp, ArrowDown, Save, Download, ZoomIn, ZoomOut, RotateCcw, Upload } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { API_BASE_URL } from '../config';
import type { ReadingLogEntry, User, Employee } from '../types';
import * as XLSX from 'xlsx';

const getFullImageUrl = (path: string) => {
    if (!path) return '';
    if (path.startsWith('http')) return path;

    let cleanPath = path.startsWith('/') ? path.slice(1) : path;

    // If path starts with 'api/' and API_BASE_URL already contains '/api'
    if (cleanPath.startsWith('api/') && API_BASE_URL.toLowerCase().endsWith('/api')) {
        const root = API_BASE_URL.substring(0, API_BASE_URL.length - 4);
        return `${root}/${cleanPath}`;
    }

    return `${API_BASE_URL}/${cleanPath}`;
};

interface AdminReadingLogProps {
    onBack: () => void;
    user: User;
}

const categories = [
    "Buku Fiksi/Novel",
    "Majalah",
    "Komik Bisnis/Non Fiksi",
    "Buku Biografi dan Sejarah",
    "Buku Bisnis dan Manajemen",
    "Buku Paling Diminati",
    "Buku Pengembangan Diri",
    "Buku Religi dan Hubungan",
    "Buku Sales dan Marketing",
    "Buku Teknologi",
    "Buku Terlaris",
    "Buku Wajib Baca",
    "Buku Lainya"
];

const formatToDatetimeLocal = (dateStr?: string | Date) => {
    if (!dateStr) return '';
    try {
        const d = new Date(dateStr);
        if (isNaN(d.getTime())) return '';
        
        const pad = (n: number) => String(n).padStart(2, '0');
        const year = d.getFullYear();
        const month = pad(d.getMonth() + 1);
        const day = pad(d.getDate());
        const hours = pad(d.getHours());
        const minutes = pad(d.getMinutes());
        
        return `${year}-${month}-${day}T${hours}:${minutes}`;
    } catch (e) {
        return '';
    }
};

const formatNumberWithDots = (val: number | string) => {
    if (val === undefined || val === null || val === '') return '';
    const num = parseInt(String(val).replace(/\D/g, ''), 10);
    if (isNaN(num)) return '0';
    return new Intl.NumberFormat('id-ID').format(num);
};

interface ZoomableImageProps {
    src: string;
    alt: string;
}

const ZoomableImage = ({ src, alt }: ZoomableImageProps) => {
    const { t } = useTranslation('adminReadingLog');
    const [scale, setScale] = useState(1);
    const [position, setPosition] = useState({ x: 0, y: 0 });
    const [isDragging, setIsDragging] = useState(false);
    const [dragStart, setDragStart] = useState({ x: 0, y: 0 });

    const handleZoomIn = () => {
        setScale(prev => Math.min(prev + 0.5, 4));
    };

    const handleZoomOut = () => {
        setScale(prev => {
            const next = Math.max(prev - 0.5, 1);
            if (next === 1) {
                setPosition({ x: 0, y: 0 });
            }
            return next;
        });
    };

    const handleReset = () => {
        setScale(1);
        setPosition({ x: 0, y: 0 });
    };

    const handleMouseDown = (e: React.MouseEvent) => {
        if (scale <= 1) return;
        e.preventDefault();
        setIsDragging(true);
        setDragStart({ x: e.clientX - position.x, y: e.clientY - position.y });
    };

    const handleMouseMove = (e: React.MouseEvent) => {
        if (!isDragging || scale <= 1) return;
        e.preventDefault();
        setPosition({
            x: e.clientX - dragStart.x,
            y: e.clientY - dragStart.y
        });
    };

    const handleMouseUpOrLeave = () => {
        setIsDragging(false);
    };

    const handleTouchStart = (e: React.TouchEvent) => {
        if (scale <= 1 || e.touches.length !== 1) return;
        const touch = e.touches[0];
        setIsDragging(true);
        setDragStart({ x: touch.clientX - position.x, y: touch.clientY - position.y });
    };

    const handleTouchMove = (e: React.TouchEvent) => {
        if (!isDragging || scale <= 1 || e.touches.length !== 1) return;
        const touch = e.touches[0];
        setPosition({
            x: touch.clientX - dragStart.x,
            y: touch.clientY - dragStart.y
        });
    };

    const handleDoubleClick = () => {
        if (scale > 1) {
            handleReset();
        } else {
            setScale(2.5);
        }
    };

    return (
        <div className="relative w-full h-[500px] overflow-hidden rounded-lg border border-slate-200 shadow-sm bg-slate-900 flex items-center justify-center group select-none">
            {/* Image Canvas */}
            <div 
                className={`w-full h-full flex items-center justify-center transition-transform ${isDragging ? 'duration-0' : 'duration-200 ease-out'}`}
                style={{
                    transform: `translate(${position.x}px, ${position.y}px) scale(${scale})`,
                    cursor: scale > 1 ? (isDragging ? 'grabbing' : 'grab') : 'zoom-in'
                }}
                onMouseDown={handleMouseDown}
                onMouseMove={handleMouseMove}
                onMouseUp={handleMouseUpOrLeave}
                onMouseLeave={handleMouseUpOrLeave}
                onTouchStart={handleTouchStart}
                onTouchMove={handleTouchMove}
                onTouchEnd={handleMouseUpOrLeave}
                onDoubleClick={handleDoubleClick}
            >
                <img 
                    src={src} 
                    alt={alt} 
                    className="max-w-full max-h-full object-contain pointer-events-none"
                />
            </div>

            {/* Control Bar Overlay */}
            <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-1.5 bg-slate-950/80 backdrop-blur-md px-3.5 py-2 rounded-full shadow-xl border border-white/10 text-white z-10 transition-all opacity-90 group-hover:opacity-100">
                <button 
                    type="button"
                    onClick={handleZoomOut}
                    disabled={scale <= 1}
                    className="p-1.5 rounded-full hover:bg-white/10 active:scale-95 transition-all disabled:opacity-40 disabled:pointer-events-none"
                    title={t('zoomImage.zoomOut')}
                >
                    <ZoomOut size={16} />
                </button>
                <span className="text-xs font-mono font-bold w-12 text-center text-slate-300">
                    {Math.round(scale * 100)}%
                </span>
                <button
                    type="button"
                    onClick={handleZoomIn}
                    disabled={scale >= 4}
                    className="p-1.5 rounded-full hover:bg-white/10 active:scale-95 transition-all disabled:opacity-40 disabled:pointer-events-none"
                    title={t('zoomImage.zoomIn')}
                >
                    <ZoomIn size={16} />
                </button>
                <div className="w-[1px] h-4 bg-white/20 mx-1"></div>
                <button
                    type="button"
                    onClick={handleReset}
                    disabled={scale === 1 && position.x === 0 && position.y === 0}
                    className="p-1.5 rounded-full hover:bg-white/10 active:scale-95 transition-all disabled:opacity-40 disabled:pointer-events-none"
                    title={t('zoomImage.resetZoom')}
                >
                    <RotateCcw size={15} />
                </button>
            </div>

            {/* Zoom Help Prompt (only visible when not zoomed) */}
            {scale === 1 && (
                <div className="absolute top-3 right-3 bg-black/40 backdrop-blur-sm px-2.5 py-1 rounded-md text-[10px] font-medium text-slate-300 pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity">
                    {t('zoomImage.panHint')}
                </div>
            )}
        </div>
    );
};

const AdminReadingLog = ({ onBack, user }: AdminReadingLogProps) => {
    const { t } = useTranslation('adminReadingLog');
    const [allLogs, setAllLogs] = useState<ReadingLogEntry[]>([]);
    const [users, setUsers] = useState<User[]>([]);
    const [searchTerm, setSearchTerm] = useState('');
    const [startDate, setStartDate] = useState(() => {
        const y = new Date().getFullYear();
        return `${y - 1}-12-26`;
    });
    const [endDate, setEndDate] = useState(() => {
        const y = new Date().getFullYear();
        return `${y}-12-25`;
    });
    const [selectedBranch, setSelectedBranch] = useState('All Branches');
    const [branches, setBranches] = useState<string[]>(['All Branches']);
    const [filterStatus, setFilterStatus] = useState('Under Review');
    const [isSyncing, setIsSyncing] = useState(false);

    // View Mode State - Default to verification as previously requested
    const [viewMode, setViewMode] = useState<'verification' | 'recap'>('verification');




    // Verification Modal State
    const [verifyModal, setVerifyModal] = useState<{ open: boolean; log: ReadingLogEntry | null; category: 'comic' | 'text' | 'none'; reward: number }>({
        open: false,
        log: null,
        category: 'text',
        reward: 100000
    });

    // Rejection Modal State
    const [rejectModal, setRejectModal] = useState<{ open: boolean; log: ReadingLogEntry | null; reason: string }>({
        open: false,
        log: null,
        reason: ''
    });

    // Edit Log Modal State
    const [editLogModal, setEditLogModal] = useState<{ open: boolean; log: ReadingLogEntry | null; formData: Partial<ReadingLogEntry> }>({
        open: false,
        log: null,
        formData: {}
    });
    const [editEvidenceFile, setEditEvidenceFile] = useState<File | null>(null);
    const [editEvidencePreview, setEditEvidencePreview] = useState<string | null>(null);
    const [isUploadingEvidence, setIsUploadingEvidence] = useState(false);

    // Cancel Modal State (Admin)
    const [cancelModal, setCancelModal] = useState<{ open: boolean; log: ReadingLogEntry | null; reason: string }>({
        open: false,
        log: null,
        reason: ''
    });

    const [recapModal, setRecapModal] = useState<{ open: boolean; title: string; logs: ReadingLogEntry[] }>({
        open: false,
        title: '',
        logs: []
    });

    const [recapSort, setRecapSort] = useState<{ key: 'name' | 'totalBooks' | 'verifiedCount' | 'milestone' | 'incentive', direction: 'asc' | 'desc' }>({
        key: 'incentive',
        direction: 'desc'
    });

    // Sort state for verification logs table (default: old-new / earliest claimed first)
    const [verificationSort, setVerificationSort] = useState<{ key: 'claimedDate' | 'finishDate', direction: 'asc' | 'desc' }>({
        key: 'claimedDate',
        direction: 'asc'
    });

    // Photo Modal State
    const [photoModal, setPhotoModal] = useState<{ open: boolean; log: ReadingLogEntry | null }>({
        open: false,
        log: null
    });

    // Detail Modal State (Admin view)
    const [detailModal, setDetailModal] = useState<{ open: boolean; log: ReadingLogEntry | null }>({
        open: false,
        log: null
    });

    // Inline editing states for approved logs review information
    const [isEditingReviewInfo, setIsEditingReviewInfo] = useState(false);
    const [editReviewLink, setEditReviewLink] = useState('');
    const [editReviewNotes, setEditReviewNotes] = useState('');


    const fetchBranches = () => {
        fetch(`${API_BASE_URL}/api/branches`)
            .then(res => res.json())
            .then(data => {
                if (Array.isArray(data)) {
                    const names = ['All Branches', ...data.map((b: any) => b.name)];
                    setBranches(names);
                }
            })
            .catch(err => console.error(err));
    };

    const fetchLogs = () => {
        fetch(`${API_BASE_URL}/api/logs`)
            .then(res => res.json())
            .then(data => {
                if (Array.isArray(data)) setAllLogs(data);
                else setAllLogs([]);
            })
            .catch(err => console.error(err));
    };

    const fetchUsers = () => {
        fetch(`${API_BASE_URL}/api/employees`)
            .then(res => res.json())
            .then(data => {
                if (Array.isArray(data)) {
                    const mapped: User[] = data.map((emp: Employee) => ({
                        id: emp.id_employee,
                        employee_id: emp.id_employee,
                        name: emp.full_name,
                        email: emp.email,
                        branch: emp.branch_name,
                        role: (emp.job_position?.includes('HR') && !emp.job_position?.includes('HRIS')) ? 'HR' : (emp.job_position?.includes('Supervisor') ? 'SUPERVISOR' : 'STAFF'),
                        organization_name: emp.organization_name
                    }));
                    setUsers(mapped);
                }
            })
            .catch(err => console.error(err));
    };

    useEffect(() => {
        if (!editEvidenceFile) {
            setEditEvidencePreview(null);
            return;
        }
        const url = URL.createObjectURL(editEvidenceFile);
        setEditEvidencePreview(url);
        return () => URL.revokeObjectURL(url);
    }, [editEvidenceFile]);

    useEffect(() => {
        fetchBranches();
        fetchLogs();
        fetchUsers();

        // Silent background sync on mount
        const silentSync = async () => {
            try {
                await fetch(`${API_BASE_URL}/api/simas/sync`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ employee_id: 'all' })
                });
                fetchLogs(); // Refresh again after sync
            } catch (err) {
                console.error("Silent sync failed", err);
            }
        };
        silentSync();
    }, []);

    const handleExportXLSX = () => {
        try {
            // Process users using exact same filters and logic as table
            const processed = filteredUsers.map(user => ({
                user,
                stats: getUserStats(user)
            })).filter(item => item.stats.totalIncentiveRange > 0);

            // Sort using exact same sort settings as table
            processed.sort((a, b) => {
                let valA: any, valB: any;
                if (recapSort.key === 'name') {
                    valA = a.user.name.toLowerCase();
                    valB = b.user.name.toLowerCase();
                } else if (recapSort.key === 'totalBooks') {
                    valA = a.stats.totalBooksYear;
                    valB = b.stats.totalBooksYear;
                } else if (recapSort.key === 'verifiedCount') {
                    valA = a.stats.verifiedCountRange;
                    valB = b.stats.verifiedCountRange;
                } else if (recapSort.key === 'milestone') {
                    valA = a.stats.verifiedCountYear;
                    valB = b.stats.verifiedCountYear;
                } else if (recapSort.key === 'incentive') {
                    valA = a.stats.totalIncentiveRange;
                    valB = b.stats.totalIncentiveRange;
                }

                if (valA < valB) return recapSort.direction === 'asc' ? -1 : 1;
                if (valA > valB) return recapSort.direction === 'asc' ? 1 : -1;
                return 0;
            });

            // Map to flat rows for Excel sheet
            const dataToExport: any[] = [];
            const monthNames = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];
            const periodDate = new Date(endDate);
            const monthName = monthNames[periodDate.getMonth()];

            const formatTimestamp = (dateStr: string) => {
                if (!dateStr) return '';
                const d = new Date(dateStr);
                if (isNaN(d.getTime())) return dateStr;
                const pad = (n: number) => String(n).padStart(2, '0');
                return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
            };

            // Calculate Grand Total
            let grandTotal = 0;
            processed.forEach(item => {
                const userApprovedLogs = item.stats.logsRange.filter((l: ReadingLogEntry) => l.hrApprovalStatus === 'Approved');
                userApprovedLogs.forEach((log: ReadingLogEntry) => {
                    let baseAmount = 0;
                    const cat = (log.category || '').trim().toLowerCase();
                    if (cat === 'buku fiksi/novel' || cat === 'majalah' || cat === 'fiction') {
                        baseAmount = 0;
                    } else if (cat === 'komik bisnis/non fiksi' || cat === 'comic/manga' || cat === 'comic' || cat.includes('komik')) {
                        baseAmount = 50000;
                    } else {
                        baseAmount = 100000;
                    }
                    
                    let bonusAmount = 0;
                    if (baseAmount > 0) {
                        const currentSeq = getLogSequence(log);
                        if (currentSeq === 5) {
                            bonusAmount = 500000;
                        }
                    }
                    
                    grandTotal += (baseAmount + bonusAmount);
                });
            });

            processed.forEach(item => {
                const userApprovedLogs = item.stats.logsRange.filter((l: ReadingLogEntry) => l.hrApprovalStatus === 'Approved');
                if (userApprovedLogs.length === 0) return;
                
                let userTotalBase = 0;
                let userTotalBonus = 0;

                const logsData = userApprovedLogs.map((log: ReadingLogEntry) => {
                    let baseAmount = 0;
                    let bonusAmount = 0;

                    const cat = (log.category || '').trim().toLowerCase();
                    if (cat === 'buku fiksi/novel' || cat === 'majalah' || cat === 'fiction') {
                        baseAmount = 0;
                    } else if (cat === 'komik bisnis/non fiksi' || cat === 'comic/manga' || cat === 'comic' || cat.includes('komik')) {
                        baseAmount = 50000;
                    } else {
                        baseAmount = 100000;
                    }

                    if (baseAmount > 0) {
                        const currentSeq = getLogSequence(log);
                        if (currentSeq === 5) {
                            bonusAmount = 500000;
                        }
                    }

                    userTotalBase += baseAmount;
                    userTotalBonus += bonusAmount;

                    return { log, baseAmount, bonusAmount };
                });

                const userTotalAmount = userTotalBase + userTotalBonus;

                logsData.forEach(({ log, baseAmount, bonusAmount }, idx) => {
                    const timestampStr = log.claimedAt || log.approvedAt || log.finishDate || log.date;

                    let rowMonthName = monthName;
                    if (timestampStr) {
                        const d = new Date(timestampStr);
                        if (!isNaN(d.getTime())) {
                            let m = d.getMonth();
                            if (d.getDate() >= 26) {
                                m = (m + 1) % 12;
                            }
                            rowMonthName = monthNames[m];
                        }
                    }

                    dataToExport.push({
                        'Periode Bulan': rowMonthName,
                        'Timestamp': formatTimestamp(timestampStr),
                        'Employee Name': item.user.name,
                        'Judul Buku': log.title || '',
                        'Divisi': item.user.organization_name || item.user.role?.replace('_', ' ') || 'STAFF',
                        'Cabang': item.user.branch || 'Others',
                        'Insentif Buku': baseAmount,
                        'Reward Tambahan': bonusAmount,
                        'Insentif Total': idx === 0 ? userTotalAmount : null,
                        'Total Penggunaan Budget Learning': null,
                        _timestampStr: timestampStr
                    });
                });
            });

            // Post-process sort dataToExport by Period Month, then by Name
            dataToExport.forEach(d => {
                const date = new Date(d._timestampStr);
                let m = date.getMonth();
                let y = date.getFullYear();
                if (date.getDate() >= 26) {
                    m = (m + 1) % 12;
                    if (m === 0) y += 1;
                }
                d._sortMonth = y * 100 + m;
                d._rawDate = date.getTime();
            });

            dataToExport.sort((a, b) => {
                if (a._sortMonth !== b._sortMonth) return a._sortMonth - b._sortMonth;
                const nameCmp = (a['Employee Name'] || '').localeCompare(b['Employee Name'] || '');
                if (nameCmp !== 0) return nameCmp;
                return a._rawDate - b._rawDate;
            });

            dataToExport.forEach(d => {
                delete d._timestampStr;
                delete d._sortMonth;
                delete d._rawDate;
            });

            // Create XLSX worksheet
            const ws = XLSX.utils.json_to_sheet(dataToExport);
            
            // Format numbers
            const range = XLSX.utils.decode_range(ws['!ref'] || 'A1');
            for (let R = range.s.r + 1; R <= range.e.r; R++) {
                const colG = XLSX.utils.encode_cell({ c: 6, r: R }); // Insentif Buku
                const colH = XLSX.utils.encode_cell({ c: 7, r: R }); // Reward Tambahan
                const colI = XLSX.utils.encode_cell({ c: 8, r: R }); // Insentif Total
                const colJ = XLSX.utils.encode_cell({ c: 9, r: R }); // Total Budget
                
                if (ws[colG]) ws[colG].z = '#,##0';
                if (ws[colH]) {
                    if (ws[colH].v === 0) ws[colH].v = ''; 
                    ws[colH].z = '#,##0';
                }
                if (ws[colI] && ws[colI].v !== null && ws[colI].v !== '') {
                    ws[colI].z = '#,##0';
                }
                if (ws[colJ] && ws[colJ].v !== null && ws[colJ].v !== '') {
                    ws[colJ].z = '#,##0';
                }
            }

            // Format column widths beautifully
            const colsWidths = [
                { wch: 15 },  // Periode Bulan
                { wch: 20 },  // Timestamp
                { wch: 30 },  // Employee Name
                { wch: 35 },  // Judul Buku
                { wch: 15 },  // Divisi
                { wch: 20 },  // Cabang
                { wch: 15 },  // Insentif Buku
                { wch: 20 },  // Reward Tambahan
                { wch: 15 },  // Insentif Total
                { wch: 35 }   // Total Penggunaan Budget Learning
            ];
            ws['!cols'] = colsWidths;

            // Create workbook and write
            const wb = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(wb, ws, 'Recapitulation');

            // Save workbook
            const periodStr = `${startDate}_to_${endDate}`;
            XLSX.writeFile(wb, `L&D_Reading_Recap_${selectedBranch.replace(/\s+/g, '_')}_${periodStr}.xlsx`);
        } catch (error) {
            console.error('Failed to export XLSX', error);
            alert(t('alerts.failedToExportExcel'));
        }
    };

    const handleSyncSIMAS = async () => {
        if (isSyncing) return;
        setIsSyncing(true);
        try {
            const res = await fetch(`${API_BASE_URL}/api/simas/sync`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ employee_id: 'all' })
            });
            if (res.ok) {
                alert(t('alerts.simasSyncSuccess'));
                fetchLogs(); // Refresh the list
            } else {
                alert(t('alerts.simasSyncFailed'));
            }
        } catch (error) {
            console.error(error);
            alert(t('alerts.simasSyncError'));
        } finally {
            setIsSyncing(false);
        }
    };

    const handleVerifyClick = (log: ReadingLogEntry) => {
        const y = new Date(log.finishDate || log.date).getFullYear();
        const key = `${log.employee_id || log.userName || 'unknown'}_${y}`;
        const currentSeq = (approvedCounts[key] || 0) + 1;

        const cat = (log.category || '').trim().toLowerCase();
        let category: 'comic' | 'text' | 'none' = 'text';
        let baseReward = 100000;

        if (cat === 'buku fiksi/novel' || cat === 'majalah' || cat === 'fiction') {
            category = 'none';
            baseReward = 0;
        } else if (cat === 'komik bisnis/non fiksi' || cat === 'comic/manga' || cat === 'comic' || cat.includes('komik')) {
            category = 'comic';
            baseReward = 50000;
        } else {
            category = 'text';
            baseReward = 100000;
        }

        let reward = baseReward;
        if (baseReward > 0 && currentSeq === 5) {
            reward += 500000;
        }

        setVerifyModal({
            open: true,
            log: log,
            category: category,
            reward: reward
        });
    };

    const handleRejectClick = (log: ReadingLogEntry) => {
        setRejectModal({ open: true, log: log, reason: '' });
    };

    const handleVerifySubmit = async () => {
        if (!verifyModal.log) return;
        try {
            const now = new Date().toISOString();
            let managedCategory = 'Non-Fiction Text';
            if (verifyModal.category === 'comic') {
                managedCategory = 'Non-Fiction Comic/Manga';
            } else if (verifyModal.category === 'none') {
                managedCategory = 'Fiction/Magazine (No Incentive)';
            }
            const res = await fetch(`${API_BASE_URL}/api/logs/${verifyModal.log.id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    hrApprovalStatus: 'Approved',
                    managedCategory: managedCategory,
                    incentiveAmount: verifyModal.reward,
                    approvedBy: user.name || 'Admin',
                    approvedAt: now
                })
            });

            if (res.ok) {
                const updated = await res.json();
                setAllLogs(allLogs.map(l => l.id === updated.id ? {
                    ...updated,
                    approvedBy: user.name || 'Admin',
                    approvedAt: now
                } : l));
                setVerifyModal(prev => ({ ...prev, open: false }));
            }
        } catch (err) { console.error(err); }
    };

    const handleRejectSubmit = async () => {
        if (!rejectModal.log) return;
        try {
            const now = new Date().toISOString();
            const res = await fetch(`${API_BASE_URL}/api/logs/${rejectModal.log.id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    hrApprovalStatus: 'Rejected',
                    rejectionReason: rejectModal.reason,
                    cancelledBy: user.name || 'Admin',
                    cancelledAt: now
                })
            });

            if (res.ok) {
                const updated = await res.json();
                setAllLogs(allLogs.map(l => l.id === updated.id ? {
                    ...updated,
                    cancelledBy: user.name || 'Admin',
                    cancelledAt: now
                } : l));
                setRejectModal(prev => ({ ...prev, open: false }));
            }
        } catch (err) { console.error(err); }
    };

    const handleEditLogClick = (log: ReadingLogEntry) => {
        setEditEvidenceFile(null);
        setEditLogModal({
            open: true,
            log,
            formData: {
                title: log.title,
                date: log.date,
                startDate: log.startDate,
                finishDate: log.finishDate,
                link: log.link || log.review,
                evidenceUrl: log.evidenceUrl,
                category: log.category
            }
        });
    };

    const uploadEvidenceFile = async (file: File): Promise<string> => {
        const data = new FormData();
        data.append('file', file);
        const res = await fetch(`${API_BASE_URL}/api/upload`, {
            method: 'POST',
            body: data
        });
        if (!res.ok) throw new Error('Upload failed');
        const result = await res.json();
        return result.fileUrl;
    };

    const handleEditLogSubmit = async () => {
        if (!editLogModal.log) return;
        try {
            let formData = editLogModal.formData;

            if (editEvidenceFile) {
                setIsUploadingEvidence(true);
                try {
                    const uploadedUrl = await uploadEvidenceFile(editEvidenceFile);
                    formData = { ...formData, evidenceUrl: uploadedUrl };
                } catch (uploadErr) {
                    console.error(uploadErr);
                    alert(t('alerts.failedToUploadPhoto'));
                    setIsUploadingEvidence(false);
                    return;
                }
                setIsUploadingEvidence(false);
            }

            const res = await fetch(`${API_BASE_URL}/api/logs/${editLogModal.log.id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(formData)
            });

            if (res.ok) {
                const updated = await res.json();
                setAllLogs(allLogs.map(l => l.id === updated.id ? updated : l));
                setEditLogModal({ open: false, log: null, formData: {} });
                setEditEvidenceFile(null);
            }
        } catch (err) { console.error(err); }
    };

    const handleOpenDetailModal = (log: ReadingLogEntry) => {
        setDetailModal({ open: true, log });
        setEditReviewLink(log.link || log.review || '');
        setEditReviewNotes(log.review && log.review !== '-' ? log.review : '');
        setIsEditingReviewInfo(false);
    };

    const handleUpdateReviewInfo = async () => {
        if (!detailModal.log) return;
        try {
            const res = await fetch(`${API_BASE_URL}/api/logs/${detailModal.log.id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    link: editReviewLink,
                    review: editReviewNotes
                })
            });

            if (res.ok) {
                const updated = await res.json();
                
                // Update in allLogs
                setAllLogs(prevLogs => prevLogs.map(l => l.id === updated.id ? updated : l));
                
                // Update in recapModal logs if open
                if (recapModal.open) {
                    setRecapModal(prev => ({
                        ...prev,
                        logs: prev.logs.map(l => l.id === updated.id ? updated : l)
                    }));
                }
                
                // Update in detailModal
                setDetailModal(prev => ({
                    ...prev,
                    log: updated
                }));
                
                setIsEditingReviewInfo(false);
            }
        } catch (err) {
            console.error('[Update Review Info Failed]', err);
        }
    };

    const handleVerificationSortClick = (key: 'claimedDate' | 'finishDate') => {
        setVerificationSort(prev => ({
            key,
            direction: prev.key === key ? (prev.direction === 'asc' ? 'desc' : 'asc') : 'asc'
        }));
    };

    const handleCancelClick = (log: ReadingLogEntry) => {
        setCancelModal({ open: true, log, reason: '' });
    };

    const handleCancelSubmit = () => {
        if (!cancelModal.log) return;

        const finalReason = cancelModal.reason || 'Cancelled by Admin';
        const cancelBy = user?.name || user?.employee_id || 'Admin';
        
        console.log('--- CANCEL ACTION ---', { id: cancelModal.log.id, by: cancelBy, finalReason });

        fetch(`${API_BASE_URL}/api/logs/${cancelModal.log.id}/cancel`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ reason: finalReason, cancelledBy: cancelBy })
        })
            .then(res => {
                if (res.ok) {
                    setAllLogs(allLogs.map(l => l.id === cancelModal.log!.id
                        ? { ...l, status: 'Cancelled', hrApprovalStatus: 'Cancelled' as any, rejectionReason: finalReason, cancelledAt: new Date().toISOString(), cancelledBy: cancelBy }
                        : l
                    ));
                    setCancelModal({ open: false, log: null, reason: '' });
                }
            })
            .catch(err => console.error(err));
    };

    const handleDeleteLog = async (id: number | string) => {
        if (!window.confirm(t('alerts.confirmCancelReport'))) return;
        try {
            const res = await fetch(`${API_BASE_URL}/api/logs/${id}`, { method: 'DELETE' });
            if (res.ok) {
                setAllLogs(allLogs.map(log => String(log.id) === String(id) ? { ...log, status: 'Cancelled', hrApprovalStatus: 'Cancelled' as 'Cancelled' } : log));
                setTimeout(() => {
                    window.location.reload();
                }, 1000);
            } else {
                alert(t('alerts.failedToCancelReport'));
            }
        } catch (error) {
            console.error(error);
            alert(t('alerts.errorWhileCancellingReport'));
        }
    };



    const formatCurrency = (val: number) => new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(val);

    const getPeriodDates = () => {
        return [new Date(startDate), new Date(endDate + 'T23:59:59')];
    };

    const areSameUser = (u1: { employee_id?: any, name?: string }, u2: { employee_id?: any, name?: string, userName?: string }) => {
        const id1 = u1.employee_id ? String(u1.employee_id).replace(/^0+/, '') : '';
        const id2 = u2.employee_id ? String(u2.employee_id).replace(/^0+/, '') : '';
        if (id1 && id2) {
            return id1 === id2;
        }

        const n1 = (u1.name || '').trim().toLowerCase();
        const n2 = (u2.name || u2.userName || '').trim().toLowerCase();
        return n1 !== '' && n1 === n2;
    };

    const getCutoffYear = (date: Date | string | number) => {
        const d = new Date(date);
        const year = d.getFullYear();
        // If date is Dec 26 or later, it belongs to the NEXT cutoff year
        if (d.getMonth() === 11 && d.getDate() >= 26) {
            return year + 1;
        }
        return year;
    };

    const getLogSequence = (log: ReadingLogEntry) => {
        if (log.status === 'Reading') return 0;
        const logDateObj = new Date(log.finishDate || log.date);
        const cutoffY = getCutoffYear(logDateObj);

        // Filter all logs for this user within the same CUTOFF year
        const userYearLogs = allLogs.filter(l => {
            if (!areSameUser({ employee_id: log.employee_id, name: log.userName }, l)) return false;
            if (l.status === 'Reading') return false;
            const lY = getCutoffYear(l.finishDate || l.date);
            return lY === cutoffY;
        });

        // Split into categories and sort chronologically by finish/reading date
        const approvedLogs = userYearLogs
            .filter(l => l.hrApprovalStatus === 'Approved')
            .sort((a, b) => {
                const dateA = new Date(a.finishDate || a.date).getTime();
                const dateB = new Date(b.finishDate || b.date).getTime();
                if (dateA !== dateB) return dateA - dateB;
                return Number(a.id) - Number(b.id);
            });

        const pendingLogs = userYearLogs
            .filter(l => l.hrApprovalStatus === 'Pending')
            .sort((a, b) => {
                const dateA = new Date(a.finishDate || a.date).getTime();
                const dateB = new Date(b.finishDate || b.date).getTime();
                if (dateA !== dateB) return dateA - dateB;
                return Number(a.id) - Number(b.id);
            });

        if (log.hrApprovalStatus === 'Approved') {
            const idx = approvedLogs.findIndex(l => l.id === log.id);
            return idx !== -1 ? idx + 1 : 0;
        } else if (log.hrApprovalStatus === 'Pending') {
            const pIdx = pendingLogs.findIndex(l => l.id === log.id);
            return approvedLogs.length + (pIdx !== -1 ? pIdx + 1 : 1);
        }
        return 0;
    };

    const getUserStats = (user: User) => {
        const currentCutoffYear = getCutoffYear(endDate);

        // Data 1 Tahun Cutoff (26 Des - 25 Des)
        const userYearLogs = allLogs.filter(l => {
            if (!areSameUser(user, l)) return false;
            if (l.status === 'Reading') return false;
            const logCutoffY = getCutoffYear(l.claimedAt || l.finishDate || l.date);
            return logCutoffY === currentCutoffYear;
        });

        // Data Periode Range - Sekarang menggunakan TANGGAL APPROVED
        const userRangeLogs = allLogs.filter(l => {
            if (!areSameUser(user, l)) return false;
            if (l.hrApprovalStatus !== 'Approved') return false; // Hanya hitung yang sudah approved untuk range insentif
            if (l.status === 'Cancelled') return false; // Filter out Cancelled/Removed logs!
            
            // Gunakan claimedAt untuk filter range recap
            const dateStr = l.claimedAt || l.approvedAt || l.finishDate || l.date;
            const logDate = new Date(dateStr);
            
            const start = new Date(startDate);
            start.setHours(0, 0, 0, 0);
            const end = new Date(endDate);
            end.setHours(23, 59, 59, 999);
            
            return logDate >= start && logDate <= end;
        });

        const totalIncentiveRange = userRangeLogs.reduce((sum, l) => {
            if (l.hrApprovalStatus !== 'Approved') return sum;

            const dbAmount = l.incentiveAmount !== null && l.incentiveAmount !== undefined ? Number(l.incentiveAmount) : null;
            let amount = 0;
            if (dbAmount !== null && !isNaN(dbAmount)) {
                amount = dbAmount;
            } else {
                const cat = (l.category || '').trim().toLowerCase();
                if (cat === 'buku fiksi/novel' || cat === 'majalah' || cat === 'fiction') {
                    amount = 0;
                } else if (cat === 'komik bisnis/non fiksi' || cat === 'comic/manga' || cat === 'comic' || cat.includes('komik')) {
                    amount = 50000;
                } else {
                    amount = 100000;
                }
            }

            return sum + amount;
        }, 0);

        return {
            totalBooksYear: userYearLogs.filter(l => l.status !== 'Cancelled').length,
            verifiedCountYear: userYearLogs.filter(l => l.hrApprovalStatus === 'Approved' && l.status !== 'Cancelled').length,
            verifiedCountRange: userRangeLogs.filter(l => l.hrApprovalStatus === 'Approved' && l.status !== 'Cancelled').length,
            totalIncentiveRange,
            logsYear: userYearLogs.filter(l => l.status !== 'Cancelled'),
            logsRange: userRangeLogs.filter(l => l.status !== 'Cancelled')
        };
    };

    const filteredUsers = users.filter(user => {
        const matchesSearch = user.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
            user.email.toLowerCase().includes(searchTerm.toLowerCase());
        const matchesBranch = selectedBranch === 'All Branches' || user.branch === selectedBranch;
        return matchesSearch && matchesBranch;
    });

    const approvedCounts = allLogs.reduce((acc: Record<string, number>, log) => {
        if (log.hrApprovalStatus === 'Approved') {
            const cutoffY = getCutoffYear(log.finishDate || log.date);
            const key = `${log.employee_id || log.userName || 'unknown'}_${cutoffY}`;
            acc[key] = (acc[key] || 0) + 1;
        }
        return acc;
    }, {});
    const verificationLogs = allLogs
        .filter(l => {
            if (filterStatus !== 'all') {
                if (filterStatus === 'Reading') {
                    // Sedang Baca = Statusnya Reading DAN belum ada tanggal selesai
                    if (l.finishDate || l.status !== 'Reading') return false;
                } else if (filterStatus === 'Read') {
                    // Selesai Baca = Sudah ada tanggal selesai DAN status Draft
                    if (!l.finishDate || (l.hrApprovalStatus !== 'Draft' && !!l.hrApprovalStatus)) return false;
                } else if (filterStatus === 'Approved') {
                    if (l.hrApprovalStatus !== 'Approved') return false;
                } else if (filterStatus === 'Under Review') {
                    if (!l.finishDate || l.hrApprovalStatus !== 'Pending') return false;
                } else if (filterStatus === 'Cancel') {
                    if (l.status !== 'Cancelled') return false;
                } else if (filterStatus === 'Rejected HRD') {
                    if (l.hrApprovalStatus !== 'Rejected') return false;
                }
            }

            // Always hide Cancelled logs from standard verification unless filtered for them
            if (filterStatus === 'all' && l.status === 'Cancelled') return false;
            if (filterStatus !== 'Cancel' && l.status === 'Cancelled') return false;

            let emp = users.find(u => l.employee_id && u.employee_id === l.employee_id);
            if (!emp) emp = users.find(u => l.userName && u.name && l.userName.trim().toLowerCase() === u.name.trim().toLowerCase());
            const empBranch = emp?.branch || 'Others';
            if (selectedBranch !== 'All Branches' && empBranch !== selectedBranch) return false;

            // --- Date Filter ---
            const dateStr = l.claimedAt || l.approvedAt || l.finishDate || l.date;
            const d = new Date(dateStr);
            const [start, end] = getPeriodDates();
            if (d < start || d > end) return false;

            // 4. Search Filter
            const s = searchTerm.trim().toLowerCase();
            if (s) {
                const logName = (l.userName || '').toLowerCase();
                const matchedName = (emp?.name || '').toLowerCase();
                const matchedEmail = (emp?.email || '').toLowerCase();

                const matches = logName.includes(s) ||
                    matchedName.includes(s) ||
                    matchedEmail.includes(s) ||
                    (l.title || '').toLowerCase().includes(s);

                if (!matches) return false;
            }

            return true;
        })
        .sort((a, b) => {
            if (a.hrApprovalStatus === 'Pending' && b.hrApprovalStatus !== 'Pending') return -1;
            if (a.hrApprovalStatus !== 'Pending' && b.hrApprovalStatus === 'Pending') return 1;
            
            let dateA = 0;
            let dateB = 0;
            if (verificationSort.key === 'claimedDate') {
                dateA = new Date(a.claimedAt || a.finishDate || a.date).getTime();
                dateB = new Date(b.claimedAt || b.finishDate || b.date).getTime();
            } else {
                dateA = new Date(a.finishDate || a.date).getTime();
                dateB = new Date(b.finishDate || b.date).getTime();
            }

            if (verificationSort.direction === 'asc') {
                return dateA - dateB;
            } else {
                return dateB - dateA;
            }
        });

    return (
        <div className="space-y-6 animate-fade-in relative min-h-screen pb-20">
            <div className="flex flex-col gap-4">
                <button onClick={onBack} className="flex items-center text-slate-500 hover:text-slate-800 transition-colors w-fit group">
                    <ArrowLeft size={20} className="mr-2 group-hover:-translate-x-1 transition-transform" /> {t('header.backToDashboard')}
                </button>

                <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                    <div>
                        <h1 className="text-2xl font-bold text-slate-800">{t('header.title')}</h1>
                        <p className="text-slate-500">{t('header.subtitle')}</p>
                    </div>
                    <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 w-full sm:w-auto">
                        {viewMode === 'recap' && (
                            <button
                                onClick={handleExportXLSX}
                                className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold bg-emerald-600 hover:bg-emerald-700 text-white transition-all shadow-md w-full sm:w-auto cursor-pointer"
                                title={t('actions.exportXLSXTitle')}
                            >
                                <Download size={18} />
                                {t('actions.exportXLSX')}
                            </button>
                        )}
                        <button
                            onClick={handleSyncSIMAS}
                            disabled={isSyncing}
                            className={`flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold transition-all shadow-sm border ${isSyncing ? 'bg-slate-50 text-slate-400 border-slate-200' : 'bg-white text-emerald-600 border-emerald-100 hover:bg-emerald-50 hover:border-emerald-200'} w-full sm:w-auto`}
                            title={t('actions.syncSIMASTitle')}
                        >
                            <RefreshCw size={18} className={isSyncing ? 'animate-spin' : ''} />
                            {isSyncing ? t('actions.syncing') : t('actions.syncSIMAS')}
                        </button>
                        <div className="bg-slate-100 p-1 rounded-xl flex shadow-inner w-full sm:w-auto justify-center">
                            <button
                                onClick={() => {
                                    setViewMode('verification');
                                    // Reset to Full Year for Verification
                                    const y = new Date().getFullYear();
                                    setStartDate(`${y - 1}-12-26`);
                                    setEndDate(`${y}-12-25`);
                                }}
                                className={`flex-1 sm:flex-none px-4 py-2 rounded-lg text-sm font-bold transition-all text-center ${viewMode === 'verification' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                            >
                                {t('actions.verification')}
                            </button>
                            <button
                                onClick={() => {
                                    setViewMode('recap');
                                    // Reset to Rolling Cycle for Recap (Periode bulan berjalan)
                                    const now = new Date();
                                    const m = now.getMonth();
                                    const y = now.getFullYear();

                                    // Selalu ambil 26 bulan lalu s/d 25 bulan ini
                                    const d = new Date(y, m - 1, 26);
                                    const ed = new Date(y, m, 25);

                                    setStartDate(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`);
                                    setEndDate(`${ed.getFullYear()}-${String(ed.getMonth() + 1).padStart(2, '0')}-${String(ed.getDate()).padStart(2, '0')}`);
                                }}
                                className={`flex-1 sm:flex-none px-4 py-2 rounded-lg text-sm font-bold transition-all text-center ${viewMode === 'recap' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                            >
                                {t('actions.recapitulation')}
                            </button>
                        </div>
                    </div>
                </div>
            </div>

            <div className="bg-white p-4 rounded-2xl shadow-sm border border-slate-200 flex flex-col lg:flex-row gap-4 items-stretch lg:items-center mb-6">
                <div className="flex flex-col sm:flex-row lg:flex-nowrap gap-3 items-stretch sm:items-center flex-1">
                    <select value={selectedBranch} onChange={(e) => setSelectedBranch(e.target.value)} className="px-4 py-2.5 rounded-xl border border-slate-200 font-bold text-slate-600 text-sm outline-none focus:ring-2 focus:ring-blue-500 bg-white w-full sm:w-auto min-w-[150px]">
                        {branches.map(b => <option key={b} value={b}>{b}</option>)}
                    </select>
                    <div className="flex items-center justify-between sm:justify-start gap-2 bg-slate-50 px-3 py-2.5 rounded-xl border border-slate-100 w-full sm:w-auto">
                        <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} onClick={(e) => e.currentTarget.showPicker()} className="bg-transparent border-none font-bold text-slate-600 text-xs outline-none focus:ring-0 cursor-pointer w-[110px]" />
                        <span className="text-slate-400 font-medium text-xs">{t('filters.dateTo')}</span>
                        <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} onClick={(e) => e.currentTarget.showPicker()} className="bg-transparent border-none font-bold text-slate-600 text-xs outline-none focus:ring-0 cursor-pointer w-[110px]" />
                    </div>
                    {viewMode === 'verification' && (
                        <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} className="px-4 py-2.5 rounded-xl border border-slate-200 font-bold text-slate-600 text-sm outline-none focus:ring-2 focus:ring-blue-500 bg-white w-full sm:w-auto">
                            <option value="all">{t('filters.status.all')}</option>
                            <option value="Reading">{t('filters.status.reading')}</option>
                            <option value="Read">{t('filters.status.read')}</option>
                            <option value="Approved">{t('filters.status.approved')}</option>
                            <option value="Under Review">{t('filters.status.underReview')}</option>
                            <option value="Rejected HRD">{t('filters.status.rejectedHRD')}</option>
                            <option value="Cancel">{t('filters.status.removed')}</option>
                        </select>
                    )}
                </div>
                <div className="relative w-full lg:w-72">
                    <Search className="absolute left-4 top-3.5 text-slate-400" size={18} />
                    <input type="text" placeholder={t('filters.searchPlaceholder')} className="w-full pl-11 pr-4 py-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-blue-500 outline-none font-medium text-slate-600 text-sm" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
                </div>
            </div>

            {viewMode === 'recap' && (
                <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden animate-in slide-in-from-bottom-4 fade-in">
                    <div className="overflow-x-auto">
                        <table className="w-full text-left">
                            <thead className="bg-white text-xs uppercase text-slate-500 font-bold border-b border-slate-100">
                                <tr>
                                    <th className="px-6 py-4 w-[30%] cursor-pointer hover:bg-slate-50 transition-colors" onClick={() => setRecapSort({ key: 'name', direction: recapSort.key === 'name' && recapSort.direction === 'asc' ? 'desc' : 'asc' })}>
                                        <div className="flex items-center gap-1.5">
                                            {t('recapTable.nameEmail')} {recapSort.key === 'name' && (recapSort.direction === 'asc' ? <ArrowUp size={14} /> : <ArrowDown size={14} />)}
                                        </div>
                                    </th>
                                    <th className="px-6 py-4 w-[15%]">{t('recapTable.role')}</th>
                                    <th className="px-6 py-4 w-[25%] cursor-pointer hover:bg-slate-50 transition-colors" onClick={() => setRecapSort({ key: 'totalBooks', direction: recapSort.key === 'totalBooks' && recapSort.direction === 'asc' ? 'desc' : 'asc' })}>
                                        <div className="flex items-center gap-1.5">
                                            {t('recapTable.booksRead')} {recapSort.key === 'totalBooks' && (recapSort.direction === 'asc' ? <ArrowUp size={14} /> : <ArrowDown size={14} />)}
                                        </div>
                                    </th>
                                    <th className="px-6 py-4 w-[20%] cursor-pointer hover:bg-slate-50 transition-colors" onClick={() => setRecapSort({ key: 'milestone', direction: recapSort.key === 'milestone' && recapSort.direction === 'asc' ? 'desc' : 'asc' })}>
                                        <div className="flex items-center gap-1.5">
                                            {t('recapTable.bonusStatus')} {recapSort.key === 'milestone' && (recapSort.direction === 'asc' ? <ArrowUp size={14} /> : <ArrowDown size={14} />)}
                                        </div>
                                    </th>
                                    <th className="px-6 py-4 w-[20%] cursor-pointer hover:bg-slate-50 transition-colors" onClick={() => setRecapSort({ key: 'incentive', direction: recapSort.key === 'incentive' && recapSort.direction === 'asc' ? 'desc' : 'asc' })}>
                                        <div className="flex items-center gap-1.5 justify-end">
                                            {t('recapTable.totalIncentive', { month: new Date(endDate).toLocaleString('en-US', { month: 'short' }) })} {recapSort.key === 'incentive' && (recapSort.direction === 'asc' ? <ArrowUp size={14} /> : <ArrowDown size={14} />)}
                                        </div>
                                    </th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-50">
                                {(() => {
                                    const processedUsers = filteredUsers.map(user => ({
                                        user,
                                        stats: getUserStats(user)
                                    }));

                                    processedUsers.sort((a, b) => {
                                        let valA: any, valB: any;
                                        if (recapSort.key === 'name') {
                                            valA = a.user.name.toLowerCase();
                                            valB = b.user.name.toLowerCase();
                                        } else if (recapSort.key === 'totalBooks') {
                                            valA = a.stats.totalBooksYear;
                                            valB = b.stats.totalBooksYear;
                                        } else if (recapSort.key === 'verifiedCount') {
                                            valA = a.stats.verifiedCountRange;
                                            valB = b.stats.verifiedCountRange;
                                        } else if (recapSort.key === 'milestone') {
                                            valA = a.stats.verifiedCountYear;
                                            valB = b.stats.verifiedCountYear;
                                        } else if (recapSort.key === 'incentive') {
                                            valA = a.stats.totalIncentiveRange;
                                            valB = b.stats.totalIncentiveRange;
                                        }

                                        if (valA < valB) return recapSort.direction === 'asc' ? -1 : 1;
                                        if (valA > valB) return recapSort.direction === 'asc' ? 1 : -1;
                                        return 0;
                                    });

                                    return processedUsers.map(({ user, stats }) => {
                                        const isEligible = stats.verifiedCountYear >= 5;
                                        const remaining = 5 - stats.verifiedCountYear;
                                        return (
                                            <tr key={user.employee_id || user.email} className="hover:bg-slate-50 transition-colors group">
                                                <td className="px-6 py-4">
                                                    <div><p className="font-bold text-slate-800">{user.name}</p><p className="text-xs text-slate-400">{user.email}</p></div>
                                                </td>
                                                <td className="px-6 py-4">
                                                    <span className={`px-2 py-1 rounded text-[10px] font-bold uppercase ${user.role === 'HR' || user.role === 'HR_ADMIN' ? 'bg-purple-100 text-purple-700' : user.role === 'SUPERVISOR' ? 'bg-blue-100 text-blue-700' : 'bg-green-100 text-green-700'}`}>{user.role?.replace('_', ' ') || t('common.staffRoleFallback')}</span>
                                                </td>
                                                <td className="px-6 py-4">
                                                    <div className="flex items-center gap-2">
                                                        <button
                                                            className="group flex items-center gap-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500 rounded-lg px-3 py-1.5 bg-white border border-slate-200 hover:border-blue-300 hover:bg-blue-50 hover:shadow-sm transition-all active:scale-95"
                                                            onClick={() => setRecapModal({ open: true, title: t('recapTable.booksReadByModalTitle', { name: user.name, year: new Date(endDate).getFullYear() }), logs: stats.logsYear })}
                                                        >
                                                            <span className="text-slate-800 font-bold text-lg group-hover:text-blue-700 transition-colors">{stats.totalBooksYear}</span>
                                                            <span className="text-slate-500 text-sm group-hover:text-blue-600 transition-colors">{t('recapTable.books')}</span>
                                                        </button>
                                                        {stats.verifiedCountRange > 0 && (
                                                            <button
                                                                className="group flex items-center gap-1 focus:outline-none focus:ring-2 focus:ring-green-500 rounded-lg px-2.5 py-1.5 bg-green-50 border border-green-200 hover:border-green-400 hover:bg-green-100 hover:shadow-sm transition-all active:scale-95 text-green-700 text-xs font-bold whitespace-nowrap"
                                                                onClick={() => setRecapModal({ open: true, title: t('recapTable.verifiedBooksModalTitle', { name: user.name }), logs: stats.logsRange.filter(l => l.hrApprovalStatus === 'Approved') })}
                                                            >
                                                                <CheckCircle size={14} className="text-green-500 group-hover:text-green-600 transition-colors" />
                                                                {t('recapTable.verifiedMonth', { count: stats.verifiedCountRange, month: new Date(endDate).toLocaleString('en-US', { month: 'short' }) })}
                                                            </button>
                                                        )}
                                                    </div>
                                                </td>
                                                <td className="px-6 py-4">
                                                    <div className="flex flex-col gap-1 items-start">
                                                        {isEligible ? (
                                                            <span className="flex items-center gap-1.5 text-white bg-green-600 font-black text-[10px] px-2.5 py-1 rounded-full uppercase shadow-sm border border-green-500 animate-pulse">
                                                                <Trophy size={12} /> {t('recapTable.milestonePassed')}
                                                            </span>
                                                        ) : (
                                                            <div className="flex flex-col">
                                                                <span className="flex items-center gap-1 text-slate-500 text-[11px] font-bold italic">
                                                                    <Clock size={12} /> {remaining > 0 ? t('recapTable.moreToBonus', { count: remaining }) : t('recapTable.pendingReview')}
                                                                </span>
                                                                <div className="w-24 h-1.5 bg-slate-100 rounded-full mt-1 overflow-hidden">
                                                                    <div className="h-full bg-blue-500 rounded-full" style={{ width: `${(stats.verifiedCountYear / 5) * 100}%` }}></div>
                                                                </div>
                                                            </div>
                                                        )}
                                                    </div>
                                                </td>
                                                <td className="px-6 py-4">
                                                    {stats.totalIncentiveRange > 0 ? (
                                                        <div className="flex flex-col items-end">
                                                            <span className="text-green-700 font-black text-sm bg-green-50 px-2.5 py-1 rounded-lg border border-green-200 shadow-sm">
                                                                {formatCurrency(stats.totalIncentiveRange)}
                                                            </span>
                                                        </div>
                                                    ) : (
                                                        <div className="text-slate-300 text-sm font-medium italic text-right">-</div>
                                                    )}
                                                </td>
                                            </tr>
                                        );
                                    });
                                })()}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {viewMode === 'verification' && (
                <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden animate-in slide-in-from-bottom-4 fade-in">
                    <div className="p-4 border-b border-slate-100 bg-slate-50/50 flex justify-between items-center">
                        <h3 className="font-bold text-slate-700 flex items-center gap-2"><CheckCircle size={18} className="text-orange-500" /> {t('verificationTable.sectionTitle')}</h3>
                    </div>
                    <div className="overflow-x-auto">
                        <table className="w-full text-left">
                            <thead className="bg-slate-50 text-slate-500 font-semibold uppercase text-xs select-none">
                                <tr>
                                    <th className="px-6 py-4">{t('verificationTable.employee')}</th>
                                    <th className="px-6 py-4">{t('verificationTable.bookTitleSource')}</th>
                                    <th className="px-6 py-4 cursor-pointer hover:bg-slate-100/80 transition-colors" onClick={() => handleVerificationSortClick('finishDate')}>
                                        <div className="flex items-center gap-1">
                                            <span>{t('verificationTable.finishDate')}</span>
                                            {verificationSort.key === 'finishDate' && (
                                                verificationSort.direction === 'asc' ? <ArrowUp size={14} className="text-slate-400" /> : <ArrowDown size={14} className="text-slate-400" />
                                            )}
                                        </div>
                                    </th>
                                    <th className="px-6 py-4 text-purple-600 cursor-pointer hover:bg-slate-100/80 transition-colors" onClick={() => handleVerificationSortClick('claimedDate')}>
                                        <div className="flex items-center gap-1">
                                            <span>{t('verificationTable.claimedDate')}</span>
                                            {verificationSort.key === 'claimedDate' && (
                                                verificationSort.direction === 'asc' ? <ArrowUp size={14} className="text-purple-500 animate-in fade-in zoom-in-75" /> : <ArrowDown size={14} className="text-purple-500 animate-in fade-in zoom-in-75" />
                                            )}
                                        </div>
                                    </th>
                                    <th className="px-6 py-4">{t('verificationTable.status')}</th>
                                    <th className="px-6 py-4 text-center">{t('verificationTable.action')}</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {verificationLogs.map((log) => (
                                    <tr key={log.id} className="hover:bg-slate-50 transition-colors">
                                        <td className="px-6 py-4">
                                            {(() => {
                                                let emp = users.find(u => log.employee_id && u.employee_id === log.employee_id);
                                                if (!emp) emp = users.find(u => log.userName && u.name && log.userName.trim().toLowerCase() === u.name.trim().toLowerCase());
                                                return (
                                                    <div className="flex flex-col">
                                                        <p className="font-bold text-slate-700 text-sm">{emp?.name || log.userName || t('verificationTable.unknown')}</p>
                                                        {emp?.employee_id && <p className="text-[11px] text-slate-500 font-medium mt-0.5">{t('verificationTable.idLabel', { id: emp.employee_id })}</p>}
                                                        {emp?.email && <p className="text-[11px] text-slate-400">{emp.email}</p>}
                                                        {!emp?.employee_id && !emp?.email && <p className="text-[11px] text-slate-400">{t('verificationTable.staff')}</p>}
                                                    </div>
                                                );
                                            })()}
                                        </td>
                                        <td className="px-6 py-4"><div className="flex flex-col gap-1"><span onClick={() => handleOpenDetailModal(log)} className="font-semibold text-slate-800 text-sm cursor-pointer hover:text-blue-600 transition-colors">{log.title}</span><span className="text-xs text-slate-500">{log.category}</span><span className={`text-[10px] font-bold px-2 py-0.5 rounded w-fit ${log.source === 'Personal Book' || log.source === 'Buku Pribadi' ? 'bg-purple-100 text-purple-700 border border-purple-200' : 'bg-blue-100 text-blue-700 border border-blue-200'}`}>{log.source === 'Personal Book' || log.source === 'Buku Pribadi' ? t('source.personal') : (log.source === 'SIMAS' ? t('source.simas') : t('source.office'))}</span></div></td>
                                        <td className="px-6 py-4 text-sm text-slate-600">
                                            <div className="flex flex-col gap-1">
                                                <span>{log.finishDate ? new Date(log.finishDate).toLocaleString('en-US', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '-'}</span>
                                            </div>
                                        </td>
                                        <td className="px-6 py-4 text-xs font-bold text-purple-600">
                                            {log.claimedAt ? new Date(log.claimedAt).toLocaleString('en-US', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '-'}
                                        </td>

                                        <td className="px-6 py-4">
                                            <span className={`px-2 py-1 rounded text-[10px] font-bold uppercase border ${
                                                log.status === 'Reading' ? 'bg-orange-50 text-orange-600 border-orange-100' :
                                                log.hrApprovalStatus === 'Approved' ? 'bg-indigo-100 text-indigo-700 border-indigo-200' : 
                                                log.hrApprovalStatus === 'Rejected' ? 'bg-red-100 text-red-700 border-red-200' : 
                                                log.hrApprovalStatus === 'Pending' ? 'bg-orange-100 text-orange-700 border-orange-200' : 
                                                'bg-slate-100 text-slate-500 border-slate-200'
                                            }`}>
                                                {log.status === 'Reading' ? t('status.reading') : (log.status === 'Cancelled' || log.hrApprovalStatus === 'Cancelled' ? t('status.removed') : (log.hrApprovalStatus === 'Pending' ? t('status.underReview') : ((log.hrApprovalStatus as any) === 'Draft' || !log.hrApprovalStatus ? t('status.read') : (log.hrApprovalStatus === 'Approved' ? t('status.approved') : (log.hrApprovalStatus === 'Rejected' ? t('status.rejected') : log.hrApprovalStatus)))))}
                                            </span>
                                                    {Number(log.incentiveAmount) > 0 && (
                                                        <div className="mt-1">
                                                            {(() => {
                                                                const seq = getLogSequence(log);
                                                                const amount = Number(log.incentiveAmount) || 0;
                                                                if (seq === 5) {
                                                                    const hasBonus = amount > 500000;
                                                                    const baseAmount = hasBonus ? amount - 500000 : amount;
                                                                    return (
                                                                        <div className="flex flex-col items-center bg-orange-50 p-1 rounded border border-orange-100 shadow-sm animate-pulse">
                                                                            <span className="text-[9px] text-orange-600 font-black tracking-tighter uppercase">{t('verificationTable.milestoneBonus')}</span>
                                                                            <div className="flex flex-col items-center">
                                                                                <span className="text-[11px] font-bold text-green-700">{formatCurrency(baseAmount)} + Rp 500.000</span>
                                                                                <span className="text-[9px] text-slate-500 font-black">= {formatCurrency(baseAmount + 500000)}</span>
                                                                            </div>
                                                                        </div>
                                                                    );
                                                                }
                                                                return <span className="text-[10px] font-bold text-green-600">{formatCurrency(amount)}</span>;
                                                            })()}
                                                        </div>
                                                    )}
                                        </td>
                                        <td className="px-6 py-4 text-center">
                                            {log.status === 'Reading' ? (
                                                <span className="text-xs text-slate-300 italic">-</span>
                                            ) : log.status !== 'Cancelled' ? (
                                                <div className="flex justify-center gap-2">
                                                     {log.hrApprovalStatus === 'Pending' ? (
                                                        (() => {
                                                            const currentSeq = getLogSequence(log);
                                                            if (currentSeq <= 5) {
                                                                return (
                                                                    <div className="grid grid-cols-2 gap-2 min-w-[180px]">
                                                                        <button
                                                                            onClick={() => handleVerifyClick(log)}
                                                                            className="flex items-center justify-center gap-1.5 px-2 py-1.5 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-all shadow-sm font-bold text-[11px]"
                                                                            title={t('verificationTable.verifyTitle')}
                                                                        >
                                                                            <CheckCircle size={13} /> {t('verificationTable.verify')}
                                                                        </button>
                                                                        <button
                                                                            onClick={() => handleEditLogClick(log)}
                                                                            className="flex items-center justify-center gap-1.5 px-2 py-1.5 bg-slate-50 text-slate-600 rounded-lg hover:bg-slate-100 transition-colors font-bold text-[11px] border border-slate-200"
                                                                            title={t('verificationTable.editTitle')}
                                                                        >
                                                                            <Edit size={13} /> {t('verificationTable.edit')}
                                                                        </button>
                                                                        <button
                                                                            onClick={() => handleRejectClick(log)}
                                                                            className="flex items-center justify-center gap-1.5 px-2 py-1.5 bg-rose-50 text-rose-700 rounded-lg hover:bg-rose-100 transition-colors font-bold text-[11px] border border-rose-100"
                                                                            title={t('verificationTable.rejectTitle')}
                                                                        >
                                                                            <XCircle size={13} /> {t('verificationTable.reject')}
                                                                        </button>
                                                                        <button
                                                                            onClick={() => handleCancelClick(log)}
                                                                            className="flex items-center justify-center gap-1.5 px-2 py-1.5 bg-white text-slate-400 rounded-lg hover:bg-slate-50 transition-colors font-bold text-[11px] border border-slate-100"
                                                                            title={t('verificationTable.removeTitle')}
                                                                        >
                                                                            <Trash2 size={13} /> {t('verificationTable.remove')}
                                                                        </button>
                                                                    </div>
                                                                );
                                                            } else {
                                                                return (
                                                                    <div className="flex flex-col items-center">
                                                                        <span className="text-xs text-red-500 font-bold italic">{t('verificationTable.limitExceeded', { seq: currentSeq })}</span>
                                                                        <div className="flex items-center gap-2 mt-1">
                                                                            <button onClick={() => handleCancelClick(log)} className="p-1.5 bg-slate-100 text-slate-500 rounded hover:bg-slate-200" title={t('verificationTable.removeTitle')}><Trash2 size={12} /></button>
                                                                            <button onClick={() => handleRejectClick(log)} className="text-[10px] text-red-600 hover:underline flex items-center gap-1"><XCircle size={10} /> {t('verificationTable.rejectOverLimit')}</button>
                                                                        </div>
                                                                    </div>
                                                                );
                                                            }
                                                        })()
                                                    ) : (
                                                         /* For Approved, Rejected, Draft or finished logs not in Pending mode */
                                                         <div className="flex justify-center gap-1.5">
                                                             <button
                                                                 onClick={() => handleEditLogClick(log)}
                                                                 className="p-2 bg-slate-50 text-slate-600 rounded-lg hover:bg-blue-50 hover:text-blue-600 transition-all border border-slate-200 hover:border-blue-200"
                                                                 title={t('verificationTable.editTitle')}
                                                             >
                                                                 <Edit size={16} />
                                                             </button>
                                                             <button
                                                                 onClick={() => handleCancelClick(log)}
                                                                 className="p-2 bg-slate-50 text-slate-400 rounded-lg hover:bg-red-50 hover:text-red-500 transition-all border border-slate-100 hover:border-red-200"
                                                                 title={t('verificationTable.removeReportTitle')}
                                                             >
                                                                 <Trash2 size={16} />
                                                             </button>
                                                         </div>
                                                    )}
                                                </div>
                                            ) : (
                                                <span className="text-xs text-slate-300 font-bold uppercase tracking-wider italic">{t('status.removed')}</span>
                                            )}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}
            {/* Verify Modal */}
            {verifyModal.open && verifyModal.log && (
                <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                    <div className="bg-white rounded-2xl w-full max-w-md p-6 animate-in fade-in zoom-in duration-200 max-h-[90vh] overflow-y-auto pr-2">
                        <div className="flex justify-between items-center mb-6">
                            <h3 className="text-xl font-bold text-slate-800 flex items-center gap-2"><CheckCircle className="text-green-500" /> {t('verifyModal.title')}</h3>
                            <button onClick={() => setVerifyModal({ open: false, log: null, category: 'text', reward: 0 })} className="text-slate-400 hover:text-slate-600"><XCircle /></button>
                        </div>
                        <div className="space-y-4">
                            {(() => {
                                const y = new Date(verifyModal.log.finishDate || verifyModal.log.date).getFullYear();
                                const key = `${verifyModal.log.employee_id || verifyModal.log.userName || 'unknown'}_${y}`;
                                const currentSeq = (approvedCounts[key] || 0) + 1;
                                if (currentSeq === 5) {
                                    return (
                                        <div className="bg-orange-50 border border-orange-200 p-3 rounded-xl flex items-start gap-3 animate-pulse">
                                            <Trophy size={20} className="text-orange-500 mt-1" />
                                            <div>
                                                <p className="text-sm font-bold text-orange-800">{t('verifyModal.milestoneDetected')}</p>
                                                <p className="text-xs text-orange-600">{t('verifyModal.milestoneBonusNote')}</p>
                                            </div>
                                        </div>
                                    );
                                }
                                return (
                                    <div className="bg-blue-50 border border-blue-100 p-3 rounded-xl flex items-center gap-2">
                                        <BookOpen size={16} className="text-blue-500" />
                                        <p className="text-xs font-bold text-blue-700">{t('verifyModal.verifiedBookYear', { seq: currentSeq, year: y })}</p>
                                    </div>
                                );
                            })()}

                            <div className="bg-slate-50 p-4 rounded-xl border border-slate-100 flex flex-col gap-3">
                                 <div className="flex flex-col gap-1">
                                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{t('verifyModal.bookDetails')}</p>
                                    <p className="font-bold text-slate-800 text-sm leading-tight">{verifyModal.log.title}</p>
                                    <div className="flex items-center gap-2 mt-1">
                                        <span className="text-xs text-slate-500 font-medium">{verifyModal.log.category}</span>
                                        <span className="text-slate-300">•</span>
                                        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded border ${
                                            verifyModal.log.source === 'Personal Book' || verifyModal.log.source === 'Buku Pribadi'
                                                ? 'bg-purple-100 text-purple-700 border-purple-200'
                                                : verifyModal.log.source === 'SIMAS'
                                                    ? 'bg-blue-100 text-blue-700 border-blue-200'
                                                    : 'bg-indigo-100 text-indigo-700 border-indigo-200'
                                            }`}>
                                            {verifyModal.log.source === 'Personal Book' || verifyModal.log.source === 'Buku Pribadi' ? t('source.private') : (verifyModal.log.source === 'SIMAS' ? t('source.simas') : t('source.office'))}
                                        </span>
                                        {verifyModal.log.sn && (
                                            <>
                                                <span className="text-slate-300">•</span>
                                                <span className="text-[10px] font-bold text-slate-500 bg-slate-200 px-1.5 py-0.5 rounded">{t('verifyModal.snLabel', { sn: verifyModal.log.sn })}</span>
                                            </>
                                        )}
                                    </div>
                                </div>

                                {/* Approved Books History Section */}
                                {(() => {
                                    const y = new Date(verifyModal.log.finishDate || verifyModal.log.date).getFullYear();
                                    const approvedLogs = allLogs.filter(l => 
                                        areSameUser(verifyModal.log!, l) && 
                                        l.hrApprovalStatus === 'Approved' && 
                                        new Date(l.finishDate || l.date).getFullYear() === y
                                    ).sort((a, b) => new Date(a.finishDate || a.date).getTime() - new Date(b.finishDate || b.date).getTime());

                                    if (approvedLogs.length === 0) return null;

                                    return (
                                        <div className="pt-2 border-t border-slate-200/60">
                                            <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-2">{t('verifyModal.previouslyApproved', { year: y, count: approvedLogs.length })}</p>
                                            <div className="space-y-1.5 max-h-[120px] overflow-y-auto pr-1 custom-scrollbar">
                                                {approvedLogs.map((appLog, idx) => (
                                                    <div key={appLog.id} className="flex items-start gap-2 p-2 rounded-lg bg-emerald-50/50 border border-emerald-100/50">
                                                        <div className="min-w-[18px] h-[18px] rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center text-[9px] font-black mt-0.5">
                                                            {idx + 1}
                                                        </div>
                                                        <div className="flex-1">
                                                            <p className="text-[10px] font-bold text-slate-700 leading-tight">{appLog.title}</p>
                                                            <div className="flex items-center gap-1.5 mt-0.5">
                                                                <p className="text-[8px] text-slate-400 font-medium">{new Date(appLog.finishDate || appLog.date).toLocaleDateString('en-US', { day: 'numeric', month: 'short' })}</p>
                                                                <span className="text-slate-300 text-[8px]">•</span>
                                                                <span className="text-[8px] font-bold text-emerald-600">{formatCurrency(appLog.incentiveAmount || 0)}</span>
                                                            </div>
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    );
                                })()}

                                {/* Dates Grid */}
                                <div className="grid grid-cols-2 gap-4 pt-2 border-t border-slate-200/60">
                                    <div>
                                        <p className="text-[9px] font-bold text-slate-400 uppercase">{t('verifyModal.startBorrow')}</p>
                                        <p className="text-xs font-bold text-slate-700">{verifyModal.log.startDate ? new Date(verifyModal.log.startDate).toLocaleString('en-US', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '-'}</p>
                                    </div>
                                    <div>
                                        <p className="text-[9px] font-bold text-slate-400 uppercase">{t('verifyModal.finishReturn')}</p>
                                        <div className="flex items-center gap-2">
                                            <p className="text-xs font-bold text-slate-700">{verifyModal.log.finishDate ? new Date(verifyModal.log.finishDate).toLocaleString('en-US', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '-'}</p>
                                            {verifyModal.log.startDate && verifyModal.log.finishDate && (
                                                <span className="text-[10px] whitespace-nowrap font-black bg-indigo-600 text-white px-1.5 py-0.5 rounded-md shadow-sm flex items-center gap-1">
                                                    <Clock size={10} />
                                                    {(() => {
                                                        const s = new Date(verifyModal.log.startDate).getTime();
                                                        const e = new Date(verifyModal.log.finishDate).getTime();
                                                        const diff = Math.max(0, e - s);
                                                        const totalMinutes = Math.floor(diff / (1000 * 60));
                                                        const days = Math.floor(totalMinutes / (24 * 60));
                                                        const hours = Math.floor((totalMinutes % (24 * 60)) / 60);
                                                        const minutes = totalMinutes % 60;
                                                        return t('duration.format', { days, hours, minutes });
                                                    })()}
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                </div>

                                {/* Review Link */}
                                {(verifyModal.log.link || verifyModal.log.review) && (
                                    <div className="pt-2 border-t border-slate-200/60">
                                        <p className="text-[9px] font-bold text-slate-400 uppercase mb-1">{t('verifyModal.reviewLinkGoodreads')}</p>
                                        <a
                                            href={verifyModal.log.link || verifyModal.log.review}
                                            target="_blank"
                                            rel="noreferrer"
                                            className="text-blue-600 text-[11px] font-bold hover:underline flex items-center gap-1 w-fit"
                                        >
                                            <ExternalLink size={12} /> {t('verifyModal.openReviewLink')}
                                        </a>
                                    </div>
                                )}

                                {/* Evidence Thumbnails */}
                                {(verifyModal.log.evidenceUrl || verifyModal.log.returnEvidenceUrl) && (
                                    <div className="pt-2 border-t border-slate-200/60 flex gap-3">
                                        {verifyModal.log.evidenceUrl && (
                                            <div className="flex-1">
                                                <p className="text-[9px] font-bold text-slate-400 uppercase mb-1">{t('verifyModal.borrowEvidence')}</p>
                                                <div className="relative group cursor-zoom-in" onClick={() => setPhotoModal({ open: true, log: verifyModal.log })}>
                                                    <img
                                                        src={getFullImageUrl(verifyModal.log.evidenceUrl)}
                                                        alt={t('verifyModal.borrowEvidence')}
                                                        className="w-full h-14 object-cover rounded-lg border border-slate-200 shadow-sm transition-transform group-hover:scale-[1.02]"
                                                    />
                                                    <div className="absolute inset-0 bg-black/20 opacity-0 group-hover:opacity-100 transition-opacity rounded-lg flex items-center justify-center">
                                                        <ImageIcon size={16} className="text-white" />
                                                    </div>
                                                </div>
                                            </div>
                                        )}
                                        {verifyModal.log.returnEvidenceUrl && (
                                            <div className="flex-1">
                                                <p className="text-[9px] font-bold text-slate-400 uppercase mb-1">{t('verifyModal.returnEvidence')}</p>
                                                <div className="relative group cursor-zoom-in" onClick={() => setPhotoModal({ open: true, log: verifyModal.log })}>
                                                    <img
                                                        src={getFullImageUrl(verifyModal.log.returnEvidenceUrl)}
                                                        alt={t('verifyModal.returnEvidence')}
                                                        className="w-full h-14 object-cover rounded-lg border border-slate-200 shadow-sm transition-transform group-hover:scale-[1.02]"
                                                    />
                                                    <div className="absolute inset-0 bg-black/20 opacity-0 group-hover:opacity-100 transition-opacity rounded-lg flex items-center justify-center">
                                                        <ImageIcon size={16} className="text-white" />
                                                    </div>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                            <div>
                                <label className="block text-sm font-bold text-slate-700 mb-1">{t('verifyModal.bookCategory')}</label>
                                <select
                                    className="w-full px-4 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none"
                                    value={verifyModal.category}
                                    onChange={(e) => {
                                        const y = new Date(verifyModal.log!.finishDate || verifyModal.log!.date).getFullYear();
                                        const key = `${verifyModal.log!.employee_id || verifyModal.log!.userName || 'unknown'}_${y}`;
                                        const isFifth = ((approvedCounts[key] || 0) + 1) === 5;
                                        
                                        const selectedCat = e.target.value;
                                        let baseReward = 100000;
                                        if (selectedCat === 'none') {
                                            baseReward = 0;
                                        } else if (selectedCat === 'comic') {
                                            baseReward = 50000;
                                        } else {
                                            baseReward = 100000;
                                        }

                                        let finalReward = baseReward;
                                        if (baseReward > 0 && isFifth) {
                                            finalReward += 500000;
                                        }

                                        setVerifyModal(prev => ({
                                            ...prev,
                                            category: selectedCat as any,
                                            reward: finalReward
                                        }));
                                    }}
                                >
                                    <option value="text">{t('verifyModal.categoryTextOption')}</option>
                                    <option value="comic">{t('verifyModal.categoryComicOption')}</option>
                                    <option value="none">{t('verifyModal.categoryNoneOption')}</option>
                                </select>
                            </div>
                            <div>
                                <label className="block text-sm font-bold text-slate-700 mb-1">{t('verifyModal.incentiveAmount')}</label>
                                <input
                                    type="text"
                                    className="w-full px-4 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none font-bold text-green-700 bg-green-50/30"
                                    value={formatNumberWithDots(verifyModal.reward)}
                                    onChange={(e) => {
                                        const cleanVal = e.target.value.replace(/\D/g, '');
                                        const numVal = cleanVal ? parseInt(cleanVal, 10) : 0;
                                        setVerifyModal(prev => ({ ...prev, reward: numVal }));
                                    }}
                                />
                            </div>
                        </div>
                        <div className="mt-6 flex justify-end gap-3">
                            <button onClick={() => setVerifyModal({ open: false, log: null, category: 'text', reward: 0 })} className="px-4 py-2 text-slate-600 font-bold hover:bg-slate-100 rounded-xl">{t('verifyModal.cancel')}</button>
                            <button onClick={handleVerifySubmit} className="px-4 py-2 bg-green-600 text-white font-bold rounded-xl hover:bg-green-700">{t('verifyModal.approveAndSendReward')}</button>
                        </div>
                    </div>
                </div>
            )}

            {/* Reject Modal */}
            {rejectModal.open && rejectModal.log && (
                <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                    <div className="bg-white rounded-2xl w-full max-w-md p-6 animate-in fade-in zoom-in duration-200">
                        <div className="flex justify-between items-center mb-6">
                            <h3 className="text-xl font-bold text-red-600 flex items-center gap-2"><XCircle /> {t('rejectModal.title')}</h3>
                            <button onClick={() => setRejectModal({ open: false, log: null, reason: '' })} className="text-slate-400 hover:text-slate-600"><XCircle /></button>
                        </div>
                        <div>
                            <label className="block text-sm font-bold text-slate-700 mb-1">{t('rejectModal.reasonLabel')}</label>
                            <textarea
                                className="w-full px-4 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-red-500 outline-none min-h-[100px]"
                                placeholder={t('rejectModal.reasonPlaceholder')}
                                value={rejectModal.reason}
                                onChange={(e) => setRejectModal(prev => ({ ...prev, reason: e.target.value }))}
                            />
                        </div>
                        <div className="mt-6 flex justify-end gap-3">
                            <button onClick={() => setRejectModal({ open: false, log: null, reason: '' })} className="px-4 py-2 text-slate-600 font-bold hover:bg-slate-100 rounded-xl">{t('rejectModal.cancel')}</button>
                            <button onClick={handleRejectSubmit} className="px-4 py-2 bg-red-600 text-white font-bold rounded-xl hover:bg-red-700">{t('rejectModal.submit')}</button>
                        </div>
                    </div>
                </div>
            )}

            {/* Cancel Modal (Admin) */}
            {cancelModal.open && cancelModal.log && (
                <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                    <div className="bg-white rounded-2xl w-full max-w-md p-6 animate-in fade-in zoom-in duration-200">
                        <div className="flex justify-between items-center mb-6">
                            <h3 className="text-xl font-bold text-slate-700 flex items-center gap-2"><Trash2 className="text-slate-400" /> {t('cancelModal.title')}</h3>
                            <button onClick={() => setCancelModal({ open: false, log: null, reason: '' })} className="text-slate-400 hover:text-slate-600"><XCircle /></button>
                        </div>
                        <p className="text-sm text-slate-500 mb-4">
                            {t('cancelModal.description')}
                        </p>
                        <div>
                            <label className="block text-sm font-bold text-slate-700 mb-1">{t('cancelModal.reasonLabel')}</label>
                            <textarea
                                className="w-full px-4 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-slate-500 outline-none min-h-[100px]"
                                placeholder={t('cancelModal.reasonPlaceholder')}
                                value={cancelModal.reason}
                                onChange={(e) => setCancelModal(prev => ({ ...prev, reason: e.target.value }))}
                            />
                        </div>
                        <div className="mt-6 flex justify-end gap-3">
                            <button onClick={() => setCancelModal({ open: false, log: null, reason: '' })} className="px-4 py-2 text-slate-600 font-bold hover:bg-slate-100 rounded-xl">{t('cancelModal.discard')}</button>
                            <button onClick={handleCancelSubmit} className="px-4 py-2 bg-slate-800 text-white font-bold rounded-xl hover:bg-slate-900 shadow-lg">{t('cancelModal.confirm')}</button>
                        </div>
                    </div>
                </div>
            )}

            {/* Edit Modal */}
            {editLogModal.open && editLogModal.log && (
                <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                    <div className="bg-white rounded-2xl w-full max-w-md p-6 animate-in fade-in zoom-in duration-200">
                        <div className="flex justify-between items-center mb-6">
                            <h3 className="text-xl font-bold text-slate-800 flex items-center gap-2"><Edit className="text-blue-500" /> {t('editModal.title')}</h3>
                            <button onClick={() => setEditLogModal({ open: false, log: null, formData: {} })} className="text-slate-400 hover:text-slate-600"><XCircle /></button>
                        </div>
                        <div className="space-y-4 max-h-[60vh] overflow-y-auto pr-2">
                            <div>
                                <label className="block text-sm font-bold text-slate-700 mb-1">{t('editModal.titleLabel')}</label>
                                <input type="text" className="w-full px-4 py-2 border border-slate-200 rounded-xl" value={editLogModal.formData.title || ''} onChange={e => setEditLogModal(prev => ({ ...prev, formData: { ...prev.formData, title: e.target.value } }))} />
                            </div>
                            <div>
                                <label className="block text-sm font-bold text-slate-700 mb-1">{t('editModal.categoryLabel')}</label>
                                <select
                                    className="w-full px-4 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none"
                                    value={editLogModal.formData.category || ''}
                                    onChange={e => setEditLogModal(prev => ({ ...prev, formData: { ...prev.formData, category: e.target.value } }))}
                                >
                                    <option value="" disabled>{t('editModal.selectCategoryPlaceholder')}</option>
                                    {categories.map((cat, idx) => (
                                        <option key={idx} value={cat}>{cat}</option>
                                    ))}
                                </select>
                            </div>
                            <div>
                                <label className="block text-sm font-bold text-slate-700 mb-1">{t('editModal.startDateLabel')}</label>
                                <input type="datetime-local" className="w-full px-4 py-2 border border-slate-200 rounded-xl" value={formatToDatetimeLocal(editLogModal.formData.startDate || editLogModal.formData.date)} onChange={e => setEditLogModal(prev => ({ ...prev, formData: { ...prev.formData, startDate: e.target.value } }))} />
                            </div>
                            <div>
                                <label className="block text-sm font-bold text-slate-700 mb-1">{t('editModal.finishDateLabel')}</label>
                                <input type="datetime-local" className="w-full px-4 py-2 border border-slate-200 rounded-xl" value={formatToDatetimeLocal(editLogModal.formData.finishDate)} onChange={e => setEditLogModal(prev => ({ ...prev, formData: { ...prev.formData, finishDate: e.target.value } }))} />
                            </div>
                            <div>
                                <label className="block text-sm font-bold text-slate-700 mb-1">{t('editModal.evidenceUrlLabel')}</label>
                                <div className="flex items-center gap-3">
                                    <div className="w-20 h-20 rounded-xl border border-slate-200 bg-slate-50 overflow-hidden flex items-center justify-center shrink-0">
                                        {editEvidencePreview ? (
                                            <img src={editEvidencePreview} alt="" className="w-full h-full object-cover" />
                                        ) : editLogModal.formData.evidenceUrl ? (
                                            <img src={getFullImageUrl(editLogModal.formData.evidenceUrl)} alt="" className="w-full h-full object-cover" />
                                        ) : (
                                            <ImageIcon size={24} className="text-slate-300" />
                                        )}
                                    </div>
                                    <label className="flex-1 cursor-pointer px-4 py-2 border border-dashed border-slate-300 rounded-xl text-sm font-bold text-slate-500 hover:border-blue-400 hover:text-blue-500 flex items-center justify-center gap-2 text-center">
                                        <Upload size={16} />
                                        {isUploadingEvidence ? t('editModal.uploadingPhoto') : t('editModal.changePhoto')}
                                        <input type="file" accept="image/*" className="hidden" onChange={e => setEditEvidenceFile(e.target.files?.[0] || null)} />
                                    </label>
                                </div>
                            </div>
                            <div>
                                <label className="block text-sm font-bold text-slate-700 mb-1">{t('editModal.reviewLinkLabel')}</label>
                                <input type="text" className="w-full px-4 py-2 border border-slate-200 rounded-xl" value={editLogModal.formData.link || ''} onChange={e => setEditLogModal(prev => ({ ...prev, formData: { ...prev.formData, link: e.target.value } }))} />
                            </div>
                        </div>
                        <div className="mt-6 flex justify-between gap-3">
                            <button onClick={() => handleDeleteLog(editLogModal.log!.id)} className="px-4 py-2 text-red-600 font-bold hover:bg-red-50 rounded-xl border border-red-200 flex items-center"><Trash2 size={16} className="mr-2" /> {t('editModal.delete')}</button>
                            <div className="flex gap-2">
                                <button onClick={() => { setEditLogModal({ open: false, log: null, formData: {} }); setEditEvidenceFile(null); }} className="px-4 py-2 text-slate-600 font-bold hover:bg-slate-100 rounded-xl">{t('editModal.cancel')}</button>
                                <button onClick={handleEditLogSubmit} disabled={isUploadingEvidence} className="px-4 py-2 bg-blue-600 text-white font-bold rounded-xl hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed">{isUploadingEvidence ? t('editModal.uploadingPhoto') : t('editModal.saveChanges')}</button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
            {/* Detail Modal */}
            {detailModal.open && detailModal.log && (
                <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm animate-in fade-in" onClick={() => { setDetailModal({ open: false, log: null }); setIsEditingReviewInfo(false); }}>
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md flex flex-col max-h-[90vh] overflow-hidden" onClick={e => e.stopPropagation()}>
                        <div className="p-6 border-b border-slate-100 flex justify-between items-start bg-slate-50">
                            <div className="min-w-0 flex-1">
                                <h3 className="text-base font-bold text-slate-800 pr-4 leading-snug break-words">{detailModal.log.title}</h3>
                                <div className="text-xs text-slate-500 mt-1.5 font-medium flex flex-wrap items-center gap-1.5">
                                    <BookOpen size={13} className="text-slate-400 shrink-0" />
                                    <span className="truncate">{detailModal.log.category}</span>
                                    <span>•</span>
                                    <span className={`px-1.5 py-0.5 rounded text-[9px] font-black uppercase shrink-0 ${
                                        detailModal.log.source === 'Personal Book' || detailModal.log.source === 'Buku Pribadi'
                                            ? 'bg-purple-50 text-purple-700 border border-purple-100'
                                            : 'bg-indigo-50 text-indigo-700 border border-indigo-100'
                                    }`}>
                                        {detailModal.log.source === 'Personal Book' || detailModal.log.source === 'Buku Pribadi' ? t('source.private') : (detailModal.log.source === 'SIMAS' ? t('source.simas') : t('source.office'))}
                                    </span>
                                </div>
                            </div>
                            <button onClick={() => { setDetailModal({ open: false, log: null }); setIsEditingReviewInfo(false); }} className="text-slate-400 hover:text-slate-600 bg-white p-1.5 rounded-full shadow-sm hover:shadow transition-all shrink-0">
                                <XCircle size={20} />
                            </button>
                        </div>
                        <div className="p-6 overflow-y-auto space-y-5">
                            <div className="grid grid-cols-2 gap-3">
                                <div className="bg-slate-50 p-3 rounded-xl border border-slate-100">
                                    <div className="text-[10px] font-bold text-slate-400 uppercase mb-1">{t('detailModal.status')}</div>
                                    <div className={`font-black text-xs uppercase ${detailModal.log.status === 'Finished' ? 'text-green-600' : detailModal.log.status === 'Cancelled' ? 'text-red-500' : 'text-blue-600'}`}>{detailModal.log.status === 'Finished' ? t('detailModal.read') : (detailModal.log.status === 'Cancelled' ? t('detailModal.removed') : detailModal.log.status)}</div>
                                </div>
                                <div className="bg-slate-50 p-3 rounded-xl border border-slate-100">
                                    <div className="text-[10px] font-bold text-slate-400 uppercase mb-1">{t('detailModal.hrApproval')}</div>
                                    <div className="font-black text-xs uppercase text-indigo-600">{detailModal.log.hrApprovalStatus === 'Cancelled' ? t('detailModal.removed') : (detailModal.log.hrApprovalStatus || t('detailModal.draft'))}</div>
                                </div>
                            </div>

                            {detailModal.log.rejectionReason && (
                                <div className="bg-red-50 p-3.5 rounded-xl border border-red-100">
                                    <div className="text-[10px] font-black text-red-600 uppercase mb-1.5 flex justify-between items-center">
                                        <span>{t('detailModal.rejectionRemovalNote')}</span>
                                        {detailModal.log.cancelledAt && (
                                            <span className="text-[9px] opacity-60 normal-case flex items-center gap-1 font-bold">
                                                <Clock size={10} /> {new Date(detailModal.log.cancelledAt).toLocaleString('en-US', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                                            </span>
                                        )}
                                    </div>
                                    <p className="text-xs text-red-800 font-semibold italic">"{detailModal.log.rejectionReason}"</p>
                                    {detailModal.log.cancelledBy && (
                                        <div className="mt-2 text-[9px] text-red-600/70 font-black">
                                            {t('detailModal.byLabel', { name: detailModal.log.cancelledBy })}
                                        </div>
                                    )}
                                </div>
                            )}

                            <div className="space-y-3 text-xs font-semibold text-slate-700">
                                <div className="flex justify-between py-1.5 border-b border-slate-50">
                                    <span className="text-slate-400">{t('detailModal.readerName')}</span>
                                    <span className="font-bold text-slate-800">
                                        {(() => {
                                            let emp = users.find(u => detailModal.log?.employee_id && u.employee_id === detailModal.log.employee_id);
                                            if (!emp) emp = users.find(u => detailModal.log?.userName && u.name && detailModal.log.userName.trim().toLowerCase() === u.name.trim().toLowerCase());
                                            return emp?.name || detailModal.log?.userName || t('verificationTable.unknown');
                                        })()}
                                    </span>
                                </div>
                                {detailModal.log.employee_id && (
                                    <div className="flex justify-between py-1.5 border-b border-slate-50">
                                        <span className="text-slate-400">{t('detailModal.employeeId')}</span>
                                        <span className="font-mono text-slate-800">{detailModal.log.employee_id}</span>
                                    </div>
                                )}
                                <div className="flex justify-between py-1.5 border-b border-slate-50">
                                    <span className="text-slate-400">{t('detailModal.startDate')}</span>
                                    <span className="font-bold text-slate-800">{new Date(detailModal.log.startDate || detailModal.log.date).toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
                                </div>
                                {detailModal.log.finishDate && (
                                    <div className="flex justify-between py-1.5 border-b border-slate-50 items-center">
                                        <span className="text-slate-400">{t('detailModal.finishDate')}</span>
                                        <div className="flex items-center gap-2">
                                            <span className="font-bold text-slate-800">{new Date(detailModal.log.finishDate).toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
                                            {detailModal.log.startDate && (
                                                <span className="text-[9px] whitespace-nowrap font-black bg-indigo-600 text-white px-1.5 py-0.5 rounded shadow-sm flex items-center gap-1">
                                                    <Clock size={10} />
                                                    {(() => {
                                                        const s = new Date(detailModal.log.startDate).getTime();
                                                        const e = new Date(detailModal.log.finishDate).getTime();
                                                        const diff = Math.max(0, e - s);
                                                        const totalMinutes = Math.floor(diff / (1000 * 60));
                                                        const days = Math.floor(totalMinutes / (24 * 60));
                                                        const hours = Math.floor((totalMinutes % (24 * 60)) / 60);
                                                        const minutes = totalMinutes % 60;
                                                        return t('duration.format', { days, hours, minutes });
                                                    })()}
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                )}
                                {detailModal.log.claimedAt && (
                                    <div className="flex justify-between py-1.5 border-b border-slate-50 items-center">
                                        <span className="text-slate-400">{t('detailModal.claimedDate')}</span>
                                        <span className="font-bold text-purple-600">
                                            {new Date(detailModal.log.claimedAt).toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                                        </span>
                                    </div>
                                )}
                                {detailModal.log.hrApprovalStatus === 'Approved' && (
                                    <>
                                        <div className="flex justify-between py-1.5 border-b border-slate-50">
                                            <span className="text-slate-400">{t('detailModal.approvedBy')}</span>
                                            <span className="font-bold text-blue-600">{detailModal.log.approvedBy || t('detailModal.hrAdministrator')}</span>
                                        </div>
                                        {detailModal.log.approvedAt && (
                                            <div className="flex justify-between py-1.5 border-b border-slate-50">
                                                <span className="text-slate-400">{t('detailModal.approvedTime')}</span>
                                                <span className="font-bold text-slate-800">{new Date(detailModal.log.approvedAt).toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
                                            </div>
                                        )}
                                    </>
                                )}
                                {Number(detailModal.log.incentiveAmount) > 0 && (
                                    <div className="flex justify-between py-1.5 border-b border-slate-50 items-center">
                                        <span className="text-slate-400">{t('detailModal.incentiveReward')}</span>
                                        {(() => {
                                            const seq = getLogSequence(detailModal.log);
                                            const amount = Number(detailModal.log.incentiveAmount) || 0;
                                            if (seq === 5) {
                                                const hasBonus = amount > 500000;
                                                const baseAmount = hasBonus ? amount - 500000 : amount;
                                                return (
                                                    <div className="flex flex-col items-end bg-orange-50 px-2.5 py-1 rounded-xl border border-orange-100 shadow-sm">
                                                        <span className="text-[8px] text-orange-600 font-black tracking-tighter uppercase leading-none mb-0.5">{t('detailModal.milestoneBonus')}</span>
                                                        <span className="font-bold text-green-700 text-xs">{formatCurrency(baseAmount)} + Rp 500.000</span>
                                                    </div>
                                                );
                                            }
                                            return (
                                                <span className="font-bold text-green-700 bg-green-50 px-2 py-0.5 rounded-lg border border-green-100 text-xs">
                                                    {formatCurrency(amount)}
                                                </span>
                                            );
                                        })()}
                                    </div>
                                )}
                                
                                {isEditingReviewInfo ? (
                                    <div className="space-y-4 pt-3 bg-slate-50 p-4 rounded-xl border border-slate-100 animate-in fade-in slide-in-from-top-2 duration-200">
                                        <div className="text-[10px] font-black text-blue-600 uppercase tracking-wider mb-2 flex items-center gap-1">
                                            <Edit size={12} /> {t('detailModal.editReviewDetails')}
                                        </div>

                                        <div>
                                            <label className="block text-[10px] font-black text-slate-400 uppercase mb-1">{t('editModal.reviewLinkLabel')}</label>
                                            <input
                                                type="text"
                                                className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none font-semibold text-slate-800"
                                                placeholder={t('detailModal.reviewLinkPlaceholder')}
                                                value={editReviewLink}
                                                onChange={e => setEditReviewLink(e.target.value)}
                                            />
                                        </div>

                                        <div>
                                            <label className="block text-[10px] font-black text-slate-400 uppercase mb-1">{t('detailModal.reviewNotesLabel')}</label>
                                            <textarea
                                                className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none min-h-[70px] font-semibold text-slate-700 leading-relaxed"
                                                placeholder={t('detailModal.reviewNotesPlaceholder')}
                                                value={editReviewNotes}
                                                onChange={e => setEditReviewNotes(e.target.value)}
                                            />
                                        </div>

                                        <div className="flex justify-end gap-2 pt-2 border-t border-slate-200">
                                            <button
                                                onClick={() => setIsEditingReviewInfo(false)}
                                                className="px-2.5 py-1.5 text-[11px] font-bold text-slate-500 hover:bg-slate-100 rounded-lg transition-colors"
                                            >
                                                {t('detailModal.discard')}
                                            </button>
                                            <button
                                                onClick={handleUpdateReviewInfo}
                                                className="flex items-center gap-1 px-3 py-1.5 text-[11px] font-bold bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors shadow-sm"
                                            >
                                                <Save size={12} /> {t('detailModal.save')}
                                            </button>
                                        </div>
                                    </div>
                                ) : (
                                    <div className="space-y-4">
                                        <div className="flex justify-between items-start group/section">
                                            <div className="flex-1">
                                                <div className="text-[10px] font-black text-slate-400 uppercase mb-1">{t('detailModal.reviewLink')}</div>
                                                {detailModal.log.link ? (
                                                    <a href={detailModal.log.link} target="_blank" rel="noreferrer" className="text-blue-600 hover:underline break-all flex items-center gap-1 font-bold">
                                                        {detailModal.log.link}
                                                        <ExternalLink size={12} className="inline shrink-0 text-blue-500" />
                                                    </a>
                                                ) : (
                                                    <span className="text-slate-400 italic text-[11px]">{t('detailModal.noReviewLink')}</span>
                                                )}
                                            </div>
                                            {detailModal.log.status !== 'Cancelled' && (
                                                <button
                                                    onClick={() => {
                                                        setEditReviewLink(detailModal.log?.link || '');
                                                        setEditReviewNotes(detailModal.log?.review || '');
                                                        setIsEditingReviewInfo(true);
                                                    }}
                                                    className="p-1 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors ml-2 flex items-center gap-1 font-bold text-[10px]"
                                                    title={t('detailModal.editReviewDetails')}
                                                >
                                                    <Edit size={12} /> {t('detailModal.edit')}
                                                </button>
                                            )}
                                        </div>

                                        <div>
                                            <div className="text-[10px] font-black text-slate-400 uppercase mb-1">{t('detailModal.reviewNotesLabel')}</div>
                                            {detailModal.log.review && detailModal.log.review !== '-' ? (
                                                <p className="bg-slate-50 p-3 rounded-xl border border-slate-100 text-slate-600 leading-relaxed italic">"{detailModal.log.review}"</p>
                                            ) : (
                                                <span className="text-slate-400 italic text-[11px] block bg-slate-50/50 p-2.5 rounded-xl border border-dashed border-slate-200">{t('detailModal.noReviewNotes')}</span>
                                            )}
                                        </div>
                                    </div>
                                )}
                                {detailModal.log.evidenceUrl && (
                                    <div className="pt-2">
                                        <div className="text-[10px] font-black text-slate-400 uppercase mb-2">{t('detailModal.evidencePhoto')}</div>
                                        <img
                                            src={getFullImageUrl(detailModal.log.evidenceUrl)}
                                            className="w-full rounded-xl border border-slate-200 bg-slate-50 max-h-[220px] object-cover hover:scale-[1.02] transition-transform duration-300 cursor-zoom-in"
                                            alt={t('detailModal.evidencePhoto')}
                                            onClick={() => setPhotoModal({ open: true, log: detailModal.log })}
                                        />
                                    </div>
                                )}
                                {detailModal.log.returnEvidenceUrl && (
                                    <div className="pt-2">
                                        <div className="text-[10px] font-black text-slate-400 uppercase mb-2">{t('detailModal.returnEvidencePhoto')}</div>
                                        <img
                                            src={getFullImageUrl(detailModal.log.returnEvidenceUrl)}
                                            className="w-full rounded-xl border border-slate-200 bg-slate-50 max-h-[220px] object-cover hover:scale-[1.02] transition-transform duration-300 cursor-zoom-in"
                                            alt={t('detailModal.returnEvidencePhoto')}
                                            onClick={() => setPhotoModal({ open: true, log: detailModal.log })}
                                        />
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            )}
            {/* Photo Modal */}
            {photoModal.open && photoModal.log && (
                <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[80] flex items-center justify-center p-4">
                    <div className="bg-white rounded-2xl w-full max-w-2xl p-6 relative max-h-[90vh] overflow-y-auto animate-in fade-in zoom-in duration-200">
                        <button onClick={() => setPhotoModal({ open: false, log: null })} className="absolute top-4 right-4 text-slate-400 hover:text-slate-600 bg-white rounded-full p-1 shadow-sm">
                            <XCircle size={24} />
                        </button>
                        <h3 className="text-xl font-bold text-slate-800 mb-6 pr-8">{t('photoModal.evidencePhotosFor', { title: photoModal.log.title })}</h3>

                        <div className="flex flex-col gap-6">
                             {photoModal.log.evidenceUrl && (
                                <div className="bg-slate-50 p-4 rounded-xl border border-slate-100">
                                    <p className="font-bold text-slate-700 mb-3 flex items-center gap-2">
                                        <ImageIcon className="text-blue-500" size={18} />
                                        {photoModal.log.source === 'SIMAS' ? t('photoModal.borrowingEvidencePhoto') : t('photoModal.evidencePhoto')}
                                    </p>
                                    <ZoomableImage src={getFullImageUrl(photoModal.log.evidenceUrl)} alt={t('photoModal.borrowingEvidencePhoto')} />
                                </div>
                            )}

                            {photoModal.log.returnEvidenceUrl && (
                                <div className="bg-slate-50 p-4 rounded-xl border border-slate-100">
                                    <p className="font-bold text-slate-700 mb-3 flex items-center gap-2">
                                        <ImageIcon className="text-green-500" size={18} />
                                        {t('photoModal.returnEvidencePhoto')}
                                    </p>
                                    <ZoomableImage src={getFullImageUrl(photoModal.log.returnEvidenceUrl)} alt={t('photoModal.returnEvidencePhoto')} />
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}
            {/* Recap Logs List Modal */}
            {recapModal.open && (
                <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm animate-in fade-in" onClick={() => setRecapModal({ ...recapModal, open: false })}>
                    <div className="bg-white rounded-2xl w-full max-w-3xl flex flex-col max-h-[85vh] animate-in fade-in zoom-in duration-200 shadow-2xl overflow-hidden" onClick={e => e.stopPropagation()}>
                        <div className="p-5 border-b border-slate-100 flex justify-between items-center bg-slate-50">
                            <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                                <BookOpen size={18} className="text-blue-600" />
                                {recapModal.title}
                            </h3>
                            <button onClick={() => setRecapModal({ ...recapModal, open: false })} className="text-slate-400 hover:text-slate-600 bg-white p-1 rounded-full shadow-sm">
                                <XCircle size={20} />
                            </button>
                        </div>
                        <div className="p-0 overflow-y-auto w-full">
                            {recapModal.logs.length === 0 ? (
                                <div className="p-8 text-center text-slate-500 italic">{t('recapModal.noBooksToDisplay')}</div>
                            ) : (
                                <table className="w-full text-left">
                                    <thead className="bg-white text-[10px] uppercase text-slate-500 font-black border-b border-slate-100 sticky top-0 shadow-sm">
                                        <tr>
                                            <th className="px-3 py-3 text-center w-[8%]">{t('recapModal.numberHeader')}</th>
                                            <th className="px-3 py-3 w-[28%]">{t('recapModal.bookTitleCategory')}</th>
                                            <th className="px-3 py-3 text-center w-[12%]">{t('recapModal.finished')}</th>
                                            <th className="px-3 py-3 text-center text-purple-600 w-[12%]">{t('recapModal.claimed')}</th>
                                            <th className="px-3 py-3 text-center w-[12%]">{t('recapModal.verified')}</th>
                                            <th className="px-3 py-3 text-center w-[18%]">{t('recapModal.incentive')}</th>
                                            <th className="px-3 py-3 w-[10%]">{t('recapModal.status')}</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-50">
                                        {[...recapModal.logs]
                                            .sort((a, b) => {
                                                // Primary sort: Claimed/Finish Date Newest First
                                                const dateA = new Date(a.claimedAt || a.finishDate || a.date).getTime();
                                                const dateB = new Date(b.claimedAt || b.finishDate || b.date).getTime();
                                                if (dateA !== dateB) return dateB - dateA;
                                                
                                                // Secondary sort: Sequence Descending
                                                const seqA = getLogSequence(a);
                                                const seqB = getLogSequence(b);
                                                return seqB - seqA;
                                            })
                                            .map(log => (
                                                <tr key={log.id} className="hover:bg-slate-50 transition-colors">
                                                    <td className="px-3 py-4 text-center">
                                                        {(() => {
                                                            const seq = getLogSequence(log);
                                                            if (seq === 0) return <span className="text-slate-300">-</span>;
                                                            return <span className={`text-[10px] font-black px-1.5 py-0.5 rounded border whitespace-nowrap ${seq === 5 ? 'bg-orange-50 text-orange-600 border-orange-100' : 'bg-slate-50 text-slate-700 border-slate-100'}`}>
                                                                {seq}/5
                                                            </span>;
                                                        })()}
                                                    </td>
                                                    <td className="px-3 py-4">
                                                        <div onClick={() => handleOpenDetailModal(log)} className="font-bold text-slate-700 text-[12px] whitespace-pre-wrap leading-tight mb-1 cursor-pointer hover:text-blue-600 transition-colors">{log.title}</div>
                                                        <div className="flex flex-col gap-0.5">
                                                            <div className="text-[10px] text-slate-400 font-medium">
                                                                {log.category}
                                                            </div>
                                                            <span className={`text-[8px] font-black px-1 py-0.5 rounded w-fit uppercase tracking-wider border ${
                                                                log.source === 'Personal Book' || log.source === 'Buku Pribadi'
                                                                    ? 'bg-purple-100 text-purple-700 border-purple-200'
                                                                    : log.source === 'SIMAS'
                                                                        ? 'bg-blue-100 text-blue-700 border-blue-200'
                                                                        : 'bg-indigo-100 text-indigo-700 border-indigo-200'
                                                                }`}>
                                                                {log.source === 'Personal Book' || log.source === 'Buku Pribadi' ? t('source.private') : (log.source === 'SIMAS' ? t('source.simas') : t('source.office'))}
                                                            </span>
                                                        </div>
                                                    </td>
                                                    <td className="px-3 py-4 text-center">
                                                         <div className="flex flex-col">
                                                             <span className="text-[11px] font-bold text-slate-600">
                                                                 {log.finishDate ? new Date(log.finishDate).toLocaleString('en-GB', { day: '2-digit', month: 'short', year: '2-digit' }) : '-'}
                                                             </span>
                                                             <span className="text-[9px] text-slate-400">
                                                                 {log.finishDate ? new Date(log.finishDate).toLocaleString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true }) : ''}
                                                             </span>
                                                         </div>
                                                    </td>
                                                    <td className="px-3 py-4 text-center">
                                                         <div className="flex flex-col">
                                                             <span className="text-[11px] font-bold text-purple-600">
                                                                 {log.claimedAt ? new Date(log.claimedAt).toLocaleString('en-GB', { day: '2-digit', month: 'short', year: '2-digit' }) : '-'}
                                                             </span>
                                                             <span className="text-[9px] text-purple-400/70">
                                                                 {log.claimedAt ? new Date(log.claimedAt).toLocaleString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true }) : ''}
                                                             </span>
                                                         </div>
                                                    </td>
                                                    <td className="px-3 py-4 text-center">
                                                         <div className="flex flex-col">
                                                             <span className="text-[11px] font-bold text-indigo-600">
                                                                 {log.approvedAt ? new Date(log.approvedAt).toLocaleString('en-GB', { day: '2-digit', month: 'short', year: '2-digit' }) : '-'}
                                                             </span>
                                                             <span className="text-[9px] text-indigo-400/70">
                                                                 {log.approvedAt ? new Date(log.approvedAt).toLocaleString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true }) : ''}
                                                             </span>
                                                         </div>
                                                    </td>
                                                    <td className="px-3 py-4 text-center">
                                                        {Number(log.incentiveAmount) > 0 ? (
                                                            <div className="inline-flex flex-col items-center">
                                                                    {(() => {
                                                                        const seq = getLogSequence(log);
                                                                        const amount = Number(log.incentiveAmount) || 0;
                                                                        if (seq === 5) {
                                                                            const hasBonus = amount > 500000;
                                                                            const baseAmount = hasBonus ? amount - 500000 : amount;
                                                                            return (
                                                                                <div className="flex flex-col items-center bg-orange-50 px-2 py-1 rounded border border-orange-100 min-w-[100px]">
                                                                                    <span className="text-[8px] text-orange-600 font-black leading-none mb-1">{t('recapModal.milestoneBonus')}</span>
                                                                                    <span className="text-[10px] font-bold text-green-700">{formatCurrency(baseAmount)} + Rp 500.000</span>
                                                                                    <span className="text-[9px] text-slate-500 font-black">= {formatCurrency(baseAmount + 500000)}</span>
                                                                                </div>
                                                                            );
                                                                        }
                                                                        return (
                                                                            <div className="bg-green-50 px-2 py-1 rounded border border-green-100">
                                                                                <span className="text-[11px] font-bold text-green-700">{formatCurrency(amount)}</span>
                                                                            </div>
                                                                        );
                                                                    })()}
                                                            </div>
                                                        ) : (
                                                            <div className="text-[10px] text-slate-300 italic">-</div>
                                                        )}
                                                    </td>
                                                     <td className="px-3 py-4">
                                                         <div className={`px-1.5 py-0.5 rounded text-[9px] font-black uppercase w-fit border ${
                                                             log.status === 'Reading' ? 'bg-orange-50 text-orange-600 border-orange-100' :
                                                             log.hrApprovalStatus === 'Approved' ? 'bg-indigo-100 text-indigo-700 border-indigo-200' : 
                                                             log.hrApprovalStatus === 'Rejected' ? 'bg-red-100 text-red-700 border-red-200' : 
                                                             log.hrApprovalStatus === 'Pending' ? 'bg-orange-100 text-orange-700 border-orange-200' : 
                                                             'bg-slate-100 text-slate-500 border-slate-200'
                                                         }`}>
                                                              <div className="flex flex-col">
                                                                 <span>{log.status === 'Reading' ? t('status.reading') : (log.status === 'Cancelled' || log.hrApprovalStatus === 'Cancelled' ? t('status.removed') : (log.hrApprovalStatus === 'Pending' ? t('status.review') : ((log.hrApprovalStatus as any) === 'Draft' || !log.hrApprovalStatus ? t('status.read') : (log.hrApprovalStatus === 'Approved' ? t('status.approved') : (log.hrApprovalStatus === 'Rejected' ? t('status.rejected') : log.hrApprovalStatus)))))}</span>
                                                              </div>
                                                         </div>
                                                     </td>
                                                </tr>
                                            ))}
                                    </tbody>
                                </table>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default AdminReadingLog;
