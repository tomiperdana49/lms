import { useState, useEffect, type FormEvent, type ChangeEvent } from 'react';
import { Briefcase, Send, Clock, DollarSign, Building, AlertTriangle, MapPin, CreditCard, Info } from 'lucide-react';
import { API_BASE_URL } from '../config';
// import type { Role } from '../types';
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
    // New fields
    costTraining?: number;
    costTransport?: number;
    costAccommodation?: number;
    costOthers?: number;
    supervisorName?: string;
    hrName?: string;
    rejectionReason?: string;
    employeeName?: string;
    employeeRole?: string;
}

const TrainingExternalForm = ({ user, onNavigate }: { user: { name: string; role: string }; onNavigate?: (page: string) => void }) => {
    // --- State ---
    const [requests, setRequests] = useState<TrainingRequest[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [notification, setNotification] = useState<{ show: boolean; type: 'success' | 'error'; message: string }>({ show: false, type: 'success', message: '' });

    // --- Form State ---
    const [formData, setFormData] = useState({
        title: '',
        vendor: '',
        cost: '',
        costTraining: '',
        costTransport: '',
        costAccommodation: '',
        costOthers: '',
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
    const parseCurrency = (val: string) => Number(val.replace(/\D/g, ''));

    // Calculate total cost from components
    const totalCostValue =
        parseCurrency(formData.costTraining) +
        parseCurrency(formData.costTransport) +
        parseCurrency(formData.costAccommodation) +
        parseCurrency(formData.costOthers);

    // Update main cost field when components change
    useEffect(() => {
        setFormData(prev => ({
            ...prev,
            cost: totalCostValue > 0 ? new Intl.NumberFormat('id-ID').format(totalCostValue) : ''
        }));
    }, [totalCostValue, formData.costTraining, formData.costTransport, formData.costAccommodation, formData.costOthers]);

    const costValue = totalCostValue;
    const BOND_THRESHOLD = user.role === 'STAFF' ? 2500000 : 5000000;
    const isBondRequired = costValue > BOND_THRESHOLD;
    const isSubmitDisabled = isLoading || (isBondRequired && !formData.agreedToBond) || !formData.agreedToPenalty;

    // --- Handlers ---
    const handleChange = (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
        let value: string | boolean = e.target.type === 'checkbox' ? (e.target as HTMLInputElement).checked : e.target.value;

        // Auto-format currency logic
        if (['cost', 'costTraining', 'costTransport', 'costAccommodation', 'costOthers'].includes(e.target.name) && typeof value === 'string') {
            const raw = value.replace(/\D/g, '');
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

    // --- Fetch Requests (Filtered by User) ---
    useEffect(() => {
        fetch(`${API_BASE_URL}/api/training`)
            .then(res => res.json())
            // Filter: Only show My Requests
            .then((data: TrainingRequest[]) => {
                const myRequests = data.filter(req => req.employeeName === user.name);
                setRequests(myRequests);
            })
            .catch(err => console.error("Failed to fetch requests", err));
    }, [user.name]);

    // ...

    const handleSubmit = async (e: FormEvent) => {
        e.preventDefault();

        // ... (validation code)

        setIsLoading(true);

        // Rules: Staff -> PENDING_SUPERVISOR, Supervisor -> PENDING_HR (Skip Self), HR -> PENDING_HR
        const initialStatus = user.role === 'SUPERVISOR' || user.role === 'HR' || user.role === 'HR_ADMIN'
            ? 'PENDING_HR'
            : 'PENDING_SUPERVISOR';

        const newRequest = {
            ...formData,
            cost: costValue, // Use calculated total
            costTraining: parseCurrency(formData.costTraining),
            costTransport: parseCurrency(formData.costTransport),
            costAccommodation: parseCurrency(formData.costAccommodation),
            costOthers: parseCurrency(formData.costOthers),
            status: initialStatus,
            submittedAt: new Date().toISOString(),
            isBonded: isBondRequired,
            userName: user.name || 'Unknown',
            employeeName: user.name || 'Unknown',
            employeeRole: user.role || 'STAFF'
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
                    title: '', vendor: '', cost: '', costTraining: '', costTransport: '', costAccommodation: '', costOthers: '',
                    date: '', duration: '', location: '',
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

    const handlePrint = (req: TrainingRequest) => {
        const printWindow = window.open('', '_blank');
        if (printWindow) {
            printWindow.document.write(`
                <html>
                <head>
                    <title>Training Request Approval - ${req.id}</title>
                    <style>
                        body { font-family: sans-serif; padding: 40px; color: #333; }
                        .header { text-align: center; margin-bottom: 40px; border-bottom: 2px solid #eee; padding-bottom: 20px; }
                        .title { font-size: 24px; font-weight: bold; margin-bottom: 10px; }
                        .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 30px; }
                        .label { font-size: 12px; color: #666; text-transform: uppercase; font-weight: bold; }
                        .value { font-size: 16px; font-weight: bold; margin-top: 5px; }
                        .justification { background: #f9f9f9; padding: 20px; border-radius: 8px; margin-bottom: 30px; }
                        .footer { margin-top: 60px; text-align: center; font-size: 12px; color: #999; }
                        .stamp { border: 2px solid green; color: green; display: inline-block; padding: 10px 20px; font-weight: bold; text-transform: uppercase; transform: rotate(-5deg); margin-top: 20px; }
                    </style>
                </head>
                <body>
                    <div class="header">
                        <div class="title">External Training Request</div>
                        <div>Document ID: #${req.id}</div>
                    </div>
                    
                    <div class="grid">
                        <div>
                            <div class="label">Employee Name</div>
                            <div class="value">${req.employeeName || req.userName}</div>
                            <div style="font-size: 14px; color: #666;">${req.employeeRole}</div>
                        </div>
                        <div>
                            <div class="label">Submission Date</div>
                            <div class="value">${new Date(req.date).toLocaleDateString()}</div>
                        </div>
                    </div>

                    <div class="grid">
                        <div>
                            <div class="label">Training Program</div>
                            <div class="value">${req.title}</div>
                        </div>
                        <div>
                            <div class="label">Vendor / Provider</div>
                            <div class="value">${req.vendor}</div>
                        </div>
                    </div>

                    <div class="grid">
                        <div>
                            <div class="label">Estimated Cost</div>
                            <div class="value">${new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR' }).format(req.cost)}</div>
                        </div>
                    </div>

                    <div style="text-align: center;">
                        <div class="label">Status</div>
                        <div class="stamp">APPROVED BY HR</div>
                        <p style="margin-top: 10px; font-size: 12px;">Digitally Approved by HR Dept.</p>
                    </div>

                    <div class="footer">
                        Generated from Nusa LMS
                    </div>
                </body>
                </html>
            `);
            printWindow.document.close();
            printWindow.print();
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
            {/* Header / Nav for Supervisor */}
            {(user.role === 'SUPERVISOR') && (
                <div className="lg:col-span-12 mb-4 flex justify-end">
                    <button
                        onClick={() => onNavigate && onNavigate('external-approval')}
                        className="bg-blue-600 text-white px-6 py-3 rounded-xl font-bold shadow-lg hover:bg-blue-700 transition-all flex items-center gap-2"
                    >
                        <Briefcase size={20} />
                        Review Team Requests
                    </button>
                </div>
            )}

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

                            <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-4">
                                <label className="block text-xs font-bold text-slate-500 uppercase">Rincian Biaya (Estimasi)</label>

                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    {[
                                        { label: 'Biaya Training/Trainer', name: 'costTraining' },
                                        { label: 'Biaya Transportasi', name: 'costTransport' },
                                        { label: 'Biaya Akomodasi', name: 'costAccommodation' },
                                        { label: 'Biaya Lainnya (Makan, Laundry, dll)', name: 'costOthers' }
                                    ].map((field) => (
                                        <div key={field.name}>
                                            <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">{field.label}</label>
                                            <div className="relative">
                                                <span className="absolute left-3 top-2.5 text-xs font-bold text-slate-400">Rp</span>
                                                <input
                                                    type="text"
                                                    name={field.name}
                                                    value={(formData as unknown as Record<string, string>)[field.name]}
                                                    onChange={handleChange}
                                                    placeholder="0"
                                                    className="w-full pl-8 pr-3 py-2 rounded-lg border border-slate-200 focus:ring-2 focus:ring-teal-500 outline-none text-sm font-semibold text-slate-700 bg-white"
                                                />
                                            </div>
                                        </div>
                                    ))}
                                </div>

                                <div className="pt-3 border-t border-slate-200">
                                    <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Total Biaya (Otomatis)</label>
                                    <div className="relative">
                                        <span className="absolute left-4 top-3 font-bold text-slate-400">Rp</span>
                                        <input readOnly type="text" name="cost" value={formData.cost}
                                            className="w-full pl-10 pr-4 py-3 rounded-xl border border-slate-200 bg-slate-100 font-bold text-slate-700 cursor-not-allowed" />
                                    </div>
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
                                        {/* Stepper for Status */}
                                        <div className="flex flex-col items-end gap-2">
                                            <div className="flex items-center gap-1 text-[10px]">
                                                {/* Supervisor Step */}
                                                <div className={`px-1.5 py-0.5 rounded border flex items-center gap-1 ${(req.supervisorName || user.role === 'SUPERVISOR' || user.role === 'HR' || user.role === 'HR_ADMIN') ? 'bg-green-50 border-green-200 text-green-700' : 'bg-slate-50 border-slate-100 text-slate-400'}`}>
                                                    <span className="font-bold">{user.role === 'SUPERVISOR' || user.role === 'HR' || user.role === 'HR_ADMIN' ? 'Self' : 'SPV'}</span>
                                                    {(req.supervisorName || user.role === 'SUPERVISOR' || user.role === 'HR' || user.role === 'HR_ADMIN') ? (
                                                        <div className="w-1.5 h-1.5 rounded-full bg-green-500"></div>
                                                    ) : (
                                                        <div className="w-1.5 h-1.5 rounded-full border border-slate-300"></div>
                                                    )}
                                                </div>

                                                {/* Connector Line */}
                                                <div className={`w-3 h-0.5 ${(req.supervisorName || user.role === 'SUPERVISOR' || user.role === 'HR' || user.role === 'HR_ADMIN') ? 'bg-green-200' : 'bg-slate-100'}`}></div>

                                                {/* HR Step */}
                                                <div className={`px-1.5 py-0.5 rounded border flex items-center gap-1 ${req.hrName ? 'bg-green-50 border-green-200 text-green-700' : 'bg-slate-50 border-slate-100 text-slate-400'}`}>
                                                    <span className="font-bold">HR</span>
                                                    {req.hrName ? <div className="w-1.5 h-1.5 rounded-full bg-green-500"></div> : <div className="w-1.5 h-1.5 rounded-full border border-slate-300"></div>}
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                <div className="pl-3 mt-3 flex items-center justify-between text-sm">
                                    <div className="text-slate-500 font-medium w-full">
                                        <div className="font-bold text-slate-700">Total: Rp {req.cost.toLocaleString('id-ID')}</div>
                                        <div className="text-[10px] text-slate-400 mt-1 space-y-0.5">
                                            {(req.costTraining || 0) > 0 && <div>Training: Rp {(req.costTraining || 0).toLocaleString('id-ID')}</div>}
                                            {(req.costTransport || 0) > 0 && <div>Transport: Rp {(req.costTransport || 0).toLocaleString('id-ID')}</div>}
                                            {(req.costAccommodation || 0) > 0 && <div>Akomodasi: Rp {(req.costAccommodation || 0).toLocaleString('id-ID')}</div>}
                                            {(req.costOthers || 0) > 0 && <div>Lainnya: Rp {(req.costOthers || 0).toLocaleString('id-ID')}</div>}
                                        </div>

                                        {/* Rejection Reason */}
                                        {req.status === 'REJECTED' && req.rejectionReason && (
                                            <div className="mt-3 bg-red-50 p-3 rounded-lg border border-red-100 text-xs animate-in fade-in">
                                                <div className="font-bold text-red-800 flex items-center gap-1 mb-1">
                                                    <AlertTriangle size={12} />
                                                    {req.hrName ? 'Ditolak oleh HR' : 'Ditolak oleh Supervisor'}:
                                                </div>
                                                <p className="text-red-700 italic border-l-2 border-red-200 pl-2">"{req.rejectionReason}"</p>
                                            </div>
                                        )}

                                        {/* Download PDF Button for Approved Requests */}
                                        {req.status === 'APPROVED' && (
                                            <button
                                                onClick={() => handlePrint(req)}
                                                className="mt-3 w-full py-2 bg-green-50 text-green-700 hover:bg-green-100 border border-green-200 rounded-lg text-xs font-bold flex items-center justify-center gap-2 transition-colors"
                                            >
                                                <Briefcase size={14} /> Download Approval PDF
                                            </button>
                                        )}
                                    </div>
                                </div>
                                <div className="absolute right-3 bottom-3 text-[10px] text-slate-400">
                                    {new Date(req.submittedAt).toLocaleDateString()}
                                </div>
                            </div>
                        ))
                    )}
                </div>
            </div>
        </div>
    );
};

export default TrainingExternalForm;
