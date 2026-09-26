import { ConformanceMonitor } from '../../protocol/ftms/conformance';
import { DataRecordAssembler } from '../../protocol/ftms/dataRecord';
import { parseIndoorBikeData } from '../../protocol/ftms/indoorBikeData';
import {
  MachineStatusOpCode,
  parseFitnessMachineFeature,
  parseMachineStatus,
  parseTrainingStatus,
  type FitnessMachineFeature,
} from '../../protocol/ftms/machineInfo';
import {
  BATTERY_SERVICE,
  DEVICE_INFORMATION_SERVICE,
  DeviceInformationCharacteristic,
  FTMS_SERVICE,
  FtmsCharacteristic,
  HEART_RATE_SERVICE,
  uuidName,
} from '../../protocol/ftms/uuids';
import type { ConnectionState, DeviceFilter, GattLink, GattNotification, Transport } from '../../transport/types';
import { PROFILES, resolveProfile } from '../profiles';
import { DeviceAdapter, type DeviceEvent, type DeviceInfo } from '../types';
import { capabilitiesFromFeatures, toCanonical } from './canonical';

/** Characteristics subscribed to, in order (FTMP §4.4). Only Indoor Bike Data is required. */
const SUBSCRIPTIONS = [
  FtmsCharacteristic.IndoorBikeData,
  FtmsCharacteristic.TrainingStatus,
  FtmsCharacteristic.FitnessMachineStatus,
];

/** Chooser filter: devices advertising FTMS, plus the name prefixes of all known profiles. */
export function ftmsIndoorBikeFilter(): DeviceFilter {
  return {
    services: [FTMS_SERVICE],
    namePrefixes: [...new Set(PROFILES.flatMap((p) => p.namePrefixes))],
    optionalServices: [DEVICE_INFORMATION_SERVICE, HEART_RATE_SERVICE, BATTERY_SERVICE],
  };
}

interface DeviceInformation {
  manufacturer?: string;
  model?: string;
  firmware?: string;
  hardware?: string;
  software?: string;
}

/** Device Adapter for FTMS indoor bikes (FTMP collector role) over any Transport. */
export class FtmsIndoorBikeAdapter extends DeviceAdapter {
  private readonly assembler = new DataRecordAssembler();
  private readonly conformance = new ConformanceMonitor();
  private _info: DeviceInfo | undefined;
  private deviceInformation: DeviceInformation | undefined;
  private characteristicIds: number[] = [];

  constructor(
    private readonly transport: Transport,
    private readonly options: { simulated?: boolean } = {},
  ) {
    super();
    transport.on('notification', (n) => this.onNotification(n));
    transport.on('log', (line) => this.emit('log', line));
    transport.on('state', (state) => {
      // A partially received Data Record must be discarded after link loss (FTMS §4.18).
      if (state !== 'connected') this.assembler.reset();
      if (state === 'reconnecting') this.conformance.onLinkLoss();
      this.emit('state', state);
    });
  }

  get state(): ConnectionState {
    return this.transport.state;
  }

  get info(): DeviceInfo | undefined {
    return this._info;
  }

  connect(): Promise<void> {
    this.conformance.reset();
    return this.transport.connect((link) => this.setup(link));
  }

  disconnect(): Promise<void> {
    return this.transport.disconnect();
  }

  diagnostics() {
    return this.conformance.report();
  }

  /** Discovery and subscriptions (FTMP §4.2–4.4); runs after every (re)connect. */
  private async setup(link: GattLink): Promise<void> {
    const chars = await link.characteristics(FTMS_SERVICE);
    if (!chars) throw new Error('This device does not expose the Bluetooth Fitness Machine Service (FTMS).');
    const ids = chars.map((c) => c.uuid);
    const names = ids.map((id) => uuidName(id));
    this.emit('log', `FTMS characteristics: ${names.join(', ') || 'none'}`);
    const has = (uuid: number) => ids.includes(uuid);

    let features: FitnessMachineFeature | undefined;
    const feature = chars.find((c) => c.uuid === FtmsCharacteristic.FitnessMachineFeature);
    if (feature) {
      try {
        features = parseFitnessMachineFeature(await link.read(FTMS_SERVICE, feature.uuid));
        this.emit('log', `Features: ${features.machineFeatures.join(', ') || 'none'}`);
      } catch (err) {
        this.emit('log', `Could not read Fitness Machine Feature: ${String(err)}`);
      }
      // FTMS 1.0.1 servers indicate the characteristic when their features change (ICS FTMS 4/44).
      if (feature.indicate) {
        await link.subscribe(FTMS_SERVICE, feature.uuid).catch((err) => this.emit('log', `Feature indications unavailable: ${String(err)}`));
      }
    }

    if (!has(FtmsCharacteristic.IndoorBikeData)) {
      throw new Error(`The device does not expose Indoor Bike Data. Found: ${names.join(', ') || 'nothing'}.`);
    }
    for (const uuid of SUBSCRIPTIONS) {
      if (!has(uuid)) continue;
      try {
        await link.subscribe(FTMS_SERVICE, uuid);
        this.emit('log', `Subscribed to ${uuidName(uuid)}`);
      } catch (err) {
        if (uuid === FtmsCharacteristic.IndoorBikeData) throw err;
        this.emit('log', `Could not subscribe to ${uuidName(uuid)}: ${String(err)}`);
      }
    }

    this.deviceInformation ??= await readDeviceInformation(link);
    this.characteristicIds = ids;
    this.setInfo(features);
  }

  private setInfo(features: FitnessMachineFeature | undefined) {
    const characteristicIds = this.characteristicIds;
    const name = this.transport.deviceName ?? 'Unknown device';
    const profile = resolveProfile({ name, ...this.deviceInformation });
    this._info = {
      id: this.transport.deviceId,
      name,
      profileId: profile.id,
      profileName: profile.displayName,
      ...this.deviceInformation,
      capabilities: features && capabilitiesFromFeatures(features),
      simulated: this.options.simulated,
      protocol: {
        protocol: 'FTMS',
        characteristics: characteristicIds.map((id) => uuidName(id)),
        characteristicIds,
        features,
      },
    };
    this.conformance.setDevice({ characteristicIds, features });
    this.emit('info', this._info);
  }

  private onNotification(n: GattNotification) {
    if (n.service !== FTMS_SERVICE) return;
    switch (n.characteristic) {
      case FtmsCharacteristic.IndoorBikeData: {
        this.conformance.onIndoorBikeData(n.value);
        const record = this.assembler.push(parseIndoorBikeData(n.value));
        if (record) this.emit('sample', toCanonical(record, n.receivedAt));
        return;
      }
      case FtmsCharacteristic.TrainingStatus: {
        const s = parseTrainingStatus(n.value);
        this.emit('log', `Training status: ${s.name}${s.text ? ` (${s.text})` : ''}`);
        return;
      }
      case FtmsCharacteristic.FitnessMachineStatus: {
        const s = parseMachineStatus(n.value);
        this.emit('deviceEvent', machineStatusEvent(s.opCode, s.stopOrPause, s.name));
        return;
      }
      case FtmsCharacteristic.FitnessMachineFeature: {
        if (!this._info) return;
        const features = parseFitnessMachineFeature(n.value);
        this.emit('log', `Features changed: ${features.machineFeatures.join(', ') || 'none'}`);
        this.setInfo(features);
        return;
      }
    }
  }
}

function machineStatusEvent(opCode: number, stopOrPause: 'stop' | 'pause' | undefined, label: string): DeviceEvent {
  switch (opCode) {
    case MachineStatusOpCode.StartedOrResumedByUser:
      return { kind: 'started', label };
    case MachineStatusOpCode.StoppedOrPausedByUser:
      return { kind: stopOrPause === 'pause' ? 'paused' : 'stopped', label };
    case MachineStatusOpCode.Reset:
      return { kind: 'reset', label };
    default:
      return { kind: 'other', label };
  }
}

/** Device Information Service (optional): identifies model and firmware for profiles. */
async function readDeviceInformation(link: GattLink): Promise<DeviceInformation> {
  const info: DeviceInformation = {};
  if (!(await link.characteristics(DEVICE_INFORMATION_SERVICE))) return info;
  const fields: [keyof DeviceInformation, number][] = [
    ['manufacturer', DeviceInformationCharacteristic.ManufacturerName],
    ['model', DeviceInformationCharacteristic.ModelNumber],
    ['firmware', DeviceInformationCharacteristic.FirmwareRevision],
    ['hardware', DeviceInformationCharacteristic.HardwareRevision],
    ['software', DeviceInformationCharacteristic.SoftwareRevision],
  ];
  for (const [key, uuid] of fields) {
    try {
      info[key] = new TextDecoder().decode(await link.read(DEVICE_INFORMATION_SERVICE, uuid)).replace(/\0+$/, '').trim();
    } catch {
      // Not every characteristic is present; ignore the missing ones.
    }
  }
  return info;
}
