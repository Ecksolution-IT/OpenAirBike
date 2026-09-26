import type { IndoorBikeRecord } from '../../protocol/ftms/dataRecord';
import type { FitnessMachineFeature, MachineFeature } from '../../protocol/ftms/machineInfo';
import type { TelemetrySample } from '../../telemetry/types';
import type { Capability } from '../types';

/** Maps a complete Indoor Bike Data Record to Canonical Telemetry (units per decision D2). */
export function toCanonical(record: IndoorBikeRecord, at: number): TelemetrySample {
  return {
    at,
    powerW: record.instantaneousPowerW,
    cadenceRpm: record.instantaneousCadenceRpm,
    speedKmh: record.instantaneousSpeedKmh,
    heartRateBpm: record.heartRateBpm,
    deviceCounters: {
      distanceM: record.totalDistanceM,
      energyKcal: record.totalEnergyKcal,
      elapsedS: record.elapsedTimeS,
    },
  };
}

const FEATURE_CAPABILITIES: [MachineFeature, Capability][] = [
  ['Power Measurement', 'power'],
  ['Cadence', 'cadence'],
  ['Total Distance', 'distance'],
  ['Expended Energy', 'energy'],
  ['Heart Rate Measurement', 'heartRate'],
  ['Elapsed Time', 'elapsedTime'],
];

/** Capabilities from Fitness Machine Feature bits. Speed is mandatory in Indoor Bike Data. */
export function capabilitiesFromFeatures(features: FitnessMachineFeature): Capability[] {
  return ['speed', ...FEATURE_CAPABILITIES.filter(([f]) => features.machineFeatures.includes(f)).map(([, c]) => c)];
}
