import React from 'react';

interface CertificateTemplateProps {
    employeeName: string;
    courseTitle: string;
    date: Date;
    certificateId: string;
}

const CertificateTemplate: React.FC<CertificateTemplateProps> = ({ 
    employeeName, 
    courseTitle, 
    date, 
    certificateId 
}) => {
    // Format date for the certificate (e.g., 5 MAY 2026)
    const formattedDate = `${date.getDate()} ${date.toLocaleString('en-US', { month: 'long' }).toUpperCase()} ${date.getFullYear()}`;
    const brandColor = '#004aad';

    return (
        <div 
            id="certificate-content"
            className="relative bg-white overflow-hidden shadow-2xl"
            style={{ 
                width: '1123px', 
                height: '794px',
                fontFamily: "'Inter', 'Segoe UI', Roboto, sans-serif",
                color: brandColor
            }}
        >
            {/* --- BACKGROUND IMAGE --- */}
            <div className="absolute inset-0 z-0 pointer-events-none">
                <img 
                    src="/cert-main-bg.png" 
                    alt="Background" 
                    className="w-full h-full object-cover"
                />
            </div>

            {/* --- DYNAMIC DATA OVERLAYS (Right Aligned) --- */}
            {/* 1. Employee Name */}
            <div 
                className="absolute z-10 w-[800px] flex justify-end"
                style={{ top: '305px', right: '70px' }}
            >
                <span 
                    className="font-black uppercase text-right"
                    style={{ 
                        fontSize: employeeName.length > 25 ? '32px' : '44px',
                        color: brandColor
                    }}
                >
                    {employeeName}
                </span>
            </div>

            {/* 2. Module Topic */}
            <div 
                className="absolute z-10 w-[800px] flex justify-end"
                style={{ top: '455px', right: '70px' }}
            >
                <h4 
                    className="text-[24px] font-bold uppercase tracking-tight text-right leading-tight italic"
                    style={{ color: brandColor }}
                >
                    {courseTitle}
                </h4>
            </div>

            {/* 3. Completion Date */}
            <div 
                className="absolute z-10 w-[300px] flex justify-end"
                style={{ bottom: '192px', right: '70px' }}
            >
                <p 
                    className="text-[16px] font-black uppercase tracking-wider text-right"
                    style={{ color: brandColor }}
                >
                    {formattedDate}
                </p>
            </div>

            {/* 4. Certificate ID */}
            <div 
                className="absolute z-10"
                style={{ bottom: '63px', left: '265px' }}
            >
                <span className="text-white font-bold text-[18px] tracking-widest opacity-95">
                    {certificateId}
                </span>
            </div>
        </div>
    );
};

export default CertificateTemplate;
