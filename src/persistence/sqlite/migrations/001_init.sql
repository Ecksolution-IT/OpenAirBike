-- OpenAirBike schema, version 1.
-- Portable SQL (decision D1): only types and constructs that exist in SQLite and PostgreSQL.
-- Text UUID keys, UTC ISO 8601 timestamps as TEXT, DOUBLE PRECISION for measurements,
-- SMALLINT 0/1 for flags, JSON settings as TEXT.

CREATE TABLE device (
  id            TEXT PRIMARY KEY,
  name          TEXT NOT NULL,
  profile_id    TEXT NOT NULL,
  manufacturer  TEXT,
  model         TEXT,
  firmware      TEXT,
  simulated     SMALLINT NOT NULL DEFAULT 0,
  first_seen_at TEXT NOT NULL,
  last_seen_at  TEXT NOT NULL
);

CREATE TABLE session (
  id                 TEXT PRIMARY KEY,
  device_id          TEXT REFERENCES device (id),
  status             TEXT NOT NULL CHECK (status IN ('recording', 'finished', 'recovered')),
  started_at         TEXT NOT NULL,
  ended_at           TEXT,
  active_s           INTEGER NOT NULL DEFAULT 0,
  -- Summary, set when the session is finished or recovered.
  distance_m         DOUBLE PRECISION,
  energy_kcal        DOUBLE PRECISION,
  avg_power_w        DOUBLE PRECISION,
  max_power_w        DOUBLE PRECISION,
  avg_cadence_rpm    DOUBLE PRECISION,
  max_cadence_rpm    DOUBLE PRECISION,
  avg_speed_kmh      DOUBLE PRECISION,
  max_speed_kmh      DOUBLE PRECISION,
  avg_heart_rate_bpm DOUBLE PRECISION,
  max_heart_rate_bpm DOUBLE PRECISION
);

CREATE INDEX session_started_at ON session (started_at);

CREATE TABLE sample (
  session_id     TEXT NOT NULL REFERENCES session (id) ON DELETE CASCADE,
  t_ms           INTEGER NOT NULL,
  power_w        DOUBLE PRECISION,
  cadence_rpm    DOUBLE PRECISION,
  speed_kmh      DOUBLE PRECISION,
  heart_rate_bpm INTEGER,
  distance_m     DOUBLE PRECISION NOT NULL,
  energy_kcal    DOUBLE PRECISION NOT NULL,
  PRIMARY KEY (session_id, t_ms)
);

CREATE TABLE session_event (
  session_id TEXT NOT NULL REFERENCES session (id) ON DELETE CASCADE,
  seq        INTEGER NOT NULL,
  t_ms       INTEGER NOT NULL,
  kind       TEXT NOT NULL,
  detail     TEXT,
  PRIMARY KEY (session_id, seq)
);

CREATE TABLE app_setting (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
