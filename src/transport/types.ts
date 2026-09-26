import type { FitnessMachineFeature } from '../protocol/ftms/machineInfo';
import { Emitter } from '../util/emitter';

export type ConnectionState = 'disconnected' | 'connecting' | 'connected' | 'reconnecting';

/** What OpenAirBike learned about the connected machine during discovery. */
export interface BikeInfo {
  id: string;
  name: string;
  manufacturer?: string;
  model?: string;
  firmware?: string;
  hardware?: string;
  software?: string;
  /** Names of the FTMS characteristics the bike exposes. */
  characteristics: string[];
  /** 16-bit UUIDs of the FTMS characteristics the bike exposes. */
  characteristicIds: number[];
  features?: FitnessMachineFeature;
  simulated?: boolean;
}

/** A raw characteristic notification, before any parsing. */
export interface Notification {
  /** 16-bit characteristic UUID. */
  characteristic: number;
  value: DataView;
  /** Epoch milliseconds when the notification was received. */
  receivedAt: number;
}

export type BikeEvents = {
  state: ConnectionState;
  info: BikeInfo;
  notification: Notification;
  /** Human-readable connection log line (discovery, errors, reconnect attempts). */
  log: string;
};

/**
 * The Device Layer: anything that produces raw FTMS notifications.
 * Implemented by the Web Bluetooth connection and by the built-in simulator.
 */
export abstract class BikeConnection extends Emitter<BikeEvents> {
  abstract readonly state: ConnectionState;
  abstract readonly info: BikeInfo | undefined;
  abstract connect(): Promise<void>;
  abstract disconnect(): Promise<void>;
}
