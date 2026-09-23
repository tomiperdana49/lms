// Resigned employees and interns aren't granted the annual learning budget - returns which of the
// two applies (for labelling), or null when the employee does get it. Fields are SimAsset's
// employees.active_status / status_join, as returned by /api/employees.
export const learningBudgetExclusion = (emp: { active_status?: string | null; status_join?: string | null }): 'resign' | 'internship' | null => {
    if (emp.active_status === 'Resign') return 'resign';
    if ((emp.status_join || '').toLowerCase() === 'internship') return 'internship';
    return null;
};
