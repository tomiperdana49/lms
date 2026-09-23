import { useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { useTranslation } from 'react-i18next';

const SCALE_LEVELS = ['1', '2', '3', '4'] as const;

// "Skala Keahlian (1-4)" legend for the competency table - a one-line summary of the level names that's
// always visible, expanding into the full definition + minimum evidence table so employees can tell
// what the Position Standard / Actual numbers mean.
const CompetencyScaleLegend = () => {
    const { t } = useTranslation('competencyTeam');
    const [isOpen, setIsOpen] = useState(false);

    return (
        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 text-sm">
            <div className="p-4 flex flex-wrap items-center justify-between gap-3">
                <p className="text-slate-600">
                    <span className="font-semibold text-slate-800">{t('scaleLegend.title')}:</span>{' '}
                    {SCALE_LEVELS.map((level, idx) => (
                        <span key={level}>
                            {idx > 0 && <span className="text-slate-300"> · </span>}
                            <span className="font-semibold text-indigo-700">{level}</span> {t(`templateActions.scoreLabels.${level}`)}
                        </span>
                    ))}
                </p>
                <button
                    type="button"
                    onClick={() => setIsOpen(open => !open)}
                    aria-expanded={isOpen}
                    className="flex items-center gap-1 text-xs font-bold text-indigo-600 hover:text-indigo-700 transition-colors"
                >
                    {isOpen ? t('scaleLegend.hide') : t('scaleLegend.show')}
                    {isOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                </button>
            </div>

            {isOpen && (
                <div className="border-t border-slate-100 overflow-x-auto">
                    <table className="w-full min-w-[640px] text-sm">
                        <thead>
                            <tr className="bg-slate-50 text-left font-semibold text-slate-600">
                                <th className="p-3 w-16 text-center">{t('scaleLegend.scale')}</th>
                                <th className="p-3 w-32">{t('scaleLegend.name')}</th>
                                <th className="p-3">{t('scaleLegend.definition')}</th>
                                <th className="p-3">{t('scaleLegend.evidence')}</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-50">
                            {SCALE_LEVELS.map(level => (
                                <tr key={level} className="align-top">
                                    <td className="p-3 text-center font-semibold text-indigo-700">{level}</td>
                                    <td className="p-3 font-semibold text-slate-800">{t(`templateActions.scoreLabels.${level}`)}</td>
                                    <td className="p-3 text-slate-600">{t(`scaleLegend.levels.${level}.definition`)}</td>
                                    <td className="p-3 text-slate-600">{t(`scaleLegend.levels.${level}.evidence`)}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
};

export default CompetencyScaleLegend;
