import { useState } from 'react';
import { Award } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { User } from '../types';
import CompetencyAssessmentView from './CompetencyAssessmentView';
import PopupNotification from './PopupNotification';

interface CompetencyMyAssessmentPageProps {
    currentUser: User | null;
    // Deep-linked from a "New Competency Assessment" notification, as "quarter-year" (e.g.
    // "1-2026") - opens straight to that period instead of the current quarter.
    initialPeriod?: string | null;
}

const CompetencyMyAssessmentPage = ({ currentUser, initialPeriod }: CompetencyMyAssessmentPageProps) => {
    const { t } = useTranslation('competencyTeam');
    const [notification, setNotification] = useState({ show: false });

    if (!currentUser?.employee_id) return null;

    return (
        <div className="max-w-4xl mx-auto py-6">
            <PopupNotification
                isOpen={notification.show}
                type="error"
                message={t('notifications.loadFailed')}
                onClose={() => setNotification({ show: false })}
            />

            <div className="mb-8">
                <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
                    <Award className="text-indigo-600" /> {t('mine.title')}
                </h1>
                <p className="text-sm text-slate-500 mt-1">{t('mine.subtitle')}</p>
            </div>

            <CompetencyAssessmentView
                employeeId={currentUser.employee_id}
                isSupervisor={!!currentUser.isSupervisor}
                initialPeriod={initialPeriod}
                onLoadError={() => setNotification({ show: true })}
            />
        </div>
    );
};

export default CompetencyMyAssessmentPage;
