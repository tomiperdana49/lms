import { useState, useEffect, useRef } from 'react';
import { Html5Qrcode, Html5QrcodeSupportedFormats } from 'html5-qrcode';
import { X, Search, Check, Upload, Maximize, Camera } from 'lucide-react';
import { API_BASE_URL } from '../config';
import type { User } from '../types';

interface PinjamBukuFormProps {
    user: User;
    onClose: () => void;
}

const PinjamBukuForm = ({ user, onClose }: PinjamBukuFormProps) => {
    const [judulBuku, setJudulBuku] = useState('');
    const [kategoriBuku, setKategoriBuku] = useState('');
    const [tanggalKembali, setTanggalKembali] = useState('');
    const [alasan, setAlasan] = useState('');
    const [buktiFoto, setBuktiFoto] = useState<File | null>(null);
    const [searchQuery, setSearchQuery] = useState('');
    const [isDropdownOpen, setIsDropdownOpen] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const [sn, setSn] = useState('');
    const [isSearchingSn, setIsSearchingSn] = useState(false);
    const [isBookLocked, setIsBookLocked] = useState(false);
    const [showCamera, setShowCamera] = useState(false);
    const [cameraActive, setCameraActive] = useState(false);
    const scannerRef = useRef<Html5Qrcode | null>(null);
    const dropdownRef = useRef<HTMLDivElement>(null);

    const [bukuList, setBukuList] = useState<{title: string; category: string}[]>([]);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
                setIsDropdownOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside, true);
        return () => {
            document.removeEventListener('mousedown', handleClickOutside, true);
        };
    }, []);

    useEffect(() => {
        const fetchBooks = async () => {
            try {
                const baseUrl = import.meta.env.DEV ? '' : API_BASE_URL;
                const response = await fetch(`${baseUrl}/api/simas/books`);
                if (response.ok) {
                    const result = await response.json();
                    let dataArray = [];
                    if (Array.isArray(result)) {
                        dataArray = result;
                    } else if (result.data && Array.isArray(result.data)) {
                        dataArray = result.data;
                    }
                    
                    let mappedBooks = dataArray.map((book: any) => ({
                        title: book.name || book.title || 'Untitled',
                        category: book.subCategory?.name || book.category?.name || 'Lainnya'
                    }));
                    
                    // Filter duplicates based on title
                    const seenDetails = new Set();
                    mappedBooks = mappedBooks.filter((book: any) => {
                        if (seenDetails.has(book.title)) return false;
                        seenDetails.add(book.title);
                        return true;
                    });
                    
                    setBukuList(mappedBooks);
                }
            } catch (err) {
                console.error("Failed to fetch books from API:", err);
            }
        };
        fetchBooks();
    }, []);

    const filteredBooks = bukuList.filter(book => book.title.toLowerCase().includes(searchQuery.toLowerCase()));

    const isFormValid = judulBuku && kategoriBuku && tanggalKembali && buktiFoto;

    useEffect(() => {
        if (showCamera && !cameraActive) {
            const startScanner = async () => {
                const scanner = new Html5Qrcode("reader", { 
                    formatsToSupport: [ 
                        Html5QrcodeSupportedFormats.QR_CODE, 
                        Html5QrcodeSupportedFormats.CODE_39, 
                        Html5QrcodeSupportedFormats.CODE_128,
                        Html5QrcodeSupportedFormats.EAN_13,
                        Html5QrcodeSupportedFormats.EAN_8
                    ],
                    verbose: false
                });
                scannerRef.current = scanner;
                try {
                    await scanner.start(
                        { facingMode: "environment" },
                        {
                            fps: 20,
                            qrbox: { width: 320, height: 150 },
                            aspectRatio: 1.0
                        },
                        (decodedText) => {
                            // Stop scanner immediately on first successful scan to prevent multiple triggers
                            if (scannerRef.current) {
                                scannerRef.current.stop().then(() => {
                                    setCameraActive(false);
                                    setSn(decodedText);
                                    setShowCamera(false);
                                    // Auto trigger search after UI updates
                                    setTimeout(() => handleSnSearch(decodedText), 100);
                                }).catch(err => {
                                    console.error("Stop error:", err);
                                    // Fallback if stop fails
                                    setSn(decodedText);
                                    setShowCamera(false);
                                });
                            }
                        },
                        undefined
                    );
                    setCameraActive(true);
                } catch (err) {
                    console.error("Camera error:", err);
                    // Use a more user friendly error
                    console.log("Retrying or showing error to user...");
                    setCameraActive(false);
                }
            };
            startScanner();
        }

        return () => {
            if (scannerRef.current && cameraActive) {
                scannerRef.current.stop().catch(console.error);
                setCameraActive(false);
            }
        };
    }, [showCamera]);

    const handleSnSearch = async (snToSearch = sn) => {
        if (!snToSearch.trim()) return;
        setIsSearchingSn(true);
        try {
            const baseUrl = import.meta.env.DEV ? '' : API_BASE_URL;
            // Clean asterisk if scanner includes them
            const cleanSn = snToSearch.replace(/\*/g, '').trim();
            const response = await fetch(`${baseUrl}/api/simas/books?sn=${cleanSn}&branchId=020`);
            if (response.ok) {
                const result = await response.json();
                const dataArray = Array.isArray(result) ? result : (result.data || result.items || []);
                
                // Find book where code contains the searched SN (handling comma-separated codes)
                const foundBook = dataArray.find((book: any) => {
                    const code = (book.code || book.sn || '').toString();
                    return code.toLowerCase().includes(cleanSn.toLowerCase());
                });

                if (foundBook) {
                    setJudulBuku(foundBook.name || foundBook.title);
                    setKategoriBuku(foundBook.subCategory?.name || foundBook.category?.name || 'Lainnya');
                    setIsBookLocked(foundBook.name || foundBook.title ? true : false);
                } else {
                    alert("Buku dengan SN tersebut tidak ditemukan!");
                }
            }
        } catch (err) {
            console.error("Failed to fetch by SN:", err);
            alert("Error fetching SN data.");
        } finally {
            setIsSearchingSn(false);
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!isFormValid || isLoading) return;
        
        setIsLoading(true);

        try {
            // 1. Upload foto bukti
            const formData = new FormData();
            formData.append('file', buktiFoto!);

            const uploadRes = await fetch(`${API_BASE_URL}/api/upload`, {
                method: 'POST',
                body: formData
            });

            if (!uploadRes.ok) {
                alert("Upload gambar gagal!");
                setIsLoading(false);
                return;
            }

            const uploadData = await uploadRes.json();
            const evidenceUrl = uploadData.fileUrl;

            // 2. Submit data peminjaman
            const logData = {
                title: judulBuku,
                category: kategoriBuku,
                location: 'Kantor',
                source: 'Office/Other',
                userName: user.name,
                employee_id: user.employee_id,
                date: new Date().toISOString(),
                startDate: new Date().toISOString(),
                finishDate: (() => {
                    const d = new Date(tanggalKembali);
                    d.setHours(9, 0, 0, 0);
                    return d.toISOString();
                })(),
                evidenceUrl: evidenceUrl,
                status: 'Reading',
                review: alasan,
                hrApprovalStatus: 'Pending',
                sn: sn
            };

            const res = await fetch(`${API_BASE_URL}/api/logs`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(logData)
            });

            if (res.ok) {
                onClose();
            } else {
                const err = await res.json();
                alert(`Gagal menyimpan data: ${err.error || err.message}`);
                setIsLoading(false);
            }
        } catch (err) {
            console.error(err);
            alert("Terjadi kesalahan koneksi server.");
            setIsLoading(false);
        }
    };

    return (
        <div className="fixed inset-0 z-[100] bg-[#121212] flex justify-center text-white font-sans overflow-hidden">
            {/* Mobile container constraint for desktop viewing */}
            <div className="w-full max-w-md bg-[#18181b] h-full max-h-screen flex flex-col relative sm:border-x sm:border-[#27272a] shadow-2xl">
                
                {/* Header */}
                <header className="flex items-center justify-between p-4 sticky top-0 bg-[#18181b] z-10 border-b border-[#27272a]/50">
                    <button 
                        onClick={onClose}
                        className="p-2 text-gray-300 hover:text-white transition-colors"
                    >
                        <X size={24} />
                    </button>
                    <h1 className="text-lg font-semibold tracking-wide">Peminjaman Buku</h1>
                    <div className="w-10 h-10"></div> {/* Spacer to keep title centered */}
                </header>

                <div className="flex-1 overflow-y-auto pb-24">
                    

                    {/* Image Placeholder */}
                    <div className="px-4 mb-6">
                        <div className="w-full aspect-[21/9] bg-gradient-to-r from-green-600 to-emerald-800 rounded-xl overflow-hidden relative">
                           {/* Using a placeholder image or patterned background if no image is available. A generic work environment image works well. */}
                           <img 
                               src="https://images.unsplash.com/photo-1522071820081-009f0129c71c?auto=format&fit=crop&q=80&w=800" 
                               alt="Team" 
                               className="w-full h-full object-cover mix-blend-overlay opacity-80"
                           />
                           <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent flex items-end p-4">
                               <div className="bg-white/90 backdrop-blur text-green-700 px-3 py-1 rounded-md text-sm font-bold shadow-lg">nusanet</div>
                           </div>
                        </div>
                    </div>

                    {/* Form Layout */}
                    <div className="px-4 flex flex-col gap-6">
                        <div>
                            <h2 className="text-2xl font-bold mb-2 text-gray-100">Form Peminjaman Buku</h2>
                            <p className="text-gray-400 text-sm">
                                Silakan pilih judul buku yang akan dipinjam.
                            </p>
                        </div>

                        <form onSubmit={handleSubmit} className="flex flex-col gap-5 mt-2">
                            
                            {/* Scan SN */}
                            <div className="relative">
                                <div className={`absolute -top-2.5 left-4 bg-[#18181b] px-1 text-xs font-medium z-10 text-gray-400`}>
                                    Scan / Input SN
                                </div>
                                <div className="flex gap-2">
                                    <div className="relative flex-1">
                                        <input 
                                            className="w-full bg-transparent border border-[#3f3f46] rounded-xl pl-10 pr-10 py-4 text-white focus:outline-none focus:border-green-500 transition-colors"
                                            value={sn}
                                            onChange={(e) => setSn(e.target.value)}
                                            onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), handleSnSearch())}
                                            placeholder="Scan barcode / Input SN..."
                                        />
                                        <Maximize size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" />
                                        <button 
                                            type="button"
                                            onClick={() => setShowCamera(true)}
                                            className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-green-500"
                                        >
                                            <Camera size={20} />
                                        </button>
                                    </div>
                                    <button 
                                        type="button"
                                        onClick={() => handleSnSearch()}
                                        disabled={isSearchingSn}
                                        className="px-6 bg-green-600 hover:bg-green-500 text-white font-bold rounded-xl disabled:opacity-50 transition-colors"
                                    >
                                        {isSearchingSn ? '...' : 'Cari'}
                                    </button>
                                </div>
                            </div>

                            {/* Camera Modal */}
                            {showCamera && (
                                <div className="fixed inset-0 z-[200] bg-black flex flex-col items-center justify-center p-4">
                                    <div className="w-full max-w-sm bg-[#18181b] rounded-2xl overflow-hidden shadow-2xl relative">
                                        <div className="p-4 border-b border-[#27272a] flex justify-between items-center">
                                            <h3 className="text-white font-bold">Scan Barcode</h3>
                                            <button onClick={() => setShowCamera(false)} className="text-gray-400 hover:text-white"><X size={24}/></button>
                                        </div>
                                        <div id="reader" className="w-full min-h-[300px]"></div>
                                        <div className="p-4 text-center text-xs text-gray-400">
                                            Arahkan kamera ke barcode buku
                                        </div>
                                    </div>
                                </div>
                            )}
                            
                            {/* Judul Buku Select (Combobox) */}
                            <div className="relative" ref={dropdownRef}>
                                {/* Simulated label inside border */}
                                <div className={`absolute -top-2.5 left-4 bg-[#18181b] px-1 text-xs font-medium z-10 transition-colors ${!judulBuku ? 'text-red-500/90' : 'text-gray-400'}`}>
                                    Judul Buku
                                </div>
                                <div 
                                    className={`flex items-center w-full bg-transparent border rounded-xl px-4 py-4 cursor-pointer transition-colors ${!judulBuku ? 'border-red-500/80 focus:border-red-400' : 'border-[#3f3f46] hover:border-gray-500'} ${isBookLocked ? 'opacity-70 cursor-not-allowed bg-slate-900/40' : ''}`}
                                    onClick={() => !isBookLocked && setIsDropdownOpen(!isDropdownOpen)}
                                >
                                    <span className={judulBuku ? "text-white" : "text-gray-500"}>
                                        {judulBuku || "Pilih Buku..."}
                                    </span>
                                    {/* Custom dropdown icon */}
                                    {!isBookLocked && (
                                        <div className={`ml-auto text-gray-400 transition-transform ${isDropdownOpen ? 'rotate-180' : ''}`}>
                                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                                <path d="m9 18 6-6-6-6"/>
                                            </svg>
                                        </div>
                                    )}
                                </div>

                                {/* Custom Dropdown Menu with Search */}
                                {isDropdownOpen && (
                                    <div className="absolute top-[calc(100%+8px)] left-0 w-full bg-[#1f1f22] border border-[#3f3f46] rounded-xl z-50 shadow-2xl overflow-hidden flex flex-col">
                                        <div className="p-3 border-b border-[#3f3f46]">
                                            <div className="relative">
                                                <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
                                                <input 
                                                    type="text" 
                                                    autoFocus
                                                    placeholder="Cari buku..." 
                                                    className="w-full bg-[#121212] border border-[#3f3f46] rounded-lg pl-9 pr-3 py-2 text-sm text-white focus:outline-none focus:border-green-500 transition-colors"
                                                    value={searchQuery}
                                                    onChange={(e) => setSearchQuery(e.target.value)}
                                                    onClick={(e) => e.stopPropagation()}
                                                />
                                            </div>
                                        </div>
                                        <div className="max-h-48 overflow-y-auto">
                                            {filteredBooks.length > 0 ? (
                                                filteredBooks.map(book => (
                                                    <div 
                                                        key={book.title}
                                                        className="px-4 py-3 hover:bg-[#27272a] cursor-pointer text-sm text-gray-200 transition-colors flex items-center justify-between"
                                                        onClick={() => {
                                                            setJudulBuku(book.title);
                                                            setKategoriBuku(book.category);
                                                            setIsDropdownOpen(false);
                                                            setSearchQuery('');
                                                        }}
                                                    >
                                                        <div>
                                                            <div className="font-medium text-white">{book.title}</div>
                                                            <div className="text-[10px] text-gray-500">{book.category}</div>
                                                        </div>
                                                        {judulBuku === book.title && <Check size={16} className="text-green-500" />}
                                                    </div>
                                                ))
                                            ) : (
                                                <div className="px-4 py-4 text-sm text-gray-500 text-center">
                                                    Buku tidak ditemukan
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                )}

                                {!judulBuku && <p className="text-red-500/90 text-xs mt-2 ml-1">Enter Judul Buku</p>}
                            </div>

                            {/* Kategori Buku */}
                            <div className="relative mt-2">
                                <input 
                                    className="w-full bg-transparent border border-[#3f3f46] rounded-xl px-4 py-4 text-white focus:outline-none transition-colors cursor-not-allowed opacity-70"
                                    value={kategoriBuku}
                                    readOnly
                                    placeholder="Kategori Buku (Terisi Otomatis)"
                                />
                            </div>

                            {/* Tanggal Rencana Pengembalian */}
                            <div className="relative mt-2">
                                <input 
                                    type="date" 
                                    className={`peer w-full bg-transparent border rounded-xl px-4 py-4 focus:outline-none transition-colors [color-scheme:dark] ${!tanggalKembali ? 'border-red-500/80 focus:border-red-400 text-transparent focus:text-white' : 'border-[#3f3f46] focus:border-green-500 text-white'}`}
                                    value={tanggalKembali}
                                    onChange={(e) => setTanggalKembali(e.target.value)}
                                />
                                {!tanggalKembali && (
                                     <div className="absolute left-4 top-[24px] -translate-y-1/2 pointer-events-none text-gray-500 peer-focus:hidden">
                                        Tanggal Rencana Pengembalian *
                                    </div>
                                )}
                                {!tanggalKembali && <p className="text-red-500/90 text-xs mt-2 ml-1">Wajib mengisi tanggal</p>}
                            </div>

                            {/* Bukti Foto Buku */}
                            <div className="relative mt-2">
                                <input 
                                    type="file" 
                                    id="bukti-foto"
                                    accept="image/*"
                                    className="hidden"
                                    onChange={(e) => {
                                        if (e.target.files && e.target.files[0]) {
                                            setBuktiFoto(e.target.files[0]);
                                        }
                                    }}
                                />
                                <label 
                                    htmlFor="bukti-foto"
                                    className={`flex items-center w-full bg-transparent border rounded-xl px-4 py-4 cursor-pointer transition-colors ${!buktiFoto ? 'border-red-500/80 hover:border-red-400' : 'border-[#3f3f46] hover:border-gray-500'}`}
                                >
                                    <div className="flex-1 overflow-hidden">
                                        <span className={`block truncate ${buktiFoto ? "text-white" : "text-gray-500"}`}>
                                            {buktiFoto ? buktiFoto.name : "Bukti Foto Buku *"}
                                        </span>
                                    </div>
                                    <div className="ml-3 text-gray-400 flex-shrink-0">
                                        {buktiFoto ? <Check size={20} className="text-green-500" /> : <Upload size={20} />}
                                    </div>
                                </label>
                                {!buktiFoto && <p className="text-red-500/90 text-xs mt-2 ml-1">Wajib melampirkan foto</p>}
                            </div>

                            {/* Alasan Peminjaman */}
                            <div className="relative mt-2">
                                <textarea 
                                    className="w-full bg-transparent border border-[#3f3f46] rounded-xl px-4 py-4 text-white focus:outline-none focus:border-green-500 transition-colors min-h-[120px] resize-none"
                                    value={alasan}
                                    onChange={(e) => setAlasan(e.target.value)}
                                    placeholder="Alasan Peminjaman (Opsional)"
                                ></textarea>
                            </div>

                        </form>
                    </div>
                </div>

                {/* Bottom Action Area */}
                <div className="mt-auto px-4 pb-6 pt-4 bg-gradient-to-t from-[#18181b] via-[#18181b] to-transparent sticky bottom-0">
                    <button 
                        onClick={handleSubmit}
                        disabled={!isFormValid || isLoading}
                        className={`w-full py-4 rounded-full font-semibold transition-all shadow-lg ${isFormValid && !isLoading ? 'bg-green-600 hover:bg-green-500 text-white shadow-green-900/40' : 'bg-[#27272a] text-gray-500 cursor-not-allowed'}`}
                    >
                        {isLoading ? 'Memproses...' : 'Pinjam'}
                    </button>
                    
                </div>
                
            </div>
        </div>
    );
};

export default PinjamBukuForm;
