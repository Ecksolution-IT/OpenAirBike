# Workout engine

Status: design proposal, 2026-09-27. No implementation; TypeScript is illustrative only.
Inputs: [../research/workout-engine-analysis.md](../research/workout-engine-analysis.md)
(requirements WE-1–WE-14), [architecture.md](architecture.md) (module rules, domain events),
[device-telemetry-model.md](device-telemetry-model.md) (telemetry, capabilities, time).

## 1. Scope and independence

The engine turns a workout definition plus a stream of **activity snapshots** into a workout
state and events. It is a pure state machine in `src/workout/`.

| Must not know | How |
| --- | --- |
| Rogue / any device model | inputs are canonical numbers; capabilities only through `isAvailable()` |
| Bluetooth, FTMS | never imports `transport`, `protocol`, `device` (architecture rule) |
| UI framework (React or any) | emits plain state + events; rendering is `ui/` |
| SQLite | definitions arrive as values; events leave as values; `app` persists them |
| Wall clock / timers | time arrives inside the snapshot; the engine never calls `Date.now()` or `setTimeout` |

Because it depends only on snapshots, the same engine runs unchanged with a live device, the
`SimulatedFitnessDevice`, the `ReplayFitnessDevice` and plain unit tests (§11).

## 2. Where it sits

```text
FitnessDevice ──► TelemetryStream ──► recording (Accumulator: deltas, pause) ──┐
                                                                                ▼
            app ticker (Clock, ~4 Hz + on every sample) ──► ActivitySnapshot ──► engine.advance()
                                                                                │
                              WorkoutState (view model) ◄──────────────────────┤
                              WorkoutEvents ──► app ──► recording (SessionEvent) + ui (cues)
```

* **Recording owns the numbers.** Active time, kcal and metres come from OAB's own delta
  accounting (WE-4), never from device counters. Pause is decided by recording/app policy
  (user, Machine Status, link loss); the engine follows via `session: 'paused'`.
* **The app owns the ticking.** It calls the engine on every merged telemetry sample and on a
  timer from the injected `Clock` (for smooth countdowns while no data arrives).

## 3. Input: activity snapshot

```ts
// workout/types.ts — design sketch
interface ActivitySnapshot {
  session: 'active' | 'paused';
  activeMs: number;          // session active time (recording), monotonic, excludes pauses
  energyKcal: number;        // OAB-accumulated since session start
  distanceM: number;         // OAB-accumulated since session start
  moving: boolean;           // cadence > 0 or distance increased in the last sample (for start trigger)
  // Later (targets): live values for target status
  powerW?: number; cadenceRpm?: number; heartRateBpm?: number;
}
```

Snapshots are cumulative, so a missed tick loses nothing: the next one carries the totals.

## 4. Workout definition (authored)

Lives in `domain/` (it is persisted and exported); compiled and executed in `workout/`.

```ts
interface WorkoutDefinition {
  format: 'openairbike-workout';
  version: 1;
  id: string;                    // stable id, e.g. uuid
  name: string;                  // user text; templates use an i18n key instead
  nameKey?: string;
  description?: string;
  start: 'immediate' | 'onMovement';   // default onMovement (air bike: start when pedalling)
  blocks: Block[];
}

type Block = Step | Repeat;

interface Step {
  id: string;
  kind: 'warmup' | 'work' | 'rest' | 'cooldown';
  label?: string;
  end: EndCondition;
  hint?: EffortHint;             // MVP: display-only effort hint
  target?: Target;               // Later: advisory numeric targets
}

interface Repeat {
  id: string;
  kind: 'repeat';
  rounds: number;                // 1–99
  steps: Step[];                 // ≥ 1; MVP: no nested repeat
  periodS?: number;              // Later: time-boxed rounds (EMOM), see §6
}

type EffortHint = 'easy' | 'moderate' | 'hard' | 'max';
```

Example — Tabata:

```json
{ "format": "openairbike-workout", "version": 1, "id": "tpl-tabata", "nameKey": "tpl.tabata",
  "name": "Tabata", "start": "onMovement",
  "blocks": [
    { "id": "wu", "kind": "warmup", "end": { "type": "time", "seconds": 300 }, "hint": "easy" },
    { "id": "main", "kind": "repeat", "rounds": 8, "steps": [
      { "id": "on",  "kind": "work", "end": { "type": "time", "seconds": 20 }, "hint": "max" },
      { "id": "off", "kind": "rest", "end": { "type": "time", "seconds": 10 } } ] },
    { "id": "cd", "kind": "cooldown", "end": { "type": "time", "seconds": 180 }, "hint": "easy" } ] }
```

Example — target workout "100 kcal": one `work` step with `{ "type": "energy", "kcal": 100 }`.
A target workout needs no special type; it is a step whose end condition is not time.

## 5. Conditions and completion criteria

```ts
type EndCondition =
  | { type: 'time'; seconds: number }        // MVP
  | { type: 'energy'; kcal: number }         // MVP
  | { type: 'distance'; meters: number }     // MVP
  | { type: 'manual' }                       // Later: until the rider skips
  | { type: 'firstOf'; any: EndCondition[] } // Later: "10 kcal or 60 s"
  | { type: 'cadenceBelow'; rpm: number; forS: number }; // Later: tests ("until failure")
```

| Condition | Met when (measured from the step's baseline) | Boundary rule |
| --- | --- | --- |
| time | `activeMs − base.activeMs ≥ seconds × 1000` | the next step's baseline is the **exact** boundary, not the tick time → no drift across many steps |
| energy | `energyKcal − base.energyKcal ≥ kcal` | baseline = snapshot where it was met (≈1 Hz data; overshoot is not carried) |
| distance | `distanceM − base.distanceM ≥ meters` | same as energy |

* A step completes when its condition is met or on `skip`. The workout **finishes** when the last
  compiled step completes; it **ends early** on `end`.
* Several steps can complete in one `advance()` (a long tick crossing boundaries); the engine loops
  until the current step is not complete, emitting events in order.
* While `session: 'paused'` nothing progresses (active time stands still by definition).
* Missing data never completes a step: if kcal stop increasing (stale), the energy step simply waits.

## 6. Intervals, EMOM, Tabata

| Pattern | Expressed as | MVP |
| --- | --- | --- |
| Intervals (10 × 0:30 / 1:30) | `Repeat{rounds:10, steps:[work 30 s, rest 90 s]}` | ✅ |
| Tabata (8 × 0:20 / 0:10) | same shape | ✅ |
| EMOM, time-based ("minute 1 bike, minute 2 rest") | `Repeat{rounds:10, steps:[work 60 s, rest 60 s]}` | ✅ |
| Target workout (100 kcal, 10 km) | one step, energy / distance condition | ✅ |
| EMOM with goal ("15 kcal every minute") | `Repeat{periodS:60, steps:[work: energy 15 kcal]}` — the work step ends at the goal, the rest of the period becomes an implicit rest; if the period ends first the round is **missed** (event), not fatal | Later |
| "Whichever first" | `firstOf` | Later |
| Nested rounds (e.g. 3 × Tabata) | nested `Repeat` | Later |

## 7. Targets (advisory only)

The engine never controls the bike; targets are guidance shown to the rider (air bike, see
device model: no target control).

```ts
type Range = { min?: number; max?: number };
type Target =
  | { type: 'power'; watts: Range }                  // Later
  | { type: 'powerFtp'; percent: Range }             // Later, resolved at compile time from athlete FTP
  | { type: 'cadence'; rpm: Range }                  // Later
  | { type: 'heartRate'; bpm: Range }                // Later
  | { type: 'heartRateMax'; percent: Range };        // Later, resolved from athlete HRmax
```

Later the state carries `targetStatus: 'below' | 'within' | 'above' | 'unknown'` (unknown when the
metric is stale or unavailable). No automatic intensity changes, ever (WE-13).

## 8. Compilation

`compile(definition, athlete?) → CompiledWorkout | Issues`

* Expands repeats into a flat list of `CompiledStep { index, stepId, blockId, kind, end, hint,
  round?, roundsTotal?, label }` — the origin fields feed "Interval 6 / 10" and later interval analytics.
* Resolves relative targets (FTP %, HRmax %) — Later; error if the anchor is missing.
* Computes `plannedDurationS` when all conditions are time-based (else `undefined`).
* Pure and deterministic; a recorded session stores the definition snapshot + version, so a
  replay recompiles identically.

## 9. State, clock and transitions

```ts
type WorkoutPhase = 'ready' | 'running' | 'paused' | 'finished' | 'endedEarly';

interface WorkoutState {
  phase: WorkoutPhase;
  stepIndex: number;                       // into CompiledWorkout.steps
  stepBase: { activeMs: number; energyKcal: number; distanceM: number };
  step: {                                  // view model for the UI
    elapsedMs: number;
    remaining?: { ms?: number; kcal?: number; meters?: number };
    fraction?: number;                     // 0..1 when computable
  };
  totals: { activeMs: number; energyKcal: number; distanceM: number };  // since workout start
  firedCues: string[];                     // de-duplication of cues per step
}

// The whole engine surface:
declare function start(w: CompiledWorkout, s: ActivitySnapshot): Result;       // → ready or running
declare function advance(state: WorkoutState, w: CompiledWorkout, s: ActivitySnapshot): Result;
declare function command(state: WorkoutState, w: CompiledWorkout, c: 'skip' | 'end', s: ActivitySnapshot): Result;
type Result = { state: WorkoutState; events: WorkoutEvent[] };
```

**Clock.** The engine has no clock of its own. Workout time = session active time
(`activeMs`, monotonic, from recording). The app's ticker uses the injected `Clock`
(system / fake / replay), so accelerated replay and step-wise tests work without changes.

| From | Trigger | To | Events |
| --- | --- | --- | --- |
| – | `start`, `start: immediate` | running | `WorkoutStarted`, `StepStarted` |
| – | `start`, `start: onMovement` | ready | – |
| ready | snapshot `moving` | running (baseline = this snapshot) | `WorkoutStarted`, `StepStarted` |
| running | step condition met | running (next step) | `StepCompleted{reason:'condition'}`, `StepStarted` |
| running | `skip` | running (next step) | `StepCompleted{reason:'skipped'}`, `StepStarted` |
| running | last step completed | finished | `StepCompleted`, `WorkoutFinished` |
| running | snapshot `session: 'paused'` | paused | `WorkoutPaused` |
| paused | snapshot `session: 'active'` | running | `WorkoutResumed` |
| ready / running / paused | `end` | endedEarly | `WorkoutEndedEarly{completedSteps}` |
| finished / endedEarly | anything | unchanged | – |

## 10. Events and cues

| Event | Payload | Consumer | Persisted (as `SessionEvent`) |
| --- | --- | --- | --- |
| `WorkoutStarted` | definition id + version, planned duration | recording, ui | ✅ (+ definition snapshot) |
| `StepStarted` | index, stepId, kind, round/roundsTotal, `activeMs` | recording (laps), ui | ✅ |
| `StepCompleted` | index, reason `condition` / `skipped`, actual time/kcal/m of the step | recording, ui | ✅ |
| `WorkoutPaused` / `WorkoutResumed` | – | ui | – (session pause events already exist) |
| `WorkoutFinished` / `WorkoutEndedEarly` | completed steps | recording, ui | ✅ |
| `CueDue` | `countdown` 3/2/1 before a time-based step ends (MVP); `halfway`, `lastRound` (Later) | ui (sound, flash) | – |
| `RoundMissed` (EMOM), `TargetStatusChanged`, `TestCompleted` | – | ui, analytics | Later |

Cues are events, not rendering; the UI decides sound/vibration/visuals. Cues fire at most once per
step (`firedCues`).

## 11. Running modes

| Mode | What changes | Engine |
| --- | --- | --- |
| Live device | `FitnessDevice` over Web Bluetooth, system `Clock` | unchanged |
| Simulated | `SimulatedFitnessDevice` with effort script; system or manual `Clock` | unchanged |
| Replay | `ReplayFitnessDevice` from a capture; replay `Clock` (×N or step) | unchanged |
| Unit tests | no device: tables of `ActivitySnapshot`s → expected events and states | unchanged |

Test layers: (1) pure table tests of `compile`/`validate`/`advance` (boundaries, multi-step
ticks, pause, skip, end, missing data); (2) pipeline tests with the simulator and a fake clock;
(3) golden tests: replay capture → expected event log.

## 12. Validation

`validate(definition, capabilities?) → { errors: Issue[]; warnings: Issue[] }`,
`Issue = { code: string; path: string; params?: Record<string, number | string> }`; codes are
i18n keys.

| Level | MVP checks (error codes) |
| --- | --- |
| structural | `format`, supported `version` (`unsupportedVersion`); required fields; known `kind`/`type` (`unknownType`) |
| semantic | ids unique (`duplicateId`); `rounds` 1–99 (`invalidRounds`); repeat has ≥ 1 step (`emptyRepeat`); no nested repeat (`nestedRepeat`); `seconds` 1–21600, `kcal` 1–5000, `meters` 1–200000 (`outOfRange`); ≥ 1 step (`empty`); compiled steps ≤ 1000 (`tooManySteps`) |
| executable (needs capabilities) | energy condition needs `energy` or `power` available (`needsEnergy`); distance needs `distance` or `speed` (`needsDistance`) |
| warnings | no warm-up before `max` work (`noWarmup`); work step > 30 min with hint `max` (`implausibleMax`) |

Limits are proposals, to be confirmed. Executable checks run again at start with the connected
device's capabilities; before connecting they are skipped.

## 13. MVP / Later

| Concept | MVP (product v0.2 "Train") | Later |
| --- | --- | --- |
| Definition | format v1; steps warmup/work/rest/cooldown; one level of `Repeat`; effort hint; start `immediate` / `onMovement` | nested repeats, `manual` steps, metadata (tags, author), shareable links |
| Conditions | time, energy (kcal), distance (m) | `firstOf`, `manual`, `cadenceBelow`, time-boxed rounds (`periodS`) |
| Intervals | Intervals, Tabata, time-based EMOM, target workout (kcal / km) | EMOM with goals, pyramids with generated steps |
| Targets | effort hint (display) | power, FTP %, cadence, HR, HRmax % (advisory, with status) |
| State / clock | phases, per-step progress, totals; time from recording's active time | resume a workout after crash recovery (MVP: recovered session ends the workout as `endedEarly`) |
| Events / cues | Started/StepStarted/StepCompleted/Paused/Resumed/Finished/EndedEarly; countdown 3-2-1 | halfway, last round, RoundMissed, TargetStatusChanged |
| Validation | structural, semantic, executable (capabilities) | athlete-dependent checks (FTP present), plausibility warnings beyond the two above |
| Templates | built-in: Intervals, Tabata, EMOM (time), 100 kcal, 10 km — own definitions, i18n names | user template library, import/export (own format, ZWO) |
| Tests / benchmarks | table tests, simulator pipeline | FTP/ramp test and air-bike benchmarks as a separate **assessment** layer on top of the engine (stop rules, validity, result, confidence — computed in analytics) |
| Device control | none | optional start/stop sync with the console via app (R6/R10); never target control |

## 14. Module layout

```text
src/domain/workout.ts        WorkoutDefinition types (authored, persisted)
src/workout/validate.ts      validate(definition, capabilities?)
src/workout/compile.ts       compile(definition, athlete?)
src/workout/engine.ts        start / advance / command
src/workout/templates.ts     built-in definitions (data)
test/workout/*.test.ts       table tests; simulator/replay pipeline tests
```

Allowed imports (from [architecture.md](architecture.md)): `workout → domain, telemetry
(capability types), shared`. `app` builds `ActivitySnapshot`s from recording and the telemetry
stream, calls the engine, forwards events to recording and UI, and stores definitions through a
`WorkoutRepository` port (domain) implemented in persistence.

## Deviations from the research note

* Target workouts are ordinary steps with an energy/distance condition instead of a separate
  whole-workout goal — simpler and it makes per-step kcal/m available in the MVP at no extra cost.
* Start on first movement is in the MVP (analysis: optional) because the Echo only sends data
  while moving (reported) and the rider needs time to get on the bike.

## Open questions

* W1/W2: which kcal and distance numbers drive conditions — OAB power-based kcal or console
  energy? (The snapshot hides the choice; recording decides.)
* Does recording pause automatically when the rider stops (idle), or only on user / Machine
  Status? The engine follows either way, but an idle auto-pause would freeze **rest steps**
  (the rider stands still, the Echo stops sending). Recommendation: no idle auto-pause while a
  workout runs; clock-driven ticks keep rest time running without data.
* Countdown audio in the browser needs a user gesture before playback — UI concern, to verify.
