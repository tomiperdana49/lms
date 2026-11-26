// LMS times are WIB (Asia/Jakarta) wherever the browser is: someone opening the app in Bali (WITA)
// or Papua (WIT) must see the same clock times as Jakarta, not times shifted by their own zone.
export const WIB_TIME_ZONE = 'Asia/Jakarta';

type DateFormatOptions = Intl.DateTimeFormatOptions | undefined;
const withWib = (options: DateFormatOptions): Intl.DateTimeFormatOptions =>
    options && options.timeZone ? options : { ...(options || {}), timeZone: WIB_TIME_ZONE };

// Makes every Date#toLocale*String and Intl.DateTimeFormat call format in WIB unless it names its own
// timeZone. Call once, before the app renders.
export function installWibTimeZone() {
    const OriginalDateTimeFormat = Intl.DateTimeFormat;
    const WibDateTimeFormat = function (locales?: string | string[], options?: Intl.DateTimeFormatOptions) {
        return new OriginalDateTimeFormat(locales, withWib(options));
    } as unknown as typeof Intl.DateTimeFormat;
    // keeps `x instanceof Intl.DateTimeFormat` and the static helper working
    Object.defineProperty(WibDateTimeFormat, 'prototype', { value: OriginalDateTimeFormat.prototype });
    Object.defineProperty(WibDateTimeFormat, 'supportedLocalesOf', { value: OriginalDateTimeFormat.supportedLocalesOf });
    Intl.DateTimeFormat = WibDateTimeFormat;

    for (const method of ['toLocaleString', 'toLocaleDateString', 'toLocaleTimeString'] as const) {
        const original = Date.prototype[method];
        Date.prototype[method] = function (this: Date, locales?: string | string[], options?: Intl.DateTimeFormatOptions) {
            return original.call(this, locales, withWib(options));
        };
    }
}

// The WIB calendar date and clock time of a moment - use instead of getFullYear()/getHours()/...,
// which read the browser's own zone.
export function getWibParts(date: Date) {
    const parts: Record<string, string> = {};
    new Intl.DateTimeFormat('en-GB', {
        timeZone: WIB_TIME_ZONE, hourCycle: 'h23',
        year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit'
    }).formatToParts(date).forEach(p => { parts[p.type] = p.value; });
    return {
        year: parts.year, month: parts.month, day: parts.day,
        hour: parts.hour, minute: parts.minute, second: parts.second
    };
}
