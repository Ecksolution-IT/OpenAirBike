import { parseFitnessMachineFeature, type FitnessMachineFeature } from '../../src/protocol/ftms/machineInfo';
import {
  BATTERY_SERVICE,
  DEVICE_INFORMATION_SERVICE,
  DeviceInformationCharacteristic,
  FTMS_SERVICE,
  FtmsCharacteristic,
  HEART_RATE_SERVICE,
  uuidName,
} from '../../src/protocol/ftms/uuids';
import type { GattLink, GattServiceInventory } from '../../src/transport/types';

const CYCLING_SPEED_AND_CADENCE_SERVICE = 0x1816;
const CYCLING_POWER_SERVICE = 0x1818;

/**
 * Services the page asks permission for. Web Bluetooth only reveals services named in the
 * chooser request, so anything else the bike exposes (e.g. vendor services) stays invisible.
 */
export const PROBE_SERVICES = [
  FTMS_SERVICE,
  DEVICE_INFORMATION_SERVICE,
  HEART_RATE_SERVICE,
  BATTERY_SERVICE,
  CYCLING_POWER_SERVICE,
  CYCLING_SPEED_AND_CADENCE_SERVICE,
];

/** FTMS characteristics subscribed to, in FTMP order. Only Indoor Bike Data is essential. */
export const PROBE_SUBSCRIPTIONS = [
  FtmsCharacteristic.IndoorBikeData,
  FtmsCharacteristic.TrainingStatus,
  FtmsCharacteristic.FitnessMachineStatus,
];

/** Device Information strings read for identification. The serial number is skipped on purpose (privacy). */
const DEVICE_INFORMATION: [keyof DeviceInformation, number][] = [
  ['manufacturer', DeviceInformationCharacteristic.ManufacturerName],
  ['model', DeviceInformationCharacteristic.ModelNumber],
  ['hardware', DeviceInformationCharacteristic.HardwareRevision],
  ['firmware', DeviceInformationCharacteristic.FirmwareRevision],
  ['software', DeviceInformationCharacteristic.SoftwareRevision],
];

export interface DeviceInformation {
  manufacturer?: string;
  model?: string;
  hardware?: string;
  firmware?: string;
  software?: string;
}

export interface ProbeReport {
  inventory: GattServiceInventory[];
  deviceInformation: DeviceInformation;
  /** 16-bit UUIDs of the FTMS characteristics; empty when the service is missing. */
  ftmsCharacteristics: number[];
  features?: FitnessMachineFeature;
  subscribed: number[];
  /** Everything that did not work as a standard FTMS indoor bike would; never thrown. */
  problems: string[];
}

/** Where the probe reports what it did, for the log and the capture file. */
export interface ProbeSink {
  log(line: string): void;
  read(service: number, characteristic: number, value: DataView): void;
}

/**
 * Runs the FTMP collector setup against any GATT link: inventory, Device Information, Fitness
 * Machine Feature, subscriptions. It reports problems instead of throwing, so the connection
 * stays open and whatever the device does expose can still be inspected.
 */
export async function probeDevice(link: GattLink, sink: ProbeSink): Promise<ProbeReport> {
  const report: ProbeReport = { inventory: [], deviceInformation: {}, ftmsCharacteristics: [], subscribed: [], problems: [] };
  const problem = (text: string) => {
    report.problems.push(text);
    sink.log(`Problem: ${text}`);
  };

  try {
    report.inventory = await link.inventory();
    sink.log(`GATT: ${report.inventory.length} accessible service(s)`);
  } catch (err) {
    problem(`Service discovery failed: ${String(err)}`);
  }

  if (await link.characteristics(DEVICE_INFORMATION_SERVICE)) {
    for (const [key, uuid] of DEVICE_INFORMATION) {
      try {
        const value = await link.read(DEVICE_INFORMATION_SERVICE, uuid);
        sink.read(DEVICE_INFORMATION_SERVICE, uuid, value);
        report.deviceInformation[key] = new TextDecoder().decode(value).replace(/\0+$/, '').trim();
      } catch {
        // Optional characteristic; absent on many devices.
      }
    }
  }

  const chars = await link.characteristics(FTMS_SERVICE);
  if (!chars) {
    problem('Fitness Machine Service (0x1826) not found');
    return report;
  }
  report.ftmsCharacteristics = chars.map((c) => c.uuid);
  sink.log(`FTMS characteristics: ${chars.map((c) => uuidName(c.uuid)).join(', ') || 'none'}`);

  const feature = chars.find((c) => c.uuid === FtmsCharacteristic.FitnessMachineFeature);
  if (!feature) {
    problem('Fitness Machine Feature (0x2ACC) missing (mandatory, FTMS §4.3)');
  } else {
    try {
      const value = await link.read(FTMS_SERVICE, feature.uuid);
      sink.read(FTMS_SERVICE, feature.uuid, value);
      report.features = parseFitnessMachineFeature(value);
      sink.log(`Features: ${report.features.machineFeatures.join(', ') || 'none'}`);
      if (value.byteLength !== 8) problem(`Fitness Machine Feature has ${value.byteLength} bytes, expected 8`);
    } catch (err) {
      problem(`Reading Fitness Machine Feature failed: ${String(err)}`);
    }
    if (feature.indicate) {
      try {
        await link.subscribe(FTMS_SERVICE, feature.uuid);
        report.subscribed.push(feature.uuid);
      } catch (err) {
        problem(`Feature indications failed: ${String(err)}`);
      }
    }
  }

  if (!report.ftmsCharacteristics.includes(FtmsCharacteristic.IndoorBikeData)) {
    problem('Indoor Bike Data (0x2AD2) missing');
  }
  for (const uuid of PROBE_SUBSCRIPTIONS) {
    if (!report.ftmsCharacteristics.includes(uuid)) continue;
    try {
      await link.subscribe(FTMS_SERVICE, uuid);
      report.subscribed.push(uuid);
      sink.log(`Subscribed to ${uuidName(uuid)}`);
    } catch (err) {
      problem(`Subscribing to ${uuidName(uuid)} failed: ${String(err)}`);
    }
  }
  return report;
}
