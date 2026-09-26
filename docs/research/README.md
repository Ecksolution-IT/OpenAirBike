# Research

Findings that should not have to be investigated twice. Check here (and in `docs/`) before
examining a reference project or specification again.

| File | Content |
| --- | --- |
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
