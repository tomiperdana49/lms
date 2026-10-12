import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Trophy, BookOpen, Users, Briefcase } from 'lucide-react';
import { API_BASE_URL } from '../config';

interface TopLearnerRow {
    employeeId: string;
    name: string;
    department: string | null;
    photoUrl: string | null;
    count: number;
    rank: number;
}

interface TopLearnersData {
    year: number;
    reading: TopLearnerRow[];
    internal: TopLearnerRow[];
    external: TopLearnerRow[];
}

type Category = 'reading' | 'internal' | 'external';

const CATEGORIES: { key: Category; icon: typeof BookOpen }[] = [
    { key: 'reading', icon: BookOpen },
    { key: 'internal', icon: Users },
    { key: 'external', icon: Briefcase }
];

const MEDAL_STYLES = ['bg-amber-400 text-white', 'bg-slate-300 text-slate-700', 'bg-orange-300 text-white'];
const MEDAL_RINGS = ['ring-amber-400', 'ring-slate-300', 'ring-orange-300'];

// Employee photo with the rank as a small badge on its corner; falls back to their initial when
// there's no photo or it fails to load.
const LearnerAvatar = ({ row }: { row: TopLearnerRow }) => {
    const [failed, setFailed] = useState(false);
    return (
        <div className="relative shrink-0">
            {row.photoUrl && !failed ? (
                <img
                    src={row.photoUrl}
                    alt={row.name}
                    onError={() => setFailed(true)}
                    className={`w-10 h-10 rounded-full object-cover bg-slate-200 ${MEDAL_RINGS[row.rank - 1] ? `ring-2 ${MEDAL_RINGS[row.rank - 1]}` : ''}`}
                />
            ) : (
                <div className={`w-10 h-10 rounded-full bg-indigo-100 text-indigo-600 flex items-center justify-center text-sm font-black ${MEDAL_RINGS[row.rank - 1] ? `ring-2 ${MEDAL_RINGS[row.rank - 1]}` : ''}`}>
                    {row.name.charAt(0).toUpperCase()}
                </div>
            )}
            <span className={`absolute -bottom-1 -right-1 w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-black ring-2 ring-white ${MEDAL_STYLES[row.rank - 1] || 'bg-white text-slate-500 border border-slate-200'}`}>
                {row.rank}
            </span>
        </div>
    );
};

interface TopLearnersProps {
    userEmployeeId?: string;
}

// Dashboard card shown to every employee: this year's top 5 by approved reading logs, internal
// trainings attended and external trainings completed - meant to motivate, so the viewer's own
// row is highlighted when they make the list.
const TopLearners = ({ userEmployeeId }: TopLearnersProps) => {
    const { t } = useTranslation('dashboardHome');
    const [data, setData] = useState<TopLearnersData | null>(null);
    const [category, setCategory] = useState<Category>('reading');

    useEffect(() => {
        fetch(`${API_BASE_URL}/api/dashboard/top-learners`)
            .then(res => res.json())
            .then(json => { if (!json.error) setData(json); })
            .catch(err => console.error('Error fetching top learners:', err));
    }, []);

    const rows = data?.[category] || [];

    return (
        <div className="bg-white rounded-3xl border border-slate-100 shadow-sm p-4 sm:p-5 flex flex-col">
            <div className="flex items-center gap-2.5 mb-4 min-w-0">
                <div className="p-2 rounded-xl bg-amber-50 text-amber-500 shrink-0">
                    <Trophy size={18} />
                </div>
                <h2 className="font-black text-slate-800 text-base sm:text-lg truncate">
                    {t('topLearners.title', { year: data?.year ?? new Date().getFullYear() })}
                </h2>
            </div>

            <div className="grid grid-cols-3 gap-1 p-1 bg-slate-100 rounded-2xl mb-3">
                {CATEGORIES.map(({ key, icon: Icon }) => (
                    <button
                        key={key}
                        type="button"
                        onClick={() => setCategory(key)}
                        className={`flex items-center justify-center gap-1.5 px-2 py-2 rounded-xl text-xs font-bold transition-colors min-w-0 ${category === key ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                    >
                        <Icon size={14} className="shrink-0" />
                        <span className="truncate">{t(`topLearners.tabs.${key}`)}</span>
                    </button>
                ))}
            </div>

            {rows.length === 0 ? (
                <p className="text-sm text-slate-400 py-2">{t('topLearners.empty')}</p>
            ) : (
                <div className="space-y-2">
                    {rows.map(row => {
                        const isMe = !!userEmployeeId && row.employeeId === String(userEmployeeId);
                        return (
                            <div
                                key={row.employeeId}
                                className={`flex items-center gap-3 p-2.5 rounded-2xl ${isMe ? 'bg-indigo-50 ring-1 ring-indigo-200' : 'bg-slate-50'}`}
                            >
                                <LearnerAvatar row={row} />
                                <div className="min-w-0 flex-1">
                                    <p className="font-bold text-slate-700 text-sm truncate">
                                        {row.name}
                                        {isMe && <span className="ml-1.5 text-[10px] font-black text-indigo-600 uppercase">{t('topLearners.you')}</span>}
                                    </p>
                                    {row.department && <p className="text-xs text-slate-400 truncate">{row.department}</p>}
                                </div>
                                <div className="text-right shrink-0">
                                    <span className="text-base font-black text-slate-800">{row.count}</span>
                                    <span className="text-[11px] font-semibold text-slate-400 ml-1">{t(`topLearners.unit.${category}`, { count: row.count })}</span>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
};

export default TopLearners;
