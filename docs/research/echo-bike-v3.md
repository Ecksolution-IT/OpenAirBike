# Rogue Echo Bike V3 — what we know

Legend: **verified** = checked against hardware or a primary source · **reported** = a reference
project states it · **assumption** = our inference, to be checked.

No OpenAirBike packet capture from a real Echo Bike V3 exists yet. Everything below that is not
marked verified must be confirmed with one (Diagnostics → Download packet capture).

## Connection

| Fact | Status | Source |
| --- | --- | --- |
| Exposes the Fitness Machine Service (0x1826) with Indoor Bike Data (0x2AD2) | reported | Echo tracker, garmin bridge |
| Pairing mode: hold the console's Bluetooth/Connect button ~2–3 s (icon flashes, beeps) | reported | both Rogue projects |
| Sends data only while the flywheel moves | reported | Echo tracker |
| Advertises the FTMS UUID in its advertising data | assumption | both projects scan by UUID first but keep a name fallback |
| Advertised name contains "Echo" or "Rogue" | assumption | name keywords in both projects are guesses |
| Only one central can be connected at a time (Rogue app, Zwift, OpenAirBike) | assumption | typical for FTMS consoles |
| Exposes Fitness Machine Control Point (0x2AD9) | unknown | tracker writes to it but says firmware may ignore it |
| Exposes Heart Rate Measurement (0x2A37) or relays HR in Indoor Bike Data | unknown | tracker subscribes optionally; not demonstrated |

## Telemetry

| Fact | Status |
| --- | --- |
| Fields sent: speed, cadence, power, distance, energy, elapsed time | assumption (tracker UI shows these metrics, but not which come from the bike vs. are computed) |
| Resistance Level is not sent (air bike, no controllable resistance) | assumption |
| Notification rate ≈ 1 Hz (FTMS recommendation) | assumption |
| Data Records fit in one notification (no More Data) | assumption; our assembler handles both |
| Console session counters (distance, energy, elapsed) continue across a BLE link loss | assumption (FTMS.TS CN/BV-65-C expects it); recorder already uses deltas |

## Open questions

| # | Question | Why it matters | How to answer |
| --- | --- | --- | --- |
| R1 | Is Resistance Level encoded as `sint16` (legacy XML) or `uint8` (current GSS)? | A wrong size shifts every following field. Only matters if the Echo sets flag bit 5. | Capture; if bit 5 is never set, irrelevant for the Echo but still relevant for other bikes. |
| R2 | Exact advertised name and whether the FTMS UUID is in the advertisement | Device filter in the chooser/scan | Capture / scan log |
| R3 | Which Fitness Machine Feature bits are set | Which metrics to show; conformance panel | Capture |
| R4 | Does the console reset its counters when it goes idle or when the rider stops? | Counter-delta logic, session continuity | Ride, pause > 1 min, ride again, capture |
| R5 | Heart rate: none, via FTMS field, or via a separate HR service? | Live screen layout, optional HR sensor support | Capture with and without a paired strap |
| R6 | Control Point present? If yes, does it accept Request Control / Start / Stop? | Candidate for v0.2 (sync console session with workouts) | Capture; later a guarded write test |
| R7 | Firmware / model strings in Device Information Service | Device profile identification | Capture |
