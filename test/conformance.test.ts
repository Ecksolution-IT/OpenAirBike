import { describe, expect, it } from 'vitest';
import { ByteWriter, fromHex } from '../src/protocol/ftms/bytes';
import { ConformanceMonitor, type ConformanceCheck } from '../src/protocol/ftms/conformance';
import { encodeIndoorBikeData, type IndoorBikeData } from '../src/protocol/ftms/indoorBikeData';
import { parseFitnessMachineFeature } from '../src/protocol/ftms/machineInfo';
import { FtmsCharacteristic } from '../src/protocol/ftms/uuids';

const features = (machine: number, target = 0) =>
  parseFitnessMachineFeature(new ByteWriter().u32(machine).u32(target).toUint8Array());

// Cadence (1), Total Distance (2), Expended Energy (9), Elapsed Time (12), Power Measurement (14)
const ECHO_LIKE = (1 << 1) | (1 << 2) | (1 << 9) | (1 << 12) | (1 << 14);

const view = (bytes: Uint8Array) => new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
const send = (m: ConformanceMonitor, d: IndoorBikeData) => m.onIndoorBikeData(view(encodeIndoorBikeData(d)));

function check(report: ConformanceCheck[], title: string): ConformanceCheck {
  const c = report.find((r) => r.title === title);
  if (!c) throw new Error(`No check "${title}" in ${report.map((r) => r.title).join(', ')}`);
  return c;
}

function monitor(machine = ECHO_LIKE, ids: number[] = [FtmsCharacteristic.FitnessMachineFeature, FtmsCharacteristic.IndoorBikeData]) {
  const m = new ConformanceMonitor();
  m.setDevice({ characteristicIds: ids, features: features(machine) });
  return m;
}

const record = (elapsedTimeS: number): IndoorBikeData => ({
  moreData: false,
  instantaneousSpeedKmh: 25,
  instantaneousCadenceRpm: 60,
  totalDistanceM: 100,
  instantaneousPowerW: 200,
  totalEnergyKcal: 10,
  elapsedTimeS,
});

describe('ConformanceMonitor', () => {
  it('reports nothing tested before data arrives', () => {
    const report = new ConformanceMonitor().report();
    expect(check(report, 'Fitness Machine Feature').status).toBe('untested');
    expect(check(report, 'Complete Data Records').status).toBe('untested');
  });

  it('passes a bike whose fields match its feature bits', () => {
    const m = monitor();
    for (let t = 1; t <= 12; t++) send(m, record(t));
    const report = m.report();
    for (const title of ['Fitness Machine Feature', 'Feature RFU bits are zero', 'Complete Data Records', 'Flags RFU bits are zero', 'Payload length matches flags', 'Cadence', 'Total Distance', 'Power', 'Expended Energy', 'Elapsed Time']) {
      expect(check(report, title).status, title).toBe('pass');
    }
    expect(check(report, 'Heart Rate')).toMatchObject({ status: 'untested', detail: 'Not supported by this bike.' });
    expect(check(report, 'Cadence').id).toBe('FTMS/SR/CN/BV-57-C');
  });

  it('fails a field sent without its feature bit (FTMS.TS Table 4.11)', () => {
    const m = monitor(ECHO_LIKE & ~(1 << 14)); // power not declared
    send(m, record(1));
    expect(check(m.report(), 'Power')).toMatchObject({ status: 'fail', id: 'FTMS/SR/CN/BV-60-C' });
  });

  it('warns when a supported field never appears', () => {
    const m = monitor(ECHO_LIKE | (1 << 10)); // heart rate declared but never sent
    for (let t = 1; t <= 10; t++) send(m, record(t));
    expect(check(m.report(), 'Heart Rate').status).toBe('warn');
  });

  it('detects reserved flag bits and truncated payloads', () => {
    const m = monitor();
    m.onIndoorBikeData(view(fromHex('00 80 b8 0b'))); // RFU bit 15
    m.onIndoorBikeData(view(fromHex('40 00 b8 0b'))); // power flag without power bytes
    const report = m.report();
    expect(check(report, 'Flags RFU bits are zero')).toMatchObject({ status: 'fail' });
    expect(check(report, 'Flags RFU bits are zero').detail).toContain('0x8000');
    expect(check(report, 'Payload length matches flags').status).toBe('fail');
  });

  it('accepts split Data Records and flags records that never end', () => {
    const ok = monitor();
    send(ok, { moreData: true, instantaneousCadenceRpm: 60 });
    send(ok, record(1));
    expect(check(ok.report(), 'Complete Data Records')).toMatchObject({ status: 'pass' });
    expect(check(ok.report(), 'Complete Data Records').detail).toContain('up to 2 per record');

    const broken = monitor();
    for (let i = 0; i < 8; i++) send(broken, { moreData: true, instantaneousCadenceRpm: 60 });
    expect(check(broken.report(), 'Complete Data Records').status).toBe('fail');
  });

  it('follows Elapsed Time across a link loss (FTMS/SR/CN/BV-65-C)', () => {
    const continued = monitor();
    send(continued, record(30));
    continued.onLinkLoss();
    send(continued, record(41));
    expect(check(continued.report(), 'Elapsed Time').detail).toContain('continued across a link loss');

    const restarted = monitor();
    send(restarted, record(30));
    restarted.onLinkLoss();
    send(restarted, record(2));
    expect(check(restarted.report(), 'Elapsed Time').status).toBe('warn');

    const backwards = monitor();
    send(backwards, record(30));
    send(backwards, record(5));
    expect(check(backwards.report(), 'Elapsed Time').detail).toContain('backwards');
  });

  it('applies the ICS conditional characteristic requirements', () => {
    const m = new ConformanceMonitor();
    m.setDevice({
      characteristicIds: [FtmsCharacteristic.FitnessMachineControlPoint, FtmsCharacteristic.SupportedPowerRange],
      features: features(0, (1 << 2) | (1 << 3)), // resistance + power target setting
    });
    const report = m.report();
    expect(check(report, 'Fitness Machine Status with Control Point').status).toBe('fail');
    expect(check(report, 'Supported Power Range for Power Target Setting').status).toBe('pass');
    expect(check(report, 'Supported Resistance Level Range for Resistance Target Setting').status).toBe('fail');
  });

  it('flags reserved feature bits and a missing Feature characteristic', () => {
    const rfu = monitor(ECHO_LIKE | (1 << 20));
    expect(check(rfu.report(), 'Feature RFU bits are zero').status).toBe('fail');

    const missing = new ConformanceMonitor();
    missing.setDevice({ characteristicIds: [FtmsCharacteristic.IndoorBikeData] });
    expect(check(missing.report(), 'Fitness Machine Feature').status).toBe('fail');
  });

  it('starts over on reset', () => {
    const m = monitor();
    send(m, record(1));
    m.reset();
    expect(check(m.report(), 'Complete Data Records').status).toBe('untested');
    expect(check(m.report(), 'Fitness Machine Feature').status).toBe('untested');
  });
});
