/**
 * Canonical Telemetry: the one representation of live training data that everything above
 * the Device Adapter uses, whatever the device or protocol. Units follow decision D2
 * (metric, as used in Germany/Europe); every field is optional because devices differ.
 */
export interface TelemetrySample {
  /** Epoch milliseconds when the reading was received. */
  at: number;
  /** Watts. */
  powerW?: number;
  /** Revolutions per minute (U/min). */
  cadenceRpm?: number;
  /** km/h. */
  speedKmh?: number;
  /** Beats per minute. */
  heartRateBpm?: number;
  /**
   * Running totals that the *device* keeps for its own session. They are not workout totals:
   * they start before the workout, do not pause with it and may reset (console reset, sleep).
   * Recording derives workout totals from their deltas.
   */
  deviceCounters: DeviceCounters;
}

export interface DeviceCounters {
  /** Meters. */
  distanceM?: number;
  /** kcal. */
  energyKcal?: number;
  /** Seconds. */
  elapsedS?: number;
}
