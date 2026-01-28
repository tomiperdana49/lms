import { useState, useEffect, type FormEvent } from 'react';
import { Users, UserPlus, Mail, Lock, Shield, ArrowLeft, Edit } from 'lucide-react';
import { API_BASE_URL } from '../config';
import type { Role, User } from '../types';
import PopupNotification from './PopupNotification';

interface UserManagementProps {
    userRole: Role;
    onBack: () => void;
}

const UserManagement = ({ userRole, onBack }: UserManagementProps) => {
    const [users, setUsers] = useState<User[]>([]);
    const [isFormOpen, setIsFormOpen] = useState(false);
    const [isLoading, setIsLoading] = useState(true);
    const [notification, setNotification] = useState<{ show: boolean; type: 'success' | 'error'; message: string }>({ show: false, type: 'success', message: '' });
    const [editingUser, setEditingUser] = useState<User | null>(null);
    const [formData, setFormData] = useState({
        name: '',
        email: '',
        password: '',
        role: 'STAFF' as Role
    });

    useEffect(() => {
        const fetchData = async () => {
            try {
                const res = await fetch(`${API_BASE_URL}/api/users`);
                if (!res.ok) throw new Error('Failed to fetch users');

                const usersData = await res.json();
                if (Array.isArray(usersData)) {
                    setUsers(usersData);
                } else {
                    console.error("API did not return an array", usersData);
                    setUsers([]);
                }
            } catch (err) {
                console.error(err);
                setNotification({ show: true, type: 'error', message: 'Failed to load users. See console.' });
            } finally {
                setIsLoading(false);
            }
        };
        fetchData();
    }, []);

    const handleSubmit = async (e: FormEvent) => {
        e.preventDefault();
        try {
            if (editingUser) {
                // UPDATE
                const res = await fetch(`${API_BASE_URL}/api/users/${editingUser.id}`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(formData)
                });
                if (res.ok) {
                    const updated = await res.json();
                    setUsers(users.map(u => u.id === updated.id ? updated : u));
                    setIsFormOpen(false);
                    setEditingUser(null);
                    setFormData({ name: '', email: '', password: '', role: 'STAFF' });
                    setNotification({ show: true, type: 'success', message: 'User updated successfully!' });
                } else {
                    setNotification({ show: true, type: 'error', message: 'Failed to update user' });
                }
            } else {
                // CREATE
                const res = await fetch(`${API_BASE_URL}/api/users`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(formData)
                });
                if (res.ok) {
                    const newUser = await res.json();
                    setUsers([...users, newUser]);
                    setIsFormOpen(false);
                    setFormData({ name: '', email: '', password: '', role: 'STAFF' });
                    setNotification({ show: true, type: 'success', message: 'User created successfully!' });
                } else {
                    const err = await res.json();
                    setNotification({ show: true, type: 'error', message: err.message || 'Failed to create user' });
                }
            }
        } catch (error) {
            console.error(error);
        }
    };

    const handleEdit = (user: User) => {
        setEditingUser(user);
        setFormData({
            name: user.name,
            email: user.email,
            password: '', // Keep empty or handle password update logic separately (optional)
            role: user.role
        });
        setIsFormOpen(true);
    };

    if (userRole !== 'HR' && userRole !== 'HR_ADMIN') {
        return <div className="p-8 text-center text-red-500">Access Denied. HR Only.</div>;
    }

    if (isLoading) return <div className="p-8 text-center">Loading...</div>;

    return (
        <div className="max-w-6xl mx-auto py-6">
            <PopupNotification
                isOpen={notification.show}
                type={notification.type}
                message={notification.message}
                onClose={() => setNotification({ ...notification, show: false })}
            />
            <button onClick={onBack} className="text-sm text-slate-500 hover:text-blue-600 flex items-center gap-1 mb-4 transition-colors">
                <ArrowLeft size={14} /> Back to Dashboard
            </button>

            <div className="flex justify-between items-center mb-8">
                <div>
                    <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
                        <Users className="text-purple-600" /> User Management
                    </h1>
                    <p className="text-sm text-slate-500 mt-1">Manage staff access and roles.</p>
                </div>
                <button
                    onClick={() => setIsFormOpen(!isFormOpen)}
                    className="bg-purple-600 hover:bg-purple-700 text-white px-5 py-2.5 rounded-xl font-semibold shadow-lg shadow-purple-900/20 flex items-center gap-2"
                >
                    <UserPlus size={18} /> Add New User
                </button>
            </div>

            {/* Existing Users List */}
            <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden mb-8">
                <div className="p-4 bg-slate-50 border-b border-slate-100 font-semibold text-slate-600 flex items-center text-sm">
                    <div className="flex-1 pl-2">Name / Email</div>
                    <div className="w-32 text-center">Role</div>
                    <div className="w-16 text-center">Edit</div>
                </div>
                <div className="divide-y divide-slate-50">
                    {users.map((u) => {
                        return (
                            <div key={u.id || u.email} className="p-4 flex items-center hover:bg-slate-50 transition-colors">
                                <div className="flex-1 pl-2">
                                    <div className="font-bold text-slate-800">{u.name}</div>
                                    <div className="text-sm text-slate-500">{u.email}</div>
                                </div>
                                <div className="w-32 text-center">
                                    <span className={`text-xs font-bold px-2 py-1 rounded-lg 
                                        ${(u.role === 'HR' || u.role === 'HR_ADMIN') ? 'bg-orange-100 text-orange-700' :
                                            u.role === 'SUPERVISOR' ? 'bg-blue-100 text-blue-700' :
                                                'bg-green-100 text-green-700'}`}>
                                        {u.role}
                                    </span>
                                </div>
                                <div className="w-16 flex justify-center">
                                    <button
                                        onClick={() => handleEdit(u)}
                                        className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                                        title="Edit User"
                                    >
                                        <Edit size={18} />
                                    </button>
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* Modal / Form */}
            {isFormOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden animate-in zoom-in-95">
                        <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50">
                            <h2 className="font-bold text-lg text-slate-800">{editingUser ? 'Edit User' : 'Create New User'}</h2>
                            <button onClick={() => { setIsFormOpen(false); setEditingUser(null); }} className="text-slate-400 hover:text-slate-600">Close</button>
                        </div>
                        <form onSubmit={handleSubmit} className="p-6 space-y-4">
                            <div>
                                <label className="block text-sm font-semibold text-slate-700 mb-1">Full Name</label>
                                <input
                                    required
                                    value={formData.name}
                                    onChange={e => setFormData({ ...formData, name: e.target.value })}
                                    className="w-full px-4 py-2 rounded-xl border border-slate-200 outline-none focus:ring-2 focus:ring-purple-500"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-semibold text-slate-700 mb-1">Email</label>
                                <div className="relative">
                                    <Mail size={16} className="absolute left-3 top-3 text-slate-400" />
                                    <input
                                        required
                                        type="email"
                                        value={formData.email}
                                        onChange={e => setFormData({ ...formData, email: e.target.value })}
                                        className="w-full pl-10 pr-4 py-2 rounded-xl border border-slate-200 outline-none focus:ring-2 focus:ring-purple-500"
                                    />
                                </div>
                            </div>
                            <div>
                                <label className="block text-sm font-semibold text-slate-700 mb-1">Password</label>
                                <div className="relative">
                                    <Lock size={16} className="absolute left-3 top-3 text-slate-400" />
                                    <input
                                        required
                                        type="password"
                                        value={formData.password}
                                        onChange={e => setFormData({ ...formData, password: e.target.value })}
                                        className="w-full pl-10 pr-4 py-2 rounded-xl border border-slate-200 outline-none focus:ring-2 focus:ring-purple-500"
                                    />
                                </div>
                            </div>
                            <div>
                                <label className="block text-sm font-semibold text-slate-700 mb-1">Role</label>
                                <div className="relative">
                                    <Shield size={16} className="absolute left-3 top-3 text-slate-400" />
                                    <select
                                        value={formData.role}
                                        onChange={e => setFormData({ ...formData, role: e.target.value as Role })}
                                        className="w-full pl-10 pr-4 py-2 rounded-xl border border-slate-200 outline-none focus:ring-2 focus:ring-purple-500 bg-white"
                                    >
                                        <option value="STAFF">Staff</option>
                                        <option value="SUPERVISOR">Supervisor</option>
                                        <option value="HR">HR Admin</option>
                                    </select>
                                </div>
                            </div>
                            <button className="w-full py-3 bg-purple-600 hover:bg-purple-700 text-white font-bold rounded-xl shadow-lg shadow-purple-900/20 mt-4">
                                {editingUser ? 'Update User' : 'Create Account'}
                            </button>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
};

export default UserManagement;
