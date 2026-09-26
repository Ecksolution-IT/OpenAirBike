import { ByteReader } from './bytes';
import { IndoorBikeDataFlag, parseIndoorBikeData } from './indoorBikeData';
import type { FitnessMachineFeature } from './machineInfo';
import { FtmsCharacteristic } from './uuids';

/**
 * Passive conformance checks of a connected bike (the FTMS *server*), derived from the
 * Bluetooth SIG FTMS Test Suite (FTMS.TS.p6, Indoor Bike Data test cases) and the FTMS ICS
 * (FTMS.ICS.p5, conditional requirements).
 *
 * The SIG tests drive the server with a lower tester; OpenAirBike can only observe what the
 * bike sends during normal use. The results therefore say "consistent with the test case so
 * far", not "passes qualification". Their purpose is to explain odd telemetry from a bike
 * (e.g. a field sent without its feature bit) and to make packet captures self-describing.
 */

export type CheckStatus = 'pass' | 'fail' | 'warn' | 'untested';

export interface ConformanceCheck {
  /** Test case (TS) or ICS item the check is derived from. */
  id: string;
  title: string;
  status: CheckStatus;
  detail: string;
}

export interface MonitoredDevice {
  characteristicIds: number[];
  features?: FitnessMachineFeature;
}

/** Flags bits 13–15 of Indoor Bike Data are Reserved for Future Use (FTMS Table 4.10). */
const INDOOR_BIKE_RFU_FLAGS = 0xe000;
/** Fitness Machine Features bits 17–31 and Target Setting Features bits 17–31 are RFU. */
const FEATURE_RFU_BITS = 0xfffe0000;

/** Records seen before a supported-but-absent field is reported. */
const RECORDS_BEFORE_ABSENT_WARNING = 10;
/** Consecutive More Data notifications before a Data Record is considered unterminated. */
const MAX_PARTS_PER_RECORD = 8;

/** FTMS.TS.p6 Table 4.11 plus CN/BV-65-C: Indoor Bike Data field ↔ Fitness Machine Feature bit. */
const FIELD_TESTS = [
  { id: 'FTMS/SR/CN/BV-56-C', title: 'Average Speed', flags: IndoorBikeDataFlag.AverageSpeed, featureBit: 0, feature: 'Average Speed Supported' },
  {
    id: 'FTMS/SR/CN/BV-57-C',
    title: 'Cadence',
    flags: IndoorBikeDataFlag.InstantaneousCadence | IndoorBikeDataFlag.AverageCadence,
    featureBit: 1,
    feature: 'Cadence Supported',
  },
  { id: 'FTMS/SR/CN/BV-58-C', title: 'Total Distance', flags: IndoorBikeDataFlag.TotalDistance, featureBit: 2, feature: 'Total Distance Supported' },
  { id: 'FTMS/SR/CN/BV-59-C', title: 'Resistance Level', flags: IndoorBikeDataFlag.ResistanceLevel, featureBit: 7, feature: 'Resistance Level Supported' },
  {
    id: 'FTMS/SR/CN/BV-60-C',
    title: 'Power',
    flags: IndoorBikeDataFlag.InstantaneousPower | IndoorBikeDataFlag.AveragePower,
    featureBit: 14,
    feature: 'Power Measurement Supported',
  },
  { id: 'FTMS/SR/CN/BV-61-C', title: 'Expended Energy', flags: IndoorBikeDataFlag.ExpendedEnergy, featureBit: 9, feature: 'Expended Energy Supported' },
  { id: 'FTMS/SR/CN/BV-62-C', title: 'Heart Rate', flags: IndoorBikeDataFlag.HeartRate, featureBit: 10, feature: 'Heart Rate Measurement Supported' },
  {
    id: 'FTMS/SR/CN/BV-63-C',
    title: 'Metabolic Equivalent',
    flags: IndoorBikeDataFlag.MetabolicEquivalent,
    featureBit: 11,
    feature: 'Metabolic Equivalent Supported',
  },
  { id: 'FTMS/SR/CN/BV-64-C', title: 'Remaining Time', flags: IndoorBikeDataFlag.RemainingTime, featureBit: 13, feature: 'Remaining Time Supported' },
] as const;

/** FTMS.ICS.p5 Table 4 C.1–C.5: a target setting feature requires its Supported … Range characteristic. */
const RANGE_REQUIREMENTS = [
  { targetBit: 0, target: 'Speed Target Setting', characteristic: FtmsCharacteristic.SupportedSpeedRange, name: 'Supported Speed Range' },
  { targetBit: 1, target: 'Inclination Target Setting', characteristic: FtmsCharacteristic.SupportedInclinationRange, name: 'Supported Inclination Range' },
  { targetBit: 2, target: 'Resistance Target Setting', characteristic: FtmsCharacteristic.SupportedResistanceLevelRange, name: 'Supported Resistance Level Range' },
  { targetBit: 3, target: 'Power Target Setting', characteristic: FtmsCharacteristic.SupportedPowerRange, name: 'Supported Power Range' },
  { targetBit: 4, target: 'Heart Rate Target Setting', characteristic: FtmsCharacteristic.SupportedHeartRateRange, name: 'Supported Heart Rate Range' },
] as const;

const hex = (v: number, digits: number) => `0x${v.toString(16).padStart(digits, '0')}`;

export class ConformanceMonitor {
  private device: MonitoredDevice | undefined;
  private notifications = 0;
  private records = 0;
  private partsInRecord = 0;
  private maxPartsInRecord = 0;
  private unterminated = false;
  private rfuFlags = 0;
  private rfuExample = 0;
  private truncated = 0;
  private flagsSeen = 0;
  private missingSpeedInFinalPart = 0;

  // Elapsed Time (CN/BV-65-C)
  private elapsed: number | undefined;
  private elapsedBackwards = 0;
  private elapsedBeforeLinkLoss: number | undefined;
  private linkLossResult: 'continued' | 'restarted' | undefined;

  setDevice(device: MonitoredDevice): void {
    this.device = device;
  }

  reset(): void {
    Object.assign(this, new ConformanceMonitor());
  }

  /** Call when the link drops; the next Elapsed Time shows whether the session survived it. */
  onLinkLoss(): void {
    if (this.elapsed !== undefined) this.elapsedBeforeLinkLoss = this.elapsed;
    this.elapsed = undefined;
    this.partsInRecord = 0;
  }

  onIndoorBikeData(value: DataView): void {
    this.notifications++;
    const r = new ByteReader(value);
    if (!r.has(2)) {
      this.truncated++;
      return;
    }
    const flags = r.u16();
    if (flags & INDOOR_BIKE_RFU_FLAGS) {
      this.rfuFlags++;
      this.rfuExample = flags;
    }
    this.flagsSeen |= flags & ~IndoorBikeDataFlag.MoreData;

    const data = parseIndoorBikeData(value);
    if (data.truncated) this.truncated++;

    if (data.moreData) {
      this.partsInRecord++;
      if (this.partsInRecord >= MAX_PARTS_PER_RECORD) this.unterminated = true;
    } else {
      this.maxPartsInRecord = Math.max(this.maxPartsInRecord, this.partsInRecord + 1);
      this.partsInRecord = 0;
      this.records++;
      if (data.instantaneousSpeedKmh === undefined) this.missingSpeedInFinalPart++;
    }

    if (data.elapsedTimeS !== undefined) this.observeElapsed(data.elapsedTimeS);
  }

  private observeElapsed(value: number) {
    if (this.elapsedBeforeLinkLoss !== undefined) {
      this.linkLossResult = value >= this.elapsedBeforeLinkLoss ? 'continued' : 'restarted';
      this.elapsedBeforeLinkLoss = undefined;
    } else if (this.elapsed !== undefined && value < this.elapsed) {
      this.elapsedBackwards++;
    }
    this.elapsed = value;
  }

  report(): ConformanceCheck[] {
    return [...this.serviceChecks(), ...this.recordChecks(), ...this.fieldChecks(), this.elapsedCheck()];
  }

  private serviceChecks(): ConformanceCheck[] {
    const checks: ConformanceCheck[] = [];
    const ids = this.device?.characteristicIds ?? [];
    const features = this.device?.features;
    const has = (c: number) => ids.includes(c);

    checks.push({
      id: 'FTMS.ICS 4/1–2',
      title: 'Fitness Machine Feature',
      status: !this.device ? 'untested' : features ? 'pass' : 'fail',
      detail: !this.device
        ? 'No bike connected.'
        : features
          ? `Machine ${hex(features.rawMachineFeatures, 8)}, target setting ${hex(features.rawTargetSettingFeatures, 8)}.`
          : 'Mandatory characteristic missing or unreadable.',
    });

    if (features) {
      const rfu = (features.rawMachineFeatures | features.rawTargetSettingFeatures) & FEATURE_RFU_BITS;
      checks.push({
        id: 'FTMS/SR/CR/BV-01-C',
        title: 'Feature RFU bits are zero',
        status: rfu ? 'fail' : 'pass',
        detail: rfu ? `Reserved bits set: ${hex(rfu >>> 0, 8)}.` : 'No reserved bits set.',
      });

      for (const req of RANGE_REQUIREMENTS) {
        if (!((features.rawTargetSettingFeatures >>> req.targetBit) & 1)) continue;
        checks.push({
          id: 'FTMS.ICS 4/10–14',
          title: `${req.name} for ${req.target}`,
          status: has(req.characteristic) ? 'pass' : 'fail',
          detail: has(req.characteristic) ? 'Present.' : `${req.target} is supported, so ${req.name} is mandatory.`,
        });
      }
    }

    if (has(FtmsCharacteristic.FitnessMachineControlPoint)) {
      const status = has(FtmsCharacteristic.FitnessMachineStatus);
      checks.push({
        id: 'FTMS.ICS 4/16 (C.6)',
        title: 'Fitness Machine Status with Control Point',
        status: status ? 'pass' : 'fail',
        detail: status ? 'Present.' : 'The Control Point is exposed, so Fitness Machine Status is mandatory.',
      });
    }
    return checks;
  }

  private recordChecks(): ConformanceCheck[] {
    const none = this.notifications === 0;
    const recordStatus: CheckStatus = none
      ? 'untested'
      : this.unterminated || this.missingSpeedInFinalPart > 0
        ? 'fail'
        : this.records > 0
          ? 'pass'
          : 'untested';
    const recordDetail = none
      ? 'No Indoor Bike Data received yet.'
      : this.unterminated
        ? `More Data stayed set for ${MAX_PARTS_PER_RECORD}+ notifications; a Data Record never ended.`
        : this.missingSpeedInFinalPart > 0
          ? `${this.missingSpeedInFinalPart} final notification(s) without Instantaneous Speed.`
          : `${this.records} Data Record(s) from ${this.notifications} notification(s), up to ${this.maxPartsInRecord} per record.`;

    return [
      { id: 'FTMS/SR/CN/BV-55-C', title: 'Complete Data Records', status: recordStatus, detail: recordDetail },
      {
        id: 'FTMS/SR/CN/BV-55-C',
        title: 'Flags RFU bits are zero',
        status: none ? 'untested' : this.rfuFlags ? 'fail' : 'pass',
        detail: this.rfuFlags ? `${this.rfuFlags} notification(s) with reserved bits, e.g. flags ${hex(this.rfuExample, 4)}.` : 'No reserved bits set.',
      },
      {
        id: 'FTMS §4.9 / FTMP §4.4.7',
        title: 'Payload length matches flags',
        status: none ? 'untested' : this.truncated ? 'fail' : 'pass',
        detail: this.truncated ? `${this.truncated} notification(s) shorter than their flags announce.` : 'All payloads complete.',
      },
    ];
  }

  private fieldChecks(): ConformanceCheck[] {
    return FIELD_TESTS.map((t) => this.fieldCheck(t.id, t.title, t.flags, t.featureBit, t.feature));
  }

  private fieldCheck(id: string, title: string, flags: number, featureBit: number, feature: string): ConformanceCheck {
    const seen = (this.flagsSeen & flags) !== 0;
    const features = this.device?.features;
    const supported = features ? ((features.rawMachineFeatures >>> featureBit) & 1) === 1 : undefined;

    if (seen && supported === false) {
      return { id, title, status: 'fail', detail: `Field sent, but “${feature}” (feature bit ${featureBit}) is not set.` };
    }
    if (seen) return { id, title, status: 'pass', detail: supported ? `Sent; “${feature}” is set.` : 'Sent (features unknown).' };
    if (supported && this.records >= RECORDS_BEFORE_ABSENT_WARNING) {
      return { id, title, status: 'warn', detail: `“${feature}” is set, but the field was not sent in ${this.records} records.` };
    }
    return {
      id,
      title,
      status: 'untested',
      detail: supported ? 'Supported; waiting for data.' : 'Not supported by this bike.',
    };
  }

  private elapsedCheck(): ConformanceCheck {
    const id = 'FTMS/SR/CN/BV-65-C';
    const title = 'Elapsed Time';
    const base = this.fieldCheck(id, title, IndoorBikeDataFlag.ElapsedTime, 12, 'Elapsed Time Supported');
    if (base.status !== 'pass') return base;
    if (this.elapsedBackwards > 0) {
      return { id, title, status: 'warn', detail: `Went backwards ${this.elapsedBackwards} time(s) within a connection (console reset?).` };
    }
    if (this.linkLossResult === 'continued') {
      return { id, title, status: 'pass', detail: 'Increasing; the training session continued across a link loss (FTMS §4.18).' };
    }
    if (this.linkLossResult === 'restarted') {
      return { id, title, status: 'warn', detail: 'Restarted from a lower value after a link loss; the bike ended its session.' };
    }
    return { id, title, status: 'pass', detail: 'Increasing. Not yet observed across a link loss.' };
  }
}
