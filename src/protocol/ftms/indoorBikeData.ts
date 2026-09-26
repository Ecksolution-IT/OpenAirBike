import { ByteReader, ByteWriter } from './bytes';

/**
 * Indoor Bike Data characteristic (0x2AD2), FTMS §4.9.
 *
 * Every field except the flags is optional. A field is `undefined` when the bike did not
 * send it, or when it sent the FTMS "Data Not Available" special value.
 * Field formats follow the Bluetooth GATT Specification Supplement.
 */
export interface IndoorBikeData {
  /** More Data flag (bit 0). When true, this notification is only part of a Data Record (FTMS §4.19). */
  moreData: boolean;
  /** km/h, resolution 0.01. */
  instantaneousSpeedKmh?: number;
  /** km/h, resolution 0.01. Average since the start of the bike's training session. */
  averageSpeedKmh?: number;
  /** 1/min, resolution 0.5. */
  instantaneousCadenceRpm?: number;
  /** 1/min, resolution 0.5. */
  averageCadenceRpm?: number;
  /** Meters since the start of the bike's training session. */
  totalDistanceM?: number;
  /** Unitless. */
  resistanceLevel?: number;
  /** Watts. */
  instantaneousPowerW?: number;
  /** Watts. */
  averagePowerW?: number;
  /** kcal since the start of the bike's training session. */
  totalEnergyKcal?: number;
  /** kcal. */
  energyPerHourKcal?: number;
  /** kcal. */
  energyPerMinuteKcal?: number;
  /** Beats per minute. */
  heartRateBpm?: number;
  /** Resolution 0.1. */
  metabolicEquivalent?: number;
  /** Seconds since the start of the bike's training session. */
  elapsedTimeS?: number;
  /** Seconds. */
  remainingTimeS?: number;
  /** True if the payload ended before all fields announced by the flags were read. */
  truncated?: boolean;
}

/** Flag bits of the Indoor Bike Data characteristic (FTMS Table 4.10). */
export const IndoorBikeDataFlag = {
  MoreData: 1 << 0,
  AverageSpeed: 1 << 1,
  InstantaneousCadence: 1 << 2,
  AverageCadence: 1 << 3,
  TotalDistance: 1 << 4,
  ResistanceLevel: 1 << 5,
  InstantaneousPower: 1 << 6,
  AveragePower: 1 << 7,
  ExpendedEnergy: 1 << 8,
  HeartRate: 1 << 9,
  MetabolicEquivalent: 1 << 10,
  ElapsedTime: 1 << 11,
  RemainingTime: 1 << 12,
} as const;

const NOT_AVAILABLE_U16 = 0xffff;
const NOT_AVAILABLE_U8 = 0xff;

/** Field layout in transmission order: [flag, byte size, reader]. */
type FieldSpec = readonly [flag: number, size: number, read: (r: ByteReader, out: IndoorBikeData) => void];

const FIELDS: readonly FieldSpec[] = [
  [IndoorBikeDataFlag.AverageSpeed, 2, (r, o) => (o.averageSpeedKmh = r.u16() / 100)],
  [IndoorBikeDataFlag.InstantaneousCadence, 2, (r, o) => (o.instantaneousCadenceRpm = r.u16() / 2)],
  [IndoorBikeDataFlag.AverageCadence, 2, (r, o) => (o.averageCadenceRpm = r.u16() / 2)],
  [IndoorBikeDataFlag.TotalDistance, 3, (r, o) => (o.totalDistanceM = r.u24())],
  [IndoorBikeDataFlag.ResistanceLevel, 2, (r, o) => (o.resistanceLevel = r.s16())],
  [IndoorBikeDataFlag.InstantaneousPower, 2, (r, o) => (o.instantaneousPowerW = r.s16())],
  [IndoorBikeDataFlag.AveragePower, 2, (r, o) => (o.averagePowerW = r.s16())],
  [
    IndoorBikeDataFlag.ExpendedEnergy,
    5,
    (r, o) => {
      const total = r.u16();
      const perHour = r.u16();
      const perMinute = r.u8();
      if (total !== NOT_AVAILABLE_U16) o.totalEnergyKcal = total;
      if (perHour !== NOT_AVAILABLE_U16) o.energyPerHourKcal = perHour;
      if (perMinute !== NOT_AVAILABLE_U8) o.energyPerMinuteKcal = perMinute;
    },
  ],
  [
    IndoorBikeDataFlag.HeartRate,
    1,
    (r, o) => {
      // 0 bpm is what consoles typically send when no heart rate source is attached.
      const bpm = r.u8();
      if (bpm > 0) o.heartRateBpm = bpm;
    },
  ],
  [IndoorBikeDataFlag.MetabolicEquivalent, 1, (r, o) => (o.metabolicEquivalent = r.u8() / 10)],
  [IndoorBikeDataFlag.ElapsedTime, 2, (r, o) => (o.elapsedTimeS = r.u16())],
  [IndoorBikeDataFlag.RemainingTime, 2, (r, o) => (o.remainingTimeS = r.u16())],
];

/**
 * Parses one Indoor Bike Data notification.
 *
 * Per FTMP §4.4.7 the parser ignores RFU flag bits and trailing unrecognized octets, and
 * tolerates "Data Not Available" values. A payload that is shorter than its flags announce
 * yields the fields that could be read and `truncated: true`.
 */
export function parseIndoorBikeData(value: DataView | ArrayBufferView | ArrayBuffer): IndoorBikeData {
  const r = new ByteReader(value);
  if (!r.has(2)) return { moreData: false, truncated: true };

  const flags = r.u16();
  const out: IndoorBikeData = { moreData: (flags & IndoorBikeDataFlag.MoreData) !== 0 };

  // Bit 0 is inverted: Instantaneous Speed is present when More Data is 0.
  if (!out.moreData) {
    if (!r.has(2)) return { ...out, truncated: true };
    out.instantaneousSpeedKmh = r.u16() / 100;
  }

  for (const [flag, size, read] of FIELDS) {
    if ((flags & flag) === 0) continue;
    if (!r.has(size)) return { ...out, truncated: true };
    read(r, out);
  }
  return out;
}

/** Encodes Indoor Bike Data. Used by the simulator and tests; mirrors {@link parseIndoorBikeData}. */
export function encodeIndoorBikeData(d: IndoorBikeData): Uint8Array {
  let flags = d.moreData ? IndoorBikeDataFlag.MoreData : 0;
  const has = (v: number | undefined) => v !== undefined;
  const hasEnergy = has(d.totalEnergyKcal) || has(d.energyPerHourKcal) || has(d.energyPerMinuteKcal);

  if (has(d.averageSpeedKmh)) flags |= IndoorBikeDataFlag.AverageSpeed;
  if (has(d.instantaneousCadenceRpm)) flags |= IndoorBikeDataFlag.InstantaneousCadence;
  if (has(d.averageCadenceRpm)) flags |= IndoorBikeDataFlag.AverageCadence;
  if (has(d.totalDistanceM)) flags |= IndoorBikeDataFlag.TotalDistance;
  if (has(d.resistanceLevel)) flags |= IndoorBikeDataFlag.ResistanceLevel;
  if (has(d.instantaneousPowerW)) flags |= IndoorBikeDataFlag.InstantaneousPower;
  if (has(d.averagePowerW)) flags |= IndoorBikeDataFlag.AveragePower;
  if (hasEnergy) flags |= IndoorBikeDataFlag.ExpendedEnergy;
  if (has(d.heartRateBpm)) flags |= IndoorBikeDataFlag.HeartRate;
  if (has(d.metabolicEquivalent)) flags |= IndoorBikeDataFlag.MetabolicEquivalent;
  if (has(d.elapsedTimeS)) flags |= IndoorBikeDataFlag.ElapsedTime;
  if (has(d.remainingTimeS)) flags |= IndoorBikeDataFlag.RemainingTime;

  const w = new ByteWriter().u16(flags);
  if (!d.moreData) w.u16(Math.round((d.instantaneousSpeedKmh ?? 0) * 100));
  if (has(d.averageSpeedKmh)) w.u16(Math.round(d.averageSpeedKmh! * 100));
  if (has(d.instantaneousCadenceRpm)) w.u16(Math.round(d.instantaneousCadenceRpm! * 2));
  if (has(d.averageCadenceRpm)) w.u16(Math.round(d.averageCadenceRpm! * 2));
  if (has(d.totalDistanceM)) w.u24(Math.round(d.totalDistanceM!));
  if (has(d.resistanceLevel)) w.s16(Math.round(d.resistanceLevel!));
  if (has(d.instantaneousPowerW)) w.s16(Math.round(d.instantaneousPowerW!));
  if (has(d.averagePowerW)) w.s16(Math.round(d.averagePowerW!));
  if (hasEnergy) {
    w.u16(d.totalEnergyKcal === undefined ? NOT_AVAILABLE_U16 : Math.round(d.totalEnergyKcal));
    w.u16(d.energyPerHourKcal === undefined ? NOT_AVAILABLE_U16 : Math.round(d.energyPerHourKcal));
    w.u8(d.energyPerMinuteKcal === undefined ? NOT_AVAILABLE_U8 : Math.round(d.energyPerMinuteKcal));
  }
  if (has(d.heartRateBpm)) w.u8(Math.round(d.heartRateBpm!));
  if (has(d.metabolicEquivalent)) w.u8(Math.round(d.metabolicEquivalent! * 10));
  if (has(d.elapsedTimeS)) w.u16(Math.round(d.elapsedTimeS!));
  if (has(d.remainingTimeS)) w.u16(Math.round(d.remainingTimeS!));
  return w.toUint8Array();
}
