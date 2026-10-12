import { useEffect, useRef, useState } from 'react';
import { Clock, MapPin, Users, Video, CalendarDays } from 'lucide-react';
import { API_BASE_URL } from '../config';

interface PublicTraining {
    id: number;
    title: string;
    date: string; // "YYYY-MM-DD"
    time: string | null; // e.g. "10:00 - 12:00"
    type: string | null;
    location: string | null;
    host: string | null;
    hostPhotoUrl: string | null;
    participantCount: number;
    // The first few participants (short name + photo); participantCount is the full number.
    participants: { name: string; photoUrl: string | null }[];
}

const REFRESH_MS = 5 * 60 * 1000;
// A TV tab stays open for days - reload now and then so it picks up new deploys too.
const FULL_RELOAD_MS = 6 * 60 * 60 * 1000;
// Auto-scroll for when the list is taller than the screen: hold at the top, glide down, hold at
// the bottom, jump back up, repeat. Someone scrolling by hand pauses it for a while.
const SCROLL_SPEED_PX_PER_S = 40;
const SCROLL_HOLD_MS = 6000;
const SCROLL_PAUSE_AFTER_USER_MS = 15000;

const parseLocalDate = (value: string) => {
    const [y, m, d] = value.split('-').map(Number);
    return new Date(y, m - 1, d);
};

// "10:00 - 12:00" -> minutes since midnight for start and end (end is null if there isn't one).
const parseTimeRange = (time: string | null) => {
    const matches = [...(time || '').matchAll(/(\d{1,2})[:.](\d{2})/g)].map(m => Number(m[1]) * 60 + Number(m[2]));
    return { start: matches[0] ?? null, end: matches[1] ?? null };
};

const isSameDay = (a: Date, b: Date) => a.toDateString() === b.toDateString();

// A person's round photo (participant or trainer); falls back to their initial if it can't load.
const ParticipantAvatar = ({ name, photoUrl, className = '' }: { name: string; photoUrl: string | null; className?: string }) => {
    const [failed, setFailed] = useState(false);
    const ring = `w-9 h-9 lg:w-10 lg:h-10 rounded-full ring-2 ring-indigo-950 shrink-0 ${className}`;
    return photoUrl && !failed ? (
        <img src={photoUrl} alt={name} title={name} onError={() => setFailed(true)} className={`${ring} object-cover bg-slate-600`} />
    ) : (
        <div title={name} className={`${ring} bg-indigo-400 text-white flex items-center justify-center text-sm font-black`}>
            {name.charAt(0).toUpperCase()}
        </div>
    );
};

// Who's joining: a row of stacked photos, with their short names (and how many more) on the line
// below - side by side, three-column cards leave the names too narrow a strip and they wrap word by word.
const ParticipantPreview = ({ training }: { training: PublicTraining }) => {
    const shown = training.participants || [];
    const more = training.participantCount - shown.length;
    if (training.participantCount === 0) return null;
    if (shown.length === 0) {
        return <span className="flex items-center gap-2"><Users size={18} className="shrink-0 text-indigo-300" />{training.participantCount} peserta</span>;
    }
    return (
        <div className="flex flex-col gap-1.5 pt-1">
            <p className="text-[11px] lg:text-xs font-black uppercase tracking-wider text-indigo-300">Peserta ({training.participantCount})</p>
            <div className="flex -space-x-2.5">
                {shown.map((p, i) => <ParticipantAvatar key={i} name={p.name} photoUrl={p.photoUrl} />)}
                {more > 0 && (
                    <div className="w-9 h-9 lg:w-10 lg:h-10 rounded-full ring-2 ring-indigo-950 bg-white/20 text-white flex items-center justify-center text-xs lg:text-sm font-black shrink-0">
                        +{more}
                    </div>
                )}
            </div>
            <p className="text-sm lg:text-base text-indigo-100 leading-snug">
                {shown.map(p => p.name).join(', ')}
                {more > 0 && <span className="text-indigo-300"> & {more} lainnya</span>}
            </p>
        </div>
    );
};

// Public, no-login board for office TVs (/upcoming-training): the next scheduled internal
// trainings, refreshed every few minutes, with today's sessions - and any running right now -
// called out.
const UpcomingTrainingBoard = () => {
    const [trainings, setTrainings] = useState<PublicTraining[] | null>(null);
    const [failed, setFailed] = useState(false);
    const [now, setNow] = useState(new Date());
    const scrollRef = useRef<HTMLElement>(null);

    useEffect(() => {
        document.title = 'Upcoming Training - LMS Nusa';
        const load = () => {
            fetch(`${API_BASE_URL}/api/public/upcoming-training`)
                .then(res => res.ok ? res.json() : Promise.reject(new Error(`HTTP ${res.status}`)))
                .then((data: PublicTraining[]) => { setTrainings(data); setFailed(false); })
                // Keep showing the last good list if a refresh fails (e.g. the network blips).
                .catch(err => { console.error('Failed to load upcoming training:', err); setFailed(true); });
        };
        load();
        const refresh = setInterval(load, REFRESH_MS);
        const clock = setInterval(() => setNow(new Date()), 30 * 1000);
        const reload = setTimeout(() => window.location.reload(), FULL_RELOAD_MS);
        return () => { clearInterval(refresh); clearInterval(clock); clearTimeout(reload); };
    }, []);

    useEffect(() => {
        const el = scrollRef.current;
        if (!el) return;
        let frame = 0;
        let last = performance.now();
        let phase: 'holdTop' | 'down' | 'holdBottom' = 'holdTop';
        let phaseUntil = last + SCROLL_HOLD_MS;
        let pausedUntil = 0;
        // scrollTop only moves in whole pixels, so track the exact position separately.
        let position = el.scrollTop;

        const step = (t: number) => {
            const dt = t - last;
            last = t;
            const max = el.scrollHeight - el.clientHeight;
            if (t < pausedUntil) {
                position = el.scrollTop;
            } else if (max <= 1) {
                // Everything fits - nothing to scroll.
                phase = 'holdTop';
                phaseUntil = t + SCROLL_HOLD_MS;
                position = 0;
            } else if (phase === 'holdTop' && t >= phaseUntil) {
                phase = 'down';
            } else if (phase === 'down') {
                position = Math.min(max, position + SCROLL_SPEED_PX_PER_S * dt / 1000);
                el.scrollTop = position;
                if (position >= max) { phase = 'holdBottom'; phaseUntil = t + SCROLL_HOLD_MS; }
            } else if (phase === 'holdBottom' && t >= phaseUntil) {
                position = 0;
                el.scrollTo({ top: 0, behavior: 'smooth' });
                phase = 'holdTop';
                phaseUntil = t + SCROLL_HOLD_MS;
            }
            frame = requestAnimationFrame(step);
        };
        frame = requestAnimationFrame(step);

        const pause = () => { pausedUntil = performance.now() + SCROLL_PAUSE_AFTER_USER_MS; phase = 'holdTop'; phaseUntil = pausedUntil; };
        el.addEventListener('wheel', pause, { passive: true });
        el.addEventListener('touchstart', pause, { passive: true });
        return () => {
            cancelAnimationFrame(frame);
            el.removeEventListener('wheel', pause);
            el.removeEventListener('touchstart', pause);
        };
    }, []);

    const nowMinutes = now.getHours() * 60 + now.getMinutes();
    // Drop today's sessions that have already ended, so the board only shows what's still ahead.
    const visible = (trainings || []).filter(tr => {
        const date = parseLocalDate(tr.date);
        if (!isSameDay(date, now)) return true;
        const { end } = parseTimeRange(tr.time);
        return end === null || end > nowMinutes;
    });

    return (
        <div className="h-screen overflow-hidden bg-gradient-to-br from-slate-950 via-indigo-950 to-purple-950 text-white flex flex-col">
            <header className="shrink-0 flex items-center justify-between gap-6 px-6 sm:px-10 lg:px-14 pt-6 sm:pt-10 pb-6">
                <div className="flex items-center gap-4 min-w-0">
                    <img src="/favicon.png" alt="" className="w-12 h-12 sm:w-16 sm:h-16 rounded-2xl bg-white p-1.5 shrink-0" />
                    <div className="min-w-0">
                        <p className="text-xs sm:text-sm font-black tracking-[0.3em] text-indigo-300 uppercase">LMS Nusa</p>
                        <h1 className="text-2xl sm:text-4xl lg:text-5xl font-black tracking-tight truncate">Upcoming Training</h1>
                    </div>
                </div>
                <div className="text-right shrink-0">
                    <p className="text-3xl sm:text-5xl lg:text-6xl font-black tabular-nums leading-none">
                        {now.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}
                    </p>
                    <p className="text-xs sm:text-base font-semibold text-indigo-200 mt-1">
                        {now.toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
                    </p>
                </div>
            </header>

            <main ref={scrollRef} className="flex-1 min-h-0 overflow-y-auto px-6 sm:px-10 lg:px-14 pb-8" style={{ scrollbarWidth: 'none' }}>
                {trainings === null ? (
                    <p className="text-center text-xl text-indigo-200 mt-24">{failed ? 'Gagal memuat jadwal training. Mencoba lagi...' : 'Memuat jadwal training...'}</p>
                ) : visible.length === 0 ? (
                    <div className="flex flex-col items-center justify-center text-center mt-24 gap-4">
                        <CalendarDays size={72} className="text-indigo-300" />
                        <p className="text-2xl sm:text-3xl font-black">Belum ada training terjadwal</p>
                        <p className="text-indigo-200 sm:text-lg">Jadwal training internal berikutnya akan tampil di sini.</p>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 sm:gap-5">
                        {visible.map((tr, index) => {
                            const date = parseLocalDate(tr.date);
                            // The first card is the nearest training still ahead - it glows and
                            // blinks to catch the eye of whoever walks past the TV.
                            const isNearest = index === 0;
                            const isToday = isSameDay(date, now);
                            const { start, end } = parseTimeRange(tr.time);
                            const isLive = isToday && start !== null && start <= nowMinutes && (end === null || nowMinutes < end);
                            const isOnline = (tr.type || '').toLowerCase() === 'online';
                            return (
                                <div
                                    key={tr.id}
                                    className={`flex gap-4 p-4 sm:p-5 rounded-3xl ${isNearest
                                        ? `border-2 border-amber-400 motion-safe:animate-nearest-glow ${isLive ? 'bg-emerald-500/15' : 'bg-white/15'}`
                                        : `border ${isLive ? 'bg-emerald-500/15 border-emerald-400/60' : isToday ? 'bg-white/15 border-indigo-300/50' : 'bg-white/5 border-white/10'}`}`}
                                >
                                    <div className={`w-20 sm:w-24 self-start shrink-0 rounded-2xl flex flex-col items-center justify-center py-3 ${isToday ? 'bg-indigo-500' : 'bg-white/10'}`}>
                                        <span className="text-xs sm:text-sm font-bold uppercase text-indigo-100">{date.toLocaleDateString('id-ID', { weekday: 'short' })}</span>
                                        <span className="text-4xl font-black leading-none my-1">{date.getDate()}</span>
                                        <span className="text-xs sm:text-sm font-bold uppercase text-indigo-100">{date.toLocaleDateString('id-ID', { month: 'short' })}</span>
                                    </div>
                                    <div className="min-w-0 flex-1 flex flex-col gap-2">
                                        <div className="flex flex-wrap items-center gap-2">
                                            {isLive ? (
                                                <span className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500 text-xs sm:text-sm font-black uppercase tracking-wide">
                                                    <span className="w-2 h-2 rounded-full bg-white animate-pulse" /> Sedang berlangsung
                                                </span>
                                            ) : (isToday || isNearest) && (
                                                <span className={`px-3 py-1 rounded-full bg-amber-400 text-slate-900 text-xs sm:text-sm font-black uppercase tracking-wide ${isNearest ? 'motion-safe:animate-blink' : ''}`}>
                                                    {isToday ? 'Hari ini' : 'Berikutnya'}
                                                </span>
                                            )}
                                            {tr.type && (
                                                <span className="px-3 py-1 rounded-full bg-white/10 text-xs sm:text-sm font-bold text-indigo-100">{tr.type}</span>
                                            )}
                                        </div>
                                        <h2 className="text-xl lg:text-2xl font-black leading-tight break-words">{tr.title}</h2>
                                        <div className="flex flex-col gap-1.5 text-sm lg:text-base text-indigo-100">
                                            {tr.time && <span className="flex items-center gap-2"><Clock size={18} className="shrink-0 text-indigo-300" />{tr.time}</span>}
                                            {(tr.location || isOnline) && (
                                                <span className="flex items-start gap-2 min-w-0">
                                                    {isOnline ? <Video size={18} className="shrink-0 mt-0.5 text-indigo-300" /> : <MapPin size={18} className="shrink-0 mt-0.5 text-indigo-300" />}
                                                    <span className="break-words min-w-0">{tr.location || 'Online'}</span>
                                                </span>
                                            )}
                                            {tr.host && (
                                                <div className="flex items-center gap-3 pt-1 min-w-0">
                                                    <ParticipantAvatar name={tr.host} photoUrl={tr.hostPhotoUrl} />
                                                    <div className="min-w-0">
                                                        <p className="text-[11px] lg:text-xs font-black uppercase tracking-wider text-indigo-300">Trainer</p>
                                                        <p className="font-semibold text-white break-words leading-snug">{tr.host}</p>
                                                    </div>
                                                </div>
                                            )}
                                            <ParticipantPreview training={tr} />
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </main>

            <footer className="shrink-0 pt-3 px-6 sm:px-10 lg:px-14 pb-6 text-center text-xs sm:text-sm text-indigo-300/70 font-semibold">
                Ingin ikut? Buka menu Calendar di LMS Nusa dan klik "Minta Ikut Training".
            </footer>
        </div>
    );
};

export default UpcomingTrainingBoard;
