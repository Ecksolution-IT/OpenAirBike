# Recording, storage, export and simulation in the reference projects

Comparison of workout recording, telemetry persistence, SQLite, session models, FIT export,
Garmin components, simulators, replay, fixtures, fake devices and connection recovery
(2026-09-27). Method: [reference-projects.md](reference-projects.md) and the other notes first,
then symbol searches and short targeted reads. License rules: [../decisions.md](../decisions.md)
D3 — `ewoc` (GPL) concepts only; Echo tracker and bridge (no LICENSE file) facts and ideas only.

Paths are relative to `reference/<project>/`; `…/ewoc/` = `app/src/main/java/io/github/ewoc2026/ewoc/`.
Connection/reconnect *transport* behaviour is covered in [ftms-ble-analysis.md](ftms-ble-analysis.md);
here only its effect on the recorded session.

## Overview

| Topic | garmin bridge (Py) | Echo tracker (Py) | ewoc (Kotlin, GPL) | OAB `main` |
| --- | --- | --- | --- | --- |
| Recording | auto-start on connect, one row per notification — `src/data/workout_manager.py: add_data_point` | in-memory list, saved on manual "Save" — `gui_tracker.py: _on_data`, `_save_workout` | ≤ 1 sample/s from latest values, in-memory ring buffer (3600) — `…/ewoc/session/SessionManager.kt: recordSampleIfDue` | 5 s batched flush, recovery — `src/recording/sessionRecording.ts` |
| Persistence | SQLite, JSON blob per sample — `src/data/database.py` | JSON + CSV per session, history CSV | summary as text file — `session/SessionStorage.kt`; no ride database | SQLite WASM (OPFS), typed columns, migrations |
| Session model | `workouts` row + JSON summary | summary dict incl. plan, zones | `SessionSummary`, `SessionSample`, continuation segments | `Session`, `Sample`, `SessionEvent`, `SessionSummary` |
| FIT export | `fit-tool` library, automatic at workout end — `src/fit/fit_converter.py` | – | own minimal FIT writer — `session/export/FitExportService.kt` | – (JSON/CSV/.sqlite) |
| Garmin | upload via `garth` login (password + MFA, token files) — `src/web/blueprints/garmin.py`; device identity — `src/fit/device_identification.py` | – | FIT share/auto-export only | – |
| Simulator / fake device | dict-emitting simulator + statistical phases + fault injection — `src/ftms/ftms_simulator.py`, `enhanced_bike_simulator.py`, `workout_scenarios.py`; test mocks — `tests/utils/mock_devices.py` | – | `session/MockTrainerEngine.kt` (typed data, scripted override windows) | `SimulatedTransport` (FTMS bytes), `FakeTransport` (tests) |
| Replay | – | – | – | – (in-memory packet capture only) |
| Fixtures | synthetic patterns + expected metrics — `tests/fixtures/sample_workouts.json` | – | byte arrays in unit tests; no device captures | `@deancochran/ftms` vectors |
| Connection loss vs. session | **disconnect ends the workout**, reconnect starts a new one — `workout_manager.py: _handle_ftms_status` | nothing handled; data just stops | one logical ride across drops; counter offsets and merged continuation segments — `SessionManager.bridgeCumulativeTrainerMetrics`, `startContinuationSegment` | session continues; counter deltas; reconnect with backoff |

## 1. What is stored during a session?

| Project | Per sample | Per session |
| --- | --- | --- |
| bridge | `workout_data(id, workout_id, timestamp TEXT, data TEXT)`; `data` = the connector's parsed dict (speed km/h, cadence, power, averages, device totals for distance/energy/time, HR) | `workouts(device_id, start_time, end_time, duration, workout_type, summary JSON, fit_file_path, uploaded_to_garmin)`; `devices` (address, name, type, metadata JSON); `configuration` (key/JSON); `user_profile` (incl. encrypted Garmin password) |
| tracker | every notification as a dict + `ts` (local ISO time); HR arrives as *separate* rows `{heart_rate, ts}` | summary: date, rider, label, type, notes, target, executed plan, device, weight, FTP, duration/distance/calories = **last device counter values**, avg/max power/HR/cadence, W/kg, zone seconds; plus a running history CSV |
| ewoc | `SessionSample(timestampMillis, power, cadence, HR, distanceMeters, totalEnergyKcal)` — nullable, HR plausibility 30–220, external strap preferred over FTMS HR | `SessionSummary`: start/stop, active vs. elapsed duration, actual TSS, avg/max, distance, kcal; persisted as a small text file only |
| OAB | `sample(session_id, t_ms, power, cadence, speed, HR, distance_m, energy_kcal)` from deltas | `session` with summary columns, `session_event`, `device`, `app_setting` |

## 2. Raw data or normalised telemetry?

* **No project persists raw bytes.** All store parsed values; captures exist nowhere (see §7).
* bridge: *half*-normalised — own key names, device units, device counters as-is; missing speed,
  cadence and power are coerced to `0` (`src/ftms/ftms_connector.py` ~233–235), so "not
  available" is lost. Timestamps are local `datetime.now()` at arrival; the FIT converter later
  has to guess UTC (`fit_converter.py: _ensure_datetime_utc`).
* tracker: parser output verbatim, heterogeneous rows, local time.
* ewoc: normalised and resampled to ≤ 1 Hz (latest value per second); cumulative values made
  app-owned by offsets when the trainer restarts its counters.
* OAB: canonical telemetry (D2 units, `undefined` = not available) with separate
  `deviceCounters`; stored samples carry OAB's own deltas. Raw notifications only in the in-memory
  capture (`src/app/app.ts: capturePacket`, max 20 000).

## 3. Session / workout models

| Model | Lifecycle | Notes |
| --- | --- | --- |
| bridge `WorkoutManager` | `start_workout` (auto on `connected`) → `add_data_point` → `end_workout` (auto on `disconnected`, then FIT) | no pause; `workout_type` from the device name ("bike" in name → bike, else rower) |
| tracker | implicit: start on connect/plan, stop on "Save" | no pause, no ids, the executed plan is stored with the summary (useful idea) |
| ewoc `SessionManager` | phases incl. running/paused/stopped; pause/resume activity; **continuation segments** merged into one summary and one export timeline | active vs. elapsed duration kept separately; logical ride owned by the app, not the trainer |
| OAB | `recording → finished / recovered`, pause/resume (user + Machine Status), crash recovery | matches ewoc's "app-owned ride" principle already |

## 4. SQLite strategies

Only the bridge uses SQLite.

* Schema created with `CREATE TABLE IF NOT EXISTS` — **no migrations**, no schema version.
* One JSON blob per sample; summary and metadata also JSON text.
* No index on `workout_data.workout_id` (no `CREATE INDEX` in `database.py`).
* Foreign keys declared, but `PRAGMA foreign_keys` is not enabled in `database.py` → not enforced.
* One `INSERT` + `commit()` + two INFO log lines **per sample**.
* Thread-local connections (`ThreadLocalConnection`).
* `src/data/database_manager.py` (855 lines) adds WAL, `busy_timeout`, retries, health checks,
  checksummed backups and JSON/CSV/SQL export — but is **not instantiated anywhere in `src/`**
  (search), i.e. parallel, unused infrastructure.

OAB already differs on every point (typed columns, composite PK, migrations, batched
transactions, single owner via Web Lock); see [spike-sqlite-opfs.md](spike-sqlite-opfs.md) and D1.

## 5. How does FIT export work?

| | bridge | ewoc |
| --- | --- | --- |
| Library | `fit-tool` (Python; license not verified) | none: own writer for definition/data messages + CRC |
| Messages | `file_id`, `device_info`, `event` (timer start), `record` × n, `event` (timer stop), one `lap`, `session`, `activity` | `file_id`, `record` × n, one `lap`, `session`, `activity` |
| Record fields | timestamp, power, HR, cadence, speed (km/h → m/s), distance | timestamp, power, cadence, HR, distance; session adds avg/max values and TSS |
| Sport | cycling (2) / indoor cycling (6) | indoor cycling |
| Device identity | development manufacturer id + own product ids per device (Echo Bike, Echo Rower, generic) — `device_identification.py` | development manufacturer (255) |
| Time | `total_timer_time` = elapsed (pauses not represented) | active and elapsed durations kept separately |
| Extras | speed outlier filter + validation against distance — `speed_calculator.py`; structural/Garmin compatibility validator — `fit_validator.py`; FIT generated automatically at workout end, path stored in DB | export via Android share / URI, optional auto-export |
| Garmin | upload through `garth` (unofficial Garmin Connect login with username/password + MFA, OAuth tokens in files) | none |

Take-away for OAB: a useful FIT needs only these messages. Laps can come from workout step events
(WE-8 in [workout-engine-analysis.md](workout-engine-analysis.md)), timer start/stop events from
pauses, `total_timer_time` = active time.

## 6. How do the simulators work?

| Simulator | Injection point | Behaviour | Deterministic |
| --- | --- | --- | --- |
| bridge `FTMSDeviceSimulator` | replaces the connector; emits **parsed dicts** to the same callbacks → BLE and parser are bypassed | fixed generator per device type | no seed found (search) — *assumption:* non-deterministic |
| bridge `EnhancedBikeSimulator` | same | phases (warm-up, main, cool-down …) with mean/std/range per metric from `src/utils/workout_patterns.json` | same |
| bridge `WorkoutScenarioManager` | wraps generated data | fault injection per scenario: connection drop, invalid data, data gaps, sensor malfunction, interference, power spike, HR dropout (probability, duration, severity, recovery) | same |
| bridge test mocks | `MockFTMSDevice`, `MockBluetoothAdapter`, `MockFTMSManager` | intensity/phase-driven values | – |
| ewoc `MockTrainerEngine` | emits typed Indoor Bike Data after the parser | power approaches the target with inertia; cadence/speed derived; scripted override windows (e.g. zero cadence at start and in an auto-pause window); injected clock | yes (no randomness in the shown logic) |
| OAB `SimulatedTransport` | fake GATT emitting **FTMS bytes** → transport, reassembly, parser, adapter, conformance all exercised | cadence-driven power, `step()` for tests, `splitRecords` for More Data | yes in step mode |

Fixtures: the bridge's `sample_workouts.json` holds synthetic *patterns* plus expected metrics and
error scenarios (connection drop points, invalid points, missing intervals) — no real recordings.
No project contains a real Echo capture.

## 7. What do we need for a `ReplayFitnessDevice`?

**Placement.** A `Transport` implementation (e.g. `src/transport/replay/`) behind the same seam as
`SimulatedTransport`: it feeds `GattNotification`s and answers `read()`, so profile resolution,
adapter setup, reassembly, parser, conformance monitor, recorder and UI run unchanged. "Device"
= replay transport + the profile the capture resolves to.

**Capture format v1.** Two captures exist today; neither is the final replay format (S4):

| Needed | App (`captureReport()`, Diagnostics) | Hardware-proof tool (`tools/hardware-proof/capture.ts`, draft `version: 0`) |
| --- | --- | --- |
| format id + version, app version | missing | format id + version; no app version |
| full service/characteristic UUIDs and properties | display name only | ✅ full UUIDs; GATT inventory with properties (`GattLink.inventory()`) |
| values of **reads** (Feature 0x2ACC, DIS, ranges) with time | only derived diagnostics | ✅ Feature and DIS reads as hex (no ranges) |
| notifications/indications with UUID, bytes, relative time | wall clock, name instead of UUID | ✅ relative ms since connect (wall-clock based, not monotonic) |
| connection events: connect, setup done, disconnect, reconnect | free-text log only | ✅ `events` (chosen, state, setup, error) |
| optional app commands (start/pause/stop workout) | missing | missing (no sessions in the tool) |
| privacy: no device id, no serial | not handled | ✅ no device id, serial never read; advertised name and user agent kept |

**Behaviour.**
* Injected clock; modes real-time, accelerated (× N) and step-wise (tests) — deterministic.
* `read()` answers from recorded reads; `subscribe()` delivers the recorded packets of that
  characteristic; recorded disconnects/reconnects are re-enacted.
* A capture lacking a characteristic the adapter needs fails like a real device would (useful
  for profile and conformance tests).
* Optional fault overlays (gap, duplicate, truncated packet, counter reset), scripted — the
  bridge's scenario catalogue as ideas, without randomness.

**Fixtures and tests.**
* Own, anonymised captures in `test/fixtures/captures/` (license-clean because they are our data);
  the first one comes from the capture routine in [ftms-ble-analysis.md](ftms-ble-analysis.md) (R1–R13, W1–W5).
* Golden outputs per capture (canonical samples, session summary, conformance report) for
  regression tests.
* Size estimate (*assumption*): ~1 notification/s → ~3 600 packets/h, a few hundred KB of JSON.

**Decision candidate.** Persist raw packets per session (e.g. a `session_packet` table or a
compressed blob) so any recorded ride can be replayed and re-parsed after parser fixes. Costs
storage; needs D1-compatible portable SQL. Not decided.

## 8. Adopt or avoid

| Adopt (as concept / own implementation) | From |
| --- | --- |
| Logical ride owned by the app; counter offsets on device resets; ride continues across drops; active vs. elapsed time | ewoc (OAB already does most) |
| HR source precedence (external strap > FTMS HR) and plausibility range | ewoc |
| Store the executed workout definition with the session (reproducibility) | tracker (`workout_plan` in summary) |
| Zone seconds in the summary (v0.3) | tracker |
| Minimal FIT message set; indoor-cycling sport/sub-sport; laps from step events; validate our FIT output in tests | bridge, ewoc |
| Own small FIT writer instead of a dependency (D3) — or an MIT JS library after review | ewoc (concept) |
| Scenario-based fault injection, scripted override windows (waiting start, auto-pause) | bridge, ewoc |
| Checksummed backup/export and a DB health check | bridge `DatabaseManager` (ideas; ours: `.sqlite` export) |

| Avoid | Seen in | OAB rule |
| --- | --- | --- |
| JSON blob per sample; no indexes; no migrations; unenforced FKs | bridge | typed columns, PK/indexes, versioned migrations, FKs on |
| Commit + logging per sample | bridge | batched transactions (5 s flush) |
| `0` instead of "not available" | bridge | `undefined`/`NULL` |
| Local naive timestamps | bridge, tracker | UTC epoch ms + monotonic offsets |
| Ending the workout on disconnect | bridge | session continues; reconnect resumes |
| Device counters used as session totals | tracker | OAB deltas; counters only diagnostic |
| Data only in memory until manual save; in-memory timeline capped at 1 h (*analysis:* longer rides lose the start in export) | tracker, ewoc | continuous persistence, crash recovery |
| Heterogeneous rows (HR rows separate from bike rows) | tracker | one merged sample per time step |
| Parallel unused infrastructure | bridge (`DatabaseManager`) | one persistence path |
| Simulators that bypass BLE and parser for integration tests | bridge, ewoc | simulate/replay at the transport seam |
| Unseeded randomness in test data | bridge (*assumption*) | deterministic scripts |
| Unofficial Garmin Connect login storing a password | bridge (`garth`) | local-first: FIT file export only; any upload later only via official, user-authorised APIs |

## Open questions / decisions

| # | Question |
| --- | --- |
| S1 | Persist raw packets per session (replay after parser fixes) or only on demand via capture? |
| S2 | Keep per-notification samples or resample to a 1 s grid (at write time or only for FIT/analytics)? |
| S3 | FIT: own writer or reviewed MIT library? Which manufacturer/product ids (development id)? |
| S4 | Capture format v1 as a documented, versioned file (proposal in §7) — also the input for `ReplayFitnessDevice`. |
