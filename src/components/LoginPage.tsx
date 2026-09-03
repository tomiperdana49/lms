import { useState, useEffect, type FormEvent } from 'react';
import { Lock, Mail, Eye, EyeOff } from 'lucide-react';
import { GoogleLogin, type CredentialResponse } from '@react-oauth/google';
import { jwtDecode } from "jwt-decode";
import { useTranslation } from 'react-i18next';
import { API_BASE_URL } from '../config';
import type { User } from '../types';
import PopupNotification from './PopupNotification';
import LanguageSwitcher from './LanguageSwitcher';

interface LoginPageProps {
    onLogin: (user: User) => void;
    sessionExpiredReason?: 'idle' | 'absolute' | null;
    onSessionExpiredReasonShown?: () => void;
}

const LoginPage = ({ onLogin, sessionExpiredReason, onSessionExpiredReasonShown }: LoginPageProps) => {
    const { t } = useTranslation('loginPage');
    const [identifier, setIdentifier] = useState('');
    const [password, setPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [isLoading, setIsLoading] = useState(false);

    // Notification State
    const [notification, setNotification] = useState<{
        show: boolean;
        type: 'success' | 'error' | 'info';
        message: string;
    }>({ show: false, type: 'success', message: '' });

    // Show a notice if we were redirected here by an idle/absolute session timeout.
    useEffect(() => {
        if (sessionExpiredReason) {
            setNotification({
                show: true,
                type: 'info',
                message: sessionExpiredReason === 'idle' ? t('sessionExpiredIdle') : t('sessionExpiredAbsolute')
            });
            onSessionExpiredReasonShown?.();
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const handleSubmit = async (e: FormEvent) => {
        e.preventDefault();
        setIsLoading(true);

        try {
            console.log("Attempting login with:", { identifier, password }); // DEBUG
            const response = await fetch(`${API_BASE_URL}/api/login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ identifier, password })
            });

            console.log("Response status:", response.status); // DEBUG
            const data = await response.json();
            console.log("Response data:", data); // DEBUG

            if (data.success) {
                // If login success, go straight to dashboard without showing popup
                onLogin(data.user);
            } else {
                setNotification({
                    show: true,
                    type: 'error',
                    message: t('loginFailed', { message: data.message, status: response.status })
                });
                setIsLoading(false);
            }
        } catch (err) {
            console.error("Login Error:", err);
            setNotification({
                show: true,
                type: 'error',
                message: t('connectionError', { message: err instanceof Error ? err.message : 'Unknown error' })
            });
            setIsLoading(false);
        }
    };

    const handleGoogleSuccess = async (credentialResponse: CredentialResponse) => {
        if (!credentialResponse.credential) return;

        try {
            setIsLoading(true);
            const decoded = jwtDecode<{ email: string }>(credentialResponse.credential);
            const googleEmail = decoded.email;

            // Call Backend to verify/create user
            const response = await fetch(`${API_BASE_URL}/api/auth/google`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email: googleEmail })
            });

            const data = await response.json();

            if (data.success) {
                // Google login success - go straight to dashboard
                onLogin(data.user);
            } else {
                setNotification({ show: true, type: 'error', message: data.message || t('googleLoginFailed') });
                setIsLoading(false);
            }
        } catch (err) {
            console.error(err);
            setNotification({ show: true, type: 'error', message: t('googleLoginError') });
            setIsLoading(false);
        }
    };

    return (
        <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4">
            <div className="absolute top-4 right-4">
                <LanguageSwitcher variant="dark" />
            </div>

            <PopupNotification
                isOpen={notification.show}
                type={notification.type}
                message={notification.message}
                onClose={() => setNotification({ ...notification, show: false })}
            />

            <div className="bg-white w-full max-w-md rounded-2xl shadow-2xl overflow-hidden">
                <div className="bg-blue-600 p-8 text-center">
                    <div className="w-16 h-16 bg-white/20 rounded-full flex items-center justify-center mx-auto mb-4 backdrop-blur-sm">
                        <img src="/favicon.png" alt="LMS Nusa" className="w-10 h-10 object-contain" />
                    </div>
                    <h1 className="text-2xl font-bold text-white tracking-wider">{t('title')}</h1>
                    <p className="text-blue-100 text-sm mt-1">{t('subtitle')}</p>
                </div>

                <div className="p-8">
                    <form onSubmit={handleSubmit} className="space-y-6">
                        <div>
                            <label className="block text-sm font-medium text-slate-700 mb-1">{t('emailLabel')}</label>
                            <div className="relative">
                                <Mail className="absolute left-3 top-3 text-slate-400" size={18} />
                                <input
                                    type="text"
                                    value={identifier}
                                    onChange={(e) => setIdentifier(e.target.value)}
                                    className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-blue-500 outline-none"
                                    placeholder={t('emailPlaceholder')}
                                    required
                                />
                            </div>
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-slate-700 mb-1">{t('passwordLabel')}</label>
                            <div className="relative">
                                <Lock className="absolute left-3 top-3 text-slate-400" size={18} />
                                <input
                                    type={showPassword ? 'text' : 'password'}
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    className="w-full pl-10 pr-11 py-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-blue-500 outline-none"
                                    placeholder="••••••••"
                                    required
                                />
                                <button
                                    type="button"
                                    onClick={() => setShowPassword(prev => !prev)}
                                    className="absolute right-3 top-2.5 text-slate-400 hover:text-slate-600"
                                    tabIndex={-1}
                                    aria-label={showPassword ? t('hidePassword') : t('showPassword')}
                                >
                                    {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                                </button>
                            </div>
                        </div>

                        <button
                            type="submit"
                            disabled={isLoading}
                            className="w-full bg-slate-900 hover:bg-slate-800 text-white font-bold py-3 rounded-xl shadow-lg transition-transform active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            {isLoading ? t('signingIn') : t('signIn')}
                        </button>

                        <div className="relative my-6">
                            <div className="absolute inset-0 flex items-center">
                                <div className="w-full border-t border-slate-200"></div>
                            </div>
                            <div className="relative flex justify-center text-sm">
                                <span className="px-2 bg-white text-slate-500">{t('orContinueWith')}</span>
                            </div>
                        </div>

                        <div className="flex justify-center">
                            <GoogleLogin
                                onSuccess={handleGoogleSuccess}
                                onError={() => {
                                    setNotification({ show: true, type: 'error', message: t('googleLoginFailed') });
                                }}
                                useOneTap
                                width="100%"
                            />
                        </div>

                    </form>
                </div>
            </div>
        </div>
    );
};

export default LoginPage;
