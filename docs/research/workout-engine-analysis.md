# Workout engines in the reference projects

Comparison of workout systems only (2026-09-27). Method: specs and architecture docs first, then
symbol searches and short targeted reads; no full source reading. License rules:
[../decisions.md](../decisions.md) D3. **`ewoc` is GPL-3.0: architecture, behaviour and concepts
only; no code, no text, no schema.** The Echo tracker has no LICENSE file: facts and ideas only.

Paths are relative to `reference/<project>/`. `ewoc` app paths are shortened:
`…/workout/` = `app/src/main/java/io/github/ewoc2026/ewoc/workout/`. "OAB" = OpenAirBike `main`.
`ftms-toolkit` has no workout system and is left out.

## 1. Feature matrix

| Topic | ewoc (Kotlin, GPL) | Echo tracker (Py) | garmin bridge (Py) | ftms (TS, MIT) | OAB today |
| --- | --- | --- | --- | --- | --- |
| Workout definition | versioned JSON format `.ewo` 1.x with spec, schema, conformance fixtures — `spec/ewo/v1/spec.md`; legacy `ergo_workout` JSON — `…/workout/ErgoWorkoutParser.kt`; built-ins are `.ewo` assets — `BundledWorkoutAssetCatalog.kt` | in-memory list of `Segment(name, duration_s, target_type, target_value)` — `gui_tracker.py: Segment`, `WorkoutBuilderDialog`; not persisted | none (free rides only) | none | none (`src/workout/` empty) |
| Interval model | segments `steady`, `ramp`, `free_ride`, `repeat` (count, ≥ 2 children, no nesting, no ramp inside); compiled to a flat timeline with origin metadata (source id, repeat iteration) — `modules/ewo-core/…/EwoWorkoutRepeatExpansionCompiler.kt`; ZWO `IntervalsT` → ON/OFF phases — `ExecutionWorkoutModel.kt: IntervalSegmentMetadata` | flat list; "repeat" copies rows in the editor — `_repeat_selected`; work/rest only implied by the segment *name* | – | – | – |
| State machine | runner `running/paused/done` — `…/runner/RunnerState.kt`; pure stepper `start/pause/resume/stop/restore` — `WorkoutStepper.kt`; session `MENU → CONNECTING → SESSION → STOPPING → SUMMARY`; runner starts on cadence gating — `docs/architecture.md` "Session Flow" | implicit: `_plan_idx` (−1 = idle), `_start_plan`, `_enter_segment`, `_finish_plan`, `_stop_plan`; **no pause** | – | – | recorder: `idle/recording/paused/finished` (`src/recording/`) |
| Timer / clock | injected monotonic clock, `tick(nowUptimeMs)`, 250 ms tick — `WorkoutRunner.kt`; progression in whole seconds with remainder carry; "workout time" = progressed time, pauses and reconnect stalls do not advance — `WorkoutStepper.currentElapsedSec` | `QTimer` 500 ms, wall clock `datetime.now()` minus segment start — `_tick_plan`; start restarts per segment | – | – | recorder active time from sample timestamps |
| Work / Rest | ON/OFF phase with rep index/total — `StepperOutput.kt: IntervalPartProgress` | by name (`Work`, `Rest`, `Sprint` …) → colour only | – | – | – |
| Targets | per segment: power, FTP %, HR range, HR relative, cadence (fixed or any), none (`free_ride`); messages never change execution | one per segment: `Open`, `Power`, `HR`, `Cadence` | – | CP encoders for all target op codes — `src/control.ts` | – |
| Power targets | absolute W; `ftp_percent` 0.10–2.50 resolved at compile time, error if FTP missing; ramps interpolated; written to trainer (ERG) each tick — `WorkoutRunner` → `FtmsTargetWriter` | absolute W in templates (e.g. Tabata 250/80 W); sent via CP `0x05` fire-and-forget — `send_target_power` | – | `SET_TARGET_POWER 0x05` | – |
| HR targets | `heart_rate` bpm range, `heart_rate_relative` (HRmax, HRR, LTHR); requires root `control` (min/max/initial/signal-loss power, HR cap); closed loop adjusts trainer power (5 W steps, 15 s hold-off), `HR = 0` = signal loss — `docs/HR_CONTROL_RULES.md`, `ImportedHrRuntimeStateMachineV1.kt` | bpm sent to the bike via CP `0x06`; no loop; HR zones (Karvonen) for display | – | `SET_TARGET_HEART_RATE 0x06` | HR displayed; `0` = unavailable |
| Calories | not a target; session aggregates only | summary + personal bests only — `update_pbs` | stored per sample | `SET_TARGETED_EXPENDED_ENERGY 0x09` | power-based kcal via `Accumulator` |
| Distance | not a target | summary + PBs only | stored per sample | `SET_TARGETED_DISTANCE 0x0C` | delta-based distance |
| EMOM | not a type; expressible as `repeat` | template "EMOM (40s/20s × 12)" = fixed 40/20 intervals, not "task within the minute" | – | – | – |
| Tabata | expressible as `repeat` | template 20/10 × 8 with absolute watts | – | – | – |
| FTP / ramp test | separate state machine `baseline_fitness_test_v1`: 5 min warm-up, +20 W/min, stop on cadence < 30 rpm for 10 s or power loss 8 s, FTP = 0.75 × last full step, ≥ 6 steps, confidence LOW/MED/HIGH, outcomes completed/invalid/cancelled, **advisory mode without trainer control** — `docs/fitness-test/…_repo_spec.md`, `baseline/BaselineFitnessTestProtocol.kt` | templates only: 20 min "Open" (user takes 95 % manually, README), ramp = 13 fixed steps +20 W; no auto-stop, no result | – | – | – |
| Validation | 3 levels `structural` / `semantic` / `runtime_executable`; stable error codes — `EwoWorkoutSemanticValidator.kt`; plausibility warnings (missing warm-up, ramp too steep, sprint recovery too short) — `EwoWorkoutSanityValidator.kt`; mapping errors — `ExecutionWorkoutModel.kt: MappingErrorCode`; unknown fields rejected | "at least one segment"; spin-box ranges | – | – | – |
| Import / export | import `.ewo`, `.zwo`, legacy JSON — `WorkoutImportService.kt`; export `.ewo`, `.zwo` subset (editor); sessions as FIT | none for workouts; sessions JSON + CSV | sessions → FIT → Garmin | – | sessions JSON/CSV/.sqlite |
| ZWO | offline format reference with element inventory, aliases (`SolidState`, `Freeride`, `MaxEffort`), power fallbacks, unknown steps kept but not executed — `docs/zwo-format-reference.md`, `modules/ewo-core/…/zwo/ZwoImporter.kt` | – | – | – | – |
| Simulator / mock | `session/MockTrainerEngine.kt`: synthetic Indoor Bike Data, power follows the target with inertia, cadence/speed derived, time-window overrides; feeds the same HR supervision path | – | phase-based statistical rider (`enhanced_bike_simulator.py: WorkoutPhaseConfig`) + scenario error injection (connection drop, gaps, power spike, HR dropout) — `workout_scenarios.py`, `workout_scenarios.json` | – | `SimulatedTransport` (`autoRun`, `step()`) |

## 2. Common ground

* A workout is an ordered list of **time-based** steps; repeats become a flat timeline before execution.
* One primary target per step, mostly power; warm-up/cool-down are ordinary steps.
* A tick-driven runner produces "current step, remaining time, next step, total progress".
* Both assume a **controllable trainer** (ERG): targets are written to the device. An air bike has no
  controllable resistance, so for OAB targets are **advisory** (assumption until R6/R10 are answered;
  even with a Control Point, the bike cannot enforce power).
* Neither completes a step on **calories or distance**, and neither implements a real EMOM
  (goal inside a fixed minute, remainder is rest). Both are core air-bike formats (README "Custom Workouts").
* FTP is one stored rider value; zones are derived from it.

## 3. Good architecture ideas (concepts to adopt)

| Idea | Seen in | Why it fits OAB |
| --- | --- | --- |
| Authored definition ≠ compiled execution timeline; each compiled step keeps its origin (block, round, phase) | ewoc | round-by-round display ("Interval 6 / 10") and v0.3 interval comparison |
| Pure stepper with injected clock, `tick(now)` and `restore(state)`; runner/timer outside | ewoc | deterministic tests; fits our crash recovery |
| Workout time = active (progressed) time; pause and link loss do not advance it | ewoc | same rule as our recorder (active time, deltas) |
| Validation levels: structural → semantic → executable *on this device*; warnings separate from errors; stable error codes | ewoc | codes map to i18n keys; executability depends on capabilities (e.g. no HR source) |
| Relative targets (FTP %, % HRmax) resolved at compile time with an explicit error if the anchor is missing | ewoc | keeps the runtime simple |
| Cues anchored to step start/end with an offset (e.g. end −3 s), which never change execution | ewoc | countdown "3-2-1" before a work phase |
| Start gating on the first pedal stroke | ewoc | natural for an air bike; no "press start, then run to the bike" |
| Fitness test as its own state machine with stop reasons, outcomes and confidence; measured power scores the test; advisory mode | ewoc | exactly the air-bike situation (no ERG) |
| HR safety: HR = 0 means missing, never raise intensity on uncertainty | ewoc | we already treat 0 as unavailable |
| Air-bike template catalogue (Tabata, 10-20-30, pyramid, sprint repeats, 4 × 8 min), "next step" preview, total progress bar | Echo tracker | good v0.2 template ideas (own definitions) |
| Scenario-based fault injection (gaps, spikes, drops) in the simulator | bridge | test engine behaviour under link loss |

## 4. Problematic architecture ideas (avoid)

| Problem | Seen in | Consequence for OAB |
| --- | --- | --- |
| Runner writes targets to the device inside the tick loop | ewoc (`WorkoutRunner` → target writer), tracker (`_enter_segment` sends Request Control + target + Start per segment, fire-and-forget) | engine only **emits** targets; an optional control adapter decides whether and how to send anything |
| Two workout models (legacy + execution) handled inside one stepper (`legacy*` / `execution*` functions) | ewoc | convert at the import boundary; the engine knows one model |
| God object for session orchestration (`SessionOrchestrator.kt`, ~4.7k lines) | ewoc | keep engine, recording and app wiring separate (modular monolith) |
| Step meaning derived from the display name; repeat by copying rows | tracker | typed step kind (work/rest/…) and a real repeat block with round numbers |
| Wall clock per segment restarted on every advance, 500 ms tick, no pause, keeps running during link loss | tracker | boundaries from cumulative active time; *analysis:* each advance can lose up to one tick, i.e. up to ~8 s over a 16-step Tabata |
| Absolute watt targets in shared templates | tracker | templates are effort/time based; watts only relative to the rider or as optional guidance |
| Only time-based completion; strict repeat limits | ewoc | calorie/distance goals and EMOM must be first-class in our model |
| Closed-loop HR control of trainer power | ewoc | not applicable to an air bike; HR is display/zone guidance only |
| Closed-world format that rejects every unknown field | ewoc | trade-off: good for interoperability, but hinders forward compatibility; decide explicitly for our format |
| Engine logic inside UI classes; plans not persisted or shareable | tracker | engine in `src/workout/`, definitions in SQLite |
| Unseeded random simulator data (*assumption*, not verified) | bridge | our simulator scenarios must be deterministic |

## 5. Requirements for an OpenAirBike Workout Engine

Layering (see [architecture-gap.md](architecture-gap.md)): `src/workout/` depends only on `domain`
and `telemetry` types; `app` wires it to recording and UI.

| # | Requirement |
| --- | --- |
| WE-1 | Pure TypeScript, no I/O, DOM, timers or BLE. Inputs: compiled workout, clock readings, telemetry samples, commands (start, pause, resume, skip, end). Outputs: state snapshot + events (step started/ended, cue, goal reached, finished). |
| WE-2 | Device-agnostic and **advisory by default**: the engine never writes to a device. Device control (FTMS Control Point start/stop sync) is a separate, optional adapter capability, only after R6/R10. |
| WE-3 | Two models: authored definition (versioned, stored, exported) and compiled flat timeline (repeats expanded, relative targets resolved, origin block/round/phase per step). |
| WE-4 | Step completion by **time, calories or distance**. Calories and distance come from OAB's own delta accounting (`recording/Accumulator`), never from raw device counters. |
| WE-5 | Clock: injected monotonic clock; engine time = active workout time; boundaries computed from cumulative active time (no per-step restart, no drift); millisecond precision, rounding only for display. |
| WE-6 | One explicit state machine: `ready → (countdown) → running ⇄ paused → finished / ended-early`. Pause comes from the user **and** from the recording pause (Machine Status stop/pause, link loss). Optional start on first pedal stroke. |
| WE-7 | EMOM semantics: fixed period per round; the work part ends at the goal (e.g. kcal), the remainder of the period is rest; a missed goal is recorded, not fatal. |
| WE-8 | Recording integration: a workout run belongs to a session; step boundaries are persisted as `SessionEvent`s so interval analytics and crash recovery can rebuild the engine state. |
| WE-9 | Validation with stable error codes (i18n keys): structural, semantic (durations > 0, rounds ≥ 1, ranges), executable on the connected device (e.g. HR target without HR source → warning). Warnings separate from errors. |
| WE-10 | Own versioned JSON format (format id + version), stored in SQLite (portable SQL, D1), exportable; no dependency on `.ewo` or ZWO. |
| WE-11 | Units per D2 (s, m, kcal, W, bpm, rpm); display through the existing formatters; template names and cue texts through i18n keys. |
| WE-12 | Cues as engine events (e.g. 3-2-1 before a transition, halfway); sound/vibration/visual rendering belongs to the UI. |
| WE-13 | Safety: no automatic intensity increase; pause and end are always available; HR targets are guidance only. |
| WE-14 | Testability: table-driven unit tests with a fake clock; end-to-end with `SimulatedTransport` scripted effort profiles and fault scenarios (gap, link loss, counter reset). |

## 6. Minimal scope for the first engine version

*Interpretation:* product v0.1 "Ride" (recording) is done. The first engine version is the
v0.1 of the Workout Engine and ships as product **v0.2 "Train"** (README roadmap: interval timer,
custom intervals, templates, target workouts, progress).

* **Definition:** steps of kind `warmup / work / rest / cooldown`, each with a time goal; one
  repeat block (rounds × steps, no nesting); optional advisory note or target text.
* **Target workout:** a whole-workout goal in kcal **or** km (README "100 calories or 10 km").
* **Templates (own definitions):** Intervals (e.g. 10 × 0:30 / 1:30), Tabata (8 × 0:20 / 0:10),
  EMOM time-based (minute on / minute off, as in the README), target workout (kcal / km).
* **Custom intervals:** rounds, work, rest, optional warm-up/cool-down; saved in SQLite.
* **Runtime:** state machine (WE-6) incl. pause tied to recording, skip step, end early.
* **Live view:** current step, round x / y, remaining time or remaining kcal/km, next step, total
  progress; 3-2-1 countdown cue (visual; audio optional).
* **Recording:** step events in the session; summary per round deferred to v0.3.
* **Validation:** semantic checks with error codes.
* **Tests:** fake clock + simulator scenarios.

Not included: power/HR/cadence targets, ramps, FTP-relative values, calorie EMOM, import/export,
ZWO, Control Point, fitness tests.

## 7. Later extensions

| Area | Extension | Depends on |
| --- | --- | --- |
| Goals | per-step kcal/distance goals, calorie EMOM, "whichever comes first" | W1, W2 |
| Targets | advisory power ranges, cadence ranges, ramps; FTP-relative targets; rider profile (FTP, HRmax, resting HR) and zones | profile model |
| Heart rate | HR zones and HR-range guidance (display only, never closed loop) | R5 |
| Tests | fitness/ramp test as its own state machine in advisory mode (stop on cadence drop, result + confidence) | reliable Echo power (W3) |
| Formats | import/export of the own JSON; ZWO import (time-based subset; `%FTP` needs FTP); sessions as FIT with laps from step events | WE-10 |
| Device | Control Point start/stop synchronisation with the console | R6, R10 |
| Analytics (v0.3) | round comparison, consistency per interval via origin metadata | WE-3, WE-8 |
| Habit (v0.4) | Active Work Breaks and quick workouts as short templates | — |
| UI | visual workout editor, sharing | — |

## Open questions for the real bike

| # | Question | Why |
| --- | --- | --- |
| W1 | How far do OAB's power-based kcal and the console's Total Energy differ? Which should drive calorie goals, and which is shown? | calorie goals must match what the rider sees on the console |
| W2 | Does console distance match OAB's speed-based distance? | distance goals |
| W3 | How plausible and smooth is the Echo's instantaneous power (spikes, lag)? | power guidance, fitness tests |
| W4 | Update rate and latency of Indoor Bike Data (see R11) | precision of goal completion and cues |
| W5 | Does the console report pause/stop (Machine Status) when the rider stops (see R4, R12)? | automatic engine pause |

Capture routine: extend the one in [ftms-ble-analysis.md](ftms-ble-analysis.md#7-open-questions-for-the-real-bike)
with a 50 kcal effort and a 1 km effort, noting the console's displayed values at the end.
