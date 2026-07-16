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
docs/SECURITY.md section 4). For each op the server:

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
4. The merged payload is validated against the shared zod schema for its type
   (`CharacterSchema`, strict), and both the current owner and the resulting
   owner are checked through the authz module (`canEdit`) so a hunter can only
   ever write their own character. An op that fails validation or authz is
   dropped (not applied).
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
own; see Phase 3.4), and the new `lastServerSeq`. `seq` advances past every
scanned row, including ones withheld for visibility, so they are never
re-scanned. Client upserts each row into `entities` unless the entity has a
pending op in `oplog` (local-wins until push resolves it), then stores the new
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
