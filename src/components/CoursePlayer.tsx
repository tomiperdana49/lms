import { useState, useEffect, useRef } from 'react';
import { PlayCircle, Lock, ChevronRight, BookOpen, ArrowLeft, X, Clock, CheckCircle, Award } from 'lucide-react';
import { API_BASE_URL } from '../config';
import type { Course, Quiz, QuizResult, User } from '../types';
import PopupNotification from './PopupNotification';

interface CoursePlayerProps {
    user: User;
}

interface ProgressResponse {
    completedModuleIds: (number | string)[];
    moduleProgress: Record<string, any>;
}

declare global {
    interface YTPlayer {
        getCurrentTime: () => number;
        getDuration: () => number;
        cueVideoById: (config: { videoId: string; startSeconds?: number }) => void;
        loadVideoById: (config: { videoId: string; startSeconds?: number }) => void;
        destroy: () => void;
        seekTo: (seconds: number, allowSeekAhead: boolean) => void;
        playVideo: () => void;
        getIframe: () => HTMLIFrameElement;
    }

    interface YTPlayerEvent {
        target: YTPlayer;
        data: number;
    }

    interface YTConfig {
        height: string;
        width: string;
        videoId: string;
        playerVars?: {
            start?: number;
            autoplay?: number;
            controls?: number;
            rel?: number;
            modestbranding?: number;
            disablekb?: number;
            fs?: number;
            iv_load_policy?: number;
        };
        events?: {
            onReady?: (event: YTPlayerEvent) => void;
            onStateChange?: (event: { data: number }) => void;
        };
    }

    interface Window {
        YT: {
            Player: new (id: string, config: YTConfig) => YTPlayer;
            PlayerState: {
                ENDED: number;
                PLAYING: number;
                PAUSED: number;
            };
        };
        onYouTubeIframeAPIReady: () => void;
    }
}

const CoursePlayer = ({ user }: CoursePlayerProps) => {
    // --- State ---
    const [courses, setCourses] = useState<Course[]>([]);
    const [viewMode, setViewMode] = useState<'list' | 'player'>('list');
    const [activeCourse, setActiveCourse] = useState<Course | null>(null);
    const [activeModuleId, setActiveModuleId] = useState<number | undefined>(undefined);
    const [activeQuiz, setActiveQuiz] = useState<{ quiz: Quiz; moduleId?: number } | undefined>(undefined);
    const [quizAnswers, setQuizAnswers] = useState<Record<number, number>>({});
    const [quizResults, setQuizResults] = useState<Record<number, number>>({}); // moduleId -> score
    const [assessmentScore, setAssessmentScore] = useState<number | null>(null);

    const [popup, setPopup] = useState<{ type: 'success' | 'error', message: string, isOpen: boolean }>({ type: 'success', message: '', isOpen: false });

    // Quiz Feedback State
    const [showFeedback, setShowFeedback] = useState(false);
    const [lastScore, setLastScore] = useState(0);

    const [isVideoCompleted, setIsVideoCompleted] = useState(false);
    const [loadingResults, setLoadingResults] = useState(false);

    // Player State
    const playerRef = useRef<YTPlayer | null>(null);

    const [moduleProgress, setModuleProgress] = useState<Record<number, number>>({});
    const playerInterval = useRef<ReturnType<typeof setInterval> | null>(null);

    // Fix: Use Ref to avoid stale closure in setInterval
    const quizResultsRef = useRef(quizResults);
    useEffect(() => {
        quizResultsRef.current = quizResults;
    }, [quizResults]);


    // Derived state
    const activeModule = activeCourse?.modules?.find(m => m.id === activeModuleId);


    // User Identity for API
    const userId = user?.id || 'guest';

    // --- Fetch Courses & Progress ---
    useEffect(() => {
        const loadCourses = async () => {
            try {
                // 1. Fetch all courses (from MySQL API)
                const res = await fetch(`${API_BASE_URL}/api/courses`);
                const allCourses = await res.json();

                // 2. Sync Progress for each course
                const coursesWithProgress = await Promise.all(allCourses.map(async (course: Course) => {
                    try {
                        const [progressRes, quizRes] = await Promise.all([
                            fetch(`${API_BASE_URL}/api/progress/${userId}/${course.id}?_t=${new Date().getTime()}`),
                            fetch(`${API_BASE_URL}/api/quiz/results/${userId}/${course.id}?_t=${new Date().getTime()}`)
                        ]);

                        if (!progressRes.ok) throw new Error('Failed to fetch progress');

                        const progressData = await progressRes.json() as ProgressResponse;
                        const completedIds = progressData.completedModuleIds || [];

                        // Check Assessment Status from Quiz Results
                        let isAssessmentPassed = false;
                        try {
                            const quizData = await quizRes.json();
                            if (Array.isArray(quizData)) {
                                // Check for any result with NO moduleId (Final Assessment) and Score >= 80
                                // OR check if high score exists for assessment
                                isAssessmentPassed = quizData.some((r: QuizResult) => !r.moduleId && r.score >= 80);
                            }
                        } catch (e) {
                            console.warn("Failed to parse quiz results", e);
                        }

                        // Save module progress map to state if active course
                        if (activeCourse?.id === course.id) {
                            setModuleProgress(progressData.moduleProgress || {});
                        }

                        // Calculate progress percentage
                        // Filter completedIds to only include valid module IDs for this course
                        // Use String comparison for robustness
                        const validCompletedIds = completedIds.filter((id) =>
                            course.modules.some(m => String(m.id) === String(id))
                        );
                        // Use Set to ensure unique IDs (handling potential string/number duplicates)
                        const uniqueCompletedCount = new Set(validCompletedIds.map(id => String(id))).size;
                        const totalModules = course.modules.length;

                        let progress = totalModules > 0
                            ? Math.min(100, Math.round((uniqueCompletedCount / totalModules) * 100))
                            : 0;

                        // FORCE Override: If Assessment Passed, Progress IS 100%
                        if (isAssessmentPassed) {
                            progress = 100;
                        } else if (uniqueCompletedCount === totalModules && totalModules > 0) {
                            // Explicitly set to 100 if counts match (Video-only courses)
                            progress = 100;
                        }

                        // Unlock modules based on completion
                        // Simple rule: If module N is done, N+1 is unlocked. 
                        // First module always unlocked.
                        const modules = course.modules.map((m, idx) => {
                            // Previous module completed?
                            const prevMod = course.modules[idx - 1];
                            // Check if previous module is in completedIds (using String)
                            const prevCompleted = prevMod && completedIds.some((id) => String(id) === String(prevMod.id));

                            const isLocked = idx === 0 ? false : (prevMod && !prevCompleted);
                            const isCompleted = completedIds.some((id) => String(id) === String(m.id));

                            return { ...m, locked: isLocked, completed: isCompleted };
                        });

                        return { ...course, progress, modules, isAssessmentPassed };
                    } catch (err) {
                        console.error(`Error loading progress for course ${course.id}:`, err);
                        return course;
                    }
                }));

                setCourses(coursesWithProgress);
            } catch (error) {
                console.error("Failed to load courses:", error);
            }
        };
        // Only load list if we are in list view OR if we need to sync active course
        if (viewMode === 'list' || activeCourse) {
            loadCourses();
        }

    }, [userId, activeCourse, viewMode]); // Depend on activeCourse object to catch all changes

    // Fetch quiz results when activeCourse changes
    useEffect(() => {
        if (!activeCourse) return;
        const fetchResults = async () => {
            setLoadingResults(true); // Start loading
            try {
                const res = await fetch(`${API_BASE_URL}/api/quiz/results/${userId}/${activeCourse.id}`);
                const results = await res.json();

                if (!Array.isArray(results)) {
                    console.error("Invalid quiz results format", results);
                    return;
                }

                // Map results to { moduleId: score }
                const map: Record<number, number> = {};
                let maxAssessmentScore = 0;
                let hasAssessment = false;

                results.forEach((r: QuizResult) => {
                    // If multiple attempts, take max
                    if (r.moduleId) {
                        const existing = map[r.moduleId] || 0;
                        if (r.score > existing) map[r.moduleId] = r.score;
                    } else {
                        // This is final assessment
                        hasAssessment = true;
                        if (r.score > maxAssessmentScore) maxAssessmentScore = r.score;
                    }
                });
                setQuizResults(map);
                if (hasAssessment) setAssessmentScore(maxAssessmentScore);
                else setAssessmentScore(null);

            } catch (e) {
                console.error("Failed results", e);
            } finally {
                setLoadingResults(false); // End loading
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
        let savedTime = 0;
        if (activeModuleId && moduleProgress[activeModuleId]) {
            savedTime = moduleProgress[activeModuleId];
        }

        if (isAlreadyCompleted && savedTime > 0) {
            savedTime = 0; // If completed, start from beginning or keep saved? Usually reset if re-watching.
        }

        // Clear previous interval
        if (playerInterval.current) {
            clearInterval(playerInterval.current);
            playerInterval.current = null;
        }

        const checkProgress = () => {
            // Safety check for ref
            if (!playerRef.current || !playerRef.current.getCurrentTime) return;

            // Safety check for activeModule availability in closure
            if (!activeModule) return;

            try {
                const ct = playerRef.current.getCurrentTime();
                const dur = playerRef.current.getDuration();

                // Mark completed if near end (95% or < 5s remaining)
                if (!isAlreadyCompleted && dur > 0 && (ct >= dur - 5 || ct / dur > 0.95)) {
                    setIsVideoCompleted(true);
                    // Auto-open quiz if exists and not passed
                    // Check against REF to avoid stale closure
                    const currentResults = quizResultsRef.current;
                    if (activeModule?.quiz && (!currentResults[activeModule.id] || currentResults[activeModule.id] < 80)) {
                        setActiveQuiz({ quiz: activeModule.quiz, moduleId: activeModule.id });
                    }
                }
            } catch (e) {
                console.error("Player Progress Check Error", e);
            }
        };

        const saveInterval = setInterval(() => {
            if (playerRef.current && playerRef.current.getCurrentTime && !isAlreadyCompleted && activeCourse?.id && activeModule?.id) {
                try {
                    const ct = playerRef.current.getCurrentTime();
                    if (ct > 0) {
                        fetch(`${API_BASE_URL}/api/progress/time`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                                userId,
                                employee_id: user.employee_id,
                                courseId: activeCourse.id,
                                moduleId: activeModule.id,
                                timestamp: Math.floor(ct)
                            })
                        }).catch(() => { /* ignore error */ });
                    }
                } catch { /* ignore */ }
            }
        }, 5000);

        const initPlayer = () => {
            // Double check module validity
            if (!activeModule || !activeModule.videoId) return;

            // Check if existing player is valid and attached to DOM
            const isPlayerValid = playerRef.current &&
                typeof playerRef.current.getIframe === 'function' &&
                playerRef.current.getIframe() &&
                document.body.contains(playerRef.current.getIframe());

            if (isPlayerValid) {
                // Use loadVideoById to auto-play immediately
                try {
                    playerRef.current?.loadVideoById({
                        videoId: activeModule.videoId,
                        startSeconds: savedTime
                    });
                } catch (e) { console.error("Player Load Error", e); }
            } else {
                // Determine if we should destroy a stale player reference
                if (playerRef.current) {
                    try { playerRef.current.destroy(); } catch { /* ignore */ }
                }

                try {
                    playerRef.current = new window.YT.Player('youtube-player', {
                        height: '100%',
                        width: '100%',
                        videoId: activeModule.videoId,
                        playerVars: {
                            start: Math.floor(savedTime),
                            autoplay: 1,
                            controls: 1,
                            rel: 0,
                            modestbranding: 1,
                            disablekb: 0,
                            fs: 1,
                            iv_load_policy: 3
                        },
                        events: {
                            onReady: (event: YTPlayerEvent) => {
                                event.target.playVideo();
                            },
                            onStateChange: (event: { data: number }) => {
                                if (event.data === window.YT.PlayerState.ENDED) {
                                    setIsVideoCompleted(true);
                                    if (activeModule?.quiz && (!quizResults[activeModule.id] || quizResults[activeModule.id] < 80)) {
                                        setActiveQuiz({ quiz: activeModule.quiz, moduleId: activeModule.id });
                                    }
                                }
                            }
                        }
                    });
                } catch (e) { console.error("YT Player Init Error", e); }
            }

            // Start Polling
            if (playerInterval.current) clearInterval(playerInterval.current);
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
    }, [activeModuleId, activeModule, activeCourse, viewMode, quizResults, userId, moduleProgress]);
    // Simplified dependencies but included necessary ones for closure correctness

    // Custom Controls Handlers


    const handleStartCourse = (course: Course) => {
        if (!course) return;
        setActiveCourse(course);
        setViewMode('player');
        // Start from first module or saved progress
        // Safety check to ensure modules exist and have at least one item
        if (Array.isArray(course.modules) && course.modules.length > 0) {
            const firstModule = course.modules[0];
            if (firstModule && firstModule.id) {
                setActiveModuleId(firstModule.id);
            }
        }
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
                                        {course.progress === 100 && (
                                            <span className="flex items-center gap-1.5 bg-green-50 text-green-600 px-2.5 py-1 rounded-md border border-green-100 font-bold">
                                                Selesai
                                            </span>
                                        )}
                                    </div>

                                    <div>
                                        <h3 className="text-2xl font-bold text-slate-900 mb-2 group-hover:text-blue-600 transition-colors">
                                            {course.title}
                                        </h3>
                                        <p className="text-slate-500 leading-relaxed">
                                            {course.description}
                                        </p>
                                    </div>
                                </div>

                                {/* Action Button */}
                                <div className="w-full md:w-auto flex flex-col items-center justify-center self-center pl-0 md:pl-6 border-l-0 md:border-l border-slate-100">
                                    <button
                                        onClick={() => handleStartCourse(course)}
                                        disabled={course.progress === 100}
                                        className={`w-full md:w-auto whitespace-nowrap px-8 py-3.5 rounded-xl font-bold transition-all duration-300 flex items-center justify-center gap-2 
                                            ${course.progress === 100
                                                ? 'bg-green-600 text-white cursor-not-allowed opacity-100 shadow-none'
                                                : 'bg-slate-900 text-white hover:bg-blue-600 hover:shadow-blue-500/30 group-hover:translate-x-1 shadow-lg'
                                            }`}
                                    >
                                        {course.progress === 100 ? (
                                            <>
                                                Selesai <CheckCircle size={18} />
                                            </>
                                        ) : course.progress > 0 ? (
                                            <>
                                                Lanjutkan <ChevronRight size={18} />
                                            </>
                                        ) : (
                                            <>
                                                Mulai Belajar <ChevronRight size={18} />
                                            </>
                                        )}
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
                                        {q.options.map((opt, optIdx) => {
                                            const isSelected = quizAnswers[q.id] === optIdx;
                                            // Feedback Logic
                                            let feedbackClass = '';
                                            if (showFeedback) {
                                                if (lastScore >= 80) {
                                                    // Pass: Show full correct/incorrect
                                                    if (q.correctAnswer === optIdx) {
                                                        feedbackClass = 'bg-green-100 border-green-500 text-green-900 ring-1 ring-green-500';
                                                    } else if (isSelected && q.correctAnswer !== optIdx) {
                                                        feedbackClass = 'bg-red-50 border-red-300 text-red-800 ring-1 ring-red-300';
                                                    }
                                                } else {
                                                    // Fail: Hide correct answer, only show mistake
                                                    if (isSelected && q.correctAnswer !== optIdx) {
                                                        feedbackClass = 'bg-red-50 border-red-300 text-red-800 ring-1 ring-red-300';
                                                    }
                                                }

                                                if (!isSelected && !feedbackClass) {
                                                    feedbackClass = 'opacity-50';
                                                }
                                            }

                                            return (
                                                <label key={optIdx} className={`group flex items-center gap-4 p-4 rounded-xl border cursor-pointer transition-all
                                                    ${feedbackClass ? feedbackClass : (isSelected
                                                        ? 'border-blue-500 bg-blue-50 text-blue-900 shadow-sm ring-1 ring-blue-500'
                                                        : 'border-slate-200 hover:border-blue-300 hover:bg-slate-50 text-slate-700')}
                                                `}>
                                                    <div className="relative flex items-center justify-center">
                                                        <input
                                                            type="radio"
                                                            name={`q-${q.id}`}
                                                            value={optIdx}
                                                            required
                                                            checked={isSelected}
                                                            onChange={() => !showFeedback && setQuizAnswers(prev => ({ ...prev, [q.id]: optIdx }))}
                                                            disabled={showFeedback}
                                                            className="peer appearance-none w-5 h-5 border-2 border-slate-300 rounded-full checked:border-blue-600 checked:bg-blue-600 transition-colors"
                                                        />
                                                    </div>
                                                    <span className="font-medium flex-1 flex justify-between">
                                                        {opt}
                                                        {showFeedback && lastScore >= 80 && q.correctAnswer === optIdx && <CheckCircle size={18} className="text-green-600" />}
                                                        {showFeedback && isSelected && q.correctAnswer !== optIdx && <X size={18} className="text-red-500" />}
                                                    </span>
                                                </label>
                                            );
                                        })}
                                    </div>
                                </div>
                            ))
                        )}
                    </form>

                    <div className="p-6 md:p-8 border-t border-slate-100 bg-slate-50 flex justify-end gap-3">
                        <button
                            onClick={() => {
                                setActiveQuiz(undefined);
                                // Use loadVideoById to force a fresh restart of the video stream
                                // This is more robust than seekTo(0) which can sometimes get stuck in ENDED state
                                // We use a small timeout to allow the modal to unmount completely
                                setTimeout(() => {
                                    if (playerRef.current && playerRef.current.loadVideoById) {
                                        playerRef.current.loadVideoById({
                                            videoId: activeModule?.videoId || '',
                                            startSeconds: 0
                                        });
                                        setIsVideoCompleted(false);
                                    }
                                }, 100);
                            }}
                            className="px-6 py-2.5 rounded-xl font-bold text-slate-500 hover:bg-slate-100 transition-colors"
                        >
                            Tutup (Tonton Ulang)
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
                                const isPassing = score >= 80; // Pass threshold

                                setLastScore(score);

                                // Save to Backend (Always save result for history)
                                try {
                                    const submitRes = await fetch(`${API_BASE_URL}/api/quiz/submit`, {
                                        method: 'POST',
                                        headers: { 'Content-Type': 'application/json' },
                                        body: JSON.stringify({
                                            studentId: user.id || userId,
                                            employee_id: user.employee_id,
                                            studentName: user.name,
                                            courseId: activeCourse?.id,
                                            moduleId: moduleId || null,
                                            score
                                        })
                                    });

                                    if (!submitRes.ok) {
                                        setPopup({ type: 'error', message: 'Gagal mengirim jawaban. Silakan coba lagi.', isOpen: true });
                                        return;
                                    }

                                    // Show Feedback Mode instead of closing
                                    setShowFeedback(true);

                                    // If Passed, Update Progress Locally
                                    if (isPassing) {
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
                                        } else {
                                            // Final Assessment Passed
                                            setAssessmentScore(score);
                                            // We don't auto-close, let them review first
                                        }
                                    }

                                } catch (err) {
                                    console.error(err);
                                    setPopup({ type: 'error', message: 'Failed to submit results. Please try again.', isOpen: true });
                                }
                            }}
                            className={`bg-blue-600 text-white px-8 py-2.5 rounded-xl font-bold hover:bg-blue-700 shadow-lg hover:shadow-blue-500/30 transition-all transform active:scale-95 ${showFeedback ? 'hidden' : ''}`}
                        >
                            Submit Results
                        </button>

                        {/* Feedback Actions */}
                        {showFeedback && (
                            <div className="flex flex-col md:flex-row items-center gap-4 w-full md:w-auto">
                                <div className={`px-4 py-2 rounded-lg font-bold text-sm ${lastScore >= 80 ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                                    Nilai Anda: {lastScore} / 100
                                </div>
                                {lastScore < 80 ? (
                                    <button
                                        onClick={() => {
                                            // Retry Flow
                                            setQuizAnswers({});
                                            setShowFeedback(false);
                                            // Keep activeQuiz open
                                        }}
                                        className="bg-amber-500 text-white px-8 py-2.5 rounded-xl font-bold hover:bg-amber-600 shadow-lg"
                                    >
                                        Retry Quiz
                                    </button>
                                ) : (
                                    <button
                                        onClick={() => {
                                            // Close and Proceed
                                            setShowFeedback(false);
                                            setActiveQuiz(undefined);
                                            // If final assessment passed, just close. No certificate.
                                        }}
                                        className="bg-green-600 text-white px-8 py-2.5 rounded-xl font-bold hover:bg-green-700 shadow-lg"
                                    >
                                        Lanjutkan
                                    </button>
                                )}
                            </div>
                        )}
                    </div>
                </div>
            </div>
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
                    <div className="flex items-center gap-4">
                        {/* Progress bar removed as requested */}
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
                                    {activeModule?.quiz && activeModule.id ? (
                                        // If module has quiz, render Quiz Button first if not passed
                                        (quizResults[activeModule.id] >= 80 || activeModule.completed) ? (
                                            <div className="flex gap-2">
                                                <span className="bg-green-100 text-green-700 px-4 py-3 rounded-xl font-bold flex items-center gap-2">
                                                    <CheckCircle size={20} /> Lulus {quizResults[activeModule.id] ? `: ${quizResults[activeModule.id]}%` : ''}
                                                </span>
                                                {/* Logic Change: Finish Button needed here too */}
                                                <button
                                                    onClick={async () => {
                                                        if (!activeCourse || !activeModule) return;
                                                        try {
                                                            // Same completion logic as video-only modules
                                                            const res = await fetch(`${API_BASE_URL}/api/progress/complete`, {
                                                                method: 'POST',
                                                                headers: { 'Content-Type': 'application/json' },
                                                                body: JSON.stringify({ userId, employee_id: user.employee_id, courseId: activeCourse.id, moduleId: activeModule.id })
                                                            });

                                                            if (!res.ok) {
                                                                setPopup({ type: 'error', message: 'Gagal menyimpan progres. Silakan coba lagi.', isOpen: true });
                                                                return;
                                                            }

                                                            const updatedCourse = { ...activeCourse };
                                                            // Mark current completed
                                                            updatedCourse.modules = updatedCourse.modules.map(m => m.id === activeModule.id ? { ...m, completed: true } : m);
                                                            // Unlock next
                                                            const currentIndex = updatedCourse.modules.findIndex(m => m.id === activeModule.id);
                                                            const nextModule = updatedCourse.modules[currentIndex + 1];
                                                            if (nextModule) {
                                                                updatedCourse.modules = updatedCourse.modules.map(m => m.id === nextModule.id ? { ...m, locked: false } : m);
                                                            }
                                                            // Recalculate Progress
                                                            const completedCount = updatedCourse.modules.filter(m => m.completed).length;
                                                            updatedCourse.progress = Math.round((completedCount / updatedCourse.modules.length) * 100);

                                                            setCourses(prev => prev.map(c => c.id === updatedCourse.id ? updatedCourse : c));
                                                            setActiveCourse(updatedCourse);

                                                            if (nextModule) {
                                                                setActiveModuleId(nextModule.id);
                                                            } else {
                                                                setPopup({ type: 'success', message: 'Modul Selesai!', isOpen: true });
                                                            }
                                                        } catch {
                                                            setPopup({ type: 'error', message: 'Error saving progress', isOpen: true });
                                                        }

                                                    }}
                                                    className="bg-green-600 text-white px-6 py-3 rounded-xl font-bold hover:bg-green-500 shadow-lg flex items-center gap-2 animate-pulse"
                                                >
                                                    Selesai & Lanjut <ChevronRight size={18} />
                                                </button>
                                            </div>
                                        ) : loadingResults ? (
                                            <button disabled className="bg-slate-300 text-slate-500 px-6 py-3 rounded-xl font-bold shadow-sm flex items-center gap-2 cursor-wait">
                                                <div className="w-5 h-5 border-2 border-slate-500 border-t-transparent rounded-full animate-spin"></div>
                                                Checking Status...
                                            </button>
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
                                        <>
                                            {(!isVideoCompleted && activeModule && !activeModule.completed) ? (
                                                <button
                                                    disabled={true}
                                                    className="px-6 py-3 rounded-xl font-bold bg-slate-700 text-slate-400 cursor-not-allowed flex items-center gap-2"
                                                >
                                                    <Lock size={18} /> Tonton sampai selesai
                                                </button>
                                            ) : (
                                                <div className="flex gap-2">
                                                    <button
                                                        onClick={() => {
                                                            if (playerRef.current && playerRef.current.loadVideoById && activeModule?.videoId) {
                                                                playerRef.current.loadVideoById({
                                                                    videoId: activeModule.videoId,
                                                                    startSeconds: 0
                                                                });
                                                                setIsVideoCompleted(false);
                                                            } else if (playerRef.current && playerRef.current.seekTo) {
                                                                playerRef.current.seekTo(0, true);
                                                                playerRef.current.playVideo();
                                                                setIsVideoCompleted(false);
                                                            }
                                                        }}
                                                        className="px-6 py-3 rounded-xl font-bold bg-slate-100 text-slate-600 hover:bg-slate-200 transition-all flex items-center gap-2"
                                                    >
                                                        <PlayCircle size={20} /> Putar Ulang
                                                    </button>
                                                    <button
                                                        onClick={async () => {
                                                            if (!activeCourse || !activeModule) return;

                                                            // STRICT CHECK: If module has a quiz, we CANNOT complete it here.
                                                            // It must be completed via quiz submission.
                                                            if (activeModule.quiz) {
                                                                setPopup({ type: 'error', message: 'Anda harus menyelesaikan kuis untuk melanjutkan!', isOpen: true });
                                                                return;
                                                            }

                                                            try {
                                                                // 1. Call API
                                                                const res = await fetch(`${API_BASE_URL}/api/progress/complete`, {
                                                                    method: 'POST',
                                                                    headers: { 'Content-Type': 'application/json' },
                                                                    body: JSON.stringify({ userId, employee_id: user.employee_id, courseId: activeCourse.id, moduleId: activeModule.id })
                                                                });

                                                                if (!res.ok) {
                                                                    setPopup({ type: 'error', message: 'Gagal menyimpan progres. Silakan coba lagi.', isOpen: true });
                                                                    return;
                                                                }

                                                                // 2. Optimistic Update
                                                                const updatedCourse = { ...activeCourse };

                                                                // Mark current completed
                                                                updatedCourse.modules = updatedCourse.modules.map(m =>
                                                                    m.id === activeModule.id ? { ...m, completed: true } : m
                                                                );

                                                                // Unlock next
                                                                const currentIndex = updatedCourse.modules.findIndex(m => m.id === activeModule.id);
                                                                const nextModule = updatedCourse.modules[currentIndex + 1];

                                                                if (nextModule) {
                                                                    updatedCourse.modules = updatedCourse.modules.map(m =>
                                                                        m.id === nextModule.id ? { ...m, locked: false } : m
                                                                    );
                                                                }

                                                                // Recalculate Progress
                                                                const completedCount = updatedCourse.modules.filter(m => m.completed).length;
                                                                updatedCourse.progress = Math.round((completedCount / updatedCourse.modules.length) * 100);

                                                                setCourses(prev => prev.map(c => c.id === updatedCourse.id ? updatedCourse : c));
                                                                setActiveCourse(updatedCourse);

                                                                if (nextModule) {
                                                                    setActiveModuleId(nextModule.id);
                                                                } else {
                                                                    setPopup({ type: 'success', message: 'Modul Selesai!', isOpen: true });
                                                                }
                                                            } catch {
                                                                setPopup({ type: 'error', message: 'Error saving progress', isOpen: true });
                                                            }
                                                        }}
                                                        className="px-6 py-3 rounded-xl font-bold shadow-lg transition-all flex items-center gap-2 bg-green-600 text-white hover:bg-green-500 hover:shadow-green-500/20 group"
                                                    >
                                                        <CheckCircle size={20} className="group-hover:scale-110 transition-transform" /> Selesai & Lanjut
                                                    </button>
                                                </div>
                                            )}
                                        </>
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
                            {activeCourse.modules.filter(m => m.completed).length} / {activeCourse.modules.length} Materi Selesai
                        </p>
                    </div>

                    <div className="flex-1 overflow-y-auto">
                        <div className="p-4 space-y-2">
                            {(activeCourse.modules || []).map((mod, idx) => {
                                const isActive = mod.id === activeModuleId;
                                const isLocked = mod.locked;
                                const isCompleted = mod.completed;

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
                                        <div className={`mt-0.5 shrink-0 w-6 h-6 rounded-full flex items-center justify-center border transition-colors
                                            ${isCompleted
                                                ? 'bg-green-500 border-green-500 text-white'
                                                : isActive
                                                    ? 'bg-blue-500 border-blue-500 text-white'
                                                    : 'border-slate-300 text-slate-400'}
                                        `}>
                                            {isCompleted ? (
                                                <CheckCircle size={14} />
                                            ) : isLocked ? (
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

                    {/* Assessment & Finish Button */}
                    {activeCourse.assessment && (
                        <div className="p-4 pt-0 space-y-3">
                            {/* State 1: Ready to take Assessment */}
                            {(!assessmentScore || assessmentScore < 80) ? (
                                <button
                                    onClick={() => {
                                        if (activeCourse.progress < 100) {
                                            setPopup({ type: 'error', message: 'Anda harus menyelesaikan semua materi video & quiz sebelum mengambil Final Assessment.', isOpen: true });
                                            return;
                                        }
                                        if (activeCourse.assessment) {
                                            setActiveQuiz({ quiz: activeCourse.assessment, moduleId: undefined });
                                        }
                                    }}
                                    disabled={activeCourse.progress < 100}
                                    className={`w-full p-4 rounded-xl flex items-center gap-4 text-left transition-all border-2 border-dashed
                                            ${activeCourse.progress >= 100
                                            ? 'border-indigo-400 bg-indigo-50 hover:bg-indigo-100 cursor-pointer shadow-sm animate-pulse'
                                            : 'border-slate-200 bg-slate-50 cursor-not-allowed opacity-60'}
                                        `}
                                >
                                    <div className={`w-10 h-10 shrink-0 rounded-full flex items-center justify-center ${activeCourse.progress >= 100 ? 'bg-indigo-600 text-white' : 'bg-slate-200 text-slate-400'}`}>
                                        <Award size={20} />
                                    </div>
                                    <div>
                                        <p className={`font-bold ${activeCourse.progress >= 100 ? 'text-indigo-900' : 'text-slate-500'}`}>Final Assessment (Ujian Akhir)</p>
                                        <p className="text-xs text-slate-400">
                                            {activeCourse.progress >= 100
                                                ? 'Klik untuk Mulai'
                                                : 'Selesaikan semua materi untuk membuka'}
                                        </p>
                                    </div>
                                </button>
                            ) : (
                                // State 2: Assessment Passed
                                <div className="w-full p-4 rounded-xl flex items-center gap-4 text-left border-2 border-green-200 bg-green-50">
                                    <div className="w-10 h-10 shrink-0 rounded-full flex items-center justify-center bg-green-600 text-white">
                                        <CheckCircle size={20} />
                                    </div>
                                    <div>
                                        <p className="font-bold text-green-900">Final Assessment Selesai</p>
                                        <p className="text-xs text-green-700">
                                            Nilai Akhir: {assessmentScore} / 100. Anda telah lulus kursus ini.
                                        </p>
                                    </div>
                                </div>
                            )}

                            {/* State 3: Finish Course (Enabled after Passing) */}
                            {assessmentScore !== null && assessmentScore >= 80 && (
                                <button
                                    onClick={() => {
                                        setPopup({ type: 'success', message: 'Selamat! Anda telah menyelesaikan seluruh modul kursus ini.', isOpen: true });
                                        handleBackToList();
                                    }}
                                    className="w-full p-4 rounded-xl flex items-center justify-center gap-2 font-bold text-white shadow-lg transition-all bg-green-600 hover:bg-green-700 hover:shadow-green-500/30"
                                >
                                    <CheckCircle size={20} />
                                    Selesaikan Kursus
                                </button>
                            )}
                        </div>
                    )}
                </div>
            </div>




            <PopupNotification
                isOpen={popup.isOpen}
                type={popup.type}
                message={popup.message}
                onClose={() => {
                    setPopup(prev => ({ ...prev, isOpen: false }));
                    if (popup.message === 'Modul Selesai!') {
                        handleBackToList();
                    }
                }}
            />
        </div>
    );
};



export default CoursePlayer;
