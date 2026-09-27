# ADR 0002 — Modular monolith with directory modules

## Status

Accepted (2026-09-26, project owner's working rules 12 and 14). Implemented in plan steps 2–10
([../../plan-first-technical-goal.md](../../plan-first-technical-goal.md)).

## Context

The project owner asked for a modular monolith and an explicit separation of transport,
protocol, device adapter, canonical telemetry, domain, workout engine, recording/analytics,
persistence, application and UI. The product is a single-user browser app; there is one deploy
unit and no team boundary that would justify separately versioned packages or services.
The v0.1 code mixed GATT handling, FTMS discovery and Echo-specific names in one file
([../../research/architecture-gap.md](../../research/architecture-gap.md)).

## Decision

OpenAirBike is **one application, one package, one build**. Modules are **directories under
`src/`** with one-way dependencies:

* lower modules (`transport`, `protocol/ftms`, `telemetry`, `domain`) import nothing above them;
* adapters, recording and persistence depend only on lower modules;
* only `app` wires concrete implementations together; `ui` talks to `app`.

No microservices, no event-bus framework, no dependency-injection container, no plugin system.

## Alternatives

| Option | Why not |
| --- | --- |
| Microservices / backend services | nothing to scale or isolate; contradicts local-first (ADR 0003) |
| npm workspaces, one package per module | versioning and build overhead without a second consumer |
| Unstructured single folder (v0.1) | device knowledge leaked into transport; hard to test and extend |

## Consequences

* Boundaries are enforced by review and, as a follow-up, by an import-rule test (no extra
  tooling) — see the dependency table in [../architecture.md](../architecture.md).
* Module moves are cheap; the proposed renames (`adapters/` → `device/`, `util/` → `shared/`, …)
  are follow-ups, not part of this decision.
* Workspaces are introduced only when a second runtime needs the core without the DOM, and then
  as exactly two packages (`core`, `web`).
* Known violations today: `ui` imports `persistence/export`, `app` imports `protocol` helpers for
  diagnostics formatting.
