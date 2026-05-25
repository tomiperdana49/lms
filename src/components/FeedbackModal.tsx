import { useState, useEffect, useRef, type ChangeEvent } from 'react';
import { X, Clock, Plus, CheckCircle2, MessageSquare, AlertCircle } from 'lucide-react';
import { API_BASE_URL } from '../config';
import type { User } from '../types';

interface FeedbackModalProps {
    isOpen: boolean;
    onClose: () => void;
    user: User;
}

interface FeedbackHistoryEntry {
    id: number;
    category: string;
    description: string;
    url: string;
    imageUrls: string[];
    createdAt: string;
}

export default function FeedbackModal({ isOpen, onClose, user }: FeedbackModalProps) {
    const [category, setCategory] = useState<'Issue' | 'Suggestion' | 'Compliment'>('Issue');
    const [description, setDescription] = useState('');
    const [screenshots, setScreenshots] = useState<string[]>([]);
    const [isUploading, setIsUploading] = useState(false);
    const [isCapturing, setIsCapturing] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [notification, setNotification] = useState<{ show: boolean; type: 'success' | 'error'; message: string }>({ show: false, type: 'success', message: '' });
    
    // View history state
    const [showHistory, setShowHistory] = useState(false);
    const [history, setHistory] = useState<FeedbackHistoryEntry[]>([]);
    const [isLoadingHistory, setIsLoadingHistory] = useState(false);

    const fileInputRef = useRef<HTMLInputElement>(null);

    // Current page URL
    const currentPageUrl = typeof window !== 'undefined' ? window.location.href : 'https://simas.nusa.id/';

    const captureAutomaticScreenshot = async () => {
        setIsCapturing(true);
        try {
            // Find the modal element to hide it before taking the screenshot
            const modalElement = document.getElementById('feedback-modal-root');
            if (modalElement) {
                modalElement.style.setProperty('display', 'none', 'important');
            }

            // Load html2canvas dynamically
            const html2canvas = (await import('html2canvas')).default;
            
            // Take screenshot of body
            const canvas = await html2canvas(document.body, {
                useCORS: true,
                logging: false,
                scale: window.devicePixelRatio || 1,
                ignoreElements: (element) => {
                    return element.id === 'feedback-modal-root';
                }
            });

            // Restore modal visibility
            if (modalElement) {
                modalElement.style.removeProperty('display');
            }

            // Convert canvas to Blob
            canvas.toBlob(async (blob) => {
                if (blob) {
                    const file = new File([blob], `screenshot_${Date.now()}.png`, { type: 'image/png' });
                    const formData = new FormData();
                    formData.append('file', file);

                    try {
                        const res = await fetch(`${API_BASE_URL}/api/upload`, {
                            method: 'POST',
                            body: formData
                        });

                        if (res.ok) {
                            const data = await res.json();
                            if (data.fileUrl) {
                                setScreenshots(prev => [...prev, data.fileUrl]);
                            }
                        }
                    } catch (uploadErr) {
                        console.error('Failed to upload auto screenshot:', uploadErr);
                    }
                }
                setIsCapturing(false);
            }, 'image/png');

        } catch (err) {
            console.error('Failed to capture screen:', err);
            setIsCapturing(false);
            
            // Ensure modal visibility is restored
            const modalElement = document.getElementById('feedback-modal-root');
            if (modalElement) {
                modalElement.style.removeProperty('display');
            }
        }
    };

    useEffect(() => {
        if (isOpen) {
            // Reset state
            setCategory('Issue');
            setDescription('');
            setScreenshots([]);
            setShowHistory(false);
            
            // Trigger automatic screenshot
            captureAutomaticScreenshot();
        }
    }, [isOpen]);

    const fetchHistory = async () => {
        setIsLoadingHistory(true);
        try {
            const res = await fetch(`${API_BASE_URL}/api/feedback/history?email=${encodeURIComponent(user.email)}`);
            if (res.ok) {
                const data = await res.json();
                setHistory(data);
            }
        } catch (err) {
            console.error('Error fetching history:', err);
        } finally {
            setIsLoadingHistory(false);
        }
    };

    useEffect(() => {
        if (showHistory && user?.email) {
            fetchHistory();
        }
    }, [showHistory, user]);

    const handleFileChange = async (e: ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files.length > 0) {
            setIsUploading(true);
            const files = Array.from(e.target.files);
            
            try {
                const uploadedUrls: string[] = [];
                for (const file of files) {
                    const formData = new FormData();
                    formData.append('file', file);
                    
                    const res = await fetch(`${API_BASE_URL}/api/upload`, {
                        method: 'POST',
                        body: formData
                    });
                    
                    if (res.ok) {
                        const data = await res.json();
                        if (data.fileUrl) {
                            uploadedUrls.push(data.fileUrl);
                        }
                    }
                }
                setScreenshots(prev => [...prev, ...uploadedUrls]);
            } catch (err) {
                console.error('Upload error:', err);
                showToast('error', 'Failed to upload screenshot.');
            } finally {
                setIsUploading(false);
                if (fileInputRef.current) fileInputRef.current.value = '';
            }
        }
    };

    const removeScreenshot = (index: number) => {
        setScreenshots(prev => prev.filter((_, i) => i !== index));
    };

    const showToast = (type: 'success' | 'error', message: string) => {
        setNotification({ show: true, type, message });
        setTimeout(() => {
            setNotification(prev => ({ ...prev, show: false }));
        }, 3000);
    };

    const handleSubmit = async () => {
        if (!description.trim()) {
            showToast('error', 'Please describe your problem or suggestion.');
            return;
        }

        setIsSubmitting(true);
        try {
            const payload = {
                userEmail: user.email,
                userName: user.name,
                url: currentPageUrl,
                category,
                description,
                imageUrls: screenshots
            };

            const res = await fetch(`${API_BASE_URL}/api/feedback`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            if (res.ok) {
                showToast('success', 'Feedback submitted successfully! Thank you.');
                // Save locally to localStorage as immediate offline history
                const localFeedback = {
                    id: Date.now(),
                    category,
                    description,
                    url: currentPageUrl,
                    imageUrls: screenshots,
                    createdAt: new Date().toISOString()
                };
                const existing = JSON.parse(localStorage.getItem('lms_feedbacks') || '[]');
                localStorage.setItem('lms_feedbacks', JSON.stringify([localFeedback, ...existing]));

                setTimeout(() => {
                    onClose();
                }, 1500);
            } else {
                showToast('error', 'Failed to send feedback.');
            }
        } catch (err) {
            console.error('Submit error:', err);
            showToast('error', 'Failed to connect to server.');
        } finally {
            setIsSubmitting(false);
        }
    };

    if (!isOpen) return null;

    return (
        <div id="feedback-modal-root" className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-200">
            {/* Toast Notification */}
            {notification.show && (
                <div className={`fixed top-6 right-6 z-[70] flex items-center gap-2.5 px-4 py-3 rounded-xl shadow-lg border text-sm font-semibold animate-in slide-in-from-top-4 ${
                    notification.type === 'success' 
                        ? 'bg-emerald-950 border-emerald-800 text-emerald-300' 
                        : 'bg-rose-950 border-rose-800 text-rose-300'
                }`}>
                    {notification.type === 'success' ? <CheckCircle2 size={18} /> : <AlertCircle size={18} />}
                    {notification.message}
                </div>
            )}

            <div className="bg-slate-900 border border-slate-800 text-white rounded-2xl shadow-2xl w-full max-w-lg flex flex-col max-h-[90vh] overflow-hidden animate-in zoom-in-95 duration-200">
                {/* Header */}
                <div className="p-6 border-b border-slate-800 flex justify-between items-start bg-slate-950/20">
                    <div>
                        <h3 className="text-xl font-bold tracking-tight text-white flex items-center gap-2">
                            {showHistory ? <Clock size={20} className="text-emerald-400" /> : <MessageSquare size={20} className="text-emerald-400" />}
                            {showHistory ? 'Feedback History' : 'Report an Issue'}
                        </h3>
                        <p className="text-xs text-slate-400 mt-1">
                            {showHistory ? 'View your previously submitted issues and suggestions' : 'Please provide detailed information about the issue.'}
                        </p>
                    </div>
                    <button onClick={onClose} className="text-slate-500 hover:text-white hover:bg-slate-800 rounded-lg p-1.5 transition-colors cursor-pointer">
                        <X size={20} />
                    </button>
                </div>

                {/* Content */}
                {showHistory ? (
                    <div className="p-6 overflow-y-auto space-y-4 flex-1 bg-slate-950/10 min-h-[300px]">
                        {isLoadingHistory ? (
                            <div className="flex flex-col items-center justify-center py-12 text-slate-500 gap-2">
                                <Clock className="animate-spin text-emerald-400" size={32} />
                                <p className="text-xs font-semibold">Loading history...</p>
                            </div>
                        ) : history.length === 0 ? (
                            <div className="flex flex-col items-center justify-center py-12 text-slate-500 gap-3">
                                <Clock size={40} className="opacity-20" />
                                <p className="text-sm font-medium">No feedback history found.</p>
                            </div>
                        ) : (
                            <div className="space-y-4">
                                {history.map((item) => (
                                    <div key={item.id} className="bg-slate-950/40 border border-slate-800 rounded-xl p-4 space-y-2">
                                        <div className="flex items-center justify-between">
                                            <span className={`px-2 py-0.5 rounded text-[10px] font-black uppercase border ${
                                                item.category === 'Issue' ? 'bg-red-950 border-red-800 text-red-400' :
                                                item.category === 'Suggestion' ? 'bg-blue-950 border-blue-800 text-blue-400' :
                                                'bg-emerald-950 border-emerald-800 text-emerald-400'
                                            }`}>
                                                {item.category}
                                            </span>
                                            <span className="text-[10px] text-slate-500 font-medium">
                                                {new Date(item.createdAt).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                                            </span>
                                        </div>
                                        <p className="text-sm text-slate-200 font-medium break-words leading-relaxed whitespace-pre-wrap">{item.description}</p>
                                        
                                        {item.url && (
                                            <p className="text-[10px] text-slate-500 truncate font-semibold">
                                                Page: <span className="text-blue-500 select-all">{item.url}</span>
                                            </p>
                                        )}

                                        {item.imageUrls && item.imageUrls.length > 0 && (
                                            <div className="flex gap-2 overflow-x-auto pt-1 scrollbar-thin">
                                                {item.imageUrls.map((url, idx) => (
                                                    <a key={idx} href={url.startsWith('http') ? url : `${API_BASE_URL}${url}`} target="_blank" rel="noopener noreferrer" className="relative w-12 h-12 rounded border border-slate-800 overflow-hidden shrink-0 hover:border-slate-600 transition-colors">
                                                        <img src={url.startsWith('http') ? url : `${API_BASE_URL}${url}`} alt="Evidence" className="w-full h-full object-cover" />
                                                    </a>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                ) : (
                    <div className="p-6 space-y-5 overflow-y-auto flex-1 bg-slate-950/10">
                        {/* URL Link */}
                        <a href={currentPageUrl} target="_blank" rel="noopener noreferrer" className="block text-blue-400 hover:text-blue-300 text-sm font-semibold underline truncate break-all leading-normal">
                            {currentPageUrl}
                        </a>

                        {/* Category Select Buttons */}
                        <div className="grid grid-cols-3 gap-3">
                            {(['Issue', 'Suggestion', 'Compliment'] as const).map((type) => {
                                const isSelected = category === type;
                                return (
                                    <button
                                        key={type}
                                        type="button"
                                        onClick={() => setCategory(type)}
                                        className={`flex items-center justify-between px-4 py-3 rounded-xl border transition-all cursor-pointer font-bold text-sm select-none ${
                                            isSelected 
                                                ? 'bg-emerald-950/20 border-emerald-500 text-emerald-400 shadow-md shadow-emerald-950/30' 
                                                : 'bg-slate-950/40 border-slate-800 text-slate-400 hover:border-slate-700'
                                        }`}
                                    >
                                        <span>{type}</span>
                                        <div className={`w-4 h-4 rounded-full border flex items-center justify-center transition-all ${
                                            isSelected 
                                                ? 'border-emerald-500 bg-emerald-500' 
                                                : 'border-slate-600'
                                        }`}>
                                            {isSelected && <div className="w-1.5 h-1.5 rounded-full bg-slate-950" />}
                                        </div>
                                    </button>
                                );
                            })}
                        </div>

                        {/* Description Textarea */}
                        <textarea
                            value={description}
                            onChange={(e) => setDescription(e.target.value)}
                            placeholder="Please describe your problem..."
                            className="w-full bg-slate-950/60 border border-slate-800 text-slate-200 placeholder-slate-600 rounded-xl p-4 min-h-[120px] focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent text-sm resize-none leading-relaxed transition-all"
                            required
                        />

                        {/* Screenshot Container */}
                        <div className="border border-dashed border-slate-800 rounded-2xl p-4 bg-slate-950/30 flex flex-col gap-3">
                            <div className="flex items-center justify-between">
                                <span className="text-sm font-bold text-slate-300">
                                    Screenshot ({screenshots.length})
                                </span>
                                <button
                                    type="button"
                                    onClick={() => fileInputRef.current?.click()}
                                    className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-900 hover:bg-slate-850 text-slate-300 hover:text-white rounded-lg text-xs font-bold border border-slate-800 shadow-sm transition-all active:scale-95 cursor-pointer"
                                >
                                    <Plus size={14} /> Add more
                                </button>
                                <input
                                    type="file"
                                    ref={fileInputRef}
                                    onChange={handleFileChange}
                                    className="hidden"
                                    multiple
                                    accept="image/*"
                                />
                            </div>

                            {/* Screenshots Thumbnails */}
                            {(screenshots.length > 0 || isCapturing) && (
                                <div className="flex flex-wrap gap-3 mt-1">
                                    {screenshots.map((url, index) => (
                                        <div key={index} className="relative w-24 h-24 rounded-xl overflow-hidden border border-slate-800 group shadow-inner">
                                            <img src={url.startsWith('http') ? url : `${API_BASE_URL}${url}`} alt={`Upload ${index}`} className="w-full h-full object-cover" />
                                            <button
                                                type="button"
                                                onClick={() => removeScreenshot(index)}
                                                className="absolute top-1.5 right-1.5 bg-black/60 hover:bg-red-600 text-white rounded-full p-1 shadow-md transition-all cursor-pointer"
                                            >
                                                <X size={12} />
                                            </button>
                                        </div>
                                    ))}

                                    {isCapturing && (
                                        <div className="relative w-24 h-24 rounded-xl border border-slate-800 bg-slate-950/50 flex flex-col items-center justify-center gap-1.5 animate-pulse text-slate-500">
                                            <div className="w-4 h-4 rounded-full border-2 border-emerald-500 border-t-transparent animate-spin" />
                                            <span className="text-[10px] font-bold text-slate-400">Capturing...</span>
                                        </div>
                                    )}
                                </div>
                            )}

                            {isUploading && (
                                <div className="text-xs text-slate-500 italic animate-pulse">Uploading screenshots...</div>
                            )}
                        </div>
                    </div>
                )}

                {/* Feedback is a gift */}
                {!showHistory && (
                    <div className="text-slate-500 text-xs text-center font-semibold italic select-none my-1">
                        - Feedback is a gift -
                    </div>
                )}

                {/* Footer */}
                <div className="p-6 border-t border-slate-800 bg-slate-950/20 flex items-center justify-between">
                    <button
                        type="button"
                        onClick={() => setShowHistory(!showHistory)}
                        className="flex items-center gap-2 text-emerald-400 hover:text-emerald-300 text-sm font-bold transition-colors cursor-pointer hover:underline"
                    >
                        <Clock size={16} />
                        {showHistory ? 'Back to Form' : 'History'}
                    </button>

                    <div className="flex gap-3">
                        <button
                            type="button"
                            onClick={onClose}
                            className="px-4 py-2 bg-slate-800 hover:bg-slate-750 text-slate-300 rounded-xl text-sm font-bold transition-all active:scale-95 cursor-pointer"
                        >
                            Cancel
                        </button>
                        {!showHistory && (
                            <button
                                type="button"
                                onClick={handleSubmit}
                                disabled={isSubmitting || isUploading}
                                className="px-5 py-2 bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50 disabled:cursor-not-allowed active:scale-95 text-white font-bold rounded-xl text-sm transition-all shadow-md shadow-emerald-950/20 cursor-pointer"
                            >
                                {isSubmitting ? 'Sending...' : 'Send'}
                            </button>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
