import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Search, Filter, Download, ChevronLeft, ChevronRight, CheckCircle, XCircle } from 'lucide-react';
import { API_BASE_URL } from '../config';
import * as XLSX from 'xlsx';

interface QuizReport {
    id: number;
    student_id: string;
    student_name: string;
    branch: string;
    course_title: string;
    module_title: string;
    score: number;
    date: string;
    employee_id: string | null;
    module_id: number | null;
    quiz_type: 'PRE' | 'POST';
}

interface QuizReportListProps {
    onBack: () => void;
}

const QuizReportList = ({ onBack }: QuizReportListProps) => {
    const { t } = useTranslation('quizReportList');
    const [reports, setReports] = useState<QuizReport[]>([]);
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedBranch, setSelectedBranch] = useState('All');
    const [branches, setBranches] = useState<string[]>(['All']);
    const [employees, setEmployees] = useState<any[]>([]);
    const [expandedUser, setExpandedUser] = useState<string | null>(null);

    // Pagination (Applied to Users now, not individual reports)
    const [currentPage, setCurrentPage] = useState(1);
    const itemsPerPage = 10;

    useEffect(() => {
        fetchReports();
        fetchBranches();
        fetchEmployees();
    }, []);

    const fetchBranches = async () => {
        try {
            const res = await fetch(`${API_BASE_URL}/api/branches`);
            if (res.ok) {
                const data = await res.json();
                if (Array.isArray(data)) {
                    setBranches(['All', ...data.map((b: any) => b.name)]);
                }
            }
        } catch (err) { console.error(err); }
    };

    const fetchEmployees = async () => {
        try {
            const res = await fetch(`${API_BASE_URL}/api/employees`);
            if (res.ok) {
                const data = await res.json();
                setEmployees(data);
            }
        } catch (err) { console.error(err); }
    };

    const fetchReports = async () => {
        try {
            const res = await fetch(`${API_BASE_URL}/api/admin/quiz-reports`);
            if (res.ok) {
                const data = await res.json();
                setReports(data);
            }
        } catch (error) {
            console.error("Failed to fetch reports", error);
        }
    };

    // Derived Data
    // We map reports to include correct branch from employees list
    const mappedReports = reports.map(r => {
        // Find by employee_id first, then student_id as fallback
        const emp = employees.find(e =>
            (r.employee_id && e.id_employee === r.employee_id) ||
            (e.id_employee === r.student_id)
        );

        let branch = r.branch || t('unknownBranch');
        if (emp) {
            branch = emp.branch_name;
        } else {
            // Map legacy names to SimAsset names if possible for better filtering
            if (branch === 'Headquarters') branch = 'PT. Media Antar Nusa -  HO';
            if (branch === 'Medan-HO') branch = 'PT. Media Antar Nusa - Medan';
        }

        return {
            ...r,
            branch
        };
    });

    // 1. Filter raw reports
    const filteredRawReports = mappedReports.filter(r => {
        const studentName = r.student_name || t('unknownBranch');
        const courseTitle = r.course_title || t('unknownBranch');
        const matchesSearch = studentName.toLowerCase().includes(searchTerm.toLowerCase()) ||
            courseTitle.toLowerCase().includes(searchTerm.toLowerCase());
        const matchesBranch = selectedBranch === 'All' || r.branch === selectedBranch;
        return matchesSearch && matchesBranch;
    });

    interface CourseSummary {
        courseTitle: string;
        date: string;
        preScore: number | null;
        postScore: number | null;
        status: 'Valid' | 'Fail';
    }

    interface GroupedUser {
        student_name: string;
        branch: string;
        courseSummaries: CourseSummary[];
        completedCoursesCount: number;
        reports: QuizReport[];
    }

    const { groupedData } = (function() {
        const rawGrouped = filteredRawReports.reduce((acc, curr) => {
            const sName = curr.student_name || t('unknownStudent');
            const cTitle = curr.course_title || t('unknownCourse');

            if (!acc[sName]) {
                acc[sName] = {
                    student_name: sName,
                    branch: curr.branch || t('unknownBranch'),
                    courseSummariesMap: {},
                    reports: []
                };
            }

            const userGroup = acc[sName];
            userGroup.reports.push(curr);

            if (!userGroup.courseSummariesMap[cTitle]) {
                userGroup.courseSummariesMap[cTitle] = {
                    courseTitle: cTitle,
                    date: curr.date,
                    preScore: null,
                    postScore: null,
                    status: 'Fail'
                };
            }

            const summary = userGroup.courseSummariesMap[cTitle];

            // Assign Pre-Score (use any PRE test found for this course, latest preferred)
            if (curr.quiz_type === 'PRE') {
                summary.preScore = curr.score;
            }

            // Assign Post-Score (only check Final Assessment (module_id null))
            if (curr.quiz_type === 'POST' && !curr.module_id) {
                if (summary.postScore === null || curr.score > summary.postScore) {
                    summary.postScore = curr.score;
                }
            }

            // Final Status
            if (summary.postScore !== null && summary.postScore >= 80) {
                summary.status = 'Valid';
            } else {
                summary.status = 'Fail';
            }

            // Update latest date
            if (new Date(curr.date) > new Date(summary.date)) {
                summary.date = curr.date;
            }

            return acc;
        }, {} as any);

        const data = Object.values(rawGrouped).map((u: any) => {
            const courseSummaries = Object.values(u.courseSummariesMap) as CourseSummary[];
            return {
                student_name: u.student_name,
                branch: u.branch,
                courseSummaries,
                reports: u.reports,
                completedCoursesCount: courseSummaries.filter(cs => cs.status === 'Valid').length
            } as GroupedUser;
        });

        return { groupedData: data };
    })();

    const totalPages = Math.ceil(groupedData.length / itemsPerPage);
    const paginatedUsers = groupedData.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

    const toggleExpand = (studentName: string) => {
        if (expandedUser === studentName) {
            setExpandedUser(null);
        } else {
            setExpandedUser(studentName);
        }
    };

    const handleExport = () => {
        try {
            const dataToExport = filteredRawReports.map((r, idx) => {
                const status = r.score >= 80 ? t('export.pass') : t('export.fail');
                const modTitle = r.module_id ? r.module_title : t('export.finalAssessment');
                return {
                    [t('export.no')]: idx + 1,
                    [t('export.date')]: new Date(r.date).toLocaleDateString(),
                    [t('export.branch')]: r.branch,
                    [t('export.student')]: r.student_name,
                    [t('export.course')]: r.course_title,
                    [t('export.module')]: modTitle,
                    [t('export.score')]: r.score,
                    [t('export.status')]: status
                };
            });

            const ws = XLSX.utils.json_to_sheet(dataToExport);

            const colsWidths = [
                { wch: 6 },   // No.
                { wch: 15 },  // Date
                { wch: 25 },  // Branch
                { wch: 25 },  // Student
                { wch: 30 },  // Course
                { wch: 25 },  // Module
                { wch: 10 },  // Score
                { wch: 12 }   // Status
            ];
            ws['!cols'] = colsWidths;

            const wb = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(wb, ws, t('export.sheetName'));
            XLSX.writeFile(wb, `Quiz_Assessment_Report_${new Date().toISOString().split('T')[0]}.xlsx`);
        } catch (error) {
            console.error('Failed to export XLSX', error);
            alert(t('exportFailedAlert'));
        }
    };

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div className="flex items-center gap-4">
                    <button onClick={onBack} className="p-2 hover:bg-slate-100 rounded-full transition-colors">
                        <ChevronLeft size={24} className="text-slate-600" />
                    </button>
                    <div>
                        <h2 className="text-2xl font-bold text-slate-800">{t('header.title')}</h2>
                        <p className="text-slate-500">{t('header.subtitle')}</p>
                    </div>
                </div>
                <div className="flex gap-2">
                    <button
                        onClick={handleExport}
                        className="flex items-center gap-2 bg-green-600 text-white px-4 py-2 rounded-xl hover:bg-green-700 transition"
                    >
                        <Download size={18} /> {t('exportButton')}
                    </button>
                </div>
            </div>

            {/* Filters */}
            <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-100 flex flex-col md:flex-row gap-4">
                <div className="flex-1 relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={20} />
                    <input
                        type="text"
                        placeholder={t('searchPlaceholder')}
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="w-full pl-10 pr-4 py-2 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                </div>
                <div className="w-full md:w-64 relative">
                    <Filter className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={20} />
                    <select
                        value={selectedBranch}
                        onChange={(e) => setSelectedBranch(e.target.value)}
                        className="w-full pl-10 pr-4 py-2 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500 appearance-none bg-white"
                    >
                        {branches.map(b => (
                            <option key={b} value={b}>
                                {b === 'All' ? t('allBranches') : b}
                            </option>
                        ))}
                    </select>
                </div>
            </div>

            {/* Grouped User List */}
            <div className="space-y-4">
                {paginatedUsers.length === 0 ? (
                    <div className="p-12 text-center text-slate-400 bg-white rounded-xl border border-slate-100 italic">
                        {t('noReportsFound')}
                    </div>
                ) : (
                    paginatedUsers.map((user) => (
                        <div key={user.student_name} className="bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden">
                            {/* User Header Row */}
                            <div
                                onClick={() => toggleExpand(user.student_name)}
                                className="p-4 flex flex-col md:flex-row md:items-center justify-between gap-4 cursor-pointer hover:bg-slate-50 transition-colors"
                            >
                                <div className="flex items-center gap-4">
                                    <div className="w-10 h-10 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center font-bold text-lg">
                                        {user.student_name.charAt(0)}
                                    </div>
                                    <div>
                                        <h3 className="font-bold text-slate-800 text-lg">{user.student_name}</h3>
                                        <p className="text-sm text-slate-500">
                                            {user.branch} • {t('activitiesCount', { count: user.reports.length })}
                                        </p>
                                    </div>
                                </div>
                                <div className="flex flex-wrap items-center gap-3">
                                    <div className="text-right mr-2 hidden md:block">
                                        <div className="text-2xl font-bold text-slate-700">{user.completedCoursesCount}</div>
                                        <div className="text-xs text-slate-400 uppercase tracking-wide">{t('coursesCompleted')}</div>
                                    </div>
                                    {expandedUser === user.student_name ? <ChevronLeft className="-rotate-90 text-slate-400" /> : <ChevronLeft className="rotate-180 text-slate-400" />}
                                </div>
                            </div>

                            {/* Expanded Details Table */}
                            {expandedUser === user.student_name && (
                                <div className="border-t border-slate-100 bg-slate-50/50 p-4 animate-in slide-in-from-top-2">
                                    <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
                                        <table className="w-full text-left">
                                            <thead className="bg-slate-50 border-b border-slate-200">
                                                <tr>
                                                    <th className="px-4 py-3 text-xs font-bold text-slate-500 uppercase">{t('table.date')}</th>
                                                    <th className="px-4 py-3 text-xs font-bold text-slate-500 uppercase">{t('table.course')}</th>
                                                    <th className="px-4 py-3 text-xs font-bold text-slate-500 uppercase text-center">{t('table.preTest')}</th>
                                                    <th className="px-4 py-3 text-xs font-bold text-slate-500 uppercase text-center">{t('table.postTest')}</th>
                                                    <th className="px-4 py-3 text-xs font-bold text-slate-500 uppercase">{t('table.status')}</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-slate-100">
                                                {user.courseSummaries.map((summary, idx) => (
                                                    <tr key={idx} className="hover:bg-slate-50">
                                                        <td className="px-4 py-3 text-sm text-slate-500">{new Date(summary.date).toLocaleDateString()}</td>
                                                        <td className="px-4 py-3 text-sm font-medium text-slate-700">{summary.courseTitle}</td>
                                                        <td className="px-4 py-3 text-sm text-center font-bold text-slate-600">
                                                            {summary.preScore ?? '-'}
                                                        </td>
                                                        <td className="px-4 py-3 text-sm text-center font-extrabold text-blue-700">
                                                            {summary.postScore ?? '-'}
                                                        </td>
                                                        <td className="px-4 py-3">
                                                            {summary.status === 'Valid' ? (
                                                                <span className="inline-flex items-center gap-1 text-green-700 bg-green-50 px-3 py-1 rounded-full text-xs font-bold border border-green-200">
                                                                    <CheckCircle size={12} /> {t('status.valid')}
                                                                </span>
                                                            ) : (
                                                                <span className="inline-flex items-center gap-1 text-red-700 bg-red-50 px-3 py-1 rounded-full text-xs font-bold border border-red-200">
                                                                    <XCircle size={12} /> {t('status.fail')}
                                                                </span>
                                                            )}
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            )}
                        </div>
                    ))
                )}
            </div>

            {/* Pagination for Users */}
            {totalPages > 1 && (
                <div className="flex justify-center gap-2 mt-6">
                    <button
                        onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                        disabled={currentPage === 1}
                        className="p-2 border rounded-lg hover:bg-white disabled:opacity-50"
                    >
                        <ChevronLeft size={20} />
                    </button>
                    <span className="px-4 py-2 bg-white border rounded-lg text-sm font-medium">
                        {t('pagination', { current: currentPage, total: totalPages })}
                    </span>
                    <button
                        onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                        disabled={currentPage === totalPages}
                        className="p-2 border rounded-lg hover:bg-white disabled:opacity-50"
                    >
                        <ChevronRight size={20} />
                    </button>
                </div>
            )}
        </div>
    );

};

export default QuizReportList;
