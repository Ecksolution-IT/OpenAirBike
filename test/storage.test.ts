import { IDBFactory } from 'fake-indexeddb';
import { beforeEach, describe, expect, it } from 'vitest';
import type { Workout } from '../src/recording/workout';
import { exportFileName, workoutToCsv, workoutToJson } from '../src/persistence/export';
import { WorkoutStore } from '../src/persistence/indexeddb/workoutStore';
import { formatDuration, formatKm, formatNumber } from '../src/ui/format';

function workout(id: string, startedAt: string): Workout {
  return {
    schemaVersion: 1,
    id,
    startedAt,
    endedAt: startedAt,
    summary: { durationS: 60, distanceM: 500, energyKcal: 20, avgPowerW: 200, maxPowerW: 400 },
    samples: [
      { t: 0, powerW: 200, cadenceRpm: 60, distanceM: 0, energyKcal: 0 },
      { t: 1, powerW: 400, heartRateBpm: 150, distanceM: 8.4, energyKcal: 0.4 },
    ],
  };
}

describe('WorkoutStore', () => {
  let store: WorkoutStore;
  beforeEach(async () => {
    store = await WorkoutStore.open(new IDBFactory());
  });

  it('saves, lists newest first without samples, loads and deletes', async () => {
    await store.save(workout('a', '2026-09-24T10:00:00.000Z'));
    await store.save(workout('c', '2026-09-26T10:00:00.000Z'));
    await store.save(workout('b', '2026-09-25T10:00:00.000Z'));

    const list = await store.list();
    expect(list.map((w) => w.id)).toEqual(['c', 'b', 'a']);
    expect(list[0]).not.toHaveProperty('samples');

    expect((await store.get('b'))?.samples).toHaveLength(2);
    await store.delete('b');
    expect(await store.get('b')).toBeUndefined();
    expect((await store.list()).map((w) => w.id)).toEqual(['c', 'a']);
    expect(await store.all()).toHaveLength(2);
  });

  it('keeps a single draft', async () => {
    expect(await store.loadDraft()).toBeUndefined();
    await store.saveDraft(workout('d1', '2026-09-26T10:00:00.000Z'));
    await store.saveDraft(workout('d2', '2026-09-26T10:00:00.000Z'));
    expect((await store.loadDraft())?.id).toBe('d2');
    await store.clearDraft();
    expect(await store.loadDraft()).toBeUndefined();
  });
});

describe('export', () => {
  const w = workout('x', '2026-09-26T07:13:00.000Z');

  it('writes CSV with empty cells for missing metrics', () => {
    expect(workoutToCsv(w)).toBe(
      't,powerW,cadenceRpm,speedKmh,heartRateBpm,distanceM,energyKcal\n0,200,60,,,0,0\n1,400,,,150,8.4,0.4\n',
    );
  });

  it('writes JSON that parses back to the workout', () => {
    expect(JSON.parse(workoutToJson(w))).toEqual(w);
    expect(exportFileName(w, 'csv')).toBe('openairbike-2026-09-26T07-13-00-000Z.csv');
  });
});

describe('format', () => {
  it('formats durations, numbers and distances', () => {
    expect(formatDuration(0)).toBe('00:00');
    expect(formatDuration(1458)).toBe('24:18');
    expect(formatDuration(3725)).toBe('1:02:05');
    expect(formatDuration(undefined)).toBe('--');
    expect(formatNumber(427.6)).toBe('428');
    expect(formatNumber(undefined)).toBe('--');
    expect(formatKm(8400)).toBe('8.40');
    expect(formatKm(123_456)).toBe('123.5');
  });
});
