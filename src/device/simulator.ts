import { ByteWriter } from '../ftms/bytes';
import { encodeIndoorBikeData, type IndoorBikeData } from '../ftms/indoorBikeData';
import { parseFitnessMachineFeature } from '../ftms/machineInfo';
import { FtmsCharacteristic } from '../ftms/uuids';
import { BikeConnection, type BikeInfo, type ConnectionState } from './types';

const SIMULATED_FEATURES = (1 << 1) | (1 << 2) | (1 << 9) | (1 << 12) | (1 << 14);

export interface SimulatorOptions {
  /** Notification interval in ms. FTMS suggests about once per second (§4.9.1). */
  intervalMs?: number;
  /** Split every Data Record into two notifications using the More Data flag (FTMS §4.19). */
  splitRecords?: boolean;
  /** Deterministic randomness for tests. */
  random?: () => number;
}

/**
 * Air-bike power grows roughly with the cube of cadence (fan resistance).
 * Tuned so that 60 RPM ≈ 216 W and 90 RPM ≈ 730 W, in the range of an Echo Bike.
 */
export const powerFromCadence = (rpm: number) => 0.001 * rpm ** 3;
export const speedFromCadence = (rpm: number) => 0.45 * rpm;

/**
 * A fake bike that emits genuine Indoor Bike Data bytes, so the whole pipeline
 * (parser → telemetry → recorder) can be used and tested without hardware.
 * Alternates easy riding with short sprints.
 */
export class SimulatedBike extends BikeConnection {
  private _state: ConnectionState = 'disconnected';
  private timer: ReturnType<typeof setInterval> | undefined;
  private tick = 0;
  private cadence = 55;
  private distanceM = 0;
  private energyKcal = 0;
  private readonly intervalMs: number;
  private readonly splitRecords: boolean;
  private readonly random: () => number;

  readonly info: BikeInfo = {
    id: 'simulator',
    name: 'Demo Bike (simulated)',
    manufacturer: 'OpenAirBike',
    model: 'Simulator',
    characteristics: ['Fitness Machine Feature', 'Indoor Bike Data'],
    characteristicIds: [FtmsCharacteristic.FitnessMachineFeature, FtmsCharacteristic.IndoorBikeData],
    // Cadence, Total Distance, Expended Energy, Elapsed Time, Power Measurement: what step() sends.
    features: parseFitnessMachineFeature(new ByteWriter().u32(SIMULATED_FEATURES).u32(0).toUint8Array()),
    simulated: true,
  };

  constructor(options: SimulatorOptions = {}) {
    super();
    this.intervalMs = options.intervalMs ?? 1000;
    this.splitRecords = options.splitRecords ?? false;
    this.random = options.random ?? Math.random;
  }

  get state(): ConnectionState {
    return this._state;
  }

  async connect(): Promise<void> {
    this._state = 'connected';
    this.emit('state', this._state);
    this.emit('log', 'Simulator connected.');
    this.emit('info', this.info);
    this.timer = setInterval(() => this.step(), this.intervalMs);
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
    const sprint = this.tick % 60 >= 45; // 15 s sprint every minute
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
      const bytes = encodeIndoorBikeData(part);
      this.emit('notification', {
        characteristic: FtmsCharacteristic.IndoorBikeData,
        value: new DataView(bytes.buffer),
        receivedAt: Date.now(),
      });
    }
  }
}
