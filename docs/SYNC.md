# MOWC Offline Sync Protocol

The client is the primary write surface. Every campaign-entity mutation is
written to IndexedDB first and queued; the server is a replication target
and the meeting point for other devices. If this doc and the code disagree,
fix one in the same PR.

## Client storage (Dexie)

- `entities`: mirror of the server envelope (id, campaignId, type, payload,
  rev, seq, updatedAt, deleted)
- `oplog`: pending local mutations `{opId: uuid, entityId, campaignId, type,
  baseRev, patch, deleted, ts}`. `patch` holds only the top-level fields the
  write changed (the full payload for a brand-new entity); `campaignId` and
  `type` let a push target one campaign and route validation by type; `ts` is
  the client write time, used as the last-write-wins key.
- `syncState`: `{campaignId, lastServerSeq}`

A UI write = update `entities` locally + append to `oplog`. The UI never
waits on the network.

Every route below is mounted under the app's `/api` prefix (e.g.
`POST /api/sync/:campaignId`), like every other MOWC endpoint.

## Push (client → server)

`POST /api/sync/:campaignId` with the oplog batch (max 500 ops,
docs/SECURITY.md section 4). The server first sorts the batch by `ts`
ascending: the client's oplog is a Dexie table keyed by `opId` (a random
uuid), so the array order it hands back is not chronological, and a create
immediately followed by an edit of the same entity (both queued in the same
2s debounce window) can otherwise arrive edit-first, whereupon step 2 below
sees no current row for a patch that alone fails the type's strict schema
and drops the edit permanently. For each op, in `ts` order, the server:

1. Skips the op if its `opId` is already in `applied_ops` (idempotent replay).
2. Loads the current row. If none: the `patch` is the full payload and the
   entity is inserted (rev = op.baseRev + 1). An op whose `entityId` exists
   in a different campaign, or with a different `type`, is dropped: an id
   never crosses a campaign boundary or changes entity type.
3. Merge: the op's `patch` is applied onto the current payload at the
   top-level-field level. Fields the op does not mention are always preserved,
   so a Harm tick on one phone and a note edit on another both survive
   (invariant 1). A field that diverges from the current row is **last-write-
   wins by `updatedAt`**: the op wins only when its `ts` is at least the
   current row's `updated_at`; otherwise the current value is kept and the op
   is returned as a `conflict` entry (with the server payload) so the UI can
   toast "your edit to X was overridden". (Non-character types added later can
   use whole-payload LWW by sending every field in the patch.) A `ts` more
   than 5 minutes ahead of the server clock is clamped to the server clock
   before the merge and before storage, so a client with a poisoned clock
   cannot post a far-future timestamp that wins every later merge forever.
4. The merged payload is validated against the shared zod schema for its type,
   looked up by `type` in the server's per-type schema map (`character`,
   `mystery`, `monster`, `minion`, `bystander`, `location`, each `.strict()`),
   and both the current owner and the resulting owner are checked through the
   authz module (`canEdit`) so a hunter can only ever write their own character
   (the Keeper-owned world entities carry no `ownerUserId`, so only the Keeper
   passes `canEdit`). An op that fails validation or authz is dropped (not
   applied).
5. Assigns the next per-campaign `seq`, bumps `rev = max(current.rev,
   op.baseRev) + 1`, stores `updated_by`, and records the `opId` in
   `applied_ops` (pruned after 30 days, on server startup) so a retried
   batch never double-applies.

Response: `{applied: [opId], conflicts: [{opId, serverPayload}],
newSeq: n}`. Client removes applied ops from the oplog.

## Pull (server → client)

`GET /api/sync/:campaignId?since=<lastServerSeq>` returns
`{rows, seq}`: envelope rows with `seq > since` (including tombstones),
filtered by the caller's visibility (a hunter receives only characters they
own plus Keeper-owned world entities that are `revealed`; see Phase 3.4), and
the new `lastServerSeq`. `seq` advances past every
scanned row, including ones withheld for visibility, so they are never
re-scanned. Client upserts each row into `entities` unless the entity has a
pending op in `oplog` (local-wins until push resolves it), then stores the new
`lastServerSeq`.

## Standalone characters

A Character with `campaignId === null` belongs to no campaign (a player whose
Keeper runs from paper, or someone trying the app solo). It cannot ride the
campaign-scoped `/api/sync/:campaignId` route, so it syncs under a dedicated
owner-bucketed scope:

- Server route `POST` / `GET /api/sync/standalone`, bucketed by the
  authenticated user's own id (`entities.campaign_id` holds that user id for
  these rows, so `seq` and `applied_ops` partition per user exactly like a
  campaign). Authorization is owner-only: a user sees and edits only rows whose
  `ownerUserId` is their own, with no seat lookup. Only `character` is accepted;
  the Keeper-owned world entities are campaign-only by construction. The router
  forces the merged payload's `campaignId` to `null`, so a standalone op can
  never escape its scope by claiming a real campaign id.
- On the client the scope key is the literal string `"standalone"` (used both as
  the local `campaignId` bucket in `entities`/`oplog`/`syncState` and as the URL
  segment). Pull stores each row under the scope it pulled, not the wire
  `campaignId`, so the server's user-id bucketing and the client's `"standalone"`
  key stay consistent. Everything else (oplog, debounce, backoff, tombstones) is
  identical to a campaign.

## Character migration (moving a character between buckets)

A character lives in exactly one bucket at a time (a campaign, or the
owner's standalone space). To carry a character's full progress from one
table to the next, it is **migrated**: moved between buckets, never
linked into two. This preserves the single-bucket invariant
(`server/src/entities/router.ts`, "an id may only live in one bucket")
rather than relaxing it. The full contract is
`docs/adr/0002-character-migration.md`; the sync-relevant flow:

- Migration is NOT an oplog op (an op targets one bucket; this spans
  two). It is a dedicated online request, `POST
  /api/characters/:characterId/migrate` with `{migrationId,
  destinationCampaignId}` (`destinationCampaignId: null` = standalone),
  returning `{newId, sourceId, sourceScope, destScope}`.
- The server does the move in **one transaction**: it tombstones the
  source row (`deleted = 1`, next source-bucket `seq`) and inserts a
  **fresh id** in the destination bucket (next destination-bucket `seq`,
  `campaignId` forced to the destination) carrying every character field
  verbatim (`ratings`, `moves`, `improvements`, `gear`, `harm`,
  `unstable`, `luckSpent`, `experience`, `notes`, `extrasState`, `look`,
  `name`, `playbookId`, `ownerUserId`). So the source Keeper's next pull
  sees the tombstone (the character drops off their roster) and the
  destination's next pull sees the new row.
- **A fresh id** is what keeps the invariant literally true: `sourceId`
  stays a tombstone in the source bucket forever; `newId` only ever
  lives in the destination. Reusing the id would put one id in two
  buckets.
- **Idempotency** is by the client-generated `migrationId`, recorded in
  a small never-pruned `migrations` table. A replay returns the stored
  `newId` and touches nothing (a fresh id per call would otherwise
  duplicate the destination on retry).
- **Client re-pointing:** before migrating, the client flushes the
  source scope's oplog (a migrate is refused while that scope has
  pending ops, so the server snapshots the current character). On
  success it deletes the local `entities` row and purges any `oplog`
  entries for `sourceId` under `sourceScope`, then `pull`s both
  `sourceScope` (the tombstone) and `destScope` (the `newId` row), and
  navigates the sheet to `newId`. Purging stale source-id ops is
  required: a non-delete op pushed after the tombstone would merge onto
  it and resurrect the source row.

## When sync runs

- On app start / campaign open (pull, then push if oplog non-empty)
- On `online` event and on SSE reconnect
- After every local write, debounced 2s, if online
- Manual "sync now" button (Phase 7.4)
- Backoff on failure: 1s, 2s, 4s ... capped at 60s

## Deletes

Soft-delete only (`deleted = 1` tombstone). Tombstones sync like any write
and are never purged from the server (they are tiny). The client hides
`deleted` rows.

## Invariants (test these, Phase 7.3)

1. Two devices editing different fields of the same character offline both
   see both changes after both sync.
2. Replaying the same push batch twice changes nothing (idempotency).
3. A client that missed 10,000 seqs converges with one pull.
4. A hunter's pull never contains an unrevealed entity, even a tombstone.
   Enforced for every Keeper-owned world entity (mystery, monster, minion,
   bystander, location) via `revealed`-gated `canView` on pull, and tested in
   `server/src/entities/router.test.ts`.
5. `lastServerSeq` only moves forward after the upserts are committed
   locally (crash between pull and store must not skip rows).
