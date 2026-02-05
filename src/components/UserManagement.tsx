import { useState, useEffect, type FormEvent } from 'react';
import { Users, UserPlus, Mail, Lock, Shield, ArrowLeft, Edit, Briefcase, MapPin, Trash2 } from 'lucide-react';
import { API_BASE_URL } from '../config';
import type { Role, User, Employee } from '../types';
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
    const [employees, setEmployees] = useState<Employee[]>([]);
    const [searchTerm, setSearchTerm] = useState('');
    const [formData, setFormData] = useState({
        name: '',
        email: '',
        password: '',
        role: 'STAFF' as Role,
        employee_id: ''
    });

    useEffect(() => {
        const fetchData = async () => {
            try {
                const [usersRes, employeesRes] = await Promise.all([
                    fetch(`${API_BASE_URL}/api/users`),
                    fetch(`${API_BASE_URL}/api/employees`)
                ]);

                if (usersRes.ok) {
                    const usersData = await usersRes.json();
                    if (Array.isArray(usersData)) setUsers(usersData);
                }

                if (employeesRes.ok) {
                    const empData = await employeesRes.json();
                    if (Array.isArray(empData)) setEmployees(empData);
                }

            } catch (err) {
                console.error(err);
                setNotification({ show: true, type: 'error', message: 'Failed to load data.' });
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
                    setFormData({ name: '', email: '', password: '', role: 'STAFF', employee_id: '' });
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
                    setFormData({ name: '', email: '', password: '', role: 'STAFF', employee_id: '' });
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
            password: '', // Keep empty
            role: user.role,
            employee_id: user.employee_id || ''
        });
        setIsFormOpen(true);
    };

    const handleDelete = async (id: string) => {
        if (!window.confirm('Are you sure you want to delete this user? This will revoke their access to the LMS.')) return;
        try {
            const res = await fetch(`${API_BASE_URL}/api/users/${id}`, { method: 'DELETE' });
            if (res.ok) {
                setUsers(users.filter(u => u.id !== id));
                setNotification({ show: true, type: 'success', message: 'User deleted successfully!' });
            } else {
                setNotification({ show: true, type: 'error', message: 'Failed to delete user' });
            }
        } catch (error) {
            console.error(error);
            setNotification({ show: true, type: 'error', message: 'Error deleting user' });
        }
    };

    if (userRole !== 'HR' && userRole !== 'HR_ADMIN') {
        return <div className="p-8 text-center text-red-500">Access Denied. HR Only.</div>;
    }

    const filteredEmployees = employees.filter(emp =>
        emp.full_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        emp.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
        emp.id_employee.toLowerCase().includes(searchTerm.toLowerCase())
    );

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

            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-8">
                <div>
                    <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
                        <Users className="text-purple-600" /> User Management
                    </h1>
                    <p className="text-sm text-slate-500 mt-1">Manage staff access and roles ({employees.length} Employees total).</p>
                </div>
                <div className="flex w-full md:w-auto gap-3">
                    <input
                        type="text"
                        placeholder="Search employee..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="flex-1 md:w-64 px-4 py-2.5 rounded-xl border border-slate-200 outline-none focus:ring-2 focus:ring-purple-500 bg-white"
                    />
                    <button
                        onClick={() => {
                            setEditingUser(null);
                            setFormData({ name: '', email: '', password: '', role: 'STAFF', employee_id: '' });
                            setIsFormOpen(true);
                        }}
                        className="bg-purple-600 hover:bg-purple-700 text-white px-5 py-2.5 rounded-xl font-semibold shadow-lg shadow-purple-900/20 flex items-center gap-2 whitespace-nowrap"
                    >
                        <UserPlus size={18} /> Add User
                    </button>
                </div>
            </div>

            {/* Existing Users List */}
            <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden mb-8">
                <div className="p-4 bg-slate-50 border-b border-slate-100 font-semibold text-slate-600 flex items-center text-sm">
                    <div className="w-12 text-center">ID</div>
                    <div className="flex-1 pl-2">Employee Name / Email</div>
                    <div className="w-48">Position / Branch</div>
                    <div className="w-32 text-center">LMS Status</div>
                    <div className="w-16 text-center">Action</div>
                </div>
                <div className="divide-y divide-slate-50 max-h-[600px] overflow-y-auto">
                    {filteredEmployees.map((emp) => {
                        const linkedUser = users.find(u => u.employee_id === emp.id_employee);
                        return (
                            <div key={emp.id_employee} className="p-4 flex items-center hover:bg-slate-50 transition-colors">
                                <div className="w-12 text-xs font-mono text-slate-400 text-center">{emp.id_employee}</div>
                                <div className="flex-1 pl-2">
                                    <div className="font-bold text-slate-800">{emp.full_name}</div>
                                    <div className="text-sm text-slate-500">{emp.email}</div>
                                </div>
                                <div className="w-48 text-sm text-slate-500">
                                    <div className="space-y-1">
                                        <div className="flex items-center gap-2 text-slate-600">
                                            <Briefcase size={14} />
                                            <span className="truncate">{emp.job_position}</span>
                                        </div>
                                        <div className="flex items-center gap-2 text-slate-400 text-xs">
                                            <MapPin size={12} />
                                            <span className="truncate">{emp.branch_name || 'No Branch'}</span>
                                        </div>
                                    </div>
                                </div>
                                <div className="w-32 text-center">
                                    {linkedUser ? (
                                        <div className="flex flex-col gap-1 items-center">
                                            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-lg 
                                                ${(linkedUser.role === 'HR' || linkedUser.role === 'HR_ADMIN') ? 'bg-orange-100 text-orange-700' :
                                                    linkedUser.role === 'SUPERVISOR' ? 'bg-blue-100 text-blue-700' :
                                                        'bg-green-100 text-green-700'}`}>
                                                {linkedUser.role}
                                            </span>
                                            <span className="text-[10px] text-green-600 font-medium">Active Account</span>
                                        </div>
                                    ) : (
                                        <span className="text-xs text-slate-300 italic">No Access</span>
                                    )}
                                </div>
                                <div className="w-16 flex justify-center">
                                    {linkedUser ? (
                                        <div className="flex gap-1">
                                            <button
                                                onClick={() => handleEdit(linkedUser)}
                                                className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                                                title="Edit LMS Access"
                                            >
                                                <Edit size={18} />
                                            </button>
                                            <button
                                                onClick={() => handleDelete(String(linkedUser.id))}
                                                className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                                                title="Revoke LMS Access"
                                            >
                                                <Trash2 size={18} />
                                            </button>
                                        </div>
                                    ) : (
                                        <button
                                            onClick={() => {
                                                setEditingUser(null);
                                                setFormData({
                                                    name: emp.full_name,
                                                    email: emp.email,
                                                    password: '',
                                                    role: 'STAFF',
                                                    employee_id: emp.id_employee
                                                });
                                                setIsFormOpen(true);
                                            }}
                                            className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                                            title="Create LMS Account"
                                        >
                                            <UserPlus size={18} />
                                        </button>
                                    )}
                                </div>
                            </div>
                        );
                    })}
                    {filteredEmployees.length === 0 && (
                        <div className="p-8 text-center text-slate-500 italic">No employees found.</div>
                    )}
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
                                        // Password required only on creation
                                        required={!editingUser}
                                        type="password"
                                        placeholder={editingUser ? "(Leave blank to keep current)" : ""}
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
                            <div>
                                <label className="block text-sm font-semibold text-slate-700 mb-1">SimAsset Employee Link (Optional)</label>
                                <div className="relative">
                                    <Briefcase size={16} className="absolute left-3 top-3 text-slate-400" />
                                    <select
                                        value={formData.employee_id}
                                        onChange={e => {
                                            const empId = e.target.value;
                                            const emp = employees.find(ep => ep.id_employee === empId);
                                            setFormData({
                                                ...formData,
                                                employee_id: empId,
                                                // Auto-fill if empty
                                                name: (!formData.name && emp) ? emp.full_name : formData.name,
                                                email: (!formData.email && emp) ? emp.email : formData.email
                                            });
                                        }}
                                        className="w-full pl-10 pr-4 py-2 rounded-xl border border-slate-200 outline-none focus:ring-2 focus:ring-purple-500 bg-white"
                                    >
                                        <option value="">-- No Link --</option>
                                        {employees.map(emp => (
                                            <option key={emp.id} value={emp.id_employee}>
                                                {emp.full_name} ({emp.job_position})
                                            </option>
                                        ))}
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
