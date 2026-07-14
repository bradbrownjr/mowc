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
  playbooks: PlaybookDef[]
  basicMoves: MoveDef[]          // moves shared by all hunters
  monsterTypes: MonsterTypeDef[] // e.g. motivation archetypes
  bystanderTypes / minionTypes: NamedDef[]
  gear: GearDef[]
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
                                 // as titled checklists/counters/text blocks.
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
Character { id, campaignId, ownerUserId, playbookId, name, look,
            ratings {charm,cool,sharp,tough,weird},
            luckSpent, harm, unstable, experience,
            moves[ids], improvements[ids], gear[], extrasState, notes }
Mystery   { id, campaignId, title, concept, hook, status,
            countdown: { steps: [{label, text, done}] },
            locationIds[], monsterIds[], minionIds[], bystanderIds[],
            keeperNotes, revealed: bool }
Monster   { id, campaignId, name, typeId, motivation, powers[],
            weaknesses[], attacks[{name,harm,tags}], armor,
            harmCapacity, harmTaken, customMoves[], revealed }
Minion / Bystander: same pattern, fewer fields
Location  { id, campaignId, name, description, mapNotes, revealed }
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

Never add a synced entity as its own table; extend the envelope.
