import { useTranslation } from 'react-i18next';
import type { IDPPlan, IDPActionItem } from '../types';
import { idpLabelCell as labelCell, idpValueCell as valueCell, idpSectionHeaderCell as sectionHeaderCell, idpHintCell as hintCell, idpContentCell as contentCell } from './idpTableStyles';

interface Props {
    plan: IDPPlan;
    // Only the direct supervisor can update checklist progress/notes (tracked in the team view);
    // everywhere else (the employee's own plan, past plans, HR admin) stays fully read-only.
    editableProgress?: boolean;
    onToggleCompleted?: (item: IDPActionItem) => void;
    onNotesChange?: (item: IDPActionItem, notes: string) => void;
}

const formatDate = (val?: string) => val ? new Date(val).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' }) : '-';

// Renders an IDP plan's narrative fields as a read-only Excel-style bordered grid (matching the
// original spreadsheet template), reused by the employee, team, and HR views so they stay visually
// identical. Read-only throughout, except checklist progress/notes when `editableProgress` is set
// (only the team/supervisor view passes that) — the employee's own plan is edited via IDPPage.tsx's
// form instead, and that form no longer lets the employee touch progress/notes at all.
export default function IDPDetailInfoTable({ plan, editableProgress, onToggleCompleted, onNotesChange }: Props) {
    const { t } = useTranslation('idpPage');

    return (
        <div className="overflow-x-auto rounded-xl border border-slate-300">
            <table className="w-full border-collapse table-fixed min-w-[780px]">
                <colgroup>
                    <col className="w-[13%]" />
                    <col className="w-[20%]" />
                    <col className="w-[13%]" />
                    <col className="w-[20%]" />
                    <col className="w-[13%]" />
                    <col className="w-[20%]" />
                </colgroup>
                <tbody>
                    <tr>
                        <td className={labelCell}>{t('form.employeeName')}:</td>
                        <td className={valueCell}>{plan.employee_name || '-'}</td>
                        <td className={labelCell}>{t('form.jobPosition')}:</td>
                        <td className={valueCell}>{plan.job_position || '-'}</td>
                        <td className={labelCell}>{t('form.supervisor')}:</td>
                        <td className={valueCell}>{plan.supervisor_name || '-'}</td>
                    </tr>
                    <tr>
                        <td className={labelCell}>{t('form.period')}:</td>
                        <td className={valueCell}>{plan.period_year}</td>
                        <td className={labelCell}>{t('form.department')}:</td>
                        <td className={valueCell}>{plan.department || '-'}</td>
                        <td className={labelCell}>{t('form.joinDate')}:</td>
                        <td className={valueCell}>{plan.join_date_label || '-'}</td>
                    </tr>

                    <tr><td colSpan={6} className={sectionHeaderCell}>{t('form.achievements')}</td></tr>
                    <tr><td colSpan={6} className={hintCell}>{t('form.achievementsHint')}</td></tr>
                    <tr><td colSpan={6} className={contentCell}>{plan.achievements || '-'}</td></tr>

                    <tr><td colSpan={6} className={sectionHeaderCell}>{t('form.careerGoal')}</td></tr>
                    <tr><td colSpan={6} className={hintCell}>{t('form.careerGoalHint')}</td></tr>
                    <tr><td colSpan={6} className={contentCell}>{plan.career_goal || '-'}</td></tr>

                    <tr>
                        <td colSpan={3} className={sectionHeaderCell}>{t('form.existingSkills')}</td>
                        <td colSpan={3} className={sectionHeaderCell}>{t('form.developmentArea')}</td>
                    </tr>
                    <tr>
                        <td colSpan={3} className={hintCell}>{t('form.existingSkillsHint')}</td>
                        <td colSpan={3} className={hintCell}>{t('form.developmentAreaHint')}</td>
                    </tr>
                    <tr>
                        <td colSpan={3} className={contentCell}>{plan.existing_skills || '-'}</td>
                        <td colSpan={3} className={contentCell}>{plan.development_area || '-'}</td>
                    </tr>

                    {plan.action_items && plan.action_items.length > 0 && (
                        <>
                            <tr>
                                <td colSpan={2} className={sectionHeaderCell}>{t('form.actionPlan')}</td>
                                <td className={`${sectionHeaderCell} cursor-help`} title={t('form.targetTimeTooltip')}>{t('form.targetTime')}</td>
                                <td className={sectionHeaderCell}>{t('form.checklistProgress')}</td>
                                <td colSpan={2} className={sectionHeaderCell}>{t('form.notes')}</td>
                            </tr>
                            <tr>
                                <td colSpan={2} className={hintCell}>{t('form.actionPlanHint')}</td>
                                <td className={hintCell}>{t('form.targetTimeHint')}</td>
                                <td className={hintCell}>{t('form.checklistProgressHint')}</td>
                                <td colSpan={2} className={hintCell}>{t('form.notesHint')}</td>
                            </tr>
                            {plan.action_items.map(item => {
                                const canEditItem = editableProgress && !item.is_mandatory;
                                return (
                                    <tr key={item.id}>
                                        <td colSpan={2} className={contentCell}>{item.action_description}</td>
                                        <td className={valueCell}>{item.target_time || '-'}</td>
                                        <td className={`${valueCell} text-center`}>
                                            <input
                                                type="checkbox"
                                                checked={item.is_mandatory
                                                    ? !!plan.learningProgress && plan.learningProgress.totalJam >= plan.learningProgress.target
                                                    : !!item.is_completed}
                                                disabled={!canEditItem}
                                                readOnly={!canEditItem}
                                                onChange={canEditItem ? () => onToggleCompleted?.(item) : undefined}
                                                className="w-4 h-4 accent-indigo-600"
                                            />
                                        </td>
                                        <td colSpan={2} className={valueCell}>
                                            {canEditItem ? (
                                                <input
                                                    value={item.notes || ''}
                                                    onChange={e => onNotesChange?.(item, e.target.value)}
                                                    placeholder={t('form.notesPlaceholder')}
                                                    className="w-full bg-transparent outline-none"
                                                />
                                            ) : (item.notes || '')}
                                        </td>
                                    </tr>
                                );
                            })}
                        </>
                    )}

                    {(plan.created_by_date || plan.approved_date) && (
                        <tr>
                            <td className={labelCell}>{t('form.createdByDate')}:</td>
                            <td className={valueCell}>{formatDate(plan.created_by_date)}</td>
                            <td className={labelCell}>{t('form.approvedDate')}:</td>
                            <td colSpan={3} className={valueCell}>
                                {formatDate(plan.approved_date)}
                                {plan.approved_by && <span className="block text-xs text-slate-500">{plan.approved_by}</span>}
                            </td>
                        </tr>
                    )}
                </tbody>
            </table>
        </div>
    );
}
