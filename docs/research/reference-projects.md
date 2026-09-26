# Reference projects

Local copies in `reference/` (git-ignored), unpacked from uploaded archives on 2026-09-26.

## Overview

| Project | What it is | Stack | License | Reuse status |
| --- | --- | --- | --- | --- |
| `ftms-main` (`@deancochran/ftms` 0.2.0) | Runtime-neutral FTMS codecs + JSON conformance vectors | TypeScript, ESM, Node ≥ 20, no runtime deps | MIT, LICENSE file present | **Candidate** (dependency or test vectors), needs an explicit decision |
| `Rogue_Echo_Bike_v3-main` | macOS workout tracker for the Echo Bike V3 | Python, bleak, PyQt6 | "MIT" stated in README only, **no LICENSE file** | Unclarified: facts only, no code |
| `rogue_garmin_bridge-main` | Echo Bike / Rower → FIT → Garmin Connect bridge with web UI | Python, Flask, bleak, `pyftms`, SQLite, fit-tool | "MIT" stated in README only, **no LICENSE file** | Unclarified: facts only, no code |
| `ftms-toolkit-main` | Discovery, resistance control, power-curve calibration | Python, bleak | **No license** (all rights reserved) | Nothing reusable; ideas only |
| `ewoc-main` | Android indoor-cycling app + desktop workout editor | Kotlin, Gradle, Compose | **GPL-3.0-or-later** | **Never adopt code or text**; concepts only |

## ftms-main — TypeScript FTMS codecs (MIT)

Most relevant project for the protocol layer.

* Pure codecs: bytes in, typed and normalised data out. No BLE, no GATT subscriptions, no
  timers, no logging (reported, README). Fits our **Protocol** layer boundary.
* Normalises units: speed in m/s, `null` for "Data Not Available", diagnostics for
  truncation, reserved flags, trailing bytes and More Data (reported, README).
* Deliberately does **not** reassemble More Data fragments; the caller owns that (reported).
  We already do this in `src/ftms/dataRecord.ts`.
* `conformance/v1/vectors.json`: language-neutral test vectors (35 feature, 7 range, 21 control,
  12 control-response, 8 measurement, 4 status vectors) with provenance: FTMS 1.0, Bluetooth
  SIG public GSS YAML (revision `3b58acd4…`), Errata Service Release 11 (verified by inspection).
* **Finding — Resistance Level size:** its Indoor Bike Data parser reads Resistance Level as
  `uint8` (GSS), and its bike test vector encodes it in one byte. OpenAirBike, the Echo tracker
  and most real-world parsers read `sint16` (older SIG XML definition). See
  [echo-bike-v3.md](echo-bike-v3.md#open-questions) — R1.
* Also encodes Control Point requests and decodes responses and Machine Status (not needed
  for v0.1).

Options (decision pending, see [architecture-gap.md](architecture-gap.md)):
use as dependency, use only its vectors as test fixtures (MIT notice required), or keep our own
parser and cross-check against the vectors.

## Rogue_Echo_Bike_v3-main — Echo tracker (license unclear)

Only Echo-specific facts are useful:

* Pairing: hold the console's Bluetooth button about 3 s until the BT icon flashes (reported).
* The bike only sends data while being pedalled; metrics stay empty until then (reported).
* Discovery: scan filtered by FTMS UUID first, then fallback by name keywords
  `rogue`, `echo`, `bike`, `assault`, `ftms` (reported, `tracker.py`). Suggests the advertised
  name is not reliably known — **assumption**.
* Subscribes to Indoor Bike Data (0x2AD2) and optionally to Heart Rate Measurement (0x2A37);
  writes to the Control Point (0x2AD9) "fire-and-forget" and states that firmware may ignore it
  (reported). Whether the Echo exposes 0x2A37 or 0x2AD9 is not demonstrated.
* Parser: straightforward flag walk, Resistance Level as `sint16`, no More Data reassembly, no
  "Data Not Available" handling (verified by inspection of `gui_tracker.py`).
* Storage: JSON + CSV per session in `~/echo_bike_workouts/` — no database.
* Contains no packet captures or firmware versions.

## rogue_garmin_bridge-main — Garmin bridge (license unclear)

* Pairing: "press and hold Connect for 2 seconds until you hear beeps" (reported; differs
  slightly from the tracker's "~3 s", both describe the same step).
* Uses the `pyftms` library for FTMS, bleak for BLE. `pyftms` license **not verified**.
* Discovery by FTMS UUID or name containing "Rogue"; machine type inferred from name containing
  "bike" (reported, `src/ftms/ftms_connector.py`) — the constant is commented "adjust if needed",
  i.e. the real advertised name was not confirmed by the authors (**assumption**).
* SQLite schema (verified, `src/data/database.py`): `devices`, `workouts`, `workout_data`
  (`workout_id`, `timestamp`, `data TEXT` holding one JSON blob per sample), `configuration`,
  `user_profile` (incl. a Garmin password column).
  Lesson for us: JSON-per-row samples are simple but make analytics queries awkward; typed
  sample columns (or a typed table per metric family) are preferable for v0.3 analytics.
* Calories computed from average power, not from bike counters; no handling of bike counter
  resets (verified by symbol search in `src/data/data_processor.py`).
* Analytics ideas (standard, not project-specific): Normalized Power, Intensity Factor, TSS,
  VO2max estimate.
* Heart-rate guide: generic advice (multiple HR sources, bike may not forward HR over FTMS);
  nothing Echo-specific verified.
* Includes FTMS bike/rower simulators and FIT export — FIT is a candidate for "Later → data export".

## ftms-toolkit-main — calibration tools (no license)

* Target: bikes with **resistance** control (magnetic brakes) to build ERG power curves.
  Not applicable to an air bike, whose resistance comes from the fan.
* Idea worth keeping: a discovery tool that subscribes to *every* notifying characteristic and
  dumps the GATT map — our Diagnostics packet capture covers the FTMS part of this.

## ewoc-main — Android app (GPL-3.0-or-later)

Concepts only, described in our own words. No code, no text.

* Modular monolith: one Gradle build with an app, a desktop app and small shared modules for
  the workout format (`ewo-core`, editor model, editor commands) plus a validator CLI.
  Supports our "modular monolith" direction.
* Own workout file format with specification, JSON schema and fixtures (`spec/ewo/`); imports
  `.zwo`. Relevant for v0.2 (workout formats).
* Trainer-variability principles (docs, paraphrased):
  1. Make device protocol state explicit as named phases instead of scattered callbacks.
  2. The ride session, its totals and export are app-owned; device counters and connections may
     reset or drop without ending the logical ride.
  3. Prefer the conservative path when the device state cannot be proven.
  4. Allow per-device behaviour profiles as an extension point, with shared defaults.
  5. Emit stable, readable lifecycle markers at the protocol boundary for field debugging.
* Invariants worth mirroring once we write to the Control Point: serialize control writes; do
  not treat a session as active before control is granted; explicit stopping state; passive
  availability probes that do not claim GATT ownership.
