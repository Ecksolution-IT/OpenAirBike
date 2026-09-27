# FTMS notes for OpenAirBike

OpenAirBike is an FTMS **collector** (client). The bike is the FTMS **server**. This page collects
the requirements from the Bluetooth SIG documents that matter for OpenAirBike, and where the code
implements them. The SIG documents themselves are not part of this repository; they are available
from [bluetooth.com](https://www.bluetooth.com/specifications/specs/).

| Document | Version | Role in this project |
| --- | --- | --- |
| Fitness Machine Service (FTMS) | v1.0.1 | Characteristic formats and server behaviour |
| Fitness Machine Profile (FTMP) | v1.0.1 | Collector requirements (what OpenAirBike must do) |
| FTMS Test Suite (FTMS.TS) | p6, 2024-10-08 | Server test cases; basis of the passive conformance checks |
| FTMS ICS (FTMS.ICS) | p5 | Mandatory / conditional server features; basis of the ICS checks |

## Collector requirements (FTMP)

| Requirement | Reference | Code |
| --- | --- | --- |
| Discover the Fitness Machine Service and its characteristics | FTMP §4.2–4.3 | `src/adapters/ftms-indoor-bike/adapter.ts` |
| Read Fitness Machine Feature | FTMP §4.4.1 | `src/adapters/ftms-indoor-bike/adapter.ts`, `src/protocol/ftms/machineInfo.ts` |
| Configure notifications of Indoor Bike Data | FTMP §4.4.7 | `src/adapters/ftms-indoor-bike/adapter.ts` |
| Determine present fields from the Flags field | FTMP §4.4.7 | `src/protocol/ftms/indoorBikeData.ts` |
| Handle Data Records split over several notifications (More Data) | FTMP §4.4.7, FTMS §4.19 | `src/protocol/ftms/dataRecord.ts` |
| Ignore RFU flag bits and unrecognised trailing octets | FTMP §4.4.7 | `src/protocol/ftms/indoorBikeData.ts` |
| Tolerate "Data Not Available" special values | FTMP §4.4.7, FTMS §4.9.1.10–12 | `src/protocol/ftms/indoorBikeData.ts` |
| Should configure notifications of Training Status | FTMP §4.4.8 | `src/adapters/ftms-indoor-bike/adapter.ts` |
| Discard a partial Data Record after link loss | FTMS §4.18 | `src/protocol/ftms/dataRecord.ts`, `src/adapters/ftms-indoor-bike/adapter.ts` |
| Receive Fitness Machine Feature indications (features may change) | FTMS v1.0.1 §4.3.1, ICS 4/44 | `src/adapters/ftms-indoor-bike/adapter.ts` |

## What the test suite and ICS tell us about the bike

The test suite only exercises servers, but it states precisely what a qualified bike sends. The
checks in `src/protocol/ftms/conformance.ts` apply those expectations to the live data stream and are shown
under **Diagnostics → FTMS conformance** and included in every packet capture.

| Check | Source | Expectation |
| --- | --- | --- |
| Complete Data Records | TS FTMS/SR/CN/BV-55-C | Every Data Record ends with a notification whose More Data bit is 0, and that notification carries Instantaneous Speed. |
| Flags RFU bits are zero | TS CN/BV-55-C … BV-65-C | Indoor Bike Data flag bits 13–15 are always 0. |
| Field ↔ feature bit | TS CN/BV-56-C … BV-64-C (Table 4.11), ICS Table 10 | A field may only be present if its Fitness Machine Feature bit is set (e.g. Power needs bit 14 "Power Measurement Supported"). |
| Elapsed Time | TS CN/BV-65-C, FTMS §4.18 | Elapsed Time needs feature bit 12, increases, and continues after the link is re-established (the training session survives a link loss). |
| Fitness Machine Feature present | ICS Table 4 items 1–2 (M) | The Feature characteristic is mandatory. |
| Feature RFU bits are zero | TS FTMS/SR/CR/BV-01-C | Bits 17–31 of both feature fields are 0. |
| Supported … Range | ICS Table 4 C.1–C.5 | Each supported target setting requires its Supported … Range characteristic. |
| Fitness Machine Status | ICS Table 4 C.6 | A server that exposes the Control Point must also expose Fitness Machine Status. |

These are observations, not a qualification: OpenAirBike cannot drive the bike the way the SIG
lower tester does. A `fail` means "the bike sent something the test suite would reject", which is
worth knowing when its telemetry looks odd. A `warn` marks behaviour that is allowed but affects
OpenAirBike, e.g. a feature bit set but the field never sent, or a console that restarts its session
after a link loss (the recorder then relies on its counter-reset handling).

Consequences for the app:

* Metrics shown on the live screen follow the Fitness Machine Feature bits where that helps (the
  heart-rate slot appears when "Heart Rate Measurement Supported" is set, even before the first
  reading).
* Because the bike's session (Elapsed Time, Total Distance, Total Energy) is expected to survive a
  link loss, the recorder keeps counting deltas across reconnects instead of re-basing.

## Not used yet: Fitness Machine Control Point

Per ICS Table 12, a server with a Control Point must support Request Control, Reset, Start or
Resume, Stop, Pause and Procedure Complete. OpenAirBike v0.1 is read-only and does not write to the
Control Point. Start/stop sync with the console is a *Later* item ([product/mvp.md](product/mvp.md))
**if** the Echo Bike V3 exposes and accepts it (R6/R10); the hardware-proof tool's GATT list shows
whether it exists. An air bike has no controllable resistance, so target settings
(power, resistance, simulation) are not expected.
