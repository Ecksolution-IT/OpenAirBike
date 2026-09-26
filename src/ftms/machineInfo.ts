import { ByteReader } from './bytes';

/** Fitness Machine Features field bits (FTMS Table 4.3). */
const MACHINE_FEATURES = [
  'Average Speed',
  'Cadence',
  'Total Distance',
  'Inclination',
  'Elevation Gain',
  'Pace',
  'Step Count',
  'Resistance Level',
  'Stride Count',
  'Expended Energy',
  'Heart Rate Measurement',
  'Metabolic Equivalent',
  'Elapsed Time',
  'Remaining Time',
  'Power Measurement',
  'Force on Belt and Power Output',
  'User Data Retention',
] as const;

/** Target Setting Features field bits (FTMS Table 4.4). */
const TARGET_SETTING_FEATURES = [
  'Speed Target Setting',
  'Inclination Target Setting',
  'Resistance Target Setting',
  'Power Target Setting',
  'Heart Rate Target Setting',
  'Targeted Expended Energy Configuration',
  'Targeted Step Number Configuration',
  'Targeted Stride Number Configuration',
  'Targeted Distance Configuration',
  'Targeted Training Time Configuration',
  'Targeted Time in Two Heart Rate Zones Configuration',
  'Targeted Time in Three Heart Rate Zones Configuration',
  'Targeted Time in Five Heart Rate Zones Configuration',
  'Indoor Bike Simulation Parameters',
  'Wheel Circumference Configuration',
  'Spin Down Control',
  'Targeted Cadence Configuration',
] as const;

export type MachineFeature = (typeof MACHINE_FEATURES)[number];
export type TargetSettingFeature = (typeof TARGET_SETTING_FEATURES)[number];

export interface FitnessMachineFeature {
  machineFeatures: MachineFeature[];
  targetSettingFeatures: TargetSettingFeature[];
  rawMachineFeatures: number;
  rawTargetSettingFeatures: number;
}

function bitsToNames<T extends string>(bits: number, names: readonly T[]): T[] {
  return names.filter((_, i) => (bits >>> i) & 1);
}

/** Fitness Machine Feature characteristic (0x2ACC), FTMS §4.3. */
export function parseFitnessMachineFeature(value: DataView | ArrayBufferView | ArrayBuffer): FitnessMachineFeature {
  const r = new ByteReader(value);
  const rawMachineFeatures = r.has(4) ? r.u32() : 0;
  const rawTargetSettingFeatures = r.has(4) ? r.u32() : 0;
  return {
    machineFeatures: bitsToNames(rawMachineFeatures, MACHINE_FEATURES),
    targetSettingFeatures: bitsToNames(rawTargetSettingFeatures, TARGET_SETTING_FEATURES),
    rawMachineFeatures,
    rawTargetSettingFeatures,
  };
}

/** Training Status values (FTMS Table 4.13). */
const TRAINING_STATUS: Record<number, string> = {
  0x00: 'Other',
  0x01: 'Idle',
  0x02: 'Warming Up',
  0x03: 'Low Intensity Interval',
  0x04: 'High Intensity Interval',
  0x05: 'Recovery Interval',
  0x06: 'Isometric',
  0x07: 'Heart Rate Control',
  0x08: 'Fitness Test',
  0x09: 'Speed Outside of Control Region - Low',
  0x0a: 'Speed Outside of Control Region - High',
  0x0b: 'Cool Down',
  0x0c: 'Watt Control',
  0x0d: 'Manual Mode (Quick Start)',
  0x0e: 'Pre-Workout',
  0x0f: 'Post-Workout',
};

export interface TrainingStatus {
  status: number;
  name: string;
  text?: string;
  /** The string continues beyond this notification and can be read with GATT Read Long. */
  extendedString: boolean;
}

/** Training Status characteristic (0x2AD3), FTMS §4.10. */
export function parseTrainingStatus(value: DataView | ArrayBufferView | ArrayBuffer): TrainingStatus {
  const r = new ByteReader(value);
  const flags = r.has(1) ? r.u8() : 0;
  const status = r.has(1) ? r.u8() : 0;
  const result: TrainingStatus = {
    status,
    name: TRAINING_STATUS[status] ?? `Reserved (0x${status.toString(16)})`,
    extendedString: (flags & 0b10) !== 0,
  };
  if (flags & 0b01 && r.remaining > 0) result.text = r.utf8();
  return result;
}

/** Fitness Machine Status op codes (FTMS Table 4.26) that OpenAirBike reacts to or logs. */
export const MachineStatusOpCode = {
  Reset: 0x01,
  StoppedOrPausedByUser: 0x02,
  StoppedBySafetyKey: 0x03,
  StartedOrResumedByUser: 0x04,
  ControlPermissionLost: 0xff,
} as const;

const MACHINE_STATUS: Record<number, string> = {
  0x01: 'Reset',
  0x02: 'Stopped or Paused by the User',
  0x03: 'Stopped by Safety Key',
  0x04: 'Started or Resumed by the User',
  0x05: 'Target Speed Changed',
  0x06: 'Target Incline Changed',
  0x07: 'Target Resistance Level Changed',
  0x08: 'Target Power Changed',
  0x09: 'Target Heart Rate Changed',
  0x0a: 'Targeted Expended Energy Changed',
  0x0b: 'Targeted Number of Steps Changed',
  0x0c: 'Targeted Number of Strides Changed',
  0x0d: 'Targeted Distance Changed',
  0x0e: 'Targeted Training Time Changed',
  0x0f: 'Targeted Time in Two Heart Rate Zones Changed',
  0x10: 'Targeted Time in Three Heart Rate Zones Changed',
  0x11: 'Targeted Time in Five Heart Rate Zones Changed',
  0x12: 'Indoor Bike Simulation Parameters Changed',
  0x13: 'Wheel Circumference Changed',
  0x14: 'Spin Down Status',
  0x15: 'Targeted Cadence Changed',
  0xff: 'Control Permission Lost',
};

export interface MachineStatus {
  opCode: number;
  name: string;
  /** For op code 0x02: whether the bike was stopped (0x01) or paused (0x02), FTMS Table 4.16. */
  stopOrPause?: 'stop' | 'pause';
  /** Parameter bytes, if any, for op codes OpenAirBike does not interpret. */
  parameter: Uint8Array;
}

/** Fitness Machine Status characteristic (0x2ADA), FTMS §4.17. */
export function parseMachineStatus(value: DataView | ArrayBufferView | ArrayBuffer): MachineStatus {
  const r = new ByteReader(value);
  const opCode = r.has(1) ? r.u8() : 0;
  const rest = new Uint8Array(r.remaining);
  for (let i = 0; i < rest.length; i++) rest[i] = r.u8();
  const result: MachineStatus = {
    opCode,
    name: MACHINE_STATUS[opCode] ?? `Reserved (0x${opCode.toString(16)})`,
    parameter: rest,
  };
  if (opCode === MachineStatusOpCode.StoppedOrPausedByUser && rest.length > 0) {
    if (rest[0] === 0x01) result.stopOrPause = 'stop';
    if (rest[0] === 0x02) result.stopOrPause = 'pause';
  }
  return result;
}
