import { Router } from "express";
import type Database from "better-sqlite3";
import { ContentPackSchema, UuidSchema } from "@mowc/shared";
import { zodErrorResponse } from "../http/validation.js";
import { hasDangerousKeys } from "../http/proto.js";
import { isAdmin } from "../authz/admin.js";
import type { CampaignsRepo } from "../campaigns/repo.js";

type PackVisibility = "private" | "shared";

interface ContentPackRow {
  id: string;
  owner_user_id: string;
  name: string;
  author: string;
  version: string;
  payload: string;
  visibility: PackVisibility;
  created_at: string;
  updated_at: string;
}

function toSummary(row: ContentPackRow) {
  return {
    id: row.id,
    ownerUserId: row.owner_user_id,
    visibility: row.visibility,
    name: row.name,
    author: row.author,
    version: row.version,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

export function createContentPacksRouter(
  db: Database.Database,
  campaigns: Pick<CampaignsRepo, "listForUser">,
  adminEmail: string | undefined
): Router {
  const router = Router();

  const insertPack = db.prepare(
    "INSERT INTO content_packs (id, owner_user_id, name, author, version, payload, visibility, created_at, updated_at) " +
      "VALUES (@id, @ownerUserId, @name, @author, @version, @payload, @visibility, @createdAt, @updatedAt)"
  );
  const findById = db.prepare("SELECT * FROM content_packs WHERE id = ? AND owner_user_id = ?");
  const findByIdAny = db.prepare("SELECT * FROM content_packs WHERE id = ?");
  const listVisible = db.prepare(
    "SELECT * FROM content_packs WHERE owner_user_id = ? OR visibility = 'shared' ORDER BY updated_at DESC"
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

    // The server-owner's uploads become the shared library everyone can
    // attach without their own copy (docs/SECURITY.md section 7); everyone
    // else's stay private to their own account and campaigns, as before.
    const visibility: PackVisibility = isAdmin(req.user!, adminEmail) ? "shared" : "private";

    const now = new Date().toISOString();
    insertPack.run({
      id: pack.id,
      ownerUserId,
      name: pack.name,
      author: pack.author,
      version: pack.version,
      payload: JSON.stringify(pack),
      visibility,
      createdAt: now,
      updatedAt: now
    });

    res.status(201).json({
      id: pack.id,
      ownerUserId,
      visibility,
      name: pack.name,
      author: pack.author,
      version: pack.version,
      createdAt: now,
      updatedAt: now
    });
  });

  router.get("/", (req, res) => {
    const rows = listVisible.all(req.user!.id) as ContentPackRow[];
    res.json(rows.map(toSummary));
  });

  router.get("/:id", (req, res) => {
    const idResult = UuidSchema.safeParse(req.params.id);
    if (!idResult.success) {
      res.status(400).json({ errors: [{ path: "id", message: "invalid pack id" }] });
      return;
    }

    const row = findByIdAny.get(idResult.data) as ContentPackRow | undefined;
    const userId = req.user!.id;
    const isOwner = row?.owner_user_id === userId;
    const isShared = row?.visibility === "shared";
    // Not the owner and not shared: docs/SECURITY.md section 7 says packs
    // are also private to their campaign, not just their uploader, so any
    // member of a campaign the Keeper attached this pack to (Campaign.
    // packIds) may still read it. The client's builder wizard (0.4.3)
    // depends on this for hunters loading playbook data from Keeper-
    // uploaded packs.
    const isCampaignAttached =
      row !== undefined &&
      !isOwner &&
      !isShared &&
      campaigns.listForUser(userId).some((c) => c.packIds.includes(row.id));

    if (!row || (!isOwner && !isShared && !isCampaignAttached)) {
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
