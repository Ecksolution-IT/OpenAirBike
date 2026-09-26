import { describe, expect, it } from 'vitest';
import { fromHex, toHex } from '../src/ftms/bytes';
import { DataRecordAssembler } from '../src/ftms/dataRecord';
import { parseFitnessMachineFeature, parseMachineStatus, parseTrainingStatus } from '../src/ftms/machineInfo';
import { shortUuid, uuid16, uuidName } from '../src/ftms/uuids';

describe('DataRecordAssembler', () => {
  it('passes single-notification records straight through', () => {
    const a = new DataRecordAssembler();
    expect(a.push({ moreData: false, instantaneousSpeedKmh: 20 })).toEqual({ instantaneousSpeedKmh: 20 });
  });

  it('merges a record split over several notifications (FTMS §4.19)', () => {
    const a = new DataRecordAssembler();
    expect(a.push({ moreData: true, instantaneousCadenceRpm: 60 })).toBeUndefined();
    expect(a.push({ moreData: true, instantaneousPowerW: 200 })).toBeUndefined();
    expect(a.push({ moreData: false, instantaneousSpeedKmh: 27 })).toEqual({
      instantaneousCadenceRpm: 60,
      instantaneousPowerW: 200,
      instantaneousSpeedKmh: 27,
    });
    // Next record starts clean.
    expect(a.push({ moreData: false, instantaneousSpeedKmh: 28 })).toEqual({ instantaneousSpeedKmh: 28 });
  });

  it('flushes when a bike never clears More Data', () => {
    const a = new DataRecordAssembler();
    expect(a.push({ moreData: true, instantaneousPowerW: 100 })).toBeUndefined();
    expect(a.push({ moreData: true, instantaneousPowerW: 110 })).toEqual({ instantaneousPowerW: 100 });
    expect(a.push({ moreData: true, instantaneousPowerW: 120 })).toEqual({ instantaneousPowerW: 110 });
  });

  it('discards a partial record on reset (FTMS §4.18)', () => {
    const a = new DataRecordAssembler();
    a.push({ moreData: true, instantaneousPowerW: 100 });
    a.reset();
    expect(a.push({ moreData: false, instantaneousSpeedKmh: 10 })).toEqual({ instantaneousSpeedKmh: 10 });
  });
});

describe('parseFitnessMachineFeature', () => {
  it('names the supported features', () => {
    // machine: cadence (1), total distance (2), expended energy (9), elapsed time (12), power (14)
    // target setting: none
    const f = parseFitnessMachineFeature(fromHex('06 52 00 00 00 00 00 00'));
    expect(f.machineFeatures).toEqual(['Cadence', 'Total Distance', 'Expended Energy', 'Elapsed Time', 'Power Measurement']);
    expect(f.targetSettingFeatures).toEqual([]);
  });

  it('reads the target setting features', () => {
    const f = parseFitnessMachineFeature(fromHex('00 00 00 00 08 20 01 00'));
    expect(f.targetSettingFeatures).toEqual(['Power Target Setting', 'Indoor Bike Simulation Parameters', 'Targeted Cadence Configuration']);
  });
});

describe('parseTrainingStatus', () => {
  it('parses status and optional string', () => {
    expect(parseTrainingStatus(fromHex('00 0d'))).toEqual({ status: 0x0d, name: 'Manual Mode (Quick Start)', extendedString: false });
    const withText = parseTrainingStatus(new Uint8Array([0x01, 0x04, ...new TextEncoder().encode('Sprint')]));
    expect(withText).toMatchObject({ status: 4, name: 'High Intensity Interval', text: 'Sprint' });
  });
});

describe('parseMachineStatus', () => {
  it('distinguishes stop and pause', () => {
    expect(parseMachineStatus(fromHex('02 01'))).toMatchObject({ opCode: 2, stopOrPause: 'stop' });
    expect(parseMachineStatus(fromHex('02 02'))).toMatchObject({ opCode: 2, stopOrPause: 'pause' });
    expect(parseMachineStatus(fromHex('04')).name).toBe('Started or Resumed by the User');
    expect(parseMachineStatus(fromHex('ff')).name).toBe('Control Permission Lost');
  });
});

describe('uuids', () => {
  it('converts between short and full UUIDs', () => {
    expect(uuid16(0x2ad2)).toBe('00002ad2-0000-1000-8000-00805f9b34fb');
    expect(shortUuid('00002AD2-0000-1000-8000-00805F9B34FB')).toBe(0x2ad2);
    expect(shortUuid('6e400001-b5a3-f393-e0a9-e50e24dcca9e')).toBeUndefined();
    expect(uuidName(uuid16(0x2ad2))).toBe('Indoor Bike Data');
    expect(uuidName(0x2bff)).toBe('0x2bff');
  });

  it('formats bytes as hex', () => {
    expect(toHex(new Uint8Array([0, 15, 255]))).toBe('00 0f ff');
  });
});
