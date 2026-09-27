import { Emitter } from '../util/emitter';

/**
 * Transport layer: BLE connection lifecycle and GATT operations. It moves bytes and knows
 * nothing about FTMS or any device; the Device Adapter decides what to discover and subscribe.
 * All UUIDs are 16-bit Bluetooth SIG assigned numbers.
 */

export type ConnectionState = 'disconnected' | 'connecting' | 'connected' | 'reconnecting';

export interface CharacteristicInfo {
  uuid: number;
  read: boolean;
  notify: boolean;
  indicate: boolean;
}

export type CharacteristicProperty =
  | 'broadcast'
  | 'read'
  | 'writeWithoutResponse'
  | 'write'
  | 'notify'
  | 'indicate'
  | 'authenticatedSignedWrites'
  | 'reliableWrite'
  | 'writableAuxiliaries';

/** One primary service with its characteristics, as full 128-bit UUID strings (lower case). */
export interface GattServiceInventory {
  uuid: string;
  characteristics: { uuid: string; properties: CharacteristicProperty[] }[];
}

/** A characteristic notification or indication, before any parsing. */
export interface GattNotification {
  service: number;
  characteristic: number;
  value: DataView;
  /** Epoch milliseconds when the notification was received. */
  receivedAt: number;
}

/** GATT operations available while connected. */
export interface GattLink {
  /**
   * All primary services the device exposes *and* the page may access, with their
   * characteristics. With Web Bluetooth only services named in the chooser request are visible.
   */
  inventory(): Promise<GattServiceInventory[]>;
  /** Characteristics of a primary service, or undefined if the device lacks the service. */
  characteristics(service: number): Promise<CharacteristicInfo[] | undefined>;
  read(service: number, characteristic: number): Promise<DataView>;
  /** Enables notifications or indications; values arrive as `notification` events. */
  subscribe(service: number, characteristic: number): Promise<void>;
}

/**
 * Runs after every (re)connection. The Device Adapter discovers services and subscribes here.
 * Throwing aborts the connection attempt.
 */
export type SessionSetup = (link: GattLink) => Promise<void>;

/** What the device chooser offers: devices advertising one of `services` or matching a name prefix. */
export interface DeviceFilter {
  services: number[];
  namePrefixes: string[];
  /** Services the adapter may access in addition to the filter services. */
  optionalServices: number[];
}

export type TransportEvents = {
  state: ConnectionState;
  notification: GattNotification;
  /** Human-readable connection log line. */
  log: string;
};

export abstract class Transport extends Emitter<TransportEvents> {
  abstract readonly state: ConnectionState;
  /** Stable identifier of the remote device (per browser profile for Web Bluetooth). */
  abstract readonly deviceId: string;
  abstract readonly deviceName: string | undefined;
  /** Connects, runs `setup`, and re-runs it after every automatic reconnect. */
  abstract connect(setup: SessionSetup): Promise<void>;
  abstract disconnect(): Promise<void>;
}
