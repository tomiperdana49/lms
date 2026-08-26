// Shared parser for the standard IDP Excel template, used by both the HR bulk importer
// (IDPManager.tsx, one sheet per employee) and the employee's own "Import from Excel" (IDPPage.tsx,
// a single sheet). Field positions are located by label text rather than fixed cell indices, so minor
// column drift between real-world sheets doesn't break parsing.

export type IdpImportCell = string | number | boolean | null | undefined;
export type IdpImportGrid = IdpImportCell[][];

export interface IdpImportRow {
    sheet_name: string;
    employee_name: string;
    job_position: string;
    department: string;
    supervisor_name: string;
    period_year: number | null;
    join_date_label: string;
    achievements: string;
    career_goal: string;
    existing_skills: string;
    development_area: string;
    created_by_date: string | null;
    approved_date: string | null;
    hr_note: string | null;
    hr_note_by: string | null;
    action_items: { action_description: string; target_time: string; is_completed: boolean; notes: string; is_mandatory: boolean }[];
    reviews: { review_date: string; supervisor_note: string }[];
}

const IDP_INDO_MONTHS: Record<string, string> = {
    januari: '01', februari: '02', maret: '03', april: '04', mei: '05', juni: '06',
    juli: '07', agustus: '08', september: '09', oktober: '10', november: '11', desember: '12'
};

// Parses dates as written in the IDP template ("29 Januari 2026"), Excel serials, or ISO/slash strings.
export const parseIdpImportDate = (val: IdpImportCell): string | null => {
    if (val === undefined || val === null || val === '') return null;
    if (typeof val === 'number') {
        const d = new Date(Math.round((val - 25569) * 86400 * 1000));
        return isNaN(d.getTime()) ? null : d.toISOString().split('T')[0];
    }
    const str = String(val).trim();
    if (!str) return null;
    const isoMatch = str.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
    if (isoMatch) { const [, y, m, d] = isoMatch; return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`; }
    const slashMatch = str.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (slashMatch) { const [, dd, mm, yyyy] = slashMatch; return `${yyyy}-${mm.padStart(2, '0')}-${dd.padStart(2, '0')}`; }
    const parts = str.toLowerCase().replace(/,/g, '').split(/\s+/);
    const dayPart = parts.find(p => /^\d{1,2}$/.test(p));
    const yearPart = parts.find(p => /^\d{4}$/.test(p));
    const monthPart = parts.find(p => IDP_INDO_MONTHS[p]);
    if (dayPart && yearPart && monthPart) return `${yearPart}-${IDP_INDO_MONTHS[monthPart]}-${dayPart.padStart(2, '0')}`;
    return null;
};

export const idpCellStr = (v: IdpImportCell): string => (v === undefined || v === null) ? '' : String(v).trim();

export const idpFindCell = (grid: IdpImportGrid, pattern: RegExp, startRow = 0): { r: number; c: number } | null => {
    for (let r = startRow; r < grid.length; r++) {
        const row = grid[r] || [];
        for (let c = 0; c < row.length; c++) {
            if (pattern.test(idpCellStr(row[c]))) return { r, c };
        }
    }
    return null;
};

export const idpValueRightOf = (grid: IdpImportGrid, r: number, c: number): string => {
    const row = grid[r] || [];
    for (let cc = c + 1; cc < row.length; cc++) {
        const v = idpCellStr(row[cc]);
        if (v) return v;
    }
    return '';
};

// Reads the free-form answer under a section header (e.g. "Pencapaian / Prestasi Kerja"), skipping the
// guiding question row ("Apa pencapaian kamu...?") so the actual multi-line answer cell is returned.
const idpFindSectionText = (grid: IdpImportGrid, headerPattern: RegExp, stopPattern: RegExp): string => {
    const pos = idpFindCell(grid, headerPattern);
    if (!pos) return '';
    for (let r = pos.r + 1; r < Math.min(pos.r + 8, grid.length); r++) {
        const row = grid[r] || [];
        if (row.some(cell => stopPattern.test(idpCellStr(cell)))) break;
        for (const cell of row) {
            const v = idpCellStr(cell);
            if (!v || v.includes('?') || /^tuliskan/i.test(v)) continue;
            return v;
        }
    }
    return '';
};

// Parses one sheet of the standard IDP Excel template into a structured import row.
export const parseIdpSheet = (grid: IdpImportGrid, sheetName: string): IdpImportRow => {
    const namePos = idpFindCell(grid, /nama karyawan/i);
    const jobPos = idpFindCell(grid, /jabatan/i);
    const supervisorPos = idpFindCell(grid, /atasan langsung/i);
    const periodPos = idpFindCell(grid, /periode idp/i);
    const deptPos = idpFindCell(grid, /departemen/i);
    const joinDatePos = idpFindCell(grid, /tanggal mulai bekerja/i);

    const periodRaw = periodPos ? idpValueRightOf(grid, periodPos.r, periodPos.c) : '';
    const period_year = periodRaw ? parseInt(periodRaw.replace(/\D/g, ''), 10) || null : null;

    const achievements = idpFindSectionText(grid, /pencapaian/i, /tujuan.*karir|aspirasi/i);
    const career_goal = idpFindSectionText(grid, /tujuan.*karir|aspirasi/i, /skill yang dimiliki/i);

    const skillPos = idpFindCell(grid, /skill yang dimiliki/i);
    const devPos = idpFindCell(grid, /area pengembangan/i);
    let existing_skills = '', development_area = '';
    if (skillPos) {
        for (let r = skillPos.r + 1; r < Math.min(skillPos.r + 6, grid.length); r++) {
            const row = grid[r] || [];
            if (/rencana aksi pengembangan/i.test(row.map(idpCellStr).join(' '))) break;
            const skillVal = idpCellStr(row[skillPos.c]);
            const devVal = devPos ? idpCellStr(row[devPos.c]) : '';
            if (skillVal && !skillVal.includes('?') && !existing_skills) existing_skills = skillVal;
            if (devVal && !devVal.includes('?') && !development_area) development_area = devVal;
            if (existing_skills && development_area) break;
        }
    }

    const action_items: IdpImportRow['action_items'] = [];
    const actionHeaderPos = idpFindCell(grid, /rencana aksi pengembangan/i);
    if (actionHeaderPos) {
        const headerRow = grid[actionHeaderPos.r] || [];
        const findColInRow = (row: IdpImportCell[], pattern: RegExp) => row.findIndex(cell => pattern.test(idpCellStr(cell)));
        const targetCol = findColInRow(headerRow, /target waktu/i);
        const checklistCol = findColInRow(headerRow, /checklist/i);
        const notesCol = findColInRow(headerRow, /keterangan/i);
        const descCol = actionHeaderPos.c;

        for (let r = actionHeaderPos.r + 1; r < Math.min(actionHeaderPos.r + 40, grid.length); r++) {
            const row = grid[r] || [];
            const rowStr = row.map(idpCellStr).join(' ');
            if (/tanggal idp dibuat/i.test(rowStr) || /evaluasi idp/i.test(rowStr) || /tanggal review/i.test(rowStr)) break;
            const desc = idpCellStr(row[descCol]);
            if (!desc || desc.includes('?') || /^tuliskan/i.test(desc)) continue;
            const checklistRaw = checklistCol >= 0 ? idpCellStr(row[checklistCol]) : '';
            action_items.push({
                action_description: desc,
                target_time: targetCol >= 0 ? idpCellStr(row[targetCol]) : '',
                is_completed: /^(true|ya|yes|selesai|done|1)$/i.test(checklistRaw),
                notes: notesCol >= 0 ? idpCellStr(row[notesCol]) : '',
                is_mandatory: /wajib/i.test(desc)
            });
        }
    }

    const createdPos = idpFindCell(grid, /tanggal idp dibuat/i);
    const created_by_date = createdPos ? parseIdpImportDate(idpValueRightOf(grid, createdPos.r, createdPos.c)) : null;
    const approvedPos = idpFindCell(grid, /disetujui/i);
    const approved_date = approvedPos ? parseIdpImportDate(idpValueRightOf(grid, approvedPos.r, approvedPos.c)) : null;

    const reviews: IdpImportRow['reviews'] = [];
    const reviewHeaderPos = idpFindCell(grid, /tanggal review/i);
    if (reviewHeaderPos) {
        for (let r = reviewHeaderPos.r + 1; r < Math.min(reviewHeaderPos.r + 60, grid.length); r++) {
            const row = grid[r] || [];
            const iso = parseIdpImportDate(row[reviewHeaderPos.c]);
            if (!iso) continue;
            reviews.push({ review_date: iso, supervisor_note: idpCellStr(row[reviewHeaderPos.c + 1]) });
        }
    }

    // The "Verifikasi IDP (diisi oleh HR)" column sits to the right of the review table and holds a
    // single HR note (often a merged cell) plus the verifier's name — one note per plan, not per review
    // row, so it's read as free text across that column rather than being matched to a specific date.
    let hr_note: string | null = null;
    let hr_note_by: string | null = null;
    const hrColPos = idpFindCell(grid, /verifikasi idp/i);
    if (hrColPos && reviewHeaderPos) {
        for (let r = reviewHeaderPos.r; r < Math.min(reviewHeaderPos.r + 60, grid.length); r++) {
            const v = idpCellStr((grid[r] || [])[hrColPos.c]);
            if (!v || /tanggal verifikasi/i.test(v)) continue;
            if (v.split(/\s+/).length <= 4 && v.length <= 40 && !/[.?!]/.test(v)) {
                hr_note_by = hr_note_by || v;
            } else {
                hr_note = hr_note || v;
            }
        }
    }

    return {
        sheet_name: sheetName,
        employee_name: namePos ? idpValueRightOf(grid, namePos.r, namePos.c) : '',
        job_position: jobPos ? idpValueRightOf(grid, jobPos.r, jobPos.c) : '',
        department: deptPos ? idpValueRightOf(grid, deptPos.r, deptPos.c) : '',
        supervisor_name: supervisorPos ? idpValueRightOf(grid, supervisorPos.r, supervisorPos.c) : '',
        period_year,
        join_date_label: joinDatePos ? idpValueRightOf(grid, joinDatePos.r, joinDatePos.c) : '',
        achievements, career_goal, existing_skills, development_area,
        created_by_date, approved_date, hr_note, hr_note_by, action_items, reviews
    };
};
