# Feature matrix

Consolidated from the research notes (2026-09-27): [reference-inventory.md](reference-inventory.md),
[reference-projects.md](reference-projects.md), [ftms-ble-analysis.md](ftms-ble-analysis.md),
[workout-engine-analysis.md](workout-engine-analysis.md),
[recording-storage-analysis.md](recording-storage-analysis.md). Source code was opened only for
gaps (history/profile/PR/zone/test/sharing searches; noted as *search*). License rules: D3 —
`ewoc` GPL concepts only; Echo tracker, bridge, toolkit facts and ideas only; `ftms` MIT.

**Legend.** ✅ present · ◐ partial · – absent · ? not examined.
**OAB** = OpenAirBike: status on `main` → target version (README roadmap: v0.1 Ride,
v0.2 Train, v0.3 Understand, v0.4 Habit).
**Relevance** for OAB: **MVP** = v0.1 scope incl. real-bike validation · **Later** = v0.2+ ·
**No** = do not adopt.

Columns: **bridge** = rogue_garmin_bridge · **tracker** = Rogue_Echo_Bike_v3 · **ewoc** · **ftms** ·
**toolkit** = ftms-toolkit.

## BLE

| Feature | bridge | tracker | ewoc | ftms | toolkit | OAB | Relevance |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Discovery (FTMS UUID + name fallback) | ✅ | ✅ | ✅ scan backoff | – | ✅ | ✅ chooser | MVP |
| Reconnect with backoff | ✅ jitter | – | ✅ link generations | – | – | ◐ no jitter / generations | MVP (hardening Later) |
| Web Bluetooth (browser, no install) | – | – | – | – | – | ✅ | MVP |
| External HR strap as second device | – | ◐ optional 0x2A37 | ✅ | – | – | – | Later |
| Passive availability probe / status dots | – | – | ✅ | – | – | – | Later |
| Full GATT dump of all characteristics | – | – | – | – | ✅ | ◐ FTMS only | Later (capture v1) |

## FTMS

| Feature | bridge | tracker | ewoc | ftms | toolkit | OAB | Relevance |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Indoor Bike Data parser | ✅ manual for Echo | ✅ | ✅ | ✅ | ✅ | ✅ | MVP |
| More Data reassembly (§4.19) | – | – | – | – (reported) | – | ✅ | MVP |
| Feature 0x2ACC | ◐ stub | – | ? | ✅ | ✅ read | ✅ | MVP |
| Machine / Training Status | ◐ via `pyftms` | – | ◐ ownership | ✅ codecs | – | ✅ | MVP |
| Control Point (start/stop sync) | ◐ via `pyftms` | ◐ fire-and-forget | ✅ ownership model | ✅ codecs | ✅ | – | Later (R6, R10) |
| Resistance / ERG / target power control | ◐ | ◐ | ✅ | ✅ codecs | ✅ calibration | – | **No** (air bike) |
| Supported ranges | – | – | ◐ clamping | ✅ | ◐ | – | Later |

## Telemetry

| Feature | bridge | tracker | ewoc | ftms | toolkit | OAB | Relevance |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Normalised canonical units | ◐ | ◐ | ✅ | ✅ | – | ✅ D2 | MVP |
| "Not available" kept (not 0) | – | – | ✅ | ✅ | – | ✅ | MVP |
| Counter deltas / reset handling | – | – | ✅ offsets | – | – | ✅ | MVP |
| Stale / stall detection | – | – | ✅ | – | – | ✅ 3.5 s | MVP |
| HR source precedence + plausibility | ◐ 0 = none | – | ✅ | – | – | ◐ 0 = none | Later |
| Speed outlier filtering | ✅ | – | – | – | – | – | **No** (keep measured values) |

## Device capabilities

| Feature | bridge | tracker | ewoc | ftms | toolkit | OAB | Relevance |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Capabilities from feature bits | – | – | ? | ✅ | ◐ print | ✅ | MVP |
| Device profiles / quirks | ◐ name → type | – | ✅ fingerprints, registry | – | – | ◐ Echo + generic | MVP (quirks Later) |
| Conformance check vs. SIG TS/ICS | – | – | ◐ compat taxonomy | ◐ diagnostics | – | ✅ | MVP |

## Workouts

| Feature | bridge | tracker | ewoc | ftms | toolkit | OAB | Relevance |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Free ride recording | ✅ | ✅ | ✅ | – | – | ✅ | MVP |
| Pause / resume | – | – | ✅ | – | – | ✅ user + Machine Status | MVP |
| Structured intervals (repeat, work/rest) | – | ◐ copied rows | ✅ | – | – | → v0.2 | Later |
| Templates (Tabata, EMOM, pyramid …) | – | ✅ 14 | ◐ bundled | – | – | → v0.2 | Later |
| Calorie / distance goals | – | – | – | ◐ CP codes | – | → v0.2 | Later |
| True EMOM (goal inside the minute) | – | ◐ mislabelled | – | – | – | → v0.2+ | Later |
| Versioned workout format + validation | – | – | ✅ `.ewo` | – | – | → v0.2 | Later |
| Workout editor | – | ✅ dialog | ✅ desktop | – | – | → v0.2+ | Later |
| Advisory targets (power, cadence) | – | ◐ | ◐ | – | – | → v0.2+ | Later |
| Closed-loop HR / ERG control | – | – | ✅ | – | – | – | **No** |

## Analytics

| Feature | bridge | tracker | ewoc | ftms | toolkit | OAB | Relevance |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Session summary (avg/max, totals) | ✅ | ✅ | ✅ | – | – | ✅ | MVP |
| Charts (live / post ride) | ✅ Chart.js | ✅ live | ✅ profile chart | – | – | ◐ numbers only | Later (v0.3) |
| NP / IF / TSS | ✅ | – | ✅ actual + planned TSS | – | – | – | Later (v0.3) |
| Multi-session comparison | ✅ *search* | – | – | – | – | – | Later (v0.3) |
| VO2max estimate | ✅ | ✅ | – | – | – | – | **No** (weak validity) |
| Rule-based recommendations ("AI") | – | – | ✅ `ai/` | – | – | – | **No** (scope) |

## History

| Feature | bridge | tracker | ewoc | ftms | toolkit | OAB | Relevance |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Session list + detail | ✅ web | ✅ dialog | ◐ summary files, no history screen (*search*) | – | – | ✅ | MVP |
| Delete session | ✅ | – | – | – | – | ✅ | MVP |
| Crash recovery of a running session | – | – | – | – | – | ✅ | MVP |

## Athlete

| Feature | bridge | tracker | ewoc | ftms | toolkit | OAB | Relevance |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Profile (weight, age, resting/max HR) | ✅ | ✅ | ◐ FTP + age | – | – | – | Later |
| Several riders on one device | – | ✅ hard-coded names | – | – | – | – | Later |
| Cloud account | – | – | – | – | – | – | **No** (local-first) |

## FTP / zones

| Feature | bridge | tracker | ewoc | ftms | toolkit | OAB | Relevance |
| --- | --- | --- | --- | --- | --- | --- | --- |
| FTP stored | ◐ | ✅ | ✅ | – | – | – | Later |
| Power zones from FTP | – | ✅ Z1–Z7 | ✅ display only | – | – | – | Later |
| HR zones (Karvonen) | – | ✅ | ◐ relative targets | – | – | – | Later |
| FTP / ramp test with validity rules | – | ◐ template, manual result | ✅ | – | – | – | Later (air-bike protocol) |

## Personal records

| Feature | bridge | tracker | ewoc | ftms | toolkit | OAB | Relevance |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Personal bests + lifetime totals | – | ✅ per rider — `update_pbs` | – | – | – | → v0.3 | Later |

## Simulator

| Feature | bridge | tracker | ewoc | ftms | toolkit | OAB | Relevance |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Byte-level FTMS simulator | – | – | – | – | – | ✅ | MVP |
| Typed / dict simulator | ✅ | – | ✅ | – | – | – | **No** (bypasses parser) |
| Scripted fault / behaviour scenarios | ✅ random | – | ✅ override windows | – | – | – | Later (deterministic) |

## Replay

| Feature | bridge | tracker | ewoc | ftms | toolkit | OAB | Relevance |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Packet capture | ◐ hex log | – | ◐ payload preview | – | ✅ dump | ✅ download | MVP |
| Replay of a capture as a device | – | – | – | – | – | – | Later (early v0.2, S4) |
| Raw packets kept per session | – | – | – | – | – | – | Later (S1) |

## FIT

| Feature | bridge | tracker | ewoc | ftms | toolkit | OAB | Relevance |
| --- | --- | --- | --- | --- | --- | --- | --- |
| FIT activity export | ✅ `fit-tool` | – | ✅ own writer | – | – | – | Later (S3) |
| Laps from workout steps, pause events | – | – | ◐ one lap, active time | – | – | – | Later |
| FIT validation in tests | ✅ | – | – | – | – | – | Later |

## Garmin

| Feature | bridge | tracker | ewoc | ftms | toolkit | OAB | Relevance |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Garmin-compatible FIT device identity | ✅ | – | ◐ dev id | – | – | – | Later |
| Garmin Connect upload (unofficial login, stored password) | ✅ `garth` | – | – | – | – | – | **No** |

## Diagnostics

| Feature | bridge | tracker | ewoc | ftms | toolkit | OAB | Relevance |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Typed payload diagnostics | – | – | ✅ failure classes | ✅ `FtmsDiagnosticCode` | – | ✅ conformance | MVP |
| Lifecycle markers / connection log | ✅ | – | ✅ | – | ✅ print | ✅ | MVP |
| Platform debug automation (adb) | – | – | ✅ | – | – | – | **No** (Android-specific) |

## Import / export

| Feature | bridge | tracker | ewoc | ftms | toolkit | OAB | Relevance |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Session export JSON / CSV | ◐ DB export (unused) | ✅ | – | – | – | ✅ | MVP |
| Full database backup | ◐ unused | – | – | – | – | ✅ `.sqlite` | MVP |
| Database restore / session import | ◐ unused | – | – | – | – | – | Later |
| Workout import (`.zwo`, own format) | – | – | ✅ | – | – | – | Later |
| Workout export / share file | – | – | ✅ `.ewo`, `.zwo` | – | – | – | Later |

## Testing

| Feature | bridge | tracker | ewoc | ftms | toolkit | OAB | Relevance |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Unit tests | ✅ pytest | – | ✅ ~85 files | ✅ | – | ✅ 130 | MVP |
| Language-neutral conformance vectors | – | – | ✅ `.ewo` corpus | ✅ | – | ✅ uses `ftms` vectors | MVP |
| Integration / performance tests | ✅ | – | ? | – | – | ◐ pipeline tests | Later |
| Browser end-to-end tests in CI | – | – | – | – | – | ◐ manual Playwright runs | Later |
| Real-device fixtures (captures) | – | – | – | – | – | – | MVP (first capture) |

## What the matrix shows

* The MVP scope is covered; the gap is **real-bike validation** (R1–R13, W1–W5).
* Most "Later" items exist somewhere, but for **ERG trainers**. For an air bike they reduce to
  advisory guidance, goals and analytics.
* No reference project has benchmarks, ghost mode, telemetry replay or workout sharing via file or
  link (*search* for `ghost`, `benchmark`, `replay`, `share`, `compare`: only UI styling,
  performance tests, FIT file sharing and the bridge's multi-workout comparison).

## Differentiation candidates

| Candidate | What it means | In references | Builds on | Value | Effort | Risks |
| --- | --- | --- | --- | --- | --- | --- |
| **Standardised air-bike benchmarks** | an open, versioned catalogue of fixed protocols: *calories for time* (e.g. 10/25/50 kcal), *max calories in time* (1 min, 10 min), *distance for time* (1 km, 5 km), *peak power* (10 s), *interval benchmark* (e.g. Tabata total and weakest round) | none | workout engine goals (WE-4, WE-7), recording | **high**: matches air-bike culture (calorie and distance tests) | medium | calories and distance are console-specific (W1, W2): compare only within the same device profile; store profile + firmware with each result |
| **Benchmark engine** | runs a benchmark as its own state machine: precheck, countdown, auto-start on first pedal stroke, stop rules, validity (completed / invalid / aborted), result + confidence, automatic PR update | none (ewoc's fitness test has the *shape*, not air-bike protocols) | benchmarks, recording, PRs | **high** | medium | protocol changes must be versioned so results stay comparable |
| **Ghost mode** | race live against a previous own session, a PR or a benchmark best: ahead/behind in kcal, metres or seconds | none | stored `t_ms` + cumulative distance/energy per sample (exists), workout engine | **high**: motivating, rare on air bikes | low–medium | only fair on the same device profile; calories vs. time alignment rules must be defined |
| **Telemetry replay** | `ReplayFitnessDevice` from capture v1: regression tests with real bikes; users send a capture and a conformance report to get a new bike supported; re-parse old rides after fixes | none | capture (exists), transport seam, S1/S4 | **high** for quality and community | medium | privacy of captures (anonymise), format versioning |
| **Workout sharing** | share workouts and benchmark definitions as a small file or a server-less link (definition encoded in the URL); import `.zwo` later | ewoc shares FIT and `.ewo` files, no link sharing | own workout format (WE-10) | medium | low–medium | format stability; no server (local-first) |

Further differentiators already visible in the design:

* **No install, no account:** a browser app with Web Bluetooth and local SQLite; all reference apps need Python, macOS or Android.
* **Open device support:** a conformance report per bike (SIG TS/ICS based) plus replayable
  captures could grow into a community list of verified FTMS air bikes.
* **Active Work Breaks** (README v0.4): no reference project addresses short movement sessions
  during the working day.

Suggested order (to decide): replay (makes every later feature testable with real data) →
workout engine with calorie/distance goals (v0.2) → benchmark catalogue + engine and PRs → ghost
mode → workout sharing.
