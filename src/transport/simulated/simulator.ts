import { ByteWriter } from '../../protocol/ftms/bytes';
import { encodeIndoorBikeData, type IndoorBikeData } from '../../protocol/ftms/indoorBikeData';
import { DEVICE_INFORMATION_SERVICE, DeviceInformationCharacteristic, FTMS_SERVICE, FtmsCharacteristic } from '../../protocol/ftms/uuids';
import { uuid16 } from '../../util/bleUuid';
import {
  Transport,
  type CharacteristicInfo,
  type CharacteristicProperty,
  type ConnectionState,
  type GattLink,
  type GattServiceInventory,
  type SessionSetup,
} from '../types';

export interface SimulatorOptions {
  /** Notification interval in ms. FTMS suggests about once per second (§4.9.1). */
  intervalMs?: number;
  /** Split every Data Record into two notifications using the More Data flag (FTMS §4.19). */
  splitRecords?: boolean;
  /** Deterministic randomness for tests. */
  random?: () => number;
  /** Emit on a timer after subscription. Tests set false and call `step()` themselves. */
  autoRun?: boolean;
}

/**
 * Air-bike power grows roughly with the cube of cadence (fan resistance).
 * Tuned so that 60 RPM ≈ 216 W and 90 RPM ≈ 730 W, in the range of an Echo Bike.
 */
export const powerFromCadence = (rpm: number) => 0.001 * rpm ** 3;
export const speedFromCadence = (rpm: number) => 0.45 * rpm;

/** Cadence, Total Distance, Expended Energy, Elapsed Time, Power Measurement: what `step()` sends. */
export const SIMULATED_FEATURES = (1 << 1) | (1 << 2) | (1 << 9) | (1 << 12) | (1 << 14);

const text = (s: string) => new DataView(new TextEncoder().encode(s).buffer);

/** The simulated GATT database: service → characteristic → properties and static value. */
const GATT: Record<number, Record<number, { props: Omit<CharacteristicInfo, 'uuid'>; value?: () => DataView }>> = {
  [FTMS_SERVICE]: {
    [FtmsCharacteristic.FitnessMachineFeature]: {
      props: { read: true, notify: false, indicate: false },
      value: () => new DataView(new ByteWriter().u32(SIMULATED_FEATURES).u32(0).toUint8Array().buffer),
    },
    [FtmsCharacteristic.IndoorBikeData]: { props: { read: false, notify: true, indicate: false } },
  },
  [DEVICE_INFORMATION_SERVICE]: {
    [DeviceInformationCharacteristic.ManufacturerName]: { props: { read: true, notify: false, indicate: false }, value: () => text('OpenAirBike') },
    [DeviceInformationCharacteristic.ModelNumber]: { props: { read: true, notify: false, indicate: false }, value: () => text('Simulator') },
  },
};

function inventory(): GattServiceInventory[] {
  return Object.entries(GATT).map(([service, chars]) => ({
    uuid: uuid16(Number(service)),
    characteristics: Object.entries(chars).map(([uuid, c]) => ({
      uuid: uuid16(Number(uuid)),
      properties: (['read', 'notify', 'indicate'] as const).filter((p) => c.props[p]) as CharacteristicProperty[],
    })),
  }));
}

/**
 * Transport fake for a simulated air bike. It exposes a small GATT database and emits genuine
 * Indoor Bike Data bytes, so the adapter, telemetry and recording run exactly as with hardware.
 * Alternates easy riding with a 15 s sprint every minute.
 */
export class SimulatedTransport extends Transport {
  readonly deviceId = 'simulator';
  readonly deviceName = 'Demo Bike (simulated)';
  private _state: ConnectionState = 'disconnected';
  private timer: ReturnType<typeof setInterval> | undefined;
  private tick = 0;
  private cadence = 55;
  private distanceM = 0;
  private energyKcal = 0;
  private readonly intervalMs: number;
  private readonly splitRecords: boolean;
  private readonly random: () => number;
  private readonly autoRun: boolean;

  constructor(options: SimulatorOptions = {}) {
    super();
    this.intervalMs = options.intervalMs ?? 1000;
    this.splitRecords = options.splitRecords ?? false;
    this.random = options.random ?? Math.random;
    this.autoRun = options.autoRun ?? true;
  }

  get state(): ConnectionState {
    return this._state;
  }

  async connect(setup: SessionSetup): Promise<void> {
    const link: GattLink = {
      inventory: async () => inventory(),
      characteristics: async (service) => {
        const chars = GATT[service];
        return chars && Object.entries(chars).map(([uuid, c]) => ({ uuid: Number(uuid), ...c.props }));
      },
      read: async (service, characteristic) => {
        const value = GATT[service]?.[characteristic]?.value;
        if (!value) throw new Error(`Characteristic 0x${characteristic.toString(16)} is not readable.`);
        return value();
      },
      subscribe: async (service, characteristic) => {
        if (service === FTMS_SERVICE && characteristic === FtmsCharacteristic.IndoorBikeData && this.autoRun) {
          clearInterval(this.timer);
          this.timer = setInterval(() => this.step(), this.intervalMs);
        }
      },
    };
    this._state = 'connecting';
    this.emit('state', this._state);
    await setup(link);
    this._state = 'connected';
    this.emit('state', this._state);
    this.emit('log', 'Simulator connected.');
  }

  async disconnect(): Promise<void> {
    clearInterval(this.timer);
    this.timer = undefined;
    this._state = 'disconnected';
    this.emit('state', this._state);
  }

  /** Advances the simulation by one interval and emits the resulting notification(s). */
  step(): void {
    this.tick++;
    const sprint = this.tick % 60 >= 45;
    const target = sprint ? 85 : 55;
    this.cadence += (target - this.cadence) * 0.35 + (this.random() - 0.5) * 4;
    this.cadence = Math.max(0, this.cadence);

    const dt = this.intervalMs / 1000;
    const power = powerFromCadence(this.cadence);
    const speed = speedFromCadence(this.cadence);
    this.distanceM += (speed / 3.6) * dt;
    this.energyKcal += (power * dt) / 1000 / 4.184 / 0.24;

    const record: IndoorBikeData = {
      moreData: false,
      instantaneousSpeedKmh: speed,
      instantaneousCadenceRpm: Math.round(this.cadence * 2) / 2,
      totalDistanceM: this.distanceM,
      instantaneousPowerW: power,
      totalEnergyKcal: this.energyKcal,
      elapsedTimeS: this.tick * dt,
    };

    const parts: IndoorBikeData[] = this.splitRecords
      ? [
          { moreData: true, instantaneousCadenceRpm: record.instantaneousCadenceRpm, totalDistanceM: record.totalDistanceM },
          { ...record, instantaneousCadenceRpm: undefined, totalDistanceM: undefined },
        ]
      : [record];

    for (const part of parts) {
      this.emit('notification', {
        service: FTMS_SERVICE,
        characteristic: FtmsCharacteristic.IndoorBikeData,
        value: new DataView(encodeIndoorBikeData(part).buffer),
        receivedAt: Date.now(),
      });
    }
  }
}
