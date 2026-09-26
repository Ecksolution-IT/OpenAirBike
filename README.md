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

---

## Roadmap

### v0.1 — Ride

**Goal:** Reliable connection and workout recording.

* [ ] discover Rogue Echo Bike V3
* [ ] connect via BLE
* [ ] identify FTMS services
* [ ] read telemetry
* [ ] display live metrics
* [ ] start / stop workout
* [ ] store workout locally
* [ ] workout summary
* [ ] workout history

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

License to be determined before the first public release.

---

## Vision

The long-term idea behind OpenAirBike is simple:

**Your bike produces useful training data. You should be able to use it.**

OpenAirBike aims to become an open platform around air-bike training — starting with the Rogue Echo Bike V3 and expanding only where real users and real use cases justify it.
