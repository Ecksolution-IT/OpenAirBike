import type { SessionRepository } from '../domain/repositories';
import type { Sample, SessionEvent } from '../domain/types';
import type { TelemetrySample } from '../telemetry/types';
import { WorkoutRecorder } from './recorder';
import { summarize } from './summary';

export interface SessionRecordingOptions {
  id?: string;
  /** Must already be stored, or be stored by `after`. */
  deviceId?: string;
  /** Resolves before the session is created, e.g. the device being saved. Errors are ignored. */
  after?: Promise<unknown>;
  /** How often buffered samples and events are written. 0 disables the timer (tests). */
  flushIntervalMs?: number;
  now?: () => number;
  /** Called when a background write fails; the data stays buffered and is retried. */
  onError?: (err: unknown) => void;
}

const DEFAULT_FLUSH_INTERVAL_MS = 5000;

/**
 * One recording session: a WorkoutRecorder plus persistence through a SessionRepository.
 * Samples and events are buffered and written in batches, so an interrupted session loses at
 * most one flush interval and can be recovered with `recoverSession`. All writes run strictly
 * in order on one queue.
 */
export class SessionRecording {
  readonly id: string;
  readonly recorder = new WorkoutRecorder();
  private readonly now: () => number;
  private readonly onError: (err: unknown) => void;
  private readonly timer: ReturnType<typeof setInterval> | undefined;
  private queue: Promise<void>;
  private samples: Sample[] = [];
  private events: SessionEvent[] = [];

  constructor(
    private readonly repository: SessionRepository,
    options: SessionRecordingOptions = {},
  ) {
    this.id = options.id ?? crypto.randomUUID();
    this.now = options.now ?? Date.now;
    this.onError = options.onError ?? (() => undefined);

    const startedAt = this.now();
    this.recorder.start(startedAt);
    const deviceId = options.deviceId;
    this.queue = (options.after ?? Promise.resolve()).catch(() => undefined).then(() => undefined);
    void this.enqueue(() => repository.start({ id: this.id, startedAt: new Date(startedAt).toISOString(), deviceId })).catch(() => undefined);

    const interval = options.flushIntervalMs ?? DEFAULT_FLUSH_INTERVAL_MS;
    this.timer = interval > 0 ? setInterval(() => void this.flush().catch(() => undefined), interval) : undefined;
  }

  get state() {
    return this.recorder.state;
  }

  addSample(sample: TelemetrySample): void {
    const recorded = this.recorder.addSample(sample);
    if (recorded) this.samples.push(recorded);
  }

  pause(): void {
    if (this.recorder.state !== 'recording') return;
    const now = this.now();
    this.recorder.pause(now);
    this.events.push({ tMs: this.recorder.elapsedMs(now), kind: 'pause' });
  }

  resume(): void {
    if (this.recorder.state !== 'paused') return;
    const now = this.now();
    this.recorder.resume(now);
    this.events.push({ tMs: this.recorder.elapsedMs(now), kind: 'resume' });
  }

  /** Records something that happened (link loss, console button, …) at the current active time. */
  note(kind: 'link-lost' | 'link-restored' | 'device', detail?: string): void {
    if (this.recorder.state === 'finished') return;
    this.events.push({ tMs: this.recorder.elapsedMs(this.now()), kind, ...(detail && { detail }) });
  }

  /** Writes buffered samples and events. Keeps them buffered if the write fails. */
  flush(): Promise<void> {
    return this.enqueue(async () => {
      const samples = this.samples;
      const events = this.events;
      this.samples = [];
      this.events = [];
      try {
        if (samples.length) await this.repository.appendSamples(this.id, samples);
      } catch (err) {
        this.samples = [...samples, ...this.samples];
        this.events = [...events, ...this.events];
        throw err;
      }
      try {
        if (events.length) await this.repository.appendEvents(this.id, events);
      } catch (err) {
        this.events = [...events, ...this.events];
        throw err;
      }
    });
  }

  /** Stops recording, writes everything and finishes the session with its summary. */
  async stop(): Promise<void> {
    clearInterval(this.timer);
    const now = this.now();
    const { activeS, summary } = this.recorder.stop(now);
    await this.flush();
    await this.enqueue(() =>
      this.repository.finish(this.id, { status: 'finished', endedAt: new Date(now).toISOString(), activeS, summary }),
    );
  }

  /** Stops the timer without finishing, e.g. when the session is discarded. */
  dispose(): void {
    clearInterval(this.timer);
  }

  private enqueue(operation: () => Promise<void>): Promise<void> {
    const result = this.queue.then(operation);
    this.queue = result.catch((err) => this.onError(err));
    return result;
  }
}

/**
 * Finishes a session that was interrupted (app closed while recording) from the samples that
 * were saved. The end time is estimated from the last sample, ignoring pauses (assumption).
 */
export async function recoverSession(repository: SessionRepository, sessionId: string): Promise<boolean> {
  const detail = await repository.get(sessionId);
  if (!detail || detail.session.status !== 'recording') return false;
  const lastMs = detail.samples[detail.samples.length - 1]?.tMs ?? 0;
  await repository.finish(sessionId, {
    status: 'recovered',
    endedAt: new Date(Date.parse(detail.session.startedAt) + lastMs).toISOString(),
    activeS: Math.round(lastMs / 1000),
    summary: summarize(detail.samples),
  });
  return true;
}
