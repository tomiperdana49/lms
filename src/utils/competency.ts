import type { CompetencyTemplate, CompetencyStandardOverride } from '../types';

export type Period = { quarter: number; year: number };

export interface CompetencyProfile {
    jobPosition: string;
    isSupervisor: boolean;
}

export const PROGRAM_START_YEAR = 2026;
export const KNOWN_SECTION_TYPES = ['CORE', 'LEADERSHIP', 'FUNCTIONAL'];

export const getCurrentQuarter = () => Math.ceil((new Date().getMonth() + 1) / 3);
export const getCurrentYear = () => new Date().getFullYear();

// From Q1 of the program's start year up to the current quarter, most recent first.
export const buildPeriodOptions = (): Period[] => {
    const thisYear = getCurrentYear();
    const thisQuarter = getCurrentQuarter();
    const options: Period[] = [];
    for (let year = thisYear; year >= PROGRAM_START_YEAR; year--) {
        const maxQuarter = year === thisYear ? thisQuarter : 4;
        for (let quarter = maxQuarter; quarter >= 1; quarter--) {
            options.push({ quarter, year });
        }
    }
    return options;
};

// Position-specific competencies: prefer an exact match on the member's job title (e.g.
// "Operation Customer Engineer Manager" must not pick up the plain "Operation Customer
// Engineer" template). Only when there's no exact match do we fall back to the longest
// word-boundary prefix match, since HR's job-title field is often more granular than the
// competency dictionary (e.g. "Helpdesk Staff Shift" should still match "Helpdesk Staff").
export const getMatchedCompetencies = (
    profile: CompetencyProfile,
    templates: CompetencyTemplate[],
    overrides: CompetencyStandardOverride[] = []
): CompetencyTemplate[] => {
    const jobPosition = profile.jobPosition;
    const exactMatches = templates.filter(t => t.position === jobPosition);
    let positionMatches = exactMatches;
    if (positionMatches.length === 0) {
        const prefixCandidates = templates.filter(t => {
            if (t.position === 'Umum' || t.position === 'Semua Posisi Level Leader') return false;
            return jobPosition.startsWith(t.position) &&
                (jobPosition.length === t.position.length || jobPosition[t.position.length] === ' ');
        });
        if (prefixCandidates.length > 0) {
            const longest = Math.max(...prefixCandidates.map(t => t.position.length));
            positionMatches = prefixCandidates.filter(t => t.position.length === longest);
        }
    }
    // A position-specific HR row replaces the Umum default of the same name rather than
    // showing alongside it.
    const overriddenNames = new Set(positionMatches.map(t => t.competencyName));
    const umumMatches = templates.filter(t => t.position === 'Umum' && !overriddenNames.has(t.competencyName));
    const combined = [
        ...umumMatches,
        ...positionMatches,
        ...(profile.isSupervisor ? templates.filter(t => t.position === 'Semua Posisi Level Leader') : [])
    ];
    // A leader's Standard override never touches the HR-authored row itself - it's applied here,
    // purely for display/scoring, on top of whichever HR row supplied the competency's identity.
    if (overrides.length === 0) return combined;
    return combined.map(c => {
        const override = overrides.find(o =>
            o.position === jobPosition && o.competencyType === c.competencyType && o.competencyName === c.competencyName
        );
        return override ? { ...c, standardScore: override.standardScore } : c;
    });
};

export const groupByType = (competencies: CompetencyTemplate[]) => {
    const groups: Record<string, CompetencyTemplate[]> = {};
    competencies.forEach(c => {
        const key = c.competencyType || '-';
        (groups[key] = groups[key] || []).push(c);
    });
    return groups;
};

// Only competencies that have both a standard set AND an Aktual value the leader has
// actually chosen count toward the summary — nothing is assumed on the leader's behalf.
export const computeSummary = (competencies: CompetencyTemplate[], scores: Record<number, number>) => {
    const assessed = competencies.filter(c =>
        c.standardScore !== null && c.standardScore !== undefined && scores[c.id] !== undefined
    );
    const totalActual = assessed.reduce((sum, c) => sum + (scores[c.id] ?? 0), 0);
    const totalStandard = assessed.reduce((sum, c) => sum + (c.standardScore ?? 0), 0);
    const achievementPercent = totalStandard > 0 ? Math.round((totalActual / totalStandard) * 100) : null;
    const gapCount = assessed.filter(c => (scores[c.id] ?? 0) < (c.standardScore ?? 0)).length;
    const readinessStatus = gapCount === 0 ? 'ready' : gapCount <= 2 ? 'limitedDevelopment' : 'significantDevelopment';
    const unassessedCount = competencies.filter(c => scores[c.id] === undefined).length;
    return { totalActual, totalStandard, achievementPercent, gapCount, readinessStatus, unassessedCount };
};
