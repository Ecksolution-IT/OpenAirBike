import { describe, expect, it } from 'vitest';
import { FtmsIndoorBikeAdapter, ftmsIndoorBikeFilter } from '../src/adapters/ftms-indoor-bike/adapter';
import { capabilitiesFromFeatures, toCanonical } from '../src/adapters/ftms-indoor-bike/canonical';
import { resolveProfile } from '../src/adapters/profiles';
import type { DeviceEvent } from '../src/adapters/types';
import { ByteWriter, fromHex } from '../src/protocol/ftms/bytes';
import { DataRecordAssembler } from '../src/protocol/ftms/dataRecord';
import { parseIndoorBikeData } from '../src/protocol/ftms/indoorBikeData';
import { parseFitnessMachineFeature } from '../src/protocol/ftms/machineInfo';
import { DEVICE_INFORMATION_SERVICE, FTMS_SERVICE, FtmsCharacteristic } from '../src/protocol/ftms/uuids';
import type { TelemetrySample } from '../src/telemetry/types';
import { Transport, type CharacteristicInfo, type ConnectionState, type GattLink, type SessionSetup } from '../src/transport/types';

type Gatt = Record<number, Record<number, { props?: Partial<CharacteristicInfo>; value?: Uint8Array }>>;

/** Minimal in-memory Transport: a GATT database plus manual notification injection. */
class FakeTransport extends Transport {
  readonly deviceId = 'fake-1';
  state: ConnectionState = 'disconnected';
  readonly subscribed: number[] = [];

  constructor(
    private readonly gatt: Gatt,
    readonly deviceName: string | undefined = 'ECHO-4711',
  ) {
    super();
  }

  async connect(setup: SessionSetup) {
    const link: GattLink = {
      characteristics: async (service) =>
        this.gatt[service] &&
        Object.entries(this.gatt[service]).map(([uuid, c]) => ({ uuid: Number(uuid), read: true, notify: true, indicate: false, ...c.props })),
      read: async (service, characteristic) => {
        const value = this.gatt[service]?.[characteristic]?.value;
        if (!value) throw new Error('not readable');
        return new DataView(value.buffer);
      },
      subscribe: async (_service, characteristic) => {
        this.subscribed.push(characteristic);
      },
    };
    await setup(link);
    this.setState('connected');
  }

  async disconnect() {
    this.setState('disconnected');
  }

  setState(state: ConnectionState) {
    this.state = state;
    this.emit('state', state);
  }

  notify(characteristic: number, hex: string, service = FTMS_SERVICE) {
    const bytes = fromHex(hex);
    this.emit('notification', { service, characteristic, value: new DataView(bytes.buffer), receivedAt: 5000 });
  }
}

const features = (machine: number) => new ByteWriter().u32(machine).u32(0).toUint8Array();
// Cadence (1), Total Distance (2), Expended Energy (9), Elapsed Time (12), Power (14)
const ECHO_LIKE = (1 << 1) | (1 << 2) | (1 << 9) | (1 << 12) | (1 << 14);

const echoLikeGatt = (): Gatt => ({
  [FTMS_SERVICE]: {
    [FtmsCharacteristic.FitnessMachineFeature]: { props: { notify: false, indicate: true }, value: features(ECHO_LIKE) },
    [FtmsCharacteristic.IndoorBikeData]: {},
    [FtmsCharacteristic.TrainingStatus]: {},
    [FtmsCharacteristic.FitnessMachineStatus]: {},
  },
  [DEVICE_INFORMATION_SERVICE]: {
    0x2a29: { value: new TextEncoder().encode('Rogue\0') },
  },
});

/** A typical record: speed 25.50, cadence 60.5, distance 1234 m, power 250 W, energy 42 kcal, elapsed 300 s. */
const ECHO_LIKE_RECORD = '54 09 f6 09 79 00 d2 04 00 fa 00 2a 00 ff ff ff 2c 01';

describe('FtmsIndoorBikeAdapter', () => {
  it('discovers, subscribes and identifies the device', async () => {
    const transport = new FakeTransport(echoLikeGatt());
    const adapter = new FtmsIndoorBikeAdapter(transport);
    await adapter.connect();

    expect(transport.subscribed).toEqual([
      FtmsCharacteristic.FitnessMachineFeature, // indicate → feature changes (FTMS 1.0.1)
      FtmsCharacteristic.IndoorBikeData,
      FtmsCharacteristic.TrainingStatus,
      FtmsCharacteristic.FitnessMachineStatus,
    ]);
    expect(adapter.info).toMatchObject({
      id: 'fake-1',
      name: 'ECHO-4711',
      manufacturer: 'Rogue',
      profileId: 'rogue-echo-bike-v3',
      capabilities: ['speed', 'power', 'cadence', 'distance', 'energy', 'elapsedTime'],
    });
  });

  it('emits canonical samples from Indoor Bike Data', async () => {
    const transport = new FakeTransport(echoLikeGatt());
    const adapter = new FtmsIndoorBikeAdapter(transport);
    const samples: TelemetrySample[] = [];
    adapter.on('sample', (s) => samples.push(s));
    await adapter.connect();

    transport.notify(FtmsCharacteristic.IndoorBikeData, ECHO_LIKE_RECORD);
    transport.notify(FtmsCharacteristic.IndoorBikeData, ECHO_LIKE_RECORD, 0x180d); // other service: ignored

    expect(samples).toEqual([
      {
        at: 5000,
        powerW: 250,
        cadenceRpm: 60.5,
        speedKmh: 25.5,
        heartRateBpm: undefined,
        deviceCounters: { distanceM: 1234, energyKcal: 42, elapsedS: 300 },
      },
    ]);
  });

  it('drops a partial Data Record when the link is lost (FTMS §4.18)', async () => {
    const transport = new FakeTransport(echoLikeGatt());
    const adapter = new FtmsIndoorBikeAdapter(transport);
    const samples: TelemetrySample[] = [];
    adapter.on('sample', (s) => samples.push(s));
    await adapter.connect();

    transport.notify(FtmsCharacteristic.IndoorBikeData, '41 00 fa 00'); // More Data + power 250 W
    transport.setState('reconnecting');
    transport.setState('connected');
    transport.notify(FtmsCharacteristic.IndoorBikeData, '00 00 b8 0b'); // speed 30, final part

    expect(samples).toHaveLength(1);
    expect(samples[0]).toMatchObject({ speedKmh: 30, powerW: undefined });
  });

  it('maps Fitness Machine Status to device events', async () => {
    const transport = new FakeTransport(echoLikeGatt());
    const adapter = new FtmsIndoorBikeAdapter(transport);
    const events: DeviceEvent['kind'][] = [];
    adapter.on('deviceEvent', (e) => events.push(e.kind));
    await adapter.connect();

    for (const hex of ['02 02', '04', '02 01', '01', '08 fa 00']) transport.notify(FtmsCharacteristic.FitnessMachineStatus, hex);
    expect(events).toEqual(['paused', 'started', 'stopped', 'reset', 'other']);
  });

  it('updates capabilities on a Feature indication', async () => {
    const transport = new FakeTransport(echoLikeGatt());
    const adapter = new FtmsIndoorBikeAdapter(transport);
    await adapter.connect();
    transport.notify(FtmsCharacteristic.FitnessMachineFeature, '00 04 00 00 00 00 00 00'); // heart rate only
    expect(adapter.info?.capabilities).toEqual(['speed', 'heartRate']);
  });

  it('rejects devices without FTMS or without Indoor Bike Data', async () => {
    await expect(new FtmsIndoorBikeAdapter(new FakeTransport({})).connect()).rejects.toThrow('Fitness Machine Service');
    const rower = new FakeTransport({ [FTMS_SERVICE]: { [FtmsCharacteristic.RowerData]: {} } });
    await expect(new FtmsIndoorBikeAdapter(rower).connect()).rejects.toThrow('Found: Rower Data');
  });

  it('builds the chooser filter from FTMS and all profile name prefixes', () => {
    const filter = ftmsIndoorBikeFilter();
    expect(filter.services).toEqual([FTMS_SERVICE]);
    expect(filter.namePrefixes).toEqual(expect.arrayContaining(['Echo', 'Rogue']));
    expect(filter.optionalServices).toContain(DEVICE_INFORMATION_SERVICE);
  });
});

describe('device profiles', () => {
  it('recognizes the Echo Bike and falls back to the generic FTMS profile', () => {
    expect(resolveProfile({ name: 'ECHO-4711' }).id).toBe('rogue-echo-bike-v3');
    expect(resolveProfile({ name: 'XYZ', manufacturer: 'Rogue Fitness' }).id).toBe('rogue-echo-bike-v3');
    expect(resolveProfile({ name: 'KICKR BIKE 1234' }).id).toBe('ftms-indoor-bike');
    expect(resolveProfile({}).id).toBe('ftms-indoor-bike');
  });
});

describe('canonical mapping', () => {
  it('keeps device counters apart from instantaneous metrics', () => {
    const record = new DataRecordAssembler().push(parseIndoorBikeData(fromHex(ECHO_LIKE_RECORD)))!;
    expect(toCanonical(record, 1)).toEqual({
      at: 1,
      powerW: 250,
      cadenceRpm: 60.5,
      speedKmh: 25.5,
      heartRateBpm: undefined,
      deviceCounters: { distanceM: 1234, energyKcal: 42, elapsedS: 300 },
    });
  });

  it('derives capabilities from feature bits', () => {
    expect(capabilitiesFromFeatures(parseFitnessMachineFeature(features(0)))).toEqual(['speed']);
    expect(capabilitiesFromFeatures(parseFitnessMachineFeature(features(1 << 10)))).toEqual(['speed', 'heartRate']);
  });
});
