# OpenAirBike MVP

Status: product definition, 2026-09-27. No implementation. Consolidates the README roadmap,
[../research/feature-matrix.md](../research/feature-matrix.md) and the architecture documents in
[../architecture/](../architecture/).

## Goal

A rider with a Rogue Echo Bike V3 completes one full session:

```text
find bike → connect → see live telemetry → start session → stop session → session saved → view summary
```

**MVP rule:** a feature is MVP only if this journey fails, or its result cannot be trusted, without
it. A few *enablers* (not user-facing) are MVP because the MVP cannot be accepted without them.
Everything else is Next, Later or Research — including features that already exist in the code.

## MVP scope

| Journey step | MVP feature | State on `main` |
| --- | --- | --- |
| Find bike | Web Bluetooth chooser filtered by FTMS service + Echo name prefixes; clear message when Web Bluetooth is unavailable | built; Echo name unverified (R2) |
| Connect | FTMS check (reject non-FTMS devices), setup (Feature read, subscriptions), connection state shown, automatic reconnect after link loss without ending the session | built; simulator-verified |
| Live telemetry | power, cadence, speed, distance, kcal, session time, heart rate if the bike sends it; "–" for missing values (never 0); stale indicator after 3.5 s; large numbers; screen stays awake; German formatting (D2) | built |
| Start session | one start button while connected | built |
| Stop session | one stop button; summary computed | built |
| Session saved | automatic local persistence (SQLite in OPFS, batched every 5 s); crash recovery of an unfinished session; single-tab lock | built |
| View summary | summary right after stop; session list to reopen it after a restart | built |
| *Enabler* | packet capture download + conformance diagnostics (needed for hardware validation) | built |
| *Enabler* | simulated bike + automated tests in CI (typecheck, unit/contract tests, build) | built |
| *Enabler* | Echo profile confirmed from a real capture (R1–R7) | **open**; tool ready: [milestone-0-hardware-proof.md](milestone-0-hardware-proof.md) |

Consequence: the MVP is **code-complete but not accepted**. What remains is validation on a real
Echo Bike V3 and the measurements in the acceptance criteria below.

## Feature classification

**Next** = directly after MVP acceptance (product v0.2 "Train" + hardening). **Later** = v0.3+.
**Research** = needs an answer or a decision before it can be planned.
"Built" marks features that already exist but are *not* MVP-gating.

### Next

| Feature | Note |
| --- | --- |
| Pause / resume (user and console Machine Status) | built |
| Delete session | built |
| Session export JSON / CSV, database backup (`.sqlite`) | built |
| English UI | built |
| Workout engine MVP: intervals, Tabata, time-based EMOM, target workouts (kcal / km), countdown cue, built-in templates | [workout-engine.md](../architecture/workout-engine.md) |
| Replay device + capture format v1 | test base for everything after MVP |
| Architecture clean-up: module moves and import-rule test | [architecture.md](../architecture/architecture.md) |
| Reconnect hardening (jitter, link generations) | [ftms-ble-analysis.md](../research/ftms-ble-analysis.md) |
| Telemetry model changes (monotonic time, HR source, counter epoch, capability origins) | [device-telemetry-model.md](../architecture/device-telemetry-model.md) |

### Later

| Feature | Area |
| --- | --- |
| EMOM with goals, "whichever first", nested rounds | workouts |
| Advisory power / cadence / HR targets; FTP- and HRmax-relative targets | workouts |
| Workout Builder (visual editor), user template library | workouts |
| Workout import/export (own format), ZWO import, workout sharing via file/link | integrations |
| Athlete profile (weight, age, HR, FTP), power/HR zones | athlete |
| Personal records, charts, interval comparison, power/cadence trends, training frequency | analytics (v0.3) |
| FIT export (laps from workout steps) — also the path to Garmin and Strava by manual upload | integrations |
| Heart-rate strap as second device | devices |
| More FTMS air bikes (profiles), community list of verified bikes | devices |
| Control Point start/stop sync with the console (only if R6/R10 allow) | devices |
| Standardised air-bike benchmarks, benchmark engine, ghost mode | differentiation |
| FTP / ramp test (air-bike protocol, advisory) | assessment |
| Active Work Breaks, quick workouts, streaks, simple goals | habit (v0.4) |
| Database restore / session import | data |
| Several riders on one device | athlete |

### Research

| Topic | Question to answer first |
| --- | --- |
| R1–R13 | Echo behaviour: fields, feature bits, notification rate, counters, pause, reconnect, services, Control Point ([echo-bike-v3.md](../research/echo-bike-v3.md), [ftms-ble-analysis.md](../research/ftms-ble-analysis.md)) |
| W1–W5 | calorie and distance source (console vs. OAB), power quality, update latency, console pause ([workout-engine-analysis.md](../research/workout-engine-analysis.md)) |
| S1–S4 | raw packets per session, 1 s grid, FIT writer, capture format ([recording-storage-analysis.md](../research/recording-storage-analysis.md)) |
| Training load (NP, IF, TSS) | is Echo power accurate enough (W3)? Otherwise misleading |
| Mobile app | Android Chrome has Web Bluetooth (a PWA may suffice); iOS Safari has none → would need a native shell. Decide after MVP. |
| Strava | official API needs OAuth with a client secret → conflicts with local-first without a server; manual FIT upload works (Later) |
| Garmin | only via FIT file (Later); Garmin Connect upload via unofficial login is ruled out |
| Optional sync / cloud | only opt-in and user-owned (e.g. export to own storage); no design yet |
| Local recorder service (headless, e.g. Raspberry Pi) | architecture option B; only if browser recording proves insufficient |

### Explicitly out of scope

Accounts, cloud-first storage, social features, AI coach, VO2max estimates (weak validity),
resistance/ERG control (not possible on an air bike), Zwift-style virtual worlds — see README
"What OpenAirBike Is Not" and the feature matrix ("No").

## Acceptance criteria

Test environment: Chrome (current stable) on a desktop OS with Bluetooth; a real Rogue Echo Bike
V3; the console in its default state. "Sim" = verifiable with the simulated bike in CI or
Playwright; "HW" = needs the real bike.

| # | Criterion | Measure | How |
| --- | --- | --- | --- |
| AC-1 | Bike is findable | with the console in pairing mode, the bike appears in the chooser within 10 s in 5 of 5 attempts | HW |
| AC-2 | No dead end without Bluetooth | in a browser without Web Bluetooth the app shows an explanatory message within 1 s of load | Sim |
| AC-3 | Connect | from choosing the bike to the first live value ≤ 10 s in ≥ 9 of 10 attempts (capture timestamps) | HW |
| AC-4 | Wrong device rejected | selecting a non-FTMS device shows an error and leaves the app usable | Sim (fake transport) |
| AC-5 | Live values | while pedalling, power, cadence, speed, distance, kcal and time update at least every 2 s; a metric the bike does not send shows "–" | HW + Sim |
| AC-6 | Stale data visible | ≤ 4 s after the last packet a stale indicator is shown | Sim |
| AC-7 | Readable while training | main metric ≥ 64 px and secondary metrics ≥ 32 px high at a 1280 × 720 viewport; screen does not sleep during a session | Sim (Playwright) |
| AC-8 | Link loss survives | a BLE drop of ≤ 30 s during a session reconnects automatically; the session continues; distance and kcal never decrease or jump by more than one sample's worth | Sim + HW (switch console off/on or move away) |
| AC-9 | Save without action | after "stop", the session is in the list; after closing and reopening the browser it is still there with an identical summary | Sim + HW |
| AC-10 | Crash loses ≤ 5 s | killing the tab during a session loses at most 5 s of samples; on the next start the session is recovered and listed | Sim |
| AC-11 | Summary shown fast | the summary appears ≤ 2 s after "stop" | Sim |
| AC-12 | Summary correct | duration = active time ± 1 s; avg/max power and cadence match the stored samples exactly (unit tests); distance within ± 2 % of the console's distance for the same ride; kcal difference to the console documented (W1) | Sim + HW |
| AC-13 | Long session | a 60-min simulated session at 1 Hz stores 3600 ± 2 samples without errors; UI stays responsive (no long task > 200 ms in the performance log) | Sim |
| AC-14 | One writer | a second tab shows "database in use" and does not write | Sim |
| AC-15 | Local only | during a full session the app makes no network requests to other origins (Playwright network log) | Sim |
| AC-16 | Hardware validated | one anonymised real capture is committed as a test fixture; R1–R7 answered in `echo-bike-v3.md`; the Echo profile updated accordingly | HW |
| AC-17 | Quality gate | typecheck, all tests and build pass in CI on the release commit | CI |

**MVP accepted** when AC-1 to AC-17 pass, with every "HW" criterion observed at least once on a
real Echo Bike V3 and recorded (capture + short protocol in `docs/research/`).

## Known gaps to acceptance (not implementation tasks yet)

* Real-bike session and capture (AC-1, AC-3, AC-5, AC-8, AC-12, AC-16).
* Measurements not yet run: readability sizes (AC-7), 60-min soak (AC-13), network log (AC-15),
  stale timing (AC-6).
* Any AC that fails becomes a fix before MVP acceptance; everything else stays in Next.
