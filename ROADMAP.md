# MOWC Roadmap

Version scheme: `0.PHASE.BUILD` (e.g. `0.4.2` = Phase 4, build 2).

> **Model guide** — recommended Claude model per task, tagged inline:
> - **[Haiku]** — mechanical edits, doc updates, config/templates, copying an
>   established pattern to a new file, deletions
> - **[Sonnet]** — standard feature work within one subsystem, CRUD routes,
>   UI screens from the design doc, tests
> - **[Opus]** — tricky single-subsystem work: sync conflict logic, service
>   worker lifecycle, real-time updates, import parsers
> - **[Fable]** — architecture, cross-cutting rewrites, schema/API design,
>   security review
>
> A larger model can always take a smaller model's task. A smaller model
> picking up an [Opus]/[Fable] task should stop and say so instead of
> attempting it. Before starting ANY task, read `AGENTS.md` top to bottom,
> then the docs listed in the task. Every task ends with the strict
> build-test-deploy workflow from `AGENTS.md` (build, test, check, commit).

---

## Phase 0: Foundation ✅

Version 0.0

- [x] Repo init, README, LICENSE, .gitignore - 0.0.1 [Fable]
- [x] AGENTS.md / CLAUDE.md rules of engagement - 0.0.1 [Fable]
- [x] ROADMAP.md with model guide - 0.0.1 [Fable]
- [x] CHANGELOG.md started - 0.0.1 [Fable]
- [x] docs/: ARCHITECTURE, DATA-MODEL, SYNC, DESIGN, LICENSING - 0.0.1 [Fable]
- [x] docs/SECURITY.md (ECTLogger baseline, expanded; includes per-phase
      security gate table that every phase below must satisfy) - 0.0.2 [Fable]
- [x] Content-pack JSONs for the 12 core-rulebook playbooks (+ basic moves,
      Keeper reference) drafted from Evil Hat's free PDFs, held in gitignored
      `content-packs/private/` pending permission - 0.0.2 [Fable]

## Content Track: Playbook Transcription (parallel, permission-gated)

Not part of the app phases and not on the version line; this runs whenever
convenient. It is **gated on user permission for any distribution** (the
JSONs stay in gitignored `content-packs/private/` until then) and the
finished files must be **re-validated against the Phase 2 zod `PlaybookDef`
schema** once that lands (0.2.1), reconciling any drift back into the
exemplar first. Full workflow, exemplar spec, and PDF line ranges live in
`content-packs/private/README.md` — read it before starting any task here.

- [x] 12 core playbooks + basic moves + Keeper reference (see 0.0.2 above)
- [ ] Expansion hunter playbooks from the Hunter Playbooks Consolidated 2025
      PDF: Action Scientist, Celebrity, Changeling, Covenant, Curse-Eater,
      Envoy, Forged, Gumshoe, Hex, Host, Interface, Pararomantic, Searcher,
      Snoop, Spooktacular, Visitor - CT.1 [Sonnet]
      One file per playbook (`motw-playbook-the-<name>.mowcpack.json`),
      matching the exemplar. Independent per playbook, so safe to fan out
      across several Sonnet agents; each needs only the README spec + its
      own PDF line range. Transcribe verbatim; flag ambiguities in
      `conversionNotes`, never guess.
- [ ] Codex of Worlds / Tome of Mysteries playbooks not present in the
      consolidated PDF (download those PDFs into `pdfs/` first; source URLs
      in `docs/LICENSING.md` list) - CT.2 [Sonnet]
- [ ] Team playbooks (Teambooks): design a `motw-teambook-*.mowcpack.json`
      exemplar and add a `teambooks` section to `docs/DATA-MODEL.md` first
      (team moves, roles, shared resources differ structurally from hunter
      playbooks), then batch-convert from `pdfs/team-playbooks-2025.txt`
      - CT.3 [Opus for the exemplar + schema; Sonnet for the batch]

## Phase 1: Scaffold & Pipeline ✅

Version 0.1 — goal: an empty-but-real app that builds, tests, ships as a
Docker image, and serves a "hello" PWA shell with a health endpoint.

- [x] Monorepo scaffold - 0.1.1 [Sonnet]
      Root `package.json` (npm workspaces: `client`, `server`, `shared`),
      strict `tsconfig.base.json`, eslint + prettier config. Scripts:
      `dev`, `build`, `test`, `check`, `start` mirroring webbolo's layout
      (see `docs/ARCHITECTURE.md`).
- [x] `shared/` package with zod installed and one placeholder schema
      (`healthz` response) imported by both sides - 0.1.2 [Sonnet]
- [x] Express server skeleton - 0.1.3 [Sonnet]
      `server/src/index.ts`: loads config from env (`MOWC_PORT` default
      7120, `MOWC_DATA_DIR` default `/data`), opens better-sqlite3 at
      `$MOWC_DATA_DIR/mowc.db`, serves `/healthz` returning
      `{status:"ok",version}`, serves the built client statically.
      Migration runner: numbered `.sql` files in `server/src/db/migrations`,
      applied in order, tracked in a `schema_migrations` table.
- [x] SvelteKit client skeleton - 0.1.4 [Sonnet]
      SvelteKit 2 + adapter-static + Svelte 5 runes. Base layout with
      design tokens from `docs/DESIGN.md` (light + dark). One route (`/`)
      showing app name and server health.
- [x] PWA plumbing - 0.1.5 [Opus]
      vite-plugin-pwa (Workbox): precache app shell, manifest (name,
      icons, theme color from tokens), install prompt, offline fallback
      page. Call `navigator.storage.persist()` on first load (iOS gotcha
      in AGENTS.md). Verify: airplane mode, reload, app still renders.
      Verified via built service-worker precache manifest and Express
      integration smoke test; a real-browser airplane-mode check is still
      recommended before 1.0.
- [x] Vitest wiring, first tests (migration runner, healthz) - 0.1.6 [Sonnet]
- [x] Dockerfile (multi-stage, non-root, PUID/PGID, tini) +
      `docker/docker-compose.standard.yml` + `docker-compose.unraid.yml`
      with `/data` volume - 0.1.7 [Sonnet]
      MUST honor the "Docker volume env var" gotcha in AGENTS.md.
- [x] GitHub Actions: `ci.yml` (build, test, check, docker smoke that curls
      `/healthz` and asserts the DB file lands in the mounted volume),
      `release-image.yml`, `release.yml` — copy webbolo's workflows and
      rename - 0.1.8 [Haiku]

## Phase 2: Data Model & Content Packs

Version 0.2 — goal: the database and the content-pack system that lets a
group load their own game content. Read `docs/DATA-MODEL.md` and
`docs/LICENSING.md` before every task in this phase.

- [x] zod schemas in `shared/` for all core entities: ContentPack,
      PlaybookDef, MoveDef, GearDef, MonsterTypeDef, Campaign, Character,
      Mystery, Monster, Minion, Bystander, Location, Countdown,
      SessionLog - 0.2.1 [Fable]
- [x] SQLite migrations for the sync-envelope table design in
      `docs/SYNC.md` (entities stored as JSON payloads with rev/seq
      columns, not one table per entity) - 0.2.2 [Opus]
- [x] Content pack CRUD API: upload/validate/list/delete a JSON pack;
      zod-validate and reject with line-precise errors - 0.2.3 [Sonnet]
- [x] Content pack editor UI: create a pack in-app (define a playbook:
      name, ratings lines, Luck/Harm layout, move list with trigger +
      outcome text fields, gear options) - 0.2.4 [Sonnet]
- [x] Pack import/export as `.mowcpack.json` file download/upload -
      0.2.5 [Sonnet]
- [x] Example pack `content-packs/example-pack.mowcpack.json` using ONLY
      invented placeholder content, used by tests as fixture -
      0.2.6 [Haiku]

## Phase 3: Accounts & Campaigns ✅

Version 0.3

- [x] Auth: register/login/logout, Argon2 hashes, session cookie,
      rate-limited (copy tangible's hardening pattern: security headers,
      origin CSRF check that allows missing Origin) - 0.3.1 [Sonnet]
- [x] Campaign CRUD: a campaign has one Keeper (owner), settings, and an
      active content-pack set - 0.3.2 [Sonnet]
- [x] Invite codes: Keeper generates a short-lived code; a player joining
      with it gets a hunter seat in the campaign - 0.3.3 [Sonnet]
- [x] Roles and visibility rules: Keeper sees everything; hunters see own
      character + what the Keeper shares - 0.3.4 [Opus]
      (Design the check once, in one server-side module, and route every
      read through it. This rule set is the backbone of Phases 5-6.)

## Phase 4: Character Builder & Sheet ✅

Version 0.4 — the flagship player feature. Read `docs/DESIGN.md`; compare
against D&D Beyond's builder flow described there.

- [x] Sync foundation: this phase is the first to touch campaign entities,
      so the local-first write path required by AGENTS.md rule 2 must land
      before anything can persist a Character. Client: Dexie schema
      (`entities`, `oplog`, `syncState` per `docs/SYNC.md`) and a generic
      local-write helper (write to `entities` + append `oplog`, UI never
      waits on network). Server: minimal `entities` repo plus
      `POST /sync/:campaignId` (push, LWW by `updatedAt` with
      per-field merge for `character` payloads, idempotent by `opId`) and
      `GET /sync/:campaignId?since=seq` (pull, filtered through the
      existing `canView`/`canEdit` authz module), covering just the
      `character` entity type. Phase 7 hardens this (conflict edge cases,
      backoff, multi-device torture test, sync status UI) - it does not
      build it from scratch - 0.4.1 [Opus]
- [x] Auth + campaign shell: Phase 3 shipped register/login/logout,
      campaign CRUD, and invite codes as server-only APIs with no client
      UI at all. Nothing in this phase is reachable in a browser without
      it. Login/register forms, session-aware layout (redirect to login
      when logged out), a "my campaigns" list, create-campaign form,
      invite-code redemption screen, and a simple active-campaign
      selection (persisted client-side, e.g. a store or route param) that
      the rest of Phase 4 reads to know which `campaignId` to write into
      - 0.4.2 [Sonnet]
- [x] Builder wizard: pick playbook (from loaded packs), choose ratings
      line, looks, moves, gear per the playbook definition; guided
      step-by-step with progress indicator; creates the Character through
      the local-first write path from 0.4.1, scoped to the active campaign
      from 0.4.2 - 0.4.3 [Sonnet]
- [x] Character sheet screen: ratings, Luck track, Harm track (with
      "unstable" marker at the pack-defined threshold), moves with
      expandable text, gear, notes; mobile-first layout - 0.4.4 [Sonnet]
- [x] Live edits: tap to mark Harm/Luck/experience; all writes go through
      the offline mutation queue (`docs/SYNC.md`) - 0.4.5 [Opus]
- [x] Level up: experience threshold triggers improvement picker from the
      playbook's improvement list; advanced improvements gated the same
      way - 0.4.6 [Sonnet]
- [x] Dice: 2d6+rating roller on every move; result banner shows the
      move's 10+/7-9/miss outcome text from the pack; roll history in the
      session log - 0.4.7 [Sonnet]

## Phase 5: Keeper Tools

Version 0.5 — mystery/monster/world builders. Roll20 comparison notes in
`docs/DESIGN.md`.

- [ ] Mystery builder: concept, hook, countdown (editable named steps),
      locations, cast - 0.5.1 [Sonnet]
- [ ] Monster builder: type/motivation (from pack), powers, weaknesses,
      attacks (harm/tags), armor, harm capacity, custom moves -
      0.5.2 [Sonnet]
- [ ] Minion & bystander builders (same pattern, smaller forms) -
      0.5.3 [Haiku]
- [ ] Keeper campaign dashboard: arc notes, mystery list with status,
      session prep view - 0.5.4 [Sonnet]
- [ ] Share controls: per-entity "revealed to players" toggle wired
      through the Phase 3 visibility module - 0.5.5 [Sonnet]

## Phase 6: Live Table Play

Version 0.6

- [ ] SSE stream per campaign (`GET /campaigns/:id/events`, tangible
      pattern): character changes, rolls, Keeper reveals push live to
      connected clients - 0.6.1 [Opus]
- [ ] Session mode: Keeper runs a mystery; countdown advance, harm dealt,
      Luck spent all broadcast; players see reveals appear - 0.6.2 [Opus]
- [ ] Session log: timestamped feed of rolls/changes/reveals, exportable
      as markdown - 0.6.3 [Sonnet]
- [ ] Keeper screen: at-a-glance party status (Harm, Luck, conditions) -
      0.6.4 [Sonnet]

## Phase 7: Offline Sync Hardening

Version 0.7 — the local-first queue from Phase 4 becomes full multi-device
sync. `docs/SYNC.md` is the spec; update it in the same PR as any protocol
change.

- [ ] Server sync endpoints: `GET /sync/:campaign?since=seq` and
      `POST /sync/:campaign` (push mutations, LWW conflict resolution,
      tombstones) - 0.7.1 [Opus]
- [ ] Client sync engine: Dexie oplog, background sync on reconnect,
      exponential backoff, conflict toast when a local write loses -
      0.7.2 [Opus]
- [ ] Multi-device torture test: scripted vitest scenario with two
      simulated clients diverging offline and converging - 0.7.3 [Opus]
- [ ] Sync status UI: online/offline badge, pending-changes count, manual
      sync button - 0.7.4 [Haiku]

## Phase 8: Theming & Customization

Version 0.8

- [ ] Theme engine: user-editable accent color, surface tint, border
      style/radius, font pairing; stored per user, applied via CSS custom
      properties - 0.8.1 [Sonnet]
- [ ] Preset themes (at least: default dark "midnight case file", light
      "field notes", high-contrast) - 0.8.2 [Haiku]
- [ ] Per-campaign Keeper theme override (table mood) - 0.8.3 [Sonnet]
- [ ] Accessibility pass: contrast validation on custom colors, focus
      states, reduced motion - 0.8.4 [Sonnet]

## Phase 9: Import, Export & Interop

Version 0.9

- [ ] Full campaign export/import (JSON, includes packs, characters,
      mysteries) for backup and migration - 0.9.1 [Sonnet]
- [ ] Character sheet print/PDF stylesheet - 0.9.2 [Sonnet]
- [ ] Form-fillable PDF import assist: parse AcroForm field values from a
      user's filled official playbook PDF into a character (fields only,
      never bundled text) - 0.9.3 [Opus]
- [ ] Obsidian/markdown export of mysteries and session logs - 0.9.4 [Haiku]
- [x] Admin PDF-to-content-pack conversion: schema/security/endpoint
      contract design ADR (upload limits, admin gating, `conversionNotes`
      contract, one-PDF-to-many-draft-packs shape) - 0.9.5 [Fable]
      Done: `docs/adr/0001-admin-pdf-to-pack-conversion.md` (accepted).
      Distinct from 9.3 (that's AcroForm character-field import from a
      filled PDF; this is full-text extraction of a rulebook/playbook PDF
      into a draft ContentPack). Never bundle extracted text into the repo
      or a Docker image (AGENTS.md rule 1) — this only ever runs at
      runtime against an admin-uploaded file, output stays in
      `$MOWC_DATA_DIR`/the DB like any other pack.
- [x] Conversion parser engine: poppler `pdftotext -layout` extraction,
      playbook-boundary detection across a consolidated PDF, best-effort
      structural splitting (moves, gear, improvements, extras) - 0.9.6
      [Opus]. Conservative by design: flag anything uncertain into
      `conversionNotes` with the raw source text attached rather than
      guess. A prior manual conversion session hit a real boundary-
      detection bug (non-colon-terminated bullets bled unrelated gear-list
      text into a move's trigger) — the parser must default to flagging,
      not silently misplacing text.
      Done: `POST /api/admin/conversions` (server/src/api/conversion/*).
      Column reflow + ratings-anchored playbook split + confident move
      extraction (name/trigger/rating from the roll pattern); outcomes,
      gear, improvements, extras, and invented defaults are flagged with
      source, never guessed. Regression covered by test. Move-outcome and
      playbook-name recall on consolidated sheets is intentionally
      best-effort, resolved by the 0.9.7 review UI.
- [x] Convert UI: admin-only upload flow on `/packs`, review screen
      extending the existing pack editor (Phase 2.4) to surface
      `conversionNotes` inline against the fields they reference before
      the admin saves - 0.9.7 [Sonnet]
      Done: `isAdmin` exposed on auth responses to gate the button;
      `/packs/convert` review screen with per-draft save/discard, reusing
      `PlaybookEditor`/`MovesEditor` with a new optional `notes` prop path
      and the "Conversion flags" callout (docs/DESIGN.md) to surface each
      note next to its field. `hunterAgenda`/`keeperAgenda` on reference
      drafts are read-only (no editor exists for them anywhere yet, a
      deliberate scope cut). Result lives in client memory only, never
      persisted, matching the endpoint's stateless design.

## Phase 10: Polish & 1.0

Version 0.10 → 1.0

- [x] Playwright e2e suite covering: create campaign, build character,
      run session offline, sync - 0.10.1 [Opus]
- [x] User guide + Keeper guide in `docs/` - 0.10.2 [Haiku]
- [x] Security review of auth, sync, and upload paths - 0.10.3 [Fable]
- [ ] Performance pass on large campaigns (hundreds of entities) -
      0.10.4 [Opus]
- [ ] 1.0.0 release - [Sonnet]
