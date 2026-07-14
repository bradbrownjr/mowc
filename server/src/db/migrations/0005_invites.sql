-- Invite codes (docs/SECURITY.md section 2, Phase 3.3).
--
-- Conventional (non-synced) table. code_hash is the SHA-256 hex digest of
-- the random 128-bit invite code; the raw code is shown to the Keeper once
-- at creation and never persisted. Multi-use until expiry or revocation
-- (one link shared with a whole group), single-campaign.

CREATE TABLE invites (
  id TEXT PRIMARY KEY,              -- uuidv7, safe to expose in listings
  campaign_id TEXT NOT NULL REFERENCES campaigns (id) ON DELETE CASCADE,
  code_hash TEXT NOT NULL UNIQUE,
  created_by TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  created_at TEXT NOT NULL,         -- ISO 8601 UTC
  expires_at TEXT NOT NULL,         -- ISO 8601 UTC, created_at + 72h
  revoked_at TEXT                   -- ISO 8601 UTC, NULL while active
);

-- Lists a campaign's invites (Keeper view).
CREATE INDEX idx_invites_campaign ON invites (campaign_id);
-- Redemption lookup by code hash.
CREATE INDEX idx_invites_code_hash ON invites (code_hash);
