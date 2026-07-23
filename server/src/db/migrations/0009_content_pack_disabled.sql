-- Owner-controlled "disabled" state for a content pack (pack list
-- management). A disabled pack stays stored and visible on /packs (still
-- returned by GET /api/content-packs) but is hidden from selection menus
-- that offer packs to attach or build from (see client-side filtering at
-- the campaign settings attach list and the standalone character builder).

ALTER TABLE content_packs ADD COLUMN disabled INTEGER NOT NULL DEFAULT 0;
