import { useState, useEffect, useMemo, useRef } from 'react';
import * as XLSX from 'xlsx';
import { Search, Download, Loader2, CalendarRange, UsersRound, Building2, MapPin, Check, X, ChevronDown, Trophy, Crown, User, UserCheck } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { API_BASE_URL } from '../config';
import {
    EMPTY_STATS,
    ANNUAL_LEARNING_BUDGET,
    buildSections,
    getDefaultRange,
    formatDate,
    LearningStatsBreakdown,
    LearningStatsSummaryCards
} from './LearningReport';
import type { LearningStats, TeamMemberSummary } from './LearningReport';
import { learningBudgetExclusion } from '../utils/learningBudget';

interface EmployeeOption {
    id_employee: string;
    full_name: string;
    email?: string;
    organization_name?: string;
    branch_name?: string;
    photo_profile?: string;
    active_status?: string | null;
    status_join?: string | null;
}

type EmployeeStatusFilter = '' | 'active' | 'resign' | 'internship';

// Same buckets as the learning budget: resign wins over internship, and anyone who is neither is active.
const employeeStatus = (emp: EmployeeOption): Exclude<EmployeeStatusFilter, ''> => learningBudgetExclusion(emp) ?? 'active';

const EmployeeLearningReport = ({ userRole }: { userRole?: string }) => {
    const canSyncNusawork = userRole === 'HR' || userRole === 'HR_ADMIN';
    const { t } = useTranslation('learningReport');
    const [employees, setEmployees] = useState<EmployeeOption[]>([]);
    const [employeesLoading, setEmployeesLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [employeeDropdownOpen, setEmployeeDropdownOpen] = useState(false);
    // Organization is multi-select (an employee can be filtered into the roster by matching ANY
    // of the picked organizations) - Branch stays single-select below.
    const [selectedOrgs, setSelectedOrgs] = useState<string[]>([]);
    const [orgSearchText, setOrgSearchText] = useState('');
    const [orgDropdownOpen, setOrgDropdownOpen] = useState(false);
    const selectedOrgsRef = useRef(selectedOrgs);
    useEffect(() => { selectedOrgsRef.current = selectedOrgs; }, [selectedOrgs]);
    const [selectedBranch, setSelectedBranch] = useState('');
    const [branchQuery, setBranchQuery] = useState('');
    const [branchDropdownOpen, setBranchDropdownOpen] = useState(false);
    const selectedBranchRef = useRef(selectedBranch);
    useEffect(() => { selectedBranchRef.current = selectedBranch; }, [selectedBranch]);
    const [selectedStatus, setSelectedStatus] = useState<EmployeeStatusFilter>('');
    const [selectedEmployees, setSelectedEmployees] = useState<EmployeeOption[]>([]);
    // Once employees load, default the report to everyone (All Organizations + All Branches) instead
    // of an empty "select employees" state. Only fires once - after that, an explicit "Clear all" is
    // respected instead of being immediately overridden back to everyone.
    const [hasAutoSelectedAll, setHasAutoSelectedAll] = useState(false);
    const [stats, setStats] = useState<LearningStats>(EMPTY_STATS);
    const [perEmployeeStats, setPerEmployeeStats] = useState<TeamMemberSummary[]>([]);
    const [expandedEmployeeIds, setExpandedEmployeeIds] = useState<Set<string>>(new Set());
    const [statsLoading, setStatsLoading] = useState(false);
    const [{ startDate, endDate }, setRange] = useState(getDefaultRange);

    const toggleEmployeeExpanded = (employeeId: string) => {
        setExpandedEmployeeIds(prev => {
            const next = new Set(prev);
            if (next.has(employeeId)) next.delete(employeeId);
            else next.add(employeeId);
            return next;
        });
    };

    // Opens (rather than toggles) an employee's roster row and scrolls it into view,
    // used when the racer avatar on the ranking track is clicked.
    const selectEmployeeInRoster = (employeeId: string) => {
        setExpandedEmployeeIds(prev => new Set(prev).add(employeeId));
        requestAnimationFrame(() => {
            document.getElementById(`employee-roster-row-${employeeId}`)
                ?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        });
    };

    useEffect(() => {
        fetch(`${API_BASE_URL}/api/employees`)
            .then(res => res.json())
            .then((data: EmployeeOption[]) => setEmployees(Array.isArray(data) ? data : []))
            .catch(err => console.error('Error fetching employees:', err))
            .finally(() => setEmployeesLoading(false));
    }, []);

    useEffect(() => {
        if (!hasAutoSelectedAll && !employeesLoading && employees.length > 0) {
            setSelectedEmployees(employees);
            setHasAutoSelectedAll(true);
        }
    }, [hasAutoSelectedAll, employeesLoading, employees]);

    useEffect(() => {
        if (selectedEmployees.length === 0) {
            setStats(EMPTY_STATS);
            setPerEmployeeStats([]);
            return;
        }
        setStatsLoading(true);
        fetch(`${API_BASE_URL}/api/learning-stats/bulk`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                employees: selectedEmployees.map(emp => ({ employee_id: emp.id_employee, email: emp.email, name: emp.full_name })),
                startDate,
                endDate
            })
        })
            .then(res => res.json())
            .then(data => {
                if (!data.error) {
                    setStats(data);
                    const perEmployee: TeamMemberSummary[] = Array.isArray(data.perEmployee) ? data.perEmployee : [];
                    perEmployee.sort((a, b) => b.stats.totalJam - a.stats.totalJam);
                    setPerEmployeeStats(perEmployee);
                }
            })
            .catch(err => console.error('Error fetching learning stats:', err))
            .finally(() => setStatsLoading(false));
    }, [selectedEmployees, startDate, endDate]);

    const selectedIds = useMemo(() => new Set(selectedEmployees.map(emp => emp.id_employee)), [selectedEmployees]);
    // Resigned employees and interns get no learning budget - kept out of the budget total, and
    // labelled in the roster so HR can see why.
    const budgetExclusionById = useMemo(() => {
        const map = new Map<string, 'resign' | 'internship'>();
        selectedEmployees.forEach(emp => {
            const exclusion = learningBudgetExclusion(emp);
            if (exclusion) map.set(emp.id_employee, exclusion);
        });
        return map;
    }, [selectedEmployees]);
    const budgetEmployeeCount = selectedEmployees.length - budgetExclusionById.size;

    const organizations = useMemo(() => {
        const names = new Set(employees.map(emp => emp.organization_name).filter(Boolean) as string[]);
        return [...names].sort((a, b) => a.localeCompare(b));
    }, [employees]);

    const filteredOrganizations = useMemo(() => {
        const q = orgSearchText.trim().toLowerCase();
        if (!q) return organizations;
        return organizations.filter(org => org.toLowerCase().includes(q));
    }, [organizations, orgSearchText]);

    // What the org input shows once closed: the org name itself for a single pick, a short
    // joined list for a couple, and a "{{count}} Organizations selected" summary beyond that -
    // otherwise a 5+ pick would overflow the input.
    const orgSummaryLabel = useMemo(() => {
        if (selectedOrgs.length === 0) return '';
        if (selectedOrgs.length <= 2) return selectedOrgs.join(', ');
        return t('employee.organizationsSelected', { count: selectedOrgs.length });
    }, [selectedOrgs, t]);

    const branches = useMemo(() => {
        const names = new Set(employees.map(emp => emp.branch_name).filter(Boolean) as string[]);
        return [...names].sort((a, b) => a.localeCompare(b));
    }, [employees]);

    const filteredBranches = useMemo(() => {
        const q = branchQuery.trim().toLowerCase();
        if (!q) return branches;
        return branches.filter(branch => branch.toLowerCase().includes(q));
    }, [branches, branchQuery]);

    const filteredEmployees = useMemo(() => {
        const q = search.trim().toLowerCase();
        const sorted = [...employees].sort((a, b) => a.full_name.localeCompare(b.full_name));
        return sorted.filter(emp => {
            if (selectedIds.has(emp.id_employee)) return false;
            const matchesOrg = selectedOrgs.length === 0 || (!!emp.organization_name && selectedOrgs.includes(emp.organization_name));
            const matchesBranch = !selectedBranch || emp.branch_name === selectedBranch;
            const matchesStatus = !selectedStatus || employeeStatus(emp) === selectedStatus;
            const matchesSearch = !q || emp.full_name?.toLowerCase().includes(q) || emp.email?.toLowerCase().includes(q);
            return matchesOrg && matchesBranch && matchesStatus && matchesSearch;
        });
    }, [employees, search, selectedOrgs, selectedBranch, selectedStatus, selectedIds]);

    const sections = useMemo(() => buildSections(stats, t), [stats, t]);
    const includeEmployeeColumn = selectedEmployees.length > 1;
    // perEmployeeStats is already sorted descending by totalJam, so this is just the top slice.
    const topThreeByHours = useMemo(
        () => perEmployeeStats.slice(0, 3).map(member => ({
            ...member,
            photoUrl: employees.find(emp => emp.id_employee === member.employeeId)?.photo_profile
        })),
        [perEmployeeStats, employees]
    );

    const handleAddEmployee = (emp: EmployeeOption) => {
        setSelectedEmployees(prev => [...prev, emp]);
        setSearch('');
    };

    const handleRemoveEmployee = (id: string) => {
        setSelectedEmployees(prev => prev.filter(emp => emp.id_employee !== id));
    };

    // Recomputes the employee roster from whichever of org/branch/status is currently active, so the
    // filters combine (AND) instead of one silently overriding another's selection. Organization
    // itself is OR'd across every picked org. Bails out when all are cleared so clearing filters
    // doesn't wipe out employees the user added by hand.
    const applyRosterFilter = (orgs: string[], branch: string, status: EmployeeStatusFilter = selectedStatus) => {
        if (orgs.length === 0 && !branch && !status) return;
        setSelectedEmployees(employees.filter(emp =>
            (orgs.length === 0 || (!!emp.organization_name && orgs.includes(emp.organization_name)))
            && (!branch || emp.branch_name === branch)
            && (!status || employeeStatus(emp) === status)
        ));
    };

    const handleStatusSelect = (status: EmployeeStatusFilter) => {
        setSelectedStatus(status);
        applyRosterFilter(selectedOrgsRef.current, selectedBranchRef.current, status);
    };

    // Toggles one organization in/out of the selection - the dropdown stays open so several can
    // be picked in a row, unlike the single-select Branch filter below.
    const handleOrgToggle = (org: string) => {
        const next = selectedOrgs.includes(org) ? selectedOrgs.filter(o => o !== org) : [...selectedOrgs, org];
        setSelectedOrgs(next);
        applyRosterFilter(next, selectedBranchRef.current);
    };

    const handleOrgClearAll = () => {
        setSelectedOrgs([]);
        setOrgDropdownOpen(false);
        applyRosterFilter([], selectedBranchRef.current);
    };

    const handleBranchSelect = (branch: string) => {
        setSelectedBranch(branch);
        setBranchQuery(branch);
        setBranchDropdownOpen(false);
        applyRosterFilter(selectedOrgsRef.current, branch);
    };

    const handleExport = () => {
        if (selectedEmployees.length === 0) return;
        const rows = sections.flatMap(section => {
            // Online Modules has real pre/post-test scores too (just no feedback mechanism).
            const hasTestScores = section.key === 'training' || section.key === 'online';
            return section.items.map(item => ({
                ...(includeEmployeeColumn ? { [t('export.employeeColumn')]: item.employeeName || '' } : {}),
                [t('export.categoryColumn')]: section.label,
                [t('export.titleColumn')]: item.title,
                [t('export.dateColumn')]: formatDate(item.date),
                [t('export.hoursColumn')]: item.hours,
                [t('export.costColumn')]: item.cost,
                [t('export.preTestColumn')]: hasTestScores ? (item.preTestScore ?? '') : '',
                [t('export.postTestColumn')]: hasTestScores ? (item.postTestScore ?? '') : '',
                [t('export.feedbackColumn')]: section.key === 'training' ? (item.feedbackSubmitted ? (item.feedbackScore ?? t('export.submitted')) : '') : '',
                [t('export.pteColumn')]: (section.key === 'training' || section.key === 'trainingExternal') ? (item.pteScore ?? '') : ''
            }));
        });
        rows.push({
            ...(includeEmployeeColumn ? { [t('export.employeeColumn')]: '' } : {}),
            [t('export.categoryColumn')]: t('export.grandTotalRow'),
            [t('export.titleColumn')]: '',
            [t('export.dateColumn')]: '',
            [t('export.hoursColumn')]: stats.totalJam,
            [t('export.costColumn')]: stats.totalBiaya,
            [t('export.preTestColumn')]: '',
            [t('export.postTestColumn')]: '',
            [t('export.feedbackColumn')]: '',
            [t('export.pteColumn')]: ''
        });

        const ws = XLSX.utils.json_to_sheet(rows);
        ws['!cols'] = [
            ...(includeEmployeeColumn ? [{ wch: 24 }] : []),
            { wch: 20 }, { wch: 45 }, { wch: 14 }, { wch: 12 }, { wch: 18 }, { wch: 12 }, { wch: 12 }, { wch: 14 }, { wch: 10 }
        ];
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, t('export.sheetName'));
        const fileLabel = selectedEmployees.length === 1
            ? selectedEmployees[0].full_name.replace(/\s+/g, '_')
            : `${selectedEmployees.length}_Employees`;
        XLSX.writeFile(wb, `Learning_Report_${fileLabel}_${startDate}_to_${endDate}.xlsx`);
    };

    return (
        <div className="p-4 sm:p-6 lg:p-8 space-y-6 max-w-6xl mx-auto">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-black text-slate-800 tracking-tight">{t('employee.title')}</h1>
                    <p className="text-slate-400 text-sm font-medium mt-1">{t('employee.subtitle')}</p>
                </div>
                <button
                    onClick={handleExport}
                    disabled={selectedEmployees.length === 0 || statsLoading}
                    className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white font-bold px-5 py-3 rounded-xl shadow-lg shadow-blue-200 transition-all disabled:opacity-50 disabled:cursor-not-allowed shrink-0"
                >
                    <Download size={18} /> {t('exportButton')}
                </button>
            </div>

            {/* Employee + Date Range Filter */}
            <div className="bg-white border border-slate-100 rounded-2xl p-4 space-y-3">
                <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 text-slate-400">
                        <UsersRound size={16} />
                        <span className="text-xs font-black uppercase tracking-widest">{t('employee.selectLabel')}</span>
                    </div>
                    {selectedEmployees.length > 0 && (
                        <button
                            onClick={() => {
                                setSelectedEmployees([]);
                                setSelectedOrgs([]);
                                setSelectedBranch('');
                                setBranchQuery('');
                                setSelectedStatus('');
                            }}
                            className="text-xs font-bold text-slate-400 hover:text-red-600 px-2 py-1"
                        >
                            {t('employee.clearAll')}
                        </button>
                    )}
                </div>

                {selectedEmployees.length > 0 && (
                    <div className="flex flex-wrap items-center gap-2 max-h-[88px] overflow-y-auto pr-1">
                        {selectedEmployees.map(emp => (
                            <span
                                key={emp.id_employee}
                                className="inline-flex items-center gap-1.5 bg-blue-50 text-blue-700 text-xs font-semibold pl-3 pr-1.5 py-1.5 rounded-full"
                            >
                                {emp.full_name}
                                <button
                                    onClick={() => handleRemoveEmployee(emp.id_employee)}
                                    className="hover:bg-blue-100 rounded-full p-0.5 transition-colors"
                                >
                                    <X size={12} />
                                </button>
                            </span>
                        ))}
                    </div>
                )}

                <div className="flex flex-col sm:flex-row sm:flex-wrap gap-2">
                    <div className="relative flex-1">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                        <input
                            type="text"
                            value={search}
                            onFocus={() => setEmployeeDropdownOpen(true)}
                            onBlur={() => setTimeout(() => setEmployeeDropdownOpen(false), 150)}
                            onChange={e => { setSearch(e.target.value); setEmployeeDropdownOpen(true); }}
                            placeholder={t('employee.searchPlaceholder')}
                            className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                        {employeeDropdownOpen && !employeesLoading && (search.trim() || selectedOrgs.length > 0 || selectedBranch || selectedStatus) && (
                            <div className="absolute z-20 mt-1 w-full max-h-56 overflow-y-auto bg-white border border-slate-100 rounded-lg shadow-lg divide-y divide-slate-50">
                                {filteredEmployees.length === 0 ? (
                                    <p className="text-sm text-slate-400 italic px-4 py-3">{t('employee.notFound')}</p>
                                ) : filteredEmployees.slice(0, 20).map(emp => (
                                    <button
                                        key={emp.id_employee}
                                        onMouseDown={e => e.preventDefault()}
                                        onClick={() => handleAddEmployee(emp)}
                                        className="w-full text-left px-4 py-2 hover:bg-slate-50 transition-colors"
                                    >
                                        <p className="text-sm font-semibold text-slate-700">{emp.full_name}</p>
                                        {emp.email && <p className="text-[11px] text-slate-400">{emp.email}</p>}
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>
                    <div className="relative sm:w-64">
                        <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" size={16} />
                        <input
                            type="text"
                            value={orgDropdownOpen ? orgSearchText : orgSummaryLabel}
                            onFocus={() => { setOrgDropdownOpen(true); setOrgSearchText(''); }}
                            onBlur={() => setTimeout(() => setOrgDropdownOpen(false), 150)}
                            onChange={e => { setOrgSearchText(e.target.value); setOrgDropdownOpen(true); }}
                            placeholder={t('employee.allOrganizations')}
                            className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                        {orgDropdownOpen && (
                            <div className="absolute z-20 mt-1 w-full max-h-72 overflow-y-auto bg-white border border-slate-100 rounded-lg shadow-lg divide-y divide-slate-50">
                                <button
                                    type="button"
                                    onMouseDown={e => e.preventDefault()}
                                    onClick={handleOrgClearAll}
                                    className="w-full flex items-center justify-between text-left px-4 py-2 hover:bg-slate-50 transition-colors text-sm font-semibold text-slate-700"
                                >
                                    {t('employee.allOrganizations')}
                                    {selectedOrgs.length === 0 && <Check size={14} className="text-blue-600" />}
                                </button>
                                {filteredOrganizations.length === 0 ? (
                                    <p className="text-sm text-slate-400 italic px-4 py-3">{t('employee.notFound')}</p>
                                ) : filteredOrganizations.map(org => {
                                    const isChecked = selectedOrgs.includes(org);
                                    return (
                                        <button
                                            key={org}
                                            type="button"
                                            // A real <label>/<input type="checkbox"> pair would blur this
                                            // dropdown's search input on every click regardless - a
                                            // label's default click-forwarding (which focuses the
                                            // checkbox) fires as part of the click event, not mousedown,
                                            // so preventDefault on mousedown can't stop it. A plain button
                                            // (same as the row above) doesn't have that native forwarding,
                                            // so preventDefault here reliably keeps focus - and the
                                            // dropdown open - across multiple picks.
                                            onMouseDown={e => e.preventDefault()}
                                            onClick={() => handleOrgToggle(org)}
                                            className="w-full flex items-center gap-2.5 text-left px-4 py-2 hover:bg-slate-50 transition-colors text-sm text-slate-700"
                                        >
                                            <span className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 ${isChecked ? 'bg-blue-600 border-blue-600' : 'border-slate-300'}`}>
                                                {isChecked && <Check size={12} className="text-white" strokeWidth={3} />}
                                            </span>
                                            {org}
                                        </button>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                    <div className="relative sm:w-64">
                        <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                        <input
                            type="text"
                            value={branchQuery}
                            onFocus={() => setBranchDropdownOpen(true)}
                            onBlur={() => setTimeout(() => { setBranchDropdownOpen(false); setBranchQuery(selectedBranchRef.current); }, 150)}
                            onChange={e => { setBranchQuery(e.target.value); setBranchDropdownOpen(true); }}
                            placeholder={t('employee.allBranches')}
                            className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                        {branchDropdownOpen && (
                            <div className="absolute z-20 mt-1 w-full max-h-64 overflow-y-auto bg-white border border-slate-100 rounded-lg shadow-lg divide-y divide-slate-50">
                                <button
                                    onMouseDown={e => e.preventDefault()}
                                    onClick={() => handleBranchSelect('')}
                                    className="w-full flex items-center justify-between text-left px-4 py-2 hover:bg-slate-50 transition-colors text-sm font-semibold text-slate-700"
                                >
                                    {t('employee.allBranches')}
                                    {!selectedBranch && <Check size={14} className="text-blue-600" />}
                                </button>
                                {filteredBranches.length === 0 ? (
                                    <p className="text-sm text-slate-400 italic px-4 py-3">{t('employee.notFound')}</p>
                                ) : filteredBranches.map(branch => (
                                    <button
                                        key={branch}
                                        onMouseDown={e => e.preventDefault()}
                                        onClick={() => handleBranchSelect(branch)}
                                        className="w-full flex items-center justify-between text-left px-4 py-2 hover:bg-slate-50 transition-colors text-sm text-slate-700"
                                    >
                                        {branch}
                                        {selectedBranch === branch && <Check size={14} className="text-blue-600" />}
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>
                    <div className="relative sm:w-48">
                        <UserCheck className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" size={16} />
                        <select
                            value={selectedStatus}
                            onChange={e => handleStatusSelect(e.target.value as EmployeeStatusFilter)}
                            className="w-full appearance-none pl-9 pr-8 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
                        >
                            <option value="">{t('employee.status.all')}</option>
                            <option value="active">{t('employee.status.active')}</option>
                            <option value="resign">{t('employee.status.resign')}</option>
                            <option value="internship">{t('employee.status.internship')}</option>
                        </select>
                        <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" size={16} />
                    </div>
                </div>

                {selectedOrgs.length > 0 && (
                    <div className="flex flex-wrap items-center gap-1.5">
                        {selectedOrgs.map(org => (
                            <span
                                key={org}
                                className="inline-flex items-center gap-1 bg-indigo-50 text-indigo-700 text-xs font-semibold pl-2.5 pr-1 py-1 rounded-full"
                            >
                                {org}
                                <button
                                    type="button"
                                    onClick={() => handleOrgToggle(org)}
                                    className="hover:bg-indigo-100 rounded-full p-0.5 transition-colors"
                                >
                                    <X size={11} />
                                </button>
                            </span>
                        ))}
                    </div>
                )}

                <div className="flex items-center gap-2 text-slate-400 pt-2 border-t border-slate-100">
                    <CalendarRange size={16} />
                    <span className="text-xs font-black uppercase tracking-widest">{t('filter.label')}</span>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                    <input
                        type="date"
                        value={startDate}
                        max={endDate}
                        onChange={e => setRange(prev => ({ ...prev, startDate: e.target.value }))}
                        className="border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                    <span className="text-slate-400 text-sm">{t('filter.to')}</span>
                    <input
                        type="date"
                        value={endDate}
                        min={startDate}
                        onChange={e => setRange(prev => ({ ...prev, endDate: e.target.value }))}
                        className="border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                    <button
                        onClick={() => setRange(getDefaultRange())}
                        className="text-xs font-bold text-blue-600 hover:text-blue-700 ml-auto"
                    >
                        {t('filter.reset')}
                    </button>
                </div>
            </div>

            {selectedEmployees.length === 0 ? (
                <div className="bg-white border border-slate-100 rounded-3xl p-16 text-center text-slate-400">
                    <UsersRound size={40} className="mx-auto mb-3 opacity-40" />
                    <p>{t('employee.noSelection')}</p>
                </div>
            ) : statsLoading ? (
                <div className="flex flex-col items-center justify-center py-24 text-slate-400">
                    <Loader2 className="animate-spin mb-3" size={32} />
                    <p>{t('loading')}</p>
                </div>
            ) : selectedEmployees.length === 1 ? (
                <LearningStatsBreakdown stats={stats} t={t} canSyncNusawork={canSyncNusawork} employeeCount={budgetEmployeeCount} />
            ) : (
                <>
                    <LearningStatsSummaryCards stats={stats} t={t} employeeCount={budgetEmployeeCount} noBudgetCount={budgetExclusionById.size} />
                    {topThreeByHours.length > 1 && (
                        <PodiumRanking members={topThreeByHours} onSelect={selectEmployeeInRoster} t={t} />
                    )}
                    <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">
                        {t('employee.rosterHint', { count: selectedEmployees.length })}
                    </p>
                    <EmployeeRoster
                        members={perEmployeeStats}
                        expandedIds={expandedEmployeeIds}
                        onToggle={toggleEmployeeExpanded}
                        budgetExclusionById={budgetExclusionById}
                        canSyncNusawork={canSyncNusawork}
                        t={t}
                    />
                </>
            )}
        </div>
    );
};

interface EmployeeRosterProps {
    members: TeamMemberSummary[];
    expandedIds: Set<string>;
    onToggle: (employeeId: string) => void;
    budgetExclusionById: Map<string, 'resign' | 'internship'>;
    canSyncNusawork?: boolean;
    t: (key: string, options?: Record<string, unknown>) => string;
}

const EmployeeRoster = ({ members, expandedIds, onToggle, budgetExclusionById, canSyncNusawork, t }: EmployeeRosterProps) => (
    <div className="bg-white border border-slate-100 rounded-3xl shadow-sm overflow-hidden">
        <div className="divide-y divide-slate-50">
            {members.map(member => {
                const isExpanded = expandedIds.has(member.employeeId);
                const budgetExclusion = budgetExclusionById.get(member.employeeId);
                return (
                    <div key={member.employeeId} id={`employee-roster-row-${member.employeeId}`} className="scroll-mt-24">
                        <button
                            type="button"
                            onClick={() => onToggle(member.employeeId)}
                            className="w-full flex items-center justify-between gap-4 px-6 py-4 hover:bg-slate-50 transition-colors text-left"
                        >
                            <div className="flex items-center gap-2 min-w-0">
                                <p className="font-semibold text-slate-700 text-sm truncate">{member.name}</p>
                                {budgetExclusion && (
                                    <span className="shrink-0 px-2 py-0.5 rounded-md bg-slate-100 text-slate-500 text-[10px] font-bold uppercase tracking-wider">
                                        {t(`employee.budgetExclusion.${budgetExclusion}`)}
                                    </span>
                                )}
                            </div>
                            <div className="flex items-center gap-3 shrink-0">
                                <div className="text-right">
                                    <p className="font-bold text-slate-700 text-sm">{member.stats.totalJam} {t('hours')}</p>
                                    <p className={`text-[11px] ${!budgetExclusion && member.stats.totalBiaya > ANNUAL_LEARNING_BUDGET ? 'text-red-600 font-bold' : 'text-slate-400'}`}>
                                        Rp {member.stats.totalBiaya.toLocaleString('id-ID')}
                                    </p>
                                </div>
                                <ChevronDown size={16} className={`text-slate-300 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                            </div>
                        </button>
                        {isExpanded && (
                            <div className="bg-slate-50 px-6 py-6 border-t border-slate-100 space-y-6">
                                <LearningStatsBreakdown stats={member.stats} t={t} canSyncNusawork={canSyncNusawork} employeeCount={budgetExclusion ? 0 : 1} />
                            </div>
                        )}
                    </div>
                );
            })}
        </div>
    </div>
);

interface PodiumRankingProps {
    // Pre-sorted descending by stats.totalJam and already capped to the top 3 (>= 2 entries).
    members: (TeamMemberSummary & { photoUrl?: string })[];
    onSelect: (employeeId: string) => void;
    t: (key: string, options?: Record<string, unknown>) => string;
}

const PODIUM_STYLES = [
    { avatar: 'from-amber-300 to-amber-500', badge: 'bg-amber-500', platform: 'bg-amber-400' }, // #1 gold
    { avatar: 'from-slate-300 to-slate-400', badge: 'bg-slate-400', platform: 'bg-slate-300' }, // #2 silver
    { avatar: 'from-orange-300 to-orange-500', badge: 'bg-orange-500', platform: 'bg-orange-400' } // #3 bronze
];

// Shows the employee's real photo when available; falls back to a generic person icon
// (rather than initials) so a missing photo doesn't need a name to render sensibly.
const PodiumAvatar = ({ photoUrl, gradientClass }: { photoUrl?: string; gradientClass: string }) => {
    const [failed, setFailed] = useState(false);
    if (photoUrl && !failed) {
        return (
            <img
                src={photoUrl}
                alt=""
                onError={() => setFailed(true)}
                className="w-14 h-14 sm:w-16 sm:h-16 rounded-full object-cover shadow-md ring-4 ring-white group-hover:scale-105 transition-transform"
            />
        );
    }
    return (
        <div className={`w-14 h-14 sm:w-16 sm:h-16 rounded-full bg-gradient-to-br ${gradientClass} flex items-center justify-center text-white shadow-md ring-4 ring-white group-hover:scale-105 transition-transform`}>
            <User size={24} strokeWidth={2.25} />
        </div>
    );
};

const PodiumRanking = ({ members, onSelect, t }: PodiumRankingProps) => {
    const top3 = members.slice(0, 3);

    const values = top3.map(m => m.stats.totalJam);
    const maxVal = Math.max(...values);
    const minVal = Math.min(...values);
    const spread = maxVal - minVal;
    // Platform height also follows actual hours (min-max over the podium), not just a fixed
    // 1st/2nd/3rd step, so the podium keeps the same "real gap" story as the race track.
    const heightFor = (v: number) => 64 + (spread === 0 ? 1 : (v - minVal) / spread) * 56;

    // Classic podium arrangement: 2nd - 1st - 3rd, winner in the center.
    const order = [1, 0, 2].filter(i => top3[i]);

    return (
        <div className="bg-white border border-slate-100 rounded-3xl shadow-sm p-6">
            <div className="flex items-center gap-2 text-slate-400 mb-6">
                <Trophy size={16} />
                <span className="text-xs font-black uppercase tracking-widest">{t('employee.topRankingTitle')}</span>
            </div>

            <div className="flex items-end justify-center gap-4 sm:gap-8">
                {order.map(i => {
                    const member = top3[i];
                    const style = PODIUM_STYLES[i];
                    const height = heightFor(member.stats.totalJam);
                    return (
                        <button
                            key={member.employeeId}
                            type="button"
                            onClick={() => onSelect(member.employeeId)}
                            className="flex flex-col items-center gap-2 group"
                        >
                            {i === 0 && <Crown size={20} className="text-amber-400" />}
                            <div className="relative">
                                <PodiumAvatar photoUrl={member.photoUrl} gradientClass={style.avatar} />
                                <span className={`absolute -bottom-1 -right-1 w-6 h-6 rounded-full ${style.badge} text-white text-[10px] font-black flex items-center justify-center ring-2 ring-white`}>
                                    {i + 1}
                                </span>
                            </div>
                            <p className="text-sm font-bold text-slate-700 text-center max-w-[110px] truncate">{member.name}</p>
                            <p className="text-xs text-slate-400 font-semibold">{member.stats.totalJam} {t('hours')}</p>
                            <div className={`w-20 sm:w-24 rounded-t-xl ${style.platform}`} style={{ height }} />
                        </button>
                    );
                })}
            </div>
        </div>
    );
};

export default EmployeeLearningReport;
