import { Emitter } from '../util/emitter';
import type { TelemetrySample } from './types';

/** A reading older than this is shown as unavailable rather than frozen. */
export const STALE_AFTER_MS = 3500;

/** Live stream of canonical samples, independent of where they come from. */
export class TelemetryStream extends Emitter<{ sample: TelemetrySample }> {
  private _latest: TelemetrySample | undefined;

  get latest(): TelemetrySample | undefined {
    return this._latest;
  }

  /** Latest sample if it is recent enough to be trusted, otherwise undefined. */
  current(now = Date.now()): TelemetrySample | undefined {
    return this._latest && now - this._latest.at <= STALE_AFTER_MS ? this._latest : undefined;
  }

  push(sample: TelemetrySample): void {
    this._latest = sample;
    this.emit('sample', sample);
  }
}
