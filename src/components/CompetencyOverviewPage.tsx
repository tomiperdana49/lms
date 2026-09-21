import { useState, useEffect, useMemo } from 'react';
import { ArrowLeft, Search, Users } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { API_BASE_URL } from '../config';
import type { Role, TeamMember } from '../types';
import CompetencyAssessmentView from './CompetencyAssessmentView';
import PopupNotification from './PopupNotification';

interface CompetencyOverviewPageProps {
    userRole: Role;
    onBack: () => void;
}

// HR-only, company-wide counterpart to CompetencyTeamPage (which is scoped to one leader's own
// reports): lets HR look up any employee and review their competency assessment read-only.
const CompetencyOverviewPage = ({ userRole, onBack }: CompetencyOverviewPageProps) => {
    const { t } = useTranslation('competencyTeam');
    const [employees, setEmployees] = useState<TeamMember[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [selected, setSelected] = useState<TeamMember | null>(null);
    const [notification, setNotification] = useState(false);

    useEffect(() => {
        fetch(`${API_BASE_URL}/api/employees/directory`)
            .then(res => res.ok ? res.json() : Promise.reject(res))
            .then((data: TeamMember[]) => setEmployees(Array.isArray(data) ? data : []))
            .catch(err => { console.error(err); setNotification(true); })
            .finally(() => setIsLoading(false));
    }, []);

    const filteredEmployees = useMemo(() => {
        const term = searchTerm.trim().toLowerCase();
        if (!term) return employees;
        return employees.filter(e =>
            e.fullName.toLowerCase().includes(term) ||
            e.employeeId.toLowerCase().includes(term) ||
            e.jobPosition?.toLowerCase().includes(term)
        );
    }, [employees, searchTerm]);

    if (userRole !== 'HR' && userRole !== 'HR_ADMIN') {
        return <div className="p-8 text-center text-red-500">{t('allEmployees.accessDenied')}</div>;
    }

    return (
        <div className="max-w-6xl mx-auto py-6">
            <PopupNotification
                isOpen={notification}
                type="error"
                message={t('notifications.loadFailed')}
                onClose={() => setNotification(false)}
            />
            <button onClick={onBack} className="text-sm text-slate-500 hover:text-blue-600 flex items-center gap-1 mb-4 transition-colors">
                <ArrowLeft size={14} /> {t('backToDashboard')}
            </button>

            <div className="mb-6">
                <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
                    <Users className="text-indigo-600" /> {t('allEmployees.title')}
                </h1>
                <p className="text-sm text-slate-500 mt-1">{t('allEmployees.subtitle')}</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-[280px_1fr] gap-6 items-start">
                <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
                    <div className="p-3 border-b border-slate-100">
                        <div className="relative">
                            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                            <input
                                type="text"
                                value={searchTerm}
                                onChange={e => setSearchTerm(e.target.value)}
                                placeholder={t('allEmployees.searchPlaceholder')}
                                className="w-full pl-8 pr-3 py-1.5 rounded-lg border border-slate-200 outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
                            />
                        </div>
                    </div>
                    <div className="max-h-[70vh] overflow-y-auto divide-y divide-slate-50">
                        {isLoading ? (
                            <p className="p-4 text-sm text-slate-400 text-center">{t('loading')}</p>
                        ) : filteredEmployees.length === 0 ? (
                            <p className="p-4 text-sm text-slate-400 text-center">{t('allEmployees.noResults')}</p>
                        ) : filteredEmployees.map(emp => (
                            <button
                                key={emp.employeeId}
                                onClick={() => setSelected(emp)}
                                className={`w-full text-left px-4 py-2.5 hover:bg-slate-50 transition-colors ${selected?.employeeId === emp.employeeId ? 'bg-indigo-50' : ''}`}
                            >
                                <p className={`text-sm font-medium ${selected?.employeeId === emp.employeeId ? 'text-indigo-700' : 'text-slate-800'}`}>{emp.fullName}</p>
                                <p className="text-xs text-slate-400">{emp.jobPosition} &middot; {emp.employeeId}</p>
                            </button>
                        ))}
                    </div>
                </div>

                <div>
                    {!selected ? (
                        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-8 text-center text-slate-500 italic">
                            {t('allEmployees.selectPrompt')}
                        </div>
                    ) : (
                        <>
                            <div className="mb-4">
                                <h2 className="text-lg font-bold text-slate-800">{selected.fullName}</h2>
                                <p className="text-sm text-slate-500">{selected.jobPosition} &middot; {t('employeeId')}: {selected.employeeId}</p>
                            </div>
                            <CompetencyAssessmentView
                                key={selected.employeeId}
                                employeeId={selected.employeeId}
                                isSupervisor={selected.isSupervisor}
                                onLoadError={() => setNotification(true)}
                            />
                        </>
                    )}
                </div>
            </div>
        </div>
    );
};

export default CompetencyOverviewPage;
