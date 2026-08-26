import { CheckCircle, XCircle, X, Info } from 'lucide-react';
import { useTranslation } from 'react-i18next';

export interface PopupNotificationProps {
    type: 'success' | 'error' | 'info';
    message: string;
    isOpen: boolean;
    onClose: () => void;
}

const PopupNotification = ({ type, message, isOpen, onClose }: PopupNotificationProps) => {
    const { t } = useTranslation('popupNotification');
    const isSuccess = type === 'success';
    const isError = type === 'error';

    return (
        <div className={`fixed inset-0 z-[100] flex items-center justify-center p-4 transition-all duration-300 ${isOpen ? 'bg-slate-900/50 backdrop-blur-sm opacity-100' : 'bg-transparent opacity-0 pointer-events-none'}`}>
            <div
                className={`bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden transform transition-all duration-300 ${isOpen ? 'scale-100 translate-y-0' : 'scale-95 translate-y-4'}`}
            >
                <div className={`h-2 w-full ${isSuccess ? 'bg-teal-500' : isError ? 'bg-red-500' : 'bg-blue-500'}`} />

                <div className="p-6 relative">
                    <button
                        onClick={onClose}
                        className="absolute top-4 right-4 text-slate-400 hover:text-slate-600 transition-colors"
                    >
                        <X size={20} />
                    </button>

                    <div className="flex flex-col items-center text-center space-y-4">
                        <div className={`p-4 rounded-full ${isSuccess ? 'bg-teal-50 text-teal-500' : isError ? 'bg-red-50 text-red-500' : 'bg-blue-50 text-blue-500'}`}>
                            {isSuccess ? <CheckCircle size={40} strokeWidth={2.5} /> : isError ? <XCircle size={40} strokeWidth={2.5} /> : <Info size={40} strokeWidth={2.5} />}
                        </div>

                        <div>
                            <h3 className={`text-xl font-bold mb-1 ${isSuccess ? 'text-slate-800' : isError ? 'text-red-600' : 'text-slate-800'}`}>
                                {isSuccess ? t('success') : isError ? t('error') : t('information')}
                            </h3>
                            <p className="text-slate-500 text-sm leading-relaxed whitespace-pre-line">
                                {message}
                            </p>
                        </div>

                        <button
                            onClick={onClose}
                            className={`w-full py-2.5 rounded-xl font-bold text-white transition-all shadow-lg active:scale-95 ${isSuccess
                                ? 'bg-teal-600 hover:bg-teal-700 shadow-teal-200'
                                : isError
                                    ? 'bg-red-600 hover:bg-red-700 shadow-red-200'
                                    : 'bg-blue-600 hover:bg-blue-700 shadow-blue-200'
                                }`}
                        >
                            {isSuccess ? t('continue') : isError ? t('tryAgain') : t('close')}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default PopupNotification;

