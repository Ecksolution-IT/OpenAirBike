import sqlite3InitModule from '@sqlite.org/sqlite-wasm';
import { describe, expect, it } from 'vitest';
import { configure, migrate, MIGRATIONS } from '../src/persistence/sqlite/migrate';

describe('SQLite migrations', () => {
  it('apply once and are idempotent', async () => {
    const sqlite3 = await sqlite3InitModule();
    const db = new sqlite3.oo1.DB(':memory:', 'c');
    configure(db);
    expect(migrate(db)).toBe(MIGRATIONS.length);
    expect(migrate(db)).toBe(MIGRATIONS.length);
    expect(db.selectValue('SELECT COUNT(*) FROM schema_migration')).toBe(MIGRATIONS.length);
    const tables = db.selectValues("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name");
    expect(tables).toEqual(['app_setting', 'device', 'sample', 'schema_migration', 'session', 'session_event']);
  });

  // Decision D1: the schema must stay portable to a server database such as PostgreSQL.
  it.each(MIGRATIONS.map((m) => [m.version, m.sql] as const))('migration %i uses no SQLite-only syntax', (_version, sql) => {
    const code = sql.replace(/--.*$/gm, '');
    for (const pattern of [/AUTOINCREMENT/i, /WITHOUT\s+ROWID/i, /INSERT\s+OR\s+/i, /REPLACE\s+INTO/i, /\bjson_\w+\(/i, /\bdatetime\(/i, /PRAGMA/i, /\bBLOB\b/i, /\bREAL\b/i]) {
      expect(code, `matches ${pattern}`).not.toMatch(pattern);
    }
  });
});
