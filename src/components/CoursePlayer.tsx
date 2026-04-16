import { useState, useEffect, useRef } from 'react';
import { PlayCircle, Lock, ChevronRight, BookOpen, ArrowLeft, X, Clock, CheckCircle, Award, AlertCircle } from 'lucide-react';
import { API_BASE_URL } from '../config';
import type { Course, Quiz, User } from '../types';
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
    const [activeQuiz, setActiveQuiz] = useState<{ quiz: Quiz; moduleId?: number; type: 'PRE' | 'POST' } | undefined>(undefined);
    const [quizAnswers, setQuizAnswers] = useState<Record<number, number>>({});
    const [quizResults, setQuizResults] = useState<Record<number, number>>({}); // moduleId -> score (POST)
    const [preQuizResults, setPreQuizResults] = useState<Record<number, number>>({}); // moduleId -> score (PRE)
    const [assessmentScore, setAssessmentScore] = useState<number | null>(null);
    const [preAssessmentScore, setPreAssessmentScore] = useState<number | null>(null);

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
                        const completedIds = (progressData.completedModuleIds || []).filter(id => id !== null && id !== undefined);

                        // Check Assessment Status from Quiz Results
                        let isAssessmentPassed = false;
                        let preScore: number | null = null;
                        try {
                            const quizData = await quizRes.json();
                            if (Array.isArray(quizData)) {
                                // IMPORTANT: Only POST tests (Final Evaluation) count towards completion.
                                isAssessmentPassed = quizData.some((r: any) => 
                                    !r.moduleId && 
                                    r.score >= 80 && 
                                    (r.quizType === 'POST' || r.quiz_type === 'POST' || !r.quizType)
                                );
                                
                                // Find Pre-Test score for course level
                                const preResults = quizData.filter((r: any) => !r.moduleId && (r.quizType === 'PRE' || r.quiz_type === 'PRE'));
                                if (preResults.length > 0) {
                                    preScore = Math.max(...preResults.map((r: any) => r.score));
                                }
                            }
                        } catch (e) {
                            console.warn("Failed to parse quiz results", e);
                        }

                        // Save module progress map to state if active course
                        if (activeCourse?.id === course.id) {
                            setModuleProgress(progressData.moduleProgress || {});
                        }

                        // Calculate progress percentage
                        const totalModules = Array.isArray(course.modules) ? course.modules.length : 0;
                        const uniqueCompletedCount = Array.isArray(course.modules) 
                            ? course.modules.filter(m => completedIds.some(id => String(id) === String(m.id))).length
                            : 0;
                        // Progress calculation
                        const hasAssessment = !!course.assessment;
                        let progress = 0;
                        
                        if (totalModules > 0) {
                            const videoProgress = (uniqueCompletedCount / totalModules) * 100;
                            
                            if (hasAssessment) {
                                // If there is an assessment, videos count for 90%, assessment for 10%
                                if (isAssessmentPassed) {
                                    progress = 100;
                                } else {
                                    // Max 90% if videos all done but assessment not
                                    progress = Math.min(90, Math.round(videoProgress * 0.9));
                                }
                            } else {
                                // Video only course
                                progress = Math.min(100, Math.round(videoProgress));
                            }
                        }


                        // Unlock modules based on completion
                        // Simple rule: If module N is done, N+1 is unlocked. 
                        // First module always unlocked.
                        const modules = Array.isArray(course.modules) ? course.modules.map((m, idx) => {
                            // Previous module completed?
                            const prevMod = course.modules[idx - 1];
                            // Check if previous module is in completedIds (using String)
                            const prevCompleted = prevMod && completedIds.some((id) => String(id) === String(prevMod.id));

                            const isLocked = idx === 0 ? false : (prevMod && !prevCompleted);
                            const isCompleted = completedIds.some((id) => String(id) === String(m.id));

                            return { ...m, locked: isLocked, completed: isCompleted };
                        }) : [];

                        return { ...course, progress, modules, isAssessmentPassed, preScore } as Course & { preScore: number | null };
                    } catch (err) {
                        console.error(`Error syncing progress for course ${course.id}:`, err);
                        return { ...course, progress: 0, preScore: null };
                    }
                }));

                setCourses(coursesWithProgress);
                setLoadingResults(false);
            } catch (error) {
                console.error("Failed to load courses:", error);
                setLoadingResults(false);
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
                const postMap: Record<number, number> = {};
                const preMap: Record<number, number> = {};
                let maxAssessmentScore = 0;
                let maxPreAssessmentScore = 0;
                let hasAssessment = false;
                let hasPreAssessment = false;

                console.log("[PLAYER] FetchResults Raw:", results.length, "items");
                results.forEach((r: any) => {
                    const qType = r.quizType || 'POST';
                    if (r.moduleId) {
                        if (qType === 'POST') {
                            const existing = postMap[r.moduleId] || 0;
                            if (r.score > existing) postMap[r.moduleId] = r.score;
                        } else {
                            const existing = preMap[r.moduleId] || 0;
                            if (r.score > existing) preMap[r.moduleId] = r.score;
                        }
                    } else {
                        // This is final assessment
                        if (qType === 'POST') {
                            hasAssessment = true;
                            if (r.score > maxAssessmentScore) maxAssessmentScore = r.score;
                        } else {
                            hasPreAssessment = true;
                            if (r.score > maxPreAssessmentScore) maxPreAssessmentScore = r.score;
                        }
                    }
                });
                console.log("[PLAYER] Mapped results:", { preMap, postMap, hasPreAssessment, hasAssessment });
                setQuizResults(postMap);
                setPreQuizResults(preMap);
                
                if (hasPreAssessment) setPreAssessmentScore(maxPreAssessmentScore);
                else setPreAssessmentScore(null);

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

        // NEW: PRE-TEST BLOCK (Completion required, passing not mandatory)
        if (loadingResults) return; // Wait until we know for sure if pre-test was taken

        // BLOCK: If any PRE-TEST is active (either course-level or module-level), STOP.
        if (activeQuiz && activeQuiz.type === 'PRE') {
            if (playerRef.current && (playerRef.current as any).pauseVideo) {
                try { (playerRef.current as any).pauseVideo(); } catch (e) { console.warn(e); }
            }
            return;
        }

        // Module-level Pre-Test Removed


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
                        setActiveQuiz({ quiz: activeModule.quiz, moduleId: activeModule.id, type: 'POST' });
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
                                        setActiveQuiz({ quiz: activeModule.quiz, moduleId: activeModule.id, type: 'POST' });
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
    }, [activeModuleId, activeModule, activeCourse, viewMode, quizResults, preQuizResults, activeQuiz, userId, moduleProgress]);
    // Simplified dependencies but included necessary ones for closure correctness

    // Custom Controls Handlers


    const handleStartCourse = (course: Course) => {
        if (!course) return;
        const c = course as Course & { preScore?: number | null };

        // Safety: If course is empty
        if ((!c.modules || c.modules.length === 0) && !c.preAssessment) {
            setPopup({ type: 'error', message: 'Kursus ini belum memiliki materi atau modul.', isOpen: true });
            return;
        }

        // Set state to enter player view
        setViewMode('player');
        setActiveCourse(c);

        // Check for Course Pre-Assessment
        console.log("[PLAYER] handleStartCourse check:", { id: c.id, hasPre: !!c.preAssessment, preScore: c.preScore });
        
        if (!loadingResults && c.preAssessment && (c.preScore === undefined || c.preScore === null)) {
            setActiveQuiz({ quiz: c.preAssessment, moduleId: undefined, type: 'PRE' });
            if (c.modules?.length > 0) setActiveModuleId(c.modules[0].id);
            return;
        }

        // Pre-fill score if already taken
        if (c.preScore !== undefined && c.preScore !== null) {
            setPreAssessmentScore(c.preScore);
        }
        
        // Start from first incomplete module or auto-open assessment
        if (Array.isArray(c.modules) && c.modules.length > 0) {
            const incompleteModule = c.modules.find(m => !m.completed);
            
            // If all modules done, but final assessment exists and not passed yet
            if (!incompleteModule && c.assessment && !(c as any).isAssessmentPassed) {
                setActiveQuiz({ quiz: c.assessment, moduleId: undefined, type: 'POST' });
                // Still set a module ID to maintain UI context behind the overlay
                setActiveModuleId(c.modules[c.modules.length - 1].id);
                return;
            }

            const targetModule = incompleteModule || c.modules[0];
            if (targetModule && targetModule.id) {
                setActiveModuleId(targetModule.id);
            }
        }
    };

    const handleBackToList = () => {
        setViewMode('list');
        setActiveCourse(null);
        setActiveModuleId(undefined);
        setActiveQuiz(undefined);
        setQuizAnswers({});
        setShowFeedback(false);
        setIsVideoCompleted(false);
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
                                        className={`w-full md:w-auto whitespace-nowrap px-8 py-3.5 rounded-xl font-bold transition-all duration-300 flex items-center justify-center gap-2 
                                            ${course.progress === 100
                                                ? 'bg-green-600 text-white hover:bg-green-700 shadow-lg hover:shadow-green-500/20'
                                                : (course.progress > 0 || (course as any).preScore !== null)
                                                    ? 'bg-amber-500 text-white hover:bg-amber-600 hover:shadow-amber-500/30'
                                                    : 'bg-slate-900 text-white hover:bg-blue-600 hover:shadow-blue-500/30 group-hover:translate-x-1 shadow-lg'
                                            }`}
                                    >
                                        {course.progress === 100 ? (
                                            <>
                                                Lihat Materi <CheckCircle size={18} />
                                            </>
                                        ) : (course.progress > 0 || (course as any).preScore !== null) ? (
                                            <>
                                                Lanjutkan Belajar <ChevronRight size={18} />
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

    const handleCompleteActiveModule = async (courseToUse = activeCourse, moduleToUse = activeModule) => {
        if (!courseToUse || !moduleToUse) return;

        try {
            const res = await fetch(`${API_BASE_URL}/api/progress/complete`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    userId, 
                    employee_id: user.employee_id, 
                    courseId: courseToUse.id, 
                    moduleId: moduleToUse.id 
                })
            });

            if (!res.ok) {
                const errorData = await res.json().catch(() => ({}));
                setPopup({ type: 'error', message: errorData.error || 'Gagal menyimpan progres.', isOpen: true });
                return;
            }

            const updatedCourse = { ...courseToUse };
            updatedCourse.modules = updatedCourse.modules.map(m =>
                m.id === moduleToUse.id ? { ...m, completed: true } : m
            );

            const currentIndex = updatedCourse.modules.findIndex(m => m.id === moduleToUse.id);
            const nextModule = updatedCourse.modules[currentIndex + 1];

            if (nextModule) {
                updatedCourse.modules = updatedCourse.modules.map(m =>
                    m.id === nextModule.id ? { ...m, locked: false } : m
                );
            }

            const completedCount = updatedCourse.modules.filter(m => m.completed).length;
            updatedCourse.progress = Math.round((completedCount / updatedCourse.modules.length) * 100);

            setCourses(prev => prev.map(c => c.id === updatedCourse.id ? updatedCourse : c));
            setActiveCourse(updatedCourse);

            if (nextModule) {
                setActiveModuleId(nextModule.id);
                setIsVideoCompleted(false); // Reset video state for next module
            } else {
                // Last module finished
                if (updatedCourse.assessment) {
                    setPopup({ 
                        type: 'success', 
                        message: 'Seluruh materi video telah selesai! Silakan lanjut ke Final Assessment (Evaluasi Akhir).', 
                        isOpen: true 
                    });
                } else {
                    setPopup({ type: 'success', message: 'Semua materi telah selesai!', isOpen: true });
                }
            }
        } catch (err) {
            console.error("Completion error", err);
            setPopup({ type: 'error', message: 'Error saving progress', isOpen: true });
        }
    };



    // --- Quiz Modal (Student) ---
    // --- Quiz Modal (Student) ---
    // Render Quiz as Overlay instead of full component replacement to keep Player DOM alive
    const renderQuizOverlay = () => {
        if (!activeQuiz) return null;
        
        const { quiz, moduleId, type: qType } = activeQuiz;

        return (
            <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-md overflow-y-auto animate-in fade-in duration-200">
                <div className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[90vh] ring-1 ring-white/20">
                    <div className="p-6 md:p-8 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
                        <div>
                            <span className="text-xs font-bold text-blue-600 tracking-wider uppercase mb-1 block">
                                {qType === 'PRE' ? 'Pre-Test' : (moduleId ? 'Kuis Materi' : 'Final Assessment')}
                            </span>
                            <h2 className="font-bold text-2xl text-slate-900">{quiz.title}</h2>
                        </div>
                        <button 
                            onClick={handleBackToList} 
                            className="p-2 rounded-full hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors"
                        >
                            <X size={24} />
                        </button>
                    </div>

                    <div className="p-6 md:p-8 overflow-y-auto space-y-8">
                        {Array.isArray(quiz.questions) && quiz.questions.map((q, qIdx) => (
                            <div key={q.id || qIdx} className="space-y-4">
                                <p className="font-semibold text-lg text-slate-900 leading-relaxed">
                                    <span className="text-slate-900/40 mr-2">{qIdx + 1}.</span> {q.question}
                                </p>
                                <div className="space-y-3 pl-0 md:pl-6">
                                    {Array.isArray(q.options) && q.options.map((opt, optIdx) => {
                                        const isSelected = quizAnswers[q.id || qIdx] === optIdx;
                                        let feedbackClass = '';
                                        if (showFeedback) {
                                            if (lastScore >= 80 || qType === 'PRE') {
                                                if (q.correctAnswer === optIdx) feedbackClass = 'bg-green-100 border-green-500 text-green-900 ring-1 ring-green-500';
                                                else if (isSelected) feedbackClass = 'bg-red-50 border-red-300 text-red-800 ring-1 ring-red-300';
                                            } else if (isSelected) {
                                                feedbackClass = 'bg-red-50 border-red-300 text-red-800 ring-1 ring-red-300';
                                            }
                                        }

                                        return (
                                            <label key={optIdx} className={`group flex items-center gap-4 p-4 rounded-xl border cursor-pointer transition-all ${feedbackClass || (isSelected ? 'border-blue-500 bg-blue-50 text-blue-900 ring-1 ring-blue-500' : 'border-slate-200 hover:border-blue-300 hover:bg-slate-50 text-slate-700')}`}>
                                                <input
                                                    type="radio"
                                                    checked={isSelected}
                                                    onChange={() => !showFeedback && setQuizAnswers(prev => ({ ...prev, [q.id || qIdx]: optIdx }))}
                                                    className="w-4 h-4 text-blue-600"
                                                />
                                                <span className="font-medium flex-1">{opt}</span>
                                                {showFeedback && q.correctAnswer === optIdx && <CheckCircle size={18} className="text-green-600" />}
                                            </label>
                                        );
                                    })}
                                </div>
                            </div>
                        ))}
                    </div>

                    <div className="p-6 md:p-8 border-t border-slate-100 bg-slate-50 flex flex-col md:flex-row items-center justify-between gap-4">
                        {showFeedback ? (
                            <div className="flex items-center gap-4 flex-1 justify-between w-full">
                                <div className={`px-4 py-2 rounded-lg font-bold text-sm ${lastScore >= 80 || qType === 'PRE' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                                    Nilai: {lastScore} / 100
                                </div>
                                <button
                                    onClick={() => {
                                        if (lastScore < 80 && qType === 'POST') {
                                            setShowFeedback(false);
                                            setQuizAnswers({});
                                        } else {
                                            setShowFeedback(false);
                                            setActiveQuiz(undefined);
                                            setQuizAnswers({});
                                            
                                            // AUTO-NEXT: If passed module quiz, complete it automatically
                                            if (lastScore >= 80 && qType === 'POST' && moduleId) {
                                                handleCompleteActiveModule();
                                            }
                                        }
                                    }}
                                    className="bg-slate-900 text-white px-8 py-2.5 rounded-xl font-bold hover:bg-blue-600 transition-colors shadow-lg"
                                >
                                    {lastScore < 80 && qType === 'POST' ? 'Coba Lagi' : 'Lanjutkan'}
                                </button>
                            </div>
                        ) : (
                            <button
                                onClick={async () => {
                                    if (Object.keys(quizAnswers).length < quiz.questions.length) {
                                        setPopup({ type: 'error', message: 'Harap jawab semua pertanyaan!', isOpen: true });
                                        return;
                                    }
                                    
                                    let correct = 0;
                                    quiz.questions.forEach((q, idx) => {
                                        if (quizAnswers[q.id || idx] === q.correctAnswer) correct++;
                                    });
                                    const score = Math.round((correct / quiz.questions.length) * 100);
                                    setLastScore(score);

                                    try {
                                        const res = await fetch(`${API_BASE_URL}/api/quiz/submit`, {
                                            method: 'POST',
                                            headers: { 'Content-Type': 'application/json' },
                                            body: JSON.stringify({
                                                studentId: user.id || userId,
                                                employee_id: user.employee_id,
                                                studentName: user.name,
                                                courseId: activeCourse?.id,
                                                moduleId: moduleId || null,
                                                score,
                                                quizType: qType
                                            })
                                        });

                                        if (!res.ok) throw new Error();
                                        
                                        setShowFeedback(true);
                                        if (qType === 'POST') {
                                            if (moduleId) {
                                                setQuizResults(prev => ({ ...prev, [moduleId]: score }));
                                            } else {
                                                setAssessmentScore(score);
                                            }
                                        } else {
                                            if (moduleId) {
                                                setPreQuizResults(prev => ({ ...prev, [moduleId]: score }));
                                            } else {
                                                setPreAssessmentScore(score);
                                            }
                                        }
                                    } catch {
                                        setPopup({ type: 'error', message: 'Gagal mengirim nilai.', isOpen: true });
                                    }
                                }}
                                className="w-full bg-blue-600 text-white px-8 py-3 rounded-xl font-bold hover:bg-blue-700 transition-all shadow-lg"
                            >
                                Submit Jawaban
                            </button>
                        )}
                    </div>
                </div>
            </div>
        );
    };

    // --- Player View ---
    if (!activeCourse) return null;

    return (
        <div className="flex flex-col h-[calc(100vh-80px)] bg-slate-900">
            {/* Header */}
            <div className="bg-slate-900 border-b border-slate-800 p-4 flex items-center justify-between z-20 shadow-md">
                <div className="flex items-center gap-4">
                    <button onClick={handleBackToList} className="p-2 hover:bg-slate-800 rounded-full text-slate-400 hover:text-white transition-colors">
                        <ArrowLeft size={24} />
                    </button>
                    <h2 className="font-bold text-lg text-white tracking-wide">{activeCourse.title}</h2>
                </div>
            </div>

            <div className="flex flex-col lg:flex-row flex-1 overflow-hidden">
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
                                    <div className="flex-1">
                                        <h1 className="text-2xl font-bold text-white mb-2">{activeModule?.title || "Judul Materi"}</h1>
                                        <div className="flex items-center gap-4 text-white/60 text-sm">
                                            <div className="flex items-center gap-1.5 bg-white/10 px-3 py-1 rounded-full backdrop-blur-md">
                                                <Clock size={14} /> {activeModule?.duration || "00:00"}
                                            </div>
                                        </div>
                                    </div>
                                    <p className="text-slate-400 leading-relaxed max-w-2xl mt-4">
                                        Master this module to advance your skills. Watch the video completely to unlock the next steps.
                                    </p>
                                </div>
                                <div className="flex gap-3">
                                    {/* Control Buttons */}
                                    {activeModule?.quiz && activeModule.id ? (
                                        // If module has quiz, render Quiz Button first if not passed
                                        (quizResults[activeModule.id] >= 80 || activeModule.completed) ? (
                                            <div className="flex flex-col md:flex-row items-center gap-4">
                                                <span className="bg-green-100 text-green-700 px-4 py-3 rounded-xl font-bold flex items-center gap-2">
                                                    <CheckCircle size={20} /> Lulus {quizResults[activeModule.id] ? `: ${quizResults[activeModule.id]}%` : ''}
                                                </span>
                                                {!activeModule.completed && (
                                                    <button
                                                        onClick={() => handleCompleteActiveModule()}
                                                        className="bg-green-600 text-white px-6 py-3 rounded-xl font-bold hover:bg-green-700 shadow-lg flex items-center gap-2 transition-all hover:scale-105"
                                                    >
                                                        Selesai & Lanjut <ChevronRight size={18} />
                                                    </button>
                                                )}
                                            </div>
                                        ) : loadingResults ? (
                                            <button disabled className="bg-slate-300 text-slate-500 px-6 py-3 rounded-xl font-bold shadow-sm flex items-center gap-2 cursor-wait">
                                                <div className="w-5 h-5 border-2 border-slate-500 border-t-transparent rounded-full animate-spin"></div>
                                                Checking Status...
                                            </button>
                                        ) : (
                                            <div className="flex flex-col items-end gap-2">
                                                <button
                                                    disabled={!isVideoCompleted && !activeModule.completed}
                                                    onClick={() => setActiveQuiz({ quiz: activeModule.quiz!, moduleId: activeModule.id, type: 'POST' })}
                                                    className={`px-8 py-3 rounded-xl font-bold shadow-lg transition-all flex items-center gap-2 ${(!isVideoCompleted && !activeModule.completed) ? 'bg-slate-300 text-slate-500 cursor-not-allowed' : 'bg-blue-600 text-white hover:bg-blue-500 animate-pulse'}`}
                                                >
                                                    {(!isVideoCompleted && !activeModule.completed) && <Lock size={18} />} Kerjakan Quiz ({activeModule.quiz.questions.length} Soal)
                                                </button>
                                                {(!isVideoCompleted && !activeModule.completed) && (
                                                    <span className="text-amber-600 text-sm font-medium flex items-center gap-1">
                                                        <AlertCircle size={14} /> Tonton video sampai akhir untuk membuka Kuis
                                                    </span>
                                                )}
                                            </div>
                                        )
                                    ) : (
                                        <>
                                            {(() => {
                                                const hasPassedQuiz = activeModule?.quiz && activeModule.quiz.questions.length > 0 && (quizResults[activeModule.id] || 0) >= 80;
                                                const isAllowed = isVideoCompleted || hasPassedQuiz || activeModule?.completed;
                                                
                                                if (!isAllowed) {
                                                    return (
                                                        <button
                                                            disabled={true}
                                                            className="px-6 py-3 rounded-xl font-bold bg-slate-700 text-slate-400 cursor-not-allowed flex items-center gap-2"
                                                        >
                                                            <Lock size={18} /> Tonton sampai selesai
                                                        </button>
                                                    );
                                                }
                                                return null;
                                            })()}
                                            {(isVideoCompleted || (activeModule?.quiz && activeModule.quiz.questions.length > 0 && (quizResults[activeModule.id] || 0) >= 80) || activeModule?.completed) && !activeModule?.completed && (

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
                                                    {activeModule?.quiz && activeModule.quiz.questions && activeModule.quiz.questions.length > 0 && activeModule.id && (!quizResults[activeModule.id] || quizResults[activeModule.id] < 80) ? (
                                                        <button
                                                            onClick={() => { if (activeModule) setActiveQuiz({ quiz: activeModule.quiz!, moduleId: activeModule.id, type: 'POST' }); }}
                                                            className="flex items-center gap-2 px-6 py-3 rounded-xl bg-blue-600 text-white font-bold hover:bg-blue-700 transition-all shadow-lg group"
                                                        >
                                                            <BookOpen size={20} className="group-hover:scale-110 transition-transform" /> Mulai Kuis Materi
                                                        </button>
                                                    ) : (
                                                        <button
                                                            onClick={() => handleCompleteActiveModule()}
                                                            className="px-6 py-3 rounded-xl font-bold shadow-lg transition-all flex items-center gap-2 bg-green-600 text-white hover:bg-green-500 hover:shadow-green-500/20 group"
                                                        >
                                                            <CheckCircle size={20} className="group-hover:scale-110 transition-transform" /> Selesai & Lanjut
                                                        </button>
                                                    )}
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
                    <div className="p-6 border-b border-slate-100 bg-white sticky top-0 font-sans">
                        <div className="flex justify-between items-start mb-1">
                            <div>
                                <h3 className="font-bold text-slate-800 text-lg">Daftar Materi</h3>
                                <p className="text-sm text-slate-400">
                                    {activeCourse.modules.filter(m => m.completed).length} / {activeCourse.modules.length} Materi Selesai
                                </p>
                            </div>
                            {activeCourse.preAssessment && preAssessmentScore !== null && (
                                <div className="text-right">
                                    <div className="text-[10px] font-bold text-amber-600 uppercase tracking-tight">Pre-Test Score</div>
                                    <div className="text-lg font-black text-amber-500">{preAssessmentScore}</div>
                                </div>
                            )}
                        </div>
                    </div>

                    <div className="flex-1 overflow-y-auto">
                        {/* Course Pre-Test (if any and not taken) */}
                        {activeCourse.preAssessment && preAssessmentScore === null && (
                            <div className="p-4 pb-0 space-y-3">
                                <button
                                    onClick={() => setActiveQuiz({ quiz: activeCourse.preAssessment!, moduleId: undefined, type: 'PRE' })}
                                    className="w-full p-4 rounded-xl flex items-center gap-4 text-left border-2 border-amber-200 bg-amber-50 hover:bg-amber-100 transition-all shadow-sm"
                                >
                                    <div className="w-10 h-10 shrink-0 rounded-full flex items-center justify-center bg-amber-600 text-white shadow-lg shadow-amber-200">
                                        <BookOpen size={20} />
                                    </div>
                                    <div className="flex-1">
                                        <p className="font-bold text-amber-900 leading-tight">Pre-Test Materi</p>
                                        <p className="text-[10px] text-amber-700 font-medium uppercase tracking-wider mt-1">WAJIB DIKERJAKAN</p>
                                    </div>
                                    <ChevronRight size={18} className="text-amber-400" />
                                </button>
                            </div>
                        )}
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
                                            <div className="flex items-center gap-3 mt-1.5">
                                                <span className="text-xs text-slate-400 flex items-center gap-1">
                                                    <Clock size={12} /> {mod.duration}
                                                </span>
                                                {mod.quiz && (
                                                    <div className={`flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider
                                                            ${quizResults[mod.id] !== undefined ? 'text-green-600' : 'text-slate-400 opacity-60'}
                                                        `}>
                                                        <BookOpen size={12} /> 
                                                        Kuis Materi{quizResults[mod.id] !== undefined ? `: ${quizResults[mod.id]}` : ''}
                                                    </div>
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
                                            setActiveQuiz({ quiz: activeCourse.assessment, moduleId: undefined, type: 'POST' });
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
                                <div className="p-4 rounded-xl flex items-center gap-4 text-left border-2 border-green-200 bg-green-50 shadow-sm">
                                    <div className="w-10 h-10 shrink-0 rounded-full flex items-center justify-center bg-green-600 text-white shadow-md">
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


                        </div>
                    )}
                </div>
            </div>




            {/* MODAL OVERLAYS */}
            {renderQuizOverlay()}
            
            <PopupNotification
                isOpen={popup.isOpen}
                type={popup.type}
                message={popup.message}
                onClose={() => {
                    setPopup(prev => ({ ...prev, isOpen: false }));
                    // If it was the final module completion message
                    if (popup.message.includes('Final Assessment')) {
                        if (activeCourse?.assessment) {
                            setActiveQuiz({ quiz: activeCourse.assessment, moduleId: undefined, type: 'POST' });
                        }
                    } else if (popup.message === 'Modul Selesai!' || popup.message === 'Semua materi telah selesai!') {
                        handleBackToList();
                    }
                }}
            />
        </div>
    );
};



export default CoursePlayer;
