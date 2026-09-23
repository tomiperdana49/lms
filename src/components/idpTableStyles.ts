// Shared cell classes for the Excel-style bordered grid used by IDPDetailInfoTable (view mode) and
// the employee's edit form, so both stay visually identical. Colors follow the company's IDP
// spreadsheet template: navy section titles with white text, gray label/question cells.
export const idpCellBase = 'border border-slate-300 px-3 py-2 text-sm align-top';
export const idpLabelCell = `${idpCellBase} bg-[#cccccc] font-bold text-black`;
export const idpValueCell = `${idpCellBase} text-slate-800 break-words`;
export const idpSectionHeaderCell = `${idpCellBase} bg-[#474c8b] font-bold text-white`;
export const idpHintCell = `${idpCellBase} bg-[#cccccc] text-slate-800`;
export const idpContentCell = `${idpCellBase} text-slate-800 whitespace-pre-wrap py-3`;
export const idpColgroup6 = ['13%', '20%', '13%', '20%', '13%', '20%'];
