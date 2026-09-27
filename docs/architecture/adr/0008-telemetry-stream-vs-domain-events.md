# ADR 0008 — Telemetry stream and domain events are separate channels

## Status

Accepted (2026-09-26). Implemented: `TelemetryStream` (`src/telemetry/stream.ts`), `sample` and
`session_event` tables, `SessionRecording.note()`.

## Context

Two very different kinds of information flow through the app:

* **telemetry** — a continuous ~1 Hz stream of measurements whose individual values matter only in
  aggregate and whose freshness matters (stale after 3.5 s);
* **facts** — rare, discrete things that happened: pause, resume, link lost/restored, console
  started/stopped, later workout steps.

Mixing them either floods an event log with measurements or loses facts inside sample rows. The
references store both as generic JSON rows (bridge) or not at all (tracker).

## Decision

* Live measurements travel on the **telemetry stream**: an in-process, synchronous emitter of
  canonical samples with freshness detection. It is not an event log and is never replayed from
  storage; recording turns it into **samples** (`sample` table, one typed row per time step).
* Discrete facts are **domain events**: small typed records with a session-relative time,
  persisted as **`session_event`** rows (`pause`, `resume`, `link-lost`, `link-restored`,
  `device`) and consumed in-process by the app and UI.
* Device-level events (console buttons, connection states) stay in the device vocabulary; the
  **application translates** them into domain events.
* No event-bus framework, no event sourcing: sessions are stored as state (session row + samples)
  plus an append-only event list.

## Alternatives

| Option | Why not |
| --- | --- |
| Everything as events (event sourcing) | 3 600 events/h for measurements; complex rebuilds for no gain |
| Everything as sample columns | facts like "paused" or "link lost" would be inferred, not recorded |
| Message bus library | unnecessary for a single-process app (ADR 0002) |

## Consequences

* Summaries and analytics query typed samples; timelines and laps use events.
* Workout steps will be added as further event kinds, which is what interval analytics and FIT
  laps need. The full catalogue in [../architecture.md](../architecture.md) and
  [../workout-engine.md](../workout-engine.md) is designed, not yet decided.
* Consumers of the stream must be cheap and synchronous; I/O is batched by recording.
