# Rogue Echo Bike V3 — connection guide

Status (2026-09-27): **initial target, not yet tested on real hardware.** Everything below is either
**Specified**, **Inferred** or still to be **Observed** — see the legend. Update this page after every
hardware test ([test protocol](../testing/rogue-echo-bike-v3-test.md)).

## Evidence legend

| Category | Meaning | Sources |
| --- | --- | --- |
| **Specified** | documented by a standard or the manufacturer | Bluetooth SIG FTMS / FTMP v1.0.1 ([../ftms-notes.md](../ftms-notes.md)); no Rogue documentation is in this repository |
| **Observed** | seen by us on a real Echo Bike V3 | none yet |
| **Inferred** | derived from reference projects or behaviour, not confirmed by us | [../research/echo-bike-v3.md](../research/echo-bike-v3.md), [../research/ftms-ble-analysis.md](../research/ftms-ble-analysis.md) |

The categories are never mixed: an Inferred fact becomes Observed only after our own test.

## Verified hardware matrix

| Device | Discovery | Connect | Telemetry | Control | Status |
| --- | --- | --- | --- | --- | --- |
| Rogue Echo Bike V3 | Testing | Testing | Testing | Not verified | Initial target |

## Step 1 — Prepare the bike

* Switch the console on / wake it by pedalling or pressing a button, and keep it awake.
* Put the bike within a few metres of the computer running OpenAirBike.
* Close other apps that may be connected to the bike (Rogue app, Zwift, a phone).
  *Inferred:* the console accepts only one connection at a time.

## Step 2 — Bluetooth

* OpenAirBike connects **itself**, through the browser's Bluetooth chooser (Web Bluetooth). It does
  **not** need the bike to be paired in the operating system's Bluetooth settings, like headphones.
* Whether an existing OS pairing interferes is **not known** — our sources do not say. If the bike is
  paired in the OS and does not show up, removing that pairing is worth a try (and worth reporting).
* Pairing mode on the console: hold the Bluetooth/Connect button about 2–3 s until the icon flashes
  (and beeps). *Inferred* — both Rogue reference projects describe it (one says ~2 s, one ~3 s).

## Step 3 — Start OpenAirBike

```bash
npm install          # once
npm run diagnose     # developer tool, recommended for the first test
```

This opens `http://localhost:5173/tools/hardware-proof/` in Chrome/Edge. (`npm run dev` starts the
app itself; use it once the connection works.)

## Step 4 — Discover the bike

Click **Scan: FTMS service**. The browser's chooser lists nearby devices that advertise FTMS.

* Bike listed → it advertises the FTMS service (this answers an open question — please report it).
* Not listed → close the chooser and try **Scan: Echo / Rogue names**, then **Scan: all devices**.

The advertised name is **unknown** (*Inferred:* contains "Echo" or "Rogue").

## Step 5 — Connect

Select the bike and click *Pair*/*Connect* in the chooser. OpenAirBike then, automatically:

1. opens the Bluetooth LE connection,
2. discovers the Fitness Machine Service and the other accessible services,
3. reads the **Fitness Machine Feature** (which metrics the bike declares),
4. subscribes to **Indoor Bike Data** (and Training Status / Fitness Machine Status if present).

Illustrative output (placeholders, **not** real Echo output):

```text
Connection: connected (<advertised name>)
Chooser mode: ftms

Advertised name: <advertised name>
Device Information: <manufacturer / model / firmware, if the bike provides them>
Profile: Rogue Echo Bike V3 (rogue-echo-bike-v3)
Rogue Echo Bike V3 recognised: yes
```

"Recognised: no" only means the name did not match the assumed prefixes; the connection still works
with the generic FTMS profile — please report the name.

## Step 6 — First Ride

Pedal. The *Live telemetry* panel updates with every complete Indoor Bike Data record
(*Inferred:* about once per second, only while the flywheel moves).

Illustrative layout (placeholders, **not** real Echo values):

```text
Last record <time>

Power                        <W>
Cadence                      <rpm>
Speed                        <km/h>
Heart rate                   –  (not declared by the bike)
Distance (bike counter)      <m>
Energy (bike counter)        <kcal>
Elapsed time (bike counter)  <s>
```

Only values the bike actually sends are shown; nothing is computed. Which lines the Echo fills is
**not yet observed** (*Inferred:* power and cadence; speed is Specified as mandatory).

## Step 7 — Disconnect

Click **Disconnect** (tool) or **Trennen** / *Disconnect* (app). Closing or reloading the tool page
also releases the bike. Afterwards the console should accept a new connection.

## Troubleshooting

### Bike is not found

* Console awake? It may go to sleep — pedal or press a button.
* Bluetooth on at the computer? Browser allowed to use it (OS privacy settings on macOS/Windows)?
* Close enough (a few metres, no walls)?
* Connected to another app or device (Rogue app, Zwift, phone)? Disconnect it or switch its Bluetooth off.
* Pairing mode: hold the console's Bluetooth/Connect button 2–3 s (Inferred).
* Try the chooser modes in order: FTMS service → Echo / Rogue names → all devices.
* Paired in the OS Bluetooth settings? Try removing that pairing (effect unknown, please report).

### Bike is found, but connecting fails

Turn on **Debug details**, retry once, then **Download capture** and note the exact error line in the
packet log. The capture records the connection states and every setup step.

### Connected, but no telemetry

* Are you pedalling? (*Inferred:* the console only sends while the flywheel moves.)
* Debug details → GATT list: is `Indoor Bike Data (0x2AD2)` present with `notify`?
* "FTMS features" → *Subscribed*: does it include Indoor Bike Data?
* Packet log: do Indoor Bike Data lines appear? If they appear but *Live telemetry* stays empty,
  look for `More Data (fragment)` or `TRUNCATED` and send the capture.
* Any *Problems* listed under "Device and profile"?

### Connection drops

OpenAirBike reconnects automatically. We do not yet know why a drop happens. Keep **Debug details**
on, note the time, and send the capture: it contains every connection state
(`connected`, `reconnecting`, `disconnected`) and the reconnect attempts.

### Power or cadence is missing

Do not work around it — collect evidence: the *FTMS features* line (does the bike declare Power
Measurement / Cadence?), a few raw Indoor Bike Data packets (hex, with **Raw packets** on) and the
FTMS conformance section. OpenAirBike never estimates or simulates missing values.

## Diagnose mode

`npm run diagnose`, **Debug details** on. It shows and, with **Download capture**, saves:

| Item | Shown | In the capture |
| --- | --- | --- |
| Device (advertised name), chooser mode, profile | ✅ | ✅ |
| Services and characteristics (full UUIDs, properties) | ✅ | ✅ |
| FTMS feature flags (raw bits + names) | ✅ | ✅ (raw read) |
| Raw notifications (hex) | ✅ if *Raw packets* is on | ✅ if *Raw packets* is on |
| Decoded FTMS data per packet | ✅ | – (re-decodable from the raw packets) |
| Canonical telemetry | ✅ live panel | – |
| Connection state and setup steps | ✅ | ✅ (`events`) |
| FTMS conformance checks | ✅ | ✅ (probe report) |

Not collected: device id, serial number, location, account data. The capture includes the browser's
user-agent string (browser and OS version) to help reproduce problems.

## Developer notes

```text
Rogue Echo Bike V3
        │ Bluetooth Low Energy (Web Bluetooth)
        ▼
      FTMS                    src/transport  (GATT only)
        ▼
   FTMS decoder               src/protocol/ftms  (pure: flags, fields, More Data, conformance)
        ▼
Canonical telemetry           src/adapters/ftms-indoor-bike/canonical.ts, src/telemetry
        ▼
   OpenAirBike                tools/hardware-proof (diagnose) · src/app + src/ui (app)
```

UUIDs used (all **Specified** by the Bluetooth SIG; full form `0000xxxx-0000-1000-8000-00805f9b34fb`).
No Rogue-specific UUIDs are known or assumed.

| UUID | Name | Use |
| --- | --- | --- |
| 0x1826 | Fitness Machine Service | required |
| 0x2ACC | Fitness Machine Feature | read |
| 0x2AD2 | Indoor Bike Data | notify — live telemetry |
| 0x2AD3 | Training Status | notify, if present |
| 0x2ADA | Fitness Machine Status | indicate, if present |
| 0x2AD9 | Fitness Machine Control Point | listed only, **never written** |
| 0x180A | Device Information | read manufacturer, model, hardware/firmware/software revision (not the serial number) |
| 0x180D, 0x180F, 0x1818, 0x1816 | Heart Rate, Battery, Cycling Power, Cycling Speed and Cadence | listed if present, not used |

What is Specified, Inferred and still to be Observed for the Echo, field by field:
[../testing/first-ride.md](../testing/first-ride.md#expected-ftms-functions). Browser limits: only the
services above are visible (a vendor service would be hidden), and the chooser exposes no
advertisement data.
