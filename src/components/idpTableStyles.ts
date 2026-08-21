// Shared cell classes for the Excel-style bordered grid used by IDPDetailInfoTable (view mode) and
// the employee's edit form, so both stay visually identical.
export const idpCellBase = 'border border-slate-300 px-3 py-2 text-sm align-top';
export const idpLabelCell = `${idpCellBase} bg-slate-100 font-bold text-slate-700`;
export const idpValueCell = `${idpCellBase} text-slate-800 break-words`;
export const idpSectionHeaderCell = `${idpCellBase} bg-slate-200 font-bold text-slate-800`;
export const idpHintCell = `${idpCellBase} bg-slate-50 text-xs text-slate-500 italic`;
export const idpContentCell = `${idpCellBase} text-slate-800 whitespace-pre-wrap py-3`;
export const idpColgroup6 = ['13%', '20%', '13%', '20%', '13%', '20%'];
