import { describe, expect, it } from 'vitest';
import { Accumulator, KCAL_PER_WATT_SECOND, WorkoutRecorder } from '../src/recording/recorder';
import { summarize } from '../src/recording/summary';
import type { DeviceCounters, TelemetrySample } from '../src/telemetry/types';

const T0 = Date.UTC(2026, 8, 26, 7, 0, 0);
const at = (seconds: number) => T0 + seconds * 1000;

describe('Accumulator', () => {
  it('uses deltas of the bike counter, not its absolute value', () => {
    const a = new Accumulator();
    a.add(at(0), 5000, undefined); // bike session already had 5 km
    a.add(at(1), 5010, undefined);
    a.add(at(2), 5025, undefined);
    expect(a.total).toBe(25);
  });

  it('handles the bike counter restarting from zero', () => {
    const a = new Accumulator();
    a.add(at(0), 100, undefined);
    a.add(at(1), 110, undefined);
    a.add(at(2), 4, undefined); // bike reset; 4 m ridden since
    a.add(at(3), 9, undefined);
    expect(a.total).toBe(19);
  });

  it('integrates the rate when the bike has no counter, capping gaps', () => {
    const a = new Accumulator();
    a.add(at(0), undefined, 10);
    a.add(at(1), undefined, 10);
    a.add(at(2), undefined, 10);
    a.add(at(60), undefined, 10); // 58 s gap (e.g. link loss) counts as 5 s
    expect(a.total).toBeCloseTo(70);
  });

  it('does not count movement across a rebase', () => {
    const a = new Accumulator();
    a.add(at(0), 0, undefined);
    a.add(at(1), 10, undefined);
    a.rebase();
    a.add(at(30), 200, undefined);
    a.add(at(31), 210, undefined);
    expect(a.total).toBe(20);
  });
});

describe('WorkoutRecorder', () => {
  // Flat test input; distance and energy are the device's own running counters.
  const sample = (
    seconds: number,
    { distanceM, energyKcal, ...metrics }: Partial<Omit<TelemetrySample, 'deviceCounters'>> & DeviceCounters = {},
  ): TelemetrySample => ({ at: at(seconds), ...metrics, deviceCounters: { distanceM, energyKcal } });

  it('records a workout with pause and resume', () => {
    const r = new WorkoutRecorder();
    r.start(at(0));
    const first = r.addSample(sample(0, { powerW: 100, cadenceRpm: 50, speedKmh: 20, distanceM: 1000, energyKcal: 50 }));
    r.addSample(sample(1, { powerW: 300, cadenceRpm: 70, speedKmh: 30, distanceM: 1008, energyKcal: 51 }));
    r.addSample(sample(2, { powerW: 200, cadenceRpm: 60, speedKmh: 25, distanceM: 1016, energyKcal: 51 }));
    r.pause(at(2.5));

    // Riding while paused is neither recorded nor counted.
    expect(r.addSample(sample(5, { powerW: 999, distanceM: 1100, energyKcal: 60 }))).toBeUndefined();
    expect(r.elapsedS(at(10))).toBe(2.5);

    r.resume(at(10));
    r.addSample(sample(10, { powerW: 400, cadenceRpm: 80, speedKmh: 35, distanceM: 1200, energyKcal: 70 }));
    const last = r.addSample(sample(11, { powerW: 0, cadenceRpm: 0, speedKmh: 0, distanceM: 1209, energyKcal: 72 }));
    const result = r.stop(at(11.5));

    expect(r.state).toBe('finished');
    expect(first).toEqual({ tMs: 0, powerW: 100, cadenceRpm: 50, speedKmh: 20, heartRateBpm: undefined, distanceM: 0, energyKcal: 0 });
    expect(last).toMatchObject({ tMs: 3500, distanceM: 25, energyKcal: 3 });
    expect(r.sampleCount).toBe(5);
    expect(result).toEqual({
      activeS: 4,
      summary: {
        distanceM: 16 + 9,
        energyKcal: 1 + 2,
        avgPowerW: 200,
        maxPowerW: 400,
        avgCadenceRpm: 52,
        maxCadenceRpm: 80,
        avgSpeedKmh: 22,
        maxSpeedKmh: 35,
      },
    });
  });

  it('falls back to speed and power when the bike has no counters', () => {
    const r = new WorkoutRecorder();
    r.start(at(0));
    for (let s = 0; s <= 10; s++) r.addSample(sample(s, { powerW: 250, speedKmh: 36 }));
    const { summary } = r.stop(at(10));
    expect(summary.distanceM).toBeCloseTo(100); // 10 m/s for 10 s
    expect(summary.energyKcal).toBeCloseTo(Math.round(250 * 10 * KCAL_PER_WATT_SECOND * 10) / 10, 1);
  });

  it('ignores samples before start and rejects invalid transitions', () => {
    const r = new WorkoutRecorder();
    r.addSample(sample(0, { powerW: 100 }));
    expect(() => r.stop()).toThrow();
    r.start(at(5));
    expect(r.addSample(sample(4, { powerW: 100 }))).toBeUndefined();
    expect(r.sampleCount).toBe(0);
    expect(() => r.start()).toThrow();
  });
});

describe('summarize', () => {
  it('handles an empty workout', () => {
    expect(summarize([])).toEqual({ distanceM: 0, energyKcal: 0 });
  });

  it('includes heart rate when present', () => {
    const s = summarize(
      [
        { tMs: 0, heartRateBpm: 120, distanceM: 0, energyKcal: 0 },
        { tMs: 1000, heartRateBpm: 160, distanceM: 5, energyKcal: 1 },
      ],
    );
    expect(s).toMatchObject({ avgHeartRateBpm: 140, maxHeartRateBpm: 160, distanceM: 5, energyKcal: 1 });
  });
});
