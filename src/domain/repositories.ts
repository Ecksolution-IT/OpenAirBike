import type { Device, Sample, Session, SessionDetail, SessionEvent, SessionSummary } from './types';

/**
 * Persistence contracts. The domain and the application depend only on these; SQLite in the
 * browser is one implementation, a server database can be another (decision D1). All methods
 * are asynchronous because implementations may live in a worker or behind a network.
 */

export interface NewSession {
  id: string;
  startedAt: string;
  /** Must refer to a device stored with `DeviceRepository.upsert` first. */
  deviceId?: string;
}

export interface SessionEnd {
  status: 'finished' | 'recovered';
  endedAt: string;
  activeS: number;
  summary: SessionSummary;
}

export interface SessionRepository {
  /** Creates a session in status `recording`. */
  start(session: NewSession): Promise<void>;
  /** Appends samples (in batches while recording). Samples with an existing `tMs` are ignored. Rejects for sessions that are not recording. */
  appendSamples(sessionId: string, samples: Sample[]): Promise<void>;
  /** Appends events in order. Rejects for sessions that are not recording. */
  appendEvents(sessionId: string, events: SessionEvent[]): Promise<void>;
  /** Ends a recording session with its summary. */
  finish(sessionId: string, end: SessionEnd): Promise<void>;
  get(sessionId: string): Promise<SessionDetail | undefined>;
  /** All sessions without samples, newest first. */
  list(): Promise<Session[]>;
  /** Sessions still in status `recording` (in progress or interrupted). */
  listUnfinished(): Promise<Session[]>;
  /** Removes the session with its samples and events. */
  delete(sessionId: string): Promise<void>;
}

export interface DeviceRepository {
  /** Inserts or updates; keeps the original `firstSeenAt`. */
  upsert(device: Device): Promise<void>;
  get(deviceId: string): Promise<Device | undefined>;
  list(): Promise<Device[]>;
}

/** Small application settings (e.g. the last connected bike), stored as JSON values. */
export interface SettingsRepository {
  get<T>(key: string): Promise<T | undefined>;
  set(key: string, value: unknown): Promise<void>;
}

export interface Repositories {
  sessions: SessionRepository;
  devices: DeviceRepository;
  settings: SettingsRepository;
}

/** Thrown by repositories for violated contracts (unknown session, session not recording, …). */
export class RepositoryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RepositoryError';
  }
}
