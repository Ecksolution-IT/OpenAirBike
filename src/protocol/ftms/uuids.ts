import { shortUuid } from '../../util/bleUuid';

/**
 * Bluetooth SIG assigned numbers used by OpenAirBike.
 *
 * FTMS = Fitness Machine Service (FTMS v1.0.1), FTMP = Fitness Machine Profile.
 */

export const FTMS_SERVICE = 0x1826;
export const DEVICE_INFORMATION_SERVICE = 0x180a;
export const HEART_RATE_SERVICE = 0x180d;
export const BATTERY_SERVICE = 0x180f;

/** Characteristics exposed by the Fitness Machine Service (FTMS §4, Table 4.1). */
export const FtmsCharacteristic = {
  FitnessMachineFeature: 0x2acc,
  TreadmillData: 0x2acd,
  CrossTrainerData: 0x2ace,
  StepClimberData: 0x2acf,
  StairClimberData: 0x2ad0,
  RowerData: 0x2ad1,
  IndoorBikeData: 0x2ad2,
  TrainingStatus: 0x2ad3,
  SupportedSpeedRange: 0x2ad4,
  SupportedInclinationRange: 0x2ad5,
  SupportedResistanceLevelRange: 0x2ad6,
  SupportedHeartRateRange: 0x2ad7,
  SupportedPowerRange: 0x2ad8,
  FitnessMachineControlPoint: 0x2ad9,
  FitnessMachineStatus: 0x2ada,
} as const;

/** Device Information Service characteristics that are useful for identifying a bike. */
export const DeviceInformationCharacteristic = {
  ModelNumber: 0x2a24,
  SerialNumber: 0x2a25,
  FirmwareRevision: 0x2a26,
  HardwareRevision: 0x2a27,
  SoftwareRevision: 0x2a28,
  ManufacturerName: 0x2a29,
} as const;

const NAMES: Record<number, string> = {
  [FTMS_SERVICE]: 'Fitness Machine',
  [DEVICE_INFORMATION_SERVICE]: 'Device Information',
  [HEART_RATE_SERVICE]: 'Heart Rate',
  [BATTERY_SERVICE]: 'Battery',
  [FtmsCharacteristic.FitnessMachineFeature]: 'Fitness Machine Feature',
  [FtmsCharacteristic.TreadmillData]: 'Treadmill Data',
  [FtmsCharacteristic.CrossTrainerData]: 'Cross Trainer Data',
  [FtmsCharacteristic.StepClimberData]: 'Step Climber Data',
  [FtmsCharacteristic.StairClimberData]: 'Stair Climber Data',
  [FtmsCharacteristic.RowerData]: 'Rower Data',
  [FtmsCharacteristic.IndoorBikeData]: 'Indoor Bike Data',
  [FtmsCharacteristic.TrainingStatus]: 'Training Status',
  [FtmsCharacteristic.SupportedSpeedRange]: 'Supported Speed Range',
  [FtmsCharacteristic.SupportedInclinationRange]: 'Supported Inclination Range',
  [FtmsCharacteristic.SupportedResistanceLevelRange]: 'Supported Resistance Level Range',
  [FtmsCharacteristic.SupportedHeartRateRange]: 'Supported Heart Rate Range',
  [FtmsCharacteristic.SupportedPowerRange]: 'Supported Power Range',
  [FtmsCharacteristic.FitnessMachineControlPoint]: 'Fitness Machine Control Point',
  [FtmsCharacteristic.FitnessMachineStatus]: 'Fitness Machine Status',
  [DeviceInformationCharacteristic.ModelNumber]: 'Model Number',
  [DeviceInformationCharacteristic.SerialNumber]: 'Serial Number',
  [DeviceInformationCharacteristic.FirmwareRevision]: 'Firmware Revision',
  [DeviceInformationCharacteristic.HardwareRevision]: 'Hardware Revision',
  [DeviceInformationCharacteristic.SoftwareRevision]: 'Software Revision',
  [DeviceInformationCharacteristic.ManufacturerName]: 'Manufacturer Name',
};

/** Human-readable name for a service or characteristic UUID. */
export function uuidName(uuid: string | number): string {
  const short = typeof uuid === 'number' ? uuid : shortUuid(uuid);
  if (short !== undefined && NAMES[short]) return NAMES[short];
  if (short !== undefined) return `0x${short.toString(16).padStart(4, '0')}`;
  return String(uuid);
}
