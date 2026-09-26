import type { IndoorBikeData } from './indoorBikeData';

type DataFields = Omit<IndoorBikeData, 'moreData' | 'truncated'>;

/**
 * Reassembles Data Records that a bike splits across several notifications (FTMS §4.19,
 * FTMP §4.4.7): every notification but the last has the More Data bit set to 1.
 *
 * `push` returns the complete record once the final notification arrives, otherwise `undefined`.
 */
export class DataRecordAssembler {
  private pending: DataFields | undefined;

  push(part: IndoorBikeData): DataFields | undefined {
    const { moreData, truncated: _truncated, ...fields } = part;

    // A misbehaving server might never clear More Data. If a field repeats, the previous
    // record is evidently over; emit what we have instead of stalling forever.
    let flushed: DataFields | undefined;
    if (moreData && this.pending && Object.keys(fields).some((k) => k in this.pending!)) {
      flushed = this.pending;
      this.pending = undefined;
    }

    this.pending = { ...this.pending, ...fields };
    if (moreData) return flushed;

    const record = this.pending;
    this.pending = undefined;
    return record;
  }

  /** Drops a partially received record, e.g. after a link loss (FTMS §4.18). */
  reset(): void {
    this.pending = undefined;
  }
}
