import { useState, useEffect, type FormEvent, type ChangeEvent } from 'react';
import { Briefcase, Send, Clock, DollarSign, Building, AlertTriangle, MapPin, CreditCard, Info } from 'lucide-react';
import { API_BASE_URL } from '../config';
import type { Role } from '../types';
import PopupNotification from './PopupNotification';

type RequestStatus = 'PENDING_SUPERVISOR' | 'PENDING_HR' | 'APPROVED' | 'REJECTED';

interface TrainingRequest {
    id: number;
    title: string;
    vendor: string;
    cost: number;
    date: string; // YYYY-MM-DD
    status: RequestStatus;
    submittedAt: string;
    paymentMethod: 'REIMBURSEMENT' | 'DIRECT';
    isBonded: boolean;
    evidenceUrl?: string;
    userName?: string;
}

interface TrainingRequestFormProps {
    userRole: Role;
    userName?: string;
}

const TrainingRequestForm = ({ userRole, userName }: TrainingRequestFormProps) => {
    // --- State ---
    const [requests, setRequests] = useState<TrainingRequest[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [notification, setNotification] = useState<{ show: boolean; type: 'success' | 'error'; message: string }>({ show: false, type: 'success', message: '' });

    // Form State
    const [formData, setFormData] = useState({
        title: '',
        vendor: '',
        cost: '',
        date: '',
        duration: '',
        location: '',
        paymentMethod: 'REIMBURSEMENT' as 'REIMBURSEMENT' | 'DIRECT',
        bankName: '',
        accountNumber: '',
        reason: '',
        agreedToBond: false,
        agreedToPenalty: false,
        evidenceUrl: ''
    });

    // --- Derived Logic ---
    const costValue = Number(formData.cost.replace(/\./g, ''));
    const BOND_THRESHOLD = userRole === 'STAFF' ? 2500000 : 5000000;
    const isBondRequired = costValue > BOND_THRESHOLD;
    const isSubmitDisabled = isLoading || (isBondRequired && !formData.agreedToBond) || !formData.agreedToPenalty;

    // --- Fetch Requests ---
    useEffect(() => {
        fetch(`${API_BASE_URL}/api/training`)
            .then(res => res.json())
            .then(data => setRequests(data))
            .catch(err => console.error("Failed to fetch requests", err));
    }, []);


    // --- Handlers ---
    const handleChange = (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
        let value: string | boolean = e.target.type === 'checkbox' ? (e.target as HTMLInputElement).checked : e.target.value;

        // Auto-format currency logic
        if (e.target.name === 'cost' && typeof value === 'string') {
            // Remove existing non-digits to get raw number
            const raw = value.replace(/\D/g, '');
            // Format with thousand separators
            value = raw ? new Intl.NumberFormat('id-ID').format(Number(raw)) : '';
        }

        setFormData({ ...formData, [e.target.name]: value });
    };

    const handleFileChange = async (e: ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            const file = e.target.files[0];
            const data = new FormData();
            data.append('file', file);

            try {
                const res = await fetch(`${API_BASE_URL}/api/upload`, {
                    method: 'POST',
                    body: data
                });
                if (res.ok) {
                    const { fileUrl } = await res.json();
                    setFormData(prev => ({ ...prev, evidenceUrl: fileUrl }));
                }
            } catch (err) {
                console.error("Upload failed", err);
                setNotification({ show: true, type: 'error', message: "Gagal mengupload file." });
            }
        }
    };

    const handleSubmit = async (e: FormEvent) => {
        e.preventDefault();

        if (isBondRequired && !formData.agreedToBond) {
            setNotification({ show: true, type: 'error', message: "Anda wajib menyetujui Ikatan Dinas untuk nominal ini." });
            return;
        }

        setIsLoading(true);

        const newRequest = {
            ...formData,
            cost: costValue,
            status: 'PENDING_SUPERVISOR',
            submittedAt: new Date().toISOString(),
            isBonded: isBondRequired,
            userName: userName || 'Unknown'
        };

        try {
            const res = await fetch(`${API_BASE_URL}/api/training`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(newRequest)
            });
            if (res.ok) {
                const savedReq = await res.json();
                setRequests([savedReq, ...requests]);
                // Reset Form
                setFormData({
                    title: '', vendor: '', cost: '', date: '', duration: '', location: '',
                    paymentMethod: 'REIMBURSEMENT', bankName: '', accountNumber: '', reason: '',
                    agreedToBond: false, agreedToPenalty: false, evidenceUrl: ''
                });
                setNotification({ show: true, type: 'success', message: "Pengajuan berhasil dikirim! Silakan menunggu persetujuan Leader." });
            }
        } catch (err) {
            console.error(err);
            setNotification({ show: true, type: 'error', message: "Gagal mengirim pengajuan." });
        } finally {
            setIsLoading(false);
        }
    };

    // --- Simulation Logic (Real API Call) ---
    const simulateStatus = async (id: number, action: 'approve' | 'reject') => {
        try {
            const res = await fetch(`${API_BASE_URL}/api/training/${id}/approve`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action })
            });

            if (res.ok) {
                const updatedReq = await res.json();
                setRequests(requests.map(req => req.id === id ? updatedReq : req));
            }
        } catch (err) {
            console.error("Failed to update status", err);
        }
    };



    return (
        <div className="max-w-6xl mx-auto py-8 grid lg:grid-cols-12 gap-8 animate-fade-in">
            <PopupNotification
                isOpen={notification.show}
                type={notification.type}
                message={notification.message}
                onClose={() => setNotification({ ...notification, show: false })}
            />
            {/* --- Left Code: Form --- */}
            <div className="lg:col-span-7 space-y-6">
                <div className="flex items-center gap-3">
                    <div className="p-3 bg-teal-100 text-teal-600 rounded-xl shadow-sm">
                        <Briefcase size={28} />
                    </div>
                    <div>
                        <h1 className="text-2xl font-bold text-slate-800">External Training Request</h1>
                        <p className="text-slate-500">Ajukan pelatihan profesional dengan dana perusahaan</p>
                    </div>
                </div>

                <div className="bg-white p-8 rounded-3xl shadow-xl shadow-slate-200/50 border border-slate-100 relative overflow-hidden">
                    <div className="absolute top-0 right-0 w-32 h-32 bg-teal-50 rounded-bl-full -mr-10 -mt-10 z-0"></div>

                    <form onSubmit={handleSubmit} className="space-y-6 relative z-10">
                        {/* Section 1: Details */}
                        <div className="space-y-4">
                            <h3 className="font-bold text-slate-700 flex items-center gap-2 border-b border-slate-100 pb-2">
                                <Info size={18} /> Detail Pelatihan
                            </h3>
                            <div>
                                <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Nama Pelatihan / Sertifikasi</label>
                                <input required name="title" value={formData.title} onChange={handleChange}
                                    placeholder="Contoh: Certified Kubernetes Administrator"
                                    className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-teal-500 outline-none transition-all placeholder-slate-300" />
                            </div>

                            <div className="grid grid-cols-2 gap-5">
                                <div>
                                    <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Vendor / Penyelenggara</label>
                                    <div className="relative">
                                        <Building size={16} className="absolute left-3.5 top-3.5 text-slate-400" />
                                        <input required name="vendor" value={formData.vendor} onChange={handleChange} placeholder="Nama Institusi"
                                            className="w-full pl-10 pr-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-teal-500 outline-none" />
                                    </div>
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Lokasi</label>
                                    <div className="relative">
                                        <MapPin size={16} className="absolute left-3.5 top-3.5 text-slate-400" />
                                        <input required name="location" value={formData.location} onChange={handleChange} placeholder="Kota / Online"
                                            className="w-full pl-10 pr-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-teal-500 outline-none" />
                                    </div>
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-5">
                                <div>
                                    <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Tanggal</label>
                                    <input required type="date" name="date" value={formData.date} onChange={handleChange}
                                        className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-teal-500 outline-none" />
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Durasi</label>
                                    <div className="relative">
                                        <Clock size={16} className="absolute left-3.5 top-3.5 text-slate-400" />
                                        <input required name="duration" value={formData.duration} onChange={handleChange} placeholder="e.g. 2 Hari"
                                            className="w-full pl-10 pr-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-teal-500 outline-none" />
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Section 2: Cost & Payment */}
                        <div className="space-y-4 pt-2">
                            <h3 className="font-bold text-slate-700 flex items-center gap-2 border-b border-slate-100 pb-2">
                                <DollarSign size={18} /> Biaya & Pembayaran
                            </h3>

                            <div>
                                <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Total Biaya (Rp)</label>
                                <div className="relative">
                                    <span className="absolute left-4 top-3 font-bold text-slate-400">Rp</span>
                                    <input required type="text" name="cost" value={formData.cost} onChange={handleChange} placeholder="0"
                                        className="w-full pl-10 pr-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-teal-500 outline-none font-bold text-slate-700" />
                                </div>
                            </div>

                            <div>
                                <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Metode Pengajuan</label>
                                <div className="grid grid-cols-2 gap-4">
                                    <label className={`cursor-pointer border rounded-xl p-4 flex flex-col items-center gap-2 transition-all ${formData.paymentMethod === 'REIMBURSEMENT' ? 'bg-teal-50 border-teal-500 text-teal-700 ring-1 ring-teal-500' : 'hover:bg-slate-50 border-slate-200 text-slate-600'}`}>
                                        <input type="radio" name="paymentMethod" value="REIMBURSEMENT" checked={formData.paymentMethod === 'REIMBURSEMENT'} onChange={handleChange} className="hidden" />
                                        <CreditCard size={24} />
                                        <span className="font-bold text-sm">Reimbursement</span>
                                        <span className="text-[10px] text-center opacity-75 leading-tight">Bayar mandiri, klaim kemudian dengan bukti transfer.</span>
                                    </label>
                                    <label className={`cursor-pointer border rounded-xl p-4 flex flex-col items-center gap-2 transition-all ${formData.paymentMethod === 'DIRECT' ? 'bg-teal-50 border-teal-500 text-teal-700 ring-1 ring-teal-500' : 'hover:bg-slate-50 border-slate-200 text-slate-600'}`}>
                                        <input type="radio" name="paymentMethod" value="DIRECT" checked={formData.paymentMethod === 'DIRECT'} onChange={handleChange} className="hidden" />
                                        <Building size={24} />
                                        <span className="font-bold text-sm">Bayar Langsung (HR)</span>
                                        <span className="text-[10px] text-center opacity-75 leading-tight">Perusahaan transfer langsung ke Vendor.</span>
                                    </label>
                                </div>
                            </div>

                            {formData.paymentMethod === 'DIRECT' && (
                                <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 grid grid-cols-2 gap-4 animate-in fade-in slide-in-from-top-2">
                                    <div className="col-span-2 text-xs font-bold text-slate-500 uppercase">Informasi Rekening Tujuan</div>
                                    <input required name="bankName" value={formData.bankName} onChange={handleChange} placeholder="Nama Bank" className="px-3 py-2 rounded-lg border border-slate-300 text-sm" />
                                    <input required name="accountNumber" value={formData.accountNumber} onChange={handleChange} placeholder="Nomor Rekening" className="px-3 py-2 rounded-lg border border-slate-300 text-sm" />
                                </div>
                            )}

                            <div>
                                <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Lampiran (Brosur / Bukti Transfer)</label>
                                <div className="border-2 border-dashed border-slate-300 rounded-xl p-4 text-center hover:bg-slate-50 transition-colors cursor-pointer relative bg-slate-50">
                                    <input
                                        type="file"
                                        onChange={handleFileChange}
                                        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                                        accept="image/*,application/pdf"
                                    />
                                    {formData.evidenceUrl ? (
                                        <div className="flex items-center justify-center gap-2 text-teal-600 font-bold">
                                            <span>File Uploaded: {formData.evidenceUrl ? formData.evidenceUrl.split('/').pop() : 'Unknown file'}</span>
                                            <button type="button" onClick={(e) => {
                                                e.preventDefault();
                                                setFormData({ ...formData, evidenceUrl: '' });
                                            }} className="text-red-500 hover:text-red-700">X</button>
                                        </div>
                                    ) : (
                                        <p className="text-slate-400 text-sm">Klik untuk upload file (PDF/IMG)</p>
                                    )}
                                </div>
                            </div>
                        </div>

                        {/* Section 3: Justification & Rules */}
                        <div className="space-y-4 pt-2">
                            <div>
                                <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Alasan Pengajuan</label>
                                <textarea required name="reason" value={formData.reason} onChange={handleChange} rows={2} placeholder="Manfaat bagi perusahaan..."
                                    className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-teal-500 outline-none resize-none" />
                            </div>

                            {/* Dynamic Rules Alert */}
                            <div className="bg-orange-50 rounded-xl p-4 border border-orange-100 text-sm text-orange-800 space-y-3">
                                <div className="flex items-start gap-3">
                                    <AlertTriangle className="shrink-0 mt-0.5 text-orange-500" size={18} />
                                    <div>
                                        <p className="font-bold mb-1">Ketentuan Wajib:</p>
                                        <ul className="list-disc list-inside space-y-1 text-orange-700/80 text-xs">
                                            <li>Wajib mendapatkan sertifikat lulus.</li>
                                            <li>Jika <span className="font-bold">tidak lulus</span>, karyawan menanggung <span className="font-bold text-red-600">50% biaya training</span>.</li>
                                            <li>Sertifikat wajib diserahkan ke HR untuk diupload.</li>
                                        </ul>
                                    </div>
                                </div>
                                <label className="flex items-center gap-3 pt-2 border-t border-orange-100 cursor-pointer">
                                    <input type="checkbox" name="agreedToPenalty" checked={formData.agreedToPenalty} onChange={handleChange} className="w-4 h-4 text-orange-600 rounded focus:ring-orange-500" />
                                    <span className="text-xs font-semibold select-none">Saya menyetujui ketentuan penalti 50% jika tidak lulus.</span>
                                </label>
                            </div>

                            {/* Service Bond Warning */}
                            {isBondRequired && (
                                <div className="bg-indigo-50 rounded-xl p-4 border border-indigo-100 text-sm text-indigo-900 animate-in fade-in zoom-in-95">
                                    <div className="flex items-start gap-3 mb-3">
                                        <div className="p-1.5 bg-indigo-100 rounded-lg text-indigo-600"><Briefcase size={16} /></div>
                                        <div>
                                            <p className="font-bold">Ikatan Dinas Required</p>
                                            <p className="text-xs mt-1 text-indigo-700 leading-snug">
                                                Biaya pelatihan melebihi batas (Rp {BOND_THRESHOLD.toLocaleString()}).
                                                Sesuai kebijakan, Anda wajib menandatangani Surat Perjanjian Ikatan Dinas.
                                            </p>
                                        </div>
                                    </div>
                                    <label className="flex items-center gap-3 pt-2 border-t border-indigo-100 cursor-pointer">
                                        <input type="checkbox" name="agreedToBond" checked={formData.agreedToBond} onChange={handleChange} className="w-4 h-4 text-indigo-600 rounded focus:ring-indigo-500" />
                                        <span className="text-xs font-bold select-none">Saya bersedia mengikuti Ikatan Dinas.</span>
                                    </label>
                                </div>
                            )}
                        </div>

                        <button type="submit" disabled={isSubmitDisabled}
                            className="w-full bg-teal-600 hover:bg-teal-700 disabled:bg-slate-300 disabled:cursor-not-allowed text-white font-bold py-4 rounded-xl shadow-xl shadow-teal-900/10 flex items-center justify-center gap-2 transition-all transform active:scale-[0.98]">
                            {isLoading ? 'Mengirim...' : <><Send size={20} /> Kirim Pengajuan</>}
                        </button>
                    </form>
                </div>
            </div>

            {/* --- Right Col: History & Status --- */}
            <div className="lg:col-span-5 space-y-6">
                <div className="flex items-center gap-3">
                    <div className="p-3 bg-blue-50 text-blue-600 rounded-xl">
                        <Clock size={24} />
                    </div>
                    <div>
                        <h2 className="text-xl font-bold text-slate-800">Riwayat Pengajuan</h2>
                        <p className="text-slate-500 text-sm">Status persetujuan training</p>
                    </div>
                </div>

                <div className="space-y-4">
                    {requests.length === 0 ? (
                        <div className="text-center py-12 bg-white rounded-3xl border border-dashed border-slate-200">
                            <Briefcase size={40} className="mx-auto text-slate-300 mb-3" />
                            <p className="text-slate-400 font-medium">Belum ada pengajuan aktif.</p>
                        </div>
                    ) : (
                        requests.map(req => (
                            <div key={req.id} className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm hover:shadow-md transition-shadow relative overflow-hidden group">
                                <div className={`absolute left-0 top-0 bottom-0 w-1 ${req.status === 'APPROVED' ? 'bg-green-500' : req.status === 'REJECTED' ? 'bg-red-500' : 'bg-blue-500'}`}></div>

                                <div className="flex justify-between items-start mb-2 pl-3">
                                    <div>
                                        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">{req.vendor}</span>
                                        <h3 className="font-bold text-slate-800 leading-tight">{req.title}</h3>
                                    </div>
                                    <div className="text-right">
                                        <span className={`text-xs font-bold px-2 py-1 rounded-lg ${req.status === 'APPROVED' ? 'bg-green-100 text-green-700' : req.status === 'REJECTED' ? 'bg-red-100 text-red-700' : 'bg-blue-50 text-blue-600'}`}>
                                            {req.status === 'APPROVED' ? 'Disetujui' : req.status === 'REJECTED' ? 'Ditolak' : 'Proses'}
                                        </span>
                                    </div>
                                </div>

                                <div className="pl-3 mt-3 flex items-center justify-between text-sm">
                                    <div className="text-slate-500 font-medium">
                                        Rp {req.cost.toLocaleString()}
                                    </div>
                                    <div className="text-slate-400 text-xs">
                                        {new Date(req.submittedAt).toLocaleDateString()}
                                    </div>
                                </div>

                                {/* Simulation Buttons */}
                                {(userRole === 'HR' || userRole === 'SUPERVISOR') && req.status.includes('PENDING') && (
                                    <div className="mt-4 pl-3 pt-3 border-t border-slate-50 flex gap-2">
                                        <button onClick={() => simulateStatus(req.id, 'reject')} className="flex-1 py-1.5 bg-red-50 hover:bg-red-100 text-red-600 text-xs font-bold rounded-lg transition-colors">
                                            Tolak
                                        </button>
                                        <button onClick={() => simulateStatus(req.id, 'approve')} className="flex-1 py-1.5 bg-green-50 hover:bg-green-100 text-green-600 text-xs font-bold rounded-lg transition-colors">
                                            Setujui
                                        </button>
                                    </div>
                                )}
                            </div>
                        ))
                    )}
                </div>
            </div>
        </div>
    );
};

export default TrainingRequestForm;
