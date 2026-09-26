import {
  DEVICE_INFORMATION_SERVICE,
  DeviceInformationCharacteristic,
  FTMS_SERVICE,
  FtmsCharacteristic,
  HEART_RATE_SERVICE,
  BATTERY_SERVICE,
  shortUuid,
  uuid16,
  uuidName,
} from '../ftms/uuids';
import { parseFitnessMachineFeature } from '../ftms/machineInfo';
import { BikeConnection, type BikeInfo, type ConnectionState } from './types';

/** Name prefixes to offer in the chooser even if the bike does not advertise the FTMS UUID. */
const NAME_PREFIXES = ['Echo', 'ECHO', 'Rogue', 'ROGUE'];

/** Characteristics OpenAirBike subscribes to, in order. Only Indoor Bike Data is required. */
const SUBSCRIPTIONS = [
  FtmsCharacteristic.IndoorBikeData,
  FtmsCharacteristic.TrainingStatus,
  FtmsCharacteristic.FitnessMachineStatus,
];

const CONNECT_TIMEOUT_MS = 20_000;
const RECONNECT_DELAYS_MS = [1_000, 2_000, 4_000, 8_000, 15_000, 30_000, 30_000, 30_000];

export function isWebBluetoothAvailable(): boolean {
  return typeof navigator !== 'undefined' && 'bluetooth' in navigator;
}

/** Opens the browser's device chooser. Must be called from a user gesture (click). */
export async function requestBike(): Promise<BluetoothDevice> {
  return navigator.bluetooth.requestDevice({
    filters: [{ services: [uuid16(FTMS_SERVICE)] }, ...NAME_PREFIXES.map((namePrefix) => ({ namePrefix }))],
    optionalServices: [FTMS_SERVICE, DEVICE_INFORMATION_SERVICE, HEART_RATE_SERVICE, BATTERY_SERVICE].map(uuid16),
  });
}

/**
 * Looks up a bike the user has already granted access to, so it can be reconnected
 * without the chooser. Returns undefined where the browser lacks `getDevices()`.
 */
export async function findPermittedBike(id: string): Promise<BluetoothDevice | undefined> {
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

/** Device Layer implementation for a real FTMS bike over Web Bluetooth. */
export class WebBluetoothBike extends BikeConnection {
  private _state: ConnectionState = 'disconnected';
  private _info: BikeInfo | undefined;
  private userDisconnected = false;
  private reconnecting = false;

  constructor(private readonly device: BluetoothDevice) {
    super();
    device.addEventListener('gattserverdisconnected', () => void this.onDisconnected());
  }

  get state(): ConnectionState {
    return this._state;
  }

  get info(): BikeInfo | undefined {
    return this._info;
  }

  async connect(): Promise<void> {
    this.userDisconnected = false;
    this.setState('connecting');
    try {
      await withTimeout(this.setup(), CONNECT_TIMEOUT_MS, 'Timed out while connecting to the bike.');
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

  /** GATT connection, FTMS discovery (FTMP §4.2–4.3) and notification setup. */
  private async setup(): Promise<void> {
    const gatt = this.device.gatt;
    if (!gatt) throw new Error('This device does not support GATT.');
    this.emit('log', `Connecting to ${this.device.name ?? 'bike'}…`);
    const server = await gatt.connect();

    let service: BluetoothRemoteGATTService;
    try {
      service = await server.getPrimaryService(uuid16(FTMS_SERVICE));
    } catch {
      throw new Error('This device does not expose the Bluetooth Fitness Machine Service (FTMS).');
    }

    const characteristics = new Map<number, BluetoothRemoteGATTCharacteristic>();
    for (const c of await service.getCharacteristics()) {
      const short = shortUuid(c.uuid);
      if (short !== undefined) characteristics.set(short, c);
    }
    const names = [...characteristics.keys()].map((k) => uuidName(k));
    this.emit('log', `FTMS characteristics: ${names.join(', ') || 'none'}`);

    const info: BikeInfo = {
      ...this._info,
      id: this.device.id,
      name: this.device.name ?? 'Unknown bike',
      characteristics: names,
    };

    const feature = characteristics.get(FtmsCharacteristic.FitnessMachineFeature);
    if (feature) {
      try {
        info.features = parseFitnessMachineFeature(await feature.readValue());
        this.emit('log', `Features: ${info.features.machineFeatures.join(', ') || 'none'}`);
      } catch (err) {
        this.emit('log', `Could not read Fitness Machine Feature: ${String(err)}`);
      }
    }

    if (!characteristics.has(FtmsCharacteristic.IndoorBikeData)) {
      throw new Error(`The bike does not expose Indoor Bike Data. Found: ${names.join(', ') || 'nothing'}.`);
    }

    for (const uuid of SUBSCRIPTIONS) {
      const c = characteristics.get(uuid);
      if (!c) continue;
      c.addEventListener('characteristicvaluechanged', this.onValue);
      try {
        await c.startNotifications();
        this.emit('log', `Subscribed to ${uuidName(uuid)}`);
      } catch (err) {
        if (uuid === FtmsCharacteristic.IndoorBikeData) throw err;
        this.emit('log', `Could not subscribe to ${uuidName(uuid)}: ${String(err)}`);
      }
    }

    if (!this._info) await this.readDeviceInformation(server, info);
    this._info = info;
    this.emit('info', info);
  }

  private async readDeviceInformation(server: BluetoothRemoteGATTServer, info: BikeInfo) {
    let service: BluetoothRemoteGATTService;
    try {
      service = await server.getPrimaryService(uuid16(DEVICE_INFORMATION_SERVICE));
    } catch {
      return; // Device Information Service is optional.
    }
    const fields: [keyof BikeInfo, number][] = [
      ['manufacturer', DeviceInformationCharacteristic.ManufacturerName],
      ['model', DeviceInformationCharacteristic.ModelNumber],
      ['firmware', DeviceInformationCharacteristic.FirmwareRevision],
      ['hardware', DeviceInformationCharacteristic.HardwareRevision],
      ['software', DeviceInformationCharacteristic.SoftwareRevision],
    ];
    for (const [key, uuid] of fields) {
      try {
        const value = await (await service.getCharacteristic(uuid16(uuid))).readValue();
        (info as unknown as Record<string, string>)[key] = new TextDecoder().decode(value).replace(/\0+$/, '').trim();
      } catch {
        // Not every characteristic is present; ignore the missing ones.
      }
    }
  }

  // Same function reference on every (re)subscription, so the listener is never added twice.
  private readonly onValue = (event: Event) => {
    const c = event.target as BluetoothRemoteGATTCharacteristic;
    const short = shortUuid(c.uuid);
    if (!c.value || short === undefined) return;
    // Copy: the browser may reuse the underlying buffer for the next notification.
    const copy = c.value.buffer.slice(c.value.byteOffset, c.value.byteOffset + c.value.byteLength);
    this.emit('notification', { characteristic: short, value: new DataView(copy), receivedAt: Date.now() });
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
          await withTimeout(this.setup(), CONNECT_TIMEOUT_MS, 'Reconnect timed out.');
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
      this.emit('log', 'Giving up reconnecting. Connect the bike again to continue.');
      this.setState('disconnected');
    } finally {
      this.reconnecting = false;
    }
  }
}
