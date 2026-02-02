import { useState, useEffect } from 'react';
import { Search, Filter, Download, ChevronLeft, ChevronRight, CheckCircle, XCircle } from 'lucide-react';
import { API_BASE_URL } from '../config';

interface QuizReport {
    id: number;
    student_id: string;
    student_name: string;
    branch: string;
    course_title: string;
    module_title: string;
    score: number;
    date: string;
    module_id: number | null; // null for final assessment
}

interface QuizReportListProps {
    onBack: () => void;
}

const QuizReportList = ({ onBack }: QuizReportListProps) => {
    const [reports, setReports] = useState<QuizReport[]>([]);
    // const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedBranch, setSelectedBranch] = useState('All');

    // Pagination
    const [currentPage, setCurrentPage] = useState(1);
    const itemsPerPage = 10;

    useEffect(() => {
        fetchReports();
    }, []);

    const fetchReports = async () => {
        try {
            const res = await fetch(`${API_BASE_URL}/api/admin/quiz-reports`);
            if (res.ok) {
                const data = await res.json();
                setReports(data);
            }
        } catch (error) {
            console.error("Failed to fetch reports", error);
            // count
        } finally {
            // setLoading(false);
        }
    };

    // Derived Data
    const branches = ['All', ...Array.from(new Set(reports.map(r => r.branch || 'Headquarters')))];

    const filteredReports = reports.filter(r => {
        const matchesSearch = r.student_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
            r.course_title?.toLowerCase().includes(searchTerm.toLowerCase());
        const matchesBranch = selectedBranch === 'All' || (r.branch || 'Headquarters') === selectedBranch;
        return matchesSearch && matchesBranch;
    });

    const totalPages = Math.ceil(filteredReports.length / itemsPerPage);
    const paginatedReports = filteredReports.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

    const handleExport = () => {
        const csvContent = "data:text/csv;charset=utf-8,"
            + "Date,Branch,Student,Course,Module,Score,Status\n"
            + filteredReports.map(r => {
                const status = r.score >= 60 ? "PASS" : "FAIL";
                const modTitle = r.module_id ? r.module_title : "Final Assessment";
                return `${new Date(r.date).toLocaleDateString()},${r.branch || 'Headquarters'},"${r.student_name}","${r.course_title}","${modTitle}",${r.score},${status}`;
            }).join("\n");

        const encodedUri = encodeURI(csvContent);
        const link = document.createElement("a");
        link.setAttribute("href", encodedUri);
        link.setAttribute("download", `quiz_report_${new Date().toISOString().split('T')[0]}.csv`);
        document.body.appendChild(link);
        link.click();
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
                        <h2 className="text-2xl font-bold text-slate-800">Quiz & Assessment Recapitulation</h2>
                        <p className="text-slate-500">Monitor staff performance across branches.</p>
                    </div>
                </div>
                <div className="flex gap-2">
                    <button
                        onClick={handleExport}
                        className="flex items-center gap-2 bg-green-600 text-white px-4 py-2 rounded-xl hover:bg-green-700 transition"
                    >
                        <Download size={18} /> Export CSV
                    </button>
                </div>
            </div>

            {/* Filters */}
            <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-100 flex flex-col md:flex-row gap-4">
                <div className="flex-1 relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={20} />
                    <input
                        type="text"
                        placeholder="Search student or course..."
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
                            <option key={b} value={b}>{b}</option>
                        ))}
                    </select>
                </div>
            </div>

            {/* Table */}
            <div className="bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full text-left">
                        <thead className="bg-slate-50 border-b border-slate-200">
                            <tr>
                                <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Date</th>
                                <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Branch</th>
                                <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Student</th>
                                <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Details</th>
                                <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Score</th>
                                <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Status</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {paginatedReports.map((r) => (
                                <tr key={r.id} className="hover:bg-slate-50 transition-colors">
                                    <td className="px-6 py-4 text-sm text-slate-500 whitespace-nowrap">
                                        {new Date(r.date).toLocaleDateString()}
                                    </td>
                                    <td className="px-6 py-4">
                                        <span className="inline-block px-2 py-1 text-xs font-semibold bg-slate-100 text-slate-600 rounded-md">
                                            {r.branch || 'Headquarters'}
                                        </span>
                                    </td>
                                    <td className="px-6 py-4">
                                        <p className="font-semibold text-slate-800">{r.student_name}</p>
                                    </td>
                                    <td className="px-6 py-4">
                                        <p className="text-sm font-medium text-slate-800">{r.course_title}</p>
                                        <p className="text-xs text-slate-500 mt-0.5">
                                            {r.module_id ? r.module_title : <span className="text-indigo-600 font-bold">Final Assessment</span>}
                                        </p>
                                    </td>
                                    <td className="px-6 py-4">
                                        <span className={`font-bold ${r.score >= 60 ? 'text-green-600' : 'text-red-600'}`}>
                                            {r.score}
                                        </span>
                                    </td>
                                    <td className="px-6 py-4">
                                        {r.score >= 60 ? (
                                            <span className="flex items-center gap-1 text-green-600 font-bold text-xs bg-green-50 px-2 py-1 rounded-full w-fit">
                                                <CheckCircle size={14} /> Pass
                                            </span>
                                        ) : (
                                            <span className="flex items-center gap-1 text-red-600 font-bold text-xs bg-red-50 px-2 py-1 rounded-full w-fit">
                                                <XCircle size={14} /> Fail
                                            </span>
                                        )}
                                    </td>
                                </tr>
                            ))}
                            {paginatedReports.length === 0 && (
                                <tr>
                                    <td colSpan={6} className="px-6 py-8 text-center text-slate-400 italic">
                                        No reports found.
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>

                {/* Pagination */}
                {totalPages > 1 && (
                    <div className="p-4 border-t border-slate-200 flex justify-between items-center">
                        <button
                            onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                            disabled={currentPage === 1}
                            className="p-2 border rounded-lg hover:bg-slate-50 disabled:opacity-50"
                        >
                            <ChevronLeft size={20} />
                        </button>
                        <span className="text-sm text-slate-600">
                            Page {currentPage} of {totalPages}
                        </span>
                        <button
                            onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                            disabled={currentPage === totalPages}
                            className="p-2 border rounded-lg hover:bg-slate-50 disabled:opacity-50"
                        >
                            <ChevronRight size={20} />
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
};

export default QuizReportList;
