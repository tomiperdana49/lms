import { useState, type FormEvent } from 'react';
import { LogIn, Lock, Mail } from 'lucide-react';
import { API_BASE_URL } from '../config';
import type { User } from '../types';
import PopupNotification from './PopupNotification';

interface LoginPageProps {
    onLogin: (user: User) => void;
}

const LoginPage = ({ onLogin }: LoginPageProps) => {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [isLoading, setIsLoading] = useState(false);

    // Notification State
    const [notification, setNotification] = useState<{
        show: boolean;
        type: 'success' | 'error';
        message: string;
    }>({ show: false, type: 'success', message: '' });

    const handleSubmit = async (e: FormEvent) => {
        e.preventDefault();
        setIsLoading(true);

        try {
            const response = await fetch(`${API_BASE_URL}/api/login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, password })
            });

            const data = await response.json();

            if (data.success) {
                // Show Success Popup
                setNotification({
                    show: true,
                    type: 'success',
                    message: 'Login successful! Redirecting to dashboard...'
                });

                // Delay actual login action to let user see the popup
                setTimeout(() => {
                    onLogin(data.user);
                }, 1500);
            } else {
                setNotification({
                    show: true,
                    type: 'error',
                    message: data.message || 'Login failed. Please check your credentials.'
                });
                setIsLoading(false); // Only stop loading on error, keep loading on success until redirect
            }
        } catch {
            setNotification({
                show: true,
                type: 'error',
                message: 'Unable to connect to server. Please check your internet connection.'
            });
            setIsLoading(false);
        }
    };

    return (
        <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4">
            <PopupNotification
                isOpen={notification.show}
                type={notification.type}
                message={notification.message}
                onClose={() => setNotification({ ...notification, show: false })}
            />

            <div className="bg-white w-full max-w-md rounded-2xl shadow-2xl overflow-hidden">
                <div className="bg-blue-600 p-8 text-center">
                    <div className="w-16 h-16 bg-white/20 rounded-full flex items-center justify-center mx-auto mb-4 backdrop-blur-sm">
                        <LogIn className="text-white" size={32} />
                    </div>
                    <h1 className="text-2xl font-bold text-white tracking-wider">LMS NUSA</h1>
                    <p className="text-blue-100 text-sm mt-1">Learning Management System</p>
                </div>

                <div className="p-8">
                    <form onSubmit={handleSubmit} className="space-y-6">
                        <div>
                            <label className="block text-sm font-medium text-slate-700 mb-1">Email Address</label>
                            <div className="relative">
                                <Mail className="absolute left-3 top-3 text-slate-400" size={18} />
                                <input
                                    type="email"
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-blue-500 outline-none"
                                    placeholder="yourname@nusa.com"
                                    required
                                />
                            </div>
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-slate-700 mb-1">Password</label>
                            <div className="relative">
                                <Lock className="absolute left-3 top-3 text-slate-400" size={18} />
                                <input
                                    type="password"
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-blue-500 outline-none"
                                    placeholder="••••••••"
                                    required
                                />
                            </div>
                        </div>

                        <button
                            type="submit"
                            disabled={isLoading}
                            className="w-full bg-slate-900 hover:bg-slate-800 text-white font-bold py-3 rounded-xl shadow-lg transition-transform active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            {isLoading ? 'Signing in...' : 'Sign In'}
                        </button>

                        <div className="text-center text-xs text-slate-400 mt-4">
                            <p>Demo Accounts:</p>
                            <p>Staff: staff@nusa.com / 123</p>
                            <p>Supervisor: spv@nusa.com / 123</p>
                            <p>HR: hr@nusa.com / 123</p>
                        </div>
                    </form>
                </div>
            </div>
        </div>
    );
};

export default LoginPage;
