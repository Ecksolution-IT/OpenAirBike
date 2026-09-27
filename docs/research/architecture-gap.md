# Target layering vs. current code

Target (from the project owner, 2026-09-26): a modular monolith with the layers
Transport · Protocol · Device Adapter · Canonical Telemetry · Domain · Workout Engine ·
Recording/Analytics · Persistence · Application · UI. The Rogue Echo Bike V3 is the first target
device but must not become the centre of the domain.

First technical goal: Echo Bike V3 → BLE → FTMS → Canonical Telemetry → Recording → **SQLite**
→ minimal live display.

This page is the analysis that led to the plan. The target layering has since been implemented
(plan steps 2–10, see [../plan-first-technical-goal.md](../plan-first-technical-goal.md) and the
layer table in the README); the tables below describe the state before that.

## Where the v0.1 code stood (before plan steps 2–5)

| Target layer | Current code | Fit |
| --- | --- | --- |
| Transport | `src/device/webBluetooth.ts` | Partly. GATT connect/reconnect is mixed with FTMS discovery, subscriptions and Device Information reads. |
| Protocol | `src/ftms/*` (parsers, record assembly, conformance) | Good. Pure functions, no I/O. |
| Device Adapter | — | Missing. Echo-specific knowledge (name prefixes) sits in the transport; there is no place for per-device behaviour profiles. |
| Canonical Telemetry | `TelemetrySample` in `src/telemetry/engine.ts` | Close. But units are FTMS-flavoured (km/h) and the bike's session counters are passed through without saying they are device counters. |
| Domain | `src/recorder/workout.ts` types | Implicit. Workout, sample and summary exist; no explicit device / session concepts. |
| Workout Engine | — | Not needed before v0.2. |
| Recording/Analytics | `src/recorder/recorder.ts`, `summarize()` | Good. Counter-delta logic already treats device counters as untrusted (matches the "app owns the logical session" principle). |
| Persistence | `src/storage/workoutStore.ts` (IndexedDB) | Deviates: target is SQLite. |
| Application | `src/app.ts` | Good. Orchestrates layers; UI only talks to it. |
| UI | `src/ui/*` | Good. |

## Proposed module boundaries (for discussion)

```text
src/
  transport/        BLE only: scan/choose, connect, reconnect, subscribe, read, write. Bytes in/out.
  protocol/ftms/    Codecs + Data Record assembly + conformance. No I/O.   (today: src/ftms)
  adapters/         Maps protocol data of one device family to Canonical Telemetry.
    ftms-indoor-bike/     generic FTMS indoor bike (default)
    profiles/echo-bike-v3 overrides only where the Echo differs (name filter, quirks)
  telemetry/        Canonical Telemetry types + live stream (freshness, stale detection).
  domain/           Session, Workout, Sample, Summary, Device identity. No I/O.
  workout/          Workout Engine (v0.2).
  recording/        Recorder + analytics (summaries, later PRs/trends).
  persistence/      Repository interfaces + SQLite implementation.
  app/              Use cases / orchestration.     (today: src/app.ts)
  ui/
```

Dependency direction: `ui → app → (recording, workout, persistence, adapters) → telemetry/domain`;
`adapters → protocol`; `transport` knows nothing above it. Only `app` wires concrete transports,
adapters and repositories together.

Assumptions behind this proposal:

* A1: A per-device **profile** (data + small overrides) is enough; no plugin system is needed.
* A2: Canonical Telemetry uses SI-style units (m/s, m, W, kcal, 1/min, s) and marks device
  counters explicitly as `deviceCounters`, so the domain never mistakes them for workout totals.
* A3: The simulator becomes a **transport** fake (emits FTMS bytes), as today, so adapters and
  everything above are exercised unchanged.

## Open decision: where does SQLite run?

Web Bluetooth only exists in the browser; SQLite needs either WebAssembly in the browser or a
local process. Options:

| Option | How | For | Against |
| --- | --- | --- | --- |
| **A. Browser + SQLite WASM** | Official SQLite WebAssembly build, database persisted in the Origin Private File System (OPFS) | One process, no install, keeps the current Web Bluetooth stack; real SQL for analytics | Database lives inside the browser profile (export needed for backup/access); requires a worker for OPFS sync access |
| **B. Local service + web UI** | Local process (Node or Python) does BLE and writes an SQLite file; browser shows the UI via localhost | Real `.sqlite` file the user owns; headless recording (e.g. Raspberry Pi next to the bike) | Native BLE libraries per OS, installation, two processes, BLE stack rewrite |
| C. Desktop shell | Tauri/Electron around the web app | File-based SQLite and BLE in one app | Adds a framework (against the "no unnecessary frameworks" rule) |

**Decided: A** (D1, [ADR 0007](../architecture/adr/0007-sqlite-in-browser.md)); A5 verified by
[spike 1](spike-sqlite-opfs.md). B remains possible later behind the repository interfaces.

## SQLite schema sketch (not implemented)

Lesson from `rogue_garmin_bridge`: one JSON blob per sample row is hard to query. Typed columns
keep v0.3 analytics (PRs, trends) in plain SQL.

```sql
device   (id, adapter, name, manufacturer, model, firmware, first_seen, last_seen)
session  (id, device_id, started_at, ended_at, active_s, status, schema_version)
sample   (session_id, t_ms, power_w, cadence_rpm, speed_mps, heart_rate_bpm,
          distance_m, energy_kcal, PRIMARY KEY (session_id, t_ms))
summary  (session_id PRIMARY KEY, distance_m, energy_kcal, avg_power_w, max_power_w,
          avg_cadence_rpm, max_cadence_rpm, avg_speed_mps, max_speed_mps, avg_hr, max_hr)
event    (session_id, t_ms, kind, detail)     -- pause/resume, link loss, machine status
raw_packet (session_id, received_at, characteristic, bytes)   -- optional, diagnostics only
```

## Decisions

Decided on 2026-09-26, see [../decisions.md](../decisions.md): D1 SQLite in the browser behind
portable repository interfaces (option A), D2 metric units as used in Germany, D3 adopt what the
license allows but no dependency on reference projects, D4 clean start without migration.
Resulting plan: [../plan-first-technical-goal.md](../plan-first-technical-goal.md).
