# OpenAirBike target architecture (minimal)

Status: proposal, 2026-09-27. No implementation. Based on `docs/research/`
([architecture-gap](../research/architecture-gap.md), [ftms-ble-analysis](../research/ftms-ble-analysis.md),
[workout-engine-analysis](../research/workout-engine-analysis.md),
[recording-storage-analysis](../research/recording-storage-analysis.md),
[feature-matrix](../research/feature-matrix.md)) and decisions D1–D4 in [../decisions.md](../decisions.md).

## Principles

* TypeScript, one **modular monolith**, local-first (browser, Web Bluetooth, SQLite WASM in OPFS — D1).
* Modules are **directories with import rules**, not packages. One `package.json`.
* Ports/adapters only where there are, or will soon be, several implementations: transport,
  device, repositories, clock. Pure logic (codecs, engine, analytics) has no ports.
* No microservices, no event-bus framework, no DI container, no plugin system, no scaling
  abstractions.
* The Rogue Echo Bike V3 is **a device profile**; the domain knows only an opaque `profileId`.
* The workout engine knows no BLE. Analytics knows no Rogue. The UI never sees FTMS bytes.
* Errors are values in pure modules; exceptions only at I/O edges, caught in the application.

## Modules

| # | Module (dir) | Responsibility | Is not responsible for |
| --- | --- | --- | --- |
| 1 | **Transport** `transport/` | BLE/GATT only: choose, connect, reconnect, read, subscribe, (later) write; bytes + timestamps out; connection state. Virtual peripherals: simulator, replay. Capture format v1 (GATT-level, protocol-agnostic). | parsing, device names, sessions |
| 2 | **FTMS Protocol** `protocol/ftms/` | Pure codecs (Indoor Bike Data, Feature, Status, later Control Point, ranges), Data Record reassembly, conformance rules (SIG TS/ICS), typed payload issues. | I/O, timers, device quirks |
| 3 | **Device** `device/` | The `FitnessDevice` port and its FTMS indoor-bike adapter: setup sequence, subscriptions, protocol → canonical mapping, capability detection, device events, diagnostics. **Profiles** (`echoBikeV3`, `genericFtmsIndoorBike`): matchers, expected capabilities, quirks as data. | persistence, workouts, UI |
| 4 | **Canonical Telemetry** `telemetry/` | `TelemetrySample` in D2 units, `deviceCounters` separate, `Capabilities`, `TelemetryStream` (freshness, stale detection). | FTMS, recording, storage |
| 5 | **Domain** `domain/` | Entities and value objects: Session, Sample, SessionEvent, SessionSummary, Device identity, WorkoutDefinition (authored), later Athlete, BenchmarkResult. Domain event types. Repository **ports**. | I/O, BLE, any device knowledge beyond `profileId` |
| 6 | **Workout Engine** `workout/` | Validate + compile a WorkoutDefinition to a timeline; state machine; goal progress (time, kcal, m); cues; injected clock. | BLE, device control, persistence |
| 7 | **Recording** `recording/` | Turn the telemetry stream into Samples via counter deltas; pause/resume; batched flush through `SessionRepository`; crash recovery. | analytics beyond the final summary call, UI |
| 8 | **Analytics** `analytics/` | Pure functions over stored domain data: summary, (later) zones, PRs, interval comparison, benchmark scoring, ghost deltas. | telemetry streams, devices, storage |
| 9 | **Persistence** `persistence/` | Repository implementations: in-memory, SQLite (worker, migrations, single-owner lock). Portable SQL (D1). | file formats, business rules |
| 10 | **Application** `app/` | Use cases and orchestration: connect, start/pause/finish, run workout, history, diagnostics, export. Policies (pause on device stop, link-loss handling). View models + commands for the UI. The only module that wires concrete adapters. | rendering, parsing |
| 11 | **UI** `ui/` | Views, i18n, formatting (D2), browser download. Talks only to the application. | FTMS, SQL, business rules |
| 12 | **Integrations** `integrations/` | File formats in and out: session JSON/CSV (today), FIT, workout file, ZWO import, (later) benchmark/workout sharing links. Pure transformations `domain ⇄ bytes/text`. Garmin = FIT file only. | network calls (none planned), UI |
| – | `shared/` | Tiny pure helpers used everywhere: emitter, `Clock` port, UUID helpers, units. | anything domain-specific |
| – | `main.ts` | Composition root: builds adapters, repositories and the application. | logic |

Rogue-specific code exists in exactly one place: `device/profiles/echoBikeV3.ts` (plus captures in
`test/fixtures/captures/`).

## Dependencies

Arrows point to what a module may import. Everything not listed is forbidden.

```text
                      ┌────────────── main.ts (composition root) ─────────────┐
                      ▼                                                       │
  ui ─────────────► app ──► workout ──┬──► domain ◄── persistence              │
   │ (types only:    │ ├──► recording ─┼──► analytics ──► domain                │
   │  domain,        │ ├──► analytics  │                                        │
   │  telemetry)     │ ├──► integrations ──► domain                             │
   │                 │ ├──► persistence                                          │
   │                 │ └──► device ──► protocol/ftms                             │
   │                 │        │  └───► transport                                 │
   │                 │        └──────► telemetry, domain (identity types)        │
   └────────────────►  all modules ──► shared                                    │
                     workout, recording ──► telemetry                            │
```

| Module | May import | Must not import |
| --- | --- | --- |
| shared | – | everything |
| transport | shared | protocol¹, device, telemetry, domain, … |
| protocol/ftms | shared | transport, device, anything above |
| device | transport, protocol, telemetry, domain (identity/capability types), shared | workout, recording, analytics, persistence, integrations, app, ui |
| telemetry | shared | transport, protocol, device, domain² |
| domain | shared | every other module |
| workout | domain, telemetry, shared | transport, protocol, device, recording, persistence, app, ui |
| recording | domain, telemetry, analytics, shared | transport, protocol, device, persistence (uses the domain port), app, ui |
| analytics | domain, shared | telemetry, device, protocol, transport, persistence, app, ui |
| persistence | domain, shared | device, protocol, transport, workout, recording, app, ui |
| integrations | domain, shared; `transport/capture` for capture files | device, protocol, persistence, app, ui |
| app | all except ui | ui |
| ui | app; **type-only** from domain, telemetry; shared | transport, protocol, device, persistence, integrations, recording, workout, analytics |

¹ Exception: `transport/virtual/simulator` may import FTMS **encoders** because it emulates a
device. `transport/webBluetooth` and `transport/virtual/replay` must not.
² Domain `Sample` and telemetry `TelemetrySample` are deliberately separate; `recording` converts.

Enforcement without new packages: one `test/architecture.test.ts` that scans `import` lines under
`src/` and checks this table.

## Data flow

```text
Echo Bike ─BLE─► transport ──GattNotification{uuid, bytes, receivedAt}──┬──► capture buffer (app) ─► integrations/capture file
 (or simulator / replay)                                                 │
                                                                         ▼
                        device: reassembly → decode → conformance → profile quirks → canonical mapping
                                                                         │
                                  ┌──── DeviceEvent (connected, lost, machine started/paused/stopped)
                                  ▼                                      ▼
                                 app ◄──────────────── TelemetryStream (TelemetrySample, freshness)
                   ┌──────────────┼───────────────────────┬──────────────────────┐
                   ▼              ▼                       ▼                      ▼
             recording      workout engine          live view model          diagnostics view model
       Sample + SessionEvent  progress, cues,        (canonical values)      (conformance, log,
                   │          step/goal events                                formatted packet lines)
                   ▼              │
        SessionRepository (port) ◄┘ step events persisted as SessionEvent
                   │
             persistence/sqlite ──► analytics (summary, PRs, ghost, benchmarks) ──► app ──► ui
                                     integrations (JSON, CSV, FIT) ◄── app ◄── ui "export"
```

Only `app` connects these arrows; modules below it never call each other sideways except as
listed in the dependency table.

## Telemetry stream

| Aspect | Rule |
| --- | --- |
| Sample | `TelemetrySample { at, powerW?, cadenceRpm?, speedKmh?, heartRateBpm?, deviceCounters { distanceM?, energyKcal?, elapsedS? } }` plus source (`deviceId`, `profileId`). D2 units. `undefined` = not available, never `0`. |
| Rate | as delivered by the device (~1 Hz assumed, R11); no resampling at the source (S2 open). |
| Time | `at` = receive time of the completing packet. The clock is injected (`shared/Clock`), so simulator and replay control time. |
| Freshness | `live → stale` after 3.5 s without data → `disconnected` on link loss. Stale is a state, not an error. |
| Counters | device counters are untrusted input; only `recording` turns them into deltas. Nobody above telemetry uses them as totals. |
| Delivery | synchronous in-process emitter; consumers must be cheap (recording batches I/O). No backpressure mechanism needed at 1 Hz. |
| Consumers | recording, workout engine, live view model, (later) ghost comparison through the app. |

## Domain events

Plain data objects, emitted in-process; the persistent ones are stored as `SessionEvent`.

| Event | Producer | Consumers | Persisted |
| --- | --- | --- | --- |
| `SessionStarted` / `SessionFinished{summary}` / `SessionRecovered` | recording | app, ui, analytics (PR check, later) | ✅ session row |
| `SessionPaused{reason: user / device / idle}` / `SessionResumed` | recording (via app policy) | workout engine, ui | ✅ |
| `DeviceLinkLost` / `DeviceLinkRestored` | app (from device events) | recording, ui | ✅ |
| `WorkoutStarted{definitionId, version}` / `WorkoutFinished` / `WorkoutEndedEarly` | workout | app, recording | ✅ (definition snapshot with the session) |
| `StepStarted{stepId, round, kind}` / `StepCompleted{reason: time / goal / skipped}` | workout | recording (laps, interval analytics), ui | ✅ |
| `CueDue{kind, secondsLeft}` | workout | ui | – |
| `PersonalRecordSet`, `BenchmarkCompleted` (later) | analytics via app | ui | ✅ |

Device events (`connected`, `setupFailed`, `machineStarted/Paused/Stopped`, `reset`) stay in the
device module's vocabulary; the app translates them into domain events.

## Device capabilities

* Defined in `telemetry/` as canonical capabilities, so workout, analytics and UI can use them
  without knowing devices:
  metrics `power, cadence, speed, heartRate, distance, energy, elapsedTime`; events
  `machineStatus`; control `startStop` (only if R6/R10 confirm); **no target control** (air bike).
* Each capability carries its origin: `reported` (Feature bits), `observed` (field actually seen),
  `expected` (profile). The device module computes the set; mismatches become diagnostics.
* Uses: UI chooses tiles; workout validation checks "executable on this device" (e.g. a kcal goal
  needs `energy` or `power`); benchmarks declare required capabilities.

## Error boundaries

| Module | Failure | Handling |
| --- | --- | --- |
| transport | BLE errors, permission denied, link loss | typed connection states, bounded reconnect with backoff; no exception escapes to callers |
| protocol | malformed / truncated payload | result with issues, never throws; conformance monitor records them |
| device | setup fails (no FTMS, missing characteristic), bad packet | setup → typed error to app; bad packet dropped + diagnosed; profile mismatch → warning |
| telemetry | no data | `stale` state |
| workout | invalid definition; missing data at runtime | validation errors (codes) before start; at runtime goal progress pauses + warning, engine never throws |
| recording | persistence write fails | retry queue, samples kept in memory, session marked; live view unaffected |
| persistence | DB locked by another tab, migration fails | `DatabaseLockedError`; app blocks start with message + export option |
| analytics, integrations | bad or partial data, invalid import | results with issues / error codes; exports are all-or-nothing |
| app | anything from the above | maps to UI state + i18n key; logged to diagnostics |
| ui | – | renders states; no business logic |

## Ports

| Port | Defined in | Implementations |
| --- | --- | --- |
| `Transport` / `GattLink` | transport | Web Bluetooth, simulator, replay (planned) |
| `FitnessDevice` | device | FTMS indoor bike (+ profiles) |
| `SessionRepository`, `DeviceRepository`, `SettingsRepository` (+ later `WorkoutRepository`, `AthleteRepository`) | domain | memory, SQLite |
| `Clock` | shared | system, fake (tests), replay |

Not ports: FTMS codecs, workout engine, analytics, file formats — each has one implementation.

## Monorepo structure

One repository, **one package** (no workspaces yet). `src/` directories are the modules:

```text
openairbike/
├─ package.json            one package; runtime dep: @sqlite.org/sqlite-wasm only
├─ index.html · vite.config.ts · tsconfig.json
├─ src/
│  ├─ main.ts              composition root
│  ├─ shared/              emitter, Clock, uuid, units
│  ├─ transport/           types.ts (ports) · capture.ts · webBluetooth.ts · virtual/{simulator,replay}.ts
│  ├─ protocol/ftms/       bytes, indoorBikeData, machineInfo, dataRecord, conformance, uuids (+ control, ranges later)
│  ├─ device/              types.ts (FitnessDevice, DeviceEvent) · ftms-indoor-bike/ · profiles/{echoBikeV3,genericFtmsIndoorBike}.ts
│  ├─ telemetry/           types.ts (TelemetrySample, Capabilities) · stream.ts
│  ├─ domain/              types.ts · events.ts · repositories.ts (ports) · workout.ts (definitions)
│  ├─ workout/             compile.ts · validate.ts · engine.ts
│  ├─ recording/           recorder.ts · sessionRecording.ts
│  ├─ analytics/           summary.ts (+ zones, records, benchmarks, ghost later)
│  ├─ persistence/         memory/ · sqlite/{client,worker,migrate,sqlRepositories}.ts, migrations/
│  ├─ integrations/        sessionExport.ts (JSON/CSV) (+ fit/, workoutFile.ts, zwo.ts later)
│  ├─ app/                 app.ts (facade) + use-case files when app.ts grows (connection, session, workout, history, diagnostics)
│  └─ ui/                  views, i18n, format, dom, style.css
├─ test/                   mirrors src; architecture.test.ts; fixtures/{third-party,captures}/
└─ docs/                   architecture/, research/, decisions.md, ftms-notes.md
```

Moves from today's `src/` (proposal, not done): `adapters/` → `device/`; `util/` → `shared/`
(browser `wakeLock` → `app/`); `recording/summary.ts` → `analytics/`;
`persistence/export.ts` → `integrations/sessionExport.ts` with `download()` → `ui/`;
the app's packet-capture formatting → `device` diagnostics / `transport/capture.ts`, so
`app` no longer imports `protocol`. Current rule violations: `ui → persistence/export`,
`app → protocol` (hex/UUID names for diagnostics).

**When to split into workspaces** (and only then): a second runtime needs the core without the
DOM, e.g. a Node capture/replay CLI or the local recorder service (option B in architecture-gap).
Then exactly two: `packages/core` (shared, protocol, device without Web Bluetooth, telemetry, domain,
workout, recording, analytics, integrations) and `apps/web` (Web Bluetooth transport, SQLite WASM,
app, ui). Not one package per module.

## Detailed designs

* [device-telemetry-model.md](device-telemetry-model.md) — canonical telemetry, device model,
  capabilities and the `FitnessDevice` / `TelemetrySource` / simulated / replay interfaces.

## Open points

* S1–S4 ([recording-storage-analysis](../research/recording-storage-analysis.md)): raw packets
  per session, 1 s grid, FIT writer, capture format v1.
* Where `WorkoutDefinition` lives if definitions become shareable across apps (domain today; a
  published spec later).
* Whether `app` stays one facade or splits into use-case files — split only when `app.ts` becomes
  hard to read.
