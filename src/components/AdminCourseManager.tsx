import { useState, useEffect } from 'react';
import { Edit, Trash2, Plus, GripVertical, Save, X, BookOpen, Clock } from 'lucide-react';
import { API_BASE_URL } from '../config';
import type { Course, Module } from '../types';

const AdminCourseManager = () => {
    const [courses, setCourses] = useState<Course[]>([]);
    const [editingCourse, setEditingCourse] = useState<Course | null>(null);
    const [editorTab, setEditorTab] = useState<'content' | 'grades'>('content');

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const [progressData, setProgressData] = useState<Record<string, any>[]>([]);

    // --- Fetch Data from API ---
    useEffect(() => {
        const fetchData = async () => {
            try {
                const [resCourses, resProgress] = await Promise.all([
                    fetch(`${API_BASE_URL}/api/courses`),
                    fetch(`${API_BASE_URL}/api/progress`)
                ]);
                const coursesData = await resCourses.json();
                const progressJson = await resProgress.json();

                setCourses(coursesData);
                setProgressData(progressJson);
            } catch (err) {
                console.error("Failed to load data:", err);
            }
        };
        fetchData();
    }, []);

    // Helper removed (saveToStorage) as we use API calls now

    const handleDeleteCourse = async (id: number) => {
        if (confirm('Are you sure you want to delete this course?')) {
            try {
                await fetch(`${API_BASE_URL}/api/courses/${id}`, { method: 'DELETE' });
                setCourses(courses.filter(c => c.id !== id));
            } catch (err) {
                console.error("Failed to delete course", err);
            }
        }
    };

    const handleAddNewCourse = () => {
        const newCourse: Course = {
            id: Date.now(),
            title: 'New Untitled Course',
            description: 'Description here...',
            duration: '0 jam',
            modulesCount: 0,
            studentCount: 0,
            progress: 0,
            modules: []
        };
        setEditingCourse(newCourse);
        setEditorTab('content');
    };

    const handleEditCourse = (course: Course) => {
        setEditingCourse(course);
        setEditorTab('content');
    };

    const handleViewScores = (course: Course) => {
        setEditingCourse(course);
        setEditorTab('grades');
    };

    const handleSaveCourse = async () => {
        if (!editingCourse) return;

        const isNew = !courses.find(c => c.id === editingCourse.id);

        try {
            if (isNew) {
                // POST
                const res = await fetch(`${API_BASE_URL}/api/courses`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(editingCourse)
                });
                const saved = await res.json();
                setCourses([...courses, saved]);
            } else {
                // PUT
                const res = await fetch(`${API_BASE_URL}/api/courses/${editingCourse.id}`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(editingCourse)
                });
                const saved = await res.json();
                setCourses(courses.map(c => c.id === saved.id ? saved : c));
            }
            setEditingCourse(null);
            alert('Course Saved Successfully!');
        } catch (err) {
            console.error('Failed to save course', err);
            alert('Failed to save course');
        }
    };

    // --- Course Editor Modal ---
    const renderEditor = () => {
        if (!editingCourse) return null;
        return (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm overflow-y-auto">
                <div className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl overflow-hidden flex flex-col max-h-[90vh]">
                    {/* Header */}
                    <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50">
                        <div className="flex flex-col">
                            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                                {courses.find(c => c.id === editingCourse.id) ? 'Managing Course' : 'Creating Course'}
                            </span>
                            <h2 className="font-bold text-xl text-slate-800">{editingCourse.title}</h2>
                        </div>
                        <button onClick={() => setEditingCourse(null)} className="text-slate-400 hover:text-slate-600">
                            <X size={24} />
                        </button>
                    </div>

                    {/* Tabs */}
                    <div className="px-6 border-b border-slate-100 flex gap-6">
                        <button
                            onClick={() => setEditorTab('content')}
                            className={`py-4 text-sm font-bold border-b-2 transition-colors ${editorTab === 'content' ? 'border-blue-600 text-blue-600' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
                        >
                            Course Content
                        </button>
                        <button
                            onClick={() => setEditorTab('grades')}
                            className={`py-4 text-sm font-bold border-b-2 transition-colors ${editorTab === 'grades' ? 'border-blue-600 text-blue-600' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
                        >
                            Staff Grades
                        </button>
                    </div>

                    <div className="flex-1 overflow-y-auto p-6 bg-white">
                        {editorTab === 'content' ? (
                            <div className="space-y-8">
                                {/* 1. Basic Info */}
                                <section className="space-y-4">
                                    <h3 className="font-bold text-slate-700 flex items-center gap-2">
                                        <span className="w-6 h-6 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center text-xs">1</span>
                                        Basic Information
                                    </h3>
                                    <div className="grid grid-cols-1 gap-4">
                                        <div>
                                            <label className="block text-sm font-semibold text-slate-700 mb-1">Course Title</label>
                                            <input
                                                value={editingCourse.title}
                                                onChange={e => setEditingCourse({ ...editingCourse, title: e.target.value })}
                                                className="w-full px-4 py-2 rounded-xl border border-slate-200 outline-none focus:ring-2 focus:ring-blue-500"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-sm font-semibold text-slate-700 mb-1">Description</label>
                                            <textarea
                                                value={editingCourse.description}
                                                onChange={e => setEditingCourse({ ...editingCourse, description: e.target.value })}
                                                rows={3}
                                                className="w-full px-4 py-2 rounded-xl border border-slate-200 outline-none focus:ring-2 focus:ring-blue-500"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-sm font-semibold text-slate-700 mb-1">Total Duration Label</label>
                                            <div className="relative">
                                                <input
                                                    value={editingCourse.duration}
                                                    onChange={e => setEditingCourse({ ...editingCourse, duration: e.target.value })}
                                                    placeholder="e.g. 60 Jam Belajar"
                                                    className="w-full pl-10 pr-4 py-2 rounded-xl border border-slate-200 outline-none focus:ring-2 focus:ring-blue-500"
                                                />
                                                <Clock size={16} className="absolute left-3.5 top-3 text-slate-400" />
                                            </div>
                                            <p className="text-xs text-slate-400 mt-1">This text will be displayed on the course card.</p>
                                        </div>
                                    </div>
                                </section>

                                {/* 2. Modules */}
                                <section className="space-y-4">
                                    <div className="flex items-center justify-between">
                                        <h3 className="font-bold text-slate-700 flex items-center gap-2">
                                            <span className="w-6 h-6 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center text-xs">2</span>
                                            Modules & Lessons
                                        </h3>
                                        <button
                                            onClick={() => {
                                                const newMod: Module = {
                                                    id: Date.now(),
                                                    title: 'New Module',
                                                    duration: '05:00',
                                                    videoType: 'youtube',
                                                    videoId: '',
                                                    locked: false
                                                };
                                                setEditingCourse({
                                                    ...editingCourse,
                                                    modules: [...editingCourse.modules, newMod]
                                                });
                                            }}
                                            className="text-sm font-bold text-blue-600 hover:text-blue-700 flex items-center gap-1"
                                        >
                                            <Plus size={16} /> Add Module
                                        </button>
                                    </div>

                                    <div className="space-y-3">
                                        {editingCourse.modules.map((mod, idx) => (
                                            <div key={mod.id} className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-3">
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
                                                            placeholder="Module Title"
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
                                                            <input
                                                                value={mod.videoId || ''}
                                                                onChange={e => {
                                                                    const newMods = [...editingCourse.modules];
                                                                    newMods[idx] = { ...mod, videoId: e.target.value };
                                                                    setEditingCourse({ ...editingCourse, modules: newMods });
                                                                }}
                                                                placeholder="YouTube Video ID"
                                                                className="flex-1 px-3 py-2 rounded-lg border border-slate-200 text-sm font-mono"
                                                            />
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

                                                {/* Quiz Section for Module */}
                                                <div className="pl-8 pt-2 border-t border-slate-200/50">
                                                    <div className="flex items-center gap-3">
                                                        <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Quiz</span>
                                                        {mod.quiz ? (
                                                            <div className="flex items-center gap-2 bg-green-50 text-green-700 px-3 py-1 rounded-lg text-xs font-medium border border-green-100">
                                                                <span>{mod.quiz.questions.length} Questions</span>
                                                                <button
                                                                    onClick={() => {
                                                                        if (confirm('Delete this quiz?')) {
                                                                            const newMods = [...editingCourse.modules];
                                                                            delete newMods[idx].quiz;
                                                                            setEditingCourse({ ...editingCourse, modules: newMods });
                                                                        }
                                                                    }}
                                                                    className="hover:text-red-600 ml-2"
                                                                >
                                                                    <X size={12} />
                                                                </button>
                                                            </div>
                                                        ) : (
                                                            <button
                                                                onClick={() => {
                                                                    const newMods = [...editingCourse.modules];
                                                                    newMods[idx].quiz = {
                                                                        id: Date.now(),
                                                                        title: 'Quiz',
                                                                        questions: []
                                                                    };
                                                                    setEditingCourse({ ...editingCourse, modules: newMods });
                                                                }}
                                                                className="text-xs bg-slate-200 hover:bg-slate-300 px-2 py-1 rounded text-slate-700 transition-colors"
                                                            >
                                                                + Create Quiz
                                                            </button>
                                                        )}
                                                    </div>

                                                    {/* Quiz Editor Inline */}
                                                    {mod.quiz && (
                                                        <div className="mt-2 space-y-2 pl-4 border-l-2 border-green-100">
                                                            {mod.quiz.questions.map((q, qIdx) => (
                                                                <div key={q.id} className="text-sm text-slate-600 flex justify-between">
                                                                    <span>{qIdx + 1}. {q.question}</span>
                                                                    <button
                                                                        onClick={() => {
                                                                            const newMods = [...editingCourse.modules];
                                                                            if (newMods[idx].quiz) {
                                                                                newMods[idx].quiz.questions = newMods[idx].quiz.questions.filter(qu => qu.id !== q.id);
                                                                                setEditingCourse({ ...editingCourse, modules: newMods });
                                                                            }
                                                                        }}
                                                                        className="text-red-400 hover:text-red-600"
                                                                    >
                                                                        <X size={12} />
                                                                    </button>
                                                                </div>
                                                            ))}
                                                            <button
                                                                onClick={() => {
                                                                    const questionText = prompt('Enter Question:');
                                                                    if (questionText) {
                                                                        const newMods = [...editingCourse.modules];
                                                                        if (newMods[idx].quiz) {
                                                                            newMods[idx].quiz.questions.push({
                                                                                id: Date.now(),
                                                                                question: questionText,
                                                                                options: ['True', 'False'],
                                                                                correctAnswer: 0
                                                                            });
                                                                            setEditingCourse({ ...editingCourse, modules: newMods });
                                                                        }
                                                                    }
                                                                }}
                                                                className="text-xs text-blue-600 hover:underline"
                                                            >
                                                                + Add Question (Simple)
                                                            </button>
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </section>
                            </div>
                        ) : (
                            <div className="h-full">
                                {/* GRADEBOOK MATRIX VIEW for this Course */}
                                <div className="bg-slate-50 rounded-xl border border-slate-200 overflow-hidden">
                                    <div className="p-4 border-b border-slate-200 bg-white">
                                        <h3 className="font-bold text-slate-700">Staff Performance Matrix</h3>
                                        <p className="text-sm text-slate-500">View how staff members are performing across all modules in this course.</p>
                                    </div>
                                    <div className="overflow-x-auto">
                                        <table className="w-full text-left border-collapse">
                                            <thead className="bg-slate-50 text-slate-600 text-xs uppercase tracking-wider font-semibold">
                                                <tr>
                                                    <th className="p-4 border-b border-slate-100 min-w-[200px] sticky left-0 bg-slate-50 z-10 border-r border-slate-200">Staff Name</th>
                                                    {editingCourse.modules.map((mod, idx) => (
                                                        <th key={mod.id} className="p-4 border-b border-slate-100 text-center whitespace-nowrap min-w-[100px]">
                                                            Mod {idx + 1}
                                                        </th>
                                                    ))}
                                                    <th className="p-4 border-b border-slate-100 text-center">Avg</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-slate-100 bg-white">
                                                {(() => {
                                                    // Filter progress for this course
                                                    const courseProgress = progressData.filter(p => p.courseId === editingCourse.id);
                                                    if (courseProgress.length === 0) {
                                                        return (
                                                            <tr>
                                                                <td colSpan={editingCourse.modules.length + 2} className="p-8 text-center text-slate-400">
                                                                    No staff has started this course yet.
                                                                </td>
                                                            </tr>
                                                        );
                                                    }

                                                    return courseProgress.map(record => {
                                                        const completedIds = record.completedModuleIds || [];
                                                        const progressPercent = Math.round((completedIds.length / editingCourse.modules.length) * 100);

                                                        return (
                                                            <tr key={record.userId} className="hover:bg-blue-50/50 transition-colors">
                                                                <td className="p-4 font-medium text-slate-800 sticky left-0 bg-white hover:bg-blue-50/50 border-r border-slate-100">
                                                                    {record.userId}
                                                                </td>
                                                                {editingCourse.modules.map(mod => {
                                                                    const isCompleted = completedIds.includes(mod.id);
                                                                    return (
                                                                        <td key={mod.id} className="p-4 text-center border-l border-dashed border-slate-100">
                                                                            {isCompleted ? (
                                                                                <span className="px-2 py-1 rounded text-xs font-bold bg-green-100 text-green-700">
                                                                                    Done
                                                                                </span>
                                                                            ) : (
                                                                                <span className="text-slate-300">-</span>
                                                                            )}
                                                                        </td>
                                                                    );
                                                                })}
                                                                <td className="p-4 text-center font-bold text-slate-700 border-l border-slate-100">
                                                                    {progressPercent}%
                                                                </td>
                                                            </tr>
                                                        );
                                                    });
                                                })()}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Footer Actions */}
                    <div className="p-6 border-t border-slate-100 bg-slate-50 flex justify-end gap-3">
                        <button
                            onClick={() => setEditingCourse(null)}
                            className="px-6 py-2 rounded-xl text-slate-600 font-bold hover:bg-slate-200 transition-colors"
                        >
                            Close
                        </button>
                        {editorTab === 'content' && (
                            <button
                                onClick={handleSaveCourse}
                                className="px-6 py-2 rounded-xl bg-blue-600 text-white font-bold hover:bg-blue-700 shadow-lg shadow-blue-200 transition-all flex items-center gap-2"
                            >
                                <Save size={18} /> Save Changes
                            </button>
                        )}
                    </div>
                </div>
            </div>
        );
    };

    return (
        <div className="space-y-8">
            {/* Header / Banner */}
            <div className="bg-gradient-to-r from-blue-600 to-indigo-600 rounded-3xl p-8 text-white shadow-xl shadow-blue-200 relative overflow-hidden">
                <div className="absolute top-0 right-0 w-64 h-64 bg-white/10 rounded-full blur-3xl -mr-16 -mt-16 pointer-events-none"></div>
                <div className="relative z-10 flex justify-between items-end">
                    <div>
                        <h1 className="text-3xl font-bold mb-2">Course Management</h1>
                        <p className="text-blue-100 max-w-xl">Create, edit, and manage training courses for your team. Track progress and update modules easily.</p>
                    </div>
                    <button
                        onClick={handleAddNewCourse}
                        className="bg-white text-blue-600 px-6 py-3 rounded-xl font-bold flex items-center gap-2 shadow-lg hover:bg-blue-50 transition-all"
                    >
                        <Plus size={20} /> New Course
                    </button>
                </div>
            </div>

            {/* Course Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {courses.map(course => (
                    <div key={course.id} className="group bg-white rounded-2xl p-6 border border-slate-100 shadow-sm hover:shadow-xl hover:border-blue-200 transition-all relative overflow-hidden">
                        <div className="absolute top-0 left-0 w-1 h-full bg-blue-500 opacity-0 group-hover:opacity-100 transition-opacity"></div>

                        <div className="flex justify-between items-start mb-4">
                            <span className="bg-blue-50 text-blue-600 px-3 py-1 rounded-lg text-xs font-bold uppercase tracking-wider">
                                General
                            </span>
                            <div className="flex gap-1">
                                <button
                                    onClick={() => handleViewScores(course)}
                                    className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
                                    title="View Grades"
                                >
                                    <BookOpen size={20} />
                                </button>
                                <button
                                    onClick={() => handleEditCourse(course)}
                                    className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                                    title="Edit Course"
                                >
                                    <Edit size={20} />
                                </button>
                                <button
                                    onClick={() => handleDeleteCourse(course.id)}
                                    className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                                    title="Delete Course"
                                >
                                    <Trash2 size={20} />
                                </button>
                            </div>
                        </div>

                        <h3 className="text-lg font-bold text-slate-800 mb-2 group-hover:text-blue-600 transition-colors">{course.title}</h3>
                        <p className="text-slate-500 text-sm mb-4 line-clamp-2">{course.description}</p>

                        <div className="flex items-center justify-between text-sm text-slate-400 border-t border-slate-50 pt-4">
                            <span>{course.modules.length} Modules</span>
                            <span className="flex items-center gap-1">
                                <GripVertical size={14} /> Reorder
                            </span>
                        </div>
                    </div>
                ))}

                {/* Empty State */}
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
        </div>
    );
};

export default AdminCourseManager;
