# Architecture decision records

Only decisions that were actually taken and are implemented. Designs that are still proposals
(e.g. [../device-telemetry-model.md](../device-telemetry-model.md),
[../workout-engine.md](../workout-engine.md)) get an ADR once decided. The earlier short records
D1–D4 in [../../decisions.md](../../decisions.md) remain valid; the ADRs reference them.

| ADR | Title | Status |
| --- | --- | --- |
| [0001](0001-typescript.md) | TypeScript as the only language | Accepted |
| [0002](0002-modular-monolith.md) | Modular monolith with directory modules | Accepted |
| [0003](0003-local-first.md) | Local-first browser app, no accounts, no backend | Accepted |
| [0004](0004-ftms-boundary.md) | FTMS is a pure protocol module behind the device layer | Accepted |
| [0005](0005-canonical-telemetry.md) | Canonical telemetry with separate device counters | Accepted |
| [0006](0006-device-abstraction.md) | Device abstraction: generic FTMS adapter plus data-only profiles | Accepted |
| [0007](0007-sqlite-in-browser.md) | SQLite WASM in OPFS behind repository interfaces | Accepted |
| [0008](0008-telemetry-stream-vs-domain-events.md) | Telemetry stream and domain events are separate channels | Accepted |

Format: Title · Status · Context · Decision · Alternatives · Consequences; about 500 words max.
New ADRs take the next number; a changed decision gets a new ADR that supersedes the old one.
