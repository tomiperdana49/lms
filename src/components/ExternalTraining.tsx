import { useState, useEffect, type FormEvent } from 'react';
import type { ExternalTrainingRequest, User } from '../types';
import { API_BASE_URL } from '../config';
import {
 BookOpen,
 CheckCircle,
 XCircle,

 DollarSign,
 Briefcase,
 Link,
 Save,
 User as UserIcon,
 Calendar
} from 'lucide-react';
import PopupNotification from './PopupNotification';

type TabType = 'my_requests' | 'team_approvals';

interface ExternalTrainingProps {
 currentUser: User | null;
 isManagementMode: boolean;
 defaultTab?: TabType;
}

export default function ExternalTraining({ currentUser, isManagementMode, defaultTab }: ExternalTrainingProps) {
 const [activeTab, setActiveTab] = useState<TabType>(defaultTab || 'my_requests');

 useEffect(() => {
 if (defaultTab) setActiveTab(defaultTab);
 }, [defaultTab]);
 const [requests, setRequests] = useState<ExternalTrainingRequest[]>([]);
 const [teamRequests, setTeamRequests] = useState<ExternalTrainingRequest[]>([]);
 
 const [notification, setNotification] = useState({ show: false, type: 'success' as 'success' | 'error', message: '' });
 const [isLoading, setIsLoading] = useState(false);

    const [rejectModalOpen, setRejectModalOpen] = useState(false);
    const [selectedRequestId, setSelectedRequestId] = useState<number | null>(null);
    const [rejectionReason, setRejectionReason] = useState('');


 // Form States for Request
 const [category, setCategory] = useState('Training');
 const [title, setTitle] = useState('');
 const [vendor, setVendor] = useState('');
 const [location, setLocation] = useState('');
 const [startDate, setStartDate] = useState('');
 const [endDate, setEndDate] = useState('');
 const [regFee, setRegFee] = useState('');
 const [attachment, setAttachment] = useState('');


 useEffect(() => {
 if (!currentUser) return;
 if (activeTab === 'my_requests') fetchMyRequests();
 if (activeTab === 'team_approvals') fetchTeamRequests();
  }, [activeTab, currentUser, isManagementMode]);

 const fetchMyRequests = async () => {
 try {
 const res = await fetch(`${API_BASE_URL}/api/external-training/my-requests?employee_id=${currentUser?.employee_id || ''}`);
 if (res.ok) setRequests(await res.json());
 } catch (err) { console.error(err); }
 };

 const fetchTeamRequests = async () => {
 try {
 const res = await fetch(`${API_BASE_URL}/api/external-training/subordinates?leader_id=${currentUser?.employee_id || ''}`);
 if (res.ok) setTeamRequests(await res.json());
 } catch (err) { console.error(err); }
 };

 const showNotif = (type: 'success'|'error', message: string) => {
 setNotification({ show: true, type, message });
 setTimeout(() => setNotification(n => ({ ...n, show: false })), 3000);
 };

 const handleRequestSubmit = async (e: FormEvent) => {
 e.preventDefault();
 if (!currentUser) return;
 setIsLoading(true);
 try {
 const res = await fetch(`${API_BASE_URL}/api/external-training/request`, {
 method: 'POST',
 headers: { 'Content-Type': 'application/json' },
 body: JSON.stringify({
 employee_id: currentUser.employee_id,
 employee_name: currentUser.name,
 category,
 title,
 start_date: startDate,
 end_date: endDate,
 registration_fee: Number(regFee.replace(/\./g, '')) || 0,
 attachment_link: attachment,
 vendor,
 location
 })
 });
 if (res.ok) {
 showNotif('success', 'Request submitted successfully!');
 setTitle(''); setVendor(''); setLocation(''); setRegFee(''); setAttachment(''); setStartDate(''); setEndDate('');
 fetchMyRequests();
 } else {
 throw new Error('Failed to submit request');
 }
 } catch (err: any) {
 showNotif('error', err.message);
 } finally {
 setIsLoading(false);
 }
 };

 const handleApproveReject = async (id: number, status: 'Approved' | 'Rejected', reason?: string) => {
 try {
 const bodyData: any = {
 id,
 status,
 approved_by: currentUser?.name || 'Leader'
 };
 if (status === 'Rejected' && reason) {
 bodyData.rejection_reason = reason;
 }

 const res = await fetch(`${API_BASE_URL}/api/external-training/approve`, {
 method: 'POST',
 headers: { 'Content-Type': 'application/json' },
 body: JSON.stringify(bodyData)
 });

 if (!res.ok) throw new Error('Failed to update request');
 setNotification({ show: true, type: 'success', message: `Request successfully ${status.toLowerCase()}` });
 fetchTeamRequests();
 if (status === 'Rejected') {
 setRejectModalOpen(false);
 setRejectionReason('');
 setSelectedRequestId(null);
 }
 } catch (error) {
 console.error(error);
 setNotification({ show: true, type: 'error', message: 'An error occurred while updating the request' });
 }
 };

 const confirmReject = () => {
 if (selectedRequestId !== null && rejectionReason.trim() !== '') {
 handleApproveReject(selectedRequestId, 'Rejected', rejectionReason);
 }
 };

 const formatRp = (num: number) => new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR' }).format(num);

 return (
 <div className="space-y-6 animate-in fade-in">
 {notification.show && (
 <PopupNotification isOpen={notification.show} type={notification.type} message={notification.message} onClose={() => setNotification(n => ({...n, show: false}))} />
 )}

 <div className="flex flex-wrap items-center justify-between gap-4">
 <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-3">
 <Briefcase className="w-8 h-8 text-blue-600 " />
 External Training
 </h1>
 </div>

 {/* Tabs */}
 <div className="flex border-b border-gray-200 ">
 <button
 className={`px-4 py-2 border-b-2 font-medium text-sm transition-colors ${activeTab === 'my_requests' ? 'border-blue-600 text-blue-600 ' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
 onClick={() => setActiveTab('my_requests')}
 >
 My Requests
 </button>
 <button
 className={`px-4 py-2 border-b-2 font-medium text-sm transition-colors ${activeTab === 'team_approvals' ? 'border-blue-600 text-blue-600 ' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
 onClick={() => setActiveTab('team_approvals')}
 >
 Team Approvals
 </button>

 </div>

 {/* My Requests Tab */}
 {activeTab === 'my_requests' && (
 <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
 <div className="lg:col-span-1 bg-white rounded-xl shadow-sm border border-gray-100 p-6">
 <h2 className="text-lg font-semibold text-gray-800 mb-4">New Request</h2>
 <form onSubmit={handleRequestSubmit} className="space-y-4">
 <div>
 <label className="block text-sm font-medium text-gray-700 mb-1">Category</label>
 <select value={category} onChange={e => setCategory(e.target.value)} className="w-full px-4 py-2 bg-gray-50 border border-gray-200 rounded-lg">
 <option>Training</option>
 <option>Sertifikat</option>
 <option>Modul</option>
 </select>
 </div>
 <div>
 <label className="block text-sm font-medium text-gray-700 mb-1">Title / Course Name</label>
 <input required type="text" value={title} onChange={e => setTitle(e.target.value)} className="w-full px-4 py-2 bg-gray-50 border border-gray-200 rounded-lg" placeholder="e.g. Advanced Leadership" />
 </div>
 <div className="grid grid-cols-2 gap-4">
 <div>
 <label className="block text-sm font-medium text-gray-700 mb-1">Vendor</label>
 <input required type="text" value={vendor} onChange={e => setVendor(e.target.value)} className="w-full px-4 py-2 bg-gray-50 border border-gray-200 rounded-lg" placeholder="e.g. Coursera" />
 </div>
 <div>
 <label className="block text-sm font-medium text-gray-700 mb-1">Location</label>
 <input type="text" value={location} onChange={e => setLocation(e.target.value)} className="w-full px-4 py-2 bg-gray-50 border border-gray-200 rounded-lg" placeholder="e.g. Jakarta (Online)" />
 </div>
 </div>
 <div className="grid grid-cols-2 gap-4">
 <div>
 <label className="block text-sm font-medium text-gray-700 mb-1">Start Date</label>
 <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="w-full px-4 py-2 bg-gray-50 border border-gray-200 rounded-lg" />
 </div>
 <div>
 <label className="block text-sm font-medium text-gray-700 mb-1">End Date</label>
 <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className="w-full px-4 py-2 bg-gray-50 border border-gray-200 rounded-lg" />
 </div>
 </div>
 <div>
 <label className="block text-sm font-medium text-gray-700 mb-1">Registration Fee (Rp)</label>
 <input 
 required 
 type="text" 
 value={regFee} 
 onChange={e => {
 const rawValue = e.target.value.replace(/\D/g, '');
 if (rawValue === '') setRegFee('');
 else setRegFee(new Intl.NumberFormat('id-ID').format(Number(rawValue)));
 }} 
 className="w-full px-4 py-2 bg-gray-50 border border-gray-200 rounded-lg" 
 placeholder="0" 
 />
 </div>
 <div>
 <label className="block text-sm font-medium text-gray-700 mb-1">Attachment Link (Optional)</label>
 <input type="url" value={attachment} onChange={e => setAttachment(e.target.value)} className="w-full px-4 py-2 bg-gray-50 border border-gray-200 rounded-lg" placeholder="Google Drive link, etc." />
 </div>
 <button disabled={isLoading} type="submit" className="w-full py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors">
 {isLoading ? 'Submitting...' : 'Submit Request'}
 </button>
 </form>
 </div>
 <div className="lg:col-span-2 space-y-4">
 {requests.length === 0 ? (
 <div className="text-center py-12 bg-white rounded-xl border border-dashed border-gray-300 ">
 <BookOpen className="w-12 h-12 text-gray-400 mx-auto mb-3" />
 <p className="text-gray-500">No external training requests yet.</p>
 </div>
 ) : (
 requests.map(req => (
 <div key={req.id} className="bg-white p-5 rounded-xl shadow-sm border border-gray-100 flex flex-col gap-4">
 <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
 <div>
 <div className="flex items-center gap-2 mb-1">
 <span className="px-2.5 py-0.5 rounded-full text-xs font-medium bg-indigo-100 text-indigo-800 ">
 {req.category}
 </span>
 <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium ${
 req.status === 'Processed' ? 'bg-green-100 text-green-800' :
 req.status === 'Approved' ? 'bg-indigo-100 text-indigo-800' :
 req.status === 'Rejected' ? 'bg-red-100 text-red-800' :
 'bg-amber-100 text-amber-800'
 }`}>
 {req.status === 'Pending' ? `Pending (${req.leader_name || 'Supervisor'})` : req.status === 'Approved' ? 'Pending (HR)' : req.status === 'Processed' ? 'Approved' : req.status}
 </span>
 </div>
 <h3 className="font-semibold text-gray-800 text-lg">{req.title}</h3>
 <div className="flex items-center gap-4 text-sm text-gray-500 mt-2">
 <span className="flex items-center gap-1"><Calendar className="w-4 h-4"/> {req.start_date ? new Date(req.start_date).toLocaleDateString() : '-'}</span>
 <span className="flex items-center gap-1"><DollarSign className="w-4 h-4"/> Reg: {formatRp(req.registration_fee || 0)}</span>
 </div>
 </div>
 {req.status === 'Processed' && req.payment_method && (
 <div className="text-right">
 <p className="text-sm text-gray-500">Payment via</p>
 <p className="font-medium text-gray-800 ">{req.payment_method}</p>
 </div>
 )}
 </div>
 
 {req.status === 'Rejected' && req.rejection_reason && (
 <div className="p-3 bg-red-50 border border-red-100 rounded-lg text-sm text-red-700 w-full">
 <span className="font-semibold block mb-1">Rejection Reason:</span>
 <p>{req.rejection_reason}</p>
 </div>
 )}
 </div>
 ))
 )}
 </div>
 </div>
 )}

 {/* Team Approvals Tab */}
 {activeTab === 'team_approvals' && (
 <div className="space-y-6">
 {teamRequests.length === 0 ? (
 <div className="text-center py-16 bg-gradient-to-b from-slate-50 to-white rounded-3xl border border-dashed border-slate-300">
 <div className="bg-white w-16 h-16 rounded-2xl shadow-sm flex items-center justify-center mx-auto mb-4 border border-slate-100">
 <CheckCircle className="w-8 h-8 text-emerald-500" />
 </div>
 <h3 className="text-lg font-semibold text-slate-800 mb-1">All Caught Up!</h3>
 <p className="text-slate-500 max-w-sm mx-auto">There are no pending external training requests from your team at the moment.</p>
 </div>
 ) : (
 <div className="grid gap-6">
 {teamRequests.map(req => (
 <div key={req.id} className="group bg-white rounded-3xl p-6 shadow-sm hover:shadow-xl transition-all duration-300 border border-slate-100 hover:border-blue-100 flex flex-col md:flex-row justify-between gap-6 relative overflow-hidden">
 {/* Decorative background element */}
 <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-bl from-blue-50 to-transparent rounded-bl-full opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none"></div>
 
 <div className="flex-1 relative z-10">
 <div className="flex items-center gap-3 mb-4">
 <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-blue-600 to-indigo-600 flex items-center justify-center text-white shadow-md">
 <span className="font-bold text-sm">{req.employee_name?.charAt(0) || 'U'}</span>
 </div>
 <div>
 <p className="text-sm font-semibold text-slate-800">{req.employee_name}</p>
 <p className="text-xs text-slate-500 font-medium">ID: {req.employee_id}</p>
 </div>
 <div className="ml-auto flex gap-2">
 <span className="px-3 py-1 rounded-full text-xs font-semibold bg-slate-100 text-slate-600 border border-slate-200">
 {req.category}
 </span>
 <span className={`px-3 py-1 rounded-full text-xs font-bold border ${
 req.status === 'Pending' ? 'bg-amber-50 text-amber-700 border-amber-200 shadow-[0_0_10px_rgba(251,191,36,0.2)]' : 
 req.status === 'Rejected' ? 'bg-rose-50 text-rose-700 border-rose-200' : 
 'bg-emerald-50 text-emerald-700 border-emerald-200'
 }`}>
 {req.status}
 </span>
 </div>
 </div>
 
 <h3 className="font-bold text-slate-800 text-xl mb-4 group-hover:text-blue-700 transition-colors">{req.title}</h3>
 
 <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
 <div className="bg-slate-50 rounded-2xl p-4 border border-slate-100/50">
 <p className="text-xs text-slate-500 mb-1 font-medium flex items-center gap-1.5"><Calendar className="w-3.5 h-3.5"/> Schedule</p>
 <p className="text-sm font-semibold text-slate-700">{req.start_date ? new Date(req.start_date).toLocaleDateString('en-GB', {day: 'numeric', month: 'short', year: 'numeric'}) : '-'} &mdash; {req.end_date ? new Date(req.end_date).toLocaleDateString('en-GB', {day: 'numeric', month: 'short', year: 'numeric'}) : '-'}</p>
 </div>
 <div className="bg-slate-50 rounded-2xl p-4 border border-slate-100/50">
 <p className="text-xs text-slate-500 mb-1 font-medium flex items-center gap-1.5"><DollarSign className="w-3.5 h-3.5"/> Registration Fee</p>
 <p className="text-sm font-bold text-slate-800">{formatRp(req.registration_fee || 0)}</p>
 </div>
 {req.vendor && (
 <div className="bg-slate-50 rounded-2xl p-4 border border-slate-100/50">
 <p className="text-xs text-slate-500 mb-1 font-medium flex items-center gap-1.5"><Briefcase className="w-3.5 h-3.5"/> Vendor</p>
 <p className="text-sm font-semibold text-slate-700">{req.vendor}</p>
 </div>
 )}
 {req.attachment_link && (
 <div className="bg-blue-50/50 rounded-2xl p-4 border border-blue-100/50 flex items-center">
 <a href={req.attachment_link} target="_blank" rel="noreferrer" className="text-blue-600 hover:text-blue-700 font-semibold text-sm flex items-center gap-2 group/link">
 <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center group-hover/link:bg-blue-200 transition-colors">
 <Link className="w-4 h-4"/>
 </div>
 View Attachment
 </a>
 </div>
 )}
 </div>
 </div>
 
 <div className="flex flex-row md:flex-col gap-3 md:justify-center items-center md:items-stretch md:pl-6 md:border-l border-slate-100 relative z-10">
 {req.status === 'Pending' ? (
 <>
 <button onClick={() => handleApproveReject(req.id, 'Approved')} className="flex-1 md:flex-none px-6 py-3 bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-600 hover:to-emerald-700 text-white rounded-xl font-bold flex items-center justify-center gap-2 shadow-lg shadow-emerald-500/30 transition-all hover:-translate-y-0.5">
 <CheckCircle className="w-5 h-5"/> Approve
 </button>
 <button onClick={() => { setSelectedRequestId(req.id); setRejectModalOpen(true); }} className="flex-1 md:flex-none px-6 py-3 bg-white text-rose-600 hover:bg-rose-50 hover:text-rose-700 border border-rose-200 rounded-xl font-bold flex items-center justify-center gap-2 transition-all hover:-translate-y-0.5 shadow-sm">
 <XCircle className="w-5 h-5"/> Reject
 </button>
 </>
 ) : (
 <div className="text-center p-4 bg-slate-50 rounded-2xl border border-slate-100 w-full md:w-32">
 <p className="text-xs text-slate-500 font-medium mb-1">Status</p>
 <p className={`font-bold ${req.status === 'Rejected' ? 'text-rose-600' : 'text-emerald-600'}`}>{req.status}</p>
 </div>
 )}
 </div>
 </div>
 ))
 }
 </div>
 )}
 </div>
 )}
 {/* HR Processing Tab */}

 
            {/* Rejection Modal */}
            {rejectModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
                    <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6">
                        <h3 className="text-xl font-bold text-slate-800 mb-2">Reject Training Request</h3>
                        <p className="text-slate-500 text-sm mb-4">Please provide a reason for rejecting this request.</p>
                        <textarea
                            className="w-full border border-slate-300 rounded-xl p-3 focus:ring-2 focus:ring-rose-500 focus:border-rose-500 outline-none resize-none"
                            rows={4}
                            placeholder="Type reason here..."
                            value={rejectionReason}
                            onChange={(e) => setRejectionReason(e.target.value)}
                        />
                        <div className="flex gap-3 mt-6">
                            <button
                                onClick={() => { setRejectModalOpen(false); setRejectionReason(''); setSelectedRequestId(null); }}
                                className="flex-1 px-4 py-2.5 rounded-xl border border-slate-300 text-slate-700 font-medium hover:bg-slate-50 transition-colors"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={confirmReject}
                                disabled={!rejectionReason.trim()}
                                className="flex-1 px-4 py-2.5 rounded-xl bg-rose-600 text-white font-medium hover:bg-rose-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                            >
                                Confirm Reject
                            </button>
                        </div>
                    </div>
                </div>
            )}

 </div>
 );
}