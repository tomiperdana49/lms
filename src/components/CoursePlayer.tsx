import { useState, useEffect, useRef } from 'react';
import { PlayCircle, Lock, ChevronRight, BookOpen, ArrowLeft, X, Clock, CheckCircle, Award } from 'lucide-react';
import { API_BASE_URL } from '../config';
import type { Course, Quiz, User, QuizResult } from '../types';
import PopupNotification from './PopupNotification';

interface CoursePlayerProps {
    user: User;
}

declare global {
    interface Window {
        YT: any;
        onYouTubeIframeAPIReady: () => void;
    }
}

const CoursePlayer = ({ user }: CoursePlayerProps) => {
    // --- State ---
    const [courses, setCourses] = useState<Course[]>([]);
    const [viewMode, setViewMode] = useState<'list' | 'player'>('list');
    const [activeCourse, setActiveCourse] = useState<Course | null>(null);
    const [activeModuleId, setActiveModuleId] = useState(1);
    const [activeQuiz, setActiveQuiz] = useState<{ quiz: Quiz, moduleId?: number } | undefined>(undefined);


    const [quizResults, setQuizResults] = useState<Record<number, number>>({}); // moduleId -> best score or boolean
    const [isVideoCompleted, setIsVideoCompleted] = useState(false);

    // Player State
    const playerRef = useRef<any>(null);

    const [moduleProgress, setModuleProgress] = useState<Record<number, number>>({});
    const playerInterval = useRef<any>(null);


    // Derived state
    const activeModule = activeCourse?.modules.find(m => m.id === activeModuleId);

    // Popup State
    const [popup, setPopup] = useState<{ type: 'success' | 'error', message: string, isOpen: boolean }>({
        type: 'success',
        message: '',
        isOpen: false
    });

    // User Identity for API
    const userId = user?.name || 'guest';

    // --- Fetch Courses & Progress ---
    useEffect(() => {
        const loadCourses = async () => {
            try {
                // 1. Fetch all courses (from static file for now)
                const res = await fetch(`${API_BASE_URL}/api/courses-json`);
                const allCourses = await res.json();

                // 2. Sync Progress for each course
                const coursesWithProgress = await Promise.all(allCourses.map(async (course: Course) => {
                    try {
                        const progressRes = await fetch(`${API_BASE_URL}/api/progress/${userId}/${course.id}`);
                        const progressData = await progressRes.json();
                        const completedIds = progressData.completedModuleIds || [];
                        // Save module progress map to state if active course
                        if (activeCourse && activeCourse.id === course.id) {
                            setModuleProgress(progressData.moduleProgress || {});
                        }

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
                            const isCompleted = completedIds.includes(m.id);
                            return { ...m, locked: isLocked, completed: isCompleted };
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

    // Fetch quiz results when activeCourse changes
    useEffect(() => {
        if (!activeCourse) return;
        const fetchResults = async () => {
            try {
                const res = await fetch(`${API_BASE_URL}/api/quiz/results/${userId}/${activeCourse.id}`);
                const results = await res.json();
                // Map results to { moduleId: score }
                // Map results to { moduleId: score }
                const map: Record<number, number> = {};
                results.forEach((r: QuizResult) => {
                    // If multiple attempts, take max
                    if (r.moduleId) {
                        const existing = map[r.moduleId] || 0;
                        if (r.score > existing) map[r.moduleId] = r.score;
                    }
                });
                setQuizResults(map);
            } catch (e) {
                console.error("Failed results", e);
            }
        };
        fetchResults();
    }, [activeCourse, userId]);

    // --- YouTube API Logic ---
    useEffect(() => {
        if (!window.YT) {
            const tag = document.createElement('script');
            tag.src = "https://www.youtube.com/iframe_api";
            const firstScriptTag = document.getElementsByTagName('script')[0];
            firstScriptTag.parentNode?.insertBefore(tag, firstScriptTag);
        }
    }, []);

    // Initialize Player when active module changes
    useEffect(() => {
        if (!activeModule || !activeModule.videoId || viewMode !== 'player') return;

        // Reset state
        const isAlreadyCompleted = activeModule.completed || false;
        setIsVideoCompleted(isAlreadyCompleted);

        // RESUME LOGIC:
        // If completed, allowed max is Infinity.
        // If not, it is the saved timestamp OR 0.
        let savedTime = moduleProgress[activeModule.id] || 0;

        // Smart Resume: If we are effectively at the end (within 10s of completion logic), start at 0
        // We don't have duration here easily unless we stored it in progress, but we can guess or rely on 'completed' flag.
        // If module is completed, we should probably start at 0 for re-watching convenience?
        // Or user defaults to start. let's check savedTime vs expected duration if we had it.
        // Simpler: If activeModule.completed, start at 0.
        if (isAlreadyCompleted && savedTime > 0) {
            savedTime = 0;
        }




        // Clear previous interval
        if (playerInterval.current) clearInterval(playerInterval.current);

        const checkProgress = () => {
            if (!playerRef.current || !playerRef.current.getCurrentTime) return;

            const ct = playerRef.current.getCurrentTime();
            const dur = playerRef.current.getDuration();


            // Mark completed if near end (95% or < 5s remaining)
            if (!isAlreadyCompleted && dur > 0 && (ct >= dur - 5 || ct / dur > 0.95)) {
                setIsVideoCompleted(true);
            }
        };

        // Create a separate save interval or just save on pause/leave? 
        // Reliance on explicit save loop is better for crashes.
        const saveInterval = setInterval(() => {
            if (playerRef.current && playerRef.current.getCurrentTime) {
                const ct = playerRef.current.getCurrentTime();
                if (ct > 0 && !isAlreadyCompleted) {
                    fetch(`${API_BASE_URL}/api/progress/time`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            userId,
                            courseId: activeCourse?.id,
                            moduleId: activeModule.id,
                            timestamp: Math.floor(ct) // Save integer seconds 
                        })
                    }).catch(e => console.error("Auto-save failed", e));
                }
            }
        }, 5000); // Save every 5 seconds

        const initPlayer = () => {
            // Destroy existing if needed (though loadVideoById is preferred for smoother transition)
            if (playerRef.current && typeof playerRef.current.cueVideoById === 'function') {
                // Use cueVideoById to load effectively but stay paused, letting user click play.
                // This resolves "cannot start" glitches if loadVideoById auto-plays in background.
                playerRef.current.cueVideoById({
                    videoId: activeModule.videoId,
                    startSeconds: savedTime
                });
            } else {
                playerRef.current = new window.YT.Player('youtube-player', {
                    height: '100%',
                    width: '100%',
                    videoId: activeModule.videoId,
                    playerVars: {
                        start: Math.floor(savedTime), // Start at saved time
                        autoplay: 0,
                        controls: 1, // ENABLE NATIVE CONTROLS
                        rel: 0,
                        modestbranding: 1,
                        disablekb: 0, // ENABLE KEYBOARD
                        fs: 1, // Enable native fullscreen
                        iv_load_policy: 3
                    },
                    events: {
                        onReady: () => {
                            // Valid event
                        },
                        onStateChange: (event: any) => {
                            if (event.data === window.YT.PlayerState.ENDED) {
                                setIsVideoCompleted(true);
                            }
                        }
                    }
                });
            }

            // Start Polling
            playerInterval.current = setInterval(checkProgress, 500);
        };

        if (window.YT && window.YT.Player) {
            initPlayer();
        } else {
            window.onYouTubeIframeAPIReady = initPlayer;
        }

        return () => {
            if (playerInterval.current) clearInterval(playerInterval.current);
            clearInterval(saveInterval);
        };
    }, [activeModule?.id, activeModule?.videoId, viewMode, activeModule?.completed, moduleProgress, userId, activeCourse?.id]);

    // Custom Controls Handlers


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
                            Modul Pembelajaran Online
                        </h1>
                        <p className="text-blue-100 text-lg md:text-xl leading-relaxed max-w-lg mb-8">
                            Akses modul premium untuk meningkatkan skill professional Anda.
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
                                        {course.progress > 0 ? 'Lanjutkan' : 'Mulai Belajar'}
                                        <ChevronRight size={18} />
                                    </button>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
                <PopupNotification
                    isOpen={popup.isOpen}
                    type={popup.type}
                    message={popup.message}
                    onClose={() => setPopup(prev => ({ ...prev, isOpen: false }))}
                />
            </div>
        );
    }




    // --- Quiz Modal (Student) ---
    // --- Quiz Modal (Student) ---
    if (activeQuiz) {
        const { quiz, moduleId } = activeQuiz;
        return (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-md overflow-y-auto animate-in fade-in duration-200">
                <div className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[90vh] ring-1 ring-white/20">
                    <div className="p-6 md:p-8 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
                        <div>
                            <span className="text-xs font-bold text-blue-600 tracking-wider uppercase mb-1 block">Assessment</span>
                            <h2 className="font-bold text-2xl text-slate-900">{quiz.title}</h2>
                        </div>
                        <button onClick={() => setActiveQuiz(undefined)} className="p-2 rounded-full hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors">
                            <X size={24} />
                        </button>
                    </div>

                    <form
                        id="quiz-form"
                        className="p-6 md:p-8 overflow-y-auto space-y-8"
                    >
                        {/* We will handle submit via button click to avoid form complexity with TS for now, or just iterate refs. 
                             Simpler: Use state for answers? Or just read from DOM? 
                             Let's read from DOM for simplicity or strict FormData.
                          */}
                        {quiz.questions.length === 0 ? (
                            <div className="text-center py-12">
                                <p className="text-slate-500 font-medium">No questions available.</p>
                            </div>
                        ) : (
                            quiz.questions.map((q, idx) => (
                                <div key={q.id} className="space-y-4">
                                    <p className="font-semibold text-lg text-slate-900 leading-relaxed">
                                        <span className="text-slate-900/40 mr-2">{idx + 1}.</span> {q.question}
                                    </p>
                                    <div className="space-y-3 pl-0 md:pl-6">
                                        {q.options.map((opt, optIdx) => (
                                            <label key={optIdx} className="group flex items-center gap-4 p-4 rounded-xl border border-slate-200 hover:border-blue-300 hover:bg-blue-50/50 cursor-pointer transition-all">
                                                <div className="relative flex items-center justify-center">
                                                    <input
                                                        type="radio"
                                                        name={`q-${q.id}`}
                                                        value={optIdx}
                                                        required
                                                        className="peer appearance-none w-5 h-5 border-2 border-slate-300 rounded-full checked:border-blue-600 checked:bg-blue-600 transition-colors"
                                                    />
                                                </div>
                                                <span className="text-slate-600 group-hover:text-slate-900 font-medium">{opt}</span>
                                            </label>
                                        ))}
                                    </div>
                                </div>
                            ))
                        )}
                    </form>

                    <div className="p-6 md:p-8 border-t border-slate-100 bg-slate-50 flex justify-end gap-3">
                        <button
                            onClick={() => setActiveQuiz(undefined)}
                            className="px-6 py-2.5 rounded-xl font-bold text-slate-500 hover:bg-slate-100 transition-colors"
                        >
                            Cancel
                        </button>
                        <button
                            onClick={async () => {
                                // Calculate Score
                                const form = document.querySelector('#quiz-form') as HTMLFormElement;
                                if (!form) return;
                                const formData = new FormData(form);
                                let correct = 0;
                                let answered = 0;

                                quiz.questions.forEach(q => {
                                    const val = formData.get(`q-${q.id}`);
                                    if (val !== null) {
                                        answered++;
                                        if (parseInt(val as string) === q.correctAnswer) {
                                            correct++;
                                        }
                                    }
                                });

                                if (answered < quiz.questions.length) {
                                    setPopup({ type: 'error', message: 'Please answer all questions before submitting.', isOpen: true });
                                    return;
                                }

                                const score = Math.round((correct / quiz.questions.length) * 100);
                                const isPassing = score >= 60; // Pass threshold

                                if (!isPassing) {
                                    setPopup({
                                        type: 'error',
                                        message: `Score: ${score}/100. You need 60% to pass. Please try again.`,
                                        isOpen: true
                                    });
                                    return;
                                }

                                // Save to Backend
                                try {
                                    await fetch(`${API_BASE_URL}/api/quiz/submit`, {
                                        method: 'POST',
                                        headers: { 'Content-Type': 'application/json' },
                                        body: JSON.stringify({
                                            studentId: userId, // ideally ID
                                            studentName: user.name,
                                            courseId: activeCourse?.id,
                                            moduleId: moduleId || null,
                                            score
                                        })
                                    });

                                    setPopup({
                                        type: 'success',
                                        message: `Assessment Passed! Score: ${score}/100`,
                                        isOpen: true
                                    });

                                    // Update State
                                    if (moduleId) {
                                        setQuizResults(prev => ({ ...prev, [moduleId]: score }));

                                        // Also update progress list locally to unlock next
                                        if (activeCourse) {
                                            const currentIndex = activeCourse.modules.findIndex(m => m.id === moduleId);
                                            const nextModule = activeCourse.modules[currentIndex + 1];
                                            const updatedCourse = { ...activeCourse };

                                            // The backend logic handles adding the module status.
                                            // We optimistically update local locks
                                            if (nextModule) {
                                                updatedCourse.modules = updatedCourse.modules.map(m =>
                                                    m.id === nextModule.id ? { ...m, locked: false } : m
                                                );
                                                setCourses(prev => prev.map(c => c.id === updatedCourse.id ? updatedCourse : c));
                                                setActiveCourse(updatedCourse);
                                                setActiveModuleId(nextModule.id);
                                            }
                                        }
                                    }
                                    setActiveQuiz(undefined);
                                } catch (err) {
                                    console.error(err);
                                    setPopup({ type: 'error', message: 'Failed to submit results. Please try again.', isOpen: true });
                                }
                            }}
                            className="bg-blue-600 text-white px-8 py-2.5 rounded-xl font-bold hover:bg-blue-700 shadow-lg hover:shadow-blue-500/30 transition-all transform active:scale-95"
                        >
                            Submit Results
                        </button>
                    </div>
                </div>
            </div >
        );
    }


    // --- Player View ---
    if (!activeCourse) return null;

    // activeModule is already defined at top level for hooks, but we ensure it's used here.
    // If somehow undefined (e.g. bad ID), handle gracefully?
    // Const activeModule is already in scope.

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
                                    <div id="youtube-player" className="absolute inset-0" />
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
                                    <h1 className="text-2xl font-bold text-white mb-3">{activeModule?.title || "Judul Materi"}</h1>
                                    <p className="text-slate-400 leading-relaxed max-w-2xl">
                                        Master this module to advance your skills. Watch the video completely to unlock the next steps.
                                    </p>
                                </div>
                                <div className="flex gap-3">
                                    {/* Control Buttons */}
                                    {activeModule?.quiz ? (
                                        // If module has quiz, render Quiz Button first if not passed
                                        quizResults[activeModule.id] >= 60 ? (
                                            <div className="flex gap-2">
                                                <span className="bg-green-100 text-green-700 px-4 py-3 rounded-xl font-bold flex items-center gap-2">
                                                    <CheckCircle size={20} /> Passed: {quizResults[activeModule.id]}%
                                                </span>
                                                <button
                                                    onClick={() => {
                                                        // Logic to manually move next if they stayed on page?
                                                        // Should verify if next is locked.
                                                        const currentIndex = activeCourse.modules.findIndex(m => m.id === activeModule.id);
                                                        const nextMod = activeCourse.modules[currentIndex + 1];
                                                        if (nextMod && !nextMod.locked) setActiveModuleId(nextMod.id);
                                                    }}
                                                    className="bg-slate-800 text-white px-6 py-3 rounded-xl font-bold hover:bg-slate-700 transition-all flex items-center gap-2"
                                                >
                                                    Lanjut <ChevronRight size={18} />
                                                </button>
                                            </div>
                                        ) : (
                                            <button
                                                onClick={() => setActiveQuiz({ quiz: activeModule.quiz!, moduleId: activeModule.id })}
                                                className="bg-indigo-600 text-white px-6 py-3 rounded-xl font-bold shadow-lg hover:bg-indigo-500 transition-all flex items-center gap-2 animate-bounce"
                                            >
                                                <Award size={20} />
                                                Kerjakan Quiz ({activeModule.quiz.questions.length} Soal)
                                            </button>
                                        )
                                    ) : (
                                        <button
                                            disabled={!isVideoCompleted && activeModule && !activeModule.completed}
                                            onClick={async () => {
                                                if (!activeCourse || !activeModule) return;
                                                const currentIndex = activeCourse.modules.findIndex(m => m.id === activeModule.id);
                                                const nextModule = activeCourse.modules[currentIndex + 1];

                                                try {
                                                    await fetch(`${API_BASE_URL}/api/progress/complete`, {
                                                        method: 'POST',
                                                        headers: { 'Content-Type': 'application/json' },
                                                        body: JSON.stringify({ userId, courseId: activeCourse.id, moduleId: activeModule.id })
                                                    });

                                                    const updatedCourse = { ...activeCourse };
                                                    if (nextModule) {
                                                        updatedCourse.modules = updatedCourse.modules.map(m =>
                                                            m.id === nextModule.id ? { ...m, locked: false } : m
                                                        );
                                                        setActiveCourse(updatedCourse);
                                                        setActiveModuleId(nextModule.id);
                                                        setCourses(prev => prev.map(c => c.id === updatedCourse.id ? updatedCourse : c));
                                                    } else {
                                                        setPopup({ type: 'success', message: 'Modul Selesai!', isOpen: true });
                                                    }
                                                } catch {
                                                    setPopup({ type: 'error', message: 'Error saving progress', isOpen: true });
                                                }
                                            }}
                                            className={`px-6 py-3 rounded-xl font-bold shadow-lg transition-all flex items-center gap-2 group
                                                ${(!isVideoCompleted && activeModule && !activeModule.completed)
                                                    ? 'bg-slate-700 text-slate-400 cursor-not-allowed'
                                                    : 'bg-green-600 text-white hover:bg-green-500 hover:shadow-green-500/20'}
                                            `}
                                        >
                                            {(!isVideoCompleted && activeModule && !activeModule.completed) ? (
                                                <> <Lock size={18} /> Tonton sampai selesai </>
                                            ) : (
                                                <> <CheckCircle size={20} className="group-hover:scale-110 transition-transform" /> Selesai & Lanjut </>
                                            )}
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
                        <h3 className="font-bold text-slate-800 text-lg mb-1">Daftar Materi</h3>
                        <p className="text-sm text-slate-400">
                            {activeModuleId} / {activeCourse.modules.length} Materi Selesai
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

                    {/* Assessment Button */}
                    {activeCourse.assessment && (
                        <div className="p-4 pt-0">
                            <button
                                onClick={() => activeCourse.assessment && setActiveQuiz({ quiz: activeCourse.assessment, moduleId: undefined })}
                                disabled={activeCourse.progress < 100}
                                className={`w-full p-4 rounded-xl flex items-center gap-4 text-left transition-all border-2 border-dashed
                                        ${activeCourse.progress >= 100
                                        ? 'border-indigo-400 bg-indigo-50 hover:bg-indigo-100 cursor-pointer shadow-sm'
                                        : 'border-slate-200 bg-slate-50 cursor-not-allowed opacity-60'}
                                    `}
                            >
                                <div className={`w-10 h-10 shrink-0 rounded-full flex items-center justify-center ${activeCourse.progress >= 100 ? 'bg-indigo-600 text-white' : 'bg-slate-200 text-slate-400'}`}>
                                    <Award size={20} />
                                </div>
                                <div>
                                    <p className={`font-bold ${activeCourse.progress >= 100 ? 'text-indigo-900' : 'text-slate-500'}`}>Final Assessment</p>
                                    <p className="text-xs text-slate-400">{activeCourse.progress >= 100 ? 'Ready to take' : 'Complete all courses to unlock'}</p>
                                </div>
                            </button>
                        </div>
                    )}
                </div>
            </div>




            <PopupNotification
                isOpen={popup.isOpen}
                type={popup.type}
                message={popup.message}
                onClose={() => setPopup(prev => ({ ...prev, isOpen: false }))}
            />
        </div >
    );
};



export default CoursePlayer;
