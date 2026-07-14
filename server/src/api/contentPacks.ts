import { Router } from "express";
import type Database from "better-sqlite3";
import { ContentPackSchema, UuidSchema } from "@mowc/shared";
import { zodErrorResponse } from "../http/validation.js";
import { hasDangerousKeys } from "../http/proto.js";
import type { CampaignsRepo } from "../campaigns/repo.js";

interface ContentPackRow {
  id: string;
  owner_user_id: string;
  name: string;
  author: string;
  version: string;
  payload: string;
  created_at: string;
  updated_at: string;
}

function toSummary(row: ContentPackRow) {
  return {
    id: row.id,
    name: row.name,
    author: row.author,
    version: row.version,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

export function createContentPacksRouter(
  db: Database.Database,
  campaigns: Pick<CampaignsRepo, "listForUser">
): Router {
  const router = Router();

  const insertPack = db.prepare(
    "INSERT INTO content_packs (id, owner_user_id, name, author, version, payload, created_at, updated_at) " +
      "VALUES (@id, @ownerUserId, @name, @author, @version, @payload, @createdAt, @updatedAt)"
  );
  const findById = db.prepare("SELECT * FROM content_packs WHERE id = ? AND owner_user_id = ?");
  const findByIdAny = db.prepare("SELECT * FROM content_packs WHERE id = ?");
  const listByOwner = db.prepare(
    "SELECT * FROM content_packs WHERE owner_user_id = ? ORDER BY updated_at DESC"
  );
  const deleteById = db.prepare("DELETE FROM content_packs WHERE id = ? AND owner_user_id = ?");

  router.post("/", (req, res) => {
    if (hasDangerousKeys(req.body)) {
      res.status(400).json({ errors: [{ path: "", message: "payload contains disallowed keys" }] });
      return;
    }

    const result = ContentPackSchema.strict().safeParse(req.body);
    if (!result.success) {
      res.status(400).json(zodErrorResponse(result.error));
      return;
    }

    // requireAuth (mounted ahead of this router) guarantees req.user is set.
    const ownerUserId = req.user!.id;
    const pack = result.data;
    if (findById.get(pack.id, ownerUserId)) {
      res.status(409).json({ errors: [{ path: "id", message: "a pack with this id already exists" }] });
      return;
    }

    const now = new Date().toISOString();
    insertPack.run({
      id: pack.id,
      ownerUserId,
      name: pack.name,
      author: pack.author,
      version: pack.version,
      payload: JSON.stringify(pack),
      createdAt: now,
      updatedAt: now
    });

    res.status(201).json({
      id: pack.id,
      name: pack.name,
      author: pack.author,
      version: pack.version,
      createdAt: now,
      updatedAt: now
    });
  });

  router.get("/", (req, res) => {
    const rows = listByOwner.all(req.user!.id) as ContentPackRow[];
    res.json(rows.map(toSummary));
  });

  router.get("/:id", (req, res) => {
    const idResult = UuidSchema.safeParse(req.params.id);
    if (!idResult.success) {
      res.status(400).json({ errors: [{ path: "id", message: "invalid pack id" }] });
      return;
    }

    let row = findById.get(idResult.data, req.user!.id) as ContentPackRow | undefined;
    if (!row) {
      // Not the owner: docs/SECURITY.md section 7 says packs are private to
      // their campaign, not to their uploader alone, so any member of a
      // campaign the Keeper attached this pack to (Campaign.packIds) may
      // still read it. The client's builder wizard (0.4.3) depends on this
      // for hunters loading playbook data from Keeper-uploaded packs.
      const memberPackIds = new Set(campaigns.listForUser(req.user!.id).flatMap((c) => c.packIds));
      if (memberPackIds.has(idResult.data)) {
        row = findByIdAny.get(idResult.data) as ContentPackRow | undefined;
      }
    }
    if (!row) {
      res.status(404).json({ errors: [{ path: "id", message: "pack not found" }] });
      return;
    }

    res.json({ ...toSummary(row), pack: JSON.parse(row.payload) });
  });

  router.delete("/:id", (req, res) => {
    const idResult = UuidSchema.safeParse(req.params.id);
    if (!idResult.success) {
      res.status(400).json({ errors: [{ path: "id", message: "invalid pack id" }] });
      return;
    }

    const { changes } = deleteById.run(idResult.data, req.user!.id);
    if (changes === 0) {
      res.status(404).json({ errors: [{ path: "id", message: "pack not found" }] });
      return;
    }

    res.status(204).send();
  });

  return router;
}
