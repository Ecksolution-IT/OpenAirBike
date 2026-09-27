# ADR 0005 — Canonical telemetry with separate device counters

## Status

Accepted (D2 and plan step 4, 2026-09-26). Implemented in `src/telemetry/types.ts` and
`src/adapters/ftms-indoor-bike/canonical.ts`.

## Context

Recording, workouts, analytics and UI need live values without knowing where they come from. FTMS
uses its own resolutions and optional fields. The bike's distance, energy and elapsed time are
running totals of the **console's** session: they start before the workout, do not pause with it
and may reset. The bridge coerces missing values to `0`; the tracker uses the console's last
counters as session totals; ewoc keeps its own totals with offsets
([../../research/recording-storage-analysis.md](../../research/recording-storage-analysis.md)).
Units must match what a German/European rider expects (D2).

## Decision

* One **canonical telemetry sample** is the only live data format above the device layer.
* Units per D2: W, 1/min, km/h, bpm, m, kcal, s. No unit conversion between recording and display.
* Every metric is optional; **`undefined` means not available** — never `0`.
* Instantaneous metrics (power, cadence, speed, heart rate) are separated from **`deviceCounters`**
  (distance, energy, elapsed time), which are explicitly the device's own totals.
* Session totals are **OAB's own**: recording derives them from counter deltas; nothing above
  telemetry uses device counters as totals.

## Alternatives

| Option | Why not |
| --- | --- |
| Pass FTMS records upward | couples all layers to FTMS (ADR 0004) |
| SI units everywhere (m/s) | conversion at every display; D2 chose rider units; FIT export converts |
| `0` for missing values | indistinguishable from a real zero (rider stopped) |
| Console counters as session totals | wrong when starting mid console-session, pausing or after a reset |

## Consequences

* Workouts and summaries can start at any time, respect pauses and survive counter resets.
* The FTMS mapping lives in one function; unmapped fields (averages, resistance, MET, remaining
  time) stay diagnostic.
* Proposed extensions — monotonic timestamp, `sourceId`, heart-rate source, `counterEpoch`,
  capabilities with reported/expected/observed origin — are designed in
  [../device-telemetry-model.md](../device-telemetry-model.md) and not yet decided.
