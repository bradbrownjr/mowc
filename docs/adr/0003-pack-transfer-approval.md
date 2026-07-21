# ADR 0003: Keeper-approved pack transfer on migration

- Status: accepted
- Date: 2026-07-21
- Scope: ROADMAP 0.15.1. Extends/supersedes ADR 0002 for the case where a
  character migrates into a campaign whose Keeper does not have the
  content pack the character's playbook needs. Defines the contract that
  0.15.2 (server), 0.15.3 (Keeper dialog), and 0.15.4 (hunter fallback)
  implement. No code lands with this ADR.

## Context

ADR 0002 (0.14.4) shipped character migration as a single-transaction,
always-succeeds move: `POST /api/characters/:characterId/migrate`
tombstones the source row and mints a fresh id in the destination bucket
in one server transaction, unconditionally. Its open risk 3 flagged that
the destination might not have the content pack the character's
`playbookId` needs, and 0.14.5 closed that gap with a **warning, not a
block**: `packsContainPlaybook` (`client/src/lib/character-sheet.ts`)
checks the chosen destination's packs before the move, and
`MigrateCharacter.svelte` shows a non-blocking `.notice` when the pack is
missing. The move still completes immediately; the character just renders
sparse (no moves, no gear labels, no look suggestions) until *someone*
later attaches a matching pack.

That "attach it later" step has no real path today. The character has
already moved and the hunter has no standing to attach a pack to a
campaign they don't run (docs/SECURITY.md section 7: only the Keeper
attaches packs, and only packs they can already read). In practice the
sparse sheet is a dead end until the Keeper independently authors or
uploads an equivalent pack and manually attaches it — the hunter cannot
hand it to them, and the two often aren't looking at the app at the same
time to coordinate live.

The user decided (2026-07-21, ROADMAP Phase 15 header) to close this
properly: the move becomes a **Keeper-approved request that carries the
pack in**, rather than a silent, permanently-sparse migration. Fixed
constraints from that decision (restated here, not re-litigated):

1. **Hold the move.** The migration does not complete until the Keeper
   decides. The character stays in its source bucket, fully playable,
   while the request is pending. This is the opposite of "move now, fix
   the pack later" — there is no window where the character sits in the
   destination bucket without its pack.
2. **Carry the pack in.** The request itself carries a copy of the source
   pack's full payload. The hunter already has read access to it (via
   campaign-membership scoping on `GET /api/content-packs/:id`,
   `server/src/api/contentPacks.ts`), so the client can attach it to the
   request without any new server-side read path.
3. **Keeper UX: a dialog on campaign access.** Visiting their campaign,
   the Keeper sees "a character wants to move in and brings pack X" with
   Approve (attach the pack, complete the move) / Deny.
4. **Deny fallback.** On deny, the hunter is told, and offered "move
   without the pack" (the existing 0.14.5 sparse-sheet migrate, now an
   explicit informed choice rather than a silent default) or cancel.

Constraints this design must satisfy:

1. **The single-bucket invariant is unchanged.** `router.ts`'s "an id may
   only live in one bucket" check is untouched. A held request simply
   means the destination row has not been created yet; nothing about the
   sync core's guarantees changes.
2. **Pack-attach authz is unchanged.** A Keeper can only attach packs they
   own or the admin's shared library (`createPackReadableCheck`,
   `server/src/campaigns/router.ts`'s PATCH handler). The copy created on
   approval must satisfy this trivially (see Decision 3), not bypass it.
3. **This is the first cross-user async approval workflow in the app.**
   Every prior mutation is either synchronous-and-complete (a REST call,
   the ADR 0002 migrate) or eventually-consistent between one owner's
   devices (oplog sync). This is the first flow where one user's action
   (request) sits waiting on a *different* user's decision (approve/deny),
   and that second user learns about it passively (visiting their
   campaign) rather than by having initiated anything. It needs its own
   pending-request store and its own way for the first user to learn the
   outcome.

## Decision

### 1. When approval applies: the client's existing check becomes a hard branch

`MigrateCharacter.svelte` already computes, per selected destination,
whether that destination can resolve the character's playbook
(`packsContainPlaybook(destPacks, playbookId)`, 0.14.5). This ADR reuses
that exact check as the fork between the two migrate paths:

- **Destination is standalone**, or **destination is a campaign whose
  attached packs already contain the playbook**: unchanged. Calls
  `POST /api/characters/:characterId/migrate` (ADR 0002), completes
  immediately. Standalone can never require approval — there is no Keeper
  to approve anything in the owner's own space, so the 0.14.5
  warning-only behavior stays exactly as it is today for that case.
- **Destination is a campaign whose attached packs do NOT contain the
  playbook**: this ADR's new path. Calls
  `POST /api/characters/:characterId/migrate-requests` (Decision 2)
  instead of `/migrate`. Nothing moves; a pending request is created.

The 0.14.5 `.notice` copy on the destination picker changes from "you can
still move it, sparse until attached" to "this move needs your Keeper's
approval to bring the pack in" (0.15.3 wording, not fixed by this ADR),
and the button's label/behavior forks accordingly. The pack-warning
`$effect` and `loadDestinationPacks` helper in `MigrateCharacter.svelte`
are reused as-is to decide which path to take; no new pack-loading logic
is needed.

### 2. New surface: `migration_requests` (held, not moved)

A migration request is deliberately **not** a `SyncEntityType`. It is not
an oplog op, is never queued offline, and does not live in `entities`:

- It cannot usefully exist offline anyway — a hunter offline has no
  Keeper to approve it, and a Keeper offline cannot see it either. Making
  it sync-capable would only add the offline-first machinery (oplog,
  tombstones, conflict merges) to something that is inert until both
  parties are online, for no benefit.
- It mirrors ADR 0002's own precedent: migration itself is a foreground,
  online-only REST call (AGENTS.md rule 2's explicit "Keeper-only admin
  screens may be online-only" carve-out), not an oplog entity. A
  migration *request* is the same kind of operation, one step earlier.
- Keeping it out of `entities` also keeps the single-bucket invariant
  trivially true by construction: a pending request touches zero rows in
  either bucket. "Held" is not a status flag on some entity; it is the
  simple fact that nothing has been written to `entities` yet.

New table, alongside `migrations` (docs/DATA-MODEL.md, ADR 0002):

```sql
CREATE TABLE migration_requests (
  migration_id           TEXT PRIMARY KEY,   -- client idempotency key (uuid), reused
                                              -- as the `migrations` table PK on approval
  source_id              TEXT NOT NULL,      -- the character id, unchanged while pending
  source_bucket          TEXT NOT NULL,      -- source envelope bucket at request time
  destination_campaign_id TEXT NOT NULL,     -- always a real campaign; standalone never
                                              -- requires approval (Decision 1)
  requested_by            TEXT NOT NULL,     -- owner user id (== character's ownerUserId)
  pack_id                 TEXT NOT NULL,     -- id of the carried ContentPack, as authored
  pack_payload             TEXT NOT NULL,    -- the full copied ContentPack JSON
  status                   TEXT NOT NULL     -- 'pending' | 'approved' | 'denied' | 'expired'
                            CHECK (status IN ('pending','approved','denied','expired'))
                            DEFAULT 'pending',
  created_at               TEXT NOT NULL,
  decided_at                TEXT,
  decided_by                TEXT             -- Keeper user id who approved/denied, or NULL
);

-- At most one active request per character: a second distinct request
-- while one is pending would let a character wait on two Keeper
-- decisions at once, which the single-bucket move can't honor (only one
-- can ever be approved). A same-migrationId replay is unaffected (it
-- hits the PRIMARY KEY, not this index).
CREATE UNIQUE INDEX idx_migration_requests_pending_source
  ON migration_requests (source_id) WHERE status = 'pending';

CREATE INDEX idx_migration_requests_dest_pending
  ON migration_requests (destination_campaign_id) WHERE status = 'pending';
```

**Lifecycle:** `pending` -> `approved` | `denied` | `expired`, all
terminal. `pack_payload` is stored verbatim (not re-derived) so an
approval reads back exactly what the hunter sent, and so a Keeper's list
view can show the pack's name/author without touching `content_packs`
until approval actually creates or dedupes a row there.

**Expiry (72h, matching the invite-code default, docs/SECURITY.md section
2):** no scheduled job. A tiny sweep,
`UPDATE migration_requests SET status = 'expired' WHERE status = 'pending'
AND created_at < ?`, runs inline at the top of every handler that reads
or writes this table (create, cancel, the Keeper's list, the hunter's
status poll) before that handler does anything else. This keeps the
unique-pending-per-source index meaningful (an expired row is no longer
`'pending'`, so it stops blocking a fresh request) without a cron, at the
cost of one cheap `UPDATE` per request touching the table — negligible at
this app's scale, and the same "lazy, on-touch" pattern the rest of the
sync core avoids adding infrastructure for.

### 3. Pack copy: client sends the payload; server dedupes by id and attaches

The client already has the source pack in hand (it loaded it to compute
`packsContainPlaybook` for the warning) and includes its full JSON in the
create-request body, validated at the boundary with
`ContentPackSchema.strict()` — the same schema and the same 5 MB size cap
`POST /api/content-packs` already enforces (docs/SECURITY.md section 7),
scoped to this route the same way. The server does **not** trust the
client's claim that this pack actually contains the character's
playbook: it independently re-checks `pack.playbooks.some((p) => p.id ===
character.payload.playbookId)` server-side and 400s otherwise, so a
malformed or unrelated pack can never ride through the approval flow.

**Ownership on approval: the destination Keeper owns the copy.**

```
findByIdAny(pack.id):
  - found, and readable by the destination Keeper (own or shared):
      reuse that id; no new content_packs row. This is the dedup case.
  - found, but owned by someone else and private (an id collision,
      astronomically unlikely given content-pack ids are random uuids):
      mint a fresh id for the copy, insert as new.
  - not found: insert as new, id preserved from the copy.
New row's owner_user_id = the approving Keeper. visibility computed the
same way POST /api/content-packs computes it today:
  isAdmin(keeperUser, adminEmail) ? 'shared' : 'private'.
```

This makes the new pack trivially pass the *existing* pack-attach authz
(`createPackReadableCheck`, constraint 2 above) with zero special-casing:
the Keeper now owns it, so "a Keeper can only attach packs they own or
shared" is satisfied by construction, not by an exception carved into
that check for this flow.

**Rejected alternative: preserve provenance (owner stays the original
uploader / source campaign).** Rejected for three reasons:

1. **Broken write access.** docs/SECURITY.md section 7's pack-management
   rule is owner-only edit/delete. A pack owned by a user with no
   relationship to the destination campaign would be permanently
   unmanageable by the Keeper who now depends on it — they could not fix
   a typo, delete it, or ever re-attach it if detached by mistake.
2. **Wrong authorship semantics.** docs/DATA-MODEL.md's content-pack
   model is "owned by whoever authored the pack." The hunter (or the
   source campaign) transcribing/carrying content isn't the pack's
   author; provenance-preservation would misattribute authorship to
   whichever user happened to first upload that pack id, not the actual
   holder of write access at the destination.
3. **No benefit given the dedup path.** The dedup-by-id case already
   means a Keeper who happens to own (or has shared-library access to) a
   matching pack never gets a duplicate at all — provenance only would
   have mattered for the "Keeper doesn't have it yet" case, and there,
   giving the Keeper ownership is exactly what makes the pack theirs to
   manage going forward, which is the whole point of "attach the pack."

**Dedup limitation, stated plainly:** matching is by pack `id` equality
only, not content hashing. Two packs that are conceptually identical but
were authored/uploaded under different ids will not be recognized as the
same and will produce a second row. This mirrors how the rest of the app
already treats pack identity (POST's own 409-on-id-collision check,
`server/src/api/contentPacks.ts`) and is an accepted scope cut, not a gap
to fix here.

### 4. Endpoint shapes

Mirrors the `/api/characters/:characterId/migrate` mounting from ADR
0002, as an **additive, distinct** surface rather than overloading that
endpoint. Overloading was considered and rejected: `/migrate`'s existing
contract is "200 always means moved, immediately, now" — `MigrateCharacter.svelte`'s
`move()` and the e2e suite (`e2e/migrate.e2e.ts`) both depend on that
being unconditionally true. Making a 200 from that same endpoint
sometimes mean "queued, wait" would force every caller to branch on a
new response shape and would conflate two different resources (an
immediate mutation vs. a durable pending request) under one URL. A
distinct resource keeps `/migrate` byte-compatible forever for the common
case (destination already has the pack, unaffected by this ADR) and gives
the approval-required path its own natural place for status/cancel/list
sub-routes.

Owner-facing, mounted at `/api/characters` (same router file,
`server/src/entities/router.ts`, extending `createCharacterMigrationRouter`
or a sibling factory in the same module):

```
POST /api/characters/:characterId/migrate-requests
```
Body (new `MigrationRequestCreateSchema`, strict):
```
{
  migrationId: uuid,               // reused, unchanged, as the migrations
                                    // table PK on approval (Decision 5)
  destinationCampaignId: uuid,     // never null; standalone never needs approval
  pack: ContentPack                // ContentPackSchema.strict(), the carried copy
}
```
Authz: owner-only (`current.payload.ownerUserId === req.user.id`, same
check ADR 0002 §3 uses) **and** a destination seat
(`authz.canReadCampaign(destinationCampaignId, userId)`) — identical to
ADR 0002's direct-migrate authz, unchanged. The hunter must already be a
seated member of the destination campaign (via the ordinary invite flow);
this ADR only ever fires for members who lack a pack, never for
strangers, so the Keeper's later list view (Decision 4) exposes no new
information about people outside their own roster.
Response 201, `MigrationRequestSchema` (below), `status: "pending"`.
409 if a request is already `pending` for this `source_id` (the unique
index); the client shows "you already have a move pending, cancel it or
wait." A replay with the **same** `migrationId` (network retry) hits the
table's `PRIMARY KEY` and returns the existing stored row untouched
(idempotent, exactly ADR 0002's `findMigration` pattern), never a 409.

```
GET /api/characters/:characterId/migrate-requests/latest
```
Owner-only. Returns the character's most recent request (any status,
after the expiry sweep runs), or `null` if none exists. Used by the
hunter's client to poll for an outcome (Decision 7).

```
POST /api/characters/:characterId/migrate-requests/:migrationId/cancel
```
Owner-only, pending -> `denied` (a hunter-initiated withdrawal reuses the
deny transaction shape, Decision 6, with no Keeper actor). 409 if the
request is not currently `pending` (already decided or expired; nothing
to cancel).

Keeper-facing, mounted at `/api/campaigns` (new small router, same
pattern as `createCampaignsRouter`, or folded into it):

```
GET /api/campaigns/:campaignId/migrate-requests
```
Keeper-only (`requireKeeper`, same 404-for-non-member/403-for-hunter
pattern every other Keeper-only route uses). Returns every `pending`
request targeting this campaign (after the expiry sweep), enriched
server-side with display data the Keeper's dialog needs:
`MigrationRequestSummarySchema[]` — adds `characterName` (read from the
current `entities` row by `sourceId`) and `requestedByDisplayName` (from
`users`) to the base shape below, so the client never has to separately
resolve either.

```
POST /api/campaigns/:campaignId/migrate-requests/:migrationId/approve
POST /api/campaigns/:campaignId/migrate-requests/:migrationId/deny
```
Keeper-only. Approve runs the full transaction (Decision 5) and responds
with `CharacterMigrateResponseSchema` — **the exact same shape** ADR
0002's `/migrate` already returns (`{newId, sourceId, sourceScope,
destScope}`) — so the client's existing `applyMigration()` helper
(`client/src/lib/sync.ts`) needs no new response shape to consume; only a
new call site (the Keeper's approve action rather than the hunter's move
action) triggers it, and on the Keeper's own device it also re-points
their local mirror the same way a direct migrate would. Deny responds
`{migrationId, status: "denied"}`. Both 409 if the request is not
currently `pending`.

Shared response schemas (new, `shared/src/schemas/character.ts`, next to
the ADR 0002 migrate schemas):

```ts
export const MigrationRequestStatusSchema = z.enum([
  "pending", "approved", "denied", "expired"
]);

export const MigrationRequestSchema = z.object({
  migrationId: UuidSchema,
  sourceId: UuidSchema,
  destinationCampaignId: UuidSchema,
  status: MigrationRequestStatusSchema,
  packId: UuidSchema,
  packName: z.string(),
  requestedBy: UserIdSchema,
  createdAt: z.string(),
  decidedAt: z.string().nullable()
});

export const MigrationRequestSummarySchema = MigrationRequestSchema.extend({
  characterName: z.string(),
  requestedByDisplayName: z.string()
});
```

### 5. The approve transaction: pack + attach + migrate, one atomic unit

Same "one transaction, never observed half-done" discipline ADR 0002 §4
established for the move itself, extended to cover the pack side too:

1. Re-run the expiry sweep; if this row is no longer `pending` (already
   decided, or just expired), 409.
2. Load the character fresh by `source_id` (`repo.getById`) — **not** a
   snapshot from request-creation time. If missing, tombstoned, or no
   longer `type === "character"` (the character moved or was deleted by
   some other means while this request sat pending), 404/409; the Keeper
   sees a clear error and must explicitly Deny to close out the stale
   request (Decision 6 handles that; approval itself never silently
   auto-denies).
3. Resolve the pack per Decision 3 (dedupe-by-id or insert), yielding a
   `pack_id` guaranteed owned-or-shared for this Keeper.
4. If `pack_id` is not already in the destination campaign's `packIds`,
   append it (the same `campaigns` table write `PATCH /api/campaigns/:id`
   already performs, just executed inline rather than through a second
   HTTP round trip).
5. Run the **same** tombstone-source-plus-create-destination logic ADR
   0002's `repo.migrateCharacter()` already implements, reusing this
   request's `migrationId` unchanged as the `migrations` table's primary
   key. Both entry points — the direct `/migrate` endpoint and this
   approve handler — bottom out in that one shared transaction function,
   so the single-bucket move itself is implemented exactly once and this
   ADR does not fork it.
6. Mark this `migration_requests` row `approved`, `decided_at = now`,
   `decided_by = <Keeper user id>`.

Steps 1-6 execute inside one `db.transaction`, so a reader never observes
the pack attached without the character having moved, or vice versa.
better-sqlite3 supports nested transaction functions (via savepoints), so
the implementer may call the existing `migrateCharacter` transaction from
within a new, larger `approveMigrationRequest` transaction rather than
duplicating its statements; either is acceptable as long as all of steps
1-6 commit or roll back together. This composition reaches across what
are today three separate repos (`content_packs` via
`contentPacks.ts`, `campaigns` via `campaigns/repo.ts`, `entities` +
`migrations` via `entities/repo.ts`); the implementer should give it a
home that holds direct prepared statements against all four tables
against one shared `Database.Database` handle (a new module, e.g.
`server/src/entities/migrationRequests.ts`, mirroring how `repo.ts`
already holds its own statements rather than composing through another
repo's public methods) so the whole thing stays one atomic unit instead
of stitching together non-transactional calls into three separate repos.

**Idempotency:** a replayed approve (same `migrationId`) is caught by the
**existing** `findMigration(migrationId)` check ADR 0002's migrate
endpoint already performs first — no new idempotency mechanism is needed
for the move itself, because this path funnels into the same
`migrations` table using the same key. The only new idempotency surface
is the create-request call (Decision 4's `PRIMARY KEY` on
`migration_requests.migration_id`) and the approve/deny calls' own
409-on-non-pending guard.

### 6. The deny transaction: status flip only, character untouched

```sql
UPDATE migration_requests
SET status = 'denied', decided_at = ?, decided_by = ?
WHERE migration_id = ? AND status = 'pending'
```

No pack row is created or touched, no campaign is touched, no character
row is touched. This is intentionally the simplest possible write in this
ADR: denying must never have a side effect on the character, so the
hunter's next choice (Decision 7's fallback) starts from exactly the
character state it was in before the request was ever filed.

The hunter-initiated **cancel** (Decision 4) is byte-identical to deny
except `decided_by` is the requester's own user id rather than a Keeper's,
and it is invoked by the character's owner instead of the destination
Keeper. Both transitions are terminal and mutually exclusive with
approval via the same `WHERE status = 'pending'` guard.

**Fallback on deny (0.15.4, not fully specified here):** "move without the
pack" is the *existing* 0.14.5 direct migrate — the hunter re-runs
Decision 1's branch, this time explicitly acknowledging the sparse-sheet
consequence (the same wording already drafted in the ROADMAP header:
"a sparse sheet: playbook layout, moves, gear labels") and the client
calls `POST /migrate` directly, bypassing the approval branch by user
choice rather than by the automatic pack-presence check. "Cancel" makes
no further server call; the request is already terminal (`denied`), and
the hunter simply dismisses the banner. No new endpoint is needed for
either choice.

### 7. How the hunter learns the outcome: poll on next visit

**Decision: poll on visit, via the plain REST `GET .../migrate-requests/latest`
endpoint (Decision 4), no new sync entity type, no SSE, no push
notification.** Called from two existing mount points, both already doing
similar on-load network fetches:

- The source character's own sheet route (`campaigns/[id]/characters/[characterId]/+page.svelte`),
  on mount, alongside where `MigrateCharacter.svelte` is already rendered
  for the owner — showing a small status banner: "Move pending your
  Keeper's approval" while `pending`, "Approved — view your character at
  its new home" with a link to `newScope`/`newId` while `approved` (the
  approve response's shape, cached from Decision 5, or re-derived by
  calling `findMigration` — either way the sheet never needs to guess the
  new id), or the deny-fallback prompt (Decision 6) while `denied` /
  `expired`.
- The `/characters` roster route (`client/src/lib/my-characters.ts`),
  since a hunter may not think to revisit the specific old sheet once
  they believe the move already happened; a lighter per-row status tag is
  enough there ("move pending" / "move denied").

Both call sites already tolerate being offline (the pack-warning check in
`MigrateCharacter.svelte` is the existing pattern: "Can't check right now
— don't warn and don't block"); the status poll follows the identical
shape — a failed fetch (offline) simply shows no banner, never an error
that blocks the rest of the sheet from rendering. This keeps the
character itself fully playable offline throughout (constraint honored:
only the *migrate decision path* is online-only, never ordinary play).

**Rejected alternatives:**

1. **A real notifications surface** (a `notifications` table, a bell icon,
   unread counts). This is the first cross-user event in the whole app;
   building general notification infrastructure for exactly one use case
   is the kind of premature abstraction AGENTS.md's Implementation
   Discipline section warns against ("don't create helpers or
   abstractions for one-time operations"). If a second cross-user event
   ever appears, generalize then.
2. **SSE push.** docs/SECURITY.md section 2/4 already scope SSE to
   same-origin, cookie-authenticated streams with a 5-concurrent-per-user
   cap, but nothing in the shipped feature set (per AGENTS.md's Feature
   Registry) actually uses SSE for anything today — it is documented
   infrastructure, not a running system. Standing it up for the first
   time solely to push one status change is disproportionate next to a
   GET call two existing routes already make on load.
3. **A new `SyncEntityType`** (`migrationRequest` as an oplog-synced
   entity). Rejected because it would make the pending request offline-
   queueable and multi-device-mergeable, machinery it does not need
   (Decision 2): the request cannot be *acted on* by either party while
   offline anyway, so syncing it gains nothing and adds real cost (an
   oplog entity needs `revealed`/authz wiring, tombstone handling, and a
   place in `ENTITY_SCHEMAS`, none of which map cleanly onto a two-party
   approval workflow with a Keeper-only mutation and an owner-only read).

### 8. Authorization summary

| Action | Rule |
|---|---|
| Create request | Owner of the character (`ownerUserId === req.user.id`) AND a seat in the destination campaign (`authz.canReadCampaign`) — identical to ADR 0002 §3's direct-migrate authz. |
| Cancel request | Owner of the character only. |
| Get latest / status poll | Owner of the character only. |
| List pending requests for a campaign | Keeper of that campaign only (`requireKeeper`). |
| Approve / deny | Keeper of the destination campaign only (`requireKeeper`); ownership of the character is irrelevant here — the Keeper who runs the destination decides, matching ADR 0002's framing that the Keeper "can already remove a player by revoking their seat" as the analogous unilateral admin power over their own campaign. |

### 9. Rate limiting (docs/SECURITY.md section 4)

- **Create request**: a new bucket, 10/hour/user, matching the existing
  pack-upload bucket's weight (`createConversionRateLimiter`-style
  `keyGenerator` by user id) — the body carries a full pack payload, the
  same order of write cost as `POST /api/content-packs`.
- **Cancel / approve / deny**: a new bucket, 30/hour/user, matching the
  existing migration bucket (`createMigrationRateLimiter`) — each is a
  small, infrequent, human-driven action, but still gets a strict bucket
  per this codebase's convention of never leaving a mutating route on
  only the 300/min/IP global limiter.
- **Get latest / list pending**: read-only; no dedicated bucket beyond the
  global 300/min/IP limiter, same as other read routes (e.g.
  `GET /api/campaigns/:id`).

## Consequences

- New server surface: one new table (`migration_requests`), two new
  shared zod schemas (`MigrationRequestSchema`,
  `MigrationRequestSummarySchema`, plus the create-request request
  schema), six new routes across two routers (`/api/characters/.../migrate-requests[...]`,
  `/api/campaigns/:id/migrate-requests[...]`), two new rate-limit
  buckets, and one new composed transaction (`approveMigrationRequest`)
  that spans `content_packs`, `campaigns`, and the existing
  `migrateCharacter` transaction.
- `MigrateCharacter.svelte` gains a branch (Decision 1) rather than a
  rewrite: the existing pack-check `$effect` and destination picker are
  reused; only the button's action forks between `/migrate` (unchanged)
  and the new create-request call.
- The character sheet and `/characters` roster each gain a small,
  offline-tolerant status poll (Decision 7); neither gains new offline
  machinery.
- ADR 0002's direct-migrate path, its rate bucket, its idempotency table,
  and its client re-pointing logic (`applyMigration`) are all reused
  unchanged; this ADR is purely additive to that contract, never a
  rewrite of it. The "supersede for the missing-pack case" framing in the
  ROADMAP header means: for that one case, the client now takes this new
  path *instead of* calling `/migrate` directly — it does not mean
  ADR 0002's endpoint, schema, or transaction logic themselves change.

## Open risks for the implementer (0.15.2-0.15.4)

1. **Unsynced hunter edits at approval time.** ADR 0002 §6 requires the
   hunter's client to flush the source scope's oplog before a *direct*
   migrate, because the migrate endpoint reads whatever is currently
   committed server-side. That precondition is checked client-side, at
   the moment the hunter clicks "Move." Here, the corresponding read
   happens at **approval** time (Decision 5, step 2), which the hunter
   does not control the timing of — a Keeper could approve minutes,
   hours, or days after the request was filed. If the hunter has local
   edits still sitting only in their oplog (not yet pushed) at that
   moment, those edits are silently absent from the migrated destination
   row, exactly like any two-actor race, but now with a Keeper-controlled
   delay the hunter cannot gate as tightly as ADR 0002's own precondition
   does. Mitigation: the client should still `push(sourceScope)` when
   *creating* the request (mirroring `MigrateCharacter.svelte`'s existing
   proactive push-on-mount pattern), which flushes ordinary in-flight ops
   well before any Keeper is likely to look at their dashboard, but this
   is best-effort, not a hard guarantee. Decide in 0.15.2 whether to also
   re-check the hunter's oplog state at approval time somehow (the server
   cannot directly observe client-only oplog state, so this may not be
   fully closeable) or accept it as a documented limitation with a
   regression test that pins the current (best-effort) behavior.
2. **Pack id collision on approval** (Decision 3's rare branch): verify
   the mint-fresh-id fallback is actually exercised by a test, not just
   documented, since it is the one branch that is very unlikely to occur
   organically in development.
3. **Multiple simultaneous pending requests for one Keeper.** The unique
   index in Decision 2 caps requests *per character* at one, but a Keeper
   running a busy campaign could plausibly have several different
   hunters' requests pending at once. The dialog UX in Decision 3 of the
   ROADMAP header ("a dialog explaining a character wants to move in")
   was scoped by the user as singular; 0.15.3 needs to decide whether
   that's a queue of dialogs, a list-then-detail pattern (matching the
   Keeper dashboard's existing two-pane list/detail precedent,
   `campaigns/[id]/dashboard/+page.svelte`), or something else. This ADR
   deliberately leaves that UI shape open and only fixes the API
   (`GET /api/campaigns/:campaignId/migrate-requests` already returns an
   array for exactly this reason).
4. **Residual sparse-sheet gap, narrowed but not eliminated.** Only the
   *one* pack containing the character's `playbookId` travels with an
   approved request (matching `packsContainPlaybook`'s own single-pack
   check and the user's "carries a copy of the source pack" — singular —
   decision). A character holding moves granted from a *different* pack
   (e.g. an `addMove` improvement pulling a move from a second playbook's
   pack, `resolveCharacterMoves`'s documented cross-pack search) can still
   render sparse for that second pack even after this flow's approval.
   This is the same shape as ADR 0002's open risk 3, narrowed to "the
   primary pack is now handled" rather than closed outright; not a defect
   introduced by this ADR, but worth flagging so 0.15.2 doesn't treat the
   warning-notice removal (Decision 1) as a complete fix for every
   possible missing pack, only the playbook-defining one.
5. **`migration_requests` growth.** Like `migrations`, this table is tiny
   (one row per request, terminal states never revisited) and is *not*
   pruned by this ADR — a late Keeper decision or a late hunter status
   check must still find the row. If a retention policy is ever wanted,
   it should only ever prune long-terminal (`approved`/`denied`/`expired`)
   rows, mirroring the same reasoning `applied_ops`'s 30-day prune
   already uses for a *different*, much higher-volume table; do not prune
   `pending` rows on any schedule, since expiry (Decision 2) is the only
   mechanism that should ever retire a pending request.
