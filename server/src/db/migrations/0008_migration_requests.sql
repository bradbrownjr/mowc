-- Keeper-approved pack transfer on migration
-- (docs/adr/0003-pack-transfer-approval.md).
--
-- One row per migration that is HELD pending a destination Keeper's decision,
-- because the destination campaign lacks the character's playbook pack. The row
-- carries a full copy of the source pack; nothing is written to `entities` while
-- pending, so the single-bucket invariant is trivially preserved (the move has
-- simply not happened yet). On approval the carried pack is created-or-deduped
-- and attached, and the move runs through the same `migrations`-backed
-- transaction as the direct migrate endpoint, reusing migration_id as its key.
--
-- Deliberately NOT part of the synced `entities` envelope: it is inert offline
-- (neither party can act on it) and read/written only through plain online REST,
-- the same online-only carve-out AGENTS.md rule 2 grants Keeper-admin screens.
-- Like `migrations`, this table is NEVER pruned; a stale `pending` row is retired
-- by a lazy 72h expiry sweep (docs/SYNC.md), not deletion.
CREATE TABLE migration_requests (
  migration_id            TEXT PRIMARY KEY,   -- client idempotency key (uuid), reused
                                              -- as the `migrations` table PK on approval
  source_id               TEXT NOT NULL,      -- the character id, unchanged while pending
  source_bucket           TEXT NOT NULL,      -- source envelope bucket at request time
  destination_campaign_id TEXT NOT NULL,      -- always a real campaign; standalone never
                                              -- requires approval
  requested_by            TEXT NOT NULL,      -- owner user id (== character's ownerUserId)
  pack_id                 TEXT NOT NULL,      -- id of the carried ContentPack, as authored
  pack_payload            TEXT NOT NULL,      -- the full copied ContentPack JSON
  status                  TEXT NOT NULL
                            CHECK (status IN ('pending', 'approved', 'denied', 'expired'))
                            DEFAULT 'pending',
  created_at              TEXT NOT NULL,      -- ISO 8601 UTC
  decided_at              TEXT,               -- set on approve/deny/cancel (NULL on expiry)
  decided_by              TEXT                -- Keeper (or the owner, on cancel) user id
);

-- At most one active request per character: a second distinct request while one
-- is pending would let a character wait on two Keeper decisions at once, which
-- the single-bucket move can't honor (only one can ever be approved). A
-- same-migration_id replay is unaffected (it hits the PRIMARY KEY, not this
-- index). An expired/decided row is no longer 'pending', so it stops blocking a
-- fresh request.
CREATE UNIQUE INDEX idx_migration_requests_pending_source
  ON migration_requests (source_id) WHERE status = 'pending';

CREATE INDEX idx_migration_requests_dest_pending
  ON migration_requests (destination_campaign_id) WHERE status = 'pending';
