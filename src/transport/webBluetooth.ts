import { shortUuid, uuid16 } from '../util/bleUuid';
import {
  Transport,
  type CharacteristicInfo,
  type ConnectionState,
  type DeviceFilter,
  type GattLink,
  type SessionSetup,
} from './types';

const CONNECT_TIMEOUT_MS = 20_000;
const RECONNECT_DELAYS_MS = [1_000, 2_000, 4_000, 8_000, 15_000, 30_000, 30_000, 30_000];

export function isWebBluetoothAvailable(): boolean {
  return typeof navigator !== 'undefined' && 'bluetooth' in navigator;
}

/** Opens the browser's device chooser. Must be called from a user gesture (click). */
export async function requestDevice(filter: DeviceFilter): Promise<BluetoothDevice> {
  return navigator.bluetooth.requestDevice({
    filters: [
      ...filter.services.map((s) => ({ services: [uuid16(s)] })),
      ...filter.namePrefixes.map((namePrefix) => ({ namePrefix })),
    ],
    optionalServices: [...new Set([...filter.services, ...filter.optionalServices])].map(uuid16),
  });
}

/**
 * Looks up a device the user has already granted access to, so it can be reconnected
 * without the chooser. Returns undefined where the browser lacks `getDevices()`.
 */
export async function findPermittedDevice(id: string): Promise<BluetoothDevice | undefined> {
  const bluetooth = navigator.bluetooth as Bluetooth & { getDevices?: () => Promise<BluetoothDevice[]> };
  if (!bluetooth.getDevices) return undefined;
  const devices = await bluetooth.getDevices();
  return devices.find((d) => d.id === id);
}

function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(message)), ms);
    promise.then(
      (v) => (clearTimeout(timer), resolve(v)),
      (e) => (clearTimeout(timer), reject(e)),
    );
  });
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** GATT operations on one live connection; caches services and characteristics. */
class WebBluetoothLink implements GattLink {
  private readonly services = new Map<number, Map<number, BluetoothRemoteGATTCharacteristic> | undefined>();

  constructor(
    private readonly server: BluetoothRemoteGATTServer,
    private readonly onValue: (event: Event) => void,
  ) {}

  private async service(service: number) {
    if (!this.services.has(service)) {
      let chars: Map<number, BluetoothRemoteGATTCharacteristic> | undefined;
      try {
        const s = await this.server.getPrimaryService(uuid16(service));
        chars = new Map();
        for (const c of await s.getCharacteristics()) {
          const short = shortUuid(c.uuid);
          if (short !== undefined) chars.set(short, c);
        }
      } catch {
        chars = undefined; // Service not present (or not permitted).
      }
      this.services.set(service, chars);
    }
    return this.services.get(service);
  }

  private async characteristic(service: number, characteristic: number) {
    const c = (await this.service(service))?.get(characteristic);
    if (!c) throw new Error(`Characteristic 0x${characteristic.toString(16)} not found in service 0x${service.toString(16)}.`);
    return c;
  }

  async characteristics(service: number): Promise<CharacteristicInfo[] | undefined> {
    const chars = await this.service(service);
    if (!chars) return undefined;
    return [...chars.entries()].map(([uuid, c]) => ({
      uuid,
      read: c.properties.read,
      notify: c.properties.notify,
      indicate: c.properties.indicate,
    }));
  }

  async read(service: number, characteristic: number): Promise<DataView> {
    return (await this.characteristic(service, characteristic)).readValue();
  }

  async subscribe(service: number, characteristic: number): Promise<void> {
    const c = await this.characteristic(service, characteristic);
    // Same function reference on every (re)subscription, so the listener is never added twice.
    c.addEventListener('characteristicvaluechanged', this.onValue);
    await c.startNotifications();
  }
}

/** Transport over Web Bluetooth, with automatic reconnect and backoff. */
export class WebBluetoothTransport extends Transport {
  private _state: ConnectionState = 'disconnected';
  private userDisconnected = false;
  private reconnecting = false;
  private setup: SessionSetup | undefined;

  constructor(private readonly device: BluetoothDevice) {
    super();
    device.addEventListener('gattserverdisconnected', () => void this.onDisconnected());
  }

  get state(): ConnectionState {
    return this._state;
  }

  get deviceId(): string {
    return this.device.id;
  }

  get deviceName(): string | undefined {
    return this.device.name ?? undefined;
  }

  async connect(setup: SessionSetup): Promise<void> {
    this.setup = setup;
    this.userDisconnected = false;
    this.setState('connecting');
    try {
      await withTimeout(this.open(), CONNECT_TIMEOUT_MS, 'Timed out while connecting.');
      this.setState('connected');
    } catch (err) {
      // Mark as intentional so the disconnect below does not trigger the reconnect loop.
      this.userDisconnected = true;
      this.device.gatt?.disconnect();
      this.setState('disconnected');
      throw err;
    }
  }

  async disconnect(): Promise<void> {
    this.userDisconnected = true;
    this.device.gatt?.disconnect();
    this.setState('disconnected');
  }

  private setState(state: ConnectionState) {
    if (state === this._state) return;
    this._state = state;
    this.emit('state', state);
  }

  private async open(): Promise<void> {
    const gatt = this.device.gatt;
    if (!gatt) throw new Error('This device does not support GATT.');
    this.emit('log', `Connecting to ${this.device.name ?? 'device'}…`);
    const server = await gatt.connect();
    await this.setup!(new WebBluetoothLink(server, this.onValue));
  }

  private readonly onValue = (event: Event) => {
    const c = event.target as BluetoothRemoteGATTCharacteristic;
    const characteristic = shortUuid(c.uuid);
    const service = shortUuid(c.service.uuid);
    if (!c.value || characteristic === undefined || service === undefined) return;
    // Copy: the browser may reuse the underlying buffer for the next notification.
    const value = new DataView(c.value.buffer.slice(c.value.byteOffset, c.value.byteOffset + c.value.byteLength));
    this.emit('notification', { service, characteristic, value, receivedAt: Date.now() });
  };

  private async onDisconnected() {
    if (this.userDisconnected || this.reconnecting) return;
    this.reconnecting = true;
    this.setState('reconnecting');
    this.emit('log', 'Connection lost. Reconnecting…');
    try {
      for (let attempt = 0; attempt < RECONNECT_DELAYS_MS.length; attempt++) {
        await sleep(RECONNECT_DELAYS_MS[attempt]);
        if (this.userDisconnected) return;
        try {
          await withTimeout(this.open(), CONNECT_TIMEOUT_MS, 'Reconnect timed out.');
          if (this.userDisconnected) {
            this.device.gatt?.disconnect();
            return;
          }
          this.emit('log', `Reconnected after ${attempt + 1} attempt(s).`);
          this.setState('connected');
          return;
        } catch (err) {
          this.emit('log', `Reconnect attempt ${attempt + 1} failed: ${String(err)}`);
        }
      }
      this.emit('log', 'Giving up reconnecting. Connect the device again to continue.');
      this.setState('disconnected');
    } finally {
      this.reconnecting = false;
    }
  }
}
