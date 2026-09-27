# ADR 0003 — Local-first browser app, no accounts, no backend

## Status

Accepted (README "Product Principles" 1 and 2; D1, 2026-09-26). Implemented in v0.1.

## Context

The README states: "A workout should not require a cloud account" and users must be able to access
their own data. During development nothing may be installed beyond npm packages (D1). Web
Bluetooth only exists in the browser. Reference projects show the alternatives: a Flask service on
a Raspberry Pi with Garmin upload (bridge), a desktop app (tracker), an Android app (ewoc).
[../../research/architecture-gap.md](../../research/architecture-gap.md) compared browser +
SQLite WASM (A), a local service + web UI (B) and a desktop shell (C).

## Decision

OpenAirBike is a **static web app that runs entirely in the rider's browser**:

* Bluetooth via Web Bluetooth, storage in the browser (ADR 0007);
* no user accounts, no server, no network requests during a session;
* the user's access path to their data is **export** (JSON, CSV, the `.sqlite` file);
* integrations with third-party platforms, if any, are file-based (e.g. FIT, later) and started
  by the user.

## Alternatives

| Option | Why not (now) |
| --- | --- |
| Cloud backend with accounts | contradicts the product principles; operating cost; privacy |
| B: local service + web UI | native BLE per OS, installation, two processes; kept as a later option |
| C: desktop shell (Tauri/Electron) | adds a framework; against "no unnecessary frameworks" |
| Direct upload to Garmin/Strava | Garmin only via an unofficial login (bridge); Strava needs an OAuth client secret → server |

## Consequences

* A running session needs no network; data never leaves the device unless the user exports it.
  (Loading the app offline would need a service worker — not built.)
* Requires a Chromium-based browser with Web Bluetooth (desktop, Android). iOS is not supported
  (Research item "Mobile app" in [../../product/mvp.md](../../product/mvp.md)).
* Data lives in the browser profile; clearing site data deletes it → export/backup must stay
  prominent. Only one tab can own the database (ADR 0007).
* Sync, sharing and third-party uploads stay opt-in research topics; none may become a
  requirement for recording a session.
* Acceptance criterion AC-15 (no requests to other origins during a session) makes this testable.
