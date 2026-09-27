import { toHex } from '../../src/protocol/ftms/bytes';
import type { GattNotification } from '../../src/transport/types';
import { uuid16 } from '../../src/util/bleUuid';
import type { ProbeReport } from './probe';

export type ChooserMode = 'ftms' | 'names' | 'all';

/** Keeps hours of 1 Hz data while bounding memory. */
export const MAX_CAPTURED_PACKETS = 50_000;

interface Entry {
  /** Milliseconds since the connection attempt started. */
  t: number;
}

/**
 * Hardware-proof capture file. A draft of the capture format planned for replay (research S4):
 * full UUIDs, relative times, reads, connection events and raw packets. It contains no device
 * id and no serial number.
 */
export interface Capture {
  format: 'openairbike-capture';
  version: 0;
  tool: 'hardware-proof';
  createdAt: string;
  userAgent?: string;
  chooser: ChooserMode;
  device: { name?: string };
  profile?: { id: string; name: string };
  probe?: ProbeReport;
  events: (Entry & { kind: string; detail?: string })[];
  reads: (Entry & { service: string; characteristic: string; hex: string })[];
  packets: (Entry & { service: string; characteristic: string; hex: string })[];
  packetsDropped: number;
}

export class CaptureLog {
  /** When false, raw packets are not kept (events and reads always are). */
  recordPackets = true;
  private readonly events: Capture['events'] = [];
  private readonly reads: Capture['reads'] = [];
  private readonly packets: Capture['packets'] = [];
  private packetsDropped = 0;
  private probe: ProbeReport | undefined;
  private profile: Capture['profile'];

  constructor(
    private readonly startedAt: number,
    private readonly chooser: ChooserMode,
    private readonly deviceName: string | undefined,
  ) {}

  get packetCount(): number {
    return this.packets.length;
  }

  event(at: number, kind: string, detail?: string): void {
    this.events.push({ t: at - this.startedAt, kind, ...(detail === undefined ? {} : { detail }) });
  }

  read(at: number, service: number, characteristic: number, value: DataView): void {
    this.reads.push({ t: at - this.startedAt, service: uuid16(service), characteristic: uuid16(characteristic), hex: toHex(value) });
  }

  packet(n: GattNotification): void {
    if (!this.recordPackets) return;
    if (this.packets.length >= MAX_CAPTURED_PACKETS) {
      this.packetsDropped++;
      return;
    }
    this.packets.push({ t: n.receivedAt - this.startedAt, service: uuid16(n.service), characteristic: uuid16(n.characteristic), hex: toHex(n.value) });
  }

  setProbe(probe: ProbeReport, profile: { id: string; name: string }): void {
    this.probe = probe;
    this.profile = profile;
  }

  toJSON(createdAt: Date, userAgent?: string): Capture {
    return {
      format: 'openairbike-capture',
      version: 0,
      tool: 'hardware-proof',
      createdAt: createdAt.toISOString(),
      ...(userAgent === undefined ? {} : { userAgent }),
      chooser: this.chooser,
      device: this.deviceName === undefined ? {} : { name: this.deviceName },
      ...(this.profile ? { profile: this.profile } : {}),
      ...(this.probe ? { probe: this.probe } : {}),
      events: this.events,
      reads: this.reads,
      packets: this.packets,
      packetsDropped: this.packetsDropped,
    };
  }
}
