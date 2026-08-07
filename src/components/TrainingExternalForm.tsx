import { useState, useEffect, type FormEvent, type ChangeEvent } from 'react';
import { Briefcase, Send, Clock, DollarSign, Building, AlertTriangle, MapPin, CreditCard, CheckCircle2, ChevronRight, FileText, Calendar } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { API_BASE_URL } from '../config';
import PopupNotification from './PopupNotification';

type RequestStatus = 'PENDING_SUPERVISOR' | 'PENDING_HR' | 'APPROVED' | 'REJECTED';

interface TrainingRequest {
    id: number;
    title: string;
    vendor: string;
    cost: number;
    date: string;
    status: RequestStatus;
    submittedAt: string;
    paymentMethod: 'REIMBURSEMENT' | 'DIRECT';
    isBonded: boolean;
    evidenceUrl?: string;
    userName?: string;
    costTraining?: number;
    costTransport?: number;
    costAccommodation?: number;
    costOthers?: number;
    supervisorName?: string;
    hrName?: string;
    rejectionReason?: string;
    employeeName?: string;
    employeeRole?: string;
    employee_id?: string;
}

const TrainingExternalForm = ({ user, onNavigate }: { user: { name: string; role: string }; onNavigate?: (page: string) => void }) => {
    const { t } = useTranslation('trainingExternalForm');
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
        paymentMethod: 'DIRECT' as 'REIMBURSEMENT' | 'DIRECT',
        bankName: '',
        accountNumber: '',
        reason: '',
        agreedToBond: false,
        agreedToPenalty: false,
        evidenceUrl: ''
    });

    // --- Derived Logic ---
    const parseCurrency = (val: string) => Number(val.replace(/\D/g, ''));

    const totalCostValue =
        parseCurrency(formData.costTraining) +
        parseCurrency(formData.costTransport) +
        parseCurrency(formData.costAccommodation) +
        parseCurrency(formData.costOthers);

    useEffect(() => {
        setFormData(prev => ({
            ...prev,
            cost: totalCostValue > 0 ? new Intl.NumberFormat('id-ID').format(totalCostValue) : ''
        }));
    }, [totalCostValue]);

    const BOND_THRESHOLD = user.role === 'STAFF' ? 2500000 : 5000000;
    const isBondRequired = totalCostValue > BOND_THRESHOLD;
    const isSubmitDisabled = isLoading || (isBondRequired && !formData.agreedToBond) || !formData.agreedToPenalty;

    // --- Handlers ---
    const handleChange = (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
        let value: string | boolean = e.target.type === 'checkbox' ? (e.target as HTMLInputElement).checked : e.target.value;

        if (['cost', 'costTraining', 'costTransport', 'costAccommodation', 'costOthers'].includes(e.target.name) && typeof value === 'string') {
            const raw = value.replace(/\D/g, '');
            value = raw ? new Intl.NumberFormat('id-ID').format(Number(raw)) : '';
        }

        setFormData({ ...formData, [e.target.name]: value });
    };


    useEffect(() => {
        fetch(`${API_BASE_URL}/api/training`)
            .then(res => res.json())
            .then((data: TrainingRequest[]) => {
                const myRequests = data.filter(req =>
                    req.employee_id === (user as any).employee_id || (!req.employee_id && req.employeeName === user.name)
                );
                setRequests(myRequests);
            })
            .catch(err => console.error("Failed to fetch requests", err));
    }, [user.name]);

    const handleSubmit = async (e: FormEvent) => {
        e.preventDefault();
        setIsLoading(true);

        const initialStatus = user.role === 'SUPERVISOR' || user.role === 'HR' || user.role === 'HR_ADMIN'
            ? 'PENDING_HR'
            : 'PENDING_SUPERVISOR';

        const newRequest = {
            ...formData,
            cost: totalCostValue,
            costTraining: parseCurrency(formData.costTraining),
            costTransport: parseCurrency(formData.costTransport),
            costAccommodation: parseCurrency(formData.costAccommodation),
            costOthers: parseCurrency(formData.costOthers),
            status: initialStatus,
            submittedAt: new Date().toISOString(),
            isBonded: isBondRequired,
            userName: user.name || 'Unknown',
            employeeName: user.name || 'Unknown',
            employee_id: (user as any).employee_id,
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
                setFormData({
                    title: '', vendor: '', cost: '', costTraining: '', costTransport: '', costAccommodation: '', costOthers: '',
                    date: '', duration: '', location: '',
                    paymentMethod: 'DIRECT', bankName: '', accountNumber: '', reason: '',
                    agreedToBond: false, agreedToPenalty: false, evidenceUrl: ''
                });
                setNotification({ show: true, type: 'success', message: t('notifications.submitSuccess') });
            }
        } catch (err) {
            console.error(err);
            setNotification({ show: true, type: 'error', message: t('notifications.submitError') });
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
                    <title>${t('print.documentTitle', { id: req.id })}</title>
                    <style>
                        body { font-family: 'Inter', sans-serif; padding: 50px; color: #1e293b; line-height: 1.6; }
                        .header { text-align: center; margin-bottom: 50px; border-bottom: 2px solid #f1f5f9; padding-bottom: 30px; }
                        .title { font-size: 28px; font-weight: 900; color: #0f172a; margin-bottom: 5px; }
                        .doc-id { font-size: 12px; font-weight: 700; color: #64748b; text-transform: uppercase; letter-spacing: 0.1em; }
                        .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 40px; margin-bottom: 40px; }
                        .label { font-size: 10px; color: #94a3b8; text-transform: uppercase; font-weight: 900; letter-spacing: 0.05em; margin-bottom: 5px; }
                        .value { font-size: 15px; font-weight: 700; color: #334155; }
                        .box { background: #f8fafc; padding: 25px; border-radius: 16px; border: 1px solid #f1f5f9; margin-bottom: 40px; }
                        .footer { margin-top: 80px; text-align: center; font-size: 11px; color: #94a3b8; font-weight: 600; }
                        .stamp { border: 3px solid #10b981; color: #10b981; display: inline-block; padding: 12px 25px; font-weight: 900; text-transform: uppercase; transform: rotate(-3deg); margin-top: 30px; border-radius: 8px; font-size: 14px; }
                    </style>
                </head>
                <body>
                    <div class="header">
                        <div class="title">${t('print.certificateTitle')}</div>
                        <div class="doc-id">${t('print.referenceLabel', { id: req.id })}</div>
                    </div>

                    <div class="grid">
                        <div>
                            <div class="label">${t('print.employeeNameLabel')}</div>
                            <div class="value">${req.employeeName || req.userName}</div>
                            <div style="font-size: 13px; color: #64748b; font-weight: 500;">${req.employeeRole}</div>
                        </div>
                        <div>
                            <div class="label">${t('print.approvalDateLabel')}</div>
                            <div class="value">${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</div>
                        </div>
                    </div>

                    <div class="box">
                        <div class="grid" style="margin-bottom: 0;">
                            <div>
                                <div class="label">${t('print.trainingProgramLabel')}</div>
                                <div class="value">${req.title}</div>
                            </div>
                            <div>
                                <div class="label">${t('print.vendorLabel')}</div>
                                <div class="value">${req.vendor}</div>
                            </div>
                        </div>
                    </div>

                    <div class="grid">
                        <div>
                            <div class="label">${t('print.totalBudgetLabel')}</div>
                            <div class="value" style="font-size: 20px; color: #0f172a;">${new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR' }).format(req.cost)}</div>
                        </div>
                        <div style="text-align: right;">
                             <div class="stamp">${t('print.approvedByHrStamp')}</div>
                        </div>
                    </div>

                    <div class="footer">
                        ${t('print.footer')}
                    </div>
                </body>
                </html>
            `);
            printWindow.document.close();
            setTimeout(() => printWindow.print(), 500);
        }
    };

    return (
        <div className="max-w-7xl mx-auto py-12 px-4 grid lg:grid-cols-12 gap-12 animate-fade-in">
            <PopupNotification
                isOpen={notification.show}
                type={notification.type}
                message={notification.message}
                onClose={() => setNotification({ ...notification, show: false })}
            />

            {/* --- Left Column: Form Content --- */}
            <div className="lg:col-span-7 space-y-10">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-5">
                        <div className="p-4 bg-indigo-600 text-white rounded-[24px] shadow-xl shadow-indigo-200">
                            <Briefcase size={32} strokeWidth={2.5} />
                        </div>
                        <div>
                            <h1 className="text-4xl font-black text-slate-900 tracking-tight">{t('header.title')}</h1>
                            <p className="text-slate-400 font-bold uppercase tracking-widest text-[10px] mt-1">{t('header.subtitle')}</p>
                        </div>
                    </div>

                    {(user.role === 'SUPERVISOR' || (user as any).isSupervisor) && (
                        <button
                            onClick={() => onNavigate && onNavigate('external-approval')}
                            className="bg-white border border-slate-200 text-slate-800 px-5 py-2.5 rounded-2xl font-black text-xs shadow-sm hover:bg-slate-50 transition-all flex items-center gap-2"
                        >
                            <CheckCircle2 size={16} className="text-indigo-600" />
                            {t('header.teamRequests')}
                        </button>
                    )}
                </div>

                <div className="bg-white p-10 rounded-[40px] shadow-2xl shadow-slate-200/60 border border-slate-100 relative overflow-hidden group">
                    <div className="absolute top-0 right-0 w-64 h-64 bg-indigo-50/50 rounded-full blur-3xl -mr-32 -mt-32 transition-transform duration-1000 group-hover:scale-110"></div>
                    
                    <form onSubmit={handleSubmit} className="space-y-10 relative z-10">
                        {/* Section 1: Strategic Details */}
                        <div className="space-y-6">
                            <h3 className="text-xs font-black text-indigo-600 uppercase tracking-[0.2em] flex items-center gap-3">
                                <span className="w-8 h-[2px] bg-indigo-600 rounded-full"></span>
                                {t('form.section1Title')}
                            </h3>

                            <div className="space-y-4">
                                <div>
                                    <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 ml-1">{t('form.trainingNameLabel')}</label>
                                    <input
                                        required
                                        name="title"
                                        value={formData.title}
                                        onChange={handleChange}
                                        placeholder={t('form.trainingNamePlaceholder')}
                                        className="w-full px-6 py-4 rounded-2xl bg-slate-50 border border-slate-100 focus:bg-white focus:ring-4 focus:ring-indigo-100 focus:border-indigo-500 outline-none transition-all font-bold text-slate-800 placeholder-slate-300"
                                    />
                                </div>

                                <div className="grid sm:grid-cols-2 gap-6">
                                    <div>
                                        <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 ml-1">{t('form.vendorLabel')}</label>
                                        <div className="relative">
                                            <Building size={18} className="absolute left-5 top-4.5 text-slate-300" />
                                            <input required name="vendor" value={formData.vendor} onChange={handleChange} placeholder={t('form.vendorPlaceholder')}
                                                className="w-full pl-14 pr-6 py-4 rounded-2xl bg-slate-50 border border-slate-100 focus:bg-white focus:ring-4 focus:ring-indigo-100 outline-none font-bold text-slate-800 transition-all" />
                                        </div>
                                    </div>
                                    <div>
                                        <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 ml-1">{t('form.locationLabel')}</label>
                                        <div className="relative">
                                            <MapPin size={18} className="absolute left-5 top-4.5 text-slate-300" />
                                            <input required name="location" value={formData.location} onChange={handleChange} placeholder={t('form.locationPlaceholder')}
                                                className="w-full pl-14 pr-6 py-4 rounded-2xl bg-slate-50 border border-slate-100 focus:bg-white focus:ring-4 focus:ring-indigo-100 outline-none font-bold text-slate-800 transition-all" />
                                        </div>
                                    </div>
                                </div>

                                <div className="grid sm:grid-cols-2 gap-6">
                                    <div>
                                        <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 ml-1">{t('form.dateLabel')}</label>
                                        <input required type="date" name="date" value={formData.date} onChange={handleChange}
                                            className="w-full px-6 py-4 rounded-2xl bg-slate-50 border border-slate-100 focus:bg-white focus:ring-4 focus:ring-indigo-100 outline-none font-bold text-slate-800 transition-all" />
                                    </div>
                                    <div>
                                        <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 ml-1">{t('form.durationLabel')}</label>
                                        <div className="relative">
                                            <Clock size={18} className="absolute left-5 top-4.5 text-slate-300" />
                                            <input required name="duration" value={formData.duration} onChange={handleChange} placeholder={t('form.durationPlaceholder')}
                                                className="w-full pl-14 pr-6 py-4 rounded-2xl bg-slate-50 border border-slate-100 focus:bg-white focus:ring-4 focus:ring-indigo-100 outline-none font-bold text-slate-800 transition-all" />
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Section 2: Financial Planning */}
                        <div className="space-y-6">
                            <h3 className="text-xs font-black text-emerald-600 uppercase tracking-[0.2em] flex items-center gap-3">
                                <span className="w-8 h-[2px] bg-emerald-600 rounded-full"></span>
                                {t('form.section2Title')}
                            </h3>

                            <div className="bg-slate-50/80 rounded-[32px] p-8 border border-slate-100 space-y-6">
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                    {[
                                        { label: t('form.registrationFee'), name: 'costTraining' },
                                        { label: t('form.travelFlight'), name: 'costTransport' },
                                        { label: t('form.accommodation'), name: 'costAccommodation' },
                                        { label: t('form.miscellaneous'), name: 'costOthers' }
                                    ].map((field) => (
                                        <div key={field.name}>
                                            <label className="block text-[9px] font-black text-slate-400 uppercase tracking-widest mb-2 ml-1">{field.label}</label>
                                            <div className="relative">
                                                <span className="absolute left-4 top-3.5 text-xs font-black text-slate-300">Rp</span>
                                                <input
                                                    type="text"
                                                    name={field.name}
                                                    value={(formData as any)[field.name]}
                                                    onChange={handleChange}
                                                    placeholder="0"
                                                    className="w-full pl-10 pr-4 py-3 rounded-xl border border-slate-200 focus:ring-4 focus:ring-emerald-50 focus:border-emerald-500 outline-none text-sm font-black text-slate-700 bg-white transition-all"
                                                />
                                            </div>
                                        </div>
                                    ))}
                                </div>

                                <div className="pt-6 border-t border-slate-200/60">
                                    <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3 ml-1">{t('form.totalInvestmentLabel')}</label>
                                    <div className="relative">
                                        <div className="absolute left-6 top-4 font-black text-indigo-600">Rp</div>
                                        <input readOnly type="text" name="cost" value={formData.cost}
                                            className="w-full pl-12 pr-6 py-5 rounded-2xl bg-white border-2 border-indigo-100 font-black text-2xl text-slate-900 shadow-sm outline-none" />
                                    </div>
                                </div>
                            </div>

                            <div className="space-y-4">
                                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">{t('form.settlementMethodLabel')}</label>
                                <div className="grid sm:grid-cols-2 gap-4">
                                    {[
                                        { id: 'REIMBURSEMENT', title: t('form.reimbursementTitle'), icon: CreditCard, desc: t('form.reimbursementDesc') },
                                        { id: 'DIRECT', title: t('form.directPaymentTitle'), icon: Building, desc: t('form.directPaymentDesc') }
                                    ].map((method) => (
                                        <label key={method.id} className={`cursor-pointer group relative rounded-[28px] p-6 border-2 transition-all duration-300 ${formData.paymentMethod === method.id ? 'bg-indigo-600 border-indigo-600 text-white shadow-xl shadow-indigo-200' : 'bg-white border-slate-100 hover:border-indigo-200 text-slate-600'}`}>
                                            <input type="radio" name="paymentMethod" value={method.id} checked={formData.paymentMethod === method.id} onChange={handleChange} className="hidden" />
                                            <div className="flex items-start gap-4">
                                                <div className={`p-3 rounded-2xl ${formData.paymentMethod === method.id ? 'bg-white/20' : 'bg-slate-50 group-hover:bg-indigo-50 transition-colors'}`}>
                                                    <method.icon size={24} className={formData.paymentMethod === method.id ? 'text-white' : 'text-slate-400 group-hover:text-indigo-600'} />
                                                </div>
                                                <div>
                                                    <span className="font-black text-sm block mb-1">{method.title}</span>
                                                    <p className={`text-[10px] leading-relaxed font-medium ${formData.paymentMethod === method.id ? 'text-white/70' : 'text-slate-400'}`}>{method.desc}</p>
                                                </div>
                                            </div>
                                        </label>
                                    ))}
                                </div>
                            </div>
                        </div>

                        {/* Section 3: Professional Agreement */}
                        <div className="space-y-6">
                            <h3 className="text-xs font-black text-rose-600 uppercase tracking-[0.2em] flex items-center gap-3">
                                <span className="w-8 h-[2px] bg-rose-600 rounded-full"></span>
                                {t('form.section3Title')}
                            </h3>

                            <div className="space-y-4">
                                <div>
                                    <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 ml-1">{t('form.justificationLabel')}</label>
                                    <textarea required name="reason" value={formData.reason} onChange={handleChange} rows={3} placeholder={t('form.justificationPlaceholder')}
                                        className="w-full px-6 py-4 rounded-2xl bg-slate-50 border border-slate-100 focus:bg-white focus:ring-4 focus:ring-indigo-100 outline-none resize-none font-bold text-slate-700" />
                                </div>

                                <div className="space-y-3">
                                    <div className="p-6 bg-amber-50 rounded-3xl border border-amber-100">
                                        <div className="flex items-start gap-4">
                                            <AlertTriangle className="text-amber-500 mt-1 shrink-0" size={20} />
                                            <div>
                                                <h5 className="font-black text-amber-900 text-xs mb-2 uppercase tracking-wide">{t('form.mandatoryPolicyTitle')}</h5>
                                                <ul className="space-y-2 text-[11px] font-bold text-amber-800/70 list-disc list-inside">
                                                    <li>{t('form.policyItem1')}</li>
                                                    <li>{t('form.policyItem2')}</li>
                                                    <li>{t('form.policyItem3')}</li>
                                                </ul>
                                            </div>
                                        </div>
                                        <label className="flex items-center gap-4 mt-6 p-4 bg-white/50 rounded-2xl cursor-pointer hover:bg-white transition-all border border-amber-200/50">
                                            <input type="checkbox" name="agreedToPenalty" checked={formData.agreedToPenalty} onChange={handleChange} className="w-5 h-5 text-amber-600 rounded-lg focus:ring-amber-500 border-amber-200" />
                                            <span className="text-[11px] font-black text-amber-900 leading-tight">{t('form.penaltyAgreement')}</span>
                                        </label>
                                    </div>

                                    {isBondRequired && (
                                        <div className="p-6 bg-indigo-50 rounded-3xl border border-indigo-100 animate-in slide-in-from-top-4">
                                            <div className="flex items-start gap-4">
                                                <Briefcase className="text-indigo-600 mt-1 shrink-0" size={20} />
                                                <div>
                                                    <h5 className="font-black text-indigo-900 text-xs mb-2 uppercase tracking-wide">{t('form.serviceBondTitle')}</h5>
                                                    <p className="text-[11px] font-bold text-indigo-700/70 leading-relaxed">
                                                        {t('form.serviceBondDesc', { threshold: BOND_THRESHOLD.toLocaleString() })}
                                                    </p>
                                                </div>
                                            </div>
                                            <label className="flex items-center gap-4 mt-6 p-4 bg-white/50 rounded-2xl cursor-pointer hover:bg-white transition-all border border-indigo-200/50">
                                                <input type="checkbox" name="agreedToBond" checked={formData.agreedToBond} onChange={handleChange} className="w-5 h-5 text-indigo-600 rounded-lg focus:ring-indigo-500 border-indigo-200" />
                                                <span className="text-[11px] font-black text-indigo-900 leading-tight">{t('form.bondAgreement')}</span>
                                            </label>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>

                        <button
                            type="submit"
                            disabled={isSubmitDisabled}
                            className="w-full bg-slate-900 hover:bg-indigo-600 disabled:bg-slate-200 text-white font-black py-6 rounded-3xl shadow-2xl shadow-slate-900/20 flex items-center justify-center gap-3 transition-all transform active:scale-95 tracking-[0.15em] text-xs"
                        >
                            {isLoading ? t('form.processing') : <><Send size={18} /> {t('form.confirmSubmission')}</>}
                        </button>
                    </form>
                </div>
            </div>

            {/* --- Right Column: History --- */}
            <div className="lg:col-span-5 space-y-10">
                <div className="flex items-center gap-5">
                    <div className="p-4 bg-slate-100 text-slate-800 rounded-[24px]">
                        <Clock size={32} strokeWidth={2.5} />
                    </div>
                    <div>
                        <h2 className="text-2xl font-black text-slate-900 tracking-tight">{t('history.title')}</h2>
                        <p className="text-slate-400 font-bold uppercase tracking-widest text-[10px] mt-1">{t('history.subtitle')}</p>
                    </div>
                </div>

                <div className="space-y-6 relative before:absolute before:left-8 before:top-4 before:bottom-4 before:w-[2px] before:bg-slate-100 before:z-0">
                    {requests.length === 0 ? (
                        <div className="text-center py-20 bg-slate-50 rounded-[40px] border border-dashed border-slate-200 relative z-10">
                            <div className="w-20 h-20 bg-white rounded-3xl flex items-center justify-center mx-auto mb-6 text-slate-200 shadow-sm">
                                <FileText size={36} />
                            </div>
                            <h3 className="text-slate-800 font-black text-lg">{t('history.noRecordsTitle')}</h3>
                            <p className="text-slate-400 text-sm mt-2">{t('history.noRecordsMessage')}</p>
                        </div>
                    ) : (
                        requests.map(req => (
                            <div key={req.id} className="relative z-10 pl-16 group">
                                <div className={`absolute left-0 top-6 w-16 h-[2px] ${req.status === 'APPROVED' ? 'bg-emerald-200' : req.status === 'REJECTED' ? 'bg-rose-200' : 'bg-indigo-200'}`}></div>
                                <div className={`absolute left-7 top-5 w-3 h-3 rounded-full border-2 border-white ring-4 transition-all duration-500 ${req.status === 'APPROVED' ? 'bg-emerald-500 ring-emerald-100 group-hover:scale-150' : req.status === 'REJECTED' ? 'bg-rose-500 ring-rose-100' : 'bg-indigo-600 ring-indigo-100 animate-pulse'}`}></div>
                                
                                <div className="bg-white p-6 rounded-[32px] border border-slate-100 shadow-sm hover:shadow-xl transition-all duration-300">
                                    <div className="flex justify-between items-start mb-4">
                                        <div className="min-w-0 flex-1">
                                            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">{req.vendor}</p>
                                            <h3 className="font-black text-slate-800 leading-snug text-base group-hover:text-indigo-600 transition-colors">{req.title}</h3>
                                        </div>
                                    </div>

                                    <div className="flex flex-wrap gap-4 mb-5">
                                        <div className="flex items-center gap-2 bg-slate-50 px-3 py-1.5 rounded-xl text-[10px] font-black text-slate-600">
                                            <DollarSign size={12} className="text-indigo-600" />
                                            Rp {Number(req.cost).toLocaleString('id-ID')}
                                        </div>
                                        <div className="flex items-center gap-2 bg-slate-50 px-3 py-1.5 rounded-xl text-[10px] font-black text-slate-600">
                                            <Calendar size={12} className="text-indigo-600" />
                                            {new Date(req.submittedAt).toLocaleDateString()}
                                        </div>
                                    </div>

                                    {/* Mini Stepper */}
                                    <div className="bg-slate-50/50 p-4 rounded-2xl border border-slate-50 space-y-3">
                                        <div className="flex items-center justify-between text-[10px] font-black text-slate-400">
                                            <div className="flex items-center gap-2">
                                                <div className={`w-2 h-2 rounded-full ${req.supervisorName || user.role !== 'STAFF' ? 'bg-emerald-500' : 'bg-slate-200'}`}></div>
                                                {t('history.leaderOk')}
                                            </div>
                                            <ChevronRight size={14} />
                                            <div className="flex items-center gap-2">
                                                <div className={`w-2 h-2 rounded-full ${req.hrName ? 'bg-emerald-500' : 'bg-slate-200'}`}></div>
                                                {t('history.hrFinalOk')}
                                            </div>
                                        </div>
                                    </div>

                                    {req.status === 'REJECTED' && req.rejectionReason && (
                                        <div className="mt-4 p-4 bg-rose-50 rounded-2xl border border-rose-100">
                                            <p className="text-[10px] font-black text-rose-900 uppercase mb-2">{t('history.rejectionNote')}</p>
                                            <p className="text-xs text-rose-700 italic leading-relaxed">"{req.rejectionReason}"</p>
                                        </div>
                                    )}

                                    {req.status === 'APPROVED' && (
                                        <button
                                            onClick={() => handlePrint(req)}
                                            className="mt-5 w-full py-3 bg-emerald-50 text-emerald-700 hover:bg-emerald-600 hover:text-white rounded-2xl text-[11px] font-black flex items-center justify-center gap-2 transition-all border border-emerald-100"
                                        >
                                            <FileText size={14} /> {t('history.downloadCertificate')}
                                        </button>
                                    )}
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
