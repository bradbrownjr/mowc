# Changelog

All notable changes to MOWC are documented here. Format follows
[Keep a Changelog](https://keepachangelog.com/); versions follow the
`0.PHASE.BUILD` scheme described in ROADMAP.md.

## [Unreleased]

## [0.10.3] - 2026-07-16

### Security
- Full security review of the auth, sync, and upload paths (ROADMAP
  0.10.3); the report lives in `docs/reviews/0.10.3-security-review.md`.
  Fixes shipped with it:
  - A Keeper can now only attach content packs they can read (their own
    or the shared library) to a campaign; previously any pack id could be
    attached, which granted the campaign read access to another user's
    private pack.
  - New `MOWC_TRUST_PROXY` setting: set to `1` behind a reverse proxy so
    rate limiting and abuse logs see real client IPs instead of the
    proxy's. Leave unset when exposing the port directly.
  - The CSRF origin check now includes the port, so a page served from
    another service on the same hostname no longer counts as same-origin.
  - Sync timestamps more than 5 minutes ahead of the server clock are
    clamped, so a device with a wrong clock can no longer post edits that
    permanently win against everyone else's.
  - Uploading a pack whose id already belongs to another user returns a
    clean 409 instead of a server error.
  - The admin PDF conversion endpoint rejects unauthenticated and
    non-admin requests before reading the (up to 25 MB) upload body.
  - Character name/look/notes now have explicit maximum lengths
    (100/5000/5000 characters).
  - Expired login sessions are deleted from the database when seen.
  - Dependency audit is now a hard CI gate; the vitest toolchain was
    upgraded to clear its high/critical advisories (production
    dependencies were already clean).

### Added
- End-to-end test suite (Playwright, ROADMAP 0.10.1). A headless browser
  drives the real production serving path (the built server serving the
  client and API from one origin) through the core journeys: register,
  create a campaign, build a character in the wizard, edit a character
  with the network cut, and confirm the edit syncs to the server and a
  fresh client on reconnect. Runs via `npm run test:e2e` and in CI; kept
  separate from the unit suite (`npm test`).
- Convert UI: the `/packs` page now shows an admin-only "Convert PDF"
  button (gated on a new `isAdmin` flag returned by the auth endpoints)
  that uploads a PDF to the 0.9.6 conversion endpoint and opens a review
  screen (`/packs/convert`) listing every draft pack it produced. Each
  draft is editable in place (reusing the existing playbook/moves editors)
  and saved individually through the existing content-pack pipeline;
  `conversionNotes` are shown inline next to the field they flag (a new
  "Conversion flags" callout, docs/DESIGN.md) instead of as a flat dump,
  so the admin can review and correct best-effort playbook names and
  flagged fields before anything is saved. The conversion result lives in
  browser memory only, matching the endpoint's stateless design; a page
  refresh loses unsaved drafts.
- Admin PDF-to-content-pack conversion (server engine). The server-owner
  account can POST a rulebook or playbook PDF to `POST
  /api/admin/conversions` and get back draft content packs: one per
  detected playbook plus a single reference draft, each ready to review
  and save through the existing pack pipeline. Text is extracted with
  poppler `pdftotext -layout`, de-columnized into reading order, and split
  conservatively: moves are recognised from their roll triggers, and
  anything the parser cannot place with confidence (outcomes, gear,
  improvements, unrecognised sections, invented default fields) is flagged
  verbatim in `conversionNotes` with a field path rather than guessed into
  a value. The endpoint is admin-only, stateless (no PDF is written to
  disk, no draft is persisted), rate-limited to 10 conversions/hour with
  single-flight concurrency, and runs pdftotext fully sandboxed (fixed
  argv, 25 MB body cap, 30 s timeout, 4 MB output cap). Playbook-name
  detection on consolidated multi-playbook PDFs is best-effort; the review
  UI (0.9.7) is where an admin corrects names and fills flagged fields. No
  game text ships in the repo or image; poppler-utils is only a tool.
- Content packs can now carry reference content alongside playbooks and
  moves: a `$format` file-format tag, a `license` string, transcriber
  `conversionNotes`, hunter/Keeper agendas and principles, core-rules
  text (roll, harm, luck, recovery, leveling up, end of session), Keeper
  move lists (including harm-tier moves), mystery-creation steps,
  location archetypes (`locationTypes`), and per-category guidance text.
  Previously these fields were rejected on import.
- Playbook extras support a new "composite" kind: an intro blurb plus
  ordered sections that are either pick-lists (numeric or prose pick
  rules like "2+") or free-text prompts, with optional example
  suggestions. Covers fate/breed/background-style playbook widgets.

### Changed
- Monster, minion, bystander, and (new) location archetypes now share
  one shape with a `motivation` field; bystander and minion types
  previously used a `description` field that the game text never used.

### Fixed
- Edits made while offline now sync automatically when the browser
  reconnects. The reconnect flush was implemented but never wired up, so
  offline changes previously sat queued until the next online edit.

## [0.4.13] - 2026-07-15

### Fixed
- Pack import errors now list every failing field in a file, not just
  the first. A file with several null/missing fields (e.g. multiple
  moves each missing trigger or "on a miss" outcome text) previously
  took one fix-and-reupload cycle per field to fully diagnose.

## [0.4.12] - 2026-07-15

### Added
- A footer on every page showing the "unofficial fan project, not
  affiliated with or endorsed by Evil Hat Productions" notice, the MIT
  license line, and the running app version, so it's possible to confirm
  at a glance which version is deployed.

### Fixed
- Pack import errors now include the failing field's path (e.g.
  `basicMoves.0.id: Expected string, received null`) instead of just the
  bare zod message, so a bad `.mowcpack.json` inside a zip can be
  diagnosed without guessing which of dozens of nested `id`/`name` fields
  is null or missing.
- `/healthz` (and therefore the new footer) reported the server
  workspace's own `package.json` version, which was hardcoded at `0.1.0`
  since the very first commit and never bumped by the release procedure.
  It now reads the root `package.json` version, the one the release
  procedure actually bumps.

## [0.4.11] - 2026-07-15

### Fixed
- Added a "Content packs" link to the top nav for signed-in users. Login
  and register both redirect to `/campaigns`, and until now the only path
  to `/packs` was a home-page link with no way back to it once signed in,
  so the feature was unreachable without typing the URL directly.

## [0.4.10] - 2026-07-15

### Added
- Shared content packs: an optional `MOWC_ADMIN_EMAIL` env var designates a
  server-owner account (docker-compose files document it, commented out).
  Packs that account uploads are `shared`: listed and readable for every
  authenticated user on the instance without needing their own copy or a
  campaign attachment, so a whole group no longer each has to import the
  same official-content pack separately. Every other account's uploads
  stay `private` as before, still with the in-app editor (`/packs/new`)
  for homebrew content scoped to their own campaigns. Only the uploading
  account can edit or delete a pack, shared or private. The `/packs` list
  and detail page show a "Shared" tag and hide the delete action for
  packs the current user doesn't own.

## [0.4.9] - 2026-07-15

### Fixed
- `/packs`, `/packs/new`, and `/packs/[id]` now redirect to `/login` when
  visited without a session, matching the guard `/campaigns` already had.
  Previously these pages rendered the full content-pack UI regardless of
  auth state and every API call silently 401'd, surfaced as a misleading
  "Could not reach the server" message.
- `style-src` in the CSP now includes `'unsafe-inline'`
  (`client/svelte.config.js`, docs/SECURITY.md section 5). Confirmed by
  running the production build in a real browser: SvelteKit's static
  wrapper markup and Svelte 5's own compiled hydration-boundary template
  both use a `style="display: contents"` attribute (one static, one
  runtime-applied), which CSP's `style-src-attr` blocks regardless of the
  build-time script/style hashes already in place, since hashes and
  nonces never cover the `style` attribute without `'unsafe-hashes'`.
  This was previously undetected because `vite dev` never applies the CSP
  header. `script-src` is unaffected and stays hash-only.

## [0.4.8] - 2026-07-14

### Added
- Content pack import (`/packs`) now accepts multiple files in one go, and
  accepts `.zip` archives containing several `.mowcpack.json` files (each
  `.json` entry inside is imported as its own pack). Every file/entry is
  validated and posted independently, so partial success is possible; the
  page reports "Imported N of M packs" with per-file error messages for any
  that failed. No server changes: zip extraction happens client-side via
  `jszip`, and packs are still POSTed one at a time to the existing
  single-pack endpoint.
- Dice roller on the character sheet
  (`/campaigns/:id/characters/:characterId`): every move with a rated
  stat gets a "Roll [Stat] ([+/-N])" button that rolls 2d6 + rating and
  shows the result in the Dice banner, docs/DESIGN.md's signature
  interaction: a torn-slip card sliding in with the move name, the total
  in big display type, the outcome band (10+/7-9/Miss) as a colored
  stamp, then the move's matching outcome text (skipped for moves with no
  outcome text). The banner honors the documented 400ms slide + stamp
  thunk motion, falling back to an instant opacity-only fade under
  `prefers-reduced-motion`, and dismisses via a close button or a tap
  outside it. Moves with no rated stat (narrative-only moves) show no
  roll button. A miss (total 6 or less) marks one Experience,
  clamped to the 5-box track, in the same offline-first write path as
  every other sheet edit. Roll history renders below Moves as a
  reverse-chronological list capped at the last 20 rolls; this history is
  intentionally **local to the browser session only, not synced** to the
  server or other devices. A full synced session log (session-wide feed
  of rolls/changes/reveals, exportable as markdown) is a separate later
  roadmap item (0.6.3) once the sync layer supports more than the
  Character entity type; this is a deliberate stepping stone, not a gap.
- Improvement picker on the character sheet
  (`/campaigns/:id/characters/:characterId`): once Experience reaches 5,
  a "Choose your improvement" action opens an inline picker (matching the
  existing tracks, no separate route) listing the eligible basic
  improvements from the character's playbook. Advanced improvements
  unlock once every basic improvement has been taken (a documented engine
  default, since the schema carries no unlock condition). Picking a
  rating-bump improvement adjusts the rated stat; picking a fixed "add a
  move" improvement grants that move; picking a "player picks a move"
  improvement opens a second small picker over every move from every
  attached pack the character doesn't already know; a narrative-only
  improvement just records the pick. Every pick resets Experience to 0 in
  the same write. The character sheet's Moves section now also resolves a
  granted move from ANY attached pack's playbook (not just the
  character's own), closing a gap where a cross-playbook grant wouldn't
  have rendered.
- Editable character-sheet tracks and notes
  (`/campaigns/:id/characters/:characterId`): Luck, Harm, and a new
  Experience track are now tap-to-edit. Tapping a box marks forward
  (filling every box up to the one tapped); tapping the last-filled box
  undoes that mark. Crossing the Harm track's unstable threshold flips the
  UNSTABLE stamp on automatically; because Monster of the Week recovery is
  a table decision, the flag is never auto-cleared when Harm later drops,
  so a "Clear unstable" action sits next to the stamp. Experience is a
  fixed 5-box track (the engine's improvement threshold) and shows a
  "Ready to level up" note at 5 (the improvement picker itself is a later
  change). Notes became an editable text area, saved automatically a
  moment after you stop typing. Every edit saves offline-first (local
  IndexedDB immediately, synced in the background) so the sheet stays
  responsive and works without a connection. Track boxes fill with the
  120ms ink-blot motion from docs/DESIGN.md and honor reduced-motion
  preferences, and are accessible tap targets with descriptive labels.
- Read-only character sheet (`/campaigns/:id/characters/:characterId`):
  shows a hunter's ratings, Luck/Harm tracks, moves (with expandable
  10+/7-9/miss outcome text), gear, and notes, in the mobile-first order
  from docs/DESIGN.md (Ratings sticky under the header, then Tracks,
  Moves, Gear, Notes). An UNSTABLE stamp appears in the header when the
  character's `unstable` flag is set. The campaign page now lists every
  character visible to the current user (a hunter's own, or all of them
  for the Keeper) linking to this sheet, and the character builder
  wizard's post-creation confirmation links straight to the new character
  instead of dead-ending back at the campaign. This screen is read-only;
  tap-to-edit for Harm/Luck/XP is a separate, later change. Adds a
  reusable `EvidenceTag` chip component for move/gear tags (the
  "evidence tag" motif from docs/DESIGN.md).
- Character builder wizard (`/campaigns/:id/characters/new`): any campaign
  member (Keeper or hunter) can create a hunter through a numbered
  step-by-step flow with a progress rail, matching the D&D Beyond-style
  builder described in docs/DESIGN.md - pick a playbook from the campaign's
  attached content packs, a ratings line, a look per playbook-defined group
  (with a "write your own" text option), exactly the playbook's move and
  gear picks, and a name, then review everything before creating the
  character. Going back to change the playbook resets every later choice;
  every other step preserves earlier answers. The finished character is
  written through the existing offline-first sync path (`writeEntity`) and
  validated against `CharacterSchema` before it's saved. Keepers get a new
  "Content packs" panel on the campaign page to attach or detach their
  uploaded packs from a campaign (`updateCampaign` client wrapper over the
  existing `PATCH /api/campaigns/:id`).
- Content-pack reads are now scoped to campaign membership, not just the
  uploader: `GET /api/content-packs/:id` also succeeds for any member of a
  campaign the pack is attached to (docs/SECURITY.md section 7, "packs are
  private to their campaign"), which is what lets a hunter's builder wizard
  load playbook data the Keeper uploaded.
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
