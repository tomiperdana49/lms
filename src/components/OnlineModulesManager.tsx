import { useState, useEffect, useRef } from 'react';
import { Edit, Trash2, Plus, GripVertical, Save, X, BookOpen, Clock } from 'lucide-react';
import { API_BASE_URL } from '../config';
import type { Course, Module, Quiz } from '../types';
import PopupNotification from './PopupNotification';
import ConfirmationModal from './ConfirmationModal';

const QuizEditor = ({ quiz, onUpdate, onDelete, onNotify }: { quiz: Quiz | undefined, onUpdate: (q: Quiz) => void, onDelete?: () => void, onNotify?: (msg: string, type: 'success' | 'error') => void }) => {
    if (!quiz) return null;
    return (
        <div className="mt-4 space-y-4 border-l-2 border-slate-200 pl-4">
            <div className="flex justify-between items-center mb-2">
                <h4 className="font-bold text-slate-700 text-sm uppercase">Quiz Questions</h4>
                {onDelete && (
                    <button onClick={onDelete} className="text-red-500 text-xs hover:underline">Delete Quiz</button>
                )}
            </div>
            {quiz.questions.map((q, qIdx) => (
                <div key={q.id} className="bg-slate-100 p-4 rounded-xl space-y-3">
                    <div className="flex justify-between items-start gap-2">
                        <div className="flex-1">
                            <label className="text-xs font-bold text-slate-500 uppercase">Question {qIdx + 1}</label>
                            <textarea
                                value={q.question}
                                onChange={(e) => {
                                    const newQuestions = [...quiz.questions];
                                    newQuestions[qIdx].question = e.target.value;
                                    onUpdate({ ...quiz, questions: newQuestions });
                                }}
                                className="w-full mt-1 px-3 py-2 rounded-lg border border-slate-200 text-sm font-medium resize-none"
                                placeholder="Enter question here..."
                                rows={2}
                            />
                        </div>
                        <button
                            onClick={() => {
                                const newQuestions = quiz.questions.filter(qu => qu.id !== q.id);
                                onUpdate({ ...quiz, questions: newQuestions });
                            }}
                            className="text-red-400 hover:text-red-600 p-1"
                        >
                            <Trash2 size={16} />
                        </button>
                    </div>

                    <div className="space-y-2">
                        <label className="text-xs font-bold text-slate-500 uppercase">Answer Options</label>
                        {q.options.map((opt, optIdx) => (
                            <div key={optIdx} className={`flex items-center gap-2 px-3 py-2 rounded-lg border ${q.correctAnswer === optIdx ? 'bg-green-50 border-green-200 ring-1 ring-green-200' : 'bg-white border-slate-200'}`}>
                                <input
                                    type="radio"
                                    name={`correct-${q.id}`}
                                    checked={q.correctAnswer === optIdx}
                                    onChange={() => {
                                        const newQuestions = [...quiz.questions];
                                        newQuestions[qIdx].correctAnswer = optIdx;
                                        onUpdate({ ...quiz, questions: newQuestions });
                                    }}
                                    className="accent-green-600 w-4 h-4 cursor-pointer shrink-0"
                                />
                                <input
                                    value={opt}
                                    onChange={(e) => {
                                        const newQuestions = [...quiz.questions];
                                        newQuestions[qIdx].options[optIdx] = e.target.value;
                                        onUpdate({ ...quiz, questions: newQuestions });
                                    }}
                                    className="flex-1 px-3 py-1.5 rounded-md border border-slate-200 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 transition-all bg-white"
                                    placeholder={`Option ${optIdx + 1}`}
                                />
                                <button
                                    onClick={() => {
                                        const newQuestions = [...quiz.questions];
                                        if (newQuestions[qIdx].options.length <= 2) {
                                            if (onNotify) onNotify("Minimum 2 options required", 'error');
                                            else alert("Minimum 2 options required");
                                            return;
                                        }
                                        newQuestions[qIdx].options.splice(optIdx, 1);
                                        if (q.correctAnswer === optIdx) {
                                            newQuestions[qIdx].correctAnswer = 0;
                                        } else if (q.correctAnswer > optIdx) {
                                            newQuestions[qIdx].correctAnswer--;
                                        }
                                        onUpdate({ ...quiz, questions: newQuestions });
                                    }}
                                    className="text-slate-400 hover:text-red-500 p-1"
                                    title="Remove Option"
                                >
                                    <X size={14} />
                                </button>
                            </div>
                        ))}
                        <button
                            onClick={() => {
                                const newQuestions = [...quiz.questions];
                                newQuestions[qIdx].options.push('');
                                onUpdate({ ...quiz, questions: newQuestions });
                            }}
                            className="text-xs text-blue-600 font-bold hover:text-blue-800 flex items-center gap-1 mt-2 pl-1"
                        >
                            <Plus size={14} /> Add Option
                        </button>
                    </div>
                </div>
            ))}
            <button
                onClick={() => {
                    onUpdate({
                        ...quiz,
                        questions: [
                            ...quiz.questions,
                            {
                                id: Date.now(),
                                question: '',
                                options: ['', ''],
                                correctAnswer: 0
                            }
                        ]
                    });
                }}
                className="w-full py-2 border-2 border-dashed border-slate-300 rounded-xl text-slate-500 font-bold hover:border-blue-400 hover:text-blue-500 transition-colors"
            >
                + Add Question
            </button>
        </div>
    );
};

const OnlineModulesManager = () => {
    const [courses, setCourses] = useState<Course[]>([]);
    const [editingCourse, setEditingCourse] = useState<Course | null>(null);
    const editorScrollRef = useRef<HTMLDivElement>(null);

    const [popup, setPopup] = useState<{ type: 'success' | 'error', message: string, isOpen: boolean }>({
        type: 'success',
        message: '',
        isOpen: false
    });

    const [confirmConfig, setConfirmConfig] = useState<{
        isOpen: boolean;
        title: string;
        message: string;
        onConfirm: () => void;
    }>({ isOpen: false, title: '', message: '', onConfirm: () => { } });

    const openConfirm = (title: string, message: string, onConfirm: () => void) => {
        setConfirmConfig({ isOpen: true, title, message, onConfirm });
    };

    useEffect(() => {
        const fetchData = async () => {
            try {
                const resCourses = await fetch(`${API_BASE_URL}/api/courses?_t=${Date.now()}`);
                if (resCourses.ok) {
                    const coursesData = await resCourses.json();
                    setCourses(coursesData);
                }
            } catch (e) {
                console.error("Courses fetch error", e);
                setPopup({ type: 'error', message: `Failed to load courses: ${e instanceof Error ? e.message : String(e)}`, isOpen: true });
            }
        };
        fetchData();
    }, []);

    const handleDeleteCourse = (id: number) => {
        openConfirm('Delete Course', 'Are you sure you want to delete this course? This action cannot be undone.', async () => {
            try {
                await fetch(`${API_BASE_URL}/api/courses/${id}`, { method: 'DELETE' });
                setCourses(courses.filter(c => c.id !== id));
                setPopup({ type: 'success', message: 'Course deleted successfully.', isOpen: true });
            } catch (err) {
                console.error("Failed to delete course", err);
                setPopup({ type: 'error', message: 'Failed to delete course.', isOpen: true });
            }
        });
    };

    const handleAddNewCourse = () => {
        const newCourse: Course = {
            id: Date.now(),
            title: '',
            description: '',
            duration: '0 hours',
            modulesCount: 0,
            studentCount: 0,
            progress: 0,
            modules: []
        };
        setEditingCourse(newCourse);
    };

    const handleEditCourse = (course: Course) => {
        setEditingCourse(course);
    };

    const handleSaveCourse = async () => {
        if (!editingCourse) return;
        const isNew = !courses.find(c => c.id === editingCourse.id);
        try {
            // Intensive logging to verify data BEFORE stringify
            console.log("--- ATTEMPTING SAVE ---");
            console.log("Current Editing Course Title:", editingCourse.title);
            console.log("PreAssessment Object:", editingCourse.preAssessment);
            console.log("Questions Count:", editingCourse.preAssessment?.questions?.length || 0);

            const payload = JSON.stringify(editingCourse);
            console.log("FINAL JSON PAYLOAD:", payload);

            let savedCourse: Course;

            if (isNew) {
                const res = await fetch(`${API_BASE_URL}/api/courses`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: payload
                });
                if (!res.ok) {
                    const errorData = await res.json().catch(() => ({}));
                    throw new Error(errorData.error || errorData.message || 'Failed to save');
                }
                savedCourse = await res.json();
                console.log("SAVED NEW COURSE:", savedCourse);
                setCourses([...courses, savedCourse]);
            } else {
                const res = await fetch(`${API_BASE_URL}/api/courses/${editingCourse.id}`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: payload
                });
                if (!res.ok) {
                    const errorData = await res.json().catch(() => ({}));
                    throw new Error(errorData.error || errorData.message || 'Failed to update');
                }
                savedCourse = await res.json();
                console.log("SAVED UPDATED COURSE:", savedCourse);
                setCourses(courses.map(c => c.id === savedCourse.id ? savedCourse : c));
            }
            setEditingCourse(null);
            setPopup({ type: 'success', message: `Course Saved Successfully! (ID: ${savedCourse.id})`, isOpen: true });
        } catch (err) {
            console.error('Failed to save course', err);
            const msg = err instanceof Error ? err.message : 'Please check the connection.';
            setPopup({ type: 'error', message: `Failed to save course: ${msg}`, isOpen: true });
        }
    };

    const renderEditor = () => {
        if (!editingCourse) return null;
        return (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm overflow-y-auto">
                <div className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl overflow-hidden flex flex-col max-h-[90vh]">
                    <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50">
                        <div className="flex flex-col">
                            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                                {courses.find(c => c.id === editingCourse.id) ? 'Managing Module' : 'Creating Module'}
                            </span>
                            <h2 className="font-bold text-xl text-slate-800">{editingCourse.title}</h2>
                        </div>
                        <button onClick={() => setEditingCourse(null)} className="text-slate-400 hover:text-slate-600">
                            <X size={24} />
                        </button>
                    </div>

                    <div ref={editorScrollRef} className="flex-1 overflow-y-auto p-6 bg-white">
                        <div className="space-y-8">
                            <section className="space-y-4">
                                <h3 className="font-bold text-slate-700 flex items-center gap-2">
                                    <span className="w-6 h-6 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center text-xs">1</span>
                                    Basic Information
                                </h3>
                                <div className="grid grid-cols-1 gap-4">
                                    <div>
                                        <label className="block text-sm font-semibold text-slate-700 mb-1">Module Name</label>
                                        <input
                                            value={editingCourse.title}
                                            onChange={e => setEditingCourse({ ...editingCourse, title: e.target.value })}
                                            placeholder="New Untitled Course"
                                            className="w-full px-4 py-2 rounded-xl border border-slate-200 outline-none focus:ring-2 focus:ring-blue-500"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-semibold text-slate-700 mb-1">Description</label>
                                        <textarea
                                            value={editingCourse.description}
                                            onChange={e => setEditingCourse({ ...editingCourse, description: e.target.value })}
                                            rows={3}
                                            placeholder="Description here..."
                                            className="w-full px-4 py-2 rounded-xl border border-slate-200 outline-none focus:ring-2 focus:ring-blue-500"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-semibold text-slate-700 mb-1">Total Duration Label</label>
                                        <div className="relative">
                                            <input
                                                value={editingCourse.duration}
                                                onChange={e => setEditingCourse({ ...editingCourse, duration: e.target.value })}
                                                placeholder="e.g. 60 Hours of Learning"
                                                className="w-full pl-10 pr-4 py-2 rounded-xl border border-slate-200 outline-none focus:ring-2 focus:ring-blue-500"
                                            />
                                            <Clock size={16} className="absolute left-3.5 top-3 text-slate-400" />
                                        </div>
                                    </div>
                                </div>
                            </section>

                            {/* Section 2: Course Entry Pre-Test (MANDATORY START) */}
                            <section className="space-y-4 pt-6 border-t border-slate-100">
                                <h3 className="font-bold text-slate-700 flex items-center gap-2">
                                    <span className="w-6 h-6 rounded-full bg-amber-100 text-amber-600 flex items-center justify-center text-xs">2</span>
                                    Course Entry Pre-Test
                                    <span className="text-[10px] bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full ml-2 font-bold uppercase tracking-tight">Requirement Level 1</span>
                                </h3>
                                <div className="bg-amber-50/20 border border-amber-100 rounded-2xl p-6">
                                    {!editingCourse.preAssessment ? (
                                        <button
                                            onClick={() => setEditingCourse({
                                                ...editingCourse,
                                                preAssessment: { id: Date.now(), title: 'Pre-Test: ' + editingCourse.title, questions: [] }
                                            })}
                                            className="w-full py-6 border-2 border-dashed border-amber-200 rounded-2xl text-amber-500 font-bold hover:border-amber-400 hover:bg-amber-50 transition-all flex flex-col items-center justify-center gap-2"
                                        >
                                            <Plus size={24} />
                                            <span>Create Pre-Test Quiz (Mandatory before starting material)</span>
                                        </button>
                                    ) : (
                                        <div className="bg-white rounded-2xl shadow-sm border border-amber-200 overflow-hidden">
                                            <div className="px-6 py-4 bg-amber-50 border-b border-amber-100 flex justify-between items-center">
                                                <span className="font-bold text-amber-900 text-sm italic">✓ Course Entry Requirement Active</span>
                                                <button
                                                    onClick={() => {
                                                        openConfirm('Delete Pre-Test', 'Delete this entry requirement quiz?', () => {
                                                            const upd = { ...editingCourse };
                                                            delete upd.preAssessment;
                                                            setEditingCourse(upd);
                                                        });
                                                    }}
                                                    className="text-red-500 hover:text-red-700 text-xs font-bold"
                                                >
                                                    Delete Requirement
                                                </button>
                                            </div>
                                            <div className="p-4">
                                                <QuizEditor
                                                    quiz={editingCourse.preAssessment}
                                                    onUpdate={(updatedQuiz) => {
                                                        console.log("UPDATING PRE-TEST STATE:", updatedQuiz.questions.length);
                                                        setEditingCourse(prev => prev ? ({ ...prev, preAssessment: updatedQuiz }) : prev);
                                                    }}
                                                    onNotify={(msg, type) => setPopup({ isOpen: true, message: msg, type })}
                                                />
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </section>

                            <section className="space-y-4 pt-6 border-t border-slate-100">
                                <div className="flex items-center justify-between">
                                    <h3 className="font-bold text-slate-700 flex items-center gap-2">
                                        <span className="w-6 h-6 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center text-xs">3</span>
                                        Material List (Video & Module Quizzes)
                                    </h3>
                                    <button
                                        onClick={() => {
                                            const newId = Date.now();
                                            const newMod: Module = {
                                                id: newId,
                                                title: '',
                                                duration: '05:00',
                                                videoType: 'youtube',
                                                videoId: '',
                                                locked: false
                                            };
                                            setEditingCourse({
                                                ...editingCourse,
                                                modules: [...editingCourse.modules, newMod]
                                            });

                                            // Precision scroll to the specific new module
                                            setTimeout(() => {
                                                const el = document.getElementById(`module-row-${newId}`);
                                                if (el) {
                                                    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                                                    // Auto-focus the title input for immediate typing
                                                    const input = el.querySelector('input');
                                                    if (input) input.focus();
                                                }
                                            }, 150);
                                        }}
                                        className="text-sm font-bold text-blue-600 hover:text-blue-700 flex items-center gap-1"
                                    >
                                        <Plus size={16} /> Add Course
                                    </button>
                                </div>

                                <div className="space-y-3">
                                    {editingCourse.modules.map((mod, idx) => (
                                        <div 
                                            key={mod.id} 
                                            id={`module-row-${mod.id}`}
                                            className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-3 transition-all duration-300 scroll-mt-24"
                                        >
                                            <div className="flex items-center gap-3">
                                                <div className="cursor-move text-slate-400 hover:text-slate-600">
                                                    <GripVertical size={20} />
                                                </div>
                                                <div className="flex-1 grid grid-cols-1 md:grid-cols-2 gap-3">
                                                    <input
                                                        value={mod.title}
                                                        onChange={e => {
                                                            const newMods = [...editingCourse.modules];
                                                            newMods[idx] = { ...mod, title: e.target.value };
                                                            setEditingCourse({ ...editingCourse, modules: newMods });
                                                        }}
                                                        placeholder="New Course"
                                                        className="px-3 py-2 rounded-lg border border-slate-200 text-sm"
                                                    />
                                                    <div className="flex gap-2">
                                                        <div className="relative flex-1">
                                                            <input
                                                                value={mod.duration || ''}
                                                                onChange={e => {
                                                                    const newMods = [...editingCourse.modules];
                                                                    newMods[idx] = { ...mod, duration: e.target.value };
                                                                    setEditingCourse({ ...editingCourse, modules: newMods });
                                                                }}
                                                                placeholder="Duration (e.g. 10:00)"
                                                                className="w-full pl-8 pr-3 py-2 rounded-lg border border-slate-200 text-sm"
                                                            />
                                                            <Clock size={14} className="absolute left-2.5 top-3 text-slate-400" />
                                                        </div>
                                                        <div className="relative flex-1">
                                                            <input
                                                                value={mod.videoId || ''}
                                                                onChange={e => {
                                                                    const val = e.target.value;
                                                                    let videoId = val;
                                                                    try {
                                                                        if (val.includes('youtube.com') || val.includes('youtu.be')) {
                                                                            const url = new URL(val.startsWith('http') ? val : `https://${val}`);
                                                                            if (val.includes('youtu.be')) {
                                                                                videoId = url.pathname.slice(1);
                                                                            } else {
                                                                                videoId = url.searchParams.get('v') || videoId;
                                                                            }
                                                                        }
                                                                    } catch (err) {
                                                                        console.log('Not a valid URL, treating as ID', err);
                                                                    }
                                                                    const newMods = [...editingCourse.modules];
                                                                    newMods[idx] = { ...mod, videoId: videoId };
                                                                    setEditingCourse({ ...editingCourse, modules: newMods });
                                                                }}
                                                                placeholder="YouTube Video ID or Link"
                                                                className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm font-mono focus:ring-2 focus:ring-blue-500 outline-none"
                                                            />
                                                        </div>
                                                    </div>
                                                </div>
                                                <button
                                                    onClick={() => {
                                                        const newMods = editingCourse.modules.filter(m => m.id !== mod.id);
                                                        setEditingCourse({ ...editingCourse, modules: newMods });
                                                    }}
                                                    className="text-red-400 hover:text-red-600 p-2"
                                                >
                                                    <Trash2 size={18} />
                                                </button>
                                            </div>

                                            <div className="pl-8 pt-2 border-t border-slate-200/50 flex flex-col gap-4">
                                                {/* Pre-Quiz Section Removed */}


                                                <div className="space-y-2">
                                                    <h5 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest text-[#5d5dff]">Module Quiz (After Video)</h5>
                                                    {mod.quiz ? (
                                                        <QuizEditor
                                                            quiz={mod.quiz}
                                                            onUpdate={(updatedQuiz) => {
                                                                const newMods = [...editingCourse.modules];
                                                                newMods[idx].quiz = updatedQuiz;
                                                                setEditingCourse({ ...editingCourse, modules: newMods });
                                                            }}
                                                            onNotify={(msg, type) => setPopup({ isOpen: true, message: msg, type })}
                                                            onDelete={() => {
                                                                openConfirm('Delete Quiz', 'Delete this module quiz? All questions will be lost.', () => {
                                                                    const newMods = [...editingCourse.modules];
                                                                    delete newMods[idx].quiz;
                                                                    setEditingCourse({ ...editingCourse, modules: newMods });
                                                                });
                                                            }}
                                                        />
                                                    ) : (
                                                        <button
                                                            onClick={() => {
                                                                const newMods = [...editingCourse.modules];
                                                                newMods[idx].quiz = {
                                                                    id: Date.now(),
                                                                    title: 'Module Quiz: ' + mod.title,
                                                                    questions: []
                                                                };
                                                                setEditingCourse({ ...editingCourse, modules: newMods });
                                                            }}
                                                            className="text-[10px] bg-indigo-50 hover:bg-indigo-100 px-3 py-1.5 rounded-lg text-indigo-700 font-bold transition-colors border border-indigo-100 flex items-center gap-1"
                                                        >
                                                            + Add Module Quiz
                                                        </button>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </section>

                            {/* Section 4: Course Conclusion (FINAL EVALUATION) */}
                            <section className="space-y-4 pt-8 border-t-2 border-slate-100 bg-slate-50/50 -mx-6 px-6 pb-6">
                                <h3 className="font-bold text-slate-700 flex items-center gap-2 pt-4">
                                    <span className="w-6 h-6 rounded-full bg-indigo-100 text-indigo-600 flex items-center justify-center text-xs">4</span>
                                    Course Conclusion (Final Evaluation)
                                </h3>

                                <div className="grid grid-cols-1 gap-6">
                                    {/* Final Post-Assessment */}
                                    <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm">
                                        <div className="flex justify-between items-center border-b border-slate-100 pb-4 mb-4">
                                            <div className="flex items-center gap-2">
                                                <div className="w-10 h-10 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-600">
                                                    <BookOpen size={20} />
                                                </div>
                                                <h4 className="font-bold text-lg text-slate-800">Final Post-Test</h4>
                                            </div>
                                            {editingCourse.assessment && (
                                                <button
                                                    onClick={() => {
                                                        openConfirm('Delete Post-Test', 'Delete this final evaluation quiz?', () => {
                                                            const upd = { ...editingCourse };
                                                            delete upd.assessment;
                                                            setEditingCourse(upd);
                                                        });
                                                    }}
                                                    className="text-red-500 hover:text-red-700 text-xs font-bold px-3 py-1.5 rounded-lg border border-red-100"
                                                >
                                                    Delete
                                                </button>
                                            )}
                                        </div>
                                        {!editingCourse.assessment ? (
                                            <button
                                                onClick={() => setEditingCourse({
                                                    ...editingCourse,
                                                    assessment: { id: Date.now(), title: 'Final Post-Test', questions: [] }
                                                })}
                                                className="w-full py-6 border-2 border-dashed border-slate-200 rounded-xl text-slate-400 font-bold hover:border-blue-400 hover:text-blue-500 hover:bg-white transition-all flex flex-col items-center justify-center gap-2"
                                            >
                                                <Plus size={24} />
                                                <span>Create Final Evaluation Quiz (Post-Test)</span>
                                            </button>
                                        ) : (
                                            <QuizEditor
                                                quiz={editingCourse.assessment}
                                                onUpdate={(updatedQuiz) => {
                                                    console.log("UPDATING POST-TEST STATE:", updatedQuiz.questions.length);
                                                    setEditingCourse(prev => prev ? ({ ...prev, assessment: updatedQuiz }) : prev);
                                                }}
                                                onNotify={(msg, type) => setPopup({ isOpen: true, message: msg, type })}
                                            />
                                        )}
                                    </div>
                                </div>
                            </section>
                        </div>
                    </div>

                    <div className="p-6 border-t border-slate-100 bg-slate-50 flex justify-end gap-3">
                        <button
                            onClick={() => setEditingCourse(null)}
                            className="px-6 py-2 rounded-xl text-slate-600 font-bold hover:bg-slate-200 transition-colors"
                        >
                            Close
                        </button>
                        <button
                            onClick={handleSaveCourse}
                            className="px-6 py-2 rounded-xl bg-blue-600 text-white font-bold hover:bg-blue-700 shadow-lg shadow-blue-200 transition-all flex items-center gap-2"
                        >
                            <Save size={18} /> Save Changes
                        </button>
                    </div>
                </div>
            </div>
        );
    };

    return (
        <div className="space-y-8">
            <div className="bg-gradient-to-br from-violet-700 via-purple-600 to-indigo-800 rounded-[2.5rem] p-8 md:p-12 text-white shadow-2xl relative overflow-hidden group">
                <div className="absolute top-0 right-0 p-12 opacity-10 rotate-12 group-hover:rotate-45 transition-transform duration-1000">
                    <BookOpen size={200} />
                </div>
                <div className="relative z-10 flex flex-col md:flex-row justify-between items-start md:items-end gap-6">
                    <div>
                        <div className="inline-flex items-center gap-2 bg-white/20 backdrop-blur-md px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest border border-white/20 mb-4">
                            Module Architecture
                        </div>
                        <h1 className="text-3xl md:text-4xl font-black tracking-tighter mb-2">Online Module Management</h1>
                        <p className="text-purple-100 font-medium max-w-xl opacity-90">Digital Learning Architecture: Design, edit, and manage high-standard curriculum modules.</p>
                    </div>
                    <button
                        onClick={handleAddNewCourse}
                        className="bg-white text-purple-600 px-8 py-4 rounded-2xl font-black text-xs uppercase tracking-widest flex items-center gap-2 shadow-2xl hover:bg-purple-50 transition-all active:scale-95"
                    >
                        <Plus size={20} /> New Module
                    </button>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {courses.map(course => (
                    <div key={course.id} className="group bg-white rounded-[2.5rem] p-8 border border-slate-100 shadow-[0_8px_30px_rgb(0,0,0,0.04)] hover:shadow-[0_20px_50px_rgb(0,0,0,0.08)] hover:-translate-y-2 transition-all duration-500 cursor-pointer relative overflow-hidden flex flex-col h-full active:scale-[0.98]">
                        <div className="absolute top-0 left-0 w-1.5 h-full bg-purple-600 opacity-0 group-hover:opacity-100 transition-opacity"></div>
                        <div className="flex justify-between items-start mb-6">
                            <span className="bg-purple-50 text-purple-600 px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-widest border border-purple-100/50 shadow-sm">
                                Module
                            </span>
                            <div className="flex gap-2">
                                <button
                                    onClick={() => handleEditCourse(course)}
                                    className="w-10 h-10 flex items-center justify-center rounded-2xl bg-slate-50 text-slate-400 hover:bg-purple-50 hover:text-purple-600 transition-all border border-transparent hover:border-purple-100 shadow-sm"
                                    title="Edit Course"
                                >
                                    <Edit size={18} />
                                </button>
                                <button
                                    onClick={() => handleDeleteCourse(course.id)}
                                    className="w-10 h-10 flex items-center justify-center rounded-2xl bg-slate-50 text-slate-400 hover:bg-red-50 hover:text-red-600 transition-all border border-transparent hover:border-red-100 shadow-sm"
                                    title="Delete Course"
                                >
                                    <Trash2 size={18} />
                                </button>
                            </div>
                        </div>
                        <h3 className="text-xl font-black text-slate-800 mb-3 group-hover:text-purple-600 transition-colors tracking-tight leading-tight">{course.title}</h3>
                        <p className="text-slate-500 text-sm font-medium mb-8 line-clamp-2 leading-relaxed">{course.description}</p>
                        <div className="flex items-center justify-between text-[10px] font-black text-slate-400 uppercase tracking-widest border-t border-slate-50 pt-6 mt-auto">
                            <div className="flex items-center gap-2">
                                <BookOpen size={14} className="text-purple-400" />
                                <span>{course.modules?.length || 0} Courses</span>
                            </div>
                            <div className="flex items-center gap-2">
                                <GripVertical size={14} /> Reorder
                            </div>
                        </div>
                    </div>
                ))}

                {courses.length === 0 && (
                    <div className="col-span-full py-20 text-center bg-slate-50 rounded-3xl border-2 border-dashed border-slate-200">
                        <div className="mb-4 text-slate-300 flex justify-center">
                            <BookOpen size={64} />
                        </div>
                        <h3 className="text-lg font-bold text-slate-600 mb-2">No Courses Found</h3>
                        <p className="text-slate-400 mb-6">Get started by creating your first training course.</p>
                        <button
                            onClick={handleAddNewCourse}
                            className="text-blue-600 font-bold hover:underline"
                        >
                            Create New Course
                        </button>
                    </div>
                )}
            </div>

            {renderEditor()}

            <PopupNotification
                isOpen={popup.isOpen}
                type={popup.type}
                message={popup.message}
                onClose={() => setPopup(prev => ({ ...prev, isOpen: false }))}
            />

            <ConfirmationModal
                isOpen={confirmConfig.isOpen}
                onClose={() => setConfirmConfig({ ...confirmConfig, isOpen: false })}
                onConfirm={confirmConfig.onConfirm}
                title={confirmConfig.title}
                message={confirmConfig.message}
                confirmText="Yes, Proceed"
                variant="danger"
            />
        </div>
    );
};

export default OnlineModulesManager;
