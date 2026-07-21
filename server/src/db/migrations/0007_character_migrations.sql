-- Character migration idempotency (docs/adr/0002-character-migration.md).
--
-- One row per completed migrate call, keyed by the client-generated
-- migration_id. A replayed request short-circuits on this row and returns the
-- original result, so a retry never mints a second destination character or
-- re-tombstones the source. Unlike applied_ops (pruned after 30 days) this
-- table is NEVER pruned: a late client retry weeks later must still be inert.
CREATE TABLE migrations (
  migration_id  TEXT PRIMARY KEY,   -- client idempotency key (uuid)
  source_id     TEXT NOT NULL,      -- the retired character id
  new_id        TEXT NOT NULL,      -- fresh id in the destination bucket
  source_bucket TEXT NOT NULL,      -- source envelope bucket (campaign id or owner user id)
  dest_bucket   TEXT NOT NULL,      -- destination envelope bucket (campaign id or owner user id)
  requested_by  TEXT NOT NULL,      -- owner user id that requested the move
  created_at    TEXT NOT NULL       -- ISO 8601 UTC
);
