import { describe, expect, it } from 'vitest';
import { ByteWriter, fromHex } from '../src/protocol/ftms/bytes';
import { encodeIndoorBikeData, type IndoorBikeData } from '../src/protocol/ftms/indoorBikeData';
import { DEVICE_INFORMATION_SERVICE, DeviceInformationCharacteristic, FTMS_SERVICE, FtmsCharacteristic } from '../src/protocol/ftms/uuids';
import { SimulatedTransport } from '../src/transport/simulated/simulator';
import type { CharacteristicInfo, GattLink, GattNotification, GattServiceInventory } from '../src/transport/types';
import { propertyList } from '../src/transport/webBluetooth';
import { uuid16 } from '../src/util/bleUuid';
import { CaptureLog, MAX_CAPTURED_PACKETS } from '../tools/hardware-proof/capture';
import { describeIndoorBikeData, describeLive, PacketDecoder } from '../tools/hardware-proof/decoder';
import { probeDevice, type ProbeSink } from '../tools/hardware-proof/probe';

interface FakeCharacteristic {
  props?: Partial<Omit<CharacteristicInfo, 'uuid'>>;
  value?: Uint8Array;
  failSubscribe?: boolean;
}
type FakeGatt = Record<number, Record<number, FakeCharacteristic>>;

function fakeLink(gatt: FakeGatt, options: { inventoryFails?: boolean } = {}) {
  const reads: number[] = [];
  const subscribed: number[] = [];
  const link: GattLink = {
    inventory: async () => {
      if (options.inventoryFails) throw new Error('boom');
      return Object.entries(gatt).map(([s, chars]) => ({
        uuid: uuid16(Number(s)),
        characteristics: Object.keys(chars).map((c) => ({ uuid: uuid16(Number(c)), properties: ['read' as const] })),
      }));
    },
    characteristics: async (service) =>
      gatt[service] && Object.entries(gatt[service]).map(([uuid, c]) => ({ uuid: Number(uuid), read: true, notify: true, indicate: false, ...c.props })),
    read: async (service, characteristic) => {
      const value = gatt[service]?.[characteristic]?.value;
      if (!value) throw new Error('not readable');
      reads.push(characteristic);
      return new DataView(value.buffer, value.byteOffset, value.byteLength);
    },
    subscribe: async (service, characteristic) => {
      if (gatt[service]?.[characteristic]?.failSubscribe) throw new Error('refused');
      subscribed.push(characteristic);
    },
  };
  return { link, reads, subscribed };
}

function sink() {
  const lines: string[] = [];
  const reads: { service: number; characteristic: number; bytes: number }[] = [];
  const s: ProbeSink = {
    log: (line) => lines.push(line),
    read: (service, characteristic, value) => reads.push({ service, characteristic, bytes: value.byteLength }),
  };
  return { s, lines, reads };
}

const text = (v: string) => new TextEncoder().encode(v);
/** Power Measurement, Cadence, Total Distance, Expended Energy, Elapsed Time. */
const FEATURES = (1 << 1) | (1 << 2) | (1 << 9) | (1 << 12) | (1 << 14);
const feature = (bytes = 8) => new ByteWriter().u32(FEATURES).u32(0).toUint8Array().slice(0, bytes);

const echoGatt = (overrides: Partial<Record<number, FakeCharacteristic>> = {}): FakeGatt => ({
  [FTMS_SERVICE]: {
    [FtmsCharacteristic.FitnessMachineFeature]: { props: { indicate: true }, value: feature() },
    [FtmsCharacteristic.IndoorBikeData]: {},
    [FtmsCharacteristic.TrainingStatus]: {},
    [FtmsCharacteristic.FitnessMachineStatus]: {},
    ...overrides,
  },
  [DEVICE_INFORMATION_SERVICE]: {
    [DeviceInformationCharacteristic.ManufacturerName]: { value: text('Rogue\0') },
    [DeviceInformationCharacteristic.ModelNumber]: { value: text('Echo Bike') },
    [DeviceInformationCharacteristic.SerialNumber]: { value: text('SECRET-123') },
  },
});

describe('probeDevice', () => {
  it('runs the FTMP setup: inventory, Device Information, Feature, subscriptions in order', async () => {
    const { link, subscribed } = fakeLink(echoGatt());
    const { s, reads: recorded } = sink();
    const report = await probeDevice(link, s);

    expect(report.problems).toEqual([]);
    expect(new Set(report.inventory.map((x) => x.uuid))).toEqual(new Set([uuid16(FTMS_SERVICE), uuid16(DEVICE_INFORMATION_SERVICE)]));
    expect(report.deviceInformation).toEqual({ manufacturer: 'Rogue', model: 'Echo Bike' });
    expect(report.features?.machineFeatures).toContain('Power Measurement');
    // Feature indications first (the characteristic indicates), then FTMP order.
    expect(subscribed).toEqual([
      FtmsCharacteristic.FitnessMachineFeature,
      FtmsCharacteristic.IndoorBikeData,
      FtmsCharacteristic.TrainingStatus,
      FtmsCharacteristic.FitnessMachineStatus,
    ]);
    expect(report.subscribed).toEqual(subscribed);
    expect(recorded).toContainEqual({ service: FTMS_SERVICE, characteristic: FtmsCharacteristic.FitnessMachineFeature, bytes: 8 });
  });

  it('never reads the serial number', async () => {
    const { link, reads } = fakeLink(echoGatt());
    await probeDevice(link, sink().s);
    expect(reads).not.toContain(DeviceInformationCharacteristic.SerialNumber);
  });

  it('reports a device without FTMS instead of failing, keeping the inventory', async () => {
    const { link, subscribed } = fakeLink({ [DEVICE_INFORMATION_SERVICE]: { [DeviceInformationCharacteristic.ModelNumber]: { value: text('X') } } });
    const report = await probeDevice(link, sink().s);
    expect(report.problems).toEqual(['Fitness Machine Service (0x1826) not found']);
    expect(report.inventory).toHaveLength(1);
    expect(report.ftmsCharacteristics).toEqual([]);
    expect(subscribed).toEqual([]);
  });

  it('flags a missing Indoor Bike Data characteristic and a short Feature value', async () => {
    const gatt = echoGatt({ [FtmsCharacteristic.FitnessMachineFeature]: { value: feature(4) } });
    delete gatt[FTMS_SERVICE][FtmsCharacteristic.IndoorBikeData];
    const report = await probeDevice(fakeLink(gatt).link, sink().s);
    expect(report.problems).toEqual(['Fitness Machine Feature has 4 bytes, expected 8', 'Indoor Bike Data (0x2AD2) missing']);
    expect(report.features?.machineFeatures).toContain('Cadence');
  });

  it('keeps going when an optional subscription or the inventory fails', async () => {
    const { link, subscribed } = fakeLink(echoGatt({ [FtmsCharacteristic.TrainingStatus]: { failSubscribe: true } }), { inventoryFails: true });
    const report = await probeDevice(link, sink().s);
    expect(report.problems).toEqual(['Service discovery failed: Error: boom', 'Subscribing to Training Status failed: Error: refused']);
    expect(subscribed).toContain(FtmsCharacteristic.IndoorBikeData);
    expect(subscribed).toContain(FtmsCharacteristic.FitnessMachineStatus);
  });

  it('reports a missing Fitness Machine Feature characteristic', async () => {
    const gatt = echoGatt();
    delete gatt[FTMS_SERVICE][FtmsCharacteristic.FitnessMachineFeature];
    const report = await probeDevice(fakeLink(gatt).link, sink().s);
    expect(report.problems).toEqual(['Fitness Machine Feature (0x2ACC) missing (mandatory, FTMS §4.3)']);
    expect(report.features).toBeUndefined();
  });
});

const notification = (characteristic: number, bytes: Uint8Array, receivedAt = 1_000, service = FTMS_SERVICE): GattNotification => ({
  service,
  characteristic,
  value: new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength),
  receivedAt,
});
const ibd = (d: Omit<IndoorBikeData, 'moreData'> & { moreData?: boolean }) =>
  notification(FtmsCharacteristic.IndoorBikeData, encodeIndoorBikeData({ moreData: false, ...d }));

describe('PacketDecoder', () => {
  it('decodes a complete Indoor Bike Data record into canonical telemetry', () => {
    const decoder = new PacketDecoder();
    const d = decoder.decode(
      ibd({ instantaneousSpeedKmh: 28.4, instantaneousCadenceRpm: 72, totalDistanceM: 412, instantaneousPowerW: 312, totalEnergyKcal: 18, elapsedTimeS: 63 }),
    );
    expect(d.name).toBe('Indoor Bike Data');
    expect(d.text).toMatch(/^flags 0x[0-9a-f]{4} \| speed 28\.40 km\/h · cadence 72\.0 rpm · distance 412 m · power 312 W · energy 18 kcal/);
    expect(d.telemetry).toEqual({
      at: 1_000,
      powerW: 312,
      cadenceRpm: 72,
      speedKmh: 28.4,
      heartRateBpm: undefined,
      deviceCounters: { distanceM: 412, energyKcal: 18, elapsedS: 63 },
    });
  });

  it('reassembles a record split with More Data and marks the fragment', () => {
    const decoder = new PacketDecoder();
    const first = decoder.decode(ibd({ moreData: true, instantaneousCadenceRpm: 80 }));
    expect(first.text).toContain('More Data (fragment)');
    expect(first.telemetry).toBeUndefined();
    const second = decoder.decode(ibd({ instantaneousSpeedKmh: 30, instantaneousPowerW: 400 }));
    expect(second.telemetry).toMatchObject({ cadenceRpm: 80, speedKmh: 30, powerW: 400 });
  });

  it('discards a partial record after link loss (FTMS §4.18)', () => {
    const decoder = new PacketDecoder();
    decoder.decode(ibd({ moreData: true, instantaneousCadenceRpm: 80 }));
    decoder.linkLost();
    const next = decoder.decode(ibd({ instantaneousSpeedKmh: 30 }));
    expect(next.telemetry?.cadenceRpm).toBeUndefined();
  });

  it('marks truncated payloads and reserved flag bits', () => {
    const decoder = new PacketDecoder();
    // Flags claim Instantaneous Cadence (bit 2) and power (bit 6), but only speed follows.
    expect(decoder.decode(notification(FtmsCharacteristic.IndoorBikeData, fromHex('4400 1027'))).text).toContain('TRUNCATED');
    // Bit 15 is Reserved for Future Use.
    expect(decoder.decode(notification(FtmsCharacteristic.IndoorBikeData, fromHex('0080 1027'))).text).toContain('RFU flags 0x8000');
  });

  it('decodes status characteristics and leaves other services raw', () => {
    const decoder = new PacketDecoder();
    expect(decoder.decode(notification(FtmsCharacteristic.TrainingStatus, fromHex('0001'))).text).toBe('Idle');
    expect(decoder.decode(notification(FtmsCharacteristic.FitnessMachineStatus, fromHex('0202'))).text).toBe('Stopped or Paused by the User (pause) [02]');
    expect(decoder.decode(notification(FtmsCharacteristic.FitnessMachineStatus, fromHex('04'))).text).toBe('Started or Resumed by the User');
    expect(decoder.decode(notification(FtmsCharacteristic.FitnessMachineFeature, feature())).text).toMatch(/^Features changed: .*Cadence/);
    const hr = decoder.decode(notification(0x2a37, fromHex('0048'), 1_000, 0x180d));
    expect(hr).toMatchObject({ name: '0x2a37', hex: '00 48', text: '(not decoded)' });
  });

  it('feeds the conformance checks', () => {
    const decoder = new PacketDecoder();
    decoder.setDevice({ ftmsCharacteristics: [FtmsCharacteristic.FitnessMachineFeature, FtmsCharacteristic.IndoorBikeData], features: undefined });
    decoder.decode(ibd({ instantaneousSpeedKmh: 20 }));
    expect(decoder.conformanceReport().length).toBeGreaterThan(0);
  });
});

describe('describe helpers', () => {
  it('lists only present Indoor Bike Data fields', () => {
    expect(describeIndoorBikeData({ moreData: false, instantaneousSpeedKmh: 10, heartRateBpm: 120 })).toBe('speed 10.00 km/h · HR 120 bpm');
  });

  it('shows each canonical metric as reported: a real 0 stays 0, a missing metric is "–"', () => {
    const lines = describeLive({ at: 0, powerW: 0, cadenceRpm: 61.5, deviceCounters: { energyKcal: 12 } }, undefined);
    expect(lines).toEqual([
      'Power                        0 W',
      'Cadence                      61.5 rpm',
      'Speed                        –',
      'Heart rate                   –',
      'Distance (bike counter)      –',
      'Energy (bike counter)        12 kcal',
      'Elapsed time (bike counter)  –',
    ]);
  });

  it('marks metrics the bike does not declare in its features', () => {
    const lines = describeLive(undefined, ['speed', 'power', 'cadence']);
    expect(lines[0]).toBe('Power                        –');
    expect(lines[3]).toBe('Heart rate                   –  (not declared by the bike)');
  });
});

describe('CaptureLog', () => {
  it('writes relative times and full UUIDs and contains no device id', () => {
    const log = new CaptureLog(10_000, 'ftms', 'ECHO-1234');
    log.event(10_000, 'chosen', 'mode=ftms');
    log.read(10_050, FTMS_SERVICE, FtmsCharacteristic.FitnessMachineFeature, new DataView(feature().buffer));
    log.packet(notification(FtmsCharacteristic.IndoorBikeData, fromHex('0000 1027'), 11_000));
    const c = log.toJSON(new Date('2026-09-27T10:00:00Z'), 'UA');
    expect(c).toMatchObject({
      format: 'openairbike-capture',
      version: 0,
      chooser: 'ftms',
      device: { name: 'ECHO-1234' },
      userAgent: 'UA',
      events: [{ t: 0, kind: 'chosen', detail: 'mode=ftms' }],
      reads: [{ t: 50, service: uuid16(FTMS_SERVICE), characteristic: uuid16(0x2acc) }],
      packets: [{ t: 1_000, characteristic: '00002ad2-0000-1000-8000-00805f9b34fb', hex: '00 00 10 27' }],
      packetsDropped: 0,
    });
    expect(JSON.stringify(c)).not.toMatch(/"id"/);
  });

  it('keeps no packets when raw logging is off, and bounds memory', () => {
    const log = new CaptureLog(0, 'all', undefined);
    log.recordPackets = false;
    log.packet(notification(FtmsCharacteristic.IndoorBikeData, fromHex('0000')));
    expect(log.packetCount).toBe(0);

    log.recordPackets = true;
    for (let i = 0; i < MAX_CAPTURED_PACKETS + 2; i++) log.packet(notification(FtmsCharacteristic.IndoorBikeData, fromHex('0000')));
    expect(log.packetCount).toBe(MAX_CAPTURED_PACKETS);
    expect(log.toJSON(new Date()).packetsDropped).toBe(2);
  });
});

describe('transport inventory', () => {
  it('lists the simulated GATT database with full UUIDs and properties', async () => {
    const t = new SimulatedTransport({ autoRun: false });
    let inventory: GattServiceInventory[] = [];
    await t.connect(async (link) => {
      inventory = await link.inventory();
    });
    const ftms = inventory.find((s) => s.uuid === uuid16(FTMS_SERVICE));
    expect(ftms?.characteristics).toContainEqual({ uuid: uuid16(FtmsCharacteristic.IndoorBikeData), properties: ['notify'] });
    expect(ftms?.characteristics).toContainEqual({ uuid: uuid16(FtmsCharacteristic.FitnessMachineFeature), properties: ['read'] });
  });

  it('maps Web Bluetooth characteristic properties in specification order', () => {
    expect(propertyList({ indicate: true, read: true, write: false, notify: true })).toEqual(['read', 'notify', 'indicate']);
  });
});
