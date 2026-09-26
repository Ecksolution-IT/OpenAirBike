import type { BikeConnection, Notification } from '../device/types';
import { DataRecordAssembler } from '../ftms/dataRecord';
import { parseIndoorBikeData } from '../ftms/indoorBikeData';
import { parseMachineStatus, parseTrainingStatus, type MachineStatus, type TrainingStatus } from '../ftms/machineInfo';
import { FtmsCharacteristic } from '../ftms/uuids';
import { Emitter } from '../util/emitter';

/** One complete, normalized telemetry reading from the bike. */
export interface TelemetrySample {
  /** Epoch milliseconds. */
  at: number;
  powerW?: number;
  cadenceRpm?: number;
  speedKmh?: number;
  heartRateBpm?: number;
  /** Bike's own distance counter (meters since its session started). */
  distanceM?: number;
  /** Bike's own energy counter (kcal since its session started). */
  energyKcal?: number;
  /** Bike's own elapsed time (seconds since its session started). */
  elapsedS?: number;
}

export type TelemetryEvents = {
  sample: TelemetrySample;
  trainingStatus: TrainingStatus;
  machineStatus: MachineStatus;
  /** Every raw notification, for diagnostics and packet captures. */
  raw: Notification;
};

/** A reading older than this is shown as unavailable rather than frozen. */
export const STALE_AFTER_MS = 3500;

/**
 * Telemetry Engine: turns raw notifications from the Device Layer into complete,
 * normalized samples for the dashboard and the recorder.
 */
export class TelemetryEngine extends Emitter<TelemetryEvents> {
  private readonly assembler = new DataRecordAssembler();
  private _latest: TelemetrySample | undefined;

  get latest(): TelemetrySample | undefined {
    return this._latest;
  }

  /** Latest sample if it is recent enough to be trusted, otherwise undefined. */
  current(now = Date.now()): TelemetrySample | undefined {
    return this._latest && now - this._latest.at <= STALE_AFTER_MS ? this._latest : undefined;
  }

  /** Subscribes to a connection. Returns a function that detaches again. */
  attach(connection: BikeConnection): () => void {
    const offs = [
      connection.on('notification', (n) => this.handle(n)),
      connection.on('state', (state) => {
        // A partially received Data Record must be discarded after link loss (FTMS §4.18).
        if (state !== 'connected') this.assembler.reset();
      }),
    ];
    return () => offs.forEach((off) => off());
  }

  handle(notification: Notification): void {
    this.emit('raw', notification);
    switch (notification.characteristic) {
      case FtmsCharacteristic.IndoorBikeData: {
        const record = this.assembler.push(parseIndoorBikeData(notification.value));
        if (!record) return;
        const sample: TelemetrySample = {
          at: notification.receivedAt,
          powerW: record.instantaneousPowerW,
          cadenceRpm: record.instantaneousCadenceRpm,
          speedKmh: record.instantaneousSpeedKmh,
          heartRateBpm: record.heartRateBpm,
          distanceM: record.totalDistanceM,
          energyKcal: record.totalEnergyKcal,
          elapsedS: record.elapsedTimeS,
        };
        this._latest = sample;
        this.emit('sample', sample);
        return;
      }
      case FtmsCharacteristic.TrainingStatus:
        this.emit('trainingStatus', parseTrainingStatus(notification.value));
        return;
      case FtmsCharacteristic.FitnessMachineStatus:
        this.emit('machineStatus', parseMachineStatus(notification.value));
        return;
    }
  }
}
