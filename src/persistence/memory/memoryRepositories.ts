import {
  RepositoryError,
  type DeviceRepository,
  type NewSession,
  type Repositories,
  type SessionEnd,
  type SessionRepository,
  type SettingsRepository,
} from '../../domain/repositories';
import type { Device, Sample, Session, SessionDetail, SessionEvent } from '../../domain/types';

interface StoredSession {
  session: Omit<Session, 'device'> & { deviceId?: string };
  samples: Map<number, Sample>;
  events: SessionEvent[];
}

const clone = <T>(value: T): T => structuredClone(value);

/** In-memory repositories: the reference implementation of the contracts, used in tests. */
export function createMemoryRepositories(): Repositories {
  const devices = new Map<string, Device>();
  const sessions = new Map<string, StoredSession>();
  const settings = new Map<string, string>();

  const recording = (id: string) => {
    const s = sessions.get(id);
    if (!s) throw new RepositoryError(`Unknown session ${id}.`);
    if (s.session.status !== 'recording') throw new RepositoryError(`Session ${id} is not recording.`);
    return s;
  };

  const toSession = ({ session: { deviceId, ...rest } }: StoredSession): Session => {
    const device = deviceId ? devices.get(deviceId) : undefined;
    return clone({ ...rest, ...(device && { device: { id: device.id, name: device.name } }) });
  };

  const sessionRepository: SessionRepository = {
    async start({ id, startedAt, deviceId }: NewSession) {
      if (sessions.has(id)) throw new RepositoryError(`Session ${id} already exists.`);
      if (deviceId && !devices.has(deviceId)) throw new RepositoryError(`Unknown device ${deviceId}.`);
      sessions.set(id, { session: { id, status: 'recording', startedAt, activeS: 0, deviceId }, samples: new Map(), events: [] });
    },
    async appendSamples(sessionId, samples) {
      const s = recording(sessionId);
      for (const sample of samples) if (!s.samples.has(sample.tMs)) s.samples.set(sample.tMs, clone(sample));
    },
    async appendEvents(sessionId, events) {
      recording(sessionId).events.push(...clone(events));
    },
    async finish(sessionId, { status, endedAt, activeS, summary }: SessionEnd) {
      const s = recording(sessionId);
      s.session = { ...s.session, status, endedAt, activeS, summary: clone(summary) };
    },
    async get(sessionId): Promise<SessionDetail | undefined> {
      const s = sessions.get(sessionId);
      if (!s) return undefined;
      const samples = [...s.samples.values()].sort((a, b) => a.tMs - b.tMs);
      return { session: toSession(s), samples: clone(samples), events: clone(s.events) };
    },
    async list() {
      return [...sessions.values()].map(toSession).sort((a, b) => b.startedAt.localeCompare(a.startedAt));
    },
    async listUnfinished() {
      return (await this.list()).filter((s) => s.status === 'recording');
    },
    async delete(sessionId) {
      sessions.delete(sessionId);
    },
  };

  const deviceRepository: DeviceRepository = {
    async upsert(device) {
      const existing = devices.get(device.id);
      devices.set(device.id, clone({ ...device, firstSeenAt: existing?.firstSeenAt ?? device.firstSeenAt }));
    },
    async get(deviceId) {
      const d = devices.get(deviceId);
      return d && clone(d);
    },
    async list() {
      return [...devices.values()].map(clone).sort((a, b) => a.name.localeCompare(b.name));
    },
  };

  const settingsRepository: SettingsRepository = {
    async get<T>(key: string) {
      const v = settings.get(key);
      return v === undefined ? undefined : (JSON.parse(v) as T);
    },
    async set(key, value) {
      settings.set(key, JSON.stringify(value));
    },
  };

  return { sessions: sessionRepository, devices: deviceRepository, settings: settingsRepository };
}
