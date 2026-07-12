# MOWC (Monster of the Week Companion)

An unofficial, self-hosted web companion for the tabletop RPG
[Monster of the Week](https://evilhat.com/product/monster-of-the-week/)
by Michael Sands, published by Evil Hat Productions.

There is no official app for Monster of the Week. Groups today juggle PDFs,
Google Sheets, and Obsidian vaults. MOWC replaces that with one installable,
offline-capable web app for both hunters (players) and the Keeper (GM):

- **Hunter tools**: create characters from playbooks, track ratings, Luck,
  Harm, experience, gear, moves, and improvements on a live character sheet.
- **Keeper tools**: build mysteries (hooks, countdowns, locations), monsters,
  minions, and bystanders; run sessions; manage the campaign arc; share
  exactly what the table should see.
- **Table play**: 2d6+rating rolls with move outcomes, session log, and
  real-time updates between Keeper and hunters.
- **Offline-first**: works with no connection (PWA with local storage) and
  syncs when back online. Runs on phones (iOS and Android), tablets, and
  laptops.
- **Themable**: users pick their own colors, borders, and look. Default
  design is documented in `docs/DESIGN.md`.

## Important: game content licensing

Monster of the Week is **not** open source. The rules text, playbooks, and
published mysteries are copyright Michael Sands / Evil Hat Productions, even
though the playbook PDFs are free downloads.

MOWC therefore ships only the **engine**: schemas, sheet layouts, dice, sync,
and builders. Game content (playbook text, move text, monster write-ups)
lives in **content packs**, JSON files that each group creates or imports
locally from books and PDFs they own. This repository and its Docker images
must never bundle Evil Hat's text. Details and rationale: `docs/LICENSING.md`.

## Status

Pre-alpha. Foundation documents are in place; the application scaffold is
Phase 1 on the [ROADMAP](ROADMAP.md).

## Stack (planned)

- TypeScript end to end, Node 20+
- Client: SvelteKit (static adapter) PWA, Dexie (IndexedDB) for offline data
- Server: Express + better-sqlite3, zod-validated API
- Shared: zod schemas used by both client and server
- Docker multi-arch image (amd64 + arm64) via GitHub Actions to GHCR

## Documentation

| Document | Purpose |
|---|---|
| [AGENTS.md](AGENTS.md) | Rules of engagement for AI assistants and contributors |
| [ROADMAP.md](ROADMAP.md) | Phased plan with per-task model recommendations |
| [CHANGELOG.md](CHANGELOG.md) | Timestamped user-facing release notes |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | System design, stack decisions, project layout |
| [docs/DATA-MODEL.md](docs/DATA-MODEL.md) | Entities, content pack schema, database tables |
| [docs/SYNC.md](docs/SYNC.md) | Offline-first sync protocol |
| [docs/DESIGN.md](docs/DESIGN.md) | UI/UX contract: tokens, theming, layout patterns |
| [docs/LICENSING.md](docs/LICENSING.md) | What may and may not ship in this repo |

## Legal

MOWC is an independent production and is not affiliated with Evil Hat
Productions, LLC. Monster of the Week is a trademark of Evil Hat
Productions, LLC. Application code is MIT licensed (see LICENSE).
