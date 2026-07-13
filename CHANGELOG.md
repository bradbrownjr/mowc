# Changelog

All notable changes to MOWC are documented here. Format follows
[Keep a Changelog](https://keepachangelog.com/); versions follow the
`0.PHASE.BUILD` scheme described in ROADMAP.md.

## [Unreleased]

### Added
- Shared zod schemas with inferred TypeScript types for all core entities
  (content pack definitions: ContentPack, PlaybookDef, MoveDef, GearDef,
  MonsterTypeDef; campaign entities: Campaign, Seat, Character, Mystery,
  Countdown, Monster, Minion, Bystander, Location, SessionLog), exported
  from `@mowc/shared` so client and server validate the same shapes
- SQLite migration `0002_sync_envelope.sql`: the uniform `entities`
  sync-envelope table (JSON payload with per-campaign `rev`/`seq`, tombstone
  and indexes per docs/SYNC.md), the `applied_ops` idempotency table keyed
  by (campaign_id, op_id), and the non-synced `content_packs` table owned by
  the uploading user

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
