# Changelog

All notable changes to MOWC are documented here. Format follows
[Keep a Changelog](https://keepachangelog.com/); versions follow the
`0.PHASE.BUILD` scheme described in ROADMAP.md.

## [Unreleased]

### Added
- Client UI for accounts and campaigns: you can now register, log in, and
  log out from the app (`/register`, `/login`); a signed-in nav link shows
  who you are and takes you to `/campaigns`, where you can see the
  campaigns you belong to (with your role, Keeper or Hunter), create a new
  campaign, and join one with an invite code. Opening a campaign
  (`/campaigns/:id`) shows its name and your role, and Keepers get a simple
  panel to generate, list, and revoke invite codes. Logged-out or offline
  visits to `/campaigns` show a clear message instead of crashing.
- Offline sync foundation (docs/SYNC.md), the local-first write path every
  Phase 4/5 campaign entity builds on. This is internal infrastructure: no
  user-visible screen ships with it yet (the character builder that uses it is
  the next task). Client gains a Dexie database (`client/src/lib/db.ts`) with
  `entities`, `oplog`, and `syncState` tables plus a generic write path
  (`client/src/lib/sync.ts`: `writeEntity`/`deleteEntity` write locally and
  queue an op without ever awaiting the network, with debounced background
  push, pull-on-open, an `online`-event flush, and capped-exponential retry).
  Server gains `POST /api/sync/:campaignId` (push) and
  `GET /api/sync/:campaignId?since=` (pull) for the `character` type: ops merge
  at the top-level-field level so two devices editing different fields both
  survive, diverging fields resolve last-write-wins by timestamp, replays are
  idempotent by opId, and both push and pull run through the authz module so a
  hunter only ever reads or writes their own character (docs/SECURITY.md
  sections 3 and 4, sync push rate-limited 60/min/user, 500 ops/batch)
- Authorization module (`server/src/authz`): one server-side source of truth
  for "can user U see/edit entity E" per docs/SECURITY.md section 3. Exposes
  `roleFor` (keeper/hunter/none from the `seats` table), `canReadCampaign`,
  `canManageCampaign`, and generic entity-level `canView`/`canEdit` shaped for
  Phase 4/5 entities (Character, Mystery, Monster, Location) that carry
  `campaignId`, an optional `ownerUserId`, and a `revealed` flag: Keeper sees
  and edits everything, a hunter reads revealed or own entities and edits only
  its own, non-members get nothing, and access never crosses campaigns. A
  `requireKeeper` Express guard maps the decision to 404-for-non-member /
  403-for-seated-hunter
- Invite codes: `POST/GET /api/campaigns/:campaignId/invites` (Keeper-only,
  403 for a seated non-Keeper, 404 for a non-member so guessed campaign ids
  can't be distinguished from real ones), `DELETE
  /api/campaigns/:campaignId/invites/:inviteId` to revoke, and
  `POST /api/invites/redeem` for any authenticated user to join as a
  hunter. Codes are random 128-bit, stored hashed (never persisted raw),
  multi-use until a 72h default expiry or revocation, and rate-limited
  10/min/IP on redemption per docs/SECURITY.md sections 2 and 4
- SQLite migration `0005_invites.sql`: the `invites` table
- Campaign CRUD: `POST/GET /api/campaigns`, `GET/PATCH/DELETE
  /api/campaigns/:id`. Creating a campaign seats the creator as Keeper in
  the new `seats` table; reads and writes are scoped by membership (404 for
  non-members, so a guessed id can't be distinguished from a real one) and
  edits/deletes are Keeper-only (403 for a seated non-Keeper)
- SQLite migration `0004_campaigns_seats.sql`: the `campaigns` and `seats`
  tables
- Accounts: `POST /api/auth/register`, `POST /api/auth/login`,
  `POST /api/auth/logout`, `GET /api/auth/me`. Argon2id password hashing,
  httpOnly/SameSite=Lax session cookie with a 256-bit token stored hashed
  (SHA-256) server-side and a 30-day rolling expiry, Origin-based CSRF check
  on state-changing requests, and rate-limit buckets (300/min/IP global,
  10/min/IP on login and register) per docs/SECURITY.md sections 2 and 4.
  Content-pack routes now require a session and are scoped to the
  authenticated user instead of the placeholder local owner
- SQLite migration `0003_users_sessions.sql`: the `users` and `sessions`
  tables
- Shared zod schemas with inferred TypeScript types for all core entities
  (content pack definitions: ContentPack, PlaybookDef, MoveDef, GearDef,
  MonsterTypeDef; campaign entities: Campaign, Seat, Character, Mystery,
  Countdown, Monster, Minion, Bystander, Location, SessionLog), exported
  from `@mowc/shared` so client and server validate the same shapes
- Example content pack fixture (content-packs/example-pack.mowcpack.json)
  with obviously invented placeholder content (playbooks, moves, gear,
  monsters, etc.) for test validation and future Phase 2.3 API tests
- SQLite migration `0002_sync_envelope.sql`: the uniform `entities`
  sync-envelope table (JSON payload with per-campaign `rev`/`seq`, tombstone
  and indexes per docs/SYNC.md), the `applied_ops` idempotency table keyed
  by (campaign_id, op_id), and the non-synced `content_packs` table owned by
  the uploading user
- Content pack CRUD API (`POST/GET /api/content-packs`, `GET/DELETE
  /api/content-packs/:id`): strict zod validation with path-precise error
  responses, a 5 MB body limit for pack uploads vs. 1 MB elsewhere, and a
  recursive guard rejecting `__proto__`/`constructor`/`prototype` keys and
  excessive nesting per docs/SECURITY.md section 7
- Content pack editor UI (`/packs`, `/packs/new`, `/packs/[id]`): create a
  pack in-app with one or more playbooks (ratings lines, Luck/Harm track,
  moves with trigger/outcome text, gear choices), list/view/delete packs
  served from the API
- Pack import/export: upload a `.mowcpack.json` file from the pack list
  (client-side schema check before it reaches the API) and download any
  pack's full JSON from its detail page

### Changed
- Campaign and invite routers now resolve every role check through the new
  authz module instead of inlining their own membership/Keeper logic; HTTP
  status codes and response bodies are unchanged

### Fixed
- The server's Content-Security-Policy header was unintentionally blocking
  SvelteKit's own inline hydration script in the production build (masked
  in `vite dev`, which doesn't apply the header), so the client never
  actually became interactive once served by the real server. Script/style
  CSP now comes from a per-page build-time hash `<meta>` tag (SvelteKit's
  `kit.csp`, `client/svelte.config.js`) instead of the header, which is now
  limited to `frame-ancestors 'none'` (docs/SECURITY.md section 5)
- A route with sub-routes (`/packs` plus `/packs/new`) made the static
  build emit both a `packs.html` file and a `packs/` directory at the same
  path, which made Express's static file server 301-redirect and break
  every page-relative asset URL. Fixed via `trailingSlash = "always"` so
  adapter-static always emits `<route>/index.html`

## [0.1.0] - 2026-07-13

### Added
- Phase 1 scaffold: npm-workspaces monorepo (client, server, shared) with
  strict TypeScript, ESLint 9 flat config, and Prettier
- Shared zod package (`@mowc/shared`) with the healthz response schema
  imported by both client and server
- Express 5 server: config from env (`MOWC_PORT` 7120, `MOWC_DATA_DIR`),
  better-sqlite3 (WAL, foreign keys), numbered SQL migration runner with a
  `schema_migrations` table, `GET /healthz`, and a security-headers module
  (CSP, nosniff, frame-deny, referrer, permissions, conditional HSTS) with
  a 1 MB body limit
- SvelteKit static PWA client (Svelte 5 runes) with the "Case File" design
  tokens (Midnight Unit dark default, Field Notes light), self-hosted fonts,
  and a health page
- Installable, offline-capable PWA: service worker precaches the app shell
  and falls back to the offline page, web app manifest with original icons,
  install prompt, and persistent-storage request on first load
- Docker packaging: multi-stage image (non-root via PUID/PGID, tini as
  PID 1, healthcheck on loopback) plus standard and Unraid compose files
  mounting a single `/data` volume
- GitHub Actions: build/test/check CI with a docker smoke test, plus
  multi-arch release-image and GitHub Release workflows

## [0.0.2] - 2026-07-12

### Added
- docs/SECURITY.md: security contract adapted from ECTLogger's policy and
  expanded for MOWC's stack (threat model, zod boundary rules, session and
  CSRF design, sync/upload hardening, container hardening, per-phase
  security gates)
- AGENTS.md rules: security contract is part of Definition of Done; when
  offering to begin a phase, state the recommended model(s) and scope

## [0.0.1] - 2026-07-12

### Added
- Project foundation: README, MIT LICENSE (code only), .gitignore
- AGENTS.md rules of engagement (CLAUDE.md points to it), including the
  non-negotiable content-licensing rule, offline-first architecture rule,
  and the strict build-test-deploy workflow
- ROADMAP.md: Phases 0-10 with per-task Claude model recommendations
- docs/: ARCHITECTURE, DATA-MODEL, SYNC, DESIGN, LICENSING
