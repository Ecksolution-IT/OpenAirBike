import { RepositoryError, type Repositories } from '../../domain/repositories';
import type { CallMessage, SerializedError, Target, WorkerMessage } from './protocol';

const LOCK_NAME = 'openairbike-database';

/** The database is owned by another tab (OPFS access handles are exclusive). */
export class DatabaseLockedError extends Error {
  constructor() {
    super('OpenAirBike is already open in another tab or window. Close it there to use it here.');
    this.name = 'DatabaseLockedError';
  }
}

export interface SqliteStore {
  repositories: Repositories;
  schemaVersion: number;
  sqliteVersion: string;
  /** The whole database as a standard SQLite file, for backup and data access. */
  exportDatabase(): Promise<Uint8Array>;
  close(): void;
}

function deserializeError(e: SerializedError): Error {
  if (e.name === 'RepositoryError') return new RepositoryError(e.message);
  if (e.name === 'NoModificationAllowedError') return new DatabaseLockedError();
  const err = new Error(e.message);
  err.name = e.name;
  return err;
}

/**
 * Takes an exclusive Web Lock for the database, held until `release` is called.
 * Resolves false if another tab holds it. Resolves true without locking where the
 * Web Locks API is missing; the worker then still fails cleanly on a second tab.
 */
function acquireLock(): Promise<{ acquired: boolean; release: () => void }> {
  if (typeof navigator === 'undefined' || !navigator.locks) return Promise.resolve({ acquired: true, release: () => {} });
  return new Promise((resolve) => {
    void navigator.locks.request(LOCK_NAME, { ifAvailable: true }, (lock) => {
      if (!lock) {
        resolve({ acquired: false, release: () => {} });
        return undefined;
      }
      return new Promise<void>((release) => resolve({ acquired: true, release }));
    });
  });
}

/** Opens the app database in a dedicated worker. Only one tab can have it open. */
export async function openSqliteStore(): Promise<SqliteStore> {
  const lock = await acquireLock();
  if (!lock.acquired) throw new DatabaseLockedError();

  // Ask the browser not to evict the database under storage pressure (best effort).
  void navigator.storage?.persist?.().catch(() => false);

  const worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
  const pending = new Map<number, { resolve: (v: unknown) => void; reject: (e: Error) => void }>();
  let nextId = 1;

  const ready = new Promise<{ schemaVersion: number; sqliteVersion: string }>((resolve, reject) => {
    worker.onmessage = (event: MessageEvent<WorkerMessage>) => {
      const msg = event.data;
      switch (msg.type) {
        case 'ready':
          resolve(msg);
          return;
        case 'failed':
          reject(deserializeError(msg.error));
          return;
        case 'result':
          pending.get(msg.id)?.resolve(msg.result);
          pending.delete(msg.id);
          return;
        case 'error':
          pending.get(msg.id)?.reject(deserializeError(msg.error));
          pending.delete(msg.id);
          return;
      }
    };
    worker.onerror = (event) => reject(new Error(`Database worker failed: ${event.message}`));
  });

  let info: { schemaVersion: number; sqliteVersion: string };
  try {
    info = await ready;
  } catch (err) {
    worker.terminate();
    lock.release();
    throw err;
  }

  const call = (target: Target, method: string, args: unknown[]) =>
    new Promise<unknown>((resolve, reject) => {
      const id = nextId++;
      pending.set(id, { resolve, reject });
      worker.postMessage({ id, target, method, args } satisfies CallMessage);
    });

  /** Forwards every method call to the worker. `then` is excluded so the proxy is not thenable. */
  const proxy = <T>(target: Target): T =>
    new Proxy(
      {},
      {
        get: (_obj, method) => (typeof method === 'string' && method !== 'then' ? (...args: unknown[]) => call(target, method, args) : undefined),
      },
    ) as T;

  return {
    repositories: {
      sessions: proxy('sessions'),
      devices: proxy('devices'),
      settings: proxy('settings'),
    },
    schemaVersion: info.schemaVersion,
    sqliteVersion: info.sqliteVersion,
    exportDatabase: () => call('database', 'export', []) as Promise<Uint8Array>,
    close: () => {
      worker.terminate();
      for (const p of pending.values()) p.reject(new Error('Database closed.'));
      pending.clear();
      lock.release();
    },
  };
}
