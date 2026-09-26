/**
 * Domain model. Plain data, no I/O, no knowledge of devices' protocols or of storage.
 * Units follow decision D2; timestamps are UTC ISO 8601 strings.
 */

/** A device OpenAirBike has seen, independent of protocol. */
export interface Device {
  id: string;
  name: string;
  /** Device profile that matched, e.g. "rogue-echo-bike-v3". */
  profileId: string;
  manufacturer?: string;
  model?: string;
  firmware?: string;
  simulated: boolean;
  firstSeenAt: string;
  lastSeenAt: string;
}

/**
 * - `recording`: in progress, or interrupted (the app closed during it)
 * - `finished`: stopped normally
 * - `recovered`: finished after an interruption, from the samples that were saved
 */
export type SessionStatus = 'recording' | 'finished' | 'recovered';

/** One training session (a recorded workout). */
export interface Session {
  id: string;
  status: SessionStatus;
  startedAt: string;
  endedAt?: string;
  /** Active (non-paused) seconds. */
  activeS: number;
  device?: { id: string; name: string };
  /** Present once the session is finished or recovered. */
  summary?: SessionSummary;
}

export interface SessionSummary {
  distanceM: number;
  energyKcal: number;
  avgPowerW?: number;
  maxPowerW?: number;
  avgCadenceRpm?: number;
  maxCadenceRpm?: number;
  avgSpeedKmh?: number;
  maxSpeedKmh?: number;
  avgHeartRateBpm?: number;
  maxHeartRateBpm?: number;
}

/** One recorded reading. Distance and energy are the workout's own cumulative totals. */
export interface Sample {
  /** Active (non-paused) milliseconds since the session started. */
  tMs: number;
  powerW?: number;
  cadenceRpm?: number;
  speedKmh?: number;
  heartRateBpm?: number;
  distanceM: number;
  energyKcal: number;
}

/** Something that happened during a session, for the timeline and for analysis. */
export interface SessionEvent {
  tMs: number;
  kind: 'pause' | 'resume' | 'link-lost' | 'link-restored' | 'device';
  detail?: string;
}

export interface SessionDetail {
  session: Session;
  samples: Sample[];
  events: SessionEvent[];
}
