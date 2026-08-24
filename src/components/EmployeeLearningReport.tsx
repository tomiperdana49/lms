import { useState, useEffect, useMemo, useRef } from 'react';
import * as XLSX from 'xlsx';
import { Search, Download, Loader2, CalendarRange, UsersRound, Building2, Check, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { API_BASE_URL } from '../config';
import {
    EMPTY_STATS,
    buildSections,
    getDefaultRange,
    formatDate,
    LearningStatsBreakdown
} from './LearningReport';
import type { LearningStats } from './LearningReport';

interface EmployeeOption {
    id_employee: string;
    full_name: string;
    email?: string;
    organization_name?: string;
}

const EmployeeLearningReport = () => {
    const { t } = useTranslation('learningReport');
    const [employees, setEmployees] = useState<EmployeeOption[]>([]);
    const [employeesLoading, setEmployeesLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [employeeDropdownOpen, setEmployeeDropdownOpen] = useState(false);
    const [selectedOrg, setSelectedOrg] = useState('');
    const [orgQuery, setOrgQuery] = useState('');
    const [orgDropdownOpen, setOrgDropdownOpen] = useState(false);
    const selectedOrgRef = useRef(selectedOrg);
    selectedOrgRef.current = selectedOrg;
    const [selectedEmployees, setSelectedEmployees] = useState<EmployeeOption[]>([]);
    const [stats, setStats] = useState<LearningStats>(EMPTY_STATS);
    const [statsLoading, setStatsLoading] = useState(false);
    const [{ startDate, endDate }, setRange] = useState(getDefaultRange);

    useEffect(() => {
        fetch(`${API_BASE_URL}/api/employees`)
            .then(res => res.json())
            .then((data: EmployeeOption[]) => setEmployees(Array.isArray(data) ? data : []))
            .catch(err => console.error('Error fetching employees:', err))
            .finally(() => setEmployeesLoading(false));
    }, []);

    useEffect(() => {
        if (selectedEmployees.length === 0) {
            setStats(EMPTY_STATS);
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
            .then(data => { if (!data.error) setStats(data); })
            .catch(err => console.error('Error fetching learning stats:', err))
            .finally(() => setStatsLoading(false));
    }, [selectedEmployees, startDate, endDate]);

    const selectedIds = useMemo(() => new Set(selectedEmployees.map(emp => emp.id_employee)), [selectedEmployees]);

    const organizations = useMemo(() => {
        const names = new Set(employees.map(emp => emp.organization_name).filter(Boolean) as string[]);
        return [...names].sort((a, b) => a.localeCompare(b));
    }, [employees]);

    const filteredOrganizations = useMemo(() => {
        const q = orgQuery.trim().toLowerCase();
        if (!q) return organizations;
        return organizations.filter(org => org.toLowerCase().includes(q));
    }, [organizations, orgQuery]);

    const filteredEmployees = useMemo(() => {
        const q = search.trim().toLowerCase();
        const sorted = [...employees].sort((a, b) => a.full_name.localeCompare(b.full_name));
        return sorted.filter(emp => {
            if (selectedIds.has(emp.id_employee)) return false;
            const matchesOrg = !selectedOrg || emp.organization_name === selectedOrg;
            const matchesSearch = !q || emp.full_name?.toLowerCase().includes(q) || emp.email?.toLowerCase().includes(q);
            return matchesOrg && matchesSearch;
        });
    }, [employees, search, selectedOrg, selectedIds]);

    const sections = useMemo(() => buildSections(stats, t), [stats, t]);
    const includeEmployeeColumn = selectedEmployees.length > 1;

    const handleAddEmployee = (emp: EmployeeOption) => {
        setSelectedEmployees(prev => [...prev, emp]);
        setSearch('');
    };

    const handleRemoveEmployee = (id: string) => {
        setSelectedEmployees(prev => prev.filter(emp => emp.id_employee !== id));
    };

    const handleOrgSelect = (org: string) => {
        setSelectedOrg(org);
        setOrgQuery(org);
        setOrgDropdownOpen(false);
        if (org) {
            setSelectedEmployees(employees.filter(emp => emp.organization_name === org));
        }
    };

    const handleExport = () => {
        if (selectedEmployees.length === 0) return;
        const rows = sections.flatMap(section =>
            section.items.map(item => ({
                ...(includeEmployeeColumn ? { [t('export.employeeColumn')]: item.employeeName || '' } : {}),
                [t('export.categoryColumn')]: section.label,
                [t('export.titleColumn')]: item.title,
                [t('export.dateColumn')]: formatDate(item.date),
                [t('export.hoursColumn')]: item.hours,
                [t('export.costColumn')]: item.cost,
                [t('export.preTestColumn')]: section.key === 'training' ? (item.preTestScore ?? t('export.notTaken')) : '',
                [t('export.postTestColumn')]: section.key === 'training' ? (item.postTestScore ?? t('export.notTaken')) : '',
                [t('export.feedbackColumn')]: section.key === 'training' ? (item.feedbackSubmitted ? (item.feedbackScore ?? t('export.submitted')) : t('export.notSubmitted')) : ''
            }))
        );
        rows.push({
            ...(includeEmployeeColumn ? { [t('export.employeeColumn')]: '' } : {}),
            [t('export.categoryColumn')]: t('export.grandTotalRow'),
            [t('export.titleColumn')]: '',
            [t('export.dateColumn')]: '',
            [t('export.hoursColumn')]: stats.totalJam,
            [t('export.costColumn')]: stats.totalBiaya,
            [t('export.preTestColumn')]: '',
            [t('export.postTestColumn')]: '',
            [t('export.feedbackColumn')]: ''
        });

        const ws = XLSX.utils.json_to_sheet(rows);
        ws['!cols'] = [
            ...(includeEmployeeColumn ? [{ wch: 24 }] : []),
            { wch: 20 }, { wch: 45 }, { wch: 14 }, { wch: 12 }, { wch: 18 }, { wch: 12 }, { wch: 12 }, { wch: 14 }
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
                <div className="flex items-center gap-2 text-slate-400">
                    <UsersRound size={16} />
                    <span className="text-xs font-black uppercase tracking-widest">{t('employee.selectLabel')}</span>
                </div>

                {selectedEmployees.length > 0 && (
                    <div className="flex flex-wrap items-center gap-2">
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
                        <button
                            onClick={() => {
                                setSelectedEmployees([]);
                                setSelectedOrg('');
                                setOrgQuery('');
                            }}
                            className="text-xs font-bold text-slate-400 hover:text-red-600 px-2 py-1.5"
                        >
                            {t('employee.clearAll')}
                        </button>
                    </div>
                )}

                <div className="flex flex-col sm:flex-row gap-2">
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
                        {employeeDropdownOpen && !employeesLoading && (search.trim() || selectedOrg) && (
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
                        <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                        <input
                            type="text"
                            value={orgQuery}
                            onFocus={() => setOrgDropdownOpen(true)}
                            onBlur={() => setTimeout(() => { setOrgDropdownOpen(false); setOrgQuery(selectedOrgRef.current); }, 150)}
                            onChange={e => { setOrgQuery(e.target.value); setOrgDropdownOpen(true); }}
                            placeholder={t('employee.allOrganizations')}
                            className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                        {orgDropdownOpen && (
                            <div className="absolute z-20 mt-1 w-full max-h-64 overflow-y-auto bg-white border border-slate-100 rounded-lg shadow-lg divide-y divide-slate-50">
                                <button
                                    onMouseDown={e => e.preventDefault()}
                                    onClick={() => handleOrgSelect('')}
                                    className="w-full flex items-center justify-between text-left px-4 py-2 hover:bg-slate-50 transition-colors text-sm font-semibold text-slate-700"
                                >
                                    {t('employee.allOrganizations')}
                                    {!selectedOrg && <Check size={14} className="text-blue-600" />}
                                </button>
                                {filteredOrganizations.length === 0 ? (
                                    <p className="text-sm text-slate-400 italic px-4 py-3">{t('employee.notFound')}</p>
                                ) : filteredOrganizations.map(org => (
                                    <button
                                        key={org}
                                        onMouseDown={e => e.preventDefault()}
                                        onClick={() => handleOrgSelect(org)}
                                        className="w-full flex items-center justify-between text-left px-4 py-2 hover:bg-slate-50 transition-colors text-sm text-slate-700"
                                    >
                                        {org}
                                        {selectedOrg === org && <Check size={14} className="text-blue-600" />}
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>
                </div>

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
            ) : (
                <>
                    {selectedEmployees.length > 1 && (
                        <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">
                            {t('employee.combinedFor', { count: selectedEmployees.length })}
                        </p>
                    )}
                    <LearningStatsBreakdown stats={stats} t={t} />
                </>
            )}
        </div>
    );
};

export default EmployeeLearningReport;
