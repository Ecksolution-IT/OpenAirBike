# ADR 0007 — SQLite WASM in OPFS behind repository interfaces

## Status

Accepted (D1, 2026-09-26; verified by spike 1). Implemented in plan steps 6–7
(`src/persistence/sqlite/`, `src/domain/repositories.ts`).

## Context

Sessions must be stored locally and queryably, nothing may be installed during development, and a
real SQL server must remain possible later (D1). v0.1 used IndexedDB. The bridge's SQLite shows
what to avoid: JSON blob per sample, no migrations, no indexes, commit per sample
([../../research/recording-storage-analysis.md](../../research/recording-storage-analysis.md)).
Spike 1 showed that `opfs-sahpool` works without cross-origin isolation headers and that only one
tab can own the database ([../../research/spike-sqlite-opfs.md](../../research/spike-sqlite-opfs.md)).

## Decision

* Storage is **SQLite (official WASM build) in the Origin Private File System**, VFS
  `opfs-sahpool`, running in a **dedicated worker**.
* The domain defines **repository interfaces**; SQLite and an in-memory store implement them and
  pass the same contract tests.
* **Portable SQL**: versioned `.sql` migrations, types that also exist in PostgreSQL, typed columns
  per metric, composite keys, no SQLite-only features (guarded by a test).
* Samples are written in **batches** (every 5 s) while recording, which also provides crash
  recovery (D4).
* **Single-tab ownership** via a Web Lock; a second tab is told the database is in use.
* The user can export the database as a standard `.sqlite` file.

## Alternatives

| Option | Why not |
| --- | --- |
| IndexedDB (v0.1) | not relational; awkward for analytics; dropped (D4) |
| Local SQLite file via a local service | needs an installed process (ADR 0003, option B) |
| SQL server now | needs a backend; not allowed during development |
| JSON documents per sample | poor for analytics (bridge lesson) |

## Consequences

* Measured: batch append ≈ 16 ms, reading a 30-minute session ≈ 25 ms; WASM ≈ 0.4 MB gzip.
* One runtime dependency: `@sqlite.org/sqlite-wasm` (Apache-2.0), isolated behind repositories.
* Data is tied to the browser profile; export is the backup path.
* A server database later means a small backend implementing the same repositories; domain,
  recording and UI stay unchanged.
