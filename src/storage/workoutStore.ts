import type { Workout, WorkoutHeader } from '../recorder/workout';

const DB_NAME = 'openairbike';
const DB_VERSION = 1;
/** Full workouts including samples. */
const WORKOUTS = 'workouts';
/** Workouts without samples, so the history list stays fast. */
const HEADERS = 'headers';
/** Small key/value records: the in-progress draft, the last bike id. */
const META = 'meta';
const DRAFT_KEY = 'draft';

function promisify<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function done(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error ?? new Error('Transaction aborted'));
  });
}

export function headerOf(workout: Workout): WorkoutHeader {
  const { samples: _samples, ...header } = workout;
  return header;
}

/** Local Storage: workouts live in the browser's IndexedDB. Nothing leaves the device. */
export class WorkoutStore {
  private constructor(private readonly db: IDBDatabase) {}

  static async open(factory: IDBFactory = indexedDB, name = DB_NAME): Promise<WorkoutStore> {
    const request = factory.open(name, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      db.createObjectStore(WORKOUTS, { keyPath: 'id' });
      db.createObjectStore(HEADERS, { keyPath: 'id' }).createIndex('startedAt', 'startedAt');
      db.createObjectStore(META);
    };
    return new WorkoutStore(await promisify(request));
  }

  async save(workout: Workout): Promise<void> {
    const tx = this.db.transaction([WORKOUTS, HEADERS], 'readwrite');
    tx.objectStore(WORKOUTS).put(workout);
    tx.objectStore(HEADERS).put(headerOf(workout));
    await done(tx);
  }

  async get(id: string): Promise<Workout | undefined> {
    return promisify(this.db.transaction(WORKOUTS).objectStore(WORKOUTS).get(id));
  }

  /** All workouts without samples, newest first. */
  async list(): Promise<WorkoutHeader[]> {
    const index = this.db.transaction(HEADERS).objectStore(HEADERS).index('startedAt');
    const headers: WorkoutHeader[] = await promisify(index.getAll());
    return headers.reverse();
  }

  async delete(id: string): Promise<void> {
    const tx = this.db.transaction([WORKOUTS, HEADERS], 'readwrite');
    tx.objectStore(WORKOUTS).delete(id);
    tx.objectStore(HEADERS).delete(id);
    await done(tx);
  }

  async all(): Promise<Workout[]> {
    return promisify(this.db.transaction(WORKOUTS).objectStore(WORKOUTS).getAll());
  }

  /** Stores the workout in progress, overwriting the previous draft. */
  async saveDraft(workout: Workout): Promise<void> {
    await this.setMeta(DRAFT_KEY, workout);
  }

  async loadDraft(): Promise<Workout | undefined> {
    return this.getMeta<Workout>(DRAFT_KEY);
  }

  async clearDraft(): Promise<void> {
    const tx = this.db.transaction(META, 'readwrite');
    tx.objectStore(META).delete(DRAFT_KEY);
    await done(tx);
  }

  async getMeta<T>(key: string): Promise<T | undefined> {
    return promisify(this.db.transaction(META).objectStore(META).get(key));
  }

  async setMeta(key: string, value: unknown): Promise<void> {
    const tx = this.db.transaction(META, 'readwrite');
    tx.objectStore(META).put(value, key);
    await done(tx);
  }

  close(): void {
    this.db.close();
  }
}
