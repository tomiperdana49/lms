import React from 'react';

interface InternalCertificateTemplateProps {
    employeeName: string;
    trainingTitle: string;
    date: Date;
    certNo: string;
    serial: string;
    qrDataUrl?: string;
    issuedIn?: string;
    role?: 'participant' | 'host' | 'online';
    elementId?: string;
}

const InternalCertificateTemplate: React.FC<InternalCertificateTemplateProps> = ({
    employeeName,
    trainingTitle,
    date,
    certNo,
    serial,
    qrDataUrl,
    issuedIn = 'Medan',
    role = 'participant',
    elementId = 'internal-certificate-content'
}) => {
    const formattedDate = date.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });

    return (
        <div
            id={elementId}
            className="relative bg-white overflow-hidden shadow-2xl"
            style={{
                width: '1123px',
                height: '794px',
                fontFamily: "'Inter', 'Segoe UI', Roboto, sans-serif"
            }}
        >
            {/* --- BACKGROUND (logos + watermark) --- */}
            <div className="absolute inset-0 z-0 pointer-events-none">
                <img
                    src="/cert-internal-bg.png"
                    alt="Background"
                    className="w-full h-full object-cover"
                />
            </div>

            {/* --- Certificate of Appreciation --- */}
            <div className="absolute z-10 left-0 right-0 text-center" style={{ top: '222px' }}>
                <h1 className="font-black text-slate-800" style={{ fontSize: '46px', letterSpacing: '0.5px' }}>
                    Certificate of Appreciation
                </h1>
            </div>

            {/* --- is presented to --- */}
            <div className="absolute z-10 left-0 right-0 text-center" style={{ top: '300px' }}>
                <p className="text-slate-500 font-semibold" style={{ fontSize: '17px' }}>
                    is presented to:
                </p>
            </div>

            {/* --- Employee Name --- */}
            <div className="absolute z-10 left-0 right-0 text-center" style={{ top: '336px' }}>
                <span
                    className="text-slate-800"
                    style={{
                        fontFamily: "'Dancing Script', 'Segoe Script', cursive",
                        fontWeight: 700,
                        fontSize: employeeName.length > 28 ? '44px' : '58px'
                    }}
                >
                    {employeeName}
                </span>
            </div>

            {/* --- Divider --- */}
            <div className="absolute z-10 bg-slate-300" style={{ top: '430px', left: '75px', right: '75px', height: '1px' }} />

            {/* --- Attendance line --- */}
            <div className="absolute z-10 left-0 right-0 text-center px-24" style={{ top: '452px' }}>
                <p className="text-slate-600" style={{ fontSize: '15px' }}>
                    {role === 'host'
                        ? 'Has made an indelible mark by delivering an insightful and impactful training session:'
                        : role === 'online'
                        ? 'Has successfully completed the online learning module:'
                        : 'Has successfully attended and completed the internal training session:'}
                </p>
            </div>

            {/* --- Training Title --- */}
            <div className="absolute z-10 left-0 right-0 text-center px-24" style={{ top: '487px' }}>
                <h3 className="font-bold text-slate-800" style={{ fontSize: trainingTitle.length > 60 ? '17px' : '21px' }}>
                    {trainingTitle}
                </h3>
            </div>

            {/* --- Appreciation Paragraph --- */}
            <div className="absolute z-10 text-center" style={{ top: '528px', left: '140px', right: '140px' }}>
                <p className="text-slate-600 leading-relaxed" style={{ fontSize: '14.5px' }}>
                    {role === 'host'
                        ? 'We extend our sincere gratitude for your expertise and engaging presentation, which has significantly enriched the skills and knowledge of our team. Your valuable contribution is highly appreciated.'
                        : role === 'online'
                        ? 'We appreciate your commitment throughout the online learning module journey, which reflects your dedication to continuous learning and professional growth. Congratulations on this achievement.'
                        : 'We appreciate your active participation and commitment throughout the session, which reflects your dedication to continuous learning and professional growth. Congratulations on this achievement.'}
                </p>
            </div>

            {/* --- Footer: No / Serial / Issued in (left) --- */}
            <div className="absolute z-10" style={{ top: '628px', left: '75px' }}>
                {qrDataUrl ? (
                    <img src={qrDataUrl} alt="Verification QR" className="w-[74px] h-[74px] rounded-xl border border-slate-200" />
                ) : (
                    <div className="w-[74px] h-[74px] rounded-xl bg-slate-100 border border-slate-200" />
                )}
            </div>
            <div className="absolute z-10 space-y-1" style={{ top: '633px', left: '170px' }}>
                <p className="text-slate-600" style={{ fontSize: '13px' }}>
                    <span className="font-semibold text-slate-500">No: </span>{certNo}
                </p>
                <p className="text-slate-600" style={{ fontSize: '13px' }}>
                    <span className="font-semibold text-slate-500">Serial: </span>{serial}
                </p>
                <p className="text-slate-600" style={{ fontSize: '13px' }}>
                    <span className="font-semibold text-slate-500">Issued in: </span>{issuedIn}
                </p>
            </div>

            {/* --- Footer: Company + Date (right) --- */}
            <div className="absolute z-10 text-right" style={{ top: '633px', right: '75px' }}>
                <p className="font-bold text-slate-800" style={{ fontSize: '15px' }}>PT Media Antar Nusa</p>
                <p className="text-slate-500 mt-2" style={{ fontSize: '13px' }}>{formattedDate}</p>
            </div>
        </div>
    );
};

export default InternalCertificateTemplate;
