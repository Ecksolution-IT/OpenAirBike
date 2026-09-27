import { toCanonical } from '../../src/adapters/ftms-indoor-bike/canonical';
import { toHex } from '../../src/protocol/ftms/bytes';
import { ConformanceMonitor, type ConformanceCheck } from '../../src/protocol/ftms/conformance';
import { DataRecordAssembler, type IndoorBikeRecord } from '../../src/protocol/ftms/dataRecord';
import { parseIndoorBikeData, type IndoorBikeData } from '../../src/protocol/ftms/indoorBikeData';
import { parseFitnessMachineFeature, parseMachineStatus, parseTrainingStatus } from '../../src/protocol/ftms/machineInfo';
import { FTMS_SERVICE, FtmsCharacteristic, uuidName } from '../../src/protocol/ftms/uuids';
import type { TelemetrySample } from '../../src/telemetry/types';
import type { GattNotification } from '../../src/transport/types';
import type { ProbeReport } from './probe';

/** Indoor Bike Data flag bits 13–15 are Reserved for Future Use (FTMS Table 4.10). */
const RFU_FLAGS = 0xe000;

export interface DecodedPacket {
  receivedAt: number;
  service: number;
  characteristic: number;
  name: string;
  hex: string;
  /** One-line human-readable decoding. */
  text: string;
  /** Set when an Indoor Bike Data Record is complete (after More Data reassembly). */
  record?: IndoorBikeRecord;
  telemetry?: TelemetrySample;
}

const fmt = (v: number | undefined, unit: string, digits = 0) => (v === undefined ? undefined : `${v.toFixed(digits)} ${unit}`);

/** Indoor Bike Data fields in FTMS field order, with units. */
export function describeIndoorBikeData(d: IndoorBikeData): string {
  const parts: [string, string | undefined][] = [
    ['speed', fmt(d.instantaneousSpeedKmh, 'km/h', 2)],
    ['avg speed', fmt(d.averageSpeedKmh, 'km/h', 2)],
    ['cadence', fmt(d.instantaneousCadenceRpm, 'rpm', 1)],
    ['avg cadence', fmt(d.averageCadenceRpm, 'rpm', 1)],
    ['distance', fmt(d.totalDistanceM, 'm')],
    ['resistance', fmt(d.resistanceLevel, '')],
    ['power', fmt(d.instantaneousPowerW, 'W')],
    ['avg power', fmt(d.averagePowerW, 'W')],
    ['energy', fmt(d.totalEnergyKcal, 'kcal')],
    ['energy/h', fmt(d.energyPerHourKcal, 'kcal')],
    ['energy/min', fmt(d.energyPerMinuteKcal, 'kcal')],
    ['HR', fmt(d.heartRateBpm, 'bpm')],
    ['MET', fmt(d.metabolicEquivalent, '', 1)],
    ['elapsed', fmt(d.elapsedTimeS, 's')],
    ['remaining', fmt(d.remainingTimeS, 's')],
  ];
  return parts
    .filter(([, v]) => v !== undefined)
    .map(([k, v]) => `${k} ${v!.trim()}`)
    .join(' · ');
}

/** Canonical telemetry as the app would see it; "–" marks a metric that is not available. */
export function describeTelemetry(s: TelemetrySample): string {
  const v = (x: number | undefined, unit: string, digits = 0) => (x === undefined ? '–' : `${x.toFixed(digits)} ${unit}`);
  return [
    `power ${v(s.powerW, 'W')}`,
    `cadence ${v(s.cadenceRpm, 'rpm', 1)}`,
    `speed ${v(s.speedKmh, 'km/h', 1)}`,
    `HR ${v(s.heartRateBpm, 'bpm')}`,
    `device distance ${v(s.deviceCounters.distanceM, 'm')}`,
    `device energy ${v(s.deviceCounters.energyKcal, 'kcal')}`,
    `device elapsed ${v(s.deviceCounters.elapsedS, 's')}`,
  ].join(' · ');
}

/**
 * Decodes FTMS notifications for the hardware proof: one line per packet, Data Record
 * reassembly (FTMS §4.19) and the conformance checks the app uses. No I/O.
 */
export class PacketDecoder {
  private readonly assembler = new DataRecordAssembler();
  private readonly conformance = new ConformanceMonitor();

  /** Tells the conformance checks what the device declared during setup. */
  setDevice(report: Pick<ProbeReport, 'ftmsCharacteristics' | 'features'>): void {
    this.conformance.setDevice({ characteristicIds: report.ftmsCharacteristics, features: report.features });
  }

  /** A partially received Data Record must be discarded after link loss (FTMS §4.18). */
  linkLost(): void {
    this.assembler.reset();
    this.conformance.onLinkLoss();
  }

  conformanceReport(): ConformanceCheck[] {
    return this.conformance.report();
  }

  decode(n: GattNotification): DecodedPacket {
    const base = { receivedAt: n.receivedAt, service: n.service, characteristic: n.characteristic, name: uuidName(n.characteristic), hex: toHex(n.value) };
    if (n.service !== FTMS_SERVICE) return { ...base, text: '(not decoded)' };
    switch (n.characteristic) {
      case FtmsCharacteristic.IndoorBikeData: {
        this.conformance.onIndoorBikeData(n.value);
        const data = parseIndoorBikeData(n.value);
        const flags = n.value.byteLength >= 2 ? n.value.getUint16(0, true) : undefined;
        const notes = [
          flags === undefined ? 'no flags' : `flags 0x${flags.toString(16).padStart(4, '0')}`,
          data.moreData ? 'More Data (fragment)' : undefined,
          flags !== undefined && flags & RFU_FLAGS ? `RFU flags 0x${(flags & RFU_FLAGS).toString(16)}` : undefined,
          data.truncated ? 'TRUNCATED' : undefined,
        ].filter(Boolean);
        const record = this.assembler.push(data);
        const fields = describeIndoorBikeData(data);
        return {
          ...base,
          text: `${notes.join(' · ')}${fields ? ` | ${fields}` : ''}`,
          record,
          telemetry: record && toCanonical(record, n.receivedAt),
        };
      }
      case FtmsCharacteristic.TrainingStatus: {
        const s = parseTrainingStatus(n.value);
        return { ...base, text: `${s.name}${s.text ? ` "${s.text}"` : ''}${s.extendedString ? ' (extended string)' : ''}` };
      }
      case FtmsCharacteristic.FitnessMachineStatus: {
        const s = parseMachineStatus(n.value);
        const param = s.parameter.length ? ` [${toHex(s.parameter)}]` : '';
        return { ...base, text: `${s.name}${s.stopOrPause ? ` (${s.stopOrPause})` : ''}${param}` };
      }
      case FtmsCharacteristic.FitnessMachineFeature: {
        const f = parseFitnessMachineFeature(n.value);
        return { ...base, text: `Features changed: ${f.machineFeatures.join(', ') || 'none'}` };
      }
      default:
        return { ...base, text: '(not decoded)' };
    }
  }
}
