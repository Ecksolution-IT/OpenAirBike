# Decisions

Short architecture decision records. Newest last. Each entry states what was decided, why, and
what follows from it. Assumptions are marked as such.

## D1 — Persistence: SQLite in the browser, portable to a server database later (2026-09-26)

**Decision.** During development nothing is installed beyond the project's npm packages. Workouts
are stored in SQLite running inside the browser (official SQLite WebAssembly build, persisted in
the Origin Private File System). The design must allow switching to a real database server
(e.g. PostgreSQL) later.

**Consequences.**

* Persistence is reached only through repository interfaces defined by the domain
  (`SessionRepository`, `DeviceRepository`, …). SQLite is one implementation; a later
  server-backed implementation (HTTP API in front of a SQL server) replaces it without changes in
  domain, recording or UI.
* SQL stays portable: plain SQL migrations in versioned files, no SQLite-only features in the
  schema (no `WITHOUT ROWID`, no JSON1 functions in queries, no reliance on dynamic typing),
  UUID text primary keys, timestamps as UTC ISO 8601 text, explicit column types that exist in
  PostgreSQL too.
* All database access runs in a dedicated worker; the UI thread never blocks on storage.
* Package `@sqlite.org/sqlite-wasm` (Apache-2.0, no dependencies; SQLite itself is public
  domain) is an infrastructure dependency, isolated behind the repository interfaces.
* Verified by spike 1 ([research/spike-sqlite-opfs.md](research/spike-sqlite-opfs.md)): the
  `opfs-sahpool` VFS works without cross-origin isolation headers, in dev and production builds.
  Only one tab can own the database at a time; the app must enforce and explain that.
* A browser page cannot talk to a SQL server directly; the server option therefore implies a
  small backend later. Not needed now.
* Implemented in plan steps 6–7: contracts in `src/domain/repositories.ts`, SQLite in
  `src/persistence/sqlite/` (worker + client), in-memory reference in `src/persistence/memory/`.
  Both implementations pass the same contract tests (`test/repositoryContract.ts`); a test guards
  the migrations against SQLite-only syntax. Summary values live as columns of `session` rather
  than in a separate table (one row per session, simpler queries). Measured in Chromium: one
  batch append ≈ 16 ms (one OPFS transaction), reading a 30-minute session ≈ 25 ms.

## D2 — Units and formats: metric, as used in Germany/Europe (2026-09-26)

**Decision.** Canonical telemetry uses the metric units a German/European rider expects, so
values need no conversion between recording and display:

| Quantity | Canonical unit | Display |
| --- | --- | --- |
| Speed | km/h | `24,6 km/h` |
| Distance | m | `8,40 km` (below 1 km: `850 m`) |
| Power | W | `428 W` |
| Energy | kcal | `241 kcal` |
| Cadence | 1/min | `67 U/min` (UI language German) or `67 rpm` (English) |
| Heart rate | 1/min | `148 bpm` / `148 S/min` |
| Duration | s | `24:18`, `1:02:05` |
| Timestamp | UTC ISO 8601 in storage | `26.09.2026 07:13` (24-hour clock) |

**Consequences.** Number and date formatting goes through `Intl` with the user's locale,
defaulting to `de-DE` (decimal comma). Storage stays locale-independent. Imperial units are not
supported.

## D3 — Reference projects: adopt what is allowed, depend on nothing (2026-09-26)

**Decision.** OpenAirBike does not take runtime dependencies on reference projects. Content may
be adopted where the license clearly allows it, with attribution.

**Consequences.**

* `@deancochran/ftms` (MIT, LICENSE file present): not added as a dependency. Its conformance
  vectors (`conformance/v1/vectors.json`) may be copied into `test/fixtures/third-party/` together
  with its MIT license text, to cross-check our own parser.
* `Rogue_Echo_Bike_v3` and `rogue_garmin_bridge`: "MIT" only stated in the README, no LICENSE
  file and no copyright line. Treated as unclarified: facts (pairing steps, UUIDs) yes, code no.
* `ftms-toolkit` (no license) and `ewoc` (GPL-3.0): concepts only, never code or text.
* Every adopted file keeps its license notice; adoption is listed in `THIRD_PARTY_NOTICES.md`.

## D4 — Clean start, no migration of v0.1 data (2026-09-26)

**Decision.** The IndexedDB store of v0.1 is dropped without migration (the project is marked
experimental).

**Consequences.** The IndexedDB code and its crash-recovery draft are replaced by the SQLite
implementation. Crash recovery is kept as a feature, implemented by writing samples to SQLite
while recording.

Done in plan step 8: `SessionRecording` writes samples and events every 5 s; `recoverSession`
finishes interrupted sessions from the saved samples (status `recovered`).
