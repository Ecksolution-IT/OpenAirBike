/// <reference lib="webworker" />
/**
 * Database worker: owns the SQLite database in the Origin Private File System (opfs-sahpool
 * VFS, no COOP/COEP headers needed — see docs/research/spike-sqlite-opfs.md) and serves
 * repository calls from the main thread.
 */
import sqlite3InitModule from '@sqlite.org/sqlite-wasm';
import { configure, migrate } from './migrate';
import { serializeError, type CallMessage, type WorkerMessage } from './protocol';
import { createSqlRepositories } from './sqlRepositories';

const DB_FILE = '/openairbike.sqlite3';

const post = (message: WorkerMessage, transfer: Transferable[] = []) => self.postMessage(message, transfer);

const ready = (async () => {
  const sqlite3 = await sqlite3InitModule();
  const pool = await sqlite3.installOpfsSAHPoolVfs({ name: 'openairbike' });
  const db = new pool.OpfsSAHPoolDb(DB_FILE);
  configure(db);
  const schemaVersion = migrate(db);
  return { repositories: createSqlRepositories(db), pool, schemaVersion, sqliteVersion: sqlite3.version.libVersion };
})();

ready.then(
  ({ schemaVersion, sqliteVersion }) => post({ type: 'ready', schemaVersion, sqliteVersion }),
  (err) => post({ type: 'failed', error: serializeError(err) }),
);

self.onmessage = async (event: MessageEvent<CallMessage>) => {
  const { id, target, method, args } = event.data;
  try {
    const { repositories, pool } = await ready;
    if (target === 'database') {
      if (method !== 'export') throw new Error(`Unknown database method ${method}.`);
      const bytes = await pool.exportFile(DB_FILE);
      post({ type: 'result', id, result: bytes }, [bytes.buffer]);
      return;
    }
    const repository = repositories[target] as unknown as Record<string, (...a: unknown[]) => Promise<unknown>>;
    if (typeof repository[method] !== 'function') throw new Error(`Unknown method ${target}.${method}.`);
    post({ type: 'result', id, result: await repository[method](...args) });
  } catch (err) {
    post({ type: 'error', id, error: serializeError(err) });
  }
};
