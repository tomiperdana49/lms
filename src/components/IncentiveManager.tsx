import { useState, useEffect, type FormEvent } from 'react';
import { Award, Plus, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { API_BASE_URL } from '../config';
import type { User } from '../types';

interface Incentive {
    id: number;
    employeeName: string;
    courseName: string;
    startDate: string;
    endDate: string;
    monthlyAmount: number;
    status: 'Active' | 'Expired' | 'Completed';
}

const IncentiveManager = () => {
    const [incentives, setIncentives] = useState<Incentive[]>([]);
    const [users, setUsers] = useState<User[]>([]);
    const [isFormOpen, setIsFormOpen] = useState(false);
    const [formData, setFormData] = useState({
        employeeName: '',
        courseName: '',
        startDate: '',
        endDate: '',
        monthlyAmount: 0
    });

    useEffect(() => {
        const fetchData = async () => {
            try {
                const [incRes, userRes] = await Promise.all([
                    fetch(`${API_BASE_URL}/api/incentives`),
                    fetch(`${API_BASE_URL}/api/users`)
                ]);
                const incData = await incRes.json();
                const userData = await userRes.json();

                // Check expiry logic locally on load
                const today = new Date();
                const updatedInc = incData.map((inc: Incentive) => {
                    if (inc.status === 'Active' && new Date(inc.endDate) < today) {
                        return { ...inc, status: 'Expired' };
                    }
                    return inc;
                });

                setIncentives(updatedInc);
                setUsers(userData);
            } catch (err) {
                console.error("Failed to load incentives", err);
            }
        };
        fetchData();
    }, []);

    const handleSubmit = async (e: FormEvent) => {
        e.preventDefault();
        try {
            const res = await fetch(`${API_BASE_URL}/api/incentives`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(formData)
            });
            if (res.ok) {
                const newInc = await res.json();
                setIncentives([...incentives, newInc]);
                setIsFormOpen(false);
                setFormData({ employeeName: '', courseName: '', startDate: '', endDate: '', monthlyAmount: 0 });
            }
        } catch (err) { console.error(err); }
    };

    const handleStopIncentive = async (id: number) => {
        if (confirm('Stop this incentive implementation?')) {
            try {
                const res = await fetch(`${API_BASE_URL}/api/incentives/${id}`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ status: 'Completed' })
                });
                if (res.ok) {
                    const updated = await res.json();
                    setIncentives(incentives.map(i => i.id === id ? updated : i));
                }
            } catch (err) { console.error(err); }
        }
    };

    const formatCurrency = (amount: number) => {
        return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR' }).format(amount);
    };

    const activeIncentives = incentives.filter(i => i.status === 'Active');
    const expiredIncentives = incentives.filter(i => i.status === 'Expired');
    const totalMonthlyLiability = activeIncentives.reduce((sum, i) => sum + i.monthlyAmount, 0);

    return (
        <div className="space-y-8 animate-fade-in p-6">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
                        <Award className="text-amber-500" /> Certificate Incentives
                    </h1>
                    <p className="text-slate-500 mt-1">Manage monthly incentives for certified staff.</p>
                </div>
                <button
                    onClick={() => setIsFormOpen(true)}
                    className="bg-amber-500 hover:bg-amber-600 text-white px-5 py-2.5 rounded-xl font-bold shadow-lg shadow-amber-500/20 flex items-center gap-2"
                >
                    <Plus size={18} /> Add New Incentive
                </button>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
                    <p className="text-slate-500 font-medium text-sm mb-1 uppercase tracking-wider">Total Active Payout</p>
                    <h3 className="text-3xl font-bold text-slate-800">{formatCurrency(totalMonthlyLiability)}<span className="text-sm text-slate-400 font-normal">/mo</span></h3>
                </div>
                <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
                    <p className="text-slate-500 font-medium text-sm mb-1 uppercase tracking-wider">Active Licenses</p>
                    <h3 className="text-3xl font-bold text-slate-800">{activeIncentives.length}</h3>
                </div>
                <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
                    <p className="text-slate-500 font-medium text-sm mb-1 uppercase tracking-wider">Expired / Action Needed</p>
                    <h3 className={`text-3xl font-bold ${expiredIncentives.length > 0 ? 'text-red-500' : 'text-slate-800'}`}>{expiredIncentives.length}</h3>
                </div>
            </div>

            {/* Expired Alert */}
            {expiredIncentives.length > 0 && (
                <div className="bg-red-50 border border-red-100 rounded-xl p-4 flex items-start gap-3">
                    <AlertTriangle className="text-red-600 shrink-0 mt-0.5" />
                    <div>
                        <h4 className="font-bold text-red-800">Action Required: Incentives Expired</h4>
                        <p className="text-red-600 text-sm mt-1">The following incentives have passed their end date. Please review and stop payments or renew.</p>
                        <ul className="mt-2 list-disc list-inside text-sm text-red-700">
                            {expiredIncentives.map(inc => (
                                <li key={inc.id}>{inc.employeeName} - {inc.courseName} (Ended {new Date(inc.endDate).toLocaleDateString()})</li>
                            ))}
                        </ul>
                    </div>
                </div>
            )}

            {/* Active List */}
            <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
                <div className="p-6 border-b border-slate-100">
                    <h3 className="font-bold text-slate-800">Active Incentives</h3>
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full text-left">
                        <thead className="bg-slate-50 text-slate-500 text-xs uppercase font-semibold">
                            <tr>
                                <th className="px-6 py-4">Employee</th>
                                <th className="px-6 py-4">Certificate / Course</th>
                                <th className="px-6 py-4">Duration</th>
                                <th className="px-6 py-4">Monthly Amount</th>
                                <th className="px-6 py-4">Status</th>
                                <th className="px-6 py-4 text-right">Action</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {activeIncentives.map(inc => (
                                <tr key={inc.id} className="hover:bg-slate-50">
                                    <td className="px-6 py-4 font-bold text-slate-700">{inc.employeeName}</td>
                                    <td className="px-6 py-4 text-sm text-slate-600">{inc.courseName}</td>
                                    <td className="px-6 py-4 text-sm text-slate-500">
                                        {new Date(inc.startDate).toLocaleDateString()} - {new Date(inc.endDate).toLocaleDateString()}
                                    </td>
                                    <td className="px-6 py-4 font-mono font-bold text-slate-700">{formatCurrency(inc.monthlyAmount)}</td>
                                    <td className="px-6 py-4">
                                        <span className="bg-green-100 text-green-700 px-2 py-1 rounded text-xs font-bold flex items-center gap-1 w-fit">
                                            <CheckCircle2 size={12} /> Active
                                        </span>
                                    </td>
                                    <td className="px-6 py-4 text-right">
                                        <button
                                            onClick={() => handleStopIncentive(inc.id)}
                                            className="text-red-500 hover:text-red-700 text-sm font-medium hover:underline"
                                        >
                                            Stop Incentive
                                        </button>
                                    </td>
                                </tr>
                            ))}
                            {activeIncentives.length === 0 && (
                                <tr>
                                    <td colSpan={6} className="text-center py-8 text-slate-400 italic">No active incentives.</td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Modal */}
            {isFormOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden animate-in zoom-in-95">
                        <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50">
                            <h2 className="font-bold text-lg text-slate-800">New Certificate Incentive</h2>
                            <button onClick={() => setIsFormOpen(false)} className="text-slate-400 hover:text-slate-600">Close</button>
                        </div>
                        <form onSubmit={handleSubmit} className="p-6 space-y-4">
                            <div>
                                <label className="block text-sm font-semibold text-slate-700 mb-1">Employee</label>
                                <select
                                    required
                                    value={formData.employeeName}
                                    onChange={e => setFormData({ ...formData, employeeName: e.target.value })}
                                    className="w-full px-4 py-2 rounded-xl border border-slate-200 outline-none focus:ring-2 focus:ring-amber-500 bg-white"
                                >
                                    <option value="">Select Employee</option>
                                    {users.map(u => <option key={u.id || u.email} value={u.name}>{u.name}</option>)}
                                </select>
                            </div>
                            <div>
                                <label className="block text-sm font-semibold text-slate-700 mb-1">Certificate / Course Name</label>
                                <input
                                    required
                                    value={formData.courseName}
                                    onChange={e => setFormData({ ...formData, courseName: e.target.value })}
                                    className="w-full px-4 py-2 rounded-xl border border-slate-200 outline-none focus:ring-2 focus:ring-amber-500"
                                    placeholder="e.g. AWS Solutions Architect"
                                />
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-semibold text-slate-700 mb-1">Start Date</label>
                                    <input
                                        required
                                        type="date"
                                        value={formData.startDate}
                                        onChange={e => setFormData({ ...formData, startDate: e.target.value })}
                                        className="w-full px-4 py-2 rounded-xl border border-slate-200 outline-none focus:ring-2 focus:ring-amber-500"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-semibold text-slate-700 mb-1">End Date</label>
                                    <input
                                        required
                                        type="date"
                                        value={formData.endDate}
                                        onChange={e => setFormData({ ...formData, endDate: e.target.value })}
                                        className="w-full px-4 py-2 rounded-xl border border-slate-200 outline-none focus:ring-2 focus:ring-amber-500"
                                    />
                                </div>
                            </div>
                            <div>
                                <label className="block text-sm font-semibold text-slate-700 mb-1">Monthly Incentive Amount (IDR)</label>
                                <div className="relative">
                                    <span className="absolute left-4 top-2 text-slate-500 font-bold">Rp</span>
                                    <input
                                        required
                                        type="number"
                                        value={formData.monthlyAmount}
                                        onChange={e => setFormData({ ...formData, monthlyAmount: parseInt(e.target.value) })}
                                        className="w-full pl-10 pr-4 py-2 rounded-xl border border-slate-200 outline-none focus:ring-2 focus:ring-amber-500"
                                        placeholder="0"
                                    />
                                </div>
                            </div>
                            <button className="w-full py-3 bg-amber-500 hover:bg-amber-600 text-white font-bold rounded-xl shadow-lg shadow-amber-500/20 mt-4">
                                Activate Incentive
                            </button>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
};

export default IncentiveManager;
