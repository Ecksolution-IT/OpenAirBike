import { describe, expect, it } from 'vitest';
import { capabilitiesFromFeatures, toCanonical } from '../src/adapters/ftms-indoor-bike/canonical';
import { fromHex } from '../src/protocol/ftms/bytes';
import { DataRecordAssembler } from '../src/protocol/ftms/dataRecord';
import { parseIndoorBikeData } from '../src/protocol/ftms/indoorBikeData';
import { parseFitnessMachineFeature } from '../src/protocol/ftms/machineInfo';

/**
 * First Ride: raw FTMS bytes → FTMS decoder → canonical telemetry, with small hand-annotated
 * fixtures. They are synthetic (built from FTMS v1.0.1 §4.9, Table 4.10), not captured from an
 * Echo Bike V3 — replace or extend them with real packets once a capture exists.
 */
function canonical(...packets: string[]) {
  const assembler = new DataRecordAssembler();
  let record;
  for (const hex of packets) record = assembler.push(parseIndoorBikeData(fromHex(hex)));
  return record && toCanonical(record, 1_000);
}

describe('First Ride byte fixtures', () => {
  it('decodes a typical air-bike record', () => {
    // flags 0x0954 = cadence (2), total distance (4), power (6), expended energy (8), elapsed time (11)
    // speed 0x0b18 = 28.40 km/h · cadence 0x0090 = 72.0 rpm · distance 0x000190 = 400 m · power 0x0138 = 312 W
    // energy 0x0012 = 18 kcal, per hour / per minute = not available · elapsed 0x003d = 61 s
    expect(canonical('54 09  18 0b  90 00  90 01 00  38 01  12 00 ff ff ff  3d 00')).toEqual({
      at: 1_000,
      powerW: 312,
      cadenceRpm: 72,
      speedKmh: 28.4,
      deviceCounters: { distanceM: 400, energyKcal: 18, elapsedS: 61 },
    });
  });

  it('keeps real zeros and invents nothing that was not sent', () => {
    // flags 0x0044 = cadence + power; rider stopped: speed, cadence and power are 0
    const s = canonical('44 00  00 00  00 00  00 00');
    expect(s).toMatchObject({ powerW: 0, cadenceRpm: 0, speedKmh: 0 });
    expect(s?.heartRateBpm).toBeUndefined();
    expect(s?.deviceCounters).toEqual({ distanceM: undefined, energyKcal: undefined, elapsedS: undefined });
  });

  it('reports heart rate only when the bike sends a real value', () => {
    // flags 0x0200 = heart rate; speed 0x0960 = 24.00 km/h
    expect(canonical('00 02  60 09  84')?.heartRateBpm).toBe(132);
    expect(canonical('00 02  60 09  00')?.heartRateBpm).toBeUndefined(); // 0 = no sensor
  });

  it('treats the "data not available" energy value as missing', () => {
    // flags 0x0100 = expended energy; total 0xffff, per hour 0xffff, per minute 0xff
    expect(canonical('00 01  60 09  ff ff ff ff ff')?.deviceCounters.energyKcal).toBeUndefined();
  });

  it('merges a record split over two notifications (More Data)', () => {
    // 1st: flags 0x0045 = More Data + cadence + power (no speed while More Data is set)
    // 2nd: flags 0x0000 = speed only, completes the record
    expect(canonical('45 00  90 00  38 01', '00 00  18 0b')).toMatchObject({ cadenceRpm: 72, powerW: 312, speedKmh: 28.4 });
  });

  it('maps Fitness Machine Feature bytes to canonical capabilities', () => {
    // machine features 0x00005206 = cadence (1), total distance (2), expended energy (9), elapsed time (12), power (14)
    const features = parseFitnessMachineFeature(fromHex('06 52 00 00  00 00 00 00'));
    expect(capabilitiesFromFeatures(features)).toEqual(['speed', 'power', 'cadence', 'distance', 'energy', 'elapsedTime']);
    // no heart rate bit → heart rate is not a capability (speed is mandatory in Indoor Bike Data)
    expect(capabilitiesFromFeatures(parseFitnessMachineFeature(fromHex('00 00 00 00 00 00 00 00')))).toEqual(['speed']);
  });
});
