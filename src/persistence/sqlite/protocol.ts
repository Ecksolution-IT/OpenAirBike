/** Messages between the main thread (client.ts) and the database worker (worker.ts). */

export type Target = 'sessions' | 'devices' | 'settings' | 'database';

export interface CallMessage {
  id: number;
  target: Target;
  method: string;
  args: unknown[];
}

export interface SerializedError {
  name: string;
  message: string;
}

export type WorkerMessage =
  | { type: 'ready'; schemaVersion: number; sqliteVersion: string }
  | { type: 'failed'; error: SerializedError }
  | { type: 'result'; id: number; result: unknown }
  | { type: 'error'; id: number; error: SerializedError };

export const serializeError = (err: unknown): SerializedError =>
  err instanceof Error ? { name: err.name, message: err.message } : { name: 'Error', message: String(err) };
