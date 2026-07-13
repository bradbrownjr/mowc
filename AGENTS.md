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

Never mark a ROADMAP phase, milestone, or item "complete" without:

1. Reading the full requirement section top-to-bottom.
2. Checking for "pending", "planned", or "deferred". If any remain, the
   phase is **not** complete.
3. Verifying each requirement: code exists, tests pass, docs match.
4. Asking the user "Ready to mark X complete?" before flipping the flag.
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

---

## Feature Registry

Compact checklist of shipped user-facing features keyed to their primary
implementation files. **Before any large refactor, verify every row
touching the affected file column is preserved.**

| Feature | Key file(s) | Key identifiers |
|---|---|---|
| _(populate as features ship)_ | | |

Update this table whenever a new feature lands or an existing feature
moves.

---

## Roadmap

The full phased plan lives in `ROADMAP.md` (includes per-task model
recommendations). Track not-yet-built ideas there, not here.
