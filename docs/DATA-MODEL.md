# MOWC Data Model

Two kinds of data with different lifecycles:

1. **Content pack definitions** (`*Def`): the rules material a group loads.
   Read-mostly, versioned as a unit, owned by whoever authored the pack.
2. **Campaign entities**: what a group creates during play. Mutable,
   synced per docs/SYNC.md, owned by a campaign.

All shapes are zod schemas in `shared/`. This document describes them;
the schemas are the source of truth once Phase 2 lands.

## Content pack

A `.mowcpack.json` file. Everything a table needs to play that MOWC cannot
ship itself (see docs/LICENSING.md).

```
ContentPack {
  id: uuid
  name, author, version: string
  $format: "mowc-content-pack/v1"    // optional file-format tag
  license: string                    // optional; source/usage terms verbatim
  conversionNotes: string[]          // transcriber flags for anything it
                                     // couldn't confidently transcribe
                                     // ("flag, never guess"); also the
                                     // channel for the planned PDF
                                     // auto-conversion to report gaps.
                                     // Note grammar (field-path prefix +
                                     // optional source excerpt):
                                     // docs/adr/0001-admin-pdf-to-pack-conversion.md
  playbooks: PlaybookDef[]
  basicMoves: MoveDef[]              // moves shared by all hunters
  monsterTypes / bystanderTypes / minionTypes / locationTypes:
    ArchetypeDef[]                   // {id, name, motivation} - all four
                                     // categories use "motivation" as the
                                     // semantic concept
  gear: GearDef[]

  // Optional reference content (hunter/Keeper sheets). Metadata, not
  // gameplay-critical; a playbook-only pack has none of it.
  hunterAgenda: string[]
  coreRules { roll, recovery, levelingUp, endOfSession: string,
              harm: {max, unstableAt, text}, luck: {max, text} }
  keeperAgenda / keeperPrinciples / alwaysSay: string[]
  keeperMoves { basic/monster/minion/bystander/location: string[],
                harm: { note, tiers: [{label, effects[]}] } }
                                     // tiers keep the book's presentational
                                     // bucket labels ("0-harm or more") as
                                     // ordered data, not object keys
  mysteryCreation { steps: [{step, prompts[], countdownSteps?}] }
  monsterGuidance / minionGuidance / bystanderGuidance /
    locationGuidance / customMoveGuidance: string
}

PlaybookDef {
  id, name, blurb
  ratingsLines: RatingsLine[]    // e.g. [{charm:+1, cool:+1, sharp:+2, tough:0, weird:-1}, ...]
  luckMax: int (default 7)
  harmTrack: { max: int (7), unstableAt: int (4) }
  looks: string[][]              // suggestion lists
  moves: MoveDef[]               // playbook moves; count to pick at creation
  movesToPick: int
  gearChoices: GearChoice[]
  improvements: ImprovementDef[]
  advancedImprovements: ImprovementDef[]
  extras: ExtraDef[]             // playbook-specific widgets: magic, haven,
                                 // mystic library, etc. Rendered generically
                                 // as titled checklists/counters/text blocks,
                                 // plus "composite" (fate, breed, background):
                                 // intro text + ordered sections, each a
                                 // pick-list ({pick: int|string, options[]},
                                 // string pick for prose rules like "2+") or
                                 // a free-text prompt; optional suggestions[]
                                 // (e.g. example breed builds).
}

MoveDef {
  id, name
  trigger: string                // "When you ..."
  rating: charm|cool|sharp|tough|weird|null   // null = no roll
  outcomes: { full: string, mixed: string, miss: string } | null
  tags: string[]
}

GearDef { id, name, harm: int|null, armor: int|null, tags: string[] }
ImprovementDef { id, text, effect: RatingBump|AddMove|Custom }
```

Core rules constants the ENGINE does own (mechanics, not expression, and
configurable per pack anyway): 2d6 + rating, 10+ full success, 7-9 mixed,
miss on 6 or less, mark experience on a miss, 5 experience = improvement.

## Accounts

```
User { id, email, displayName }
```

The public-safe shape only; `password_hash` and session tokens never leave
the server (docs/SECURITY.md section 2). Stored in the conventional `users`
table, one row per account, `email` unique and lowercased.

## Campaign entities

```
Campaign  { id, name, keeperUserId, packIds[], settings, theme }
Seat      { campaignId, userId, role: keeper|hunter }
Invite    { id, campaignId, createdAt, expiresAt, revoked: bool }
            -- the raw redemption code is never stored (docs/SECURITY.md
            -- section 2); only its hash. Shown to the Keeper once, at
            -- creation. Multi-use until expiry or revocation.
Character { id, campaignId, ownerUserId, playbookId, name, look,
            ratings {charm,cool,sharp,tough,weird},
            luckSpent, harm, unstable, experience,
            moves[ids], improvements[ids], gear[], extrasState, notes }
            -- campaignId is nullable: null = a standalone character that
            -- belongs to no campaign (a player whose Keeper runs from paper,
            -- or someone trying the app solo). Standalone rows sync under an
            -- owner-bucketed scope rather than a campaign (docs/SYNC.md
            -- "Standalone characters"). Only Character may be standalone; the
            -- Keeper-owned entities below are always campaign-scoped.
            -- A character MOVES between buckets via migration (it never
            -- lives in two): the source id tombstones and a fresh id is
            -- created in the destination bucket, in one transaction,
            -- carrying every field but id and campaignId (docs/SYNC.md
            -- "Character migration", docs/adr/0002-character-migration.md).
Mystery   { id, campaignId, title, concept, hook, status,
            countdown: { steps: [{label, text, done}] },
            locationIds[], monsterIds[], minionIds[], bystanderIds[],
            keeperNotes, revealed: bool }
Monster   { id, campaignId, name, typeId, motivation, powers[],
            weaknesses[], attacks[{name,harm,tags}], armor,
            harmCapacity, harmTaken, customMoves[], revealed }
Minion / Bystander: same pattern, fewer fields
Location  { id, campaignId, name, typeId, description, mapNotes, revealed }
            -- typeId is nullable, defaulting to null, so existing rows and
            -- already-queued sync ops stay valid; when set, it references a
            -- pack's locationTypes archetype, same as Monster/Minion/
            -- Bystander's typeId referencing their own pack-sourced types.
SessionLog{ id, campaignId, entries: [{ts, userId, kind, payload}] }
            kind: roll|harm|luck|reveal|countdown|note
```

`revealed` on Keeper entities is the single visibility flag hunters' reads
are filtered by (Phase 3.4 module).

## Storage (SQLite)

One uniform table for synced campaign entities:

```
entities(
  id TEXT PRIMARY KEY,          -- uuidv7
  campaign_id TEXT NOT NULL,
  type TEXT NOT NULL,           -- 'character' | 'mystery' | ...
  payload TEXT NOT NULL,        -- JSON, validated by the shared zod schema
  rev INTEGER NOT NULL,         -- client lamport counter (docs/SYNC.md)
  seq INTEGER NOT NULL,         -- server-assigned, monotonic per campaign
  updated_at TEXT NOT NULL,     -- ISO 8601 UTC
  updated_by TEXT NOT NULL,     -- user id
  deleted INTEGER DEFAULT 0     -- tombstone
)
-- indexes: (campaign_id, seq), (campaign_id, type)
```

Non-synced tables are conventional: `users`, `sessions`, `campaigns`,
`seats`, `invites`, `content_packs`, `schema_migrations`.

Character migration (docs/adr/0002-character-migration.md) adds one small
idempotency table, keyed by a client-generated migration id so a replayed
move is a no-op that returns the same destination id:

```
migrations(
  migration_id TEXT PRIMARY KEY,   -- client idempotency key
  source_id TEXT NOT NULL,         -- retired id, tombstoned in source bucket
  new_id TEXT NOT NULL,            -- fresh id created in destination bucket
  source_bucket TEXT NOT NULL,     -- entities.campaign_id of the source
  dest_bucket TEXT NOT NULL,       -- entities.campaign_id of the destination
  requested_by TEXT NOT NULL,      -- owner user id
  created_at TEXT NOT NULL
)
-- Never pruned (one row per lifetime move; a late retry must still
-- short-circuit). Unlike applied_ops, which is pruned after 30 days.
```

Keeper-approved pack transfer on migration
(docs/adr/0003-pack-transfer-approval.md) adds one more small table, for
the case where a migration's destination lacks the character's playbook
pack: the move is **held** as a pending request, carrying a copy of the
source pack, until the destination Keeper approves or denies it. This
table is deliberately **not** part of the synced `entities` envelope (it
is read and written only through plain online REST calls, matching
ADR 0002's own migrate endpoint and AGENTS.md rule 2's Keeper-admin
carve-out); see docs/SYNC.md "Migration requiring Keeper-approved pack
transfer" for the full flow.

```
migration_requests(
  migration_id TEXT PRIMARY KEY,     -- client idempotency key (uuid); reused,
                                      -- unchanged, as the migrations table's
                                      -- own PRIMARY KEY once approved
  source_id TEXT NOT NULL,           -- the character id, unchanged while pending
  source_bucket TEXT NOT NULL,       -- source envelope bucket at request time
  destination_campaign_id TEXT NOT NULL,  -- always a real campaign; standalone
                                           -- destinations never need approval
  requested_by TEXT NOT NULL,        -- owner user id (== character's ownerUserId)
  pack_id TEXT NOT NULL,             -- id of the carried ContentPack, as authored
  pack_payload TEXT NOT NULL,        -- the full copied ContentPack JSON
  status TEXT NOT NULL DEFAULT 'pending',  -- pending | approved | denied | expired
  created_at TEXT NOT NULL,
  decided_at TEXT,                   -- set on approve/deny/cancel
  decided_by TEXT                    -- Keeper (or the owner, on cancel) user id
)
-- At most one 'pending' row per source_id (partial unique index): a
-- character can only ever be waiting on one Keeper decision at a time.
-- Never pruned, same reasoning as `migrations`; a stale pending row is
-- retired by a lazy 72h expiry sweep (docs/SYNC.md), not deletion.
```

On approval, the request's carried pack is created (or, if the
destination Keeper already owns/can read a pack with the same id,
deduped onto the existing one) in the ordinary `content_packs` table and
attached to the destination `Campaign.packIds`, and the character
migration itself runs through the same `migrations`-table-backed
transaction described above; nothing about `migrations` or `entities`
changes shape for this flow.

Never add a synced entity as its own table; extend the envelope.
