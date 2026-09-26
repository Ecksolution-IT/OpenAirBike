# Spike 1: SQLite WASM in OPFS (2026-09-26)

Plan step 1 of [../plan-first-technical-goal.md](../plan-first-technical-goal.md). Question: can
decision D1 (SQLite in the browser, nothing extra installed) be built as intended?

The throw-away spike page (`spikes/sqlite-opfs/`) was removed in plan step 10, after the real
implementation (`src/persistence/sqlite/`) had replaced it; it remains in the git history.

## Setup

* `@sqlite.org/sqlite-wasm` 3.53.4 (npm; Apache-2.0 wrapper, SQLite public domain, no further
  dependencies).
* Dedicated module worker, VFS `opfs-sahpool` (OPFS sync access handles).
* **No** `Cross-Origin-Opener-Policy` / `Cross-Origin-Embedder-Policy` headers
  (`crossOriginIsolated === false`).
* Vite: `optimizeDeps.exclude` for the package and `worker.format: 'es'` (package README); no
  other configuration.
* Migration `001_init.sql` uses only types that also exist in PostgreSQL (`TEXT`, `INTEGER`,
  `REAL`, composite primary key, foreign key).
* Workload: one 30-minute session at 1 Hz = 1 800 samples in one transaction, then an aggregate
  query and a full database export.

## Results

Measured in headless Chromium (Playwright build 1194), dev server and production build.

| Check | Result |
| --- | --- |
| Works without COOP/COEP headers | **Yes** — dev server (`npm run dev`) and production build (`vite build` + static preview) |
| Data survives a page reload | **Yes** — 2nd load sees the 1st session (`sessionsBefore: 1`, 3 600 samples) |
| Init time (WASM load + SQLite init) | 47–72 ms |
| Insert 1 800 samples in one transaction | 110–143 ms |
| Aggregate query (avg/max power, distance) | 2–3 ms |
| Export as regular SQLite file | Yes — valid `SQLite format 3` header, 288 KiB for 1 session, 528 KiB for 2 |
| Bundle cost | `sqlite3.wasm` 869 kB (407 kB gzip) + ~217 kB JS in the worker |
| **Second tab while the first is open** | **Fails**: `NoModificationAllowedError` — sync access handles are exclusive. Works again once the first tab closes. |

## Conclusions

* **D1 holds.** In-browser SQLite with OPFS persistence works with nothing installed and no
  special server headers. The assumption in D1 about `opfs-sahpool` is now **verified** (for
  Chromium; real Chrome desktop/Android still to be confirmed with the real app).
* Recording at 1 Hz is far below the measured capacity; writing samples in small batches (e.g.
  every 5–10 s) while recording is cheap, which also gives crash safety (D4).
* The export produces a standard `.sqlite` file: this is the user's data-access path and the
  bridge to a later server database.

## Consequences for step 7 (persistence)

1. **Single-tab ownership.** Only one tab can own the database. The app must detect this and say
   so instead of failing obscurely. Proposal: take a Web Lock (`navigator.locks`) named after the
   database before opening it; a second tab shows "OpenAirBike is already open in another tab".
   Assumption: `navigator.locks` is available wherever Web Bluetooth is (Chromium) — to verify.
2. All database work stays in one dedicated worker (already the plan).
3. The WASM file (~0.4 MB gzip) should be loaded only when storage is first needed, so the live
   screen does not wait for it.
4. Keep `optimizeDeps.exclude` and `worker.format: 'es'` in `vite.config.ts`.

## Not tested

Real Chrome on Windows/macOS/Android, storage eviction under disk pressure
(`navigator.storage.persist()` should be requested), very large databases, the `pauseVfs()`
API of the SAH pool as an alternative to single-tab ownership.
