import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { HelpCircle, Library, BookOpen, Users, Globe, Lightbulb, ListChecks, GraduationCap, UserCheck, Target, Shield } from 'lucide-react';

type TopicKey = 'readingLog' | 'onlineModules' | 'trainingInternal' | 'trainingExternal' | 'idp';
type AudienceKey = 'participant' | 'trainer' | 'employee' | 'supervisor' | 'hr';

const TOPIC_ICONS: Record<TopicKey, typeof Library> = {
    readingLog: Library,
    onlineModules: BookOpen,
    trainingInternal: Users,
    trainingExternal: Globe,
    idp: Target
};

const AUDIENCE_ICONS: Record<AudienceKey, typeof Users> = {
    participant: UserCheck,
    trainer: GraduationCap,
    employee: UserCheck,
    supervisor: Users,
    hr: Shield
};

const TOPIC_ORDER: TopicKey[] = ['readingLog', 'onlineModules', 'trainingInternal', 'trainingExternal', 'idp'];

// Topics whose guide differs depending on who's using the feature (e.g. a training session's
// participant vs. its trainer/host, or IDP's employee/supervisor/HR) render a role sub-selector,
// listing that topic's audiences in display order; everything else is a single guide.
const TOPIC_AUDIENCES: Partial<Record<TopicKey, AudienceKey[]>> = {
    trainingInternal: ['participant', 'trainer'],
    idp: ['employee', 'supervisor', 'hr']
};

interface Step {
    title: string;
    description: string;
}

interface GuideContent {
    purpose: string;
    steps: Step[];
    tips: string[];
}

export default function HelpPage() {
    const { t } = useTranslation('helpPage');
    const [activeTopic, setActiveTopic] = useState<TopicKey>('readingLog');
    const [activeAudience, setActiveAudience] = useState<AudienceKey>('participant');

    const audienceList = TOPIC_AUDIENCES[activeTopic];
    const hasAudiences = !!audienceList;
    const topicTitle = t(`topics.${activeTopic}.title`);
    const guide = (hasAudiences
        ? t(`topics.${activeTopic}.audiences.${activeAudience}`, { returnObjects: true })
        : t(`topics.${activeTopic}`, { returnObjects: true })
    ) as GuideContent;

    const ActiveTopicIcon = TOPIC_ICONS[activeTopic];
    const ActiveAudienceIcon = AUDIENCE_ICONS[activeAudience];
    const ActiveIcon = hasAudiences ? ActiveAudienceIcon : ActiveTopicIcon;

    return (
        <div className="space-y-8 animate-in fade-in max-w-6xl mx-auto">
            <div className="flex items-center gap-4">
                <div className="w-14 h-14 rounded-2xl bg-indigo-50 flex items-center justify-center shrink-0">
                    <HelpCircle className="w-7 h-7 text-indigo-600" />
                </div>
                <div>
                    <h1 className="text-2xl md:text-3xl font-bold text-gray-800">{t('header.title')}</h1>
                    <p className="text-gray-500 text-sm md:text-base">{t('header.subtitle')}</p>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-[240px_1fr] gap-6">
                {/* Topic Nav */}
                <nav className="flex lg:flex-col gap-2 overflow-x-auto lg:overflow-visible pb-2 lg:pb-0">
                    {TOPIC_ORDER.map((key) => {
                        const Icon = TOPIC_ICONS[key];
                        const isActive = key === activeTopic;
                        return (
                            <button
                                key={key}
                                type="button"
                                onClick={() => {
                                    setActiveTopic(key);
                                    const audiences = TOPIC_AUDIENCES[key];
                                    if (audiences) setActiveAudience(audiences[0]);
                                }}
                                className={`flex items-center gap-3 px-4 py-3 rounded-xl text-left whitespace-nowrap lg:whitespace-normal transition-all shrink-0 ${
                                    isActive
                                        ? 'bg-indigo-600 text-white shadow-md shadow-indigo-100'
                                        : 'bg-white text-gray-600 border border-gray-100 hover:border-indigo-200 hover:text-indigo-600'
                                }`}
                            >
                                <Icon size={18} className={isActive ? 'text-white' : 'text-gray-400'} />
                                <span className="font-semibold text-sm">{t(`nav.${key}`)}</span>
                            </button>
                        );
                    })}
                </nav>

                {/* Content */}
                <div className="bg-white rounded-3xl border border-gray-100 shadow-sm p-6 md:p-8 space-y-8">
                    <div className="flex items-start justify-between gap-4 flex-wrap">
                        <div className="flex items-start gap-4">
                            <div className="w-12 h-12 rounded-2xl bg-indigo-50 flex items-center justify-center shrink-0">
                                <ActiveIcon className="w-6 h-6 text-indigo-600" />
                            </div>
                            <div>
                                <h2 className="text-xl font-bold text-gray-800">{topicTitle}</h2>
                                <p className="text-xs font-bold uppercase tracking-widest text-gray-400 mt-1">{t('labels.purpose')}</p>
                                <p className="text-gray-600 mt-1">{guide.purpose}</p>
                            </div>
                        </div>

                        {hasAudiences && (
                            <div className="w-full sm:w-auto">
                                <p className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-2">{t('labels.chooseRole')}</p>
                                <div className="inline-flex rounded-xl bg-gray-100 p-1 gap-1">
                                    {audienceList!.map((key) => {
                                        const isActive = key === activeAudience;
                                        return (
                                            <button
                                                key={key}
                                                type="button"
                                                onClick={() => setActiveAudience(key)}
                                                className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all ${
                                                    isActive ? 'bg-white text-indigo-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'
                                                }`}
                                            >
                                                {t(`topics.${activeTopic}.audiences.${key}.label`)}
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>
                        )}
                    </div>

                    <div>
                        <div className="flex items-center gap-2 mb-4">
                            <ListChecks className="w-4 h-4 text-indigo-500" />
                            <h3 className="text-xs font-bold uppercase tracking-widest text-gray-400">{t('labels.steps')}</h3>
                        </div>
                        <ol className="space-y-4">
                            {guide.steps.map((step, idx) => (
                                <li key={idx} className="flex items-start gap-4">
                                    <span className="w-7 h-7 rounded-full bg-indigo-600 text-white text-sm font-bold flex items-center justify-center shrink-0 self-start mt-0.5">
                                        {idx + 1}
                                    </span>
                                    <div>
                                        <p className="font-semibold text-gray-800">{step.title}</p>
                                        <p className="text-gray-600 text-sm mt-0.5">{step.description}</p>
                                    </div>
                                </li>
                            ))}
                        </ol>
                    </div>

                    {guide.tips?.length > 0 && (
                        <div className="bg-amber-50 border border-amber-100 rounded-2xl p-5">
                            <div className="flex items-center gap-2 mb-3">
                                <Lightbulb className="w-4 h-4 text-amber-600" />
                                <h3 className="text-xs font-bold uppercase tracking-widest text-amber-700">{t('labels.tips')}</h3>
                            </div>
                            <ul className="space-y-2">
                                {guide.tips.map((tip, idx) => (
                                    <li key={idx} className="flex gap-2 text-sm text-amber-900">
                                        <span className="text-amber-500 shrink-0">•</span>
                                        <span>{tip}</span>
                                    </li>
                                ))}
                            </ul>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
