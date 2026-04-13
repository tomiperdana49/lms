
import { AlertCircle, CheckCircle } from 'lucide-react';

interface ConfirmationModalProps {
    isOpen: boolean;
    onClose: () => void;
    onConfirm: (inputValue?: string) => void;
    title: string;
    message: string;
    confirmText?: string;
    cancelText?: string;
    variant?: 'danger' | 'warning' | 'info' | 'success';
    hideConfirm?: boolean;
    showInput?: boolean;
    inputPlaceholder?: string;
    inputValue?: string;
    onInputChange?: (value: string) => void;
}

const ConfirmationModal = ({
    isOpen,
    onClose,
    onConfirm,
    title,
    message,
    confirmText = 'Confirm',
    cancelText = 'Cancel',
    variant = 'danger',
    hideConfirm = false,
    showInput = false,
    inputPlaceholder = 'Masukkan catatan...',
    inputValue = '',
    onInputChange = () => { }
}: ConfirmationModalProps) => {
    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden p-6 scale-100 animate-in zoom-in-95">
                <div className="flex flex-col items-center text-center">
                    <div className={`p-3 rounded-full mb-4 ${variant === 'danger' ? 'bg-red-100 text-red-600' :
                            variant === 'warning' ? 'bg-orange-100 text-orange-600' :
                                variant === 'success' ? 'bg-emerald-100 text-emerald-600' :
                                    'bg-blue-100 text-blue-600'
                        }`}>
                        {variant === 'success' ? <CheckCircle size={32} /> : <AlertCircle size={32} />}
                    </div>

                    <h3 className="text-xl font-bold text-slate-800 mb-2">{title}</h3>
                    <p className="text-slate-500 mb-4 text-sm">{message}</p>
                    
                    {showInput && (
                        <div className="w-full mb-6">
                            <textarea
                                value={inputValue}
                                onChange={(e) => onInputChange(e.target.value)}
                                placeholder={inputPlaceholder}
                                className="w-full px-4 py-2 text-sm border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none resize-none min-h-[80px]"
                                required
                            />
                        </div>
                    )}

                    <div className="flex gap-3 w-full">
                        <button
                            onClick={onClose}
                            className={`flex-1 py-2.5 rounded-xl border border-slate-200 font-bold transition-colors ${hideConfirm ? 'bg-blue-600 text-white hover:bg-blue-700 shadow-lg' : 'text-slate-600 hover:bg-slate-50'}`}
                        >
                            {cancelText}
                        </button>
                        {!hideConfirm && (
                            <button
                                onClick={() => { onConfirm(showInput ? inputValue : undefined); onClose(); }}
                                className={`flex-1 py-2.5 rounded-xl text-white font-bold shadow-lg transition-colors ${variant === 'danger' ? 'bg-red-600 hover:bg-red-700 shadow-red-200' :
                                        variant === 'warning' ? 'bg-orange-500 hover:bg-orange-600 shadow-orange-200' :
                                            variant === 'success' ? 'bg-emerald-600 hover:bg-emerald-700 shadow-emerald-200' :
                                                'bg-blue-600 hover:bg-blue-700 shadow-blue-200'
                                    }`}
                            >
                                {confirmText}
                            </button>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default ConfirmationModal;
