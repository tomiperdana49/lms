import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import type { IDPLearningProgress } from '../types';

// The mandatory learning-hours row is tracked by the system, never ticked by hand: the
// checkbox follows the plan year's LMS learning hours, and the notes cell shows how far along it is.
// Notes on the row (typed by the direct supervisor, or bulk-imported from the IDP Excel template)
// are shown under the progress - or `notesEditor` in their place, where the viewer can edit them.

export function MandatoryProgressCheck({ progress }: { progress?: IDPLearningProgress }) {
    const { t } = useTranslation('idpPage');
    const done = !!progress && progress.totalJam >= progress.target;
    return (
        <div className="flex flex-col items-center gap-1" title={t('form.mandatoryProgressAuto')}>
            <input type="checkbox" disabled readOnly checked={done} className="w-4 h-4 accent-indigo-600" />
            <span className="px-1.5 py-0.5 rounded bg-indigo-50 text-[10px] font-semibold uppercase tracking-wide text-indigo-600">{t('form.autoTracked')}</span>
        </div>
    );
}

export function MandatoryProgressNote({ progress, notes, notesEditor }: { progress?: IDPLearningProgress; notes?: string | null; notesEditor?: ReactNode }) {
    const { t } = useTranslation('idpPage');
    const manualNotes = notes?.trim();
    if (!progress) return notesEditor ?? (manualNotes ? <span className="whitespace-pre-wrap">{manualNotes}</span> : null);
    const total = Math.round(progress.totalJam * 10) / 10;
    const pct = Math.min(100, Math.round((progress.totalJam / progress.target) * 100));
    return (
        <div className="space-y-1.5">
            <span className="font-semibold">{t('form.mandatoryProgressValue', { total, target: progress.target, pct })}</span>
            <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                <div className={`h-full rounded-full ${pct >= 100 ? 'bg-emerald-500' : 'bg-indigo-500'}`} style={{ width: `${pct}%` }} />
            </div>
            <p className="text-xs text-slate-500">{t('form.mandatoryProgressAuto')}</p>
            {notesEditor ? (
                <div className="pt-2 mt-1 border-t border-slate-200">{notesEditor}</div>
            ) : manualNotes && (
                <div className="pt-2 mt-1 border-t border-slate-200">
                    <span className="block text-xs font-semibold text-slate-500 mb-0.5">{t('form.mandatoryManualNotes')}</span>
                    <p className="whitespace-pre-wrap">{manualNotes}</p>
                </div>
            )}
        </div>
    );
}
