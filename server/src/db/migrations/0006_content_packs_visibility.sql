-- Shared/official vs private/homebrew content packs (docs/SECURITY.md
-- section 7). Packs uploaded by the server-owner account (MOWC_ADMIN_EMAIL)
-- are 'shared': readable and attachable by every authenticated user without
-- needing their own copy or a campaign attachment. Everyone else's uploads
-- stay 'private', scoped to their own campaigns as before.

ALTER TABLE content_packs ADD COLUMN visibility TEXT NOT NULL DEFAULT 'private'
  CHECK (visibility IN ('private', 'shared'));

CREATE INDEX idx_content_packs_visibility ON content_packs (visibility);
