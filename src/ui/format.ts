const DASH = '--';

/** 83 → "01:23", 3725 → "1:02:05". */
export function formatDuration(totalSeconds: number | undefined): string {
  if (totalSeconds === undefined || !Number.isFinite(totalSeconds)) return DASH;
  const s = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const mm = String(m).padStart(2, '0');
  const ss = String(sec).padStart(2, '0');
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

/** Rounds to `digits` decimals, or "--" if unavailable. */
export function formatNumber(value: number | undefined, digits = 0): string {
  if (value === undefined || !Number.isFinite(value)) return DASH;
  return value.toFixed(digits);
}

export function formatKm(meters: number | undefined): string {
  return meters === undefined ? DASH : formatNumber(meters / 1000, meters < 100_000 ? 2 : 1);
}

export function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { year: 'numeric', month: '2-digit', day: '2-digit' });
}

export function formatDateTime(iso: string): string {
  const d = new Date(iso);
  return `${formatDate(iso)} ${d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}`;
}
