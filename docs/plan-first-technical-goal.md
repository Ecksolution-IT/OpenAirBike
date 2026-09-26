# Plan: first technical goal

Rogue Echo Bike V3 → BLE → FTMS → Canonical Telemetry → Recording → SQLite → minimal live display.

Status: **plan only, not commissioned.** Based on [decisions.md](decisions.md) D1–D4 and
[research/architecture-gap.md](research/architecture-gap.md).

## Target structure

One application, one build, modules as directories with one-way dependencies (modular monolith).

```text
src/
  transport/           Web Bluetooth: choose, connect, reconnect, subscribe, read. Bytes only.
    simulated/         Fake transport that emits FTMS bytes (today: device/simulator.ts)
  protocol/ftms/       Codecs, Data Record assembly, conformance        (today: src/ftms)
  adapters/
    ftms-indoor-bike/  Generic FTMS indoor bike → Canonical Telemetry
    profiles/          Per-device data + overrides; echo-bike-v3.ts is the first profile
  telemetry/           Canonical Telemetry types, live stream, freshness
  domain/              Device, Session, Sample, Summary, repository interfaces. No I/O.
  workout/             Workout Engine — empty until v0.2
  recording/           Recorder, counter-delta accounting, summary
  persistence/sqlite/  Worker, migrations (*.sql), repository implementations
  app/                 Use cases: connect, start/pause/stop session, list sessions
  ui/                  Live display, session list, diagnostics; formatting via Intl (de-DE)
```

Dependency rule: `ui → app → {recording, persistence, adapters, transport} → {telemetry, domain}`;
`adapters → protocol`. `domain` and `telemetry` import nothing from other modules. Only `app`
wires concrete implementations.

## Steps

Each step is one reviewable commit series with green typecheck, tests and build.

| # | Step | Result / acceptance |
| --- | --- | --- |
| 1 | **Spike: SQLite WASM in OPFS** — ✅ done, see [research/spike-sqlite-opfs.md](research/spike-sqlite-opfs.md) | Minimal worker opens a database, runs a migration, writes and reads rows in Chrome via `npm run dev` without extra headers or installs. Confirms or refutes the D1 assumption about `opfs-sahpool`. Throw-away if it fails. |
| 2 | **Move modules, no behaviour change** — ✅ done | Directories as above; `src/ftms` → `protocol/ftms`, `device/` → `transport/`. All existing tests pass unchanged. |
| 3 | **Split transport from FTMS** — ✅ done | `transport/` only knows GATT; the FTMS discovery/subscription sequence moves to `adapters/ftms-indoor-bike`. Echo name prefixes move into `profiles/echo-bike-v3.ts`. |
| 4 | **Canonical Telemetry** — ✅ done | Types per D2 (km/h, m, W, kcal, 1/min, s); device session counters carried explicitly as `deviceCounters`. Adapter tests from byte fixtures. |
| 5 | **Parser cross-check** — ✅ done | Copy `@deancochran/ftms` bike/feature/status vectors with MIT notice (D3); our parser must agree, except documented differences (Resistance Level size, see research R1). |
| 6 | **Domain + repository interfaces** — ✅ done | `Device`, `Session`, `Sample`, `Summary`, `SessionRepository`, `DeviceRepository`. In-memory implementation for tests. |
| 7 | **SQLite persistence** — ✅ done | Single-tab ownership via Web Lock (spike finding). Portable schema ([sketch](research/architecture-gap.md#sqlite-schema-sketch-not-implemented)), migrations as `.sql` files, repositories in the worker. Samples written in batches while recording (replaces the IndexedDB draft, D4). Repository contract tests run against in-memory and SQLite. |
| 8 | **Recording on the new stack** | Recorder consumes Canonical Telemetry and writes through the repository; pause/resume/stop and link-loss behaviour as today. |
| 9 | **Minimal live display** | Power, cadence, heart rate or speed, time, distance, energy; de-DE formatting; connection state. Session list with summary. Diagnostics and packet capture kept. |
| 10 | **Remove v0.1 leftovers** | IndexedDB store, JSON/CSV export via SQLite queries instead; README and docs updated. |

Steps 1 and 5 can run in parallel with 2–4. Step 1 is deliberately first: if in-browser SQLite
does not work without installing anything, D1 must be revisited before building on it.

## Out of scope for this goal

Workout Engine (intervals, targets), analytics beyond the session summary, Control Point writes,
heart-rate sensors, server database, FIT export.

## Needs hardware

Before or during step 3/4, a packet capture from a real Echo Bike V3 answers the open questions
R1–R7 in [research/echo-bike-v3.md](research/echo-bike-v3.md) and fills the Echo profile.
