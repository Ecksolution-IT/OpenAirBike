import type { Sample, SessionSummary } from '../domain/types';
import type { TelemetrySample } from '../telemetry/types';
import { summarize } from './summary';

export type RecorderState = 'idle' | 'recording' | 'paused' | 'finished';

/** Longest gap between samples that is integrated when the bike has no counter of its own. */
const MAX_INTEGRATION_GAP_S = 5;

/** Metabolic energy from mechanical work: 4.184 kJ per kcal at ~24 % gross efficiency. */
export const KCAL_PER_WATT_SECOND = 1 / (4184 * 0.24);

/**
 * Accumulates a quantity for the workout, preferring the bike's own running counter
 * (Total Distance, Total Energy) and falling back to integrating a rate over time.
 *
 * Bike counters refer to the *bike's* training session, which neither starts with the
 * workout nor pauses with it, so only the deltas between consecutive readings are used.
 */
export class Accumulator {
  total = 0;
  private lastCounter: number | undefined;
  private lastAt: number | undefined;

  add(at: number, counter: number | undefined, ratePerS: number | undefined): void {
    if (counter !== undefined) {
      if (this.lastCounter !== undefined) {
        const delta = counter - this.lastCounter;
        // A counter that goes backwards means the bike started a new session from zero.
        this.total += delta >= 0 ? delta : counter;
      }
      this.lastCounter = counter;
    } else if (ratePerS !== undefined && this.lastAt !== undefined) {
      const dt = Math.min(Math.max(0, (at - this.lastAt) / 1000), MAX_INTEGRATION_GAP_S);
      this.total += ratePerS * dt;
    }
    this.lastAt = at;
  }

  /** Forget the previous reading, so that movement while paused is not counted. */
  rebase(): void {
    this.lastCounter = undefined;
    this.lastAt = undefined;
  }
}

const round = (v: number | undefined, digits: number) =>
  v === undefined ? undefined : Math.round(v * 10 ** digits) / 10 ** digits;

/** Result of a stopped recording. */
export interface RecordingResult {
  /** Active (non-paused) seconds, rounded. */
  activeS: number;
  summary: SessionSummary;
}

/**
 * Recorder: turns canonical telemetry into domain samples with start / pause / resume / stop.
 * Pure in-memory state; persisting samples is the job of `SessionRecording`.
 */
export class WorkoutRecorder {
  private _state: RecorderState = 'idle';
  /** Active milliseconds of all finished recording segments. */
  private activeMsBefore = 0;
  private segmentStart = 0;
  private readonly samples: Sample[] = [];
  private readonly distance = new Accumulator();
  private readonly energy = new Accumulator();

  get state(): RecorderState {
    return this._state;
  }

  get sampleCount(): number {
    return this.samples.length;
  }

  start(now = Date.now()): void {
    if (this._state !== 'idle') throw new Error(`Cannot start a recording that is ${this._state}.`);
    this.segmentStart = now;
    this._state = 'recording';
  }

  pause(now = Date.now()): void {
    if (this._state !== 'recording') return;
    this.activeMsBefore += Math.max(0, now - this.segmentStart);
    this._state = 'paused';
  }

  resume(now = Date.now()): void {
    if (this._state !== 'paused') return;
    this.segmentStart = now;
    this.distance.rebase();
    this.energy.rebase();
    this._state = 'recording';
  }

  stop(now = Date.now()): RecordingResult {
    if (this._state === 'idle' || this._state === 'finished') throw new Error('No recording in progress.');
    this.pause(now);
    this._state = 'finished';
    return { activeS: Math.round(this.elapsedS(now)), summary: summarize(this.samples) };
  }

  /** Active (non-paused) seconds at `now`. */
  elapsedS(now = Date.now()): number {
    const running = this._state === 'recording' ? Math.max(0, now - this.segmentStart) : 0;
    return (this.activeMsBefore + running) / 1000;
  }

  /** Active milliseconds at `now`, as used for sample and event timestamps. */
  elapsedMs(now = Date.now()): number {
    return Math.round(this.elapsedS(now) * 1000);
  }

  get distanceM(): number {
    return this.distance.total;
  }

  get energyKcal(): number {
    return this.energy.total;
  }

  /** Records a sample while recording; returns it, or undefined if it was not recorded. */
  addSample(s: TelemetrySample): Sample | undefined {
    if (this._state !== 'recording' || s.at < this.segmentStart) return undefined;

    this.distance.add(s.at, s.deviceCounters.distanceM, s.speedKmh === undefined ? undefined : s.speedKmh / 3.6);
    this.energy.add(s.at, s.deviceCounters.energyKcal, s.powerW === undefined ? undefined : Math.max(0, s.powerW) * KCAL_PER_WATT_SECOND);

    const sample: Sample = {
      tMs: this.elapsedMs(s.at),
      powerW: round(s.powerW, 0),
      cadenceRpm: round(s.cadenceRpm, 1),
      speedKmh: round(s.speedKmh, 2),
      heartRateBpm: s.heartRateBpm,
      distanceM: round(this.distance.total, 1)!,
      energyKcal: round(this.energy.total, 1)!,
    };
    this.samples.push(sample);
    return sample;
  }
}
