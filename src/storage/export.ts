import type { Workout, WorkoutSample } from '../recorder/workout';

const CSV_COLUMNS: (keyof WorkoutSample)[] = [
  't',
  'powerW',
  'cadenceRpm',
  'speedKmh',
  'heartRateBpm',
  'distanceM',
  'energyKcal',
];

export function workoutToJson(workout: Workout): string {
  return JSON.stringify(workout, null, 2);
}

/** One row per sample; empty cells where the bike did not report a metric. */
export function workoutToCsv(workout: Workout): string {
  const rows = workout.samples.map((s) => CSV_COLUMNS.map((c) => s[c] ?? '').join(','));
  return [CSV_COLUMNS.join(','), ...rows].join('\n') + '\n';
}

export function exportFileName(workout: Workout, extension: string): string {
  return `openairbike-${workout.startedAt.replace(/[:.]/g, '-')}.${extension}`;
}

/** Triggers a browser download of `content`. */
export function download(fileName: string, content: string, mimeType: string): void {
  const url = URL.createObjectURL(new Blob([content], { type: mimeType }));
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
