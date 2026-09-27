# Canonical telemetry and device model

Status: design proposal, 2026-09-27. No production code. TypeScript below is illustrative
only. Based on [architecture.md](architecture.md) and
[../research/ftms-ble-analysis.md](../research/ftms-ble-analysis.md); units per D2
([../decisions.md](../decisions.md)).

## 1. Three representations, three owners

| Level | Module | Example type | Who may see it |
| --- | --- | --- | --- |
| **FTMS protocol data** | `protocol/ftms` | `IndoorBikeData` (one packet), `IndoorBikeRecord` (reassembled), `FitnessMachineFeature`, `MachineStatus`, `TrainingStatus` | `protocol`, `device` only |
| **Canonical telemetry** | `telemetry` | `TelemetrySample`, `DeviceCapabilities`, `TelemetrySource` | device (producer); workout, recording, app, UI (types) |
| **Domain telemetry** (stored) | `domain` | `Sample` (per session, OAB deltas), `SessionSummary`, `SessionEvent` | recording (producer); analytics, persistence, integrations, app, UI |

Rules:

* Protocol data never leaves `device/`. No flags, resolutions, op codes, More Data, UUIDs or
  sentinel values above that line.
* The only mapping protocol → canonical is in `device/ftms-indoor-bike/` (today `canonical.ts`).
* Canonical telemetry is *what the source reports now*. Domain telemetry is *what OAB recorded for
  a session*. `recording` is the only mapping between them (counter deltas, pauses, session time).
* Nothing in canonical or domain telemetry names a device model; the source is identified by an
  opaque `profileId`.

## 2. FTMS field mapping

| FTMS Indoor Bike Data field | Protocol value | Canonical | Why |
| --- | --- | --- | --- |
| Instantaneous Speed | 0.01 km/h | `speedKmh` | instantaneous |
| Average Speed | 0.01 km/h | – (diagnostics) | device-session average; OAB computes its own |
| Instantaneous Cadence | 0.5 rpm | `cadenceRpm` | instantaneous |
| Average Cadence | 0.5 rpm | – (diagnostics) | as above |
| Total Distance | m (uint24) | `deviceCounters.distanceM` | cumulative, device-scoped |
| Resistance Level | unitless (size disputed, R1) | – (diagnostics) | not meaningful on an air bike; revisit for other bikes |
| Instantaneous Power | W (sint16) | `powerW` | instantaneous; negative → `undefined` + diagnostic (*proposal*) |
| Average Power | W | – (diagnostics) | device-session average |
| Total Energy | kcal | `deviceCounters.energyKcal` | cumulative, device-scoped |
| Energy per Hour / per Minute | kcal | – (diagnostics) | derived by the device |
| Heart Rate | bpm | `heartRate { bpm, source: 'fitnessMachine' }` | `0` → `undefined` |
| Metabolic Equivalent | 0.1 MET | – | not used |
| Elapsed Time | s | `deviceCounters.elapsedS` | cumulative, device-scoped |
| Remaining Time | s | – | belongs to the console's own program |
| "Data not available" sentinels | e.g. `0xFFFF` | `undefined` | decoded to `undefined` in `protocol` |

| Other FTMS data | Goes to |
| --- | --- |
| Fitness Machine Feature bits (0x2ACC) | `DeviceCapabilities.metrics[*].reported` |
| Machine Status (0x2ADA) started/stopped/paused/reset | `DeviceEvent` (+ reset → `counterEpoch` increment) |
| Training Status (0x2AD3) | diagnostics only |
| Device Information Service strings | `DeviceDescriptor` |
| Control Point responses (later, R6/R10) | `DeviceCapabilities.control` |

## 3. Canonical telemetry sample

```ts
// telemetry/types.ts — design sketch
type EpochMs = number;       // wall clock, for storage/display
type MonoMs = number;        // monotonic clock, for durations and ordering

interface TelemetrySample {
  /** Identifies the producing source; no device-model knowledge. */
  sourceId: string;

  /** When the record was complete (last fragment received). Both from the injected Clock. */
  receivedAt: EpochMs;
  mono: MonoMs;

  // Instantaneous metrics — the value "now". undefined = not in this record / not available.
  powerW?: number;           // W, >= 0
  cadenceRpm?: number;       // 1/min
  speedKmh?: number;         // km/h (D2); integrations convert (FIT: m/s)
  heartRate?: HeartRateReading;

  // Cumulative metrics — the device's own running totals. Not workout totals.
  deviceCounters: DeviceCounters;
}

interface DeviceCounters {
  distanceM?: number;        // m
  energyKcal?: number;       // kcal
  elapsedS?: number;         // s
  /** Increments when the source knows its counters restarted (Machine Status reset, reconnect
   *  to a fresh console session). Recording also treats a decrease as a restart. */
  counterEpoch: number;
}

type HeartRateSource = 'fitnessMachine' | 'heartRateSensor';
interface HeartRateReading { bpm: number; source: HeartRateSource }
```

### Semantics

| Topic | Rule |
| --- | --- |
| Granularity | one sample per complete data record (after More Data reassembly); ~1 Hz assumed (R11); no resampling at the source (S2) |
| Snapshot, not "last known" | a sample contains only what that record carried. "Last known value + age" is a stream feature (§6), not a sample field. |
| Missing values | `undefined` means *not in this record* (field absent, flag clear, sentinel). *Not supported at all* is expressed by capabilities, never by the sample. `0` is a real value (e.g. rider stopped). |
| Heart rate `0` | treated as "no reading" → `undefined` (bridge and ewoc do the same) |
| Plausibility | out-of-range values become `undefined` + diagnostic; ranges are telemetry constants (*assumption:* HR 30–240 bpm, cadence 0–250 rpm, power 0–3000 W) |
| Units | W, 1/min, km/h, bpm, m, kcal, s (D2). No other unit appears in canonical or domain types. |
| Time | `receivedAt` for storage and display; `mono` for deltas, staleness and ordering, so a wall-clock jump never breaks recording. Simulator and replay control both through the injected `Clock`. |

### Four kinds of elapsed time

| Time | Owner | Pauses? | Resets? |
| --- | --- | --- | --- |
| Device elapsed (`deviceCounters.elapsedS`) | the console | per console | console reset, sleep |
| Connection uptime | device | – | on reconnect |
| Session active / elapsed time | recording | active: yes / elapsed: no | never within a session |
| Workout time | workout engine | yes (follows session pause) | per workout |

Only session and workout time are shown as "training time"; device elapsed is diagnostic.

## 4. Device model

```ts
// device/types.ts — design sketch
type DeviceKind = 'indoorBike' | 'heartRateSensor';
type DeviceOrigin = 'ble' | 'simulated' | 'replay';

interface DeviceDescriptor {
  id: string;                 // stable per browser profile; replay: anonymised id from the capture
  name?: string;              // advertised name
  kind: DeviceKind;
  origin: DeviceOrigin;       // results from simulated/replay sources never count as PRs or benchmarks
  profileId: string;          // e.g. "rogue-echo-bike-v3", "generic-ftms-indoor-bike"
  profileName: string;
  protocol: 'ftms' | 'hrs';
  manufacturer?: string;      // Device Information Service
  model?: string;
  firmware?: string;
  hardware?: string;
  software?: string;
  // serial numbers are not kept (privacy); DIS details beyond this go to diagnostics
}

type DeviceConnectionState =
  | { phase: 'idle' }
  | { phase: 'connecting' }
  | { phase: 'settingUp' }                 // services, feature read, subscriptions
  | { phase: 'ready' }
  | { phase: 'reconnecting'; attempt: number; nextInMs: number }
  | { phase: 'disconnected'; reason: 'user' | 'linkLost' | 'gaveUp' }
  | { phase: 'failed'; error: DeviceErrorCode };

type DeviceErrorCode =
  | 'bluetoothUnavailable' | 'permissionDenied' | 'cancelled' | 'notFound'
  | 'unsupportedDevice'      // no FTMS / no Indoor Bike Data
  | 'setupFailed' | 'timeout';

type DeviceEvent =
  | { kind: 'started' | 'paused' | 'stopped' }  // Machine Status (console buttons)
  | { kind: 'countersReset' }                    // Machine Status reset / detected restart
  | { kind: 'other'; label: string };
```

* `DeviceDescriptor` maps to the persisted domain `Device` (id, name, profileId, origin, model
  strings) via the app; domain never sees `protocol`.
* Connection state (device lifecycle) and **freshness** (data flowing or not, §6) are separate:
  a device can be `ready` and `stale` (rider stopped pedalling; the Echo only sends while
  moving — reported).

## 5. Device capabilities

Defined in `telemetry/` so workout, analytics and UI can use them without importing `device`.

```ts
type Metric = 'power' | 'cadence' | 'speed' | 'heartRate' | 'distance' | 'energy' | 'elapsedTime';

interface MetricCapability {
  reported: boolean;          // declared by the device (FTMS Feature bits; speed is mandatory)
  expected: boolean;          // the matched profile expects it (e.g. Echo: power, cadence, …)
  observed: boolean;          // actually seen in at least one record this connection
}

interface DeviceCapabilities {
  metrics: Record<Metric, MetricCapability>;
  events: { machineStatus: boolean };
  control: {
    startStop: 'unknown' | 'available' | 'unavailable';   // R6/R10; never assumed
    // no target/resistance control: out of scope for air bikes (feature matrix: "No")
  };
}

/** Consumers ask one question; the rule lives in one place. */
declare function isAvailable(c: DeviceCapabilities, m: Metric): boolean; // observed || reported
```

| Situation | Meaning | Consequence |
| --- | --- | --- |
| reported, not yet observed | normal right after connect / before pedalling | show tile with "–" |
| observed, not reported | device sends a field without its feature bit | available; conformance warning (exists today) |
| expected, not reported | profile and device disagree | available if observed; profile warning in diagnostics |
| none of the three | not supported | hide tile; workout validation rejects goals that need it |

Capabilities change during a connection (observed flags) → emitted as `capabilities` events.

## 6. Telemetry stream

The stream (in `telemetry/`) combines sources and adds what a single sample must not contain.

* **Freshness per source:** `live` → `stale` after 3.5 s without a sample → `none` when the
  source is not ready.
* **Latest reading per metric:** `{ value, receivedAt, source }` for the UI (last value + age).
* **Heart-rate precedence:** `heartRateSensor` beats `fitnessMachine` while the sensor is fresh;
  on sensor staleness fall back to the machine value; the chosen source travels with the reading.
* **One merged sample per bike record:** the bike source drives the cadence; a fresh sensor HR is
  attached to it. Recording and workout consume merged samples, so they never merge themselves.

## 7. Conceptual interfaces

```ts
// telemetry/ — read-only view that workout, recording and app depend on
interface TelemetrySource {
  readonly sourceId: string;
  readonly capabilities: DeviceCapabilities;
  onSample(listener: (s: TelemetrySample) => void): Unsubscribe;
  onCapabilities(listener: (c: DeviceCapabilities) => void): Unsubscribe;
}

// device/ — a connectable source with lifecycle; implemented by the FTMS indoor-bike adapter
interface FitnessDevice extends TelemetrySource {
  readonly descriptor: DeviceDescriptor | undefined;   // known after setup
  readonly connection: DeviceConnectionState;
  connect(): Promise<void>;      // rejects with DeviceError(code) — I/O edge, caught in app
  disconnect(): Promise<void>;
  onConnection(l: (s: DeviceConnectionState) => void): Unsubscribe;
  onDeviceEvent(l: (e: DeviceEvent) => void): Unsubscribe;
  /** Protocol-agnostic items for the diagnostics view; packet lines are pre-formatted text. */
  diagnostics(): DiagnosticsReport;
}

// A device whose peripheral is virtual: FTMS adapter + simulator transport (bytes through the
// real parser). Deterministic; no randomness unless a seed is given.
interface SimulatedFitnessDevice extends FitnessDevice {
  readonly simulation: {
    mode: 'realtime' | 'manual';
    setEffort(script: EffortScript): void;      // e.g. cadence/power over time, pauses
    step(ms: number): void;                     // manual mode: advance the injected clock
    inject(fault: SimulatedFault): void;        // gap, linkLoss, truncatedPacket, splitRecord, countersReset
  };
}

// A device that plays back a capture (format v1): FTMS adapter + replay transport.
interface ReplayFitnessDevice extends FitnessDevice {
  readonly replay: {
    readonly capture: CaptureHeader;            // format, version, app version, anonymised device
    readonly durationMs: number;
    readonly positionMs: number;
    speed: number | 'step';                     // 1 = real time, N = accelerated, 'step' = tests
    play(): void;
    pause(): void;
    stepTo(positionMs: number): void;           // forward only; delivers everything up to it
    onEnd(listener: () => void): Unsubscribe;
  };
}
```

Notes:

* **Simulated and replay devices are not separate adapters.** Both are the normal FTMS adapter over
  a virtual transport (architecture exception for the simulator's encoders). The extra
  `simulation` / `replay` handle is only used by tests, the demo mode and diagnostics.
* `descriptor.origin` is `simulated` or `replay`, so sessions from them can be marked and
  excluded from records and benchmarks.
* **Capture v1** (from [../research/recording-storage-analysis.md](../research/recording-storage-analysis.md) §7):
  header, GATT table with full UUIDs and properties, reads with values, notifications with
  UUID + bytes + `mono` offset, connection events, optional app commands; ids anonymised.
  The replay transport answers `read()` and `subscribe()` from it and re-enacts disconnects.
* An HR strap later implements `FitnessDevice` with `kind: 'heartRateSensor'` and joins the
  stream as a second `TelemetrySource`.

## 8. Changes from today's code (proposal, not done)

| Today | Proposed |
| --- | --- |
| `TelemetrySample.at` only | `receivedAt` + `mono`; `sourceId` |
| `heartRateBpm` | `heartRate { bpm, source }`; precedence in the stream |
| `deviceCounters` without restart marker | `counterEpoch` |
| `Capability[]` (flat) in `DeviceInfo` | `DeviceCapabilities` with reported / expected / observed, in `telemetry/` |
| `DeviceInfo.simulated` + `protocol: Record<…>` | `DeviceDescriptor.origin`; protocol details only in diagnostics |
| `ConnectionState` (4 transport states) reused by the adapter | `DeviceConnectionState` with setup, failure and reconnect details; transport keeps its own |
| abstract `DeviceAdapter` | `FitnessDevice` (+ `TelemetrySource`) |
| app formats packets (hex, UUID names) | `diagnostics()` returns pre-formatted lines |

## Open questions

* Plausibility ranges (§3) — confirm with the first real captures.
* Should the stream fill short gaps (hold last value ≤ 1 record) for the UI only? Recording must
  stay unfilled.
* `counterEpoch` on reconnect: increment always, or only when counters decrease? Depends on R12
  (does the console keep its session after a BLE disconnect?).
