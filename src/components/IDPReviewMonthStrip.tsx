import { useTranslation } from 'react-i18next';
import type { IDPPlan } from '../types';

// Builds the monthly review strip: one entry per calendar month of the plan's period year, from
// January - or from the employee's join month when they joined during that year - through the
// current month (or through December once the period year has fully elapsed), marking whether a
// supervisor review landed in that month. Each entry is labelled with its calendar month number.
// Starts from the join date rather than the IDP's created_by_date: reviews can predate that date
// (e.g. a plan filled in on paper first), and a later created_by_date would hide them.
const reviewMonthStrip = (plan: IDPPlan): { key: string; month: number; reviewed: boolean }[] => {
    const reviewedSet = new Set((plan.reviewed_year_months || '').split(',').filter(Boolean));

    let startY = plan.period_year, startM = 0;
    const joined = plan.employee_join_date ? new Date(plan.employee_join_date) : null;
    if (joined && !isNaN(joined.getTime()) && joined.getFullYear() >= plan.period_year) {
        startY = joined.getFullYear();
        startM = joined.getMonth();
    }

    const now = new Date();
    const endY = plan.period_year < now.getFullYear() ? plan.period_year : now.getFullYear();
    const endM = plan.period_year < now.getFullYear() ? 11 : now.getMonth();

    const months: { key: string; month: number; reviewed: boolean }[] = [];
    let y = startY, m = startM, count = 0;
    while ((y < endY || (y === endY && m <= endM)) && count < 36) {
        const key = `${y}-${String(m + 1).padStart(2, '0')}`;
        months.push({ key, month: m + 1, reviewed: reviewedSet.has(key) });
        count++;
        m++;
        if (m > 11) { m = 0; y++; }
    }
    return months;
};

// Monthly review history row shown on an approved plan's card, in both the HR (IDPManager) and the
// leader's team view (IDPPage). Needs reviewed_year_months / employee_join_date on the plan.
export default function IDPReviewMonthStrip({ plan, className = 'mt-3' }: { plan: IDPPlan; className?: string }) {
    const { t } = useTranslation('idpPage');
    if (plan.status !== 'Approved') return null;
    const strip = reviewMonthStrip(plan);
    if (strip.length === 0) return null;
    return (
        <div className={`${className} flex items-center flex-wrap gap-2`}>
            <span className="text-xs font-semibold text-gray-400">{t('admin.reviewStripLabel')}</span>
            {strip.map(({ key, month, reviewed }) => (
                <span
                    key={key}
                    title={reviewed ? t('admin.reviewedThisMonth') : t('admin.notReviewedThisMonth')}
                    className={`w-6 h-6 flex items-center justify-center rounded-full text-[11px] font-bold text-white shrink-0 ${reviewed ? 'bg-emerald-500' : 'bg-rose-500'}`}
                >
                    {month}
                </span>
            ))}
        </div>
    );
}
