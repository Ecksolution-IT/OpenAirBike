# Milestone 0 — Hardware proof

Status: tool built and verified without hardware (2026-09-27). **Not yet run on a real Rogue Echo
Bike V3.** Goal: prove that OpenAirBike can find, connect to and decode the Echo over Bluetooth
FTMS, and collect the capture that answers the open questions (R1–R13, W4) before any further
feature work ([mvp.md](mvp.md), AC-16).

## The tool

A separate developer page, `tools/hardware-proof/`, next to the app. Plain DOM, no storage, no app
state, English (diagnostics language, D2).

```text
npm install
npm run diagnose            # opens http://localhost:5173/tools/hardware-proof/
```

Also part of `npm run build` (`dist/tools/hardware-proof/index.html`). Needs Chrome or Edge with
Web Bluetooth (desktop or Android), over HTTPS or localhost.

| Step | How | Code |
| --- | --- | --- |
| 1 Scan | three chooser modes: **FTMS service** (only devices advertising 0x1826), **Echo / Rogue names** (profile name prefixes), **all devices** | `requestDevice`, `requestAnyDevice` in `src/transport/webBluetooth.ts` |
| 2 Recognise the Echo | profile resolution from advertised name + Device Information; shows "recognised: yes/no" | `src/adapters/profiles` |
| 3 Connect | Web Bluetooth transport incl. automatic reconnect; the probe re-runs after each reconnect | `WebBluetoothTransport` |
| 4 GATT inventory | every accessible service and characteristic with full UUID and properties | `GattLink.inventory()` (new) |
| 5 FTMS features | reads Fitness Machine Feature (0x2ACC), shows raw bits and names | `tools/hardware-proof/probe.ts` |
| 6 Subscribe | Indoor Bike Data, plus Training Status, Fitness Machine Status and Feature indications if present | `probe.ts` |
| 7 Raw packets (optional) | checkbox: hex in the log and packets in the capture file; download as JSON (draft capture format, `version: 0`) | `tools/hardware-proof/capture.ts` |
| 8 Decoded telemetry | **Live view** (always): canonical metrics one per line, "–" when not sent, "not declared" when the Feature lacks it. **Debug details** (toggle): GATT list, feature flags, packet log with raw hex and decoded FTMS fields (More Data, truncation, RFU bits), record rate, conformance report | `tools/hardware-proof/decoder.ts` |
| 10 Disconnect | button, and automatically when the page is closed or reloaded (`pagehide`) | `tools/hardware-proof/main.ts` |
| 9 Separation | transport knows GATT only; the probe uses the `GattLink` port; decoding is pure protocol code | `src/transport` ↔ `src/protocol/ftms` |

The probe never throws on a non-standard device: missing FTMS, a missing Indoor Bike Data
characteristic, a short Feature value or failed subscriptions are listed as **problems** and the
connection stays open for inspection. The Device Information serial number is never read, and the
capture contains no device id.

## What works (verified without hardware)

* `npm run typecheck`, `npm test` (160 tests) and `npm run build` pass.
* Unit tests cover:
  * the probe against fake GATT links: setup order, missing FTMS, missing IBD, short Feature,
    failed subscriptions, failed discovery, no serial read;
  * the decoder: complete record → canonical sample, More Data reassembly, link-loss discard,
    truncated payloads, RFU flags, status characteristics, unknown services;
  * the capture: relative times, full UUIDs, no id, raw logging off, memory bound;
  * the simulator's inventory, property mapping, and extra FTMS decoding edge cases (short or
    empty Feature, reserved Feature bits, reserved training status and op codes, parameters).
* End-to-end in headless Chromium with a scripted fake Web Bluetooth device (not committed): chooser
  request per mode, Echo recognised from name + DIS, GATT list, features, 10 decoded records,
  conformance all pass, capture downloaded without id/serial, raw logging off works, no console errors.

## To test on the real bike

Step-by-step guide, expected FTMS functions and what must be confirmed:
[../testing/first-ride.md](../testing/first-ride.md).

## Known uncertainties and limits

* **Only named services are visible.** Web Bluetooth reveals only services listed in the request
  (FTMS, DIS, HR, Battery, Cycling Power, CSC). A vendor-specific Rogue service would stay hidden;
  "all devices" mode changes which devices are listed, not which services are visible.
* **No advertisement data.** The chooser does not expose RSSI or advertised UUIDs; whether the bike
  advertises FTMS is inferred from whether it appears in "FTMS service" mode.
* **Echo name unknown.** The prefixes `Echo` / `Rogue` and the matcher are assumptions (R2).
* **Resistance Level size (R1).** Decoded as `sint16`; if the Echo sets flag bit 5 with a 1-byte
  field, the decoder shows `TRUNCATED` / wrong values and the conformance "payload length" check fails.
* **Timestamps** are the browser's receive time (wall clock) — fine for rate estimates, not for
  sub-100 ms timing.
* **Nothing is written to the bike.** The Control Point is listed but not used (R6/R10 stay open).
* **Reconnect** re-runs the whole probe; the capture shows each run as events.
* **Capture format** is a draft (`version: 0`) for this milestone; the replay format (S4) is Next.
* Browser support: Chromium only; iOS has no Web Bluetooth.
