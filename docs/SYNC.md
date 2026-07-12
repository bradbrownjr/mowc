# MOWC Offline Sync Protocol

The client is the primary write surface. Every campaign-entity mutation is
written to IndexedDB first and queued; the server is a replication target
and the meeting point for other devices. If this doc and the code disagree,
fix one in the same PR.

## Client storage (Dexie)

- `entities`: mirror of the server envelope (id, campaignId, type, payload,
  rev, seq, updatedAt, deleted)
- `oplog`: pending local mutations `{opId: uuid, entityId, baseRev,
  newPayload, deleted, ts}`
- `syncState`: `{campaignId, lastServerSeq}`

A UI write = update `entities` locally + append to `oplog`. The UI never
waits on the network.

## Push (client → server)

`POST /sync/:campaignId` with the oplog batch. For each op the server:

1. Validates payload against the shared zod schema for its type.
2. Loads the current row. If none: insert (rev = op.baseRev + 1).
3. Conflict check: if `current.rev > op.baseRev`, another device wrote
   concurrently. Resolution is **last-write-wins by `updatedAt`**, with one
   exception: for `character` entities, merge at the top-level-field level
   (a Harm tick on one phone and a note edit on another must both survive).
   The loser's full payload is returned to the client as a `conflict` entry
   so the UI can toast "your edit to X was overridden".
4. Assigns the next per-campaign `seq`, bumps `rev = max(current.rev,
   op.baseRev) + 1`, stores `updated_by`.
5. Ops are idempotent by `opId`: the server remembers applied opIds per
   campaign (table `applied_ops`, pruned after 30 days) so a retried batch
   never double-applies.

Response: `{applied: [opId], conflicts: [{opId, serverPayload}],
newSeq: n}`. Client removes applied ops from the oplog.

## Pull (server → client)

`GET /sync/:campaignId?since=<lastServerSeq>` returns all envelope rows
with `seq > since` (including tombstones), filtered by the caller's
visibility (hunters never receive unrevealed Keeper entities; see
Phase 3.4). Client upserts into `entities` unless the entity has a pending
op in `oplog` (local-wins until push resolves it), then stores the new
`lastServerSeq`.

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
5. `lastServerSeq` only moves forward after the upserts are committed
   locally (crash between pull and store must not skip rows).
