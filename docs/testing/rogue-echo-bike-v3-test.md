# Rogue Echo Bike V3 — hardware test protocol

Copy this template for every hardware test (e.g. into an issue or
`docs/testing/results/<date>-echo-bike-v3.md`). Fill in only what you saw. Use **Not tested** when
you did not check something and **Not reported** when the bike or tool gave no value — never guess.
Procedure: [first-ride.md](first-ride.md) · guide: [../devices/rogue-echo-bike-v3.md](../devices/rogue-echo-bike-v3.md).

## Setup

| Field | Value |
| --- | --- |
| Date | |
| Tester | |
| OpenAirBike version / commit | `git rev-parse --short HEAD`: |
| Tool used | `npm run diagnose` / app (`npm run dev`) |
| Bike | Rogue Echo Bike V3 |
| Console / firmware (Device Information, if shown) | |
| Operating system + version | |
| Browser + version | |
| Bluetooth adapter (built-in / USB model) | |
| Other apps connected to the bike before the test | |

## Results

| Check | Result (Yes / No / Not tested / Not reported) | Details |
| --- | --- | --- |
| Discovery: listed in chooser mode *FTMS service* | | |
| Discovery: listed in mode *Echo / Rogue names* | | |
| Discovery: listed in mode *all devices* | | |
| Advertised name | | |
| Profile recognised as Rogue Echo Bike V3 | | |
| Connection established | | time from selecting to `connected`: |
| FTMS service (0x1826) present | | |
| FTMS features (raw + names) | | copy the "Machine features" line |
| Characteristics (GATT list) | | copy the list |
| Other services (DIS, HR, Battery, …) | | |
| Indoor Bike Data subscribed | | |
| Power | | typical value while pedalling: |
| Cadence | | |
| Speed | | |
| Distance (bike counter) | | compare with console: |
| Energy / calories (bike counter) | | compare with console: |
| Heart rate | | strap paired to the console? |
| Elapsed time (bike counter) | | |
| Other FTMS fields in the decoded packet log | | |
| Record rate (Status line) | | records/s |
| Data only while pedalling | | |
| Training Status / Fitness Machine Status seen | | |
| Control Point (0x2AD9) present | | presence only — never written |
| Disconnect via button | | console free afterwards? |
| Reconnect after dropout (walk away / power-cycle) | | time; did counters continue? |
| FTMS conformance lines not PASS | | |

## Raw packet sample

Three to five consecutive Indoor Bike Data lines from the packet log (hex + decoded), with *Raw
packets* on:

```text

```

## Errors

Exact messages from the page or the packet log:

```text

```

## Notes

Anything unexpected. Attach the downloaded capture file (`openairbike-capture-*.json`).
