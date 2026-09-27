Copyright 2026 Ecksolution-IT
Open-source training and telemetry platform for FTMS-compatible air bikes. Live metrics, custom workouts, active work breaks, performance analytics and workout history - built for the Rogue Echo Bike V3 and beyond.

# OpenAirBike

**Open-source training and telemetry software for the Rogue Echo Bike V3.**

OpenAirBike connects to a Rogue Echo Bike V3 via Bluetooth FTMS and turns its training data into a simple, open and extensible workout platform.

The first goal is intentionally small:

> Connect the bike. See live data. Train. Save the workout. Understand your performance.

No proprietary ecosystem.
No required subscription.
No unnecessary complexity.

---

## Why OpenAirBike?

The Rogue Echo Bike is a simple and effective training machine.

Its connected console provides access to training data, but there is much more we can do with that data.

OpenAirBike aims to provide a dedicated software layer for air-bike training:

* live telemetry
* structured workouts
* interval training
* workout history
* performance analytics
* personal records
* active work breaks

The focus is not traditional indoor cycling.

The focus is **air-bike training**.

---

## The Product

OpenAirBike is a local-first training application that connects directly to a compatible air bike using Bluetooth Low Energy and FTMS.

The basic workflow should be as simple as:

```text
Open OpenAirBike
      ↓
Connect Bike
      ↓
Start Training
      ↓
See Live Metrics
      ↓
Finish Workout
      ↓
Review Performance
```

The bike remains the training machine.

OpenAirBike becomes the software around it.

---

## Initial Target

The first supported device is:

**Rogue Echo Bike V3**

The initial development target is deliberately limited to one bike so that connectivity, telemetry and workout recording can be made reliable before supporting additional hardware.

Future FTMS-compatible air bikes may be added once the core implementation is stable.

---

## MVP — v0.1

Version 0.1 focuses on one complete use case:

> Ride the bike and record the workout.

### Bike Connection

* discover the Rogue Echo Bike V3
* connect via Bluetooth Low Energy
* detect connection state
* reconnect when possible
* read available FTMS data

### Live Dashboard

Display available training metrics such as:

* elapsed time
* RPM / cadence
* power
* distance
* speed
* calories

Exact metrics depend on the data exposed by the bike.

### Workout Recording

A training session can be:

* started
* paused if supported
* stopped
* saved locally

### Workout History

Stored workouts should contain the available telemetry and basic summary information.

Example:

```text
Workout
────────────────────────────

Date        2026-09-26
Duration       24:18
Distance        8.4 km
Calories        241 kcal
Avg Power       186 W
Max Power       612 W
Avg RPM          58
Max RPM          91
```

---

## Live Training

The live screen should prioritize readability over complexity.

Example:

```text
┌─────────────────────────────────┐
│          OPENAIRBIKE            │
│                                 │
│             428 W               │
│                                 │
│       67 RPM     148 BPM        │
│                                 │
│       08:42       4.7 KM        │
│                                 │
│  ████████████████░░░░           │
│                                 │
│        INTERVAL 6 / 10          │
│                                 │
│        00:32 remaining          │
└─────────────────────────────────┘
```

The interface should work from several meters away while training.

Large numbers.

Few controls.

No distractions.

---

## Custom Workouts

After basic workout recording is reliable, OpenAirBike should support structured air-bike workouts.

Examples:

### Intervals

```text
10 rounds

00:30 HARD
01:30 EASY
```

### Tabata

```text
8 rounds

00:20 WORK
00:10 REST
```

### EMOM

```text
20 minutes

Minute 1: Bike
Minute 2: Rest
```

### Target Workout

```text
Goal

100 calories

or

10 km
```

Workouts should eventually be definable by the user instead of being hard-coded into the application.

---

## Active Work Breaks

One experimental direction for OpenAirBike is using an air bike as part of the working day.

Instead of requiring a full workout, OpenAirBike could suggest short movement sessions.

Example:

```text
ACTIVE BREAK

You've been working for 52 minutes.

Bike connected ✓

Today's break:

03:00 EASY
00:20 HARD
01:00 EASY

Total: 04:20

[ START ]
```

This could turn the bike from something used only for dedicated workouts into something used throughout the day.

Active Work Breaks are **not part of the initial MVP**.

They are an area to explore after the core training experience works reliably.

---

## Product Principles

### 1. Local First

A workout should not require a cloud account.

Connect the bike and train.

### 2. Open

Users should be able to access their own workout data.

No artificial lock-in.

### 3. Air-Bike First

OpenAirBike is not trying to become another generic cycling platform.

Features should make sense for air-bike training.

### 4. Simple During Training

If a feature requires attention while riding, it is probably too complicated.

### 5. Data Should Become Useful

Collecting telemetry alone is not enough.

OpenAirBike should eventually answer questions such as:

* Am I getting stronger?
* Is my sprint power improving?
* Can I maintain higher power for longer?
* How consistent are my intervals?
* What are my personal records?
* How often am I actually training?

---

## Architecture Concept

The initial architecture should remain small.

```text
Rogue Echo Bike V3
        │
        │ Bluetooth LE
        │ FTMS
        ▼
┌───────────────────┐
│   Device Layer    │
└─────────┬─────────┘
          │
          ▼
┌───────────────────┐
│    FTMS Parser    │
└─────────┬─────────┘
          │
          ▼
┌───────────────────┐
│ Telemetry Engine  │
└─────────┬─────────┘
          │
     ┌────┴────┐
     ▼         ▼
 Dashboard   Recorder
               │
               ▼
         Local Storage
               │
               ▼
        Workout History
```

Cloud infrastructure is not required for the first version.

### Implementation

OpenAirBike is a browser app written in TypeScript. It talks to the bike through
[Web Bluetooth](https://developer.mozilla.org/docs/Web/API/Web_Bluetooth_API), so there is nothing to
install and no server: the app is a set of static files, and workouts stay in a SQLite database inside
the browser (Origin Private File System).

| Layer               | Code                                | Responsibility                                                              |
| ------------------- | ----------------------------------- | --------------------------------------------------------------------------- |
| Transport           | `src/transport/`                    | Web Bluetooth connect / reconnect, GATT read and subscribe. Bytes only. Simulator as a transport fake. |
| Protocol            | `src/protocol/ftms/`                | FTMS codecs, Data Record reassembly, conformance checks. No I/O.            |
| Device Adapter      | `src/adapters/`                     | FTMS indoor bike → Canonical Telemetry; device profiles (Rogue Echo Bike V3, generic FTMS). |
| Canonical Telemetry | `src/telemetry/`                    | Device-independent samples (km/h, m, W, kcal, 1/min) and live stream.       |
| Recording           | `src/recording/`                    | Start / pause / resume / stop, distance and calorie accounting, summary.    |
| Domain              | `src/domain/`                       | Device, Session, Sample, Summary; repository contracts. No I/O.             |
| Persistence         | `src/persistence/`                  | SQLite in a worker (OPFS) behind the repository contracts; in-memory reference; JSON / CSV / `.sqlite` export. |
| Application         | `src/app/`                          | Wires the layers, offers use cases to the UI.                               |
| UI                  | `src/ui/`                           | Connect screen, live training screen, summary, history, diagnostics.        |

The FTMS implementation follows the Bluetooth SIG *Fitness Machine Service* and *Fitness Machine Profile*
v1.0.1 (collector role). Notable details:

* Indoor Bike Data records split across several notifications are reassembled (FTMS §4.19), and a
  partial record is dropped after link loss (FTMS §4.18).
* RFU flag bits, extra trailing octets and "Data Not Available" values are tolerated (FTMP §4.4.7).
* The bike's distance and energy counters belong to *its* session, not the workout. OpenAirBike only
  uses the deltas between readings, so a workout can start at any time, pauses are respected and a
  console reset does not corrupt the totals. Bikes without those counters fall back to integrating
  speed and power.
* When the console reports "stopped / paused by the user" or "started / resumed" via Fitness Machine
  Status, the workout pauses or resumes with it.
* **Diagnose → FTMS-Konformität** (Diagnostics → FTMS conformance) checks what the bike sends against the Bluetooth SIG FTMS test
  suite (FTMS.TS) and ICS: complete Data Records, reserved bits, fields matching the Fitness Machine
  Feature bits, Elapsed Time across link loss. The result is included in every packet capture.

Requirements, sources and their mapping to the code: [`docs/ftms-notes.md`](docs/ftms-notes.md).
Architecture decisions: [`docs/decisions.md`](docs/decisions.md); current plan:
[`docs/plan-first-technical-goal.md`](docs/plan-first-technical-goal.md).

---

## Roadmap

### v0.1 — Ride

**Goal:** Reliable connection and workout recording.

* [x] discover Rogue Echo Bike V3
* [x] connect via BLE
* [x] identify FTMS services
* [x] read telemetry
* [x] display live metrics
* [x] start / stop workout
* [x] store workout locally
* [x] workout summary
* [x] workout history

Implemented against the FTMS specification and the built-in simulator; validation on real
Rogue Echo Bike V3 hardware is in progress (see [Project Status](#project-status)).

### v0.2 — Train

**Goal:** Structured workouts.

* [ ] interval timer
* [ ] custom intervals
* [ ] workout templates
* [ ] target workouts
* [ ] workout progress

### v0.3 — Understand

**Goal:** Turn telemetry into useful feedback.

* [ ] performance charts
* [ ] personal records
* [ ] interval comparison
* [ ] power trends
* [ ] cadence trends
* [ ] training frequency

### v0.4 — Habit

**Goal:** Make regular training easier.

* [ ] Active Work Breaks
* [ ] quick workouts
* [ ] training streaks
* [ ] simple goals

### Later

Possible areas to explore:

* heart-rate sensors
* additional FTMS air bikes
* data export
* workout import/export
* community workout library
* optional synchronization
* external integrations

These are ideas, not commitments.

---

## What OpenAirBike Is Not

OpenAirBike is currently **not** intended to be:

* a Zwift replacement
* a social fitness network
* a generic gym application
* an AI fitness coach
* a cloud-first SaaS platform
* a replacement for the bike console

The project should first solve one problem extremely well:

> Make training with an FTMS-compatible air bike measurable, programmable and easy to review.

---

## Project Status

**Early development / experimental**

The project currently focuses on validating communication with the Rogue Echo Bike V3 and understanding the telemetry exposed through FTMS.

Expect breaking changes.

The v0.1 app is implemented and tested against the FTMS specification with a simulated bike. What the
Rogue Echo Bike V3 actually sends (which fields, how often, how its console session behaves) still has
to be confirmed on real hardware. If you own one, a packet capture from **Diagnose → Paketmitschnitt herunterladen** (Diagnostics → Download packet
capture) is the most useful contribution right now. For a deeper look (all GATT services, features,
per-packet decoding) use the hardware-proof developer tool: `npm run dev:hardware`, see
[docs/product/milestone-0-hardware-proof.md](docs/product/milestone-0-hardware-proof.md).

---

## Getting Started

### Requirements

* A browser with Web Bluetooth: **Chrome or Edge** on Windows, macOS, Linux, ChromeOS or Android.
  Safari and Firefox do not support Web Bluetooth; on iOS a Web Bluetooth browser such as Bluefy may work.
* The page must be served over **HTTPS or from `localhost`** (a browser requirement for Bluetooth).
* [Node.js](https://nodejs.org/) 20 or later for development.

### Run it

```bash
npm install
npm run dev        # http://localhost:5173
```

1. Turn on the Echo Bike console and make sure no other app (e.g. the Rogue app or Zwift) is connected to it.
2. Click **Bike verbinden** (Connect bike) and select the bike in the browser's chooser.
3. Click **Training starten** (Start workout) and ride.
4. **Beenden** (Finish, tap twice) saves the workout locally and shows the summary.

No bike at hand? **Demo-Bike verwenden** (Use demo bike) runs the full app against a simulated air bike that sends real
FTMS packets.

The interface is in German by default and switches to English when the browser prefers English.
Numbers, dates and units follow the German / European conventions (decimal comma, 24-hour clock,
km/h, km, W, kcal).

### Build and test

```bash
npm test           # unit and contract tests (FTMS, adapter, recording, SQLite repositories, formats)
npm run typecheck
npm run build      # static files in dist/, host them on any HTTPS static host
```

### Your data

Workouts are stored only in your browser, in a SQLite database. Each workout can be exported as JSON
or CSV, and the history page exports the whole database as a standard `.sqlite` file that any SQLite
tool can open. The schema is in
[`src/persistence/sqlite/migrations/`](src/persistence/sqlite/migrations/) and the domain types in
[`src/domain/types.ts`](src/domain/types.ts): sessions with a summary, one sample per bike reading
(active time, power, cadence, speed, heart rate, cumulative distance and calories) and events
(pause, resume, connection loss, console buttons).

While riding, samples are written every 5 seconds. If the browser closes during a ride, the app offers
to save the unfinished workout on the next start. The database can be open in only one tab at a time.

---

## Contributing

OpenAirBike is intended to be an open-source project.

Contributions will eventually be welcome in areas such as:

* FTMS implementation
* device compatibility
* workout formats
* UI/UX
* telemetry analysis
* testing
* documentation

Development guidelines will be added as the architecture stabilizes.

---

## License

OpenAirBike is licensed under the [Apache License 2.0](LICENSE).

Copyright 2026 Ecksolution-IT

---

## Vision

The long-term idea behind OpenAirBike is simple:

**Your bike produces useful training data. You should be able to use it.**

OpenAirBike aims to become an open platform around air-bike training — starting with the Rogue Echo Bike V3 and expanding only where real users and real use cases justify it.
