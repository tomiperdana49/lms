import { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Target, Search, ChevronDown, Download, Upload, Clock, CheckCircle, XCircle, MessageSquare, Trash2, Pencil, Plus, Lock } from 'lucide-react';
// xlsx-js-style (a styling-capable fork of SheetJS, already used by TrainingInternalList.tsx for
// its own styled exports) - plain 'xlsx' can't write the fills/borders/merges the IDP export
// below needs to match the company's original spreadsheet template.
import * as XLSX from 'xlsx-js-style';
import { API_BASE_URL } from '../config';
import type { IDPPlan, IDPActionItem } from '../types';
import IDPDetailInfoTable from './IDPDetailInfoTable';
import { idpLabelCell, idpValueCell, idpSectionHeaderCell, idpContentCell } from './idpTableStyles';
import { parseIdpSheet } from './idpImportParser';
import type { IdpImportGrid, IdpImportRow } from './idpImportParser';

interface IDPManagerProps {
    userRole: string;
    userName?: string;
}

const MANDATORY_TARGET_HOURS = 48;

// Builds the monthly review strip: one entry per calendar month from when the employee created the
// IDP through the current month (or through December if the plan's period year has already fully
// elapsed), marking whether a supervisor review landed in that month. Index N is calendar month N of
// the strip (e.g. index 1 is the creation month), so a missing review shows up at its actual month -
// not just "N months into tracking" - which only holds while created_by_date reflects when the plan
// was really created (bulk-import now keeps it in sync with the source sheet on re-import; see
// /api/idp/bulk-import). Falls back to January of the period year on a plan that has no
// created_by_date at all (e.g. an older import that predates that field being backfilled) - NOT to
// the earliest logged review's month, which would misalign every index (a June/July/August review
// would land at index 1/2/3 instead of 6/7/8, making months 1-5 look skipped rather than un-reviewed).
const reviewMonthStrip = (plan: IDPPlan): { index: number; reviewed: boolean }[] => {
    const reviewedSet = new Set((plan.reviewed_year_months || '').split(',').filter(Boolean));

    let startY: number, startM: number;
    if (plan.created_by_date && !isNaN(new Date(plan.created_by_date).getTime())) {
        const start = new Date(plan.created_by_date);
        startY = start.getFullYear();
        startM = start.getMonth();
    } else {
        startY = plan.period_year;
        startM = 0;
    }

    const now = new Date();
    const endY = plan.period_year < now.getFullYear() ? plan.period_year : now.getFullYear();
    const endM = plan.period_year < now.getFullYear() ? 11 : now.getMonth();

    const months: { index: number; reviewed: boolean }[] = [];
    let y = startY, m = startM, index = 1;
    while ((y < endY || (y === endY && m <= endM)) && index <= 36) {
        const key = `${y}-${String(m + 1).padStart(2, '0')}`;
        months.push({ index, reviewed: reviewedSet.has(key) });
        index++;
        m++;
        if (m > 11) { m = 0; y++; }
    }
    return months;
};

// Whether the plan already has a supervisor review logged for the current calendar month.
const isReviewedThisMonth = (plan: IDPPlan): boolean => {
    const now = new Date();
    const currentKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    return (plan.reviewed_year_months || '').split(',').includes(currentKey);
};

export default function IDPManager({ userName }: IDPManagerProps) {
    const { t } = useTranslation('idpPage');
    const [plans, setPlans] = useState<IDPPlan[]>([]);
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedYear, setSelectedYear] = useState<number | 'All'>(new Date().getFullYear());
    const [onlyNotReviewedThisMonth, setOnlyNotReviewedThisMonth] = useState(false);
    const [onlyPendingHrApproval, setOnlyPendingHrApproval] = useState(false);

    const fetchPlans = async () => {
        try {
            const res = await fetch(`${API_BASE_URL}/api/idp/all`);
            if (res.ok) setPlans(await res.json());
        } catch (err) { console.error(err); }
    };

    useEffect(() => { fetchPlans(); }, []);

    const years = Array.from(new Set(plans.map(p => p.period_year))).sort((a, b) => b - a);

    const filteredPlans = plans.filter(p => {
        if (selectedYear !== 'All' && p.period_year !== selectedYear) return false;
        if (searchQuery) {
            const q = searchQuery.toLowerCase();
            if (!p.employee_name?.toLowerCase().includes(q) && !p.employee_id?.toLowerCase().includes(q)) return false;
        }
        if (onlyNotReviewedThisMonth && (p.status !== 'Approved' || isReviewedThisMonth(p))) return false;
        if (onlyPendingHrApproval && p.status !== 'Pending') return false;
        return true;
    });

    const [expandedId, setExpandedId] = useState<number | null>(null);
    const [detail, setDetail] = useState<IDPPlan | null>(null);
    const [hrNoteDraft, setHrNoteDraft] = useState('');
    const [savingHrNote, setSavingHrNote] = useState(false);

    const toggleExpand = async (id: number) => {
        if (expandedId === id) { setExpandedId(null); setDetail(null); return; }
        setExpandedId(id);
        try {
            const res = await fetch(`${API_BASE_URL}/api/idp/${id}`);
            if (res.ok) {
                const data = await res.json();
                setDetail(data);
                setHrNoteDraft(data.hr_note || '');
            }
        } catch (err) { console.error(err); }
    };

    // --- HR edit: lets HR correct/update any employee's IDP narrative fields and action plan directly
    // (e.g. fixing bad import data), reusing the same PUT /api/idp/:id the employee's own edit form uses.
    // The mandatory learning-hours row is never editable here — it stays locked, same as elsewhere.
    interface EditActionRow { id?: number; action_description: string; target_time: string; is_completed: boolean; notes: string }
    interface EditDraft { job_position: string; achievements: string; career_goal: string; existing_skills: string; development_area: string; actionItems: EditActionRow[] }
    const [editingId, setEditingId] = useState<number | null>(null);
    const [editDraft, setEditDraft] = useState<EditDraft | null>(null);
    const [isSavingEdit, setIsSavingEdit] = useState(false);

    const startEdit = (plan: IDPPlan) => {
        setEditingId(plan.id);
        setEditDraft({
            job_position: plan.job_position || '',
            achievements: plan.achievements || '',
            career_goal: plan.career_goal || '',
            existing_skills: plan.existing_skills || '',
            development_area: plan.development_area || '',
            actionItems: (plan.action_items || []).filter(i => !i.is_mandatory).map(i => ({
                id: i.id, action_description: i.action_description, target_time: i.target_time || '',
                is_completed: !!i.is_completed, notes: i.notes || ''
            }))
        });
    };
    const cancelEdit = () => { setEditingId(null); setEditDraft(null); };
    const addEditActionRow = () => setEditDraft(d => d ? { ...d, actionItems: [...d.actionItems, { action_description: '', target_time: '', is_completed: false, notes: '' }] } : d);
    const removeEditActionRow = (idx: number) => setEditDraft(d => d ? { ...d, actionItems: d.actionItems.filter((_, i) => i !== idx) } : d);
    const updateEditActionRow = (idx: number, patch: Partial<EditActionRow>) => setEditDraft(d => d ? {
        ...d, actionItems: d.actionItems.map((item, i) => i === idx ? { ...item, ...patch } : item)
    } : d);

    const saveEdit = async (id: number) => {
        if (!editDraft) return;
        setIsSavingEdit(true);
        try {
            const res = await fetch(`${API_BASE_URL}/api/idp/${id}`, {
                method: 'PUT', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    job_position: editDraft.job_position,
                    achievements: editDraft.achievements,
                    career_goal: editDraft.career_goal,
                    existing_skills: editDraft.existing_skills,
                    development_area: editDraft.development_area,
                    action_items: editDraft.actionItems
                })
            });
            if (!res.ok) throw new Error((await res.json()).error || 'Gagal menyimpan perubahan.');
            cancelEdit();
            fetchPlans();
            const detailRes = await fetch(`${API_BASE_URL}/api/idp/${id}`);
            if (detailRes.ok) setDetail(await detailRes.json());
        } catch (err) {
            setInfoModal({ title: 'Gagal Menyimpan', message: err instanceof Error ? err.message : String(err) });
        } finally {
            setIsSavingEdit(false);
        }
    };

    // --- HR feedback note: general guidance on what's missing/needs adding, independent of approve/reject ---
    const saveHrNote = async (id: number) => {
        setSavingHrNote(true);
        try {
            await fetch(`${API_BASE_URL}/api/idp/${id}/hr-note`, {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ hr_note: hrNoteDraft, hr_note_by: userName })
            });
            setDetail(d => d ? { ...d, hr_note: hrNoteDraft, hr_note_by: userName } : d);
            fetchPlans();
        } catch (err) { console.error(err); } finally { setSavingHrNote(false); }
    };

    // --- HR approval: the first approval step on a submitted (Pending) IDP. Only after this does
    // the employee's supervisor gain the ability to log monthly 1-on-1 reviews (see IDPPage.tsx).
    const [rejectModalOpen, setRejectModalOpen] = useState(false);
    const [rejectTargetId, setRejectTargetId] = useState<number | null>(null);
    const [rejectionReason, setRejectionReason] = useState('');

    const approvePlan = async (id: number) => {
        try {
            await fetch(`${API_BASE_URL}/api/idp/${id}/approve`, {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ status: 'Approved', approved_by: userName })
            });
            fetchPlans();
            if (expandedId === id) {
                const res = await fetch(`${API_BASE_URL}/api/idp/${id}`);
                if (res.ok) setDetail(await res.json());
            }
        } catch (err) { console.error(err); }
    };

    const confirmReject = async () => {
        if (!rejectTargetId || !rejectionReason.trim()) return;
        try {
            await fetch(`${API_BASE_URL}/api/idp/${rejectTargetId}/approve`, {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ status: 'Rejected', rejection_reason: rejectionReason })
            });
            setRejectModalOpen(false);
            setRejectionReason('');
            setRejectTargetId(null);
            fetchPlans();
        } catch (err) { console.error(err); }
    };

    // --- HR-only permanent delete: for IDPs created by mistake or bad import data. Irreversible —
    // cascades to the plan's action items and review history in the database.
    const [deleteTargetId, setDeleteTargetId] = useState<number | null>(null);
    const [isDeleting, setIsDeleting] = useState(false);

    const confirmDeletePlan = async () => {
        if (!deleteTargetId) return;
        setIsDeleting(true);
        try {
            await fetch(`${API_BASE_URL}/api/idp/${deleteTargetId}`, { method: 'DELETE' });
            if (expandedId === deleteTargetId) { setExpandedId(null); setDetail(null); }
            setDeleteTargetId(null);
            fetchPlans();
        } catch (err) { console.error(err); } finally { setIsDeleting(false); }
    };

    const statusBadge = (status: string) => {
        const map: Record<string, string> = {
            Draft: 'bg-slate-100 text-slate-600 border-slate-200',
            Pending: 'bg-amber-50 text-amber-700 border-amber-200',
            Approved: 'bg-emerald-50 text-emerald-700 border-emerald-200',
            Rejected: 'bg-rose-50 text-rose-700 border-rose-200'
        };
        return (
            <span className={`px-3 py-1 rounded-full text-xs font-bold border ${map[status] || map.Draft}`}>
                {t(`status.${status}`, { defaultValue: status })}
            </span>
        );
    };

    // --- Excel export styling - mirrors the company's original IDP spreadsheet template (navy section titles, gray-filled
    // bold section/label cells, a thin black grid over every cell, wrapped left-aligned content). ---
    const THIN_BORDER = { style: 'thin', color: { rgb: '000000' } } as const;
    const FULL_BORDER = { top: THIN_BORDER, bottom: THIN_BORDER, left: THIN_BORDER, right: THIN_BORDER };
    const HEADER_CELL_STYLE = {
        font: { bold: true, name: 'Arial', sz: 10 },
        fill: { patternType: 'solid' as const, fgColor: { rgb: 'CCCCCC' } },
        alignment: { vertical: 'top' as const, wrapText: true },
        border: FULL_BORDER
    };
    // Section titles (Pencapaian, Tujuan, Skill, Rencana Aksi, Evaluasi) - navy fill, white bold text.
    const SECTION_CELL_STYLE = {
        font: { bold: true, name: 'Arial', sz: 10, color: { rgb: 'FFFFFF' } },
        fill: { patternType: 'solid' as const, fgColor: { rgb: '474C8B' } },
        alignment: { vertical: 'top' as const, wrapText: true },
        border: FULL_BORDER
    };
    // The guiding question under each section title - gray fill like labels, but not bold.
    const QUESTION_CELL_STYLE = {
        font: { name: 'Arial', sz: 10 },
        fill: { patternType: 'solid' as const, fgColor: { rgb: 'CCCCCC' } },
        alignment: { vertical: 'top' as const, wrapText: true },
        border: FULL_BORDER
    };
    const VALUE_CELL_STYLE = {
        font: { name: 'Arial', sz: 10 },
        alignment: { vertical: 'top' as const, wrapText: true },
        border: FULL_BORDER
    };
    const CHECKLIST_CELL_STYLE = {
        font: { name: 'Arial', sz: 10 },
        alignment: { vertical: 'center' as const, horizontal: 'center' as const },
        border: FULL_BORDER
    };
    const IDP_SHEET_COL_WIDTHS = [{ wch: 15 }, { wch: 26 }, { wch: 22 }, { wch: 27 }, { wch: 19 }, { wch: 26 } ];

    // Builds one fully-styled worksheet for a single plan, matching the original template's exact
    // section layout (header block, achievements, career goal, skill/development-area side by side,
    // the action-plan table, then the supervisor review log). Shared by the bulk export (one sheet
    // per plan) and the per-employee download.
    const buildIdpWorksheet = (full: IDPPlan): XLSX.WorkSheet => {
        const ws: XLSX.WorkSheet = {};
        const merges: XLSX.Range[] = [];

        const setCell = (r: number, c: number, v: string | number | boolean, style: object) => {
            const cell: any = typeof v === 'number' ? { t: 'n', v } : typeof v === 'boolean' ? { t: 'b', v } : { t: 's', v: v ?? '' };
            cell.s = style;
            ws[XLSX.utils.encode_cell({ r, c })] = cell;
        };
        // Fills every cell of the merged region with the same style (the original template borders
        // each individual cell in a merge, not just its top-left corner) and puts the value in the
        // top-left one, where Excel expects it for a merged range.
        const mergeRange = (r1: number, c1: number, r2: number, c2: number, value: string | number | boolean, style: object) => {
            merges.push({ s: { r: r1, c: c1 }, e: { r: r2, c: c2 } });
            for (let r = r1; r <= r2; r++) {
                for (let c = c1; c <= c2; c++) {
                    setCell(r, c, r === r1 && c === c1 ? value : '', style);
                }
            }
        };

        setCell(0, 0, 'Nama Karyawan:', HEADER_CELL_STYLE);
        setCell(0, 1, full.employee_name || '', VALUE_CELL_STYLE);
        setCell(0, 2, 'Jabatan:', HEADER_CELL_STYLE);
        setCell(0, 3, full.job_position || '', VALUE_CELL_STYLE);
        setCell(0, 4, 'Atasan Langsung:', HEADER_CELL_STYLE);
        setCell(0, 5, full.supervisor_name || '', VALUE_CELL_STYLE);
        setCell(1, 0, 'Periode IDP:', HEADER_CELL_STYLE);
        setCell(1, 1, full.period_year, VALUE_CELL_STYLE);
        setCell(1, 2, 'Departemen:', HEADER_CELL_STYLE);
        setCell(1, 3, full.department || '', VALUE_CELL_STYLE);
        setCell(1, 4, 'Tanggal Mulai Bekerja:', HEADER_CELL_STYLE);
        setCell(1, 5, full.join_date_label || '', VALUE_CELL_STYLE);

        mergeRange(2, 0, 2, 5, 'Pencapaian / Prestasi Kerja', SECTION_CELL_STYLE);
        mergeRange(3, 0, 3, 5, 'Apa pencapaian / prestasi kamu selama 3-12 bulan ke belakang?', QUESTION_CELL_STYLE);
        mergeRange(4, 0, 10, 5, full.achievements || '', VALUE_CELL_STYLE);

        mergeRange(11, 0, 11, 5, 'Tujuan / Aspirasi Karir (Goal)', SECTION_CELL_STYLE);
        mergeRange(12, 0, 12, 5, 'Apa tujuan karir kamu dalam 1-3 tahun ke depan di perusahaan ini?', QUESTION_CELL_STYLE);
        mergeRange(13, 0, 19, 5, full.career_goal || '', VALUE_CELL_STYLE);

        mergeRange(20, 0, 20, 2, 'Skill yang Dimiliki', SECTION_CELL_STYLE);
        mergeRange(20, 3, 20, 5, 'Area Pengembangan', SECTION_CELL_STYLE);
        mergeRange(21, 0, 21, 2, 'Sebutkan bakat, keahlian, dan keterampilan kamu yang membantu mencapai tujuan karir kamu?', QUESTION_CELL_STYLE);
        mergeRange(21, 3, 21, 5, 'Kompetensi apa yang kamu rasa masih perlu kamu kembangkan dan tingkatkan lagi untuk mencapai tujuan karir kamu?', QUESTION_CELL_STYLE);
        mergeRange(22, 0, 29, 2, full.existing_skills || '', VALUE_CELL_STYLE);
        mergeRange(22, 3, 29, 5, full.development_area || '', VALUE_CELL_STYLE);

        mergeRange(30, 0, 30, 2, 'Rencana Aksi Pengembangan', SECTION_CELL_STYLE);
        setCell(30, 3, 'Target Waktu', SECTION_CELL_STYLE);
        setCell(30, 4, 'Checklist Progress', SECTION_CELL_STYLE);
        setCell(30, 5, 'Keterangan', SECTION_CELL_STYLE);
        mergeRange(31, 0, 31, 2, 'Tuliskan langkah apa saja yang akan kamu lakukan untuk mencapai pengembangan diri dan tujuan karir kamu!', QUESTION_CELL_STYLE);
        setCell(31, 3, 'Tetapkan target waktu kamu melaksanakan rencana aksi.', QUESTION_CELL_STYLE);
        setCell(31, 4, 'Update progress aksi pengembangan kamu.', QUESTION_CELL_STYLE);
        setCell(31, 5, 'Catatan mengenai aksi yang telah dilaksanakan.', QUESTION_CELL_STYLE);

        const actionItems = full.action_items || [];
        let row = 32;
        for (const item of actionItems) {
            mergeRange(row, 0, row, 2, item.action_description || '', VALUE_CELL_STYLE);
            setCell(row, 3, item.target_time || '', VALUE_CELL_STYLE);
            setCell(row, 4, !!item.is_completed, CHECKLIST_CELL_STYLE);
            setCell(row, 5, item.notes || '', VALUE_CELL_STYLE);
            row++;
        }
        if (actionItems.length === 0) {
            mergeRange(row, 0, row, 2, '-', VALUE_CELL_STYLE);
            setCell(row, 3, '', VALUE_CELL_STYLE);
            setCell(row, 4, false, CHECKLIST_CELL_STYLE);
            setCell(row, 5, '', VALUE_CELL_STYLE);
            row++;
        }

        mergeRange(row, 0, row, 1, 'Tanggal IDP Dibuat oleh Karyawan:', HEADER_CELL_STYLE);
        setCell(row, 2, full.created_by_date ? new Date(full.created_by_date).toLocaleDateString('id-ID') : '', VALUE_CELL_STYLE);
        mergeRange(row, 3, row, 4, 'Tanggal IDP Disetujui oleh HR:', HEADER_CELL_STYLE);
        setCell(row, 5, full.approved_date ? new Date(full.approved_date).toLocaleDateString('id-ID') : '', VALUE_CELL_STYLE);
        row++;

        mergeRange(row, 0, row, 4, 'Evaluasi IDP (diisi oleh atasan langsung)', SECTION_CELL_STYLE);
        setCell(row, 5, 'Verifikasi IDP (diisi oleh HR)', SECTION_CELL_STYLE);
        row++;
        setCell(row, 0, 'Tanggal Review', HEADER_CELL_STYLE);
        mergeRange(row, 1, row, 4, 'Apakah IDP relevan dan berjalan? Apakah rencana aksi berhasil terlaksanakan hingga target waktu yang ditentukan?', QUESTION_CELL_STYLE);
        setCell(row, 5, '', QUESTION_CELL_STYLE);
        row++;

        const reviews = full.reviews || [];
        const reviewRowCount = Math.max(reviews.length, 1);
        const reviewStartRow = row;
        for (let i = 0; i < reviewRowCount; i++) {
            const review = reviews[i];
            setCell(row, 0, review ? new Date(review.review_date).toLocaleDateString('id-ID') : '-', VALUE_CELL_STYLE);
            mergeRange(row, 1, row, 4, review ? (review.supervisor_note || '') : '-', VALUE_CELL_STYLE);
            row++;
        }
        // The app only carries one overall HR note per plan (not one per review), so it goes in a
        // single cell spanning the whole review log rather than the original template's ad-hoc,
        // per-row HR verification entries.
        const hrNoteText = full.hr_note ? `${full.hr_note}${full.hr_note_by ? `\n— ${full.hr_note_by}` : ''}` : '';
        mergeRange(reviewStartRow, 5, row - 1, 5, hrNoteText, VALUE_CELL_STYLE);

        ws['!ref'] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: row - 1, c: 5 } });
        ws['!merges'] = merges;
        ws['!cols'] = IDP_SHEET_COL_WIDTHS;
        return ws;
    };

    // Bulk export: one sheet per plan currently matching the search/year/status filters above.
    const exportExcel = async () => {
        const wb = XLSX.utils.book_new();

        for (const plan of filteredPlans) {
            let full = plan;
            try {
                const res = await fetch(`${API_BASE_URL}/api/idp/${plan.id}`);
                if (res.ok) full = await res.json();
            } catch (e) { /* fall back to summary row */ }

            const ws = buildIdpWorksheet(full);
            const sheetName = (full.employee_name || `IDP ${full.id}`).slice(0, 31).replace(/[[\]*/\\?:]/g, '');
            XLSX.utils.book_append_sheet(wb, ws, sheetName);
        }

        if (filteredPlans.length === 0) {
            XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['Tidak ada data']]), 'IDP');
        }

        const periodLabel = selectedYear === 'All' ? 'AllYears' : String(selectedYear);
        XLSX.writeFile(wb, `IDP_${periodLabel}.xlsx`);
    };

    // Per-employee download from the card itself - reuses the already-fetched `detail` when that
    // card is expanded (avoids a redundant request) and fetches fresh otherwise. Sheet is named
    // after the period year, matching the original single-employee template.
    const [downloadingId, setDownloadingId] = useState<number | null>(null);
    const exportSinglePlan = async (plan: IDPPlan) => {
        setDownloadingId(plan.id);
        try {
            let full = plan;
            if (expandedId === plan.id && detail) {
                full = detail;
            } else {
                try {
                    const res = await fetch(`${API_BASE_URL}/api/idp/${plan.id}`);
                    if (res.ok) full = await res.json();
                } catch (e) { /* fall back to summary row */ }
            }

            const wb = XLSX.utils.book_new();
            const ws = buildIdpWorksheet(full);
            XLSX.utils.book_append_sheet(wb, ws, String(full.period_year || 'IDP'));
            const nameLabel = (full.employee_name || `Employee_${full.id}`).replace(/\s+/g, '_');
            XLSX.writeFile(wb, `IDP ${full.employee_name || nameLabel}.xlsx`);
        } finally {
            setDownloadingId(null);
        }
    };

    // --- Bulk import: reads an .xlsx with one sheet per employee (the standard IDP template) and shows
    // a preview before writing anything, since employee matching and HR-note placement are best-effort. ---
    const idpImportInputRef = useRef<HTMLInputElement>(null);
    const [importPreview, setImportPreview] = useState<IdpImportRow[] | null>(null);
    const [isImportingIdp, setIsImportingIdp] = useState(false);
    // In-page replacement for window.alert() — browser-native alerts block automation/testing and look
    // out of place next to the app's own modals, so every user-facing message in the import flow goes here.
    const [infoModal, setInfoModal] = useState<{ title: string; message: string } | null>(null);

    const handleIdpFileSelected = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (evt) => {
            try {
                const bstr = evt.target?.result;
                const wb = XLSX.read(bstr, { type: 'binary' });
                const allParsed = wb.SheetNames
                    .map(name => parseIdpSheet(XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1, defval: '' }) as IdpImportGrid, name));
                const parsed = allParsed.filter(p => p.employee_name && p.period_year);
                if (parsed.length === 0) {
                    // Names the specific missing field(s) per sheet instead of a generic "check the
                    // format" message - "Nama Karyawan" and "Periode IDP" are the two required fields
                    // (see the .filter above), so a sheet that failed is always missing one of them.
                    const details = allParsed.map(p => {
                        const missing: string[] = [];
                        if (!p.employee_name) missing.push('Nama Karyawan');
                        if (!p.period_year) missing.push('Periode IDP (tahun)');
                        return `- Sheet "${p.sheet_name}": ${missing.join(' dan ')} kosong/tidak terbaca`;
                    }).join('\n');
                    setInfoModal({
                        title: 'Tidak Ada Data',
                        message: `Tidak ada data IDP yang valid ditemukan di file ini.\n\n${details}`
                    });
                    return;
                }
                setImportPreview(parsed);
            } catch (err) {
                console.error('IDP import parse error:', err);
                setInfoModal({ title: 'Gagal Membaca File', message: err instanceof Error ? err.message : String(err) });
            } finally {
                if (idpImportInputRef.current) idpImportInputRef.current.value = '';
            }
        };
        reader.readAsBinaryString(file);
    };

    const confirmIdpImport = async () => {
        if (!importPreview) return;
        setIsImportingIdp(true);
        try {
            const res = await fetch(`${API_BASE_URL}/api/idp/bulk-import`, {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ rows: importPreview })
            });
            const data = await res.json();
            const parts = [`${data.inserted} IDP berhasil diimpor.`];
            if (data.skipped) {
                // For duplicates, the plan itself is left untouched, but any review-log rows or an HR
                // note the file has that the existing plan is missing get backfilled — surface that here
                // so it's clear the duplicate wasn't a total no-op.
                const totalReviewsAdded = (data.duplicates || []).reduce((sum: number, d: { reviewsAdded?: number }) => sum + (d.reviewsAdded || 0), 0);
                const totalNotesAdded = (data.duplicates || []).filter((d: { noteAdded?: boolean }) => d.noteAdded).length;
                let skippedMsg = `${data.skipped} dilewati karena sudah ada IDP untuk karyawan & periode tersebut`;
                const mergedParts: string[] = [];
                if (totalReviewsAdded) mergedParts.push(`${totalReviewsAdded} riwayat review ditambahkan`);
                if (totalNotesAdded) mergedParts.push(`${totalNotesAdded} catatan HR ditambahkan`);
                if (mergedParts.length) skippedMsg += ` (${mergedParts.join(', ')} ke plan yang sudah ada)`;
                parts.push(`${skippedMsg}.`);
            }
            if (data.errors?.length) {
                parts.push(`${data.errors.length} gagal:\n` + data.errors.map((e: { row: string; error: string }) => `- ${e.row}: ${e.error}`).join('\n'));
            }
            setImportPreview(null);
            setInfoModal({ title: 'Hasil Import', message: parts.join('\n') });
            fetchPlans();
        } catch (err) {
            setInfoModal({ title: 'Import Gagal', message: err instanceof Error ? err.message : String(err) });
        } finally {
            setIsImportingIdp(false);
        }
    };

    return (
        <div className="space-y-6 animate-in fade-in max-w-6xl mx-auto">
            <div className="flex flex-wrap items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-2xl bg-indigo-50 flex items-center justify-center shrink-0">
                        <Target className="w-6 h-6 text-indigo-600" />
                    </div>
                    <div>
                        <h1 className="text-2xl font-bold text-gray-800">{t('admin.title')}</h1>
                        <p className="text-gray-500 text-sm">{t('admin.subtitle')}</p>
                    </div>
                </div>
                <div className="flex items-center gap-3">
                    <input ref={idpImportInputRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={handleIdpFileSelected} />
                    <button onClick={() => idpImportInputRef.current?.click()} className="flex items-center gap-2 px-5 py-3 rounded-2xl text-xs font-black tracking-widest bg-indigo-600 text-white shadow-sm hover:bg-indigo-700 transition-all">
                        <Upload size={16} /> IMPORT
                    </button>
                    <button onClick={exportExcel} className="flex items-center gap-2 px-5 py-3 rounded-2xl text-xs font-black tracking-widest bg-emerald-600 text-white shadow-sm hover:bg-emerald-700 transition-all">
                        <Download size={16} /> EXPORT
                    </button>
                </div>
            </div>

            <div className="flex flex-wrap gap-3">
                <div className="flex-1 min-w-[240px] relative">
                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-300" size={18} />
                    <input value={searchQuery} onChange={e => setSearchQuery(e.target.value)} placeholder={t('admin.searchPlaceholder')} className="w-full pl-11 pr-4 py-3 bg-white border border-gray-100 rounded-2xl text-sm focus:border-indigo-300 outline-none" />
                </div>
                <select value={selectedYear} onChange={e => setSelectedYear(e.target.value === 'All' ? 'All' : Number(e.target.value))} className="px-4 py-3 bg-white border border-gray-100 rounded-2xl text-sm font-semibold focus:border-indigo-300 outline-none">
                    <option value="All">{t('admin.allYears')}</option>
                    {years.map(y => <option key={y} value={y}>{y}</option>)}
                </select>
                <button
                    onClick={() => setOnlyPendingHrApproval(v => !v)}
                    className={`px-4 py-3 rounded-2xl text-sm font-semibold border transition-colors ${onlyPendingHrApproval ? 'bg-amber-600 border-amber-600 text-white' : 'bg-white border-gray-100 text-gray-600 hover:border-amber-200'}`}
                >
                    {t('admin.pendingHrApprovalFilter')}
                </button>
                <button
                    onClick={() => setOnlyNotReviewedThisMonth(v => !v)}
                    className={`px-4 py-3 rounded-2xl text-sm font-semibold border transition-colors ${onlyNotReviewedThisMonth ? 'bg-rose-600 border-rose-600 text-white' : 'bg-white border-gray-100 text-gray-600 hover:border-rose-200'}`}
                >
                    {t('admin.notReviewedThisMonthFilter')}
                </button>
            </div>

            <div className="space-y-3">
                {filteredPlans.length === 0 ? (
                    <div className="text-center py-16 bg-gradient-to-b from-slate-50 to-white rounded-3xl border border-dashed border-slate-300 text-gray-400">
                        {t('admin.empty')}
                    </div>
                ) : filteredPlans.map(plan => (
                    <div key={plan.id} className="bg-white rounded-3xl border border-gray-100 shadow-sm p-6">
                        <div className="flex flex-wrap items-center justify-between gap-3">
                            <div>
                                <p className="font-bold text-gray-800">{plan.employee_name}</p>
                                <p className="text-xs text-gray-400">{t('team.idLabel', { id: plan.employee_id })} &middot; {plan.department || '-'} &middot; {t('form.period')} {plan.period_year} &middot; {t('form.supervisor')}: {plan.supervisor_name || '-'}</p>
                            </div>
                            <div className="flex items-center gap-3">
                                {statusBadge(plan.status)}
                                {plan.status === 'Pending' && (
                                    <>
                                        <button onClick={() => approvePlan(plan.id)} className="flex items-center gap-1.5 px-4 py-2 bg-emerald-600 text-white rounded-xl text-xs font-bold hover:bg-emerald-700 transition-colors"><CheckCircle size={14} /> {t('team.approve')}</button>
                                        <button onClick={() => { setRejectTargetId(plan.id); setRejectModalOpen(true); }} className="flex items-center gap-1.5 px-4 py-2 bg-white border border-rose-200 text-rose-600 rounded-xl text-xs font-bold hover:bg-rose-50 transition-colors"><XCircle size={14} /> {t('team.reject')}</button>
                                    </>
                                )}
                                <button
                                    onClick={() => exportSinglePlan(plan)}
                                    disabled={downloadingId === plan.id}
                                    title={t('admin.downloadOne')}
                                    className="flex items-center gap-1.5 px-3 py-2 bg-white border border-gray-200 text-gray-400 rounded-xl text-xs font-bold hover:bg-emerald-50 hover:border-emerald-200 hover:text-emerald-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    <Download size={14} className={downloadingId === plan.id ? 'animate-pulse' : ''} />
                                </button>
                                <button
                                    onClick={() => setDeleteTargetId(plan.id)}
                                    title="Hapus IDP secara permanen"
                                    className="flex items-center gap-1.5 px-3 py-2 bg-white border border-gray-200 text-gray-400 rounded-xl text-xs font-bold hover:bg-rose-50 hover:border-rose-200 hover:text-rose-600 transition-colors"
                                >
                                    <Trash2 size={14} />
                                </button>
                            </div>
                        </div>

                        {plan.status === 'Approved' && (() => {
                            const strip = reviewMonthStrip(plan);
                            return strip.length > 0 && (
                                <div className="mt-3 flex items-center flex-wrap gap-2">
                                    <span className="text-xs font-semibold text-gray-400">{t('admin.reviewStripLabel')}</span>
                                    {strip.map(({ index, reviewed }) => (
                                        <span
                                            key={index}
                                            title={reviewed ? t('admin.reviewedThisMonth') : t('admin.notReviewedThisMonth')}
                                            className={`w-6 h-6 flex items-center justify-center rounded-full text-[11px] font-bold text-white shrink-0 ${reviewed ? 'bg-emerald-500' : 'bg-rose-500'}`}
                                        >
                                            {index}
                                        </span>
                                    ))}
                                </div>
                            );
                        })()}

                        <button onClick={() => toggleExpand(plan.id)} className="mt-3 flex items-center gap-1.5 text-xs font-semibold text-indigo-600 hover:text-indigo-700">
                            <ChevronDown className={`w-4 h-4 transition-transform ${expandedId === plan.id ? 'rotate-180' : ''}`} />
                            {expandedId === plan.id ? t('team.hideDetail') : t('team.showDetail')}
                        </button>

                        {expandedId === plan.id && detail && (
                            <div className="mt-4 pt-4 border-t border-gray-100 space-y-4">
                                {editingId === plan.id && editDraft ? (
                                    <div className="space-y-4">
                                        <div className="overflow-x-auto rounded-xl border border-slate-300">
                                            <table className="w-full border-collapse table-fixed min-w-[780px]">
                                                <colgroup>
                                                    <col className="w-[13%]" /><col className="w-[20%]" />
                                                    <col className="w-[13%]" /><col className="w-[20%]" />
                                                    <col className="w-[13%]" /><col className="w-[20%]" />
                                                </colgroup>
                                                <tbody>
                                                    <tr>
                                                        <td className={idpLabelCell}>{t('form.employeeName')}:</td>
                                                        <td className={idpValueCell}>{detail.employee_name || '-'}</td>
                                                        <td className={idpLabelCell}>{t('form.jobPosition')}:</td>
                                                        <td className={idpValueCell}>
                                                            <input value={editDraft.job_position} onChange={e => setEditDraft(d => d ? { ...d, job_position: e.target.value } : d)} className="w-full bg-transparent outline-none" />
                                                        </td>
                                                        <td className={idpLabelCell}>{t('form.supervisor')}:</td>
                                                        <td className={idpValueCell}>{detail.supervisor_name || '-'}</td>
                                                    </tr>
                                                    <tr>
                                                        <td className={idpLabelCell}>{t('form.period')}:</td>
                                                        <td className={idpValueCell}>{detail.period_year}</td>
                                                        <td className={idpLabelCell}>{t('form.department')}:</td>
                                                        <td className={idpValueCell}>{detail.department || '-'}</td>
                                                        <td className={idpLabelCell}>{t('form.joinDate')}:</td>
                                                        <td className={idpValueCell}>{detail.join_date_label || '-'}</td>
                                                    </tr>

                                                    <tr><td colSpan={6} className={idpSectionHeaderCell}>{t('form.achievements')}</td></tr>
                                                    <tr><td colSpan={6} className={idpContentCell}>
                                                        <textarea value={editDraft.achievements} onChange={e => setEditDraft(d => d ? { ...d, achievements: e.target.value } : d)} rows={3} className="w-full bg-transparent outline-none resize-none" />
                                                    </td></tr>

                                                    <tr><td colSpan={6} className={idpSectionHeaderCell}>{t('form.careerGoal')}</td></tr>
                                                    <tr><td colSpan={6} className={idpContentCell}>
                                                        <textarea value={editDraft.career_goal} onChange={e => setEditDraft(d => d ? { ...d, career_goal: e.target.value } : d)} rows={3} className="w-full bg-transparent outline-none resize-none" />
                                                    </td></tr>

                                                    <tr>
                                                        <td colSpan={3} className={idpSectionHeaderCell}>{t('form.existingSkills')}</td>
                                                        <td colSpan={3} className={idpSectionHeaderCell}>{t('form.developmentArea')}</td>
                                                    </tr>
                                                    <tr>
                                                        <td colSpan={3} className={idpContentCell}>
                                                            <textarea value={editDraft.existing_skills} onChange={e => setEditDraft(d => d ? { ...d, existing_skills: e.target.value } : d)} rows={3} className="w-full bg-transparent outline-none resize-none" />
                                                        </td>
                                                        <td colSpan={3} className={idpContentCell}>
                                                            <textarea value={editDraft.development_area} onChange={e => setEditDraft(d => d ? { ...d, development_area: e.target.value } : d)} rows={3} className="w-full bg-transparent outline-none resize-none" />
                                                        </td>
                                                    </tr>

                                                    <tr>
                                                        <td colSpan={2} className={idpSectionHeaderCell}>{t('form.actionPlan')}</td>
                                                        <td className={`${idpSectionHeaderCell} cursor-help`} title={t('form.targetTimeTooltip')}>{t('form.targetTime')}</td>
                                                        <td className={idpSectionHeaderCell}>{t('form.checklistProgress')}</td>
                                                        <td colSpan={2} className={idpSectionHeaderCell}>
                                                            <div className="flex items-center justify-between">
                                                                <span>{t('form.notes')}</span>
                                                                <button type="button" onClick={addEditActionRow} className="flex items-center gap-1 text-xs font-bold text-white hover:text-indigo-100"><Plus size={14} /> {t('form.addRow')}</button>
                                                            </div>
                                                        </td>
                                                    </tr>

                                                    {(detail.action_items || []).filter(i => i.is_mandatory).map((item: IDPActionItem) => (
                                                        <tr key={item.id}>
                                                            <td colSpan={2} className={idpContentCell}>
                                                                <div className="flex items-center gap-2 text-indigo-700">
                                                                    <Lock size={14} className="shrink-0" />
                                                                    <span>{item.action_description}</span>
                                                                </div>
                                                            </td>
                                                            <td className={idpValueCell}>{item.target_time}</td>
                                                            <td className={`${idpValueCell} text-center`}>
                                                                <input type="checkbox" disabled readOnly checked={!!detail.learningProgress && detail.learningProgress.totalJam >= detail.learningProgress.target} className="w-4 h-4 accent-indigo-600" />
                                                            </td>
                                                            <td colSpan={2} className={idpValueCell}>{t('form.mandatoryRowNote', { hours: MANDATORY_TARGET_HOURS })}</td>
                                                        </tr>
                                                    ))}

                                                    {editDraft.actionItems.map((item, idx) => (
                                                        <tr key={idx}>
                                                            <td colSpan={2} className={idpContentCell}>
                                                                <input value={item.action_description} onChange={e => updateEditActionRow(idx, { action_description: e.target.value })} placeholder={t('form.actionDescriptionPlaceholder')} className="w-full bg-transparent outline-none" />
                                                            </td>
                                                            <td className={idpValueCell}>
                                                                <input value={item.target_time} onChange={e => updateEditActionRow(idx, { target_time: e.target.value })} placeholder={t('form.targetTimePlaceholder')} className="w-full bg-transparent outline-none" />
                                                            </td>
                                                            <td className={`${idpValueCell} text-center`}>
                                                                <input type="checkbox" checked={item.is_completed} onChange={e => updateEditActionRow(idx, { is_completed: e.target.checked })} className="w-4 h-4 accent-indigo-600" />
                                                            </td>
                                                            <td colSpan={2} className={idpValueCell}>
                                                                <div className="flex items-center gap-2">
                                                                    <input value={item.notes} onChange={e => updateEditActionRow(idx, { notes: e.target.value })} placeholder={t('form.notesPlaceholder')} className="flex-1 bg-transparent outline-none" />
                                                                    <button type="button" onClick={() => removeEditActionRow(idx)} className="text-gray-400 hover:text-rose-600 transition-colors shrink-0"><Trash2 size={14} /></button>
                                                                </div>
                                                            </td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>
                                        <div className="flex gap-3">
                                            <button onClick={cancelEdit} disabled={isSavingEdit} className="px-5 py-2.5 rounded-xl border border-gray-200 text-gray-600 font-bold text-sm hover:bg-gray-50 disabled:opacity-50 transition-colors">{t('form.cancel')}</button>
                                            <button onClick={() => saveEdit(plan.id)} disabled={isSavingEdit} className="px-5 py-2.5 rounded-xl bg-indigo-600 text-white font-bold text-sm hover:bg-indigo-700 disabled:opacity-50 transition-colors">
                                                {isSavingEdit ? 'Menyimpan...' : t('form.saveChanges')}
                                            </button>
                                        </div>
                                    </div>
                                ) : (
                                    <>
                                        <div className="flex justify-end">
                                            <button onClick={() => startEdit(detail)} className="flex items-center gap-1.5 px-4 py-2 bg-white border border-indigo-200 text-indigo-600 rounded-xl text-xs font-bold hover:bg-indigo-50 transition-colors">
                                                <Pencil size={14} /> Edit IDP
                                            </button>
                                        </div>
                                        <IDPDetailInfoTable plan={detail} />
                                    </>
                                )}

                                {detail.learningProgress && (
                                    <div className="p-3 bg-indigo-50 border border-indigo-100 rounded-xl flex items-center justify-between text-sm">
                                        <span className="font-semibold text-indigo-900 flex items-center gap-2"><Clock size={14} /> {t('form.mandatoryProgress')}</span>
                                        <span className="font-bold text-indigo-600">{detail.learningProgress.totalJam} / {MANDATORY_TARGET_HOURS} {t('form.hours')}</span>
                                    </div>
                                )}

                                <div className="p-4 bg-amber-50 border border-amber-100 rounded-xl space-y-2">
                                    <label className="flex items-center gap-1.5 text-sm font-semibold text-amber-900">
                                        <MessageSquare size={14} /> {t('admin.hrNoteLabel')}
                                    </label>
                                    <p className="text-xs text-amber-700">{t('admin.hrNoteHint')}</p>
                                    {detail.hr_note_by && (
                                        <p className="text-xs text-amber-600 font-semibold">— {detail.hr_note_by}</p>
                                    )}
                                    <textarea
                                        value={hrNoteDraft}
                                        onChange={e => setHrNoteDraft(e.target.value)}
                                        rows={3}
                                        placeholder={t('admin.hrNotePlaceholder')}
                                        className="w-full px-3 py-2 text-sm border border-amber-200 rounded-lg focus:border-amber-500 outline-none resize-none bg-white"
                                    />
                                    <button
                                        onClick={() => saveHrNote(plan.id)}
                                        disabled={savingHrNote || hrNoteDraft === (detail.hr_note || '')}
                                        className="px-4 py-1.5 bg-amber-600 text-white rounded-lg text-xs font-bold hover:bg-amber-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                                    >
                                        {t('admin.saveHrNote')}
                                    </button>
                                </div>

                                <div>
                                    <label className="block text-sm font-semibold text-gray-700 mb-2">{t('form.reviewHistory')}</label>
                                    {(detail.reviews || []).length === 0 ? (
                                        <p className="text-xs text-gray-400">{t('admin.noReviews')}</p>
                                    ) : (
                                        <div className="space-y-3">
                                            {detail.reviews!.map(review => (
                                                <div key={review.id} className="p-3 bg-gray-50 border border-gray-100 rounded-xl text-sm">
                                                    <p className="text-xs font-bold text-gray-400 mb-1">{new Date(review.review_date).toLocaleDateString('en-GB')} &middot; {review.reviewed_by}</p>
                                                    <p className="text-gray-700">{review.supervisor_note}</p>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}
                    </div>
                ))}
            </div>

            {/* Import Preview Modal */}
            {importPreview && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
                    <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl p-6 max-h-[85vh] overflow-y-auto">
                        <h3 className="text-xl font-bold text-slate-800 mb-1">Konfirmasi Import IDP</h3>
                        <p className="text-sm text-gray-500 mb-4">
                            {importPreview.length} sheet terbaca dari file. IDP yang sudah ada (karyawan &amp; periode yang sama) akan otomatis dilewati, tidak ditimpa.
                        </p>
                        <div className="space-y-2 mb-6">
                            {importPreview.map((p, idx) => (
                                <div key={idx} className="p-3 bg-slate-50 border border-slate-100 rounded-xl text-sm">
                                    <p className="font-bold text-slate-700">
                                        {p.employee_name || <span className="text-rose-500">Nama tidak terbaca ({p.sheet_name})</span>} &middot; Periode {p.period_year || '-'}
                                    </p>
                                    <p className="text-xs text-gray-500 mt-0.5">{p.job_position || '-'} &middot; {p.department || '-'} &middot; Atasan: {p.supervisor_name || '-'}</p>
                                    <p className="text-xs text-gray-400 mt-1">
                                        {p.action_items.length} rencana aksi &middot; {p.reviews.length} riwayat evaluasi &middot; {p.achievements ? 'ada' : 'tanpa'} pencapaian &middot; {p.career_goal ? 'ada' : 'tanpa'} tujuan karir
                                    </p>
                                    {p.hr_note && (
                                        <p className="text-xs text-amber-600 mt-1">Catatan HR: "{p.hr_note.slice(0, 80)}{p.hr_note.length > 80 ? '…' : ''}"{p.hr_note_by ? ` — ${p.hr_note_by}` : ''}</p>
                                    )}
                                </div>
                            ))}
                        </div>
                        <div className="flex gap-3">
                            <button onClick={() => setImportPreview(null)} disabled={isImportingIdp} className="flex-1 px-4 py-2.5 rounded-xl border border-slate-300 text-slate-700 font-medium hover:bg-slate-50 disabled:opacity-50 transition-colors">
                                Batal
                            </button>
                            <button onClick={confirmIdpImport} disabled={isImportingIdp} className="flex-1 px-4 py-2.5 rounded-xl bg-indigo-600 text-white font-medium hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
                                {isImportingIdp ? 'Mengimpor...' : `Impor ${importPreview.length} IDP`}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Reject Modal */}
            {rejectModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
                    <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6">
                        <h3 className="text-xl font-bold text-slate-800 mb-2">{t('team.rejectModalTitle')}</h3>
                        <textarea
                            className="w-full border border-slate-300 rounded-xl p-3 focus:ring-2 focus:ring-rose-500 focus:border-rose-500 outline-none resize-none"
                            rows={4}
                            placeholder={t('team.rejectionReasonPlaceholder')}
                            value={rejectionReason}
                            onChange={e => setRejectionReason(e.target.value)}
                        />
                        <div className="flex gap-3 mt-6">
                            <button onClick={() => { setRejectModalOpen(false); setRejectionReason(''); setRejectTargetId(null); }} className="flex-1 px-4 py-2.5 rounded-xl border border-slate-300 text-slate-700 font-medium hover:bg-slate-50 transition-colors">{t('team.cancel')}</button>
                            <button onClick={confirmReject} disabled={!rejectionReason.trim()} className="flex-1 px-4 py-2.5 rounded-xl bg-rose-600 text-white font-medium hover:bg-rose-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors">{t('team.confirmReject')}</button>
                        </div>
                    </div>
                </div>
            )}

            {/* Delete Confirmation Modal */}
            {deleteTargetId !== null && (() => {
                const target = plans.find(p => p.id === deleteTargetId);
                return (
                    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
                        <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6">
                            <h3 className="text-xl font-bold text-slate-800 mb-2">Hapus IDP Permanen</h3>
                            <p className="text-sm text-slate-600">
                                Yakin ingin menghapus IDP {target ? <span className="font-semibold">{target.employee_name} &middot; Periode {target.period_year}</span> : 'ini'}? Seluruh rencana aksi dan riwayat evaluasi ikut terhapus. Tindakan ini <span className="font-semibold text-rose-600">tidak bisa dibatalkan</span>.
                            </p>
                            <div className="flex gap-3 mt-6">
                                <button onClick={() => setDeleteTargetId(null)} disabled={isDeleting} className="flex-1 px-4 py-2.5 rounded-xl border border-slate-300 text-slate-700 font-medium hover:bg-slate-50 disabled:opacity-50 transition-colors">Batal</button>
                                <button onClick={confirmDeletePlan} disabled={isDeleting} className="flex-1 px-4 py-2.5 rounded-xl bg-rose-600 text-white font-medium hover:bg-rose-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
                                    {isDeleting ? 'Menghapus...' : 'Hapus Permanen'}
                                </button>
                            </div>
                        </div>
                    </div>
                );
            })()}

            {/* Info/Result Modal — in-page stand-in for window.alert() */}
            {infoModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
                    <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6">
                        <h3 className="text-xl font-bold text-slate-800 mb-2">{infoModal.title}</h3>
                        <p className="text-sm text-slate-600 whitespace-pre-line">{infoModal.message}</p>
                        <div className="flex justify-end mt-6">
                            <button onClick={() => setInfoModal(null)} className="px-5 py-2.5 rounded-xl bg-indigo-600 text-white font-medium hover:bg-indigo-700 transition-colors">
                                OK
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
