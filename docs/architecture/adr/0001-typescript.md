# ADR 0001 — TypeScript as the only language

## Status

Accepted (2026-09-26). Implemented: all of `src/` and `test/`.

## Context

OpenAirBike must talk to the Rogue Echo Bike V3 over Bluetooth LE, show live data, record sessions
and run without installing anything (D1). The only Bluetooth API available to a web page is Web
Bluetooth, which is JavaScript-only. The reference projects use Python (bleak, PyQt6, Flask) or
Kotlin (Android); none of them runs in a browser
([../../research/reference-inventory.md](../../research/reference-inventory.md)).
The protocol layer handles bit flags, variable-length records and units; mistakes there are silent
and costly, so compile-time types are valuable.

## Decision

All production and test code is written in **TypeScript** (strict mode), compiled with `tsc`
(type check only) and bundled with Vite. Tests run with Vitest in Node. There is no second
language in the codebase.

## Alternatives

| Option | Why not |
| --- | --- |
| Plain JavaScript | no types for protocol records, repository contracts and canonical telemetry |
| Python (bleak) desktop app, like the Echo tracker / bridge | native BLE per OS, installation, no browser |
| Kotlin / Android, like ewoc | one platform only; GPL reference could not be reused anyway |
| Rust or another language compiled to WASM | Web Bluetooth still needs JS glue; adds a toolchain for no gain at this size |

## Consequences

* One language from bytes to UI; types are the contracts between modules (transport, protocol,
  telemetry, domain, repositories).
* Protocol codecs, recording and domain logic run in Node, so they are unit-tested without a
  browser; only Web Bluetooth and OPFS need a browser.
* The only runtime dependency is `@sqlite.org/sqlite-wasm` (ADR 0007); dev dependencies are
  TypeScript, Vite, Vitest and Web Bluetooth types.
* A later second runtime (e.g. a Node capture/replay tool) can reuse the same modules
  ([../architecture.md](../architecture.md), "When to split into workspaces").
* The UI toolkit is not part of this decision; v0.1 uses plain DOM with a small helper.
