import type { Sample, SessionSummary } from '../domain/types';

type Metric = 'powerW' | 'cadenceRpm' | 'speedKmh' | 'heartRateBpm';

function stats(samples: Sample[], metric: Metric): { avg?: number; max?: number } {
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
 * Session summary from recorded samples. Averages are sample means over the samples in which
 * the device reported that metric; zeros (coasting) count, as on the bike console. Distance and
 * energy are the cumulative totals of the last sample. Metrics never reported are omitted.
 */
export function summarize(samples: Sample[]): SessionSummary {
  const last = samples[samples.length - 1];
  const power = stats(samples, 'powerW');
  const cadence = stats(samples, 'cadenceRpm');
  const speed = stats(samples, 'speedKmh');
  const hr = stats(samples, 'heartRateBpm');
  const summary: SessionSummary = {
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
  return Object.fromEntries(Object.entries(summary).filter(([, v]) => v !== undefined)) as SessionSummary;
}
