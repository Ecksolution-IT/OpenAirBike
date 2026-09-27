# ADR 0006 — Device abstraction: generic FTMS adapter plus data-only profiles

## Status

Accepted (2026-09-26, working rule 13; assumptions A1 and A3 in
[../../research/architecture-gap.md](../../research/architecture-gap.md)). Implemented in plan
step 3 (`src/adapters/`, `src/transport/simulated/`).

## Context

The Rogue Echo Bike V3 is the first target but "must not become the centre of the domain
architecture". The research found nothing non-standard in how the references decode the Echo; its
specifics are discovery (names), setup timing and which optional parts it implements
([../../research/ftms-ble-analysis.md](../../research/ftms-ble-analysis.md) §2). ewoc models
device variety with fingerprints and quirks; the bridge infers device type from the name.

## Decision

* A **device adapter contract** sits between transport/protocol and the application; it emits
  canonical telemetry, device events (console start/pause/stop/reset), device info and diagnostics.
* One **generic FTMS indoor-bike adapter** implements it for any FTMS bike.
* Device specifics are **profiles**: data plus small overrides (name matchers, chooser prefixes,
  expected capabilities, later quirks). The Echo is `profiles/echoBikeV3.ts`; there is also a
  generic profile. No protocol parsing in profiles unless a capture proves a real deviation.
* The domain knows a device only by id, name and an opaque `profileId`.
* The **simulator is a transport** that emits real FTMS bytes, so adapter, parser and everything
  above run unchanged in tests and demo mode.

## Alternatives

| Option | Why not |
| --- | --- |
| Echo-specific adapter / parser | nothing Echo-specific to parse; would tie the core to one bike |
| Plugin system for devices | no second device family yet; profiles as data suffice (A1) |
| Simulator emitting parsed values (bridge, ewoc) | bypasses the parser; tests less of the real path |

## Consequences

* Rogue-specific code exists in exactly one file; other FTMS air bikes need a profile, not code.
* Profile contents (names, capabilities, quirks) must be confirmed from a real capture (R1–R13).
* The contract will be refined as `FitnessDevice` / `TelemetrySource` with simulated and replay
  variants ([../device-telemetry-model.md](../device-telemetry-model.md)) — a follow-up, not part
  of this decision.
