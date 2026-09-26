/// <reference lib="webworker" />
// Spike: SQLite WASM persisted in OPFS via the "opfs-sahpool" VFS, without COOP/COEP headers.
import sqlite3InitModule from '@sqlite.org/sqlite-wasm';
import migration001 from './001_init.sql?raw';

const SAMPLES = 1800; // 30 min at 1 Hz

async function run() {
  const report: Record<string, unknown> = { crossOriginIsolated: self.crossOriginIsolated };
  const t0 = performance.now();
  const sqlite3 = await sqlite3InitModule();
  report.sqliteVersion = sqlite3.version.libVersion;
  report.initMs = Math.round(performance.now() - t0);

  const pool = await sqlite3.installOpfsSAHPoolVfs({ name: 'openairbike-spike' });
  const db = new pool.OpfsSAHPoolDb('/openairbike-spike.sqlite3');
  report.vfs = 'opfs-sahpool';
  report.files = pool.getFileNames();

  db.exec('PRAGMA foreign_keys = ON');
  db.exec(migration001);
  db.exec({ sql: 'INSERT OR IGNORE INTO schema_migration VALUES (1, ?)', bind: [new Date().toISOString()] });

  report.sessionsBefore = db.selectValue('SELECT COUNT(*) FROM session');

  // One simulated 30-minute session, written in a single transaction.
  const id = crypto.randomUUID();
  const t1 = performance.now();
  db.transaction(() => {
    db.exec({ sql: 'INSERT INTO session (id, started_at, active_s) VALUES (?, ?, ?)', bind: [id, new Date().toISOString(), SAMPLES] });
    const stmt = db.prepare(
      'INSERT INTO sample (session_id, t_ms, power_w, cadence_rpm, speed_kmh, distance_m, energy_kcal) VALUES (?, ?, ?, ?, ?, ?, ?)',
    );
    try {
      for (let i = 0; i < SAMPLES; i++) {
        const cadence = 55 + 30 * Math.sin(i / 20);
        stmt.bind([id, i * 1000, Math.round(0.001 * cadence ** 3), cadence, 0.45 * cadence, i * 7, i * 0.25]).stepReset();
      }
    } finally {
      stmt.finalize();
    }
  });
  report.insertMs = Math.round(performance.now() - t1);

  const t2 = performance.now();
  report.summary = db.selectObject(
    `SELECT COUNT(*) AS samples, ROUND(AVG(power_w)) AS avg_power_w, MAX(power_w) AS max_power_w,
            MAX(distance_m) AS distance_m FROM sample WHERE session_id = ?`,
    [id],
  );
  report.queryMs = Math.round(performance.now() - t2);
  report.sessionsAfter = db.selectValue('SELECT COUNT(*) FROM session');
  report.totalSamples = db.selectValue('SELECT COUNT(*) FROM sample');

  // Export: the whole database as a regular SQLite file (backup / later server import).
  const bytes = await pool.exportFile('/openairbike-spike.sqlite3');
  report.exportBytes = bytes.byteLength;
  report.exportHeader = new TextDecoder().decode(bytes.slice(0, 15));

  db.close();
  return report;
}

run().then(
  (report) => postMessage({ ok: true, report }),
  (err) => postMessage({ ok: false, error: `${err?.name ?? 'Error'}: ${err?.message ?? String(err)}` }),
);
