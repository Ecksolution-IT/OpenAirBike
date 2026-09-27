# Research

Findings about the reference projects, the Echo Bike and spikes, so they do not have to be
investigated twice. **Read these instead of re-opening `reference/`.** Overview of all docs:
[`../../CLAUDE.md`](../../CLAUDE.md).

| File | Content |
| --- | --- |
| [echo-bike-v3.md](echo-bike-v3.md) | Echo Bike V3: verified / reported / assumed; open questions R1–R7 (R8–R13 in ftms-ble-analysis) |
| [ftms-ble-analysis.md](ftms-ble-analysis.md) | BLE/FTMS in the references: cleanest approach, Rogue specifics, core vs. Echo profile, reusable MIT parts, R8–R13 |
| [workout-engine-analysis.md](workout-engine-analysis.md) | Workout systems (ewoc concepts, Echo tracker): good/problematic ideas, requirements WE-1–WE-14, W1–W5 |
| [recording-storage-analysis.md](recording-storage-analysis.md) | Recording, SQLite, session models, FIT/Garmin, simulators, capture/replay; decisions S1–S4 |
| [feature-matrix.md](feature-matrix.md) | OAB vs. the five references in 17 categories; differentiation candidates |
| [reference-inventory.md](reference-inventory.md) | Per project: purpose, stack, license, key files, what is left to investigate |
| [reference-projects.md](reference-projects.md) | Licence status and reuse rules per project (see D3) |
| [spike-sqlite-opfs.md](spike-sqlite-opfs.md) | Spike 1: SQLite WASM in OPFS — measured results |
| [architecture-gap.md](architecture-gap.md) | Historical: v0.1 code vs. target layering, SQLite options (decided: A) |

## Rules

* `reference/` is git-ignored and may be absent. It is a knowledge source, not a codebase.
* No code or text from reference projects without a cleared licence; GPL (`ewoc`) never; the
  Echo tracker, bridge and toolkit have no licence file → facts and ideas only. Only `ftms` (MIT)
  is reused, as test vectors.
* Mark statements as **verified** (primary source, code or hardware), **reported** (a reference
  project says so) or **assumption**. For **hardware capabilities** use **Specified** (standard or
  manufacturer), **Observed** (our own test on the device) and **Inferred** (reference projects or
  behaviour, not confirmed by us) — never mixed.

## Status (2026-09-27)

Research is complete for everything up to the workout engine: BLE/FTMS, workouts, recording/
storage/FIT/simulators and the feature comparison. Remaining "investigate later" items are listed
per project in reference-inventory.md (e.g. FIT export details, ewoc quirks) and are only needed
when those features are planned. **Nothing has been verified on a real Echo Bike V3 yet.**
