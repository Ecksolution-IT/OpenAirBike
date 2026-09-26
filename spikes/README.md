# Spikes

Throw-away experiments that answer one technical question. They are not part of the app build
and are not maintained. Results are documented in `docs/research/`.

| Spike | Question | Result |
| --- | --- | --- |
| [`sqlite-opfs/`](sqlite-opfs/) | SQLite WASM persisted in OPFS without extra installs or COOP/COEP headers? | Yes — see [spike-sqlite-opfs.md](../docs/research/spike-sqlite-opfs.md) |

Run: `npm run dev`, then open `http://localhost:5173/spikes/<name>/`.
