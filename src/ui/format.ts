/**
 * Display formatting (decision D2): metric units, numbers and dates in the user's locale,
 * de-DE by default. Storage is locale-independent; only the UI formats.
 */

const DASH = '--';

export interface Formatters {
  /** Rounds to `digits` decimals in the locale (e.g. "24,6"), or "--" if unavailable. */
  number(value: number | undefined, digits?: number): string;
  /** 83 → "01:23", 3725 → "1:02:05". */
  duration(totalSeconds: number | undefined): string;
  /** Below 1 km in metres ("850 m"), otherwise kilometres ("8,40 km"). */
  distance(meters: number | undefined): { value: string; unit: 'm' | 'km' };
  /** "26.09.2026" */
  date(iso: string): string;
  /** "07:13" (24-hour clock) */
  time(iso: string): string;
  /** "26.09.2026 07:13" */
  dateTime(iso: string): string;
}

/** `timeZone` is only for tests; the UI uses the device's time zone. */
export function createFormatters(locale: string, timeZone?: string): Formatters {
  const numberFormats = new Map<number, Intl.NumberFormat>();
  const numberFormat = (digits: number) => {
    let f = numberFormats.get(digits);
    if (!f) {
      // No thousands separators: "1234 W" stays readable on the training screen.
      f = new Intl.NumberFormat(locale, { minimumFractionDigits: digits, maximumFractionDigits: digits, useGrouping: false });
      numberFormats.set(digits, f);
    }
    return f;
  };
  const dateFormat = new Intl.DateTimeFormat(locale, { day: '2-digit', month: '2-digit', year: 'numeric', timeZone });
  const timeFormat = new Intl.DateTimeFormat(locale, { hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone });

  const number = (value: number | undefined, digits = 0) =>
    value === undefined || !Number.isFinite(value) ? DASH : numberFormat(digits).format(value);

  return {
    number,
    duration(totalSeconds) {
      if (totalSeconds === undefined || !Number.isFinite(totalSeconds)) return DASH;
      const s = Math.max(0, Math.floor(totalSeconds));
      const h = Math.floor(s / 3600);
      const mm = String(Math.floor((s % 3600) / 60)).padStart(2, '0');
      const ss = String(s % 60).padStart(2, '0');
      return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
    },
    distance(meters) {
      if (meters === undefined || !Number.isFinite(meters)) return { value: DASH, unit: 'km' };
      if (meters < 1000) return { value: number(meters, 0), unit: 'm' };
      return { value: number(meters / 1000, meters < 100_000 ? 2 : 1), unit: 'km' };
    },
    date: (iso) => dateFormat.format(new Date(iso)),
    time: (iso) => timeFormat.format(new Date(iso)),
    dateTime: (iso) => `${dateFormat.format(new Date(iso))} ${timeFormat.format(new Date(iso))}`,
  };
}
