import { Router } from "express";
import type Database from "better-sqlite3";
import { ContentPackSchema, UuidSchema } from "@mowc/shared";

/**
 * Real accounts land in Phase 3 (auth). Until then every pack is attributed
 * to this single local owner so the content_packs.owner_user_id NOT NULL
 * column (docs/DATA-MODEL.md) has a value; Phase 3.1 replaces this with the
 * session user id.
 */
const LOCAL_OWNER_USER_ID = "local";

/** docs/SECURITY.md section 1: reject any JSON that could reach a merge
 * or property-assignment path and pollute a prototype. JSON.parse itself
 * does not trigger the __proto__ setter, but this is the documented
 * contract, so we check explicitly rather than relying on that nuance. */
const DANGEROUS_KEYS = new Set(["__proto__", "constructor", "prototype"]);

function hasDangerousKeys(value: unknown, depth = 0): boolean {
  if (depth > 32) {
    return true;
  }
  if (Array.isArray(value)) {
    return value.some((item) => hasDangerousKeys(item, depth + 1));
  }
  if (value !== null && typeof value === "object") {
    for (const key of Object.keys(value)) {
      if (DANGEROUS_KEYS.has(key)) {
        return true;
      }
    }
    return Object.values(value).some((item) => hasDangerousKeys(item, depth + 1));
  }
  return false;
}

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

export function createContentPacksRouter(db: Database.Database): Router {
  const router = Router();

  const insertPack = db.prepare(
    "INSERT INTO content_packs (id, owner_user_id, name, author, version, payload, created_at, updated_at) " +
      "VALUES (@id, @ownerUserId, @name, @author, @version, @payload, @createdAt, @updatedAt)"
  );
  const findById = db.prepare("SELECT * FROM content_packs WHERE id = ? AND owner_user_id = ?");
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
      res.status(400).json({
        errors: result.error.issues.map((issue) => ({
          path: issue.path.join("."),
          message: issue.message
        }))
      });
      return;
    }

    const pack = result.data;
    if (findById.get(pack.id, LOCAL_OWNER_USER_ID)) {
      res.status(409).json({ errors: [{ path: "id", message: "a pack with this id already exists" }] });
      return;
    }

    const now = new Date().toISOString();
    insertPack.run({
      id: pack.id,
      ownerUserId: LOCAL_OWNER_USER_ID,
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

  router.get("/", (_req, res) => {
    const rows = listByOwner.all(LOCAL_OWNER_USER_ID) as ContentPackRow[];
    res.json(rows.map(toSummary));
  });

  router.get("/:id", (req, res) => {
    const idResult = UuidSchema.safeParse(req.params.id);
    if (!idResult.success) {
      res.status(400).json({ errors: [{ path: "id", message: "invalid pack id" }] });
      return;
    }

    const row = findById.get(idResult.data, LOCAL_OWNER_USER_ID) as ContentPackRow | undefined;
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

    const { changes } = deleteById.run(idResult.data, LOCAL_OWNER_USER_ID);
    if (changes === 0) {
      res.status(404).json({ errors: [{ path: "id", message: "pack not found" }] });
      return;
    }

    res.status(204).send();
  });

  return router;
}
