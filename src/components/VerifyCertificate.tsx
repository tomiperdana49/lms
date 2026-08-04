import { useEffect, useRef, useState } from 'react';
import { CheckCircle2, XCircle, Loader2, ShieldCheck } from 'lucide-react';
import { API_BASE_URL } from '../config';
import InternalCertificateTemplate from './InternalCertificateTemplate';

interface VerifyCertificateProps {
    serial: string;
}

interface CertData {
    valid: boolean;
    employeeName?: string;
    trainingTitle?: string;
    trainingDate?: string;
    certNo?: string;
    serial?: string;
    companyName?: string;
}

const VerifyCertificate = ({ serial }: VerifyCertificateProps) => {
    const [data, setData] = useState<CertData | null>(null);
    const [loading, setLoading] = useState(true);
    const containerRef = useRef<HTMLDivElement>(null);
    const [scale, setScale] = useState(1);

    useEffect(() => {
        fetch(`${API_BASE_URL}/api/internal-certificates/verify/${serial}`)
            .then(res => res.json().then(json => ({ ok: res.ok, json })))
            .then(({ ok, json }) => setData(ok ? json : { valid: false }))
            .catch(() => setData({ valid: false }))
            .finally(() => setLoading(false));
    }, [serial]);

    useEffect(() => {
        const updateScale = () => {
            if (containerRef.current) setScale(containerRef.current.offsetWidth / 1123);
        };
        updateScale();
        window.addEventListener('resize', updateScale);
        return () => window.removeEventListener('resize', updateScale);
    }, [data]);

    return (
        <div className="min-h-screen bg-slate-50 flex flex-col items-center py-12 px-4">
            <div className="w-full max-w-3xl">
                <div className="text-center mb-8">
                    <h1 className="text-2xl font-black text-slate-800">Certificate Verification</h1>
                    <p className="text-slate-500 text-sm mt-1">PT Media Antar Nusa &mdash; Learning Management System</p>
                </div>

                {loading ? (
                    <div className="flex flex-col items-center justify-center py-20 text-slate-400">
                        <Loader2 className="animate-spin mb-3" size={32} />
                        <p>Verifying certificate...</p>
                    </div>
                ) : data?.valid ? (
                    <>
                        <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-6 mb-6 flex items-center gap-4">
                            <CheckCircle2 className="text-emerald-600 shrink-0" size={36} />
                            <div>
                                <p className="font-bold text-emerald-800">This certificate is genuine</p>
                                <p className="text-sm text-emerald-700">Issued by {data.companyName || 'PT Media Antar Nusa'}</p>
                            </div>
                        </div>

                        <div className="bg-white border border-slate-200 rounded-2xl p-6 mb-8 space-y-3">
                            <div className="flex justify-between gap-4 text-sm">
                                <span className="text-slate-500 shrink-0">Name</span>
                                <span className="font-bold text-slate-800 text-right">{data.employeeName}</span>
                            </div>
                            <div className="flex justify-between gap-4 text-sm">
                                <span className="text-slate-500 shrink-0">Training</span>
                                <span className="font-bold text-slate-800 text-right">{data.trainingTitle}</span>
                            </div>
                            <div className="flex justify-between gap-4 text-sm">
                                <span className="text-slate-500 shrink-0">Date</span>
                                <span className="font-bold text-slate-800 text-right">
                                    {data.trainingDate ? new Date(data.trainingDate).toLocaleDateString('en-US', { day: 'numeric', month: 'long', year: 'numeric' }) : '-'}
                                </span>
                            </div>
                            <div className="flex justify-between gap-4 text-sm">
                                <span className="text-slate-500 shrink-0">Certificate No.</span>
                                <span className="font-bold text-slate-800 text-right">{data.certNo}</span>
                            </div>
                            <div className="flex justify-between gap-4 text-sm">
                                <span className="text-slate-500 shrink-0">Serial</span>
                                <span className="font-bold text-slate-800 text-right">{data.serial}</span>
                            </div>
                        </div>

                        <div
                            ref={containerRef}
                            className="w-full rounded-xl overflow-hidden shadow-xl border border-slate-200"
                            style={{ height: 794 * scale }}
                        >
                            <div style={{ transform: `scale(${scale})`, transformOrigin: 'top left', width: '1123px', height: '794px' }}>
                                <InternalCertificateTemplate
                                    employeeName={data.employeeName || ''}
                                    trainingTitle={data.trainingTitle || ''}
                                    date={data.trainingDate ? new Date(data.trainingDate) : new Date()}
                                    certNo={data.certNo || ''}
                                    serial={data.serial || ''}
                                />
                            </div>
                        </div>
                    </>
                ) : (
                    <div className="bg-rose-50 border border-rose-200 rounded-2xl p-6 flex items-center gap-4">
                        <XCircle className="text-rose-600 shrink-0" size={36} />
                        <div>
                            <p className="font-bold text-rose-800">Certificate not found</p>
                            <p className="text-sm text-rose-700">This serial number does not match any issued certificate.</p>
                        </div>
                    </div>
                )}

                <p className="text-center text-xs text-slate-400 mt-10 flex items-center justify-center gap-1.5">
                    <ShieldCheck size={14} /> Verified by LMS Nusa
                </p>
            </div>
        </div>
    );
};

export default VerifyCertificate;
