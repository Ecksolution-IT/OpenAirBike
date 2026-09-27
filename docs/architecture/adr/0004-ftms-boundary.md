# ADR 0004 — FTMS is a pure protocol module behind the device layer

## Status

Accepted (2026-09-26). Implemented in plan steps 2–5 (`src/protocol/ftms/`).

## Context

The Echo Bike V3 speaks the Bluetooth Fitness Machine Service (FTMS). FTMS data is bit-flag
driven, may be split across notifications (More Data, FTMS §4.19), has "data not available"
sentinels and a field (Resistance Level) whose size differs between spec versions (R1). The
reference parsers mix parsing with BLE I/O and ignore More Data; the cleanest reference, the MIT
library `ftms`, is pure codecs with typed diagnostics
([../../research/ftms-ble-analysis.md](../../research/ftms-ble-analysis.md)). OpenAirBike wants to
support other FTMS air bikes later without touching everything above.

## Decision

* `protocol/ftms/` contains **pure functions only**: codecs for Indoor Bike Data, Feature, Training
  Status, Machine Status; Data Record reassembly; the conformance monitor (FTMS.TS / FTMS.ICS). No
  I/O, no timers, no device names.
* The protocol is our **own implementation**; `ftms` is not a dependency. Its MIT vectors are
  test fixtures (D3); documented differences (R1) are explicit.
* FTMS data **never crosses the device layer**. Everything above sees canonical telemetry
  (ADR 0005) and device events. The UI never receives bytes or FTMS structures.
* Transport knows GATT only; the FTMS setup sequence (service check, Feature read, subscriptions)
  belongs to the FTMS indoor-bike adapter (ADR 0006).

## Alternatives

| Option | Why not |
| --- | --- |
| Depend on `@deancochran/ftms` | no reassembly/transport anyway; D3: depend on nothing; vectors give the cross-check |
| Parse inside the transport (v0.1, references) | untestable without BLE; device knowledge leaks |
| Pass FTMS records up to recording/UI | every layer would learn FTMS; a second protocol would touch all of them |

## Consequences

* Parser and conformance logic are unit-tested from byte fixtures and third-party vectors.
* Malformed packets become diagnostics, not exceptions.
* A new protocol (another vendor, a heart-rate strap) is a new protocol module plus adapter; nothing
  above the device layer changes.
* Control Point writes (R6/R10) will also live here as codecs; control policy stays outside.
* Diagnostics formatting currently leaks into `app` (hex and UUID names) — to be moved behind the
  device layer ([../architecture.md](../architecture.md)).
