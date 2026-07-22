# MOWC Architecture

## Goals that drive every decision

1. **Offline-first**: a hunter at a table with no signal can open the app,
   roll dice, mark Harm, and level up. Sync happens later.
2. **Maintainable by smaller models**: one language (TypeScript), boring
   explicit code, shared zod schemas, files under ~400 lines, patterns
   documented here and in AGENTS.md.
3. **Self-hosted and portable**: single Docker container, SQLite on a
   volume, no external services required.
4. **Content-agnostic engine**: game text arrives as content packs at
   runtime, never in the repo or image (docs/LICENSING.md).

## System shape

```
┌───────────────────────────────┐
│  Browser (any device)          │
│  SvelteKit static PWA          │
│  ├─ Service worker (Workbox)   │  app shell precached, offline-capable
│  ├─ Dexie / IndexedDB          │  local entity store + mutation oplog
│  └─ Sync engine                │  push/pull when online (docs/SYNC.md)
└──────────────┬────────────────┘
               │ HTTPS (REST + SSE)
┌──────────────▼────────────────┐
│  Node 20 container (port 7120) │
│  Express 5                     │
│  ├─ /api/* zod-validated REST  │
│  ├─ /api/campaigns/:id/events  │  live table updates (SSE wake -> pull)
│  ├─ /sync/* sync protocol      │
│  ├─ static client files        │
│  └─ better-sqlite3             │  $MOWC_DATA_DIR/mowc.db on a volume
└───────────────────────────────┘
```

No separate database container. SQLite (WAL mode) is deliberate: one write
process, easy backup (copy one file), fits self-hosting.

## Repo layout (npm workspaces)

```
client/   SvelteKit 2, Svelte 5 runes, adapter-static, vite-plugin-pwa, Dexie
server/   Express 5, better-sqlite3, argon2; src/{api,db,sync,auth}
shared/   zod schemas + derived TS types; the ONLY place entity shapes live
```

Rules:
- `shared/` imports nothing from `client/` or `server/`.
- `client/` and `server/` never import from each other, only from `shared/`.
- API handlers parse input with the shared zod schema, then call a plain
  function in the same module. Keep handlers thin so logic is unit-testable.

## Key decisions and why

| Decision | Why |
|---|---|
| SvelteKit static + Express, not SSR | The PWA must run from cache with no server; SSR would fight offline-first. The server is a pure API + file host. |
| SQLite JSON-payload entity table, not table-per-entity | Sync needs one uniform envelope (docs/SYNC.md); playbook-driven data is heterogeneous; schema lives in zod, not SQL. Indexed columns only for what we query (campaign_id, type, seq, updated_at). |
| LWW sync, not CRDTs | A table of 3-6 people rarely edits the same field concurrently. Last-write-wins with field-level merge on characters is understandable by a Sonnet-class model; Automerge is not. |
| SSE, not WebSockets | One-directional server push is all live play needs (mutations go up via REST). SSE survives proxies, reconnects natively, and is proven in the tangible repo. |
| zod in shared/ | One schema validates the API boundary, generates TS types, and validates content packs. No drift between client and server. |
| npm workspaces, not turborepo/nx | Three packages do not need a build orchestrator. |

## Environment variables

| Var | Default | Meaning |
|---|---|---|
| `MOWC_PORT` | `7120` | HTTP listen port |
| `MOWC_DATA_DIR` | `/data` | Directory for mowc.db and uploads |
| `MOWC_ADMIN_EMAIL` | (unset) | Server-owner account whose packs are shared with every user (docs/SECURITY.md section 7) |
| `MOWC_TRUST_PROXY` | (unset = off) | Trusted proxy hops for `X-Forwarded-For`; set `1` behind a reverse proxy (docs/SECURITY.md section 8) |

The Dockerfile, compose files, and server config reader must use these
exact names (see the volume gotcha in AGENTS.md).

## Testing strategy

- **Unit (vitest)**: schema validation, dice math, sync merge logic,
  visibility rules. Pure functions, no HTTP.
- **Integration (vitest)**: API routes against a temp SQLite file.
- **E2E (Playwright, Phase 10)**: real browser, service worker on,
  offline toggling.
- Fixtures use the invented example content pack only.
