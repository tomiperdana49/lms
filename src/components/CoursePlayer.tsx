import { useState, useEffect } from 'react';
import { PlayCircle, Lock, ChevronRight, BookOpen, ArrowLeft, X, Clock, CheckCircle } from 'lucide-react';
import { API_BASE_URL } from '../config';
import type { Course, Quiz, User } from '../types';

interface CoursePlayerProps {
    user: User;
}

const CoursePlayer = ({ user }: CoursePlayerProps) => {
    // --- State ---
    const [courses, setCourses] = useState<Course[]>([]);
    const [viewMode, setViewMode] = useState<'list' | 'player'>('list');
    const [activeCourse, setActiveCourse] = useState<Course | null>(null);
    const [activeModuleId, setActiveModuleId] = useState(1);
    const [activeQuiz, setActiveQuiz] = useState<Quiz | undefined>(undefined);
    // User Identity for API
    const userId = user?.name || 'guest';

    // --- Fetch Courses & Progress ---
    useEffect(() => {
        const loadCourses = async () => {
            try {
                // 1. Fetch all courses
                const res = await fetch(`${API_BASE_URL}/api/courses`);
                const allCourses = await res.json();

                // 2. Sync Progress for each course
                const coursesWithProgress = await Promise.all(allCourses.map(async (course: Course) => {
                    try {
                        const progressRes = await fetch(`${API_BASE_URL}/api/progress/${userId}/${course.id}`);
                        const progressData = await progressRes.json();
                        const completedIds = progressData.completedModuleIds || [];

                        // Calculate progress percentage
                        const progress = course.modules.length > 0
                            ? Math.round((completedIds.length / course.modules.length) * 100)
                            : 0;

                        // Unlock modules based on completion
                        // Simple rule: If module N is done, N+1 is unlocked. 
                        // First module always unlocked.
                        const modules = course.modules.map((m, idx) => {
                            // Previous module completed?
                            const prevMod = course.modules[idx - 1];
                            const isLocked = idx === 0 ? false : (prevMod && !completedIds.includes(prevMod.id));
                            return { ...m, locked: isLocked };
                        });

                        return { ...course, progress, modules };
                    } catch {
                        return course;
                    }
                }));

                setCourses(coursesWithProgress);
            } catch (error) {
                console.error("Failed to load courses:", error);
            }
        };
        loadCourses();
    }, [userId]);

    const handleStartCourse = (course: Course) => {
        setActiveCourse(course);
        setViewMode('player');
        setActiveModuleId(1); // Start from first module or saved progress
    };

    const handleBackToList = () => {
        setViewMode('list');
        setActiveCourse(null);
    };

    // --- Views ---

    if (viewMode === 'list') {
        return (
            <div className="max-w-6xl mx-auto p-6 pb-24 space-y-8 animate-fade-in">
                {/* Hero Section */}
                <div className="relative overflow-hidden rounded-3xl bg-gradient-to-r from-blue-600 to-indigo-700 p-8 md:p-12 text-white shadow-2xl">
                    <div className="relative z-10 max-w-2xl">
                        <div className="inline-flex items-center gap-2 bg-white/10 backdrop-blur-md px-4 py-1.5 rounded-full text-sm font-medium border border-white/20 mb-6">
                            <span className="flex h-2 w-2 rounded-full bg-green-400 animate-pulse"></span>
                            Learning Hub
                        </div>
                        <h1 className="text-4xl md:text-5xl font-bold mb-4 tracking-tight leading-tight">
                            Expand Your Knowledge
                        </h1>
                        <p className="text-blue-100 text-lg md:text-xl leading-relaxed max-w-lg mb-8">
                            Access premium courses designed to elevate your professional skills. Start your journey today.
                        </p>
                    </div>

                    {/* Decorative Circles */}
                    <div className="absolute top-0 right-0 -mr-20 -mt-20 w-80 h-80 bg-white/10 rounded-full blur-3xl"></div>
                    <div className="absolute bottom-0 right-20 w-60 h-60 bg-indigo-500/30 rounded-full blur-3xl"></div>
                </div>

                {/* Course Grid */}
                <div className="grid grid-cols-1 gap-6">
                    {courses.map(course => (
                        <div key={course.id} className="bg-white rounded-2xl p-6 md:p-8 shadow-sm border border-slate-100 hover:shadow-xl hover:border-blue-100 transition-all duration-300 group relative overflow-hidden">
                            <div className="flex flex-col md:flex-row gap-8 items-start">
                                {/* Icon / Thumbnail Substitute */}
                                <div className="hidden md:flex shrink-0 w-24 h-24 rounded-2xl bg-blue-50 items-center justify-center text-blue-600 group-hover:scale-105 transition-transform duration-300">
                                    <BookOpen size={40} />
                                </div>

                                <div className="flex-1 space-y-4">
                                    <div className="flex flex-wrap gap-3 items-center text-sm font-medium text-slate-500 mb-1">
                                        <span className="flex items-center gap-1.5 bg-slate-50 px-2.5 py-1 rounded-md border border-slate-100">
                                            <Clock size={14} /> {course.duration}
                                        </span>

                                    </div>

                                    <div>
                                        <h3 className="text-2xl font-bold text-slate-900 mb-2 group-hover:text-blue-600 transition-colors">
                                            {course.title}
                                        </h3>
                                        <p className="text-slate-500 leading-relaxed">
                                            {course.description}
                                        </p>
                                    </div>

                                    {/* Progress Bar */}
                                    {course.progress > 0 && (
                                        <div className="max-w-md space-y-2 pt-2">
                                            <div className="flex justify-between text-xs font-semibold text-slate-600">
                                                <span>Progress</span>
                                                <span>{course.progress}%</span>
                                            </div>
                                            <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden">
                                                <div
                                                    className="h-full bg-gradient-to-r from-blue-500 to-indigo-500 rounded-full"
                                                    style={{ width: `${course.progress}%` }}
                                                />
                                            </div>
                                        </div>
                                    )}
                                </div>

                                {/* Action Button */}
                                <div className="w-full md:w-auto flex flex-col items-center justify-center self-center pl-0 md:pl-6 border-l-0 md:border-l border-slate-100">
                                    <button
                                        onClick={() => handleStartCourse(course)}
                                        className="w-full md:w-auto whitespace-nowrap px-8 py-3.5 rounded-xl font-bold text-white bg-slate-900 hover:bg-blue-600 shadow-lg hover:shadow-blue-500/30 transition-all duration-300 flex items-center justify-center gap-2 group-hover:translate-x-1"
                                    >
                                        {course.progress > 0 ? 'Continue' : 'Start Learning'}
                                        <ChevronRight size={18} />
                                    </button>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        );
    }



    // --- Quiz Modal (Student) ---
    if (activeQuiz) {
        return (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-md overflow-y-auto animate-in fade-in duration-200">
                <div className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[90vh] ring-1 ring-white/20">
                    <div className="p-6 md:p-8 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
                        <div>
                            <span className="text-xs font-bold text-blue-600 tracking-wider uppercase mb-1 block">Assessment</span>
                            <h2 className="font-bold text-2xl text-slate-900">{activeQuiz.title}</h2>
                        </div>
                        <button onClick={() => setActiveQuiz(undefined)} className="p-2 rounded-full hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors">
                            <X size={24} />
                        </button>
                    </div>

                    <div className="p-6 md:p-8 overflow-y-auto space-y-8">
                        {activeQuiz.questions.length === 0 ? (
                            <div className="text-center py-12">
                                <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center mx-auto mb-4 text-slate-300">
                                    <BookOpen size={32} />
                                </div>
                                <p className="text-slate-500 font-medium">No questions available yet.</p>
                            </div>
                        ) : (
                            activeQuiz.questions.map((q, idx) => (
                                <div key={q.id} className="space-y-4">
                                    <p className="font-semibold text-lg text-slate-900 leading-relaxed">
                                        <span className="text-slate-900/40 mr-2">{idx + 1}.</span> {q.question}
                                    </p>
                                    <div className="space-y-3 pl-0 md:pl-6">
                                        {q.options.map((opt, optIdx) => (
                                            <label key={optIdx} className="group flex items-center gap-4 p-4 rounded-xl border border-slate-200 hover:border-blue-300 hover:bg-blue-50/50 cursor-pointer transition-all">
                                                <div className="relative flex items-center justify-center">
                                                    <input type="radio" name={`q-${q.id}`} className="peer appearance-none w-5 h-5 border-2 border-slate-300 rounded-full checked:border-blue-600 checked:bg-blue-600 transition-colors" />
                                                </div>
                                                <span className="text-slate-600 group-hover:text-slate-900 font-medium">{opt}</span>
                                            </label>
                                        ))}
                                    </div>
                                </div>
                            ))
                        )}
                    </div>

                    <div className="p-6 md:p-8 border-t border-slate-100 bg-slate-50 flex justify-end gap-3">
                        <button
                            onClick={() => setActiveQuiz(undefined)}
                            className="px-6 py-2.5 rounded-xl font-bold text-slate-500 hover:bg-slate-100 transition-colors"
                        >
                            Cancel
                        </button>
                        <button
                            onClick={() => {
                                alert('Quiz Submitted! Score: 100/100 (Mock)');
                                setActiveQuiz(undefined);
                            }}
                            className="bg-blue-600 text-white px-8 py-2.5 rounded-xl font-bold hover:bg-blue-700 shadow-lg hover:shadow-blue-500/30 transition-all transform active:scale-95"
                        >
                            Submit Assessment
                        </button>
                    </div>
                </div>
            </div>
        );
    }


    // --- Player View ---
    if (!activeCourse) return null;

    const activeModule = activeCourse.modules.find(m => m.id === activeModuleId);

    return (
        <div className="flex flex-col h-[calc(100vh-80px)] bg-slate-900">
            {/* Dark Header for Cinema Mode */}
            <div className="bg-slate-900 border-b border-slate-800 p-4 flex items-center justify-between z-20 shadow-md">
                <div className="flex items-center gap-4">
                    <button
                        onClick={handleBackToList}
                        className="p-2 hover:bg-slate-800 rounded-full text-slate-400 hover:text-white transition-colors"
                    >
                        <ArrowLeft size={24} />
                    </button>
                    <div>
                        <h2 className="font-bold text-lg text-white tracking-wide">{activeCourse.title}</h2>
                    </div>
                </div>
                <div className="flex items-center gap-4">
                    <div className="hidden md:flex flex-col items-end mr-4">
                        <span className="text-xs text-slate-400 font-medium uppercase tracking-wider">Progress</span>
                        <div className="w-32 bg-slate-800 rounded-full h-1.5 mt-1">
                            <div className="bg-blue-500 h-full rounded-full w-[10%] shadow-[0_0_10px_rgba(59,130,246,0.5)]"></div>
                        </div>
                    </div>
                </div>
            </div>

            <div className="flex flex-col lg:flex-row flex-1 overflow-hidden">
                {/* Player Area (Left/Top) - Cinema Mode */}
                <div className="flex-1 overflow-y-auto flex flex-col bg-slate-950 relative">
                    <div className="w-full h-full flex flex-col">
                        <div className="flex-1 flex items-center justify-center p-4 lg:p-10 min-h-[400px]">
                            <div className="w-full max-w-5xl aspect-video bg-black rounded-2xl overflow-hidden shadow-2xl relative ring-1 ring-slate-800 group">
                                {activeModule?.videoType === 'youtube' && activeModule.videoId ? (
                                    <iframe
                                        width="100%"
                                        height="100%"
                                        src={`https://www.youtube.com/embed/${activeModule.videoId}?autoplay=1`}
                                        title={activeModule.title}
                                        frameBorder="0"
                                        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                                        allowFullScreen
                                        className="absolute inset-0"
                                    ></iframe>
                                ) : (
                                    <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-500 bg-slate-900/50 backdrop-blur-sm">
                                        <PlayCircle size={64} className="mb-4 opacity-50" />
                                        <p>Video source not available</p>
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Video Info Area */}
                        <div className="bg-slate-900 border-t border-slate-800 p-6 md:p-10 pb-20">
                            <div className="max-w-5xl mx-auto flex flex-col md:flex-row gap-8 justify-between items-start">
                                <div>
                                    <h1 className="text-2xl font-bold text-white mb-3">{activeModule?.title || "Module Title"}</h1>
                                    <p className="text-slate-400 leading-relaxed max-w-2xl">
                                        Master this module to advance your skills. Watch the video completely to unlock the next steps.
                                    </p>
                                </div>
                                <div className="flex gap-3">
                                    {/* Mark as Complete Button */}
                                    <button
                                        onClick={async () => {
                                            if (!activeCourse || !activeModule) return;

                                            // 1. Optimistic Update
                                            const currentIndex = activeCourse.modules.findIndex(m => m.id === activeModule.id);
                                            const nextModule = activeCourse.modules[currentIndex + 1];

                                            try {
                                                // 2. Call API
                                                await fetch(`${API_BASE_URL}/api/progress/complete`, {
                                                    method: 'POST',
                                                    headers: { 'Content-Type': 'application/json' },
                                                    body: JSON.stringify({ userId, courseId: activeCourse.id, moduleId: activeModule.id })
                                                });

                                                // 3. Update State
                                                const updatedCourse = { ...activeCourse };

                                                // Update completion logic locally
                                                // If there is a next module, unlock it
                                                if (nextModule) {
                                                    updatedCourse.modules = updatedCourse.modules.map(m =>
                                                        m.id === nextModule.id ? { ...m, locked: false } : m
                                                    );
                                                    setActiveCourse(updatedCourse);
                                                    setActiveModuleId(nextModule.id);
                                                } else {
                                                    alert("Course Completed! Congratulations!");
                                                }

                                                // Update list view too
                                                setCourses(prev => prev.map(c => c.id === updatedCourse.id ? updatedCourse : c));

                                            } catch {
                                                alert("Failed to save progress. Please try again.");
                                            }
                                        }}
                                        className="bg-green-600 text-white px-6 py-3 rounded-xl font-bold shadow-lg hover:bg-green-500 hover:shadow-green-500/20 transition-all flex items-center gap-2 group"
                                    >
                                        <CheckCircle size={20} className="group-hover:scale-110 transition-transform" />
                                        Complete & Next
                                    </button>

                                    {activeModule?.quiz && (
                                        <button
                                            onClick={() => setActiveQuiz(activeModule.quiz)}
                                            className="bg-blue-600 text-white px-6 py-3 rounded-xl font-bold shadow-lg hover:bg-blue-500 hover:shadow-blue-500/20 transition-all flex items-center gap-2 group"
                                        >
                                            <PlayCircle size={20} className="group-hover:scale-110 transition-transform" />
                                            Quiz
                                        </button>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Sidebar (Right/Bottom) - Light Theme for Readability */}
                <div className="w-full lg:w-[400px] bg-white border-l border-slate-200 flex flex-col shrink-0 z-10 shadow-xl">
                    <div className="p-6 border-b border-slate-100 bg-white sticky top-0">
                        <h3 className="font-bold text-slate-800 text-lg mb-1">Course Content</h3>
                        <p className="text-sm text-slate-400">
                            {activeModuleId} / {activeCourse.modules.length} Modules Completed
                        </p>
                    </div>

                    <div className="flex-1 overflow-y-auto">
                        <div className="p-4 space-y-2">
                            {activeCourse.modules.map((mod, idx) => {
                                const isActive = mod.id === activeModuleId;
                                const isLocked = mod.locked;
                                return (
                                    <button
                                        key={mod.id}
                                        onClick={() => !isLocked && setActiveModuleId(mod.id)}
                                        disabled={isLocked}
                                        className={`w-full p-4 rounded-xl flex items-start gap-4 text-left transition-all duration-200 group
                                            ${isActive
                                                ? 'bg-blue-50 ring-1 ring-blue-100 shadow-sm'
                                                : 'hover:bg-slate-50 border border-transparent'}
                                            ${isLocked ? 'opacity-50 grayscale cursor-not-allowed' : ''}
                                        `}
                                    >
                                        <div className={`mt-0.5 shrink-0 w-6 h-6 rounded-full flex items-center justify-center border
                                            ${isActive ? 'bg-blue-500 border-blue-500 text-white' : 'border-slate-300 text-slate-400'}
                                        `}>
                                            {isLocked ? (
                                                <Lock size={12} />
                                            ) : isActive ? (
                                                <div className="w-2 h-2 bg-white rounded-full animate-pulse" />
                                            ) : (
                                                <span className="text-xs font-medium">{idx + 1}</span>
                                            )}
                                        </div>

                                        <div className="flex-1 min-w-0">
                                            <p className={`text-sm font-semibold line-clamp-2 ${isActive ? 'text-blue-900' : 'text-slate-700'}`}>
                                                {mod.title}
                                            </p>
                                            <div className="flex items-center gap-2 mt-1.5">
                                                <span className="text-xs text-slate-400 flex items-center gap-1">
                                                    <Clock size={12} /> {mod.duration}
                                                </span>
                                                {mod.quiz && (
                                                    <span className="text-[10px] uppercase font-bold px-1.5 py-0.5 bg-indigo-100 text-indigo-700 rounded-sm">
                                                        Quiz
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default CoursePlayer;
