# First Ride — test on a real Rogue Echo Bike V3

Milestone v0.0.1 "First Ride": a real Echo Bike V3 connects over BLE/FTMS and delivers live
telemetry. Status (2026-09-27): **implemented and verified without hardware; not yet run on the
bike.** Tool details: [../product/milestone-0-hardware-proof.md](../product/milestone-0-hardware-proof.md).

## Implementation

```text
BLE transport (src/transport)  →  FTMS decoder (src/protocol/ftms)  →  canonical telemetry
(src/adapters/ftms-indoor-bike/canonical.ts)  →  output (tools/hardware-proof, "diagnose")
```

The live view shows canonical telemetry only; FTMS fields (flags, averages, resistance, MET …)
appear only in the debug details. Nothing is estimated or computed: a metric the bike does not send
is shown as "–".

**FTMS implementation — decision C (own minimal implementation), unchanged since D3 / ADR 0004.**
A (depend on the MIT `ftms` library) was rejected: it has no transport or More Data reassembly, reads
Resistance Level as `uint8` where we keep `sint16` until a capture decides (R1), and our parser
already exists and agrees with its test vectors. B is used in the allowed form only: its
conformance vectors are test fixtures with the MIT notice. No `ewoc` (GPL) code is used.

Tests without a bike: `test/firstRide.test.ts` (bytes → decoder → canonical, feature bytes →
capabilities), `test/indoorBikeData.test.ts`, `test/ftms.test.ts`, `test/vectors.test.ts`,
`test/hardwareProof.test.ts`. The byte fixtures are synthetic, built from the FTMS specification.

## Step by step

Preparation: a computer with Bluetooth, Chrome or Edge; no other app (Rogue app, Zwift, phone)
connected to the bike — *assumption:* the console accepts only one connection.

```text
npm install
npm run diagnose        # opens http://localhost:5173/tools/hardware-proof/
```

| # | Do | Expect (Definition of Done) |
| --- | --- | --- |
| 1 | Wake the console; hold its Bluetooth/Connect button 2–3 s until the icon flashes (*reported*) | console is in pairing mode |
| 2 | Click **Scan: FTMS service** | the bike appears in the chooser. If not: **Scan: Echo / Rogue names**, then **Scan: all devices**; note which mode worked |
| 3 | Select the bike | Status `connected`; "Device and profile" shows the name, Device Information and `Rogue Echo Bike V3 recognised: yes` |
| 4 | Keep **Debug details** on; look at the GATT list | Fitness Machine service `…1826…` is listed; no "Problems" |
| 5 | Look at "FTMS features" | machine feature bits and names are shown |
| 6 | Look at the GATT list and "Subscribed" | Indoor Bike Data (and, if present, Training Status, Fitness Machine Status, Control Point) are listed; Indoor Bike Data is subscribed |
| 7 | Pedal | packet log fills with Indoor Bike Data lines (raw hex + decoded fields) |
| 8 | Look at "Live telemetry" | **Power and Cadence** change with effort; Speed, Distance, Energy, Elapsed time, Heart rate only if the bike sends them |
| 9 | Stop pedalling ~30 s, pedal again | note whether packets stop and whether counters continue |
| 10 | Click **Download capture**, then **Disconnect** | Status `disconnected`; the console no longer shows a connection |

Please report: chooser mode that found the bike, advertised name, Device Information, feature
line, which live metrics were non-empty, the record rate from "Status", any "Problems" or failing
conformance lines, and the capture file (it contains no device id or serial number).

Optional, for the open questions (one capture each): ride 60 s with a sprint (R9, R11); stop 90 s
(R4, W5); walk out of range mid-ride and come back (R12); ride with a heart-rate strap paired to
the console (R5); compare last distance/energy with the console display (W1, W2).

## Expected FTMS functions

Status: **spec** = mandatory in FTMS v1.0.1 for an indoor bike · **reported** = a reference project
says so · **assumption** = our inference. Everything here must be confirmed on the bike.

| Function | Expected | Status |
| --- | --- | --- |
| Fitness Machine Service 0x1826 | present | reported (Echo tracker, garmin bridge) |
| FTMS UUID in the advertisement | yes | assumption — both references keep a name fallback |
| Advertised name contains "Echo" / "Rogue" | yes | assumption (R2) |
| Fitness Machine Feature 0x2ACC | readable, 8 bytes | spec; not demonstrated for the Echo by any reference |
| Indoor Bike Data 0x2AD2 notifications | ~1 per second | reported (data); rate is an assumption (R11) |
| Instantaneous Speed | in every complete record | spec |
| Cadence, Power | sent | reported (tracker shows them; whether they come from the bike is unconfirmed) |
| Total Distance, Expended Energy, Elapsed Time | sent | assumption |
| Heart Rate | unknown; `0` = no sensor | reported (bridge treats 0 as no sensor) (R5) |
| Resistance Level | not sent (air bike) | assumption; field size disputed (R1) |
| More Data (split records) | not used | assumption; handled if used |
| Data only while pedalling | yes | reported (tracker README) |
| Training Status 0x2AD3, Fitness Machine Status 0x2ADA | unknown | not demonstrated (R4) |
| Control Point 0x2AD9 | unknown | tracker writes to it blindly; **not used here**, presence only (R6) |
| Device Information (manufacturer, model, firmware) | unknown | not demonstrated (R7) |

## Known uncertainties

* Web Bluetooth shows only the services the page asks for (FTMS, DIS, HR, Battery, Cycling Power,
  CSC); a Rogue vendor service would stay invisible. The chooser shows no advertisement data or RSSI.
* Resistance Level is read as `sint16`; if the Echo sends a 1-byte field, the packet log shows
  `TRUNCATED` and the "payload length" conformance line fails (R1).
* Energy on the console may use a different formula than any value OpenAirBike computes later (W1);
  this milestone only shows the bike's own value.
* Timestamps are browser receive times (wall clock).
* Chromium only; iOS has no Web Bluetooth.
