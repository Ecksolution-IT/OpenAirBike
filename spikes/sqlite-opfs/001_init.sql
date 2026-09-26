-- Portable subset of the schema sketch (docs/research/architecture-gap.md).
-- Only types and constructs that also exist in PostgreSQL (decision D1).
CREATE TABLE IF NOT EXISTS schema_migration (
  version INTEGER PRIMARY KEY,
  applied_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS session (
  id TEXT PRIMARY KEY,
  started_at TEXT NOT NULL,
  ended_at TEXT,
  active_s INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS sample (
  session_id TEXT NOT NULL REFERENCES session (id),
  t_ms INTEGER NOT NULL,
  power_w INTEGER,
  cadence_rpm REAL,
  speed_kmh REAL,
  heart_rate_bpm INTEGER,
  distance_m REAL,
  energy_kcal REAL,
  PRIMARY KEY (session_id, t_ms)
);
