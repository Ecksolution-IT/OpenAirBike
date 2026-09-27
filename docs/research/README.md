# Research

Findings that should not have to be investigated twice. Check here (and in `docs/`) before
examining a reference project or specification again.

| File | Content |
| --- | --- |
| [reference-inventory.md](reference-inventory.md) | High-level map per reference project: purpose, stack, license, structure, key files, what to investigate later |
| [ftms-ble-analysis.md](ftms-ble-analysis.md) | BLE/FTMS implementations compared: cleanest approach, Rogue specifics, core vs. Echo adapter, reusable MIT parts, open questions R8–R13 |
| [workout-engine-analysis.md](workout-engine-analysis.md) | Workout systems compared (ewoc concepts, Echo tracker): feature matrix, good/problematic ideas, requirements WE-1–WE-14, first engine scope, open questions W1–W5 |
| [recording-storage-analysis.md](recording-storage-analysis.md) | Recording, persistence, SQLite, session models, FIT/Garmin, simulators, fixtures, replay: what to adopt/avoid, `ReplayFitnessDevice` requirements, open decisions S1–S4 |
| [reference-projects.md](reference-projects.md) | The five reference projects: purpose, stack, license, what is relevant |
| [echo-bike-v3.md](echo-bike-v3.md) | What is known about the Rogue Echo Bike V3, separated into verified / reported / assumed |
| [architecture-gap.md](architecture-gap.md) | Target layering vs. the v0.1 code (historical), the SQLite decision and schema sketch |
| [spike-sqlite-opfs.md](spike-sqlite-opfs.md) | Spike 1: SQLite WASM in OPFS — results and consequences |
| [../decisions.md](../decisions.md) | Architecture decisions D1–D4 |
| [../plan-first-technical-goal.md](../plan-first-technical-goal.md) | Step plan for the first technical goal (steps 1–10 done) |
| [../ftms-notes.md](../ftms-notes.md) | FTMS / FTMP / FTMS.TS / FTMS.ICS requirements and where the code implements them |

## Working rules

* Reference projects live in `reference/` (git-ignored). They are knowledge sources, not a codebase.
* No code is copied from a reference project unless its license and the adoption are explicitly
  cleared. GPL code is never adopted. Ideas and published facts (protocol behaviour, UUIDs,
  pairing steps) may be used; wording and code may not.
* Every statement is marked as **verified** (checked against a primary source or hardware),
  **reported** (a reference project says so) or **assumption**.

## Status of this research (2026-09-26)

Examined: README, LICENSE, manifests and directory structure of all five projects; targeted
searches in the Echo-specific parsers, the bridge's storage schema and the `ftms` codec.
Not examined: full source trees, UI code, FIT export, workout editors.

2026-09-27: workout systems (ewoc spec/architecture/runner types, Echo tracker templates and plan
runner, bridge simulator scenarios) — see workout-engine-analysis.md. Recording/storage/FIT/
simulators (bridge `src/data`, `src/fit`, simulators, tests; ewoc session/export/mock; tracker
save path) — see recording-storage-analysis.md.
