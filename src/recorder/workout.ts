/**
 * The stored workout format. It is plain JSON on purpose: this is the user's data and
 * it should be readable without OpenAirBike. Bump `schemaVersion` on breaking changes.
 */
export interface Workout {
  schemaVersion: 1;
  id: string;
  /** ISO 8601 timestamps. */
  startedAt: string;
  endedAt: string;
  device?: WorkoutDevice;
  summary: WorkoutSummary;
  samples: WorkoutSample[];
  /** True if the workout was recovered after the app closed unexpectedly. */
  recovered?: boolean;
}

export interface WorkoutDevice {
  name: string;
  manufacturer?: string;
  model?: string;
  firmware?: string;
  simulated?: boolean;
}

export interface WorkoutSample {
  /** Active (non-paused) seconds since the workout started. */
  t: number;
  powerW?: number;
  cadenceRpm?: number;
  speedKmh?: number;
  heartRateBpm?: number;
  /** Cumulative distance of this workout in meters. */
  distanceM: number;
  /** Cumulative energy of this workout in kcal. */
  energyKcal: number;
}

export interface WorkoutSummary {
  /** Active (non-paused) duration in seconds. */
  durationS: number;
  distanceM: number;
  energyKcal: number;
  avgPowerW?: number;
  maxPowerW?: number;
  avgCadenceRpm?: number;
  maxCadenceRpm?: number;
  avgSpeedKmh?: number;
  maxSpeedKmh?: number;
  avgHeartRateBpm?: number;
  maxHeartRateBpm?: number;
}

/** Workout without its samples: what the history list needs. */
export type WorkoutHeader = Omit<Workout, 'samples'>;

type Metric = 'powerW' | 'cadenceRpm' | 'speedKmh' | 'heartRateBpm';

function stats(samples: WorkoutSample[], metric: Metric): { avg?: number; max?: number } {
  let sum = 0;
  let n = 0;
  let max = -Infinity;
  for (const s of samples) {
    const v = s[metric];
    if (v === undefined) continue;
    sum += v;
    n++;
    if (v > max) max = v;
  }
  return n === 0 ? {} : { avg: sum / n, max };
}

/**
 * Computes the summary from recorded samples. Averages are sample means over the samples
 * in which the bike reported that metric; zeros (coasting) count, as on the bike console.
 */
export function summarize(samples: WorkoutSample[], durationS: number): WorkoutSummary {
  const last = samples[samples.length - 1];
  const power = stats(samples, 'powerW');
  const cadence = stats(samples, 'cadenceRpm');
  const speed = stats(samples, 'speedKmh');
  const hr = stats(samples, 'heartRateBpm');
  return {
    durationS,
    distanceM: last?.distanceM ?? 0,
    energyKcal: last?.energyKcal ?? 0,
    avgPowerW: power.avg,
    maxPowerW: power.max,
    avgCadenceRpm: cadence.avg,
    maxCadenceRpm: cadence.max,
    avgSpeedKmh: speed.avg,
    maxSpeedKmh: speed.max,
    avgHeartRateBpm: hr.avg,
    maxHeartRateBpm: hr.max,
  };
}
