-- Campaigns and seats (docs/DATA-MODEL.md, Phase 3.2/3.4).
--
-- Conventional (non-synced) tables. campaigns.keeper_user_id denormalizes
-- ownership for quick lookups; seats is the canonical membership+role list
-- and always includes a 'keeper' row for the owner, so authz checks (Phase
-- 3.4) can query seats alone without special-casing the owner.

CREATE TABLE campaigns (
  id TEXT PRIMARY KEY,              -- uuidv7
  name TEXT NOT NULL,
  keeper_user_id TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  pack_ids TEXT NOT NULL DEFAULT '[]', -- JSON array of content_pack ids
  settings TEXT NOT NULL DEFAULT '{}', -- JSON object
  theme TEXT NOT NULL DEFAULT 'default',
  created_at TEXT NOT NULL,         -- ISO 8601 UTC
  updated_at TEXT NOT NULL          -- ISO 8601 UTC
);

CREATE INDEX idx_campaigns_keeper ON campaigns (keeper_user_id);

CREATE TABLE seats (
  campaign_id TEXT NOT NULL REFERENCES campaigns (id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  role TEXT NOT NULL,               -- 'keeper' | 'hunter'
  created_at TEXT NOT NULL,         -- ISO 8601 UTC
  PRIMARY KEY (campaign_id, user_id)
);

-- Lists the campaigns a user belongs to.
CREATE INDEX idx_seats_user ON seats (user_id);
