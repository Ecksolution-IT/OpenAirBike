# BLE and FTMS in the reference projects

Comparison of the BLE/FTMS implementations only (2026-09-26). Method: symbol and keyword searches
plus short targeted reads in the files named in [reference-inventory.md](reference-inventory.md);
no full source reading. License rules: [../decisions.md](../decisions.md) D3 — GPL (`ewoc`) and
unlicensed / README-only projects are concepts and facts only.

Paths are relative to `reference/<project>/`. "OAB" = OpenAirBike as of `main` (plan steps 1–10).

## Comparison

| Topic | ftms (TS, MIT) | Echo tracker (Py) | garmin bridge (Py) | ewoc (Kotlin, GPL) | toolkit (Py) | OAB |
| --- | --- | --- | --- | --- | --- | --- |
| Discovery | – (no BLE) | UUID scan, then name keywords — `gui_tracker.py: BleWorker._scan` | UUID or name contains "Rogue" — `ftms_connector.py: discover_devices`, `ROGUE_MANUFACTURER_NAME` | scanner with scan-mode backoff and journal — `ble/BleDeviceScanner.kt` | name/address filter, full GATT dump — `discover.py: scan_for_bikes`, `discover_services` | app chooser: FTMS UUID + profile name prefixes; hardware-proof tool: FTMS-only / names-only / all devices + GATT inventory |
| Connection | – | `BleakClient(timeout=20)` — `_connect` | `wait_for(connect, 15s)`, 3 tries — `FTMSConnector.connect` | GATT flow with setup abort — `FtmsBleClient.startGattConnection`, `abortSetup` | plain connect | 20 s timeout, setup hook |
| Reconnect | – | none (emits `disconnected`) | exp. backoff + jitter, cap 60 s, no retry on permission errors — `connection_manager.py: _calculate_retry_delay`, `connect_with_retry` | scheduled reconnect, link generations against stale callbacks — `scheduleReconnectIfNeeded`, `nextLinkGeneration`, `handleLinkLoss` | none | backoff 1–30 s, 8 tries, no jitter |
| FTMS service check | constants only | none | via `pyftms` | CCCD setup per characteristic — `writeBikeCccd`, `writeControlPointCccd` | lists all services | reject without FTMS / IBD |
| Feature (0x2ACC) | `decodeFtmsFeatures`, `FTMS_FEATURE_BITS` | not read | stub class `FitnessMachineFeatures` | – (not searched) | read + print | read, indications, capabilities |
| Indoor Bike Data | `parseFtmsIndoorBikeData` + diagnostics | `parse_indoor_bike_data` (flag walk) | `pyftms`, **manual parser for Echo** — `_setup_echo_bike_notifications` | `ftms/IndoorBikeParser.kt: parseIndoorBikeData` + failure classes | `try_decode_ftms_indoor_bike_data` | parser + reassembly + conformance |
| More Data | reported, not reassembled | ignored | ignored (manual parser) | not reassembled (comment only) | ignored | reassembled (FTMS §4.19) |
| Resistance Level size | **uint8** (GSS) | sint16 | sint16 | u16 | sint16 | sint16 (R1) |
| Machine Status (0x2ADA) | `parseFtmsMachineStatus` (all op codes + params) | not subscribed | via `pyftms` callback `machine_status` | used for control ownership | – | subscribed → device events |
| Training Status (0x2AD3) | `parseFtmsTrainingStatus` | – | – | – | – | subscribed, logged |
| Control Point (0x2AD9) | encoder/decoder, no transport — `control.ts: tryEncodeFtmsControlRequest`, `decodeFtmsControlResponse` | writes **without indications, errors swallowed** — `_ctrl_write` | via `pyftms` (`control_point_result`) | full model: ownership, one command in flight, correlation id, timeout — `ble/FtmsController.kt` | resistance commands | not implemented |
| Supported ranges | `decodeFtmsRange`, `decodeSupported*Range` | – | – | used for clamping (quirks) | read as `<hhh` without resolution | not decoded |
| Capability detection | feature flags → booleans | none | device type from name | fingerprint + match confidence — `compat/quirks/TrainerFingerprint.kt`, `QuirksRegistry` | feature print | feature bits → capabilities |
| Raw packets / diagnostics | typed issues: truncated, reserved flags, trailing bytes, unknown opcode … — `types.ts: FtmsDiagnosticCode` | – | hex logging per notification | payload preview, parse-failure classes, notification-rate logging | hex dump | packet capture + conformance report |
| Error handling | `Result` types (`ok`/`error`), throwing variant optional | `except Exception: pass` | classified errors, callbacks | failure taxonomy, timeouts, rollback — `compat/CompatibilityFailureTaxonomy.kt` | print | errors surfaced, reconnect log |

## 1. Cleanest solution

* **Protocol codecs: `ftms`.** Pure functions, typed results with diagnostics instead of exceptions,
  every FTMS characteristic and Control Point op code, a language-neutral conformance corpus with
  provenance (GSS revision, errata). It deliberately leaves transport, reassembly and control
  ownership to the caller; its README lists the caller's duties (see §3).
* **BLE lifecycle and control: `ewoc` (concepts only, GPL).** The only project that models link
  generations, control ownership, one Control Point command in flight with timeout and correlation,
  per-device quirks with fingerprints, and telemetry-stall detection.
* The bridge's `connection_manager.py` is a reasonable reconnect/backoff design; its FTMS part is
  not (library bypassed for the Echo, stubbed polling `_start_data_polling`). The Echo tracker and
  the toolkit are scripts without error handling.

## 2. Rogue-specific findings

No project decodes anything non-standard for the Echo. What is Rogue-specific:

| Finding | Source | Status |
| --- | --- | --- |
| Discovery by name keywords (`rogue`, `echo`, `bike`, `assault`, `ftms`) as a fallback when the UUID scan finds nothing | tracker `ECHO_BIKE_KEYWORDS`, `_scan`; bridge `ROGUE_MANUFACTURER_NAME` ("adjust if needed") | reported; real name unknown (R2) |
| Bike vs. rower inferred from the name ("echo" + "rower") | bridge `connect`, lines ~431–441 | reported |
| For Echo devices the bridge bypasses `pyftms` and subscribes/parses Indoor Bike Data itself, "immediately" after connect | bridge `_setup_echo_bike_notifications` (called at ~577) | reported; reason not documented — **assumption:** the generic library did not deliver Echo data or delivered it too late |
| Heart rate 0 means "no sensor" | bridge `_setup_echo_bike_notifications` (~844) | reported; OAB already treats 0 as unavailable |
| Control Point writes may be ignored by the console firmware | tracker README "fire-and-forget" | reported; untested (R6) |
| Pairing: hold the console's BT/Connect button 2–3 s; data only while pedalling | both READMEs, see [echo-bike-v3.md](echo-bike-v3.md) | reported |

Conclusion (assumption until a capture exists): the Echo Bike V3 is a standard FTMS indoor bike;
its specifics are about discovery, setup timing and which optional parts it implements.

## 3. Generic FTMS core

Belongs in `src/protocol/ftms` + `src/adapters/ftms-indoor-bike` (no device names):

* Codecs for all FTMS characteristics incl. **Supported … Range** and **Control Point request/response**
  (today: IBD, Feature, Training/Machine Status only).
* Diagnostics as typed issues per payload (truncated, reserved flags, trailing bytes, unavailable
  values, unknown op codes) — richer than today's `truncated` flag; feeds the conformance monitor.
* Data Record reassembly and link-loss discard (exists).
* Discovery/setup sequence per FTMP: service check, Feature read + indication, subscriptions (exists).
* **Control Point session model** (needed only if R6 = yes): request control → wait for indication,
  serialize procedures (one in flight), timeout, result-code handling, Control Permission Lost,
  ownership reset on disconnect, clamp to supported ranges, user confirmation for resistance/targets.
  These duties are listed in `ftms/README.md` "Control safety and ownership".
* Reconnect with link generations (ignore callbacks from an old connection) and jittered backoff.
* Telemetry-stall detection (connected but no data) — partly exists as stale detection.

## 4. Rogue Echo V3 adapter (profile)

Only data and small overrides in `src/adapters/profiles/echoBikeV3.ts`, filled from a capture:

* Name/manufacturer/model matchers (R2, R7) and chooser name prefixes.
* Expected capability set (R3) — to warn when the bike reports less than expected.
* Heart-rate policy (R5): FTMS field, separate HR service, or none.
* Control policy (R6): "read-only" unless proven that Request Control / Start / Stop work.
* Timing overrides if needed (setup delay, stall window, reconnect settle) — the bridge's "immediate
  subscription" hint suggests setup timing may matter (R8).
* Counter behaviour (R4): whether the console resets distance/energy on idle, so recording rules can
  be tuned. **No protocol parsing in the profile** unless a capture shows a real deviation.

## 5. Implement ourselves

* Everything transport-related: no reference project uses Web Bluetooth (all Python/bleak or Android).
* Reassembly, conformance monitor, canonical mapping, profiles/quirks model — already ours.
* Control Point session model and supported-range decoding — our own implementation, designed
  after the concepts above (ewoc: concepts only; `ftms`: see §6).
* Diagnostics issue model — own implementation, same idea as `ftms` `FtmsDiagnosticCode`.

## 6. MIT material that could be reused

Only **`ftms`** qualifies (MIT with `LICENSE` file):

| Part | Files / symbols | Recommendation |
| --- | --- | --- |
| Conformance vectors | `conformance/v1/vectors.json` | already used as test fixtures (D3) |
| Control request encoder / response decoder | `src/control.ts: tryEncodeFtmsControlRequest`, `decodeFtmsControlResponse`, `getFtmsResultCodeName` | candidate for adoption with attribution **or** own implementation checked against its `controls` / `controlResponses` vectors (preferred: own code, their vectors) |
| Range decoders | `src/features.ts: decodeFtmsRange`, `decodeSupported*Range` | same approach |
| Constants tables | `src/constants.ts` (op codes, result codes, status op codes, feature bits) | facts; our own tables already exist |

Not reusable: Echo tracker and garmin bridge ("MIT" only in README, no LICENSE file/copyright →
ask the authors to add a LICENSE before any adoption), `pyftms` (license unverified, Python),
`ftms-toolkit` (no license), `ewoc` (GPL).

## 7. Open questions for the real bike

Existing R1–R7 in [echo-bike-v3.md](echo-bike-v3.md), plus from this comparison:

| # | Question | Why |
| --- | --- | --- |
| R8 | Does a standard FTMP setup (Feature read, then subscriptions) deliver Indoor Bike Data reliably, or does the Echo need subscriptions immediately after connect? | bridge bypasses its library for the Echo |
| R9 | Is Resistance Level (flag bit 5) ever set? (sub-question of R1) | four parsers disagree on its size |
| R10 | Control Point: are indications enabled/answered; result codes for Request Control, Start (0x07), Stop (0x08 01); is Control Permission Lost sent? | tracker never reads responses |
| R11 | Notification rate and whether records are split (More Data) | sizing of stall detection and reassembly |
| R12 | After a BLE disconnect, does the console keep its session (Elapsed Time continues)? | conformance CN/BV-65-C, recording continuity |
| R13 | Which services besides FTMS exist (DIS 0x180A, HR 0x180D, Battery 0x180F, vendor UUIDs)? | profile identification, HR (R5) |

Suggested capture routine: connect, idle 10 s, ride 60 s with a sprint, stop pedalling 90 s, ride
30 s, disconnect and reconnect mid-ride, then Diagnostics → download packet capture.
