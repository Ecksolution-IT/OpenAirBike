import { describe, expect, it } from 'vitest';
import { fromHex, toHex } from '../src/protocol/ftms/bytes';
import { DataRecordAssembler } from '../src/protocol/ftms/dataRecord';
import { parseFitnessMachineFeature, parseMachineStatus, parseTrainingStatus } from '../src/protocol/ftms/machineInfo';
import { uuidName } from '../src/protocol/ftms/uuids';
import { shortUuid, uuid16 } from '../src/util/bleUuid';

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

  it('reads machine features from a value without the target setting half', () => {
    const f = parseFitnessMachineFeature(fromHex('06 52 00 00'));
    expect(f.machineFeatures).toContain('Power Measurement');
    expect(f).toMatchObject({ rawTargetSettingFeatures: 0, targetSettingFeatures: [] });
  });

  it('returns no features for an empty value instead of throwing', () => {
    expect(parseFitnessMachineFeature(new Uint8Array(0))).toMatchObject({ machineFeatures: [], rawMachineFeatures: 0 });
  });

  it('ignores reserved feature bits (17–31)', () => {
    const f = parseFitnessMachineFeature(fromHex('02 00 fe ff 00 00 00 00'));
    expect(f.machineFeatures).toEqual(['Cadence']);
    expect(f.rawMachineFeatures).toBe(0xfffe0002);
  });
});

describe('parseTrainingStatus', () => {
  it('parses status and optional string', () => {
    expect(parseTrainingStatus(fromHex('00 0d'))).toEqual({ status: 0x0d, name: 'Manual Mode (Quick Start)', extendedString: false });
    const withText = parseTrainingStatus(new Uint8Array([0x01, 0x04, ...new TextEncoder().encode('Sprint')]));
    expect(withText).toMatchObject({ status: 4, name: 'High Intensity Interval', text: 'Sprint' });
  });

  it('names reserved values and reports an extended string', () => {
    expect(parseTrainingStatus(fromHex('02 20'))).toEqual({ status: 0x20, name: 'Reserved (0x20)', extendedString: true });
  });
});

describe('parseMachineStatus', () => {
  it('distinguishes stop and pause', () => {
    expect(parseMachineStatus(fromHex('02 01'))).toMatchObject({ opCode: 2, stopOrPause: 'stop' });
    expect(parseMachineStatus(fromHex('02 02'))).toMatchObject({ opCode: 2, stopOrPause: 'pause' });
    expect(parseMachineStatus(fromHex('04')).name).toBe('Started or Resumed by the User');
    expect(parseMachineStatus(fromHex('ff')).name).toBe('Control Permission Lost');
  });

  it('keeps parameters of op codes it does not interpret and names reserved ones', () => {
    const s = parseMachineStatus(fromHex('08 2c 01'));
    expect(s).toMatchObject({ opCode: 0x08, name: 'Target Power Changed' });
    expect([...s.parameter]).toEqual([0x2c, 0x01]);
    expect(parseMachineStatus(fromHex('30')).name).toBe('Reserved (0x30)');
    expect(parseMachineStatus(fromHex('02')).stopOrPause).toBeUndefined();
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
