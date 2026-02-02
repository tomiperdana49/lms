import React, { useRef, useState } from 'react';
import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';
import { Download, X, Award } from 'lucide-react';

interface CertificateViewProps {
    studentName: string;
    courseTitle: string;
    date: string;
    onClose: () => void;
    onDownloadComplete: () => void;
}

const CertificateView: React.FC<CertificateViewProps> = ({ studentName, courseTitle, date, onClose, onDownloadComplete }) => {
    const certificateRef = useRef<HTMLDivElement>(null);
    const [isDownloading, setIsDownloading] = useState(false);

    const handleDownload = async () => {
        if (!certificateRef.current) return;
        setIsDownloading(true);

        try {
            // High quality capture
            const canvas = await html2canvas(certificateRef.current, {
                scale: 2, // Reting quality
                useCORS: true,
                logging: false,
                backgroundColor: '#ffffff'
            });

            const imgData = canvas.toDataURL('image/png');
            const pdf = new jsPDF({
                orientation: 'landscape',
                unit: 'px',
                format: [canvas.width, canvas.height]
            });

            pdf.addImage(imgData, 'PNG', 0, 0, canvas.width, canvas.height);
            pdf.save(`Certificate-${studentName}-${courseTitle}.pdf`);

            // Notify parent
            onDownloadComplete();
        } catch (err) {
            console.error("Certificate generation failed", err);
            alert("Failed to generate certificate. Please try again.");
        } finally {
            setIsDownloading(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/80 backdrop-blur-sm animate-in fade-in duration-300">
            <div className="bg-white rounded-2xl shadow-2xl max-w-4xl w-full overflow-hidden flex flex-col max-h-[90vh]">

                {/* Header Actions */}
                <div className="p-4 bg-slate-100 border-b border-slate-200 flex justify-between items-center">
                    <h3 className="font-bold text-slate-700 flex items-center gap-2">
                        <Award className="text-amber-500" />
                        Course Certificate
                    </h3>
                    <button onClick={onClose} className="p-2 hover:bg-slate-200 rounded-full text-slate-500 transition-colors">
                        <X size={20} />
                    </button>
                </div>

                {/* Certificate Preview Scroller */}
                <div className="flex-1 overflow-y-auto p-4 md:p-8 bg-slate-50 flex items-center justify-center">

                    {/* The Certificate Element */}
                    <div
                        ref={certificateRef}
                        className="bg-white p-12 md:p-16 text-center border-[20px] border-double border-slate-200 w-full max-w-3xl shadow-xl relative"
                        style={{ fontFamily: 'serif' }} // Basic serif for "Certificate" look
                    >
                        {/* Decorative Corners */}
                        <div className="absolute top-4 left-4 w-16 h-16 border-t-4 border-l-4 border-amber-400"></div>
                        <div className="absolute top-4 right-4 w-16 h-16 border-t-4 border-r-4 border-amber-400"></div>
                        <div className="absolute bottom-4 left-4 w-16 h-16 border-b-4 border-l-4 border-amber-400"></div>
                        <div className="absolute bottom-4 right-4 w-16 h-16 border-b-4 border-r-4 border-amber-400"></div>

                        {/* Content */}
                        <div className="py-8 space-y-6">
                            <div className="flex justify-center mb-6">
                                <div className="w-20 h-20 rounded-full bg-amber-50 flex items-center justify-center border-4 border-amber-200">
                                    <Award size={40} className="text-amber-500" />
                                </div>
                            </div>

                            <h1 className="text-4xl md:text-5xl font-bold text-slate-800 uppercase tracking-widest text-shadow-sm">
                                Certificate
                            </h1>
                            <p className="text-xl md:text-2xl font-light text-slate-500 italic">
                                of Completion
                            </p>

                            <div className="w-24 h-1 bg-amber-400 mx-auto my-6"></div>

                            <p className="text-lg text-slate-600">This certifies that</p>

                            <h2 className="text-3xl md:text-4xl font-bold text-blue-900 border-b-2 border-slate-100 pb-2 inline-block px-12 font-sans">
                                {studentName}
                            </h2>

                            <p className="text-lg text-slate-600 mt-6">
                                has successfully completed the course
                            </p>

                            <h3 className="text-2xl md:text-3xl font-bold text-slate-800 my-4 font-sans">
                                {courseTitle}
                            </h3>

                            <p className="text-slate-500">
                                Awarded on {new Date(date).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })}
                            </p>

                            {/* Signatures */}
                            <div className="flex justify-between items-end mt-16 px-12 pt-12">
                                <div className="flex flex-col items-center gap-2">
                                    <div className="w-40 border-b border-slate-400"></div>
                                    <span className="text-sm font-bold text-slate-900 font-sans">Course Instructor</span>
                                </div>

                                <div className="flex flex-col items-center gap-2">
                                    <div className="w-24 h-24 absolute mb-8 opacity-10">
                                        <Award size={96} />
                                    </div>
                                    <div className="w-40 border-b border-slate-400 z-10"></div>
                                    <span className="text-sm font-bold text-slate-900 font-sans">Director of Learning</span>
                                </div>
                            </div>
                        </div>
                    </div>

                </div>

                {/* Footer Controls */}
                <div className="p-6 border-t border-slate-200 bg-white flex flex-col md:flex-row justify-between items-center gap-4">
                    <p className="text-sm text-slate-500 text-center md:text-left">
                        Please download your certificate to complete the course.
                    </p>
                    <button
                        onClick={handleDownload}
                        disabled={isDownloading}
                        className="bg-blue-600 text-white px-8 py-3 rounded-xl font-bold hover:bg-blue-700 shadow-lg shadow-blue-200 transition-all flex items-center gap-2 w-full md:w-auto justify-center"
                    >
                        {isDownloading ? (
                            <>Generating...</>
                        ) : (
                            <>
                                <Download size={20} /> Download Certificate
                            </>
                        )}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default CertificateView;
