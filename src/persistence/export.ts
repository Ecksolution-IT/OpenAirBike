import type { Sample, SessionDetail } from '../domain/types';

/** Stable, documented export format for one session (the user's data, readable without OpenAirBike). */
export const SESSION_EXPORT_FORMAT = 'openairbike-session';
export const SESSION_EXPORT_VERSION = 1;

const CSV_COLUMNS: (keyof Sample)[] = ['tMs', 'powerW', 'cadenceRpm', 'speedKmh', 'heartRateBpm', 'distanceM', 'energyKcal'];

export function sessionToJson(detail: SessionDetail): string {
  return JSON.stringify({ format: SESSION_EXPORT_FORMAT, version: SESSION_EXPORT_VERSION, ...detail }, null, 2);
}

/** One row per sample; empty cells where the device did not report a metric. */
export function sessionToCsv(detail: SessionDetail): string {
  const rows = detail.samples.map((s) => CSV_COLUMNS.map((c) => s[c] ?? '').join(','));
  return [CSV_COLUMNS.join(','), ...rows].join('\n') + '\n';
}

export function exportFileName(startedAt: string, extension: string): string {
  return `openairbike-${startedAt.replace(/[:.]/g, '-')}.${extension}`;
}

/** Triggers a browser download of `content`. */
export function download(fileName: string, content: string | Uint8Array, mimeType: string): void {
  const url = URL.createObjectURL(new Blob([content as BlobPart], { type: mimeType }));
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
