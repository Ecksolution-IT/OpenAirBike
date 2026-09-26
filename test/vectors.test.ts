/**
 * Cross-check of OpenAirBike's own FTMS parser against the MIT-licensed conformance vectors of
 * @deancochran/ftms (see test/fixtures/third-party/deancochran-ftms/README.md, decision D3).
 * Only vectors for characteristics OpenAirBike parses are used. Differences are listed in
 * KNOWN_DIFFERENCES with a reason, and asserted to still differ, so a change on either side
 * is noticed.
 */
import { describe, expect, it } from 'vitest';
import { parseIndoorBikeData, type IndoorBikeData } from '../src/protocol/ftms/indoorBikeData';
import { parseFitnessMachineFeature, parseMachineStatus, parseTrainingStatus } from '../src/protocol/ftms/machineInfo';
import { FtmsCharacteristic } from '../src/protocol/ftms/uuids';
import { shortUuid } from '../src/util/bleUuid';
import vectorFile from './fixtures/third-party/deancochran-ftms/vectors.json';

interface Vector {
  id: string;
  bytes: number[];
  characteristicUuid?: string;
  /** Either every flag spelled out, or only the ones that are true. */
  expected?: Record<string, boolean>;
  expectedTrue?: string[];
  expectedMetrics?: Record<string, number | null>;
  expectedStatus?: { code: number; details: Record<string, unknown> };
}

const corpus = vectorFile as unknown as Record<'features' | 'measurements' | 'statuses', Vector[]>;

/** Vector id → why OpenAirBike intentionally parses it differently. */
const KNOWN_DIFFERENCES: Record<string, string> = {
  'measurement-bike-all-fields':
    'R1: Resistance Level is uint8 in the current GSS (vector) but sint16 in the legacy SIG XML and in ' +
    'real-world parsers (OpenAirBike). See docs/research/echo-bike-v3.md. Decide with a hardware capture.',
};

const bytes = (v: Vector) => Uint8Array.from(v.bytes);
const characteristic = (v: Vector) => (v.characteristicUuid ? shortUuid(v.characteristicUuid) : undefined);

/** Vector metric names → OpenAirBike Indoor Bike Data fields (with unit conversion to D2 units). */
const METRIC_MAP: Record<string, [keyof IndoorBikeData, (v: number) => number]> = {
  speedMps: ['instantaneousSpeedKmh', (v) => v * 3.6],
  averageSpeedMps: ['averageSpeedKmh', (v) => v * 3.6],
  cadenceRpm: ['instantaneousCadenceRpm', (v) => v],
  averageCadenceRpm: ['averageCadenceRpm', (v) => v],
  distanceMeters: ['totalDistanceM', (v) => v],
  resistanceLevel: ['resistanceLevel', (v) => v],
  powerWatts: ['instantaneousPowerW', (v) => v],
  averagePowerWatts: ['averagePowerW', (v) => v],
  energyKcal: ['totalEnergyKcal', (v) => v],
  energyPerHourKcal: ['energyPerHourKcal', (v) => v],
  energyPerMinuteKcal: ['energyPerMinuteKcal', (v) => v],
  hrBpm: ['heartRateBpm', (v) => v],
  metabolicEquivalent: ['metabolicEquivalent', (v) => v],
  elapsedTimeSeconds: ['elapsedTimeS', (v) => v],
  remainingTimeSeconds: ['remainingTimeS', (v) => v],
};

function matchesMetrics(parsed: IndoorBikeData, expected: Record<string, number | null>): string[] {
  const mismatches: string[] = [];
  for (const [name, value] of Object.entries(expected)) {
    const mapping = METRIC_MAP[name];
    if (!mapping) {
      mismatches.push(`${name}: not mapped`);
      continue;
    }
    const [field, convert] = mapping;
    const want = value === null ? undefined : convert(value);
    const got = parsed[field] as number | undefined;
    const equal = want === undefined ? got === undefined : got !== undefined && Math.abs(got - want) < 1e-9;
    if (!equal) mismatches.push(`${name}: expected ${want}, got ${got}`);
  }
  return mismatches;
}

describe('Indoor Bike Data vs. @deancochran/ftms vectors', () => {
  const vectors = corpus.measurements.filter((v) => characteristic(v) === FtmsCharacteristic.IndoorBikeData);

  it('covers the bike vectors', () => {
    expect(vectors.length).toBeGreaterThan(0);
  });

  for (const v of vectors) {
    const known = KNOWN_DIFFERENCES[v.id];
    it(`${v.id}${known ? ' (known difference)' : ''}`, () => {
      const mismatches = matchesMetrics(parseIndoorBikeData(bytes(v)), v.expectedMetrics ?? {});
      if (known) expect(mismatches, known).not.toEqual([]);
      else expect(mismatches).toEqual([]);
    });
  }

  it('agrees on every field before Resistance Level in the known-different vector', () => {
    const v = vectors.find((x) => x.id === 'measurement-bike-all-fields')!;
    const parsed = parseIndoorBikeData(bytes(v));
    const { speedMps, averageSpeedMps, cadenceRpm, averageCadenceRpm, distanceMeters } = v.expectedMetrics!;
    expect(matchesMetrics(parsed, { speedMps, averageSpeedMps, cadenceRpm, averageCadenceRpm, distanceMeters })).toEqual([]);
  });
});

/** Vector key names in bit order (FTMS Tables 4.3 and 4.4). */
const MACHINE_KEYS = [
  'averageSpeedSupported', 'cadenceSupported', 'totalDistanceSupported', 'inclinationSupported',
  'elevationGainSupported', 'paceSupported', 'stepCountSupported', 'resistanceLevelSupported',
  'strideCountSupported', 'expendedEnergySupported', 'heartRateMeasurementSupported',
  'metabolicEquivalentSupported', 'elapsedTimeSupported', 'remainingTimeSupported',
  'powerMeasurementSupported', 'forceOnBeltSupported', 'userDataRetentionSupported',
];
const TARGET_KEYS = [
  'speedTargetSettingSupported', 'inclinationTargetSettingSupported', 'resistanceTargetSettingSupported',
  'powerTargetSettingSupported', 'heartRateTargetSettingSupported', 'targetedExpendedEnergySupported',
  'targetedStepNumberSupported', 'targetedStrideNumberSupported', 'targetedDistanceSupported',
  'targetedTrainingTimeSupported', 'targetedTimeTwoHRZonesSupported', 'targetedTimeThreeHRZonesSupported',
  'targetedTimeFiveHRZonesSupported', 'indoorBikeSimulationSupported', 'wheelCircumferenceSupported',
  'spinDownControlSupported', 'targetedCadenceSupported',
];

describe('Fitness Machine Feature vs. @deancochran/ftms vectors', () => {
  for (const v of corpus.features) {
    it(v.id, () => {
      const f = parseFitnessMachineFeature(bytes(v));
      const isTrue = (k: string) => (v.expected ? v.expected[k] === true : (v.expectedTrue ?? []).includes(k));
      const expectedMachine = MACHINE_KEYS.map(isTrue);
      const expectedTarget = TARGET_KEYS.map(isTrue);
      expect(MACHINE_KEYS.map((_, bit) => ((f.rawMachineFeatures >>> bit) & 1) === 1)).toEqual(expectedMachine);
      expect(TARGET_KEYS.map((_, bit) => ((f.rawTargetSettingFeatures >>> bit) & 1) === 1)).toEqual(expectedTarget);
      // Every set bit is also named by OpenAirBike.
      expect(f.machineFeatures).toHaveLength(expectedMachine.filter(Boolean).length);
      expect(f.targetSettingFeatures).toHaveLength(expectedTarget.filter(Boolean).length);
    });
  }
});

describe('Training Status / Fitness Machine Status vs. @deancochran/ftms vectors', () => {
  for (const v of corpus.statuses) {
    it(v.id, () => {
      const c = characteristic(v);
      if (c === FtmsCharacteristic.TrainingStatus) {
        const s = parseTrainingStatus(bytes(v));
        expect(s.status).toBe(v.expectedStatus!.code);
        expect(s.text).toBe(v.expectedStatus!.details.trainingStatusString);
        expect(s.extendedString).toBe(v.expectedStatus!.details.extendedStringPresent);
      } else {
        expect(c).toBe(FtmsCharacteristic.FitnessMachineStatus);
        // OpenAirBike only interprets op codes it reacts to; parameters of others stay raw bytes.
        const s = parseMachineStatus(bytes(v));
        expect(s.opCode).toBe(v.expectedStatus!.code);
        expect(s.parameter).toEqual(Uint8Array.from(v.bytes.slice(1)));
      }
    });
  }
});
