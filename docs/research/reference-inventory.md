# Reference inventory

High-level map of the reference projects in `reference/` (git-ignored). Based only on README,
LICENSE, manifests, directory structure and architecture docs — no source analysis yet.
Findings from earlier targeted searches are in [reference-projects.md](reference-projects.md);
they are referenced, not repeated. Rules for reuse: [../decisions.md](../decisions.md) D3.

Line counts are given to judge how much reading a later investigation costs.

## Overview

| Project | Purpose | Stack | License | Value for OpenAirBike |
| --- | --- | --- | --- | --- |
| `ftms` | FTMS codecs library | TypeScript | MIT (file) | High — protocol layer, test vectors |
| `Rogue_Echo_Bike_v3` | Echo Bike desktop tracker | Python, PyQt6, bleak | "MIT" in README only | Medium — Echo facts, workout templates |
| `rogue_garmin_bridge` | Echo Bike/Rower → FIT → Garmin | Python, Flask, SQLite | "MIT" in README only | Medium — FIT export, schema lessons, simulators |
| `ewoc` | Android indoor-cycling app | Kotlin, Compose | GPL-3.0-or-later | Medium — concepts only (workout format, session flow, quirks) |
| `ftms-toolkit` | FTMS discovery/calibration tools | Python, bleak | none | Low — resistance-control bikes |

---

## ftms (`ftms-main`, `@deancochran/ftms` 0.2.0)

1. **Purpose:** runtime-neutral FTMS codecs: bytes → typed, normalised data; control request encoding. No BLE, no timers.
2. **Stack:** TypeScript (ESM, Node ≥ 20), pnpm, Biome, Vitest-style tests, JSON Schema (Ajv) for the corpus.
3. **License:** MIT, `LICENSE` present (© 2026 Dean Cochran). Vectors already adopted as test fixtures (D3).
4. **Structure:** `src/` (6 files, ~2.1k lines) · `test/` (7 files) · `conformance/v1/` (`vectors.json`, `schema.json`) · `scripts/` (package verification) · `.github/workflows/` (CI, publish).
5. **Relevant components:** measurement parsers, feature/range decoders, control-point encoder + response decoder, machine-status decoder, conformance corpus.
6. **Likely important files:** `src/parsers.ts` (1080), `src/control.ts` (487), `src/features.ts` (216), `src/types.ts` (211), `src/constants.ts` (133); `test/measurements.test.ts`, `test/control.test.ts`.
7. **Investigate later:**
   - Control Point request/response handling and its safety notes (README "Control safety and ownership") — relevant for v0.2 if the Echo exposes a Control Point (research R6).
   - How Resistance Level and other fields are sized per GSS vs. legacy XML (research R1).
   - Diagnostics model (truncation, reserved flags, trailing bytes) vs. our conformance monitor.
   - Control/status vectors not yet used in our tests.

## Rogue_Echo_Bike_v3 (`Rogue_Echo_Bike_v3-main`)

1. **Purpose:** macOS desktop workout tracker for the Echo Bike V3 over FTMS: live metrics, zones, structured workouts, personal bests, CSV/JSON export.
2. **Stack:** Python ≥ 3.9, PyQt6, pyqtgraph, bleak; PyInstaller spec for a macOS app bundle.
3. **License:** "MIT" stated in README; **no LICENSE file, no copyright line** → unclarified, facts only.
4. **Structure:** flat — `tracker.py` (CLI), `gui_tracker.py` (GUI), `EchoBike.spec`, `build_icon.py`, `docs/` (landing/privacy pages), `assets/`.
5. **Relevant components:** Echo discovery (UUID scan + name fallback), Indoor Bike Data parser, optional HR subscription, Control Point writes, workout templates, training zones, PB tracking.
6. **Likely important files:** `gui_tracker.py` (1921; parser, scan/connect, workout builder, session save), `tracker.py` (483; minimal CLI flow).
7. **Investigate later:**
   - Workout template definitions (Tabata, EMOM, 30/30 …) as *ideas* for v0.2 templates (no code/text reuse).
   - Which Control Point writes it sends and how it handles missing responses (R6).
   - Zone and PB calculations (v0.3 analytics ideas).
   - Pairing notes already captured in [echo-bike-v3.md](echo-bike-v3.md); no packet captures in the repo.

## rogue_garmin_bridge (`rogue_garmin_bridge-main`)

1. **Purpose:** bridge Rogue Echo Bike / Echo Rower to Garmin Connect: BLE/FTMS → workout storage → FIT files → upload; Flask web UI; Docker / Raspberry Pi deployment.
2. **Stack:** Python, Flask, bleak, `pyftms`, `fit-tool`, `garth` (Garmin), SQLite; pytest; Docker Compose.
3. **License:** "MIT" stated in README; **no LICENSE file** → unclarified, facts only. `pyftms` license not verified.
4. **Structure:** `src/ftms/` (connector, manager, connection manager, simulators, scenarios) · `src/data/` (database, workout manager, processor) · `src/fit/` (converter, validator, analyzer, speed calculator, device identification) · `src/web/` (blueprints, templates, static) · `src/utils/` · `tests/` (unit, integration, fit_validation, simulator, performance, fixtures) · `docs/developer-guide/architecture.md` · deployment files.
5. **Relevant components:** device connection flow, workout data flow, FIT generation, simulators with workout scenarios, SQLite schema (JSON-per-sample, see reference-projects.md), analytics (NP, IF, TSS, VO2max).
6. **Likely important files:** `src/ftms/ftms_connector.py` (1163), `src/ftms/connection_manager.py` (564), `src/data/database.py` (992), `src/data/workout_manager.py` (816), `src/fit/fit_converter.py` (439), `src/fit/device_identification.py` (375), `src/ftms/workout_scenarios.py` (617), `docs/developer-guide/architecture.md` (627).
7. **Investigate later:**
   - FIT export: required messages/fields for Garmin, device identification, speed calculation — for "Later: data export".
   - Connection/reconnect strategy in `connection_manager.py` vs. ours.
   - Simulator scenarios as ideas for test scenarios (e.g. dropouts, spikes).
   - Test fixtures: any recorded real Echo data would answer R1–R7.

## ewoc (`ewoc-main`)

1. **Purpose:** Android indoor-cycling app for FTMS trainers with structured workouts, HR sensor, FIT export; plus a desktop workout editor.
2. **Stack:** Kotlin, Gradle (JDK 21), Jetpack Compose (Android, minSdk 33), Compose Desktop; shared Kotlin modules.
3. **License:** **GPL-3.0-or-later** → concepts only, never code or text.
4. **Structure:** `app/` (Android; packages `ble`, `ftms`, `session`, `workout`, `compat`, `baseline`, `ui`, `ai`, `logging`) · `apps/desktop/` (editor) · `modules/ewo-core`, `ewo-editor-model`, `ewo-editor-commands` · `spec/ewo/` (workout format spec + schema + fixtures) · `tools/ewo-validator-cli` · `docs/` (architecture, BLE recovery, FTMS reference, trainer variability, HR control rules).
5. **Relevant components:** session orchestration state machine, BLE status/recovery, FTMS setup sequence, device compatibility checks with a quirks folder, workout format and runner, FIT export, HR sensor handling.
6. **Likely important files (for concept reading):** `docs/architecture.md`, `docs/ftms-protocol-reference.md`, `docs/trainer-variability-strategy.md`, `docs/ble-status-and-recovery.md`, `spec/ewo/README.md` + `versioning.md`; code packages `session/` (`SessionOrchestrator.kt` 4740), `compat/` (+ `quirks/`), `workout/runner/` (`WorkoutStepper.kt` 737), `ble/FtmsBleClient.kt` (767).
7. **Investigate later (concepts only):**
   - Workout file format design and versioning (`spec/ewo/`) — input for our own v0.2 workout format.
   - Workout runner / stepper model (targets, steps, timing) — v0.2 Workout Engine.
   - Compatibility-check taxonomy and quirks structure — compare with our profiles + conformance monitor.
   - End-of-session and control ownership semantics (`ftms-protocol-reference.md`) — v0.2 Control Point.
   - HR sensor reconnect policy — "Later: heart-rate sensors".

## ftms-toolkit (`ftms-toolkit-main`)

1. **Purpose:** CLI tools to discover FTMS devices, control resistance and calibrate power curves (for ERG on resistance-only bikes).
2. **Stack:** Python ≥ 3.10, bleak.
3. **License:** **none** → all rights reserved; nothing reusable.
4. **Structure:** flat — `discover.py`, `bike_control.py`, `calibrate.py`, `README.md`.
5. **Relevant components:** generic GATT/FTMS discovery dump with live decoding; resistance control (not applicable to an air bike).
6. **Likely important files:** `discover.py` (486) only.
7. **Investigate later:** only if we build a standalone discovery/capture tool — which characteristics it dumps beyond FTMS. Otherwise low priority.

---

## Suggested order for targeted investigations

| When | Project → area | Question it answers |
| --- | --- | --- |
| v0.2 Workout Engine | ewoc `spec/ewo/` + runner docs (concepts); Echo tracker templates (ideas) | Workout format, step model, templates |
| v0.2 Control Point (if R6 = yes) | ftms `src/control.ts` + README safety notes; ewoc FTMS reference (concepts) | Request control, start/stop, response handling |
| Data export | bridge `src/fit/` | FIT file structure for Garmin/Strava |
| Device variety | ewoc `compat/quirks` (concepts) | How to model device quirks in profiles |
| Anytime | bridge tests/fixtures | Existing real Echo recordings? |
