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

## Phase 5: Keeper Tools ✅

Version 0.5 — mystery/monster/world builders. Roll20 comparison notes in
`docs/DESIGN.md`.

> **Implementation staging (complete).** Full orchestration plan,
> file-level details, and rationale live in the "Phase 5 orchestration"
> memory (project memory system) and were originally drafted in a Claude
> Code plan-mode session; this block is the durable summary so the work
> survives a context reset. Dependency order (each stage = its own
> build-test-check-commit cycle per AGENTS.md, not a batch):
>
> | Stage | Scope | Model | Status | Depends on |
> |---|---|---|---|---|
> | 0 | Sync/authz generalization (not its own ROADMAP line — prerequisite infra: extend `SyncEntityTypeSchema` beyond `character`, make `server/src/entities/router.ts` validate/authorize per-type instead of hard-coded `CharacterSchema`, thread `revealed` into pull-side `accessCtx`, rename `mergeCharacterPatch`→`mergePatch`) | Opus | done (950c795) | — |
> | 1a | Monster builder (0.5.2) | Sonnet | done (2716380, merged 856ad2a) | Stage 0 |
> | 1b | Minion/Bystander/Location builders (0.5.3, Location folded in — not its own ROADMAP line, needed by 0.5.1's `locationIds`) | Haiku | done (8685673, 4e73545) | Stage 0 |
> | 2 | Mystery builder (0.5.1) | Sonnet | done (cc93ddd) | Stage 1a, 1b |
> | 3 | Keeper campaign dashboard (0.5.4) | Sonnet | done (9ce22ca) | Stage 2 |
> | 4 | Share/reveal controls (0.5.5) | Sonnet | done (a6cfba0) | Stage 3 |
>
> All Phase 5 stages complete; the header above is marked ✅ per the
> user's explicit sign-off (AGENTS.md's Phase Completion Guardrail).
>
> Key findings from research that shaped this order: the zod schemas for
> Mystery/Monster/Minion/Bystander/Location already existed from Phase 2
> (`shared/src/schemas/mystery.ts`, `shared/src/schemas/world.ts`, each
> with a `revealed` field and no `ownerUserId`), and `server/src/authz/
> index.ts`'s `canView`/`canEdit` were already shape-driven and needed no
> changes — but `server/src/entities/router.ts` was still hard-coded to
> Character only, so `docs/SYNC.md` invariant 4 ("a hunter's pull never
> contains an unrevealed entity") was untested/unenforced for any other
> type. Stage 0 closes that gap before any Phase 5 UI is built on top of
> it. Update this table's Status column as each stage lands; do not check
> off a 0.5.x box below until its stage's commit is green end to end.

- [x] Mystery builder: concept, hook, countdown (editable named steps),
      locations, cast - 0.5.1 [Sonnet]
- [x] Monster builder: type/motivation (from pack), powers, weaknesses,
      attacks (harm/tags), armor, harm capacity, custom moves -
      0.5.2 [Sonnet]
- [x] Minion & bystander builders (same pattern, smaller forms) -
      0.5.3 [Haiku]
      Location builder folded in too (not its own ROADMAP line, needed
      by 0.5.1's `locationIds`).
- [x] Keeper campaign dashboard: arc notes, mystery list with status,
      session prep view - 0.5.4 [Sonnet]
- [x] Share controls: per-entity "revealed to players" toggle wired
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
- [x] Performance pass on large campaigns (hundreds of entities) -
      0.10.4 [Opus]
- [ ] 1.0.0 release - [Sonnet]

## Phase 11: UI/UX Overhaul ✅

Version 0.11. Runs before Phases 6-9 by explicit user choice (2026-07-16),
consistent with the 0.10.5 precedent: the version line increments off the
highest existing tag, so this ships as 0.11.x. There are no users yet, so
breaking visual changes are fine.

Goal: the app currently renders every screen as one narrow, left-pinned
column with no desktop layout, no mobile nav, and no onboarding. This
phase makes it look deliberate on a phone (portrait and landscape), a
tablet, and a laptop, and makes it usable by people who have never played
Monster of the Week or run a campaign before. References: D&D Beyond's
character builder (guided steps), Roll20 (table/detail split), Pathbuilder
(mobile-first sheet density).

> **Survey findings (2026-07-16, screenshots at 390x844, 844x390,
> 1024x768, 1440x900 against v0.10.7).** Each milestone below cites the
> findings it fixes.
>
> 1. Every route sets its own ad-hoc `max-width` (24-48rem) with no
>    centering and no shared container; on desktop and tablet, two thirds
>    of the screen is empty and everything hugs the left edge.
> 2. None of the DESIGN.md layout structures exist: no bottom tab bar on
>    mobile, no desktop context rail, no sticky ratings row on the sheet,
>    no two-column use anywhere except the dashboard's two panes.
> 3. The campaign screen stacks eight sections in arbitrary order
>    (Characters, Mysteries, Monsters, Content Packs, Invites, Minions,
>    Bystanders, Locations), mixing player content with Keeper admin. The
>    pack attach list (one row per uploaded pack, three lines of Courier
>    caps each) dominates the middle of the page and forces a very long
>    scroll on every visit.
> 4. The top nav wraps onto multiple lines on phones; the log-out label
>    embeds the display name and overflows.
> 5. There is no onboarding at all: the landing page is a title and two
>    buttons; jargon (Keeper, hunter, playbook, ratings line, moves) is
>    never explained; empty states are dead ends ("No mysteries yet.").
> 6. Track boxes orphan-wrap (6+1) at 390px and are nearly invisible in
>    the dark theme; several DESIGN.md motifs (film grain, stamps, torn
>    slip) are missing or half-implemented; `packs/[id]` still has inline
>    tag styles predating EvidenceTag.

Rules for every milestone: strict order, one build-test-check-commit
cycle each, Playwright e2e stays green (update selectors in the same
commit that moves markup), Feature Registry rows for every touched file
verified before commit, and before/after screenshots at the four survey
viewports are part of the milestone's Definition of Done.

- [x] Design contract expansion - 0.11.1 [Fable]
      Docs-only, everything below depends on it. Rewrite the DESIGN.md
      "Layout" section into a real spec: breakpoints (<768, 768-1023,
      >=1024), a shared centered page container with per-tier max widths
      and gutters (fixes finding 1), the app shell (folder-tab top nav
      plus campaign context rail on desktop, bottom tab bar on mobile,
      compact account menu; findings 2, 4), the character sheet's
      two-column desktop grid and sticky mobile ratings row, a
      guidance-copy pattern (short "field note" helper text on forms), an
      empty-state pattern (what this thing is, why you want one, a single
      CTA), and a plain-language policy: every game term gets a
      parenthetical gloss on first use per screen, e.g. "Keeper (the
      person running the game)". All copy patterns use original wording,
      never Evil Hat text (AGENTS.md rule 1).
- [x] App shell and layout scaffold - 0.11.2 [Opus]
      Implement 0.11.1 across every route: shared container class in
      `styles.css`, responsive nav shell in `+layout.svelte` (desktop
      folder tabs + campaign context rail, mobile bottom tab bar, account
      menu replacing the overflowing log-out label), and adopt the
      container in all routes, deleting the per-route `max-width` rules.
      Cross-cutting and mechanical-but-wide; fixes findings 1, 2, 4.
- [x] Campaign hub restructure - 0.11.3 [Sonnet]
      Fixes finding 3. Role-aware campaign overview: a hunter lands on
      their character (or the builder CTA) plus revealed world entities;
      the Keeper lands on prep (mysteries, party, recent entities).
      Entity types move into the 0.11.2 context rail instead of eight
      stacked panels. Pack attach and invite codes move to a Keeper-only
      campaign settings screen (online-only is fine, AGENTS.md rule 2).
      Add a Keeper first-run checklist (attach packs, invite players,
      create first mystery) that disappears once done.
- [x] Character sheet play layout - 0.11.4 [Sonnet]
      Fixes findings 2 and 6 on the flagship screen. Two-column desktop
      grid (identity/ratings/tracks left, moves/gear/notes right), sticky
      ratings row under the header on mobile per DESIGN.md, track boxes
      sized so a 7-box track never orphan-wraps at 390px, dark-theme
      track/border contrast pass, move outcomes readable without hunting
      (open the rolled move's outcomes by default). All existing sheet
      behaviors in the Feature Registry must survive.
- [x] Builder guidance pass - 0.11.5 [Sonnet]
      Fixes finding 5 inside the wizards. StepIndicator grows into the
      DESIGN.md progress rail (labels, done/current/locked states).
      Every step of the character, monster, and mystery wizards and the
      minion/bystander/location forms gets one short field-note helper
      line in plain language (original text). A disabled Next says why
      ("Pick 2 more moves"). The review step renders a compact preview of
      the sheet being created, not just a list.
- [x] Onboarding and plain language - 0.11.6 [Sonnet]
      Fixes finding 5 everywhere else. Landing page becomes two role
      paths: "I'm running the game" (create a campaign, what a Keeper
      does, where content packs come from) and "I'm joining a game"
      (redeem an invite code front and center, then build a hunter).
      Apply the 0.11.1 glossary policy across all screens. Rewrite every
      empty state to teach and point at one action. The word "Keeper"
      never appears without a gloss reachable on the same screen.
- [x] Motif and theme polish - 0.11.7 [Sonnet]
      Fixes finding 6. Film-grain page background, stamp styling for
      status markers (REVEALED, UNSTABLE, SOLVED), folder-tab nav styled
      per the motif, migrate `packs/[id]` inline tags to EvidenceTag,
      pack list cards show a content summary (N playbooks, N moves)
      instead of the Courier blurb wall, and a visible theme toggle
      (Midnight Unit / Field Notes / follow system) since both themes
      already ship in `styles.css`. Full Phase 8 user theming stays where
      it is; this is only the toggle.
- [x] Responsive regression audit - 0.11.8 [Sonnet]
      Scripted Playwright screenshot sweep of every key screen at the
      four survey viewports in both themes, fix what it catches, verify
      WCAG AA contrast in both themes (DESIGN.md accessibility section),
      and confirm the e2e suite is green. This is the phase's exit gate;
      do not mark the phase complete without it.

## Phase 12: Keeper Guidance

Version 0.12. The Keeper reference pack (transcribed 2026-07 from the
free Keeper Reference Sheets) already carries agenda, principles, keeper
move lists, a 4-step mystery creation process with prompts, and location
types with motivations, all validating against `ContentPackSchema`, but
none of it has a UI: the mystery wizard never shows the creation prompts,
the location builder has no type picker (unlike monster/minion/bystander),
and there is no screen where a Keeper can read their agenda or moves
during play. This phase wires that dormant pack data into the app. All
guidance text renders at runtime from the user-supplied pack, never from
repo-bundled strings (AGENTS.md rule 1); UI chrome copy stays original
wording per the 0.11.1 plain-language policy.

- [ ] Mystery wizard guidance: render the attached packs' `mysteryCreation`
      steps and prompts inside the mystery builder as per-step guidance
      (FieldNote pattern, collapsible if long), so a new Keeper is walked
      through concept/hook/countdown with the source's own prompts -
      0.12.1 [Sonnet]
- [ ] Location type picker: add a nullable `typeId` to `LocationSchema`
      (shared schema; optional with null default so existing rows and
      queued sync ops stay valid), a `flattenLocationTypes(packs)` helper,
      and a type dropdown on the location form that prefills motivation,
      mirroring the monster/minion/bystander builders. Update
      `docs/DATA-MODEL.md` in the same commit - 0.12.2 [Sonnet]
- [ ] Keeper reference panel: read-only screen (rail row, Keeper-only)
      rendering agenda, principles, "always say", and the keeper move
      lists from the campaign's attached packs, for at-the-table lookup.
      Empty state teaches that this content comes from an attached Keeper
      reference pack - 0.12.3 [Sonnet]

## Phase 13: My Characters (cross-campaign and standalone)

Version 0.13. User request (2026-07-19): a top-level Characters tab where
a player finds every character they own across all campaigns, plus
standalone characters that belong to no campaign at all. Rationale: some
Keepers run from paper and books, so their players have no campaign in
the app to hang a character on, but still want a digital sheet,
especially players new to the game.

Standalone is the hard part: today `Character.campaignId` is required and
the entire sync/authz path (per-campaign pull, seat-based access, pack
readability) is campaign-scoped. Two candidate designs, decide in 0.13.1
before any UI work:

1. Nullable `campaignId` with owner-only authz. Touches
   `CharacterSchema`, the sync envelope, `server/src/entities/router.ts`
   authz, `docs/DATA-MODEL.md`, and `docs/SYNC.md`. PREFERRED (user
   decision 2026-07-19): it is the truthful domain model and has no
   leak-class failure modes; its risks are loud (schema/sync tests)
   rather than quiet.
2. An auto-provisioned hidden per-user "personal space" campaign that
   reuses every existing code path unchanged. Rejected as default: its
   simplicity is for the maintainer, not the player. It requires
   filter-this-ghost-campaign discipline in every current and future
   list/nav/pull path plus magic pack auto-attachment, and its failure
   mode is quiet user-visible leaks (a phantom campaign row, a pack
   missing only in the standalone builder), exactly the confusing bugs
   new players cannot diagnose. Only fall back to this if 0.13.1 finds
   a blocking problem with option 1, and record why.

- [x] Standalone character architecture: pick between the two designs
      above, implement the chosen one end to end (schema/sync/authz/docs
      as required), with regression tests proving campaign-scoped
      characters are untouched - 0.13.1 [Opus] (Design 1: nullable
      `campaignId`, owner-bucketed `/api/sync/standalone` scope, no DB
      migration)
- [ ] My Characters tab: global `/characters` route listing the user's
      own characters grouped by campaign plus a Standalone group, each
      linking to its sheet; "New character" CTA into the existing builder
      sourcing shared and self-owned packs; freshness via pull across
      seated campaigns on visit. Add the tab to the top-bar folder tabs
      and the global bottom bar (currently 4 global tabs; update
      DESIGN.md's layout section in the same commit) - 0.13.2 [Sonnet]
