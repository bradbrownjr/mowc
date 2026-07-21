# ADR 0002: Character migration between buckets

- Status: accepted
- Date: 2026-07-21
- Scope: ROADMAP 0.14.3. Defines the contract that 0.14.4 (migrate
  endpoint, repo transaction, and client UI) implements. No code lands
  with this ADR.

## Context

A character lives in exactly one sync bucket at a time: a campaign
(bucket = `campaignId`, role-based authz) or the owner's standalone
space (bucket = the owner's user id, owner-only authz). That single
bucket per id is a hard invariant of the sync core: `applyPushOps`
drops any op whose entity id already exists in a different bucket
(`server/src/entities/router.ts`, "an id may only live in one bucket;
never cross the boundary"), and the `seq`/`applied_ops` partitioning
depends on it.

Players still need to move a character from one table to the next,
carrying full progress forward (a hunter who finishes one Keeper's
mystery and joins another's; a solo/standalone character joining a real
campaign; a character detaching back to standalone when a campaign
winds down). The user decided (2026-07-21, ROADMAP Phase 14 header) to
support this as a **migration that MOVES the character between buckets**,
not as multi-campaign linking and not as a fully-shared single row.

Rejected alternatives (recorded in the ROADMAP header, restated here):

1. **Multi-campaign linking** (one character projected into several
   campaigns): needs a projection/membership model and breaks the
   single-bucket invariant this design is built to preserve.
2. **Fully-shared single row** (one id readable from every campaign):
   one table's harm/luck/experience would leak into another, which is
   wrong for Monster of the Week's per-table play-state.
3. **A pure client two-scope dance** (locally delete in the source
   scope via one oplog tombstone, create in the destination scope via a
   second oplog op): two independent pushes to two buckets are not
   atomic. A crash, an offline gap, or a rejected second push between
   them would leave the character duplicated in both buckets or lost
   from both, with no server-side guarantee the invariant held in the
   window. Atomicity across two buckets exists only inside one server
   transaction, so the move must be a server operation.

Constraints this design must satisfy:

1. **Single-bucket invariant is NOT relaxed.** The id-lives-in-one-bucket
   check at `router.ts` stays exactly as written. Migration never makes
   one id exist in two buckets; it retires the old id in the source
   bucket and mints a new id in the destination bucket.
2. **Offline-first (AGENTS.md rule 2).** Migration is a deliberate,
   online, whole-character move, not a play-time field edit. Like the
   Keeper-only admin screens, it may require a live server round trip
   (it is the one operation that spans two buckets and so cannot be an
   oplog op). Ordinary play (harm, luck, moves, notes) stays fully
   offline through the existing per-bucket sync.
3. **Full progress carries.** Ratings, moves, improvements, gear, harm,
   unstable, luck (`luckSpent`), experience, notes, `extrasState`, look,
   name, playbook, and ownership all survive the move unchanged. Only
   the id and the `campaignId` field change.
4. **Source disappears from the source Keeper's mirror.** After a move,
   the old row must drop off the source campaign's roster/Party view on
   the source Keeper's device, which reads the local `entities` mirror
   populated by seq-cursor pull. A hard delete would never be seen by
   another device (pull only ever moves forward and reports rows by
   `seq`), so the source removal has to be a **tombstone with a fresh
   `seq`**, exactly like every other delete (docs/SYNC.md "Deletes").
5. **Schemas are shared (AGENTS.md rule 4).** The request and response
   shapes are new zod schemas in `shared/`, imported by client and
   server; no hand-rolled parallel shape.

## Decision

### 1. Endpoint: dedicated, owner-only, one transaction

```
POST /api/characters/:characterId/migrate
Content-Type: application/json
```

Mounted with `requireAuth`, at `/api/characters`, via a new small
`createCharacterMigrationRouter(entitiesRepo, authz)`. It is NOT a sync
route and NOT an oplog op: an oplog op targets a single bucket, and this
operation spans two. Mounting it under `/api/characters` (not
`/api/sync/...`) keeps it clearly separate from the per-bucket push/pull
core, whose invariants it must not perturb.

Request body (new `CharacterMigrateRequestSchema` in `shared/`, strict):

```
CharacterMigrateRequest {
  migrationId: uuid              // client-generated idempotency key
  destinationCampaignId: uuid | null   // null = the owner's standalone space
}
```

Response body (new `CharacterMigrateResponseSchema` in `shared/`):

```
CharacterMigrateResponse {
  newId: uuid          // fresh id of the character in the destination bucket
  sourceId: uuid       // the retired id (the :characterId that was moved)
  sourceScope: string  // client scope key of the source: a campaignId, or "standalone"
  destScope: string    // client scope key of the destination: a campaignId, or "standalone"
}
```

`sourceScope`/`destScope` are the exact strings the client uses to key
`entities`/`oplog`/`syncState` (a real campaign id, or the literal
`"standalone"`, docs/SYNC.md "Standalone characters"), so the client can
re-point local storage without recomputing them.

Status codes:

| Code | Meaning |
|---|---|
| 200 | Migrated (or a replay of an already-completed migration); body is a `CharacterMigrateResponse` |
| 400 | Body fails schema, or destination equals the source bucket (nothing to move) |
| 403 | Caller is not the character's owner, or is not seated in the destination campaign |
| 404 | No such character, or it is already a tombstone (indistinguishable from "not yours", same as sync's 404-for-non-member rule) |
| 409 | The character has moved since the caller last saw it in a way that makes the move ambiguous (see idempotency); rare, client re-syncs and retries |

### 2. Buckets, scopes, and the two-address problem

Two different notions of "which bucket" coexist and MUST NOT be
conflated:

- **Envelope bucket** = the `entities.campaign_id` column = the
  `seq`/`applied_ops` partition. For a campaign row it is the campaign
  id; for a standalone row it is the **owner's user id** (docs/SYNC.md).
- **Payload `campaignId`** = the character's own field. A real campaign
  id, or `null` for standalone.

The server resolves the source from the loaded row:

- source envelope bucket = `current.campaignId` (the envelope's column).
- source is standalone iff the character payload's `campaignId` is
  `null`; then `sourceScope = "standalone"`, else
  `sourceScope = payload.campaignId`.

The destination is resolved from `destinationCampaignId`:

- `destinationCampaignId === null` -> destination is standalone:
  dest envelope bucket = the owner's user id, forced payload
  `campaignId = null`, `destScope = "standalone"`.
- `destinationCampaignId === <uuid>` -> dest envelope bucket = that
  campaign id, forced payload `campaignId = <uuid>`,
  `destScope = <uuid>`.

Reject when the destination envelope bucket equals the source envelope
bucket (400): a character already in campaign X cannot "migrate" to X,
and a standalone character cannot migrate to its own standalone space.

### 3. Authorization: owner-only, plus a destination seat

Two checks, both required:

1. **Source: owner-only.** The caller must be the character's owner
   (`current.payload.ownerUserId === req.user.id`). A Keeper may NOT
   migrate a hunter's character out of their campaign; moving a
   character is the player's decision. (The Keeper can already remove a
   player by revoking their seat; that does not move the character.)
   Fail -> 403.
2. **Destination: a seat there (any role).** If
   `destinationCampaignId` is a campaign, the owner must already hold a
   seat in it: `authz.canReadCampaign(destinationCampaignId, userId)`
   (hunter or Keeper both qualify; this is the same "is a member" gate
   sync's pull uses, so a guessed campaign id 403s here just as it 404s
   there). If the destination is standalone, no seat check applies (it
   is the owner's own space). Fail -> 403.

`ownerUserId` is preserved unchanged on the moved row, so the owner
still passes `canEdit` in the destination and the destination Keeper
(who sees everything in their campaign) sees the migrated character
immediately. Both directions of standalone <-> campaign are allowed,
because each direction satisfies both checks (the owner always owns
their standalone space, and joining a campaign already requires a seat
via the invite flow).

### 4. The transaction: tombstone source, create fresh in destination

The whole move is one `db.transaction` (better-sqlite3, synchronous and
atomic), so a reader can never observe the character in zero buckets or
two:

1. **Tombstone the source row** in the source envelope bucket: commit
   `deleted = 1` for `sourceId`, assigning the **next source-bucket
   `seq`** and bumping `rev`, exactly like `deleteEntity`'s tombstone.
   This is what makes the character disappear from the source Keeper's
   (and every source-bucket device's) roster on their next pull.
2. **Create a fresh row** in the destination envelope bucket: a **new
   uuid** (`newId`), the full carried payload with `id = newId` and
   `campaignId` forced to the destination's payload value (`null` or the
   dest campaign id), assigned the **next destination-bucket `seq`** and
   `rev = 1`. Every other field is copied verbatim from the source
   payload: `ownerUserId`, `playbookId`, `name`, `look`, `ratings`,
   `luckSpent`, `harm`, `unstable`, `experience`, `moves`,
   `improvements`, `gear`, `extrasState`, `notes`. The merged row is
   validated against `CharacterSchema.strict()` before it is stored (a
   system-boundary parse, same as every sync write); a payload that does
   not validate aborts the whole transaction.
3. **Record the migration** (idempotency, section 5) in the same
   transaction.

If any step throws, the transaction rolls back and nothing changed: the
character stays whole in its source bucket and the client can retry.

Why a **fresh id** rather than reusing `sourceId` in the destination:
reusing the id would momentarily (and, given offline devices, durably)
put the same id in two buckets, which is precisely what the
`router.ts` single-bucket check forbids. A fresh id keeps each bucket's
id-space disjoint: `sourceId` stays a tombstone in the source bucket
forever, `newId` only ever lives in the destination. It also means a
late, stray source-bucket op for `sourceId` can never collide with the
live destination row.

### 5. Idempotency: a client-generated `migrationId`

The destination gets a fresh id, so a naively replayed request would
mint a *second* destination row and re-tombstone the (already
tombstoned) source. The client-generated `migrationId` prevents that.

A small dedicated table records completed migrations:

```
migrations(
  migration_id TEXT PRIMARY KEY,   -- client idempotency key
  source_id    TEXT NOT NULL,
  new_id       TEXT NOT NULL,
  source_bucket TEXT NOT NULL,
  dest_bucket   TEXT NOT NULL,
  requested_by  TEXT NOT NULL,
  created_at    TEXT NOT NULL
)
```

Handler flow:

1. Look up `migration_id`. If present, **return the stored result**
   (`new_id`, `source_id`, and the scopes recomputed from the stored
   buckets) with 200 and touch nothing. A replay is a pure no-op.
2. Otherwise run the section-4 transaction and `INSERT` the
   `migrations` row **inside** it. The `PRIMARY KEY` on `migration_id`
   is the final backstop: if two identical requests race, the second's
   insert conflicts, its transaction rolls back, and it falls back to
   step 1 and returns the first's result. (better-sqlite3 transactions
   are synchronous and serialize within the single server process, so
   this race is only reachable in a hypothetical multi-process
   deployment, which MOWC does not ship; the unique constraint makes it
   safe regardless.)

The `migrations` table is tiny and, like tombstones, is **never
pruned** (in contrast to `applied_ops`, which is pruned after 30 days).
A late client retry weeks after the original must still short-circuit;
pruning the record would let it double-migrate.

Belt-and-suspenders (recommended, optional for the implementer): also
seed `applied_ops` with two deterministic op ids derived from the
`migrationId` (e.g. `migrate:<migrationId>:src` in the source bucket and
`migrate:<migrationId>:dst` in the destination bucket) as the two
`commit` calls' `opId`s, so even a hand-crafted sync replay of those
synthetic ops is inert. The `migrations` table remains the primary
guard.

### 6. Client: discovering the new id and re-pointing IndexedDB

The move is a foreground request the UI awaits (unlike an ordinary
offline write). Prerequisite: the source scope's oplog MUST be flushed
and confirmed applied before migrating, so the server's source row is
the one the player sees. The client should `push(sourceScope)` and wait
for a clean oplog (pending count 0 for that scope) before enabling the
"Move" / "Detach" action; a migrate against a bucket with pending local
ops is refused client-side.

On a 200 response the client, in one Dexie transaction:

1. Deletes the local `entities` row for `sourceId` under `sourceScope`
   and purges any `oplog` entries keyed to `sourceId` in that scope.
   Purging is essential: a queued non-delete op for `sourceId` pushed
   *after* the server tombstone would otherwise merge onto the tombstone
   and resurrect the source row (see Open risks). Since we required a
   clean oplog before migrating, there should be none, but the purge is
   the durable guard.
2. Pulls both scopes to converge: `pull(sourceScope)` (which brings the
   tombstone, confirming the removal) and `pull(destScope)` (which
   brings the new `newId` row into the local mirror under the
   destination scope key). Alternatively it may optimistically insert
   the known payload under `newId`/`destScope` and let the pull confirm;
   pulling is simpler and authoritative.
3. Navigates the sheet to the destination route using `newId`:
   `/campaigns/<destScope>/characters/<newId>` for a campaign
   destination, or `/characters/<newId>` for a standalone destination.

The `newId` in the response is what makes step 3 possible without
guessing; the client never derives the destination id itself.

## Consequences

- New server surface: one owner-authenticated route, one repo
  transaction that spans two buckets, one new tiny table
  (`migrations`), and two shared zod schemas. docs/SECURITY.md
  section 3 (authz) and section 4 (rate limiting) apply; a strict
  bucket (e.g. 30 migrations/hour per user, alongside the existing
  sync-push and pack-upload buckets) bounds abuse of an operation that
  writes two rows per call.
- The single-bucket sync invariant is untouched: no id ever lives in
  two buckets, `applyPushOps` and its `router.ts` guard are unchanged,
  and the per-bucket `seq`/`applied_ops` partitioning still holds.
- Migration is the canonical implementation of three user stories with
  one operation: "attach my standalone character to this campaign"
  (standalone -> campaign), "take my character to a new table"
  (campaign A -> campaign B), and "detach back to standalone" (campaign
  -> standalone). They differ only in source/destination buckets.
- The character sheet and roster gain a "Move to campaign" /
  "Detach to standalone" control (0.14.4) that lists the owner's seated
  campaigns plus "Standalone", excluding the current bucket.

## Open risks for the implementer (0.14.4)

1. **Tombstone resurrection by a late source-bucket op.** If any device
   still holds (or later queues) a non-delete op for `sourceId` and
   pushes it after the migrate tombstone, `applyPushOps` will `commit`
   it with `deleted = false` and **un-delete the source row**, so the
   character reappears in the source bucket alongside the real
   destination copy. The client-side purge (section 6) plus the
   "clean oplog before migrate" gate cover the initiating device, but a
   *second offline device of the same owner* that edited the character
   before it pulled the tombstone is not covered. The durable fix is to
   make tombstones **sticky** in the sync core (a non-delete op cannot
   revive a tombstoned row without an explicit undelete signal). That is
   a broader sync change than migration itself; flag it and decide in
   0.14.4 whether to land it now or accept the multi-device edge as a
   known limitation with a test that documents it.
2. **Stale local id on other devices.** Other devices show the
   character under `sourceId`/`sourceScope` until they pull the
   tombstone and the new row. That is ordinary eventual consistency, but
   the UI should tolerate a sheet route whose `characterId` has become a
   tombstone (show "this character has moved" rather than a blank sheet).
3. **Destination lacks the character's content pack.** The character's
   `playbookId`, `moves`, and gear reference defs from a pack attached to
   the *source* campaign. The destination campaign may not have that
   pack attached, so `resolveCharacterPlaybook`/`resolveCharacterMoves`
   can come up empty and the sheet renders sparse. Do NOT block the
   migrate on it (packs can be attached afterward, and standalone
   destinations pull from the owner's own/shared packs), but surface a
   pre-migrate warning when the destination cannot resolve the
   character's `playbookId`, so the player is not surprised.
4. **Pending ops at migrate time.** Enforce the clean-oplog precondition
   in the UI, not just as advice: a migrate that snapshots a stale
   server row silently drops the player's most recent unsynced edits.
   Prefer disabling the action while `pendingCount(sourceScope) > 0` and
   offering a "sync now, then move" affordance.
5. **`migrations` table growth and pruning.** Keep it unpruned (it is
   tiny, one row per lifetime move). If a retention policy is ever added,
   it must be far longer than any plausible client retry window, or a
   late retry double-migrates.
6. **Ownership on the moved row.** `ownerUserId` must be copied
   unchanged. Do not "adopt" the character to the destination Keeper or
   to the caller by any other means; the owner is the player, and
   changing it would break `canEdit` for them and hand write access to
   the wrong account.
