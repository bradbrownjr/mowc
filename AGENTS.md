# Agent Guide for MOWC (Monster of the Week Companion)

This file is the persistent shared memory for any AI assistant working on
MOWC (GitHub Copilot, Claude, etc.). It captures the rules of engagement,
project-specific gotchas, and a registry of every shipped feature so that
large refactors don't silently regress them.

> Single source of truth. `CLAUDE.md` and `.github/copilot-instructions.md`
> only point here, never duplicate rules.

---

## Non-Negotiable Project Rules

1. **Never commit or bundle Evil Hat / Michael Sands game text.** No playbook
   text, move text, mystery text, or monster write-ups in this repo, in
   seeds, in fixtures, in tests, or in Docker images. Game content enters the
   app only at runtime as user-supplied content packs. Test fixtures use
   obviously invented placeholder content ("The Placeholder" playbook,
   "Test Monster"). See `docs/LICENSING.md`. This is a legal constraint,
   not a style preference.
2. **Offline-first is an architecture, not a feature.** Every player-facing
   mutation must work against local IndexedDB and sync later. Any new entity
   must follow the sync envelope in `docs/SYNC.md` from day one. Never add a
   client feature that requires a live server round trip during play
   (Keeper-only admin screens may be online-only).
3. **The design contract lives in `docs/DESIGN.md`.** Read it before any UI
   work. Never hardcode colors, spacing, radii, or font sizes; use the CSS
   custom-property tokens. Never introduce a visual pattern not documented
   there; extend the doc in the same change.
4. **Schemas are shared.** Entity shapes are zod schemas in `shared/`.
   Client and server both import them. Never define a parallel shape by hand
   on either side.
5. **Security contract.** `docs/SECURITY.md` governs every endpoint, entity,
   and upload path; its ROADMAP gate table says what must land with each
   phase. New API surface is not done until checked against it.
6. **When offering to begin a phase or task, always state the recommended
   model(s) from the ROADMAP tags and a 1-3 sentence scope summary.** The
   user orchestrates work across multiple agents/models (Opus as
   orchestrator unless Sonnet is adequate) and needs this to dispatch.

## Always / Never Memory Protocol

- If the user says **"always"**, **"never"**, **"remember"**, **"don't"**
  or similar, treat it as a permanent project rule and add it here as a
  clear, testable directive.
- If a rule is not written down in this file, assume it will be forgotten
  in the next session.
- Update or remove rules that turn out to be wrong or outdated rather
  than letting them accumulate.

## Communication Style

- Be brief. Target 1-3 sentences for simple answers.
- Action over explanation. Show the change, don't narrate "I'll now...".
- No preambles, no restating the user's request, no apologies for prior
  iterations. Just fix it.
- Treat every user question as requiring a direct answer; do not silently
  skip questions to start coding.
- Parallel tool calls when operations are independent.
- For straightforward single-file changes, proceed directly. For large or
  cross-cutting changes, present a plan + open questions + risks first
  and get alignment before writing code.
- No emoji in code, comments, commit messages, or generated docs unless
  explicitly requested.
- No em-dashes in source code or generated text. Use commas, periods,
  or parentheses.

## Engineering Principles

- **DRY** - Extract shared logic; don't duplicate.
- **SOLID** - Single-responsibility, open/closed, dependency-inversion.
- **KISS** - Clarity over cleverness. Simple, explicit, maintainable. This
  codebase is intentionally kept simple enough for smaller models (Haiku,
  Sonnet) to maintain: prefer boring, explicit code over clever
  abstractions, and keep files under ~400 lines.
- Match the patterns already established in the codebase.
- Progressive cleanup: remove dead imports / commented blocks as you go.

## Root-Cause Policy

- Never patch symptoms. Identify the underlying cause before fixing.
- Trace the call chain / data flow far enough to understand *why*, not
  just *where*.
- Prefer invasive-but-correct fixes over safe-but-superficial workarounds.
- After a fix, verify the symptom *and* the root cause are gone.

## Implementation Discipline

- Only make changes that are directly requested or clearly necessary.
- Don't add features, refactor code, or make "improvements" beyond scope.
- Don't add docstrings, comments, or type annotations to code you didn't
  change.
- Don't add error handling for scenarios that can't happen. Validate at
  system boundaries only (API routes validate with zod; internal functions
  trust their inputs).
- Don't create helpers or abstractions for one-time operations.

## Build-Test-Deploy Workflow (strict)

Order is mandatory. Skipping a step is a process violation even if the
change "obviously works".

1. **Build**: `npm run build` must succeed (client + server, strict
   TypeScript, zero errors).
2. **Test**: `npm test` (vitest) must pass. New behavior requires new
   tests; a bug fix requires a regression test that fails before the fix.
3. **Lint/check**: `npm run check` must be clean (eslint + svelte-check).
4. **Commit**: only after 1-3 pass locally. One logical change per commit,
   imperative mood, body explains what and why.
5. **CI**: push, then watch CI. Green locally but red in CI is still a
   regression; fix forward, never disable the check.
6. **Deploy**: only via tagged release and the GHCR image. Never deploy
   from a working tree.

### Command reference

- `npm run build` — builds `shared`, `server`, `client` (workspaces, in
  that dependency order via npm's `--if-present` resolution).
- `npm test` — runs vitest once across the whole repo (no root
  `vitest.config`; it globs every `**/*.test.ts`, e.g.
  `server/src/app.test.ts`, `server/src/db/migrate.test.ts`,
  `shared/src/index.test.ts`).
- Single test file: `npx vitest run server/src/db/migrate.test.ts`.
- Single test by name: `npx vitest run -t "name substring"`.
- `npm run check` — root eslint over the whole tree, then each
  workspace's own `check` script (`server`: `tsc --noEmit`; `client`:
  `svelte-check` + `client/scripts/check-enforcement.mjs`, which bans
  `{@html}` and hardcoded hex colors in `client/src/**/*.svelte`).
- `npm run dev` — runs `dev` in every workspace with one present
  (`server`: `tsx watch`; `client`: `vite dev`, proxying `/healthz` to
  `localhost:7120`).

## Regression Check Policy

- **Before every commit**, mentally run `git diff --stat`. If deletions
  outnumber additions, or any single file is shrinking by more than ~50
  lines, **explicitly audit** that no shipped behavior is being removed.
- A single commit removing **200+ lines** from one file requires a
  written justification in the commit body.
- Before any large file rewrite, list the named features / API routes /
  exported functions present in that file, then confirm each one
  survives. Cross-reference against the Feature Registry below.
- After every targeted edit, read the surrounding ~10 lines above and
  below the change and verify structural markers (braces, tags, parens)
  are still balanced.
- Run the full local suite after any multi-file change or any deletion
  of a non-trivial block: `npm run build && npm test && npm run check`.

## Phase / Milestone Completion Guardrail

Two different flags, two different bars. Conflating them is how 0.11.2
shipped, fully working, with its ROADMAP checkbox left unflipped for two
whole builds until caught in 0.11.4's session.

- **Single ROADMAP line-item** (e.g. `- [ ] Character sheet play layout -
  0.11.4 [Sonnet]`): flip it to `[x]` **in the same commit** as the
  shipping work, no separate confirmation round-trip needed, as long as
  every requirement in that bullet's own description is verified (code
  exists, `npm run build && npm test && npm run check` pass, e2e green if
  touched, docs updated). This is routine and low-risk; don't defer it,
  and don't let it slip to "I'll flip it later" — later is how it gets
  forgotten. Before starting the *next* item, re-scan the last few
  ROADMAP lines you touched for any left unflipped.
- **Phase/section header** (e.g. `## Phase 5: Keeper Tools ✅`): this is
  the higher-stakes flag users see at a glance, so it still requires the
  full guardrail before flipping:
  1. Read the full requirement section top-to-bottom.
  2. Check for "pending", "planned", or "deferred". If any remain, the
     phase is **not** complete.
  3. Verify each requirement: code exists, tests pass, docs match.
  4. Ask the user "Ready to mark Phase X complete?" before flipping it.
  5. If in doubt, leave it "in progress" and summarize done vs pending.

## Commit & Release Policy

- Imperative mood; the body explains *what* changed and *why*.
- One logical change per commit. Don't batch unrelated work.
- Never commit broken builds, failing tests, or unresolved lint errors.
- After each major feature or bug fix, commit and push once local
  validation passes.
- Do not publish a release artifact, tag, or image until the user
  explicitly says they are ready.

### Release procedure

Version format is `0.PHASE.BUILD` (e.g. `0.4.2` = Phase 4, build 2).
Versions starting with `0.` are marked pre-release on GitHub.

**As of 0.10.5**: phases are no longer necessarily built in numeric
order (Phase 10 content shipped as 0.10.x before Phase 5 was even
started; Phase 5 then shipped as 0.10.5 on top of it, by explicit user
choice, rather than as 0.5.x). Treat the middle number as a plain
build-line counter that only increments from the last real release,
not a strict per-phase bucket — a `0.5.x` tag now would sort *before*
the already-released `0.10.x` line and misrepresent release order on
GitHub/Docker. When proposing a version for the next release, default
to incrementing off the highest existing tag, and only suggest a
phase-matched number if it would also sort correctly; ask the user
when the two disagree.

1. `CHANGELOG.md` must have a `## [X.Y.Z] - YYYY-MM-DD` section describing
   the release in user-facing terms. Write it BEFORE the release commit;
   the release workflow extracts it for the GitHub Release body.
2. Bump `version` in the root `package.json` to match (no `v` prefix).
3. Commit both together: `git commit -m "chore: release vX.Y.Z"`.
4. Tag and push in one call:
   `git tag -a vX.Y.Z -m "MOWC vX.Y.Z" && git push origin main && git push origin vX.Y.Z`
5. GitHub Actions builds the multi-arch image to `ghcr.io/bradbrownjr/mowc`
   (`:X.Y.Z`, `:latest`) and publishes the GitHub Release from the
   CHANGELOG section.

| Item | Value |
|---|---|
| Default port | `7120` (first commit: Jul 12, 2026) |
| Image | `ghcr.io/bradbrownjr/mowc` |
| Standard compose | `docker/docker-compose.standard.yml` |
| Unraid compose | `docker/docker-compose.unraid.yml` |

## Definition of Done

- Solves the validated root cause.
- Code is DRY / KISS, with no dead imports or commented-out blocks.
- `npm run build`, `npm test`, `npm run check` all pass locally.
- Documentation updated:
  - `CHANGELOG.md` under `## [Unreleased]` for user-facing changes
  - `AGENTS.md` for new rules / gotchas / Feature Registry rows
  - `ROADMAP.md` checkbox for the completed line-item flipped to `[x]`
    (Phase / Milestone Completion Guardrail above)
  - `docs/DESIGN.md` for new UI patterns
  - `docs/DATA-MODEL.md` / `docs/SYNC.md` for new entities or sync changes
  - `docs/SECURITY.md` checked for any new endpoint, entity, or upload path
- Committed and pushed; CI green on `main`.

## Subagent Usage

- Prefer subagents (e.g., `Explore`) for read-only multi-step research
  to avoid cluttering the main conversation.
- Specify thoroughness explicitly (quick / medium / thorough).
- Subagents are stateless: give them complete context in the prompt
  and tell them exactly what to return.

## Validate Locally Before Pushing

- CI ping-pong (push, wait, fix, push) is the slowest feedback loop.
- If a toolchain is missing locally, install it once rather than
  firefighting per CI run.
- Symptom of falling into the trap: "fix one error, push, new error,
  fix, push" cycle. Stop and audit holistically.

---

## Project Layout

```
mowc/
├── client/              # SvelteKit PWA (static adapter, Svelte 5 runes)
│   └── src/{lib,routes,app.html}
├── server/              # Express + better-sqlite3 (TypeScript)
│   └── src/{api,db,sync,auth}
├── shared/              # zod schemas + types imported by client AND server
├── docs/                # ARCHITECTURE, DATA-MODEL, SYNC, DESIGN, LICENSING
├── docker/              # docker-compose.standard.yml, docker-compose.unraid.yml
├── Dockerfile           # Multi-stage, non-root (PUID/PGID), serves client + API
├── .github/workflows/   # ci.yml, release-image.yml, release.yml
├── ROADMAP.md           # Phased plan with model recommendations
└── CHANGELOG.md         # User-facing, timestamped release notes
```

(Phase 1 creates this tree; until then only docs exist.)

## Tech Stack Versions

- Node 20+ (dev box has v20.19), npm 11, TypeScript 5.x strict
- Client: SvelteKit 2 / Svelte 5 runes / adapter-static, vite-plugin-pwa
  (Workbox), Dexie for IndexedDB
- Server: Express 5, better-sqlite3, zod, Argon2 (argon2 package) for
  passwords
- Tests: vitest (unit/integration), Playwright (e2e, later phase)
- Docker buildx multi-arch (linux/amd64, linux/arm64) to GHCR

## CI Gates (must stay green)

- **Build**: client + server compile, strict TS, zero errors.
- **Test**: `npm test` all passing.
- **Check**: eslint + svelte-check clean.
- **Docker smoke**: image builds, container starts, `/healthz` answers.
- **Release image**: multi-arch push to `ghcr.io/bradbrownjr/mowc` on tag.
- **Release**: GitHub Release auto-published from CHANGELOG on `v*` tag.

---

## Repo-Specific Gotchas

These are bugs we have hit (here or in sibling repos). Re-introducing any
of them is a regression.

### `.gitignore` patterns must be root-anchored

Bare `data/` or `config/` rules silently untrack same-named source
directories anywhere in the tree (this bit the tangible repo). Always use
`/data/`, `/config/` (leading slash) for repo-root runtime dirs.

### Docker volume env var names must match the server's reader

WebBolo lost all user data on container recreation because the image set a
different env var name than the server read, so SQLite wrote inside the
container layer instead of the mounted volume. When wiring `MOWC_DATA_DIR`,
grep for the exact same string in both the Dockerfile/compose files and the
server config reader, and add a CI smoke assertion that the DB file appears
under the mounted volume path.

### iOS Safari storage eviction

iOS can evict IndexedDB for PWAs not used recently. Call
`navigator.storage.persist()` on first run, and treat local data as
reconstructable from the server for signed-in users. Never keep the only
copy of campaign data client-side once the user has an account.

### Sync push batches must be applied in `ts` order, never array order

`client/src/lib/db.ts`'s `oplog` table is keyed by `opId` (a random uuid), so
`toArray()` order is not chronological. A create immediately followed by a
same-entity edit (both queued in the one 2s debounce window) can reach
`server/src/entities/router.ts`'s push handler edit-first; back when the
handler looped over `parsed.data.ops` as received, that meant `current` was
still undefined for the edit, its partial patch alone failed the type's
`.strict()` schema, and the edit was dropped silently and permanently (never
added to `applied`, never retried). Fixed by sorting the batch by `ts`
ascending before the loop (0.10.7). Any future change to push processing
must keep that sort first in the handler; see the regression test "same-batch
ops are applied in chronological order" in `server/src/entities/router.test.ts`.

---

## Feature Registry

Compact checklist of shipped user-facing features keyed to their primary
implementation files. **Before any large refactor, verify every row
touching the affected file column is preserved.**

| Feature | Key file(s) | Key identifiers |
|---|---|---|
| Auth (register/login/logout/me, sessions, CSRF, rate limits) | `server/src/auth/*`, `shared/src/schemas/user.ts` | `createAuthRouter`, `createAuthRepo`, `attachUser`, `requireAuth`, `requireAdmin`, `csrfOriginCheck` (Origin host incl. port vs request Host), `SESSION_COOKIE_NAME`. `touchSession` deletes expired rows on read. `MOWC_TRUST_PROXY` (`parseTrustProxy` in config.ts, applied in index.ts) controls `trust proxy` for real client IPs behind a reverse proxy. |
| Campaign CRUD (Keeper-owned, seats table) | `server/src/campaigns/*`, `shared/src/schemas/campaign.ts` | `createCampaignsRouter(repo, authz, isPackReadable)`, `createCampaignsRepo`, `hasSeat`. PATCH validates newly attached `packIds` through `createPackReadableCheck` (api/contentPacks.ts): a Keeper can only attach packs they own or shared ones (0.10.3 review finding 1); already-attached ids are grandfathered. |
| Invite codes (Keeper-managed, hunter redemption) | `server/src/invites/*`, `shared/src/schemas/invite.ts` | `createCampaignInvitesRouter`, `createInviteRedeemRouter`, `createInvitesRepo`, `addHunterSeat` |
| Authorization (single source of truth for read/edit access) | `server/src/authz/index.ts`, `server/src/authz/guard.ts` | `createAuthz`, `roleFor`, `canReadCampaign`, `canManageCampaign`, `canView`, `canEdit`, `requireKeeper`. Route every new entity's checks through here, never inline. |
| Character builder wizard | `client/src/routes/campaigns/[id]/characters/new/+page.svelte`, `client/src/lib/character-builder.ts` | `buildCharacterPayload`, `flattenPlaybooks`, `selectPlaybook`, step-completeness checks. Writes via `writeEntity("character", ...)`. |
| My Characters roster (cross-campaign) | `client/src/routes/characters/+page.svelte`, `client/src/routes/characters/+page.ts`, `client/src/lib/my-characters.ts`, `client/src/routes/+layout.svelte`, `docs/DESIGN.md` | ROADMAP 0.13.2 (Phase 13, PARTIAL - the roster half only; standalone create/view is still pending). Top-level `/characters` route (`prerender = false`, `/login` guard like `/campaigns`) lists the signed-in user's OWN characters grouped by campaign plus a trailing "Standalone" group, via `groupOwnCharacters(entities, userId, campaignNames)` (pure helper, tested in `my-characters.test.ts`: owner-filtered, deleted-filtered, campaigns sorted by name, Standalone last, sourced from `character.campaignId` which is null for standalone). On visit it `listCampaigns()` then `pull()`s every seated campaign plus `pull("standalone")` for freshness, then reads `db.entities.toArray()`. Campaign characters link to their existing `/campaigns/[id]/characters/[characterId]` sheet; standalone rows render as plain text for now (no standalone sheet route yet). Added a "My characters" top-bar folder tab and a global mobile bottom-bar "Characters" tab (`ScrollText` icon), taking the outside-campaign bottom bar from four tabs to five (docs/DESIGN.md App shell updated same commit). Remaining 0.13.2 work: a standalone character builder (`buildCharacterPayload` campaignId widened to `string \| null`, `writeEntity("character", "standalone", ...)`, packs sourced from shared + self-owned) and a standalone sheet route, both of which want the campaign builder/sheet extracted into shared components first. |
| Content pack list & import (`/packs`, `/packs/new`, `/packs/[id]`) | `client/src/routes/packs/+page.svelte`, `client/src/routes/packs/new/+page.svelte`, `client/src/routes/packs/[id]/+page.svelte`, `client/src/lib/pack-import.ts`, `server/src/api/contentPacks.ts`, `server/src/authz/admin.ts` | All three routes redirect to `/login` when `sessionState.user` is null (the same guard `/campaigns` uses; pack routes predate auth and previously had none). `extractPacksFromFiles` (accepts multiple `File`s in one call; a `.zip` is expanded client-side via `jszip` and every `.json` entry inside becomes its own pack), `extractPacksFromZip`, `parsePackJson`, `isZipFile`. Each extracted pack is still validated and POSTed individually to the existing single-pack `POST /api/content-packs` (no server-side multipart/zip handling — deliberately kept server-simple per KISS). Partial success is expected: the page shows "Imported N of M packs" plus a per-file error list for any that failed validation or upload. Packs uploaded by the `MOWC_ADMIN_EMAIL` account (`isAdmin`) are `visibility: 'shared'` and listed/readable for every authenticated user without campaign attachment; everyone else's uploads default to `'private'`, scoped to owner + attached campaigns as before (docs/SECURITY.md section 7). `PackSummary`/`PackDetail` carry `ownerUserId` and `visibility`; the client hides the Delete button unless `pack.ownerUserId === sessionState.user?.id` and shows an `EvidenceTag` "Shared" badge on shared packs. |
| Character sheet (interactive: tap-to-edit Luck/Harm/Experience tracks + editable Notes) | `client/src/routes/campaigns/[id]/characters/[characterId]/+page.svelte`, `client/src/lib/character-sheet.ts`, `client/src/lib/track-tap.ts` | `resolveCharacterPlaybook`, `resolveCharacterMoves(character, resolved, packs)` (searches every attached pack's playbooks, not just the character's own, so a cross-playbook `addMove` grant still renders), `DEFAULT_LUCK_MAX`, `DEFAULT_HARM_TRACK`; `nextTrackValue(current, max, tappedIndex)` (tap-a-track math: mark forward, tap last-filled to undo, clamped), `crossesUnstable(harm, unstableAt)`. Renders Ratings/Tracks/Moves/Gear/Notes per docs/DESIGN.md. Tracks are `<button>`s; every edit builds the full `Character`, `CharacterSchema.safeParse`s it, updates `$state` optimistically, and persists via `writeEntity("character", ...)` (never a separate edit API). Experience max is the fixed engine constant 5 (NOT on `PlaybookDef`); crossing Harm's `unstableAt` sets `unstable: true` and is never auto-cleared (manual "Clear unstable" only). Notes writes are debounced ~600ms locally. Track fill uses the 120ms ink-blot motion, gated behind `prefers-reduced-motion`. The Characters list (`campaigns/[id]/characters/+page.svelte`) and Overview's Party section (Keeper) list characters from `db.entities` and link here. Play layout (0.11.4, docs/DESIGN.md "Screen patterns"): the page is `.page--wide` wrapping a `.sheet-grid` of two child divs, `.sheet-left` (identity/ratings/tracks) and `.sheet-right` (moves/roll history/gear/notes); below 1024px it's a plain flex column (same DOM order serves both tiers, no JS branching), at 1024px+ it switches to a row with `.sheet-left` pinned `position: sticky` at `--sheet-rail-w` wide while `.sheet-right` scrolls. `.ratings` stays sticky at all tiers (mobile/tablet's "sticky ratings row under the top bar during play"). Track boxes (`.track-box`) are flex items (`flex: 1 1 0; min-width: 40px; max-width: 52px; aspect-ratio: 1`) instead of a fixed `--tap-min` square, so an 8-box Harm track fits one row at 390px without orphan-wrapping; `.panel--track` (Luck/Harm/Experience panels) tightens horizontal padding on mobile to make room. Below 44px visual size the tap target is padded back out via a `.track-box::before` pseudo-element (`inset: 50%; width/height: max(var(--tap-min), 100%); transform: translate(-50%, -50%)`), so the accessible hit area never shrinks even though the box's own footprint does. Unfilled track-box borders use `var(--ink-muted)` (not `var(--border)`) for dark-theme contrast (finding 6: previously nearly invisible against `--surface-2`). `lastRolledMoveId` (`$state`) drives `<details open={move.id === lastRolledMoveId}>` on the Moves list so the just-rolled move's outcomes are expanded automatically instead of requiring a tap. |
| Improvement picker (level up at Experience 5) | `client/src/routes/campaigns/[id]/characters/[characterId]/+page.svelte` (inline "Choose your improvement" section, no separate route), `client/src/lib/level-up.ts` | `eligibleImprovements`, `allBasicImprovementsTaken`, `eligibleAdvancedImprovements` (advanced unlocks only once every basic improvement is taken; a documented engine default, not sourced game text), `pickableMoves` (options for an `addMove` improvement with `moveId: null`, excluding implicit basicMoves and already-known moves), `applyImprovement(character, improvement, chosenMoveId?)` (returns the single `Partial<Character>` patch: bumps a rating, adds a fixed or player-chosen move, or is bookkeeping-only for `custom`; always appends to `improvements` and resets `experience` to 0). Each improvement is takeable once each (no "repeatable" flag on `ImprovementDefSchema`). |
| Client auth & campaign UI (register/login/logout, campaign list/create/join, Keeper invite panel) | `client/src/routes/login/+page.svelte`, `client/src/routes/register/+page.svelte`, `client/src/routes/campaigns/+page.svelte`, `client/src/routes/campaigns/[id]/+page.svelte`, `client/src/lib/api/auth.ts`, `client/src/lib/api/campaigns.ts`, `client/src/lib/api/http.ts`, `client/src/lib/session.svelte.ts`, `client/src/routes/+layout.svelte` | `sessionState`, `initSession`, `login`/`register`/`logout` (session.svelte.ts), `AuthApiError`, `CampaignApiError` (both aliases of `ApiError` in `api/http.ts`). Convention for campaign-scoped routes: read `params.id` in the route's own `+page.ts` (see `campaigns/[id]/+page.ts`) rather than a separate "active campaign" store; later Phase 4/5 routes nest under `/campaigns/[id]/...` and copy this. |
| App shell (responsive top bar, account menu, mobile bottom tab bar, campaign context rail, shared page container) + home page | `client/src/routes/+layout.svelte`, `client/src/routes/+page.svelte`, `client/src/routes/campaigns/[id]/+layout.svelte`, `client/src/routes/campaigns/[id]/+layout.ts`, `client/src/lib/campaign-nav.svelte.ts`, `client/src/lib/styles.css`, all route `+page.svelte` | 0.11.2 app-shell overhaul, rail/bottom-bar destinations completed 0.11.3 (docs/DESIGN.md "Layout"). Top bar (`+layout.svelte`) renders the `.brand` link plus `.tab` folder tabs (docs/DESIGN.md "File tabs" motif; `isActive` compares `page.url.pathname`), shown only at tablet/desktop (`>=768px`); a compact account menu (`.account-button`, display name ellipsised past `12rem`, dropdown with Log out) replaces the old overflowing "Log out (name)" label (Phase 11 survey finding 4), and stays reachable via the top bar at every viewport (never hidden below 768px). Below `768px` the folder tabs give way to a fixed `.bottom-bar` (icon + Courier label via `$lib/Icon.svelte`/`@lucide/svelte`); `body` reserves `--bottombar-h` + safe-area padding so nothing hides behind it. Bottom-bar destinations switch on campaign context: global (Home/Campaigns/Packs/Account, 4 tabs) vs in-campaign (Overview, Sheet for a hunter or Mysteries for the Keeper, World, Campaigns back-out — 4 tabs, no separate Account tab since the top bar already covers it). The hunter's "Sheet" tab links straight to their own character sheet when they have one (`campaignNav.current.ownCharacterId`), else to the character builder. Campaign context is published by the nested `campaigns/[id]/+layout.svelte` (loads the campaign via `getCampaign`, keyed on `data.id` with `$effect` so navigating campaign->campaign refreshes it; for a non-Keeper it also `pull()`s and queries local `db.entities` for the user's own character id). That effect gates on `sessionState.status === "ready" && sessionState.user` read synchronously at the top (same guard every route page uses) rather than only inside the `getCampaign().then()`; without it, a cold direct-navigation into a nested campaign route could have `getCampaign()` resolve before the root layout's `initSession()` did, computing `isKeeper` against a still-null `sessionState.user` and never re-checking (0.11.3 fix, `data.id` not changing meant the effect never re-ran) — the Keeper-only rail rows silently stayed hidden for the Keeper. Published into the shared `campaign-nav.svelte.ts` module (`campaignNav`/`setCampaignNav`/`clearCampaignNav`, `CampaignNavContext` now carries `ownCharacterId: string | null`) that both the bottom bar and the tablet/desktop context rail read. The rail (in the nested layout, `>=768px`, left column `--rail-w`) shows Overview and Characters to everyone; World to everyone (Keeper sees unrevealed rows too); Mysteries, Dashboard, and Settings only to the Keeper. Every route's top element is `<main class="page[ page--narrow| page--wide]">`; the shared `.page` container in `styles.css` (centered, mobile-first gutters, `--page-narrow/content/wide` max widths) is the ONLY place page-level max-width lives; per-route `max-width` rules were deleted. Root `/` landing CTAs switch on `sessionState.user`. `Footer.svelte`/`healthState` remain the single place the running app version is displayed. |
| Campaign hub restructure (role-aware Overview, Characters/World/Mysteries/Settings screens, empty states, first-run checklist, role field note) | `client/src/routes/campaigns/[id]/+page.svelte`, `client/src/routes/campaigns/[id]/characters/+page.svelte`, `client/src/routes/campaigns/[id]/world/+page.svelte`, `client/src/routes/campaigns/[id]/mysteries/+page.svelte`, `client/src/routes/campaigns/[id]/settings/+page.svelte`, `client/src/lib/EmptyState.svelte`, `client/src/lib/FieldNote.svelte` | ROADMAP 0.11.3 (Phase 11, fixes survey finding 3). The old campaign page stacked eight sections mixing player content with Keeper admin; it is now split by role and entity type. Overview (`campaigns/[id]/+page.svelte`) is role-aware: a hunter sees a "Your character" panel (`ownCharacter`, derived by `ownerUserId === sessionState.user.id`; a hunter's local rows are already owner-filtered server-side) or a builder CTA, plus a read-only "World" summary of the 5 most-recently-touched revealed monster/minion/bystander/location rows (`recentWorld`, sorted by the local `LocalEntity.updatedAt`, not the payload); a Keeper sees Mysteries (top 5 + link to the full list), Party (all characters, unchanged from before so the character-build e2e still finds the created character by name here), Recent world entities, and a first-run checklist ("Attach a content pack" / "Invite your players" / "Create your first mystery") derived entirely from existing data (`campaign.packIds.length`, an invite count fetched via `listInvites`, `mysteries.length`) with no new persisted flag; the checklist panel disappears once all three are done. Characters (`characters/+page.svelte`), World (`world/+page.svelte`, four grouped sections with Keeper create CTAs and an `EvidenceTag "Revealed"` badge visible only to the Keeper), and Mysteries (`mysteries/+page.svelte`, Keeper-only, same "Only the Keeper..." inline-message gate pattern as the monster/mystery wizards) are full list routes reachable from the context rail. Settings (`settings/+page.svelte`) is the new Keeper-only home for content-pack attach/detach and invite-code generation/revocation, moved verbatim off the old campaign page (same `updateCampaign`/`createInvite`/`revokeInvite` calls, no API changes). `EmptyState.svelte` (docs/DESIGN.md "Empty states") is the shared what-it-is/why/one-CTA panel used by every list's zero-rows case; its `ctaHref` prop is typed `ResolvedPathname` (from `$app/types`) rather than `string`, since this repo's eslint config has no type-aware Svelte linting and `svelte/no-navigation-without-resolve` cannot trace a value through a prop boundary — call sites still pass a real `resolve()` result, and the type keeps that a compile-time guarantee even where the lint rule needs an inline disable comment (also used for the two `worldHref()`-dispatched links on Overview, which pick a route by `row.type` at runtime). Overview also renders a `FieldNote` directly under the "Keeper"/"Hunter" role label (kept as its own bare-text `<p>` so the character-build e2e's exact-text match keeps working) with one or two original-wording sentences on what that role does and how the other role interacts, e.g. "You are the Keeper (the person running the game). You build the mystery, the monsters, and the world, then reveal pieces of it to your hunters as they investigate." This is `FieldNote`'s first real content user (previously landed empty in 0.11.2); the full glossary sweep is still 0.11.6. Characters, World, Mysteries, and Settings each got the same treatment: one `FieldNote` under the `<h1>` naming who the screen is for (World's and the role-note's copy also branches on `isKeeper`). Fixed alongside: Characters/World/Mysteries each had a duplicate-CTA bug where a persistent "Create a ..." button rendered above the list unconditionally, then `EmptyState`'s own CTA rendered the identical action again once the list was empty; the persistent button is now inside the non-empty branch only, so there is exactly one CTA per DESIGN.md's empty-state rule regardless of list length. |
| Dice roller, Dice banner, local roll history (character sheet) | `client/src/lib/dice.ts`, `client/src/lib/DiceBanner.svelte`, `client/src/routes/campaigns/[id]/characters/[characterId]/+page.svelte` | `rollMove(rating, rng?)` (2d6 + rating, `RollBand` full/mixed/miss at 10+/7-9/6-, injectable rng for tests), `DiceBanner` component (the docs/DESIGN.md signature "torn-slip" motif: big total, band stamp, outcome text; 400ms slide + stamp thunk, opacity-only under `prefers-reduced-motion`), `rollFor(move)` (rolls, opens the banner, marks Experience +1 clamped to `EXPERIENCE_MAX` on a miss via the existing `applyUpdate`), `rollHistory` (a plain `$state` array, most-recent-first, capped at `ROLL_HISTORY_MAX`). Roll history is local-browser-only, intentionally NOT synced (no `SyncEntityTypeSchema` change here); the synced session log is a separate later item, 0.6.3. A move only gets a Roll button when `move.rating !== null`. |
| Offline sync (envelope push/pull; local-first write path for all campaign entities) | `server/src/entities/repo.ts`, `server/src/entities/router.ts`, `server/src/entities/merge.ts`, `client/src/lib/db.ts`, `client/src/lib/sync.ts`, `shared/src/schemas/sync.ts` | `createEntitiesRepo`, `createSyncRouter`, `mergePatch`, `SyncOpSchema`/`SyncPushRequestSchema`/`SyncPullResponseSchema`, client `MowcDb`/`writeEntity`/`deleteEntity`/`push`/`pull`/`sync`/`schedulePush`/`startSync`. Ops carry a top-level-field `patch` merged onto the current row (different-field edits both survive; diverging fields LWW by `ts`; a `ts` more than 5 min ahead of the server clock is clamped so a poisoned clock cannot win forever), idempotent by `opId` via `applied_ops`, authz-filtered per row; an op is dropped if its entity exists in another campaign or with a different `type`. New synced entity types extend `SyncEntityTypeSchema` and reuse this machinery (and MUST pass `revealed` into `accessCtx` once a type carries it; characters do not); never add a per-entity table. `startSync()` (the browser `online` listener that flushes queued ops on reconnect, docs/SYNC.md "When sync runs") is wired once in `client/src/routes/+layout.svelte`'s `onMount`; without that call, offline edits never auto-push until the next online write. `pull` loads the campaign's pending oplog entity ids once into a Set (not a per-row `count()`) so a large first sync does not fire one IndexedDB query per row (0.10.4 perf pass). `repo.pruneAppliedOps(beforeIso)` deletes `applied_ops` rows past the retention window; `index.ts` calls it on startup with a 30-day cutoff (`APPLIED_OPS_RETENTION_DAYS`) to bound that table on long-running campaigns. **Standalone characters (0.13.1):** `Character.campaignId` is `UuidSchema.nullable()`; `null` = a character in no campaign. The push/pull core (`applyPushOps`/`pullRows`/`parseSince`/`parsePushOps` + the `SyncScope` interface, all in `router.ts`) is shared by two scopes: `createSyncRouter` (campaign, role-based authz, all six types) and `createStandaloneSyncRouter` (bucket = the owner's `userId`, owner-only authz, `character` only, forces the merged payload's `campaignId` to `null`). The ops-in-`ts`-order sort still runs first inside `applyPushOps` for both (the 0.10.7 regression). `app.ts` mounts `/api/sync/standalone` BEFORE `/api/sync/:campaignId` so "standalone" is never parsed as a campaign id. Client-side the scope key is the literal `"standalone"` (local `campaignId` bucket AND URL segment); `pull` stores each row under the scope it pulled, not the wire `campaignId`, so the server's user-id bucketing and the client key agree. Only `character` may be standalone; the five Keeper-owned world entities stay campaign-only. |
| Character builder wizard (numbered steps: playbook, ratings line, looks, moves, gear, name, review) + Keeper content-pack attach panel | `client/src/routes/campaigns/[id]/characters/new/+page.svelte`, `client/src/routes/campaigns/[id]/characters/new/+page.ts`, `client/src/lib/character-builder.ts`, `client/src/lib/StepIndicator.svelte`, `client/src/routes/campaigns/[id]/settings/+page.svelte`, `client/src/lib/api/campaigns.ts`, `server/src/api/contentPacks.ts` | `WizardState`, `emptyWizardState`, `selectPlaybook` (resets downstream choices on a playbook change), `flattenPlaybooks`, `isPlaybookStepComplete`/`isRatingsStepComplete`/`isLooksStepComplete`/`isMovesStepComplete`/`isGearStepComplete`/`isNameStepComplete`/`isReviewStepComplete`, `buildCharacterPayload` (assembles the final `Character`; `character.moves` holds only picked playbook moves, never `basicMoves`), `updateCampaign` (client `PATCH /api/campaigns/:id` wrapper). Content-pack reads (`GET /api/content-packs/:id`) fall back from owner-only to campaign-membership scoping so a hunter can load playbook data from a Keeper-uploaded pack attached to their campaign (docs/SECURITY.md section 7). |
| Admin PDF-to-content-pack conversion (server engine) | `server/src/api/conversion/{router,pdftotext,reflow,parse,moves,text,pdfFixture}.ts`, `shared/src/schemas/conversion.ts`, `server/src/auth/rateLimit.ts` (`createConversionRateLimiter`), `server/src/app.ts` (raw parser + mount), `Dockerfile`, `.github/workflows/ci.yml`, `docs/adr/0001-admin-pdf-to-pack-conversion.md`, `docs/SECURITY.md` §4/§7 | `POST /api/admin/conversions` (admin-only via `requireAdmin` middleware + in-router `isAdmin`, stateless, raw `application/pdf` body ≤25 MB parsed only AFTER requireAuth/requireAdmin in app.ts so non-admins never make the server buffer it, magic-byte `%PDF-` check → 400, single-flight `conversionInFlight` → 429, 10/hr `createConversionRateLimiter`, 413 over-limit, 422 extraction failure). `createConversionRouter(adminEmail)`. Pipeline: `extractPdfText`/`extractPdfMetadata` (sandboxed `pdftotext -layout - -` / `pdfinfo -` via fixed argv, 30 s timeout, 4 MB stdout cap, `PdfExtractionError`) → `reflowLayout` (whitespace-river column de-interleave, page-aware) → `parseConversion` → `ConversionResult` (`CONVERSION_RESULT_FORMAT` `mowc-conversion-result/v1`, `drafts: ContentPack[]`, `notes: string[]`). Split: one draft per playbook (boundary = heading above a ratings line, sub-section/reference headings excluded, nearby ratings coalesced) + one `<title> reference` draft; each draft is `ContentPackSchema.strict()`-valid with a fresh uuid. "Flag, never guess": moves get name/trigger/rating from the `roll +Rating` pattern only; trigger stops at the first bullet/outcome-marker/blank (the regression: gear bullets must never bleed into a trigger); outcomes, gear, improvements, extras, unrecognised text, and invented defaults (author/version/license) land in `conversionNotes`/`notes` via `formatConversionNote(path, message, source)`. **Never bundle extracted game text**: real PDFs are gitignored (`*.pdf`), used only for local validation; committed tests use `makePlaceholderPdf` + "The Placeholder" fixtures (AGENTS.md rule 1, ADR §6). Playbook-name/outcome recall on consolidated sheets is best-effort by design, corrected in the 0.9.7 Convert UI review screen (see next row). |
| Convert UI (admin-only PDF upload + draft review screen) | `client/src/routes/packs/+page.svelte` (Convert PDF button), `client/src/routes/packs/convert/+page.svelte`, `client/src/lib/api/conversion.ts`, `client/src/lib/conversion.svelte.ts`, `client/src/lib/conversion-notes.ts`, `client/src/lib/pack-editor/ConversionNote.svelte`, `server/src/auth/router.ts`, `shared/src/schemas/user.ts` | `AuthUserSchema`/`AuthUser` (`UserSchema` extended with `isAdmin`, computed per-request via `isAdmin()` in the `/register`/`/login`/`/me` responses only; the internal `User` type used by req.user/authz/campaigns is unchanged). Client: `convertPdf(file)` POSTs raw bytes to `/api/admin/conversions` and validates the response against `ConversionResultSchema`; `conversionState`/`setConversionResult`/`clearConversionResult` (`conversion.svelte.ts`) hold the last `ConversionResult` in memory only, never persisted, so a refresh loses it (matches the endpoint's stateless design). `/packs` shows a "Convert PDF" button only when `sessionState.user?.isAdmin`; on success it stores the result and navigates to `/packs/convert`. The review route redirects to `/packs` if not admin or no in-memory result; renders one card per draft with independent Save (`createPack`) / Discard, reusing `PlaybookEditor`/`MovesEditor` (both now take optional `generalNotes`/`notesForMove`/`notesForIndex` props, default none, so `packs/new` is unaffected) for playbook drafts and `basicMoves`; `hunterAgenda`/`keeperAgenda` on reference drafts are shown read-only since no editor exists for them anywhere in the app (a deliberate scope cut, not a gap to silently fix later). `conversion-notes.ts` buckets a draft's `conversionNotes` by field-path prefix (`pack`, `playbooks[0]` general vs `playbooks[0].moves[n]`, `basicMoves[n]`) so each note renders next to its field via the new `ConversionNote` component (docs/DESIGN.md "Conversion flags" motif); `unclaimedNotes` is a safety net that still surfaces any note whose path doesn't match a known bucket, so a note can never be silently dropped. |
| App footer (license, "unofficial" notice, running version) | `client/src/lib/Footer.svelte`, `client/src/lib/health.svelte.ts`, `client/src/routes/+layout.svelte`, `server/src/index.ts` | `healthState`, `initHealth` (idempotent `/healthz` fetch, same pattern as `session.svelte.ts`'s `sessionState`/`initSession`); rendered on every route via `+layout.svelte`. Carries the LICENSING.md-required "not affiliated with or endorsed by Evil Hat Productions" notice. Version shown is the root `package.json` version via `/healthz` (server reads `../../package.json` from `server/dist`, not `server/package.json`, whose version was never bumped by the release procedure). |

| End-to-end test suite (Playwright) | `playwright.config.ts`, `e2e/fixtures.ts`, `e2e/*.e2e.ts`, root `package.json` (`test:e2e`), `.github/workflows/ci.yml` (`e2e` job) | Drives the built server (`node server/dist/index.js`) serving client + API from one origin on a throwaway SQLite DB (fresh temp `MOWC_DATA_DIR` per run). Specs are named `*.e2e.ts` (NOT `*.spec.ts`) so vitest's default `{test,spec}` glob never runs them; `npm test` (vitest) and `npm run test:e2e` (build + `playwright test`) stay separate, and there is still no root vitest config. Chromium-only. `fixtures.ts` holds invented placeholder content (AGENTS.md rule 1: no game text) and UI helpers (`registerViaUi`, `createCampaignViaUi`, `buildCharacterViaUi`); content packs are seeded via `page.request` (API), not the pack-editor UI. The offline-sync spec waits for the initial create to land server-side before cutting the network (so only the edit op is in flight on reconnect), then asserts the reconnect flush via `startSync`. Routes use `trailingSlash: always`, so URL matchers must tolerate a trailing slash. |

| Monster builder (Keeper-only wizard: type/motivation, powers, weaknesses, attacks, armor, harm capacity, custom moves) + sheet | `client/src/lib/monster-builder.ts`, `client/src/routes/campaigns/[id]/monsters/new/+page.svelte`, `client/src/routes/campaigns/[id]/monsters/[monsterId]/+page.svelte`, `client/src/routes/campaigns/[id]/world/+page.svelte` | Mirrors the character builder's shape exactly (ROADMAP 0.5.2, Phase 5 Stage 1a): `MonsterWizardState`, `emptyMonsterWizardState`, `flattenMonsterTypes(packs)` (`packs.flatMap((pack) => pack.monsterTypes)`, the pack-sourced `ArchetypeDef[]`), `selectMonsterType` (prefills `motivation` from the type, editable afterward; re-picking the same type is a no-op so it never clobbers an edited motivation), `isTypeStepComplete`/`isPowersWeaknessesStepComplete`/`isCustomMovesStepComplete` (always true, all optional per `MonsterSchema`), `isAttacksStepComplete` (every attack row needs a non-empty name and a non-negative integer harm), `isArmorHarmStepComplete` (`harmCapacity` is the one schema field with no default, so it must be non-null), `buildMonsterPayload` (trims freeform list entries and drops blanks). The wizard route redirects non-Keepers away with an error message (no create/edit UI is ever shown to a hunter, reusing the same `campaign.keeperUserId === sessionState.user.id` derivation as the campaign page). The sheet reuses `nextTrackValue` (`track-tap.ts`) for the Harm track's tap-to-mark, gated so only the Keeper's taps call `applyUpdate`; a non-Keeper viewer (only possible once `revealed: true`) sees the same track as disabled `<button>`s. Writes go through `writeEntity("monster", ...)`, never a separate edit API. The World list (`campaigns/[id]/world/+page.svelte`) lists existing monsters from local `db.entities` (`[campaignId+type]` index, same pattern as the Characters list) alongside a "Create a monster" link. |

| Minion, Bystander, and Location builders (Keeper-only single-screen forms, no wizard) + sheets | `client/src/lib/world-entity-builder.ts`, `client/src/routes/campaigns/[id]/minions/{new,[minionId]}/+page.svelte`, `client/src/routes/campaigns/[id]/bystanders/{new,[bystanderId]}/+page.svelte`, `client/src/routes/campaigns/[id]/locations/{new,[locationId]}/+page.svelte`, `client/src/routes/campaigns/[id]/world/+page.svelte` | ROADMAP 0.5.3 (Phase 5 Stage 1b), Location folded in (not its own ROADMAP line, needed by 0.5.1's `locationIds`). `flattenMinionTypes`/`flattenBystanderTypes(packs)` (pack-sourced `ArchetypeDef[]`; Location has no pack-sourced type, matching `LocationSchema` having no `typeId`), `buildMinionPayload`/`buildBystanderPayload`/`buildLocationPayload` (single-screen forms, not step wizards, per the ROADMAP's "same pattern, smaller forms"). Minion sheet reuses `nextTrackValue` (`track-tap.ts`) for its Harm track exactly like the monster sheet; Bystander/Location have no harm track. All three are Keeper-create/edit-only, hunter-view-only-if-`revealed`, same `isKeeper` derivation as the campaign page. Writes go through `writeEntity("minion"\|"bystander"\|"location", ...)`. The World list (`campaigns/[id]/world/+page.svelte`) lists each from local `db.entities` alongside its own "Create a ..." link. |
| Mystery builder (Keeper-only wizard: title, concept/hook, editable countdown, cast + locations picker, status) + sheet | `client/src/lib/mystery-builder.ts`, `client/src/routes/campaigns/[id]/mysteries/new/+page.svelte`, `client/src/routes/campaigns/[id]/mysteries/[mysteryId]/+page.svelte`, `client/src/routes/campaigns/[id]/+page.svelte` | ROADMAP 0.5.1 (Phase 5 Stage 2). Cast/location ids are NOT pack-sourced (unlike playbooks or monster/minion/bystander archetypes): they reference Monster/Minion/Bystander/Location entities already created in the same campaign, loaded from local `db.entities` by the route, so `mystery-builder.ts` has no flatten-from-packs helper. `MysteryWizardState`, `emptyMysteryWizardState`, `addCountdownStep`/`removeCountdownStep`/`moveCountdownStep` (swap with neighbor, out-of-range is a no-op), `toggleCastId` (generic add/remove-from-list helper reused across monster/minion/bystander/location id arrays), `buildMysteryPayload` (`keeperNotes` always starts `""`, edited later from the sheet, not part of creation). The `[mysteryId]` sheet re-implements the same countdown add/remove/reorder/toggle-done operations directly against the live `Mystery` (not wizard state), each writing immediately via `applyUpdate`/`writeEntity("mystery", ...)`; label/text edits are debounced 600ms like `concept`/`hook`/`keeperNotes`, matching the location sheet's textarea pattern. `keeperNotes` is only ever rendered when `isKeeper` (never shown to a hunter even if the mystery is `revealed`, since the schema has no separate per-field visibility). Cast/location lists on the sheet link out to each entity's own sheet route. |

| Keeper campaign dashboard (two-pane mystery list/detail, arc notes, session prep) | `client/src/routes/campaigns/[id]/dashboard/+page.svelte`, `client/src/routes/campaigns/[id]/+page.svelte` | ROADMAP 0.5.4 (Phase 5 Stage 3), the `docs/DESIGN.md` "Layout" two-pane spec ("mystery list left, detail right; collapses to list->detail navigation on mobile") implemented for the first time. Desktop: CSS grid two columns via `@media (min-width: 768px)`; mobile: both panes always render but a `.hidden-mobile` class (only active under `@media (max-width: 767px)`) shows one at a time, toggled by `selectedMysteryId`, with an explicit "Back to list" button that only renders on mobile. Arc notes are stored in `Campaign.settings.arcNotes` (the existing freeform `settings` record on `CampaignSchema`, not a new field) and saved via the plain REST `updateCampaign` PATCH, debounced 600ms — Campaign is not a `SyncEntityType`, and AGENTS.md rule 2 explicitly allows Keeper-only admin screens to be online-only, matching the Settings screen's pack-attach/invite actions (`campaigns/[id]/settings/+page.svelte`). `PATCH /api/campaigns/:id` replaces `settings` wholesale when present (`server/src/campaigns/repo.ts`), so the client always spreads `{ ...campaign.settings, arcNotes: ... }` rather than sending `arcNotes` alone. The detail pane ("session prep view") is a read-only summary (concept, hook, countdown steps with a struck-through `done` state, cast, locations) with a link out to the full mystery sheet for editing; it does not duplicate the sheet's edit affordances. Reuses `EvidenceTag` for status badges on both the list rows and the detail header. |

| Share/reveal controls (per-entity "revealed to players" toggle) | `client/src/lib/RevealToggle.svelte`, monster/minion/bystander/location/mystery `[id]/+page.svelte` sheets, `e2e/reveal.e2e.ts` | ROADMAP 0.5.5 (Phase 5 Stage 4), the last piece wiring the Phase 3 visibility module all the way to the UI. `RevealToggle` is a dumb Keeper-only button (`revealed`/`onToggle` props) rendered only when `isKeeper`; each sheet wires `onToggle` to its own existing `applyUpdate({ revealed: !entity.revealed })`, so it persists through the same local-first `writeEntity` path as every other field, no new API. The toggle only flips the flag; Stage 0's pull-side filtering (`server/src/entities/router.ts`) is what actually keeps an unrevealed row out of a hunter's local IndexedDB. Also fixed a Stage 1b gap found while wiring this in: the Bystander sheet had no `isKeeper` state at all, so its notes textarea was editable-looking for a hunter even though the write would be silently dropped server-side (Keeper-only entity); it now derives `isKeeper` and disables the textarea like every other sheet. `e2e/reveal.e2e.ts` is the first end-to-end test of Stage 0's revealed-gated pull from the actual UI (not just router-level integration tests): Keeper creates a Location, a joined hunter cannot see it, Keeper reveals it (polling the server via `/api/sync/:id` rather than the client's own optimistic state, since the push is debounced ~2s), hunter's next pull shows it. |

| Builder guidance pass (StepIndicator locked state, FieldNote guidance copy, disabled-Next reasons, compact review previews) | `client/src/lib/StepIndicator.svelte`, `client/src/lib/character-builder.ts`, `client/src/lib/monster-builder.ts`, `client/src/lib/mystery-builder.ts`, `client/src/lib/world-entity-builder.ts`, and every builder route (`characters/new`, `monsters/new`, `mysteries/new`, `minions/new`, `bystanders/new`, `locations/new`) | ROADMAP 0.11.5 (Phase 11), fixes survey finding 5 inside the wizards. `StepIndicator` gained a third visual state: steps after `current` render `class:locked` (muted `--ink-muted` text) plus a small `Lock` icon (`@lucide/svelte`), alongside the existing `current`/`done` states. Every step of the character, monster, and mystery wizards, and every field of the minion/bystander/location single-screen forms, now has a `FieldNote` directly under its heading with one or two original-wording sentences (never game text). Each wizard's `*-builder.ts` gained a parallel `xStepReason(state): string | null` function per blockable step (null once complete) alongside its existing `isXStepComplete` predicate; the route derives a `stepReasons` array the same way it derives `stepComplete`, and renders `{#if stepReasons[currentStep]}<FieldNote>{stepReasons[currentStep]}</FieldNote>{/if}` next to the Next button (docs/DESIGN.md: "a disabled Next is always accompanied by a field note saying what is missing"). The three single-screen forms got the same treatment via `world-entity-builder.ts`'s new `minionFormReason`/`bystanderFormReason`/`locationFormReason`: the Create button's `disabled` now derives from that reason directly (`disabled={submitting || formReason !== null}`) instead of the old pattern of an always-enabled button that only surfaced a `submitError` string after a failed click; the old post-click "Name is required."/"Harm capacity must be greater than 0." checks in each route's `onSubmit` were removed as dead code once the button itself can no longer be clicked in that state (the `SchemaName.safeParse` call right after stays as the actual system-boundary validation). Each wizard's Review step was rebuilt from a flat `<p class="meta">Label</p><p>Value</p>` dump into a `.preview-card` styled like a compact version of the entity's own sheet (name/title, a ratings-row-style stat line, `EvidenceTag` chips for moves/gear/powers/cast instead of comma-joined strings) per docs/DESIGN.md Builders: "a review screen ... that shows a compact preview of the thing being created". |
| Onboarding and plain language (two-role-path landing page, intent-carrying registration, glossary module) | `client/src/lib/glossary.ts`, `client/src/routes/+page.svelte`, `client/src/routes/register/+page.svelte`, `client/src/routes/register/+page.ts`, `client/src/routes/login/+page.svelte`, `client/src/routes/login/+page.ts`, `client/src/routes/campaigns/+page.svelte`, `client/src/routes/campaigns/+page.ts`, `client/src/routes/packs/+page.svelte`, and every screen with a "Keeper" mention | ROADMAP 0.11.6 (Phase 11), fixes survey finding 5 everywhere else. `client/src/lib/glossary.ts` exports `GLOSS` (`keeper`/`hunter`/`playbook`/`move`/`mystery`, each the canonical "term (gloss)" string from docs/DESIGN.md's "Plain language" section); every screen that mentions "Keeper" now imports `GLOSS.keeper` for its first on-screen appearance instead of retyping the parenthetical, including ones with mutually-exclusive Keeper/hunter branches (both branches need their own gloss, e.g. `campaigns/[id]/+page.svelte`'s role FieldNote) and per-row labels that only need one screen-level gloss (`campaigns/+page.svelte`'s Keeper/Hunter tag, glossed once via a `FieldNote` above the list). The landing page (`/`) for a signed-out visitor is now two `.role-card`s, "I'm running the game" and "I'm joining a game", each glossing its role and linking to `/register` with a `?intent=create` or `?intent=join` query string; `register`/`login` read `page.url.searchParams.get("intent")` (via `$app/state`) and forward it to `/campaigns?intent=...` on success, and to each other via their "already have an account"/"need an account" cross-links. `campaigns/+page.svelte` reads the same param and wraps its two action panels in a `.action-panels` div whose `style:flex-direction` flips to `column-reverse` when `intent === "join"`, putting "Join with invite code" first without touching the campaign list above it. Reading `page.url.searchParams` cannot be evaluated at adapter-static prerender time (there is no real request URL yet), so `/`, `/register`, and `/login` (previously prerendered, no dynamic segment) each gained a minimal `+page.ts` with `export const prerender = false`, same convention as the `[id]` routes; they're served through the existing `200.html` SPA fallback instead (`server/src/app.ts`). The remaining plain "No X yet." empty states (`campaigns/+page.svelte`, `packs/+page.svelte`) were converted to `EmptyState` (what/why, no `ctaLabel` since a persistent create action already exists elsewhere on each screen) to match the empty-state pattern used everywhere else. |

| Motif and theme polish (film-grain background, Stamp component, folder-tab shape, pack content summary, base theme toggle) | `client/src/lib/styles.css`, `client/src/lib/Stamp.svelte`, `client/src/lib/theme.svelte.ts`, `client/static/theme-init.js`, `client/src/routes/+layout.svelte`, `client/src/routes/packs/+page.svelte`, `client/src/routes/packs/[id]/+page.svelte`, `server/src/api/contentPacks.ts`, `client/src/lib/api/contentPacks.ts`, world/mysteries/dashboard/mystery-sheet routes | ROADMAP 0.11.7 (Phase 11), fixes survey finding 6. `body::before` in `styles.css` paints a desaturated SVG-turbulence grain (`opacity: 0.035`, tiled 200x200px) fixed behind normal document flow, so opaque panel backgrounds (`--surface`/`--surface-2`) naturally occlude it and only bare `--bg` areas show texture, in both themes. New `Stamp.svelte` (`label`, `tone?: "accent" | "danger"`) is the shared "Stamps" motif component (bordered, rotated -2deg, 80% opacity), landed for the character sheet's Unstable marker (`tone="danger"`, replacing its local `.stamp` CSS), the World list's per-entity Revealed marker (replacing an `EvidenceTag` misuse), and "Solved" wherever a mystery's `resolved` status renders (mysteries list, Keeper dashboard list/detail, hunter-facing mystery sheet) — draft/active statuses keep their existing plain-text/EvidenceTag rendering. The Dice banner's roll-band stamp and the character sheet's roll-history band stamp predate `Stamp` and keep their own local styling (they carry banner-specific 400ms motion this component doesn't implement); not migrated. The top-bar folder tabs (`+layout.svelte`) gained a trapezoid `clip-path`, a `--surface-2` resting background, and `margin-bottom: -1px` with a `--surface`-colored bottom border on `.active` so the open tab visually overlaps and erases the header's border line at that segment (the actual "open folder" look, previously just a bottom-border swap). `packs/[id]/+page.svelte`'s predating inline `.tag` style for move-rating chips is now `EvidenceTag`. The content-pack list (`packs/+page.svelte`) shows "N playbooks - N moves" per row instead of only author/version; `toSummary` in `server/src/api/contentPacks.ts` (and the POST response) now parses the stored payload to compute `playbookCount` and `moveCount = basicMoves.length + sum(playbook.moves.length)`, added to the client's `PackSummary` interface. Theme toggle: `client/src/lib/theme.svelte.ts` (`ThemePreference = "dark" \| "light" \| "system"`, `themeState`, `initTheme()`, `setThemePreference()`) persists to `localStorage` key `mowc-theme` and sets `data-theme` on `<html>` at runtime; `theme-init.js` (the pre-hydration inline script) now reads the same key first and only falls back to `prefers-color-scheme` when unset, so an explicit choice survives a full reload with no flash. The account menu (`+layout.svelte`) gained a "Theme" group of three buttons (Moon/Sun/Monitor icons) above Log out; this is only the base-theme picker, NOT the Phase 8 per-user token-override theming (docs/DESIGN.md "User theming"), which is still unbuilt. |
| Responsive regression audit (WCAG AA contrast fixes, screenshot sweep) | `client/src/lib/styles.css`, `client/src/lib/contrast.test.ts`, `docs/DESIGN.md` | ROADMAP 0.11.8 (Phase 11 exit gate). A Playwright screenshot sweep of every key screen at the four survey viewports (390x844, 844x390, 1024x768, 1440x900) in both themes found no layout regressions from 0.11.1-0.11.7, but a manual WCAG contrast pass over every token pair found several real failures below the 4.5:1 (text) / 3:1 (`--border`, a UI boundary) AA thresholds: dark theme's `--danger` and `--ok`, light theme's `--accent`, `--ink-muted`, and `--ok`, and `--border` in both themes. Fixed by nudging each token's HSL lightness (hue/saturation unchanged) just far enough to clear 4.5:1 (or 3:1 for `--border`) against `--surface-2`, the hardest-case background in both themes; `--ink`, dark theme's `--accent`, and light theme's `--danger` already passed and are unchanged. New `client/src/lib/contrast.test.ts` parses the live hex values out of `styles.css` (not a hand-copied snapshot) and asserts every text token clears 4.5:1 and `--border` clears 3:1 against `--bg`/`--surface`/`--surface-2` in both themes, so a future token edit that regresses contrast fails `npm test` instead of only being caught by eye — this is what docs/DESIGN.md's Accessibility section means by "validation is code, not a checklist." |

Update this table whenever a new feature lands or an existing feature
moves.

---

## Roadmap

The full phased plan lives in `ROADMAP.md` (includes per-task model
recommendations). Track not-yet-built ideas there, not here.
