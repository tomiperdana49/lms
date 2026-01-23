import { useState, useEffect } from 'react';
import { BookOpen, Trash2, ArrowLeft, Search } from 'lucide-react';
import { API_BASE_URL } from '../config';
import type { ReadingLogEntry } from '../types';

interface AdminReadingLogProps {
    onBack: () => void;
}

const AdminReadingLog = ({ onBack }: AdminReadingLogProps) => {
    const [allLogs, setAllLogs] = useState<ReadingLogEntry[]>([]);
    const [searchTerm, setSearchTerm] = useState('');
    const [expandedUser, setExpandedUser] = useState<string | null>(null);

    useEffect(() => {
        fetch(`${API_BASE_URL}/api/logs`)
            .then(res => res.json())
            .then(data => setAllLogs(data))
            .catch(err => console.error(err));
    }, []);

    const handleDelete = async (id: number) => {
        if (!confirm('Are you sure you want to delete this log entry?')) return;
        try {
            await fetch(`${API_BASE_URL}/api/logs/${id}`, { method: 'DELETE' });
            setAllLogs(allLogs.filter(l => l.id !== id));
        } catch (err) {
            console.error(err);
        }
    };

    // Grouping Logic
    const groupedByUser = allLogs.reduce((acc, log) => {
        const user = log.userName || 'Unknown User';
        if (!acc[user]) {
            acc[user] = {};
        }
        // Normalize title
        const titleKey = log.title.toLowerCase().trim();
        if (!acc[user][titleKey]) {
            acc[user][titleKey] = { title: log.title, readingLog: null, finishedLog: null };
        }

        if (log.status === 'Reading') {
            acc[user][titleKey].readingLog = log;
        } else if (log.status === 'Finished') {
            // Keep the latest finish if multiple? Or list all? 
            // The requirement says "start and finish in same line". 
            // Assuming 1-to-1 mapping mostly.
            acc[user][titleKey].finishedLog = log;
        } else {
            // Fallback for unknown status, treat as reading or finished?
            // Let's assume Reading if no specific status
            if (!acc[user][titleKey].readingLog) acc[user][titleKey].readingLog = log;
        }
        return acc;
    }, {} as Record<string, Record<string, { title: string, readingLog: ReadingLogEntry | null, finishedLog: ReadingLogEntry | null }>>);

    const userNames = Object.keys(groupedByUser).filter(name =>
        name.toLowerCase().includes(searchTerm.toLowerCase())
    );

    return (
        <div className="max-w-6xl mx-auto py-6">
            <button onClick={onBack} className="text-sm text-slate-500 hover:text-blue-600 flex items-center gap-1 mb-4 transition-colors">
                <ArrowLeft size={14} /> Back to Dashboard
            </button>

            <div className="flex justify-between items-center mb-8">
                <div>
                    <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
                        <BookOpen className="text-purple-600" /> User Reading History
                    </h1>
                    <p className="text-sm text-slate-500 mt-1">View comprehensive reading timelines per user.</p>
                </div>
                <div className="relative">
                    <Search size={16} className="absolute left-3 top-3 text-slate-400" />
                    <input
                        type="text"
                        placeholder="Search user..."
                        value={searchTerm}
                        onChange={e => setSearchTerm(e.target.value)}
                        className="pl-10 pr-4 py-2 rounded-xl border border-slate-200 outline-none focus:ring-2 focus:ring-purple-500 bg-white shadow-sm"
                    />
                </div>
            </div>

            <div className="space-y-4">
                {userNames.length === 0 ? (
                    <div className="p-8 text-center text-slate-400 italic bg-white rounded-2xl shadow-sm">No users found.</div>
                ) : (
                    userNames.map(userName => {
                        const books = groupedByUser[userName];
                        const bookKeys = Object.keys(books);
                        const isExpanded = expandedUser === userName;

                        return (
                            <div key={userName} className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
                                <div
                                    onClick={() => setExpandedUser(isExpanded ? null : userName)}
                                    className="p-4 flex items-center justify-between cursor-pointer hover:bg-slate-50 transition-colors"
                                >
                                    <div className="flex items-center gap-3">
                                        <div className="w-10 h-10 rounded-full bg-purple-100 text-purple-600 flex items-center justify-center font-bold text-sm">
                                            {userName.charAt(0).toUpperCase()}
                                        </div>
                                        <div>
                                            <h3 className="font-bold text-slate-800">{userName}</h3>
                                            <p className="text-xs text-slate-500">{bookKeys.length} Books Recorded</p>
                                        </div>
                                    </div>
                                    <div className="text-sm text-blue-600 font-semibold px-4 py-2 bg-blue-50 rounded-lg">
                                        {isExpanded ? 'Hide Details' : 'View Reading History'}
                                    </div>
                                </div>

                                {isExpanded && (
                                    <div className="border-t border-slate-100 bg-slate-50/50 p-4 animate-in slide-in-from-top-2">
                                        <table className="w-full text-sm">
                                            <thead>
                                                <tr className="text-left text-slate-500 font-semibold border-b border-slate-200">
                                                    <th className="pb-3 pl-2">Book Title</th>
                                                    <th className="pb-3">Start Date</th>
                                                    <th className="pb-3">Finish Date</th>
                                                    <th className="pb-3">Status</th>
                                                    <th className="pb-3 text-center">Actions</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-slate-100">
                                                {bookKeys.map(key => {
                                                    const { title, readingLog, finishedLog } = books[key];
                                                    const startDate = readingLog ? new Date(readingLog.date).toLocaleDateString() : '-';
                                                    const finishDate = finishedLog ? new Date(finishedLog.date).toLocaleDateString() : '-';
                                                    const status = finishedLog ? 'Completed' : 'Reading';

                                                    return (
                                                        <tr key={key} className="hover:bg-slate-100/50">
                                                            <td className="py-3 pl-2 font-medium text-slate-700">{title}</td>
                                                            <td className="py-3 text-slate-600">{startDate}</td>
                                                            <td className="py-3 text-slate-600">{finishDate}</td>
                                                            <td className="py-3">
                                                                <span className={`px-2 py-1 rounded text-xs font-bold ${finishedLog ? 'bg-green-100 text-green-700' : 'bg-orange-100 text-orange-700'}`}>
                                                                    {status}
                                                                </span>
                                                            </td>
                                                            <td className="py-3 flex justify-center gap-2">
                                                                {readingLog && (
                                                                    <button onClick={() => handleDelete(readingLog.id)} className="text-slate-400 hover:text-red-500" title="Delete Start Log">
                                                                        <Trash2 size={16} />
                                                                    </button>
                                                                )}
                                                                {finishedLog && (
                                                                    <button onClick={() => handleDelete(finishedLog.id)} className="text-slate-400 hover:text-red-500" title="Delete Finish Log">
                                                                        <Trash2 size={16} />
                                                                    </button>
                                                                )}
                                                            </td>
                                                        </tr>
                                                    );
                                                })}
                                            </tbody>
                                        </table>
                                    </div>
                                )}
                            </div>
                        );
                    })
                )}
            </div>
        </div>
    );
};

export default AdminReadingLog;
