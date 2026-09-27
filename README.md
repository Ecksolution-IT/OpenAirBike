# OpenAirBike

OpenAirBike is an open-source, local-first training application for air bikes and FTMS-compatible
fitness equipment. Development currently focuses on the **Rogue Echo Bike V3**.

OpenAirBike connects directly to compatible fitness equipment using Bluetooth Low Energy and FTMS
(the Bluetooth *Fitness Machine Service*) to provide live telemetry, workout recording and, later,
structured training and performance analysis.

> **Connect. Ride. Record. Improve.**

No account. No cloud. No subscription. Your data stays on your device.

## Why OpenAirBike?

An air bike is a simple, brutal training machine, and its console already measures power, cadence
and more. What is missing is open software around it: live data you can read from a distance,
workouts you can record and keep, and — later — structured air-bike training (intervals, Tabata,
EMOM, calorie targets) and honest performance feedback. OpenAirBike is that software layer, built
for air-bike training rather than generic indoor cycling, without a proprietary ecosystem.

## Project status

**Early development / experimental.** Expect breaking changes.

* The first version ("Ride": connect, live data, record, summary, history) is implemented and tested
  with a built-in simulated bike that sends real FTMS data.
* **It has not yet been tested on a real Rogue Echo Bike V3.** That test ("First Ride") is the
  current milestone: [docs/testing/first-ride.md](docs/testing/first-ride.md).
* If you own an Echo Bike V3, a test report and packet capture are the most valuable contribution
  right now ([how](#contributing)).

## Hardware status

"Supported" is only used once we have tested a device successfully ourselves.

| Device | Discovery | Connect | Telemetry | Control | Status |
| --- | --- | --- | --- | --- | --- |
| Rogue Echo Bike V3 | Testing | Testing | Testing | Not verified | Initial target |
| Other FTMS indoor bikes | Not tested | Not tested | Not tested | Not verified | Experimental (generic FTMS profile) |

Connection guide and known facts: [docs/devices/rogue-echo-bike-v3.md](docs/devices/rogue-echo-bike-v3.md).

## Features

### Available now

Implemented and tested with the simulated bike — **not yet confirmed on a real Echo Bike V3**.

* Connect over Web Bluetooth (FTMS), connection state, automatic reconnect after a dropout
* Live screen: power, cadence, speed and heart rate as sent by the bike ("–" if it sends none);
  workout time; workout distance and calories from the bike's own counters (estimated from speed and
  power only if the bike has no counters)
* Record a workout: start, pause/resume, finish, summary; follows the console's start/stop if the
  bike reports it over FTMS (not yet confirmed for the Echo)
* Local workout history; an interrupted workout can be saved on the next start
* Export: JSON or CSV per workout, the whole database as `.sqlite`
* Demo bike (simulator) to try the app without hardware
* Diagnostics: FTMS conformance checks and packet capture in the app; developer tool
  `npm run diagnose` for discovery, GATT services, feature flags and raw/decoded packets
* German interface by default, English when the browser prefers it; metric units, German number format

### Planned

* **Train (v0.2):** interval timer, Tabata, EMOM, target workouts (e.g. 100 kcal, 10 km), templates
* **Understand (v0.3):** charts, personal records, interval comparison, power and cadence trends
* **Habit (v0.4):** Active Work Breaks, quick workouts, streaks, simple goals

### Experimental / research

Not scheduled, needs research or a decision first: standardised air-bike benchmarks and "ghost"
races against your own rides, FIT export (manual upload to Garmin Connect / Strava), heart-rate
straps, more FTMS air bikes, sharing workouts, mobile use (iOS browsers lack Web Bluetooth).
Details: [docs/product/mvp.md](docs/product/mvp.md).

## Requirements

* A computer or Android device with Bluetooth
* **Chrome or Edge** (Web Bluetooth). Safari and Firefox do not support Web Bluetooth.
* The page must be served over **HTTPS or from `localhost`** (browser requirement)
* [Node.js](https://nodejs.org/) 20 or later, npm

## Installation

```bash
git clone https://github.com/Ecksolution-IT/OpenAirBike.git
cd OpenAirBike
npm install
```

## Start the app

```bash
npm run dev          # the app: http://localhost:5173
npm run diagnose     # developer tool for the first hardware test: /tools/hardware-proof/
```

No bike at hand? In the app, click **Demo-Bike verwenden** (*Use demo bike*).

## Connect your Rogue Echo Bike V3

1. Wake the console. Make sure no other app (Rogue app, Zwift, a phone) is connected to the bike.
2. Hold the console's Bluetooth/Connect button about 2–3 s until the icon flashes (Inferred from other
   Echo projects; not yet observed by us).
3. In the app click **Bike verbinden** (*Connect bike*) — or in the developer tool **Scan: FTMS
   service** — and select the bike in the browser's chooser. No pairing in the operating-system
   Bluetooth settings is needed for OpenAirBike.
4. Start pedalling: the console only sends data while the flywheel moves (Inferred, not yet observed).

Full guide with troubleshooting: [docs/devices/rogue-echo-bike-v3.md](docs/devices/rogue-echo-bike-v3.md).

## First Ride

The current milestone is a first test on a real bike: connect, see live power and cadence, disconnect
cleanly. Step-by-step: [docs/testing/first-ride.md](docs/testing/first-ride.md); please record the
result with [docs/testing/rogue-echo-bike-v3-test.md](docs/testing/rogue-echo-bike-v3-test.md).

## Diagnostics and problems

* Bike not found, no data, connection drops: see *Troubleshooting* in the
  [device guide](docs/devices/rogue-echo-bike-v3.md#troubleshooting).
* `npm run diagnose` → **Debug details** shows the device, GATT services and characteristics, FTMS
  feature flags, raw notifications (hex), decoded FTMS data, canonical telemetry and connection
  state; **Download capture** saves it as JSON (no device id, no serial number).
* In the app: **Diagnose** → *FTMS-Konformität* (*FTMS conformance*) and *Paketmitschnitt
  herunterladen* (*Download packet capture*).

## Your data

Workouts are stored only in your browser, in a SQLite database (Origin Private File System). Export
per workout (JSON, CSV) or the whole database (`.sqlite`) from the history page. Clearing the
browser's site data deletes it — export if you want a backup. The database can be open in one tab at
a time.

## Roadmap

| Version | Goal | State |
| --- | --- | --- |
| v0.0.1 First Ride | Real Echo Bike V3: connect, live telemetry, clean disconnect | implemented, **hardware test pending** |
| v0.1 Ride | Record workouts, summary, history | implemented, hardware test pending |
| v0.2 Train | Structured workouts | planned |
| v0.3 Understand | Charts, records, trends | planned |
| v0.4 Habit | Active Work Breaks, streaks, goals | planned |

Acceptance criteria and the full feature classification: [docs/product/mvp.md](docs/product/mvp.md).

## Architecture (short)

A static TypeScript web app, no server:

```text
Bike ─BLE/FTMS─► transport ─► FTMS decoder ─► canonical telemetry ─► recording ─► SQLite (in the browser)
                                                                   └─► live screen
```

The Echo Bike is a device profile on top of a generic FTMS implementation, so other FTMS bikes can be
added without changing the core. Details: [docs/architecture/architecture.md](docs/architecture/architecture.md),
decisions: [docs/architecture/adr/](docs/architecture/adr/README.md), FTMS notes:
[docs/ftms-notes.md](docs/ftms-notes.md). Contributors and AI agents start at [CLAUDE.md](CLAUDE.md).

## Contributing

Most useful right now:

1. **Hardware tests.** Run the [First Ride](docs/testing/first-ride.md) test on a Rogue Echo Bike V3 (or
   another FTMS bike) and open an issue with the filled-in
   [test protocol](docs/testing/rogue-echo-bike-v3-test.md) and the capture file.
2. **Code and docs.** Before a pull request run:

   ```bash
   npm run typecheck && npm test && npm run build
   ```

   Keep to the module boundaries in [docs/architecture/architecture.md](docs/architecture/architecture.md).
   Do not copy code from other projects unless their licence allows it (see
   [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)).

## License

OpenAirBike is licensed under the [Apache License 2.0](LICENSE).

Copyright 2026 Ecksolution-IT
