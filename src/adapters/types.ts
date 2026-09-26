import type { TelemetrySample } from '../telemetry/types';
import type { ConnectionState } from '../transport/types';
import { Emitter } from '../util/emitter';

/** Metrics a device can deliver, independent of protocol. */
export type Capability = 'power' | 'cadence' | 'speed' | 'distance' | 'energy' | 'heartRate' | 'elapsedTime';

/** What the adapter learned about the connected device. */
export interface DeviceInfo {
  id: string;
  name: string;
  /** Id of the matched device profile, e.g. "rogue-echo-bike-v3". */
  profileId: string;
  profileName: string;
  manufacturer?: string;
  model?: string;
  firmware?: string;
  hardware?: string;
  software?: string;
  /** Undefined when the device does not declare what it supports. */
  capabilities?: Capability[];
  simulated?: boolean;
  /** Protocol-specific details, for diagnostics only. */
  protocol: Record<string, unknown>;
}

/** Device-side events the application may react to (console buttons, resets). */
export interface DeviceEvent {
  kind: 'started' | 'paused' | 'stopped' | 'reset' | 'other';
  label: string;
}

export type AdapterEvents = {
  state: ConnectionState;
  info: DeviceInfo;
  sample: TelemetrySample;
  deviceEvent: DeviceEvent;
  log: string;
};

/**
 * Device Adapter: turns one device family's protocol into Canonical Telemetry and
 * device events. The application depends on this contract, not on a protocol.
 */
export abstract class DeviceAdapter extends Emitter<AdapterEvents> {
  abstract readonly state: ConnectionState;
  abstract readonly info: DeviceInfo | undefined;
  abstract connect(): Promise<void>;
  abstract disconnect(): Promise<void>;
  /** Protocol conformance / diagnostics for the Diagnostics panel. */
  abstract diagnostics(): { id: string; title: string; status: string; detail: string }[];
}
