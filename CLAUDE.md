# OpenAirBike — notes for Claude Code

Open-source, local-first training software for the **Rogue Echo Bike V3** over Bluetooth FTMS.
A static TypeScript web app (Web Bluetooth + SQLite WASM in the browser). Apache-2.0.

## Status (2026-09-27)

* **v0.1 "Ride" is code-complete** (find → connect → live data → record → SQLite → summary →
  history) and verified with the simulated bike and in headless Chromium. **Not yet run on a real
  Echo Bike V3.** MVP acceptance criteria: [docs/product/mvp.md](docs/product/mvp.md).
* **Milestones 0 (hardware proof) and v0.0.1 "First Ride" are implemented** as the developer tool
  `tools/hardware-proof/` (`npm run diagnose`: live canonical telemetry + optional debug details).
  Next step: run [docs/testing/first-ride.md](docs/testing/first-ride.md) on the real bike, commit an
  anonymised capture, answer R1–R13 and update the Echo profile.
* Designed but **not implemented**: workout engine, telemetry/device model changes, replay device,
  module renames. Nothing is implemented without an explicit request.

## Commands

```text
npm install
npm run dev            # app (Chrome/Edge; Web Bluetooth needs HTTPS or localhost)
npm run diagnose       # developer tool: scan, connect, live telemetry, debug details
npm run typecheck && npm test && npm run build    # CI runs exactly these
```

## Code map (current)

```text
src/transport/        GATT only: Web Bluetooth (+ reconnect), simulated/ (emits real FTMS bytes); GattLink port incl. inventory()
src/protocol/ftms/    pure FTMS codecs, Data Record reassembly, conformance monitor (FTMS.TS / ICS)
src/adapters/         FTMS indoor-bike adapter → canonical telemetry; profiles/ (echoBikeV3 = data only)
src/telemetry/        TelemetrySample (D2 units, deviceCounters separate), TelemetryStream (stale 3.5 s)
src/domain/           Session, Sample, SessionEvent, Summary, repository interfaces
src/recording/        counter deltas, pause/resume, 5 s batched flush, crash recovery, summary
src/persistence/      memory/ and sqlite/ (worker, OPFS sahpool, Web Lock, portable SQL migrations), export
src/app/ · src/ui/    use cases; plain-DOM UI, i18n (German default, English), Intl formatting
tools/hardware-proof/ developer page "diagnose" (probe, decoder, live view, capture)
test/                 vitest; FTMS vectors from @deancochran/ftms (MIT) in test/fixtures/third-party/
```

Dependency rule: lower layers never import higher ones; only `app` (and each tool's `main.ts`)
wires concrete implementations. Target structure and full import table:
[docs/architecture/architecture.md](docs/architecture/architecture.md). Known violations:
`ui → persistence/export`, `app → protocol` (diagnostics formatting).

## Decisions (all accepted and implemented)

TypeScript only · modular monolith, one package · local-first, no accounts/backend · FTMS is a
pure protocol module behind the device layer · canonical telemetry with separate device counters,
`undefined` never `0` · generic FTMS adapter + data-only profiles (Rogue is a profile, not domain) ·
SQLite WASM in OPFS behind repositories · telemetry stream vs. domain events.
Details: [docs/architecture/adr/](docs/architecture/adr/README.md) and D1–D4 in
[docs/decisions.md](docs/decisions.md) (D2 = metric units / German formats, D3 = reference reuse rules).

## Working rules from the project owner

* Work token-efficiently. **Do not re-analyse `reference/`** — read `docs/research/` first; open
  reference files only for a concrete missing fact and record the finding in `docs/research/`.
* Never copy code or text from reference projects without a cleared licence; never GPL (`ewoc`).
* No implementation unless explicitly asked. No unnecessary frameworks, packages or abstractions.
* Keep the layers separate: transport · protocol · device adapter · canonical telemetry · domain ·
  workout engine · recording/analytics · persistence · application · UI.
* The Echo Bike is the first target, never the centre of the domain.
* Mark assumptions as assumptions (verified / reported / assumption).
* The owner writes German — answer in German. Repository docs, code and commits are English.

## Where to find what

| Topic | Doc |
| --- | --- |
| MVP scope, Next/Later/Research, acceptance criteria | [docs/product/mvp.md](docs/product/mvp.md) |
| Real-bike test guide, expected FTMS functions | [docs/testing/first-ride.md](docs/testing/first-ride.md) |
| Diagnose / hardware-proof tool | [docs/product/milestone-0-hardware-proof.md](docs/product/milestone-0-hardware-proof.md) |
| Target architecture, dependency rules | [docs/architecture/architecture.md](docs/architecture/architecture.md) |
| Telemetry and device model (design) | [docs/architecture/device-telemetry-model.md](docs/architecture/device-telemetry-model.md) |
| Workout engine (design, MVP/Later) | [docs/architecture/workout-engine.md](docs/architecture/workout-engine.md) |
| FTMS requirements and where the code implements them | [docs/ftms-notes.md](docs/ftms-notes.md) |
| Echo Bike facts and open questions R1–R13 | [docs/research/echo-bike-v3.md](docs/research/echo-bike-v3.md), [docs/research/ftms-ble-analysis.md](docs/research/ftms-ble-analysis.md) |
| Reference project findings (instead of re-reading them) | [docs/research/README.md](docs/research/README.md) |
| History of the first technical goal (steps 1–10) | [docs/plan-first-technical-goal.md](docs/plan-first-technical-goal.md) |

Open questions: R1–R13 (bike behaviour), W1–W5 (calorie/distance source, power quality, latency,
console pause), S1–S4 (raw packets per session, 1 s grid, FIT writer, capture format).
