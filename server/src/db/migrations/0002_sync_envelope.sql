-- Sync-envelope and content-pack storage (docs/SYNC.md, docs/DATA-MODEL.md).
--
-- All synced campaign entities share ONE uniform table (the envelope); we
-- never add a per-entity table. content_packs is non-synced and owned by
-- the uploading user, not a campaign (packs are shared across campaigns via
-- Campaign.packIds[]; see docs/DATA-MODEL.md and docs/LICENSING.md).
--
-- No foreign keys here: users and campaigns tables land in Phase 3, so the
-- referenced parents do not exist yet. Columns are plain TEXT ids.

-- Uniform envelope for every synced campaign entity.
CREATE TABLE entities (
  id TEXT PRIMARY KEY,          -- uuidv7
  campaign_id TEXT NOT NULL,
  type TEXT NOT NULL,           -- 'character' | 'mystery' | 'monster' | ...
  payload TEXT NOT NULL,        -- JSON, validated by the shared zod schema
  rev INTEGER NOT NULL,         -- client lamport counter (docs/SYNC.md)
  seq INTEGER NOT NULL,         -- server-assigned, monotonic per campaign
  updated_at TEXT NOT NULL,     -- ISO 8601 UTC
  updated_by TEXT NOT NULL,     -- user id
  deleted INTEGER NOT NULL DEFAULT 0  -- tombstone
);

-- Pull scans by (campaign_id, seq); reads filter by (campaign_id, type).
CREATE INDEX idx_entities_campaign_seq ON entities (campaign_id, seq);
CREATE INDEX idx_entities_campaign_type ON entities (campaign_id, type);

-- Push idempotency: remembers applied opIds per campaign so a retried batch
-- never double-applies (docs/SYNC.md). Pruned after 30 days via applied_at.
CREATE TABLE applied_ops (
  campaign_id TEXT NOT NULL,
  op_id TEXT NOT NULL,
  applied_at TEXT NOT NULL,     -- ISO 8601 UTC
  PRIMARY KEY (campaign_id, op_id)
);

-- Supports pruning old rows by age.
CREATE INDEX idx_applied_ops_applied_at ON applied_ops (applied_at);

-- Uploaded content packs (non-synced). Owned by the uploading user and
-- referenced by campaigns through Campaign.packIds[], so NOT campaign-scoped.
CREATE TABLE content_packs (
  id TEXT PRIMARY KEY,          -- ContentPack.id (uuid)
  owner_user_id TEXT NOT NULL,
  name TEXT NOT NULL,
  author TEXT NOT NULL,
  version TEXT NOT NULL,
  payload TEXT NOT NULL,        -- the full ContentPack JSON
  created_at TEXT NOT NULL,     -- ISO 8601 UTC
  updated_at TEXT NOT NULL      -- ISO 8601 UTC
);

-- List a user's packs.
CREATE INDEX idx_content_packs_owner ON content_packs (owner_user_id);
