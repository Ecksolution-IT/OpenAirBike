import type { BindableValue, Database } from '@sqlite.org/sqlite-wasm';
import {
  RepositoryError,
  type DeviceRepository,
  type Repositories,
  type SessionRepository,
  type SettingsRepository,
} from '../../domain/repositories';
import type { Device, Sample, Session, SessionEvent, SessionStatus, SessionSummary } from '../../domain/types';

type Row = Record<string, unknown>;

/** NULL → undefined, so optional fields are simply absent in domain objects. */
function optional<T>(value: unknown): T | undefined {
  return value === null || value === undefined ? undefined : (value as T);
}

function compact<T extends object>(obj: T): T {
  return Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined)) as T;
}

const nullable = (v: string | number | undefined): BindableValue => (v === undefined ? null : v);

const SESSION_COLUMNS = `s.id, s.status, s.started_at, s.ended_at, s.active_s, s.device_id, d.name AS device_name,
  s.distance_m, s.energy_kcal, s.avg_power_w, s.max_power_w, s.avg_cadence_rpm, s.max_cadence_rpm,
  s.avg_speed_kmh, s.max_speed_kmh, s.avg_heart_rate_bpm, s.max_heart_rate_bpm`;

const SESSION_FROM = 'FROM session s LEFT JOIN device d ON d.id = s.device_id';

function toSession(r: Row): Session {
  const summary: SessionSummary | undefined =
    r.distance_m === null
      ? undefined
      : compact({
          distanceM: r.distance_m as number,
          energyKcal: r.energy_kcal as number,
          avgPowerW: optional<number>(r.avg_power_w),
          maxPowerW: optional<number>(r.max_power_w),
          avgCadenceRpm: optional<number>(r.avg_cadence_rpm),
          maxCadenceRpm: optional<number>(r.max_cadence_rpm),
          avgSpeedKmh: optional<number>(r.avg_speed_kmh),
          maxSpeedKmh: optional<number>(r.max_speed_kmh),
          avgHeartRateBpm: optional<number>(r.avg_heart_rate_bpm),
          maxHeartRateBpm: optional<number>(r.max_heart_rate_bpm),
        });
  return compact({
    id: r.id as string,
    status: r.status as SessionStatus,
    startedAt: r.started_at as string,
    endedAt: optional<string>(r.ended_at),
    activeS: r.active_s as number,
    device: r.device_id === null ? undefined : { id: r.device_id as string, name: r.device_name as string },
    summary,
  });
}

function toSample(r: Row): Sample {
  return compact({
    tMs: r.t_ms as number,
    powerW: optional<number>(r.power_w),
    cadenceRpm: optional<number>(r.cadence_rpm),
    speedKmh: optional<number>(r.speed_kmh),
    heartRateBpm: optional<number>(r.heart_rate_bpm),
    distanceM: r.distance_m as number,
    energyKcal: r.energy_kcal as number,
  });
}

function toEvent(r: Row): SessionEvent {
  return compact({ tMs: r.t_ms as number, kind: r.kind as SessionEvent['kind'], detail: optional<string>(r.detail) });
}

function toDevice(r: Row): Device {
  return compact({
    id: r.id as string,
    name: r.name as string,
    profileId: r.profile_id as string,
    manufacturer: optional<string>(r.manufacturer),
    model: optional<string>(r.model),
    firmware: optional<string>(r.firmware),
    simulated: r.simulated === 1,
    firstSeenAt: r.first_seen_at as string,
    lastSeenAt: r.last_seen_at as string,
  });
}

/**
 * Repositories on a migrated SQLite database. Plain, portable SQL (decision D1). Runs
 * synchronously inside the database worker; the async signatures satisfy the contracts.
 */
export function createSqlRepositories(db: Database): Repositories {
  const status = (sessionId: string) => db.selectValue('SELECT status FROM session WHERE id = ?', [sessionId]) as string | undefined;

  const requireRecording = (sessionId: string) => {
    const s = status(sessionId);
    if (s === undefined) throw new RepositoryError(`Unknown session ${sessionId}.`);
    if (s !== 'recording') throw new RepositoryError(`Session ${sessionId} is not recording.`);
  };

  const sessions: SessionRepository = {
    async start({ id, startedAt, deviceId }) {
      if (status(id) !== undefined) throw new RepositoryError(`Session ${id} already exists.`);
      if (deviceId && db.selectValue('SELECT 1 FROM device WHERE id = ?', [deviceId]) === undefined) {
        throw new RepositoryError(`Unknown device ${deviceId}.`);
      }
      db.exec({
        sql: "INSERT INTO session (id, device_id, status, started_at, active_s) VALUES (?, ?, 'recording', ?, 0)",
        bind: [id, nullable(deviceId), startedAt],
      });
    },

    async appendSamples(sessionId, samples) {
      requireRecording(sessionId);
      db.transaction(() => {
        const stmt = db.prepare(
          `INSERT INTO sample (session_id, t_ms, power_w, cadence_rpm, speed_kmh, heart_rate_bpm, distance_m, energy_kcal)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT (session_id, t_ms) DO NOTHING`,
        );
        try {
          for (const s of samples) {
            stmt
              .bind([sessionId, s.tMs, nullable(s.powerW), nullable(s.cadenceRpm), nullable(s.speedKmh), nullable(s.heartRateBpm), s.distanceM, s.energyKcal])
              .stepReset();
          }
        } finally {
          stmt.finalize();
        }
      });
    },

    async appendEvents(sessionId, events) {
      requireRecording(sessionId);
      db.transaction(() => {
        let seq = Number(db.selectValue('SELECT COALESCE(MAX(seq), 0) FROM session_event WHERE session_id = ?', [sessionId]));
        for (const e of events) {
          db.exec({
            sql: 'INSERT INTO session_event (session_id, seq, t_ms, kind, detail) VALUES (?, ?, ?, ?, ?)',
            bind: [sessionId, ++seq, e.tMs, e.kind, nullable(e.detail)],
          });
        }
      });
    },

    async finish(sessionId, { status: newStatus, endedAt, activeS, summary: s }) {
      requireRecording(sessionId);
      db.exec({
        sql: `UPDATE session SET status = ?, ended_at = ?, active_s = ?,
                distance_m = ?, energy_kcal = ?, avg_power_w = ?, max_power_w = ?, avg_cadence_rpm = ?, max_cadence_rpm = ?,
                avg_speed_kmh = ?, max_speed_kmh = ?, avg_heart_rate_bpm = ?, max_heart_rate_bpm = ?
              WHERE id = ?`,
        bind: [
          newStatus, endedAt, activeS,
          s.distanceM, s.energyKcal, nullable(s.avgPowerW), nullable(s.maxPowerW), nullable(s.avgCadenceRpm), nullable(s.maxCadenceRpm),
          nullable(s.avgSpeedKmh), nullable(s.maxSpeedKmh), nullable(s.avgHeartRateBpm), nullable(s.maxHeartRateBpm),
          sessionId,
        ],
      });
    },

    async get(sessionId) {
      const row = db.selectObject(`SELECT ${SESSION_COLUMNS} ${SESSION_FROM} WHERE s.id = ?`, [sessionId]);
      if (!row) return undefined;
      return {
        session: toSession(row),
        samples: db.selectObjects('SELECT * FROM sample WHERE session_id = ? ORDER BY t_ms', [sessionId]).map(toSample),
        events: db.selectObjects('SELECT * FROM session_event WHERE session_id = ? ORDER BY seq', [sessionId]).map(toEvent),
      };
    },

    async list() {
      return db.selectObjects(`SELECT ${SESSION_COLUMNS} ${SESSION_FROM} ORDER BY s.started_at DESC`).map(toSession);
    },

    async listUnfinished() {
      return db.selectObjects(`SELECT ${SESSION_COLUMNS} ${SESSION_FROM} WHERE s.status = 'recording' ORDER BY s.started_at DESC`).map(toSession);
    },

    async delete(sessionId) {
      // Samples and events are removed by ON DELETE CASCADE.
      db.exec({ sql: 'DELETE FROM session WHERE id = ?', bind: [sessionId] });
    },
  };

  const devices: DeviceRepository = {
    async upsert(d) {
      db.exec({
        sql: `INSERT INTO device (id, name, profile_id, manufacturer, model, firmware, simulated, first_seen_at, last_seen_at)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
              ON CONFLICT (id) DO UPDATE SET name = excluded.name, profile_id = excluded.profile_id,
                manufacturer = excluded.manufacturer, model = excluded.model, firmware = excluded.firmware,
                simulated = excluded.simulated, last_seen_at = excluded.last_seen_at`,
        bind: [d.id, d.name, d.profileId, nullable(d.manufacturer), nullable(d.model), nullable(d.firmware), d.simulated ? 1 : 0, d.firstSeenAt, d.lastSeenAt],
      });
    },
    async get(deviceId) {
      const row = db.selectObject('SELECT * FROM device WHERE id = ?', [deviceId]);
      return row && toDevice(row);
    },
    async list() {
      return db.selectObjects('SELECT * FROM device ORDER BY name').map(toDevice);
    },
  };

  const settings: SettingsRepository = {
    async get<T>(key: string) {
      const value = db.selectValue('SELECT value FROM app_setting WHERE key = ?', [key]) as string | undefined;
      return value === undefined ? undefined : (JSON.parse(value) as T);
    },
    async set(key, value) {
      db.exec({
        sql: 'INSERT INTO app_setting (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value',
        bind: [key, JSON.stringify(value)],
      });
    },
  };

  return { sessions, devices, settings };
}
