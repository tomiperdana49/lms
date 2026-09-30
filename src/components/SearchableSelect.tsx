import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';
import { ChevronDown, Search, Check } from 'lucide-react';

interface SearchableSelectProps {
    value: string;
    onChange: (value: string) => void;
    options: string[];
    // Label for the empty value ('') - e.g. "All Positions".
    allLabel: string;
    searchPlaceholder: string;
    noResultsLabel: string;
    className?: string;
}

// A drop-in replacement for a plain <select> of strings when the list is long enough to need a
// search box. '' means "all", same as the <option value=""> it replaces.
export default function SearchableSelect({ value, onChange, options, allLabel, searchPlaceholder, noResultsLabel, className = '' }: SearchableSelectProps) {
    const [open, setOpen] = useState(false);
    const [query, setQuery] = useState('');
    const [activeIndex, setActiveIndex] = useState(0);
    const rootRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);
    const listRef = useRef<HTMLUListElement>(null);
    const listId = useId();

    const q = query.trim().toLowerCase();
    const filtered = q ? options.filter(o => o.toLowerCase().includes(q)) : options;
    // The "all" entry stays first while not searching, so the filter can always be cleared.
    const items: { value: string; label: string }[] = [
        ...(q ? [] : [{ value: '', label: allLabel }]),
        ...filtered.map(o => ({ value: o, label: o }))
    ];

    useEffect(() => {
        if (!open) return;
        const onClickOutside = (e: MouseEvent) => {
            if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
        };
        document.addEventListener('mousedown', onClickOutside);
        return () => document.removeEventListener('mousedown', onClickOutside);
    }, [open]);

    useEffect(() => {
        if (open) inputRef.current?.focus();
    }, [open]);

    useEffect(() => {
        listRef.current?.querySelector(`[data-index="${activeIndex}"]`)?.scrollIntoView({ block: 'nearest' });
    }, [activeIndex]);

    const openList = () => {
        setQuery('');
        const selected = options.indexOf(value);
        setActiveIndex(value ? selected + 1 : 0);
        setOpen(true);
    };

    const choose = (next: string) => {
        onChange(next);
        setOpen(false);
    };

    const onKeyDown = (e: KeyboardEvent) => {
        if (e.key === 'ArrowDown') { e.preventDefault(); setActiveIndex(i => Math.min(i + 1, items.length - 1)); }
        else if (e.key === 'ArrowUp') { e.preventDefault(); setActiveIndex(i => Math.max(i - 1, 0)); }
        else if (e.key === 'Enter') { e.preventDefault(); if (items[activeIndex]) choose(items[activeIndex].value); }
        else if (e.key === 'Escape') { e.preventDefault(); setOpen(false); }
    };

    return (
        <div ref={rootRef} className={`relative ${className}`}>
            <button
                type="button"
                onClick={() => (open ? setOpen(false) : openList())}
                aria-haspopup="listbox"
                aria-expanded={open}
                className="w-full flex items-center justify-between gap-2 px-4 py-2 rounded-xl border border-slate-200 outline-none focus:ring-2 focus:ring-indigo-500 bg-white text-sm text-slate-700 text-left"
            >
                <span className="truncate">{value || allLabel}</span>
                <ChevronDown size={16} className={`shrink-0 text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`} />
            </button>
            {open && (
                <div className="absolute z-30 mt-1 w-full min-w-[16rem] bg-white border border-slate-200 rounded-xl shadow-lg overflow-hidden">
                    <div className="relative border-b border-slate-100">
                        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                        <input
                            ref={inputRef}
                            value={query}
                            onChange={e => { setQuery(e.target.value); setActiveIndex(0); }}
                            onKeyDown={onKeyDown}
                            placeholder={searchPlaceholder}
                            role="combobox"
                            aria-controls={listId}
                            aria-expanded={open}
                            aria-activedescendant={items[activeIndex] ? `${listId}-${activeIndex}` : undefined}
                            className="w-full pl-8 pr-3 py-2.5 text-sm text-slate-700 outline-none"
                        />
                    </div>
                    <ul ref={listRef} id={listId} role="listbox" className="max-h-64 overflow-y-auto py-1">
                        {items.length === 0 ? (
                            <li className="px-4 py-2.5 text-sm text-slate-400 italic">{noResultsLabel}</li>
                        ) : items.map((item, i) => (
                            <li
                                key={item.value || '__all__'}
                                id={`${listId}-${i}`}
                                data-index={i}
                                role="option"
                                aria-selected={item.value === value}
                                onMouseEnter={() => setActiveIndex(i)}
                                onMouseDown={e => { e.preventDefault(); choose(item.value); }}
                                className={`flex items-center gap-2 px-4 py-2 text-sm cursor-pointer ${i === activeIndex ? 'bg-indigo-50 text-indigo-700' : 'text-slate-700'}`}
                            >
                                <Check size={14} className={`shrink-0 ${item.value === value ? 'opacity-100' : 'opacity-0'}`} />
                                <span className="truncate">{item.label}</span>
                            </li>
                        ))}
                    </ul>
                </div>
            )}
        </div>
    );
}
