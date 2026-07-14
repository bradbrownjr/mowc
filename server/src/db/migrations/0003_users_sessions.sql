-- Accounts and sessions (docs/SECURITY.md section 2, Phase 3.1).
--
-- Conventional (non-synced) tables per docs/DATA-MODEL.md's storage
-- section. email is stored lowercased and unique; password_hash is an
-- Argon2id hash (never plaintext, never logged). sessions.token_hash is the
-- SHA-256 hex digest of the random bearer token issued in the session
-- cookie; the raw token itself is never persisted.

CREATE TABLE users (
  id TEXT PRIMARY KEY,          -- uuidv7
  email TEXT NOT NULL UNIQUE,   -- lowercased
  password_hash TEXT NOT NULL,
  display_name TEXT NOT NULL,
  created_at TEXT NOT NULL,     -- ISO 8601 UTC
  updated_at TEXT NOT NULL      -- ISO 8601 UTC
);

CREATE TABLE sessions (
  token_hash TEXT PRIMARY KEY,  -- sha256 hex of the raw session token
  user_id TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  created_at TEXT NOT NULL,     -- ISO 8601 UTC
  expires_at TEXT NOT NULL      -- ISO 8601 UTC, rolled forward on each use
);

-- Lists / revokes a user's sessions; expiry sweep on read.
CREATE INDEX idx_sessions_user ON sessions (user_id);
