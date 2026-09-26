import type { Database } from '@sqlite.org/sqlite-wasm';
import migration001 from './migrations/001_init.sql?raw';

/** Ordered migrations. Append only; never edit a released migration. */
export const MIGRATIONS: readonly { version: number; sql: string }[] = [{ version: 1, sql: migration001 }];

/** Applies pending migrations, each in its own transaction. Returns the schema version. */
export function migrate(db: Database): number {
  db.exec('CREATE TABLE IF NOT EXISTS schema_migration (version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL)');
  const current = Number(db.selectValue('SELECT COALESCE(MAX(version), 0) FROM schema_migration'));
  for (const m of MIGRATIONS) {
    if (m.version <= current) continue;
    db.transaction(() => {
      db.exec(m.sql);
      db.exec({ sql: 'INSERT INTO schema_migration (version, applied_at) VALUES (?, ?)', bind: [m.version, new Date().toISOString()] });
    });
  }
  return MIGRATIONS[MIGRATIONS.length - 1].version;
}

/** Connection settings every SQLite connection needs. */
export function configure(db: Database): void {
  db.exec('PRAGMA foreign_keys = ON');
}
