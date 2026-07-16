import { Router, type Request, type Response } from "express";
import type { ZodTypeAny } from "zod";
import {
  BystanderSchema,
  CharacterSchema,
  LocationSchema,
  MinionSchema,
  MonsterSchema,
  MysterySchema,
  SyncPushRequestSchema,
  UuidSchema,
  type SyncConflict,
  type SyncEntityType,
  type SyncEnvelope
} from "@mowc/shared";
import { zodErrorResponse } from "../http/validation.js";
import { hasDangerousKeys } from "../http/proto.js";
import type { Authz, EntityAccessContext } from "../authz/index.js";
import { createSyncPushRateLimiter } from "../auth/rateLimit.js";
import { mergePatch } from "./merge.js";
import type { EntitiesRepo, EntityEnvelope } from "./repo.js";

/**
 * Per-type strict schema the merged payload must validate against before it is
 * stored. `character` is byte-identical to the previous inline
 * `CharacterSchema.strict()`; the five Keeper-owned world entities dispatch to
 * their own schemas so a monster op can never be silently accepted as (or
 * validated against) a character.
 */
const ENTITY_SCHEMAS: Record<SyncEntityType, ZodTypeAny> = {
  character: CharacterSchema.strict(),
  mystery: MysterySchema.strict(),
  monster: MonsterSchema.strict(),
  minion: MinionSchema.strict(),
  bystander: BystanderSchema.strict(),
  location: LocationSchema.strict()
};

const NOT_FOUND = { errors: [{ path: "campaignId", message: "campaign not found" }] } as const;

/**
 * Tolerated client clock skew. `op.ts` is the last-write-wins key
 * (docs/SYNC.md push step 3), so a far-future timestamp from one client
 * would otherwise win every later merge forever; anything beyond this skew
 * is clamped to the server clock.
 */
const MAX_TS_SKEW_MS = 5 * 60_000;

function clampTs(ts: string, now: number): string {
  return new Date(ts).getTime() > now + MAX_TS_SKEW_MS ? new Date(now).toISOString() : ts;
}

function ownerOf(payload: Record<string, unknown>): string | undefined {
  const owner = payload["ownerUserId"];
  return typeof owner === "string" ? owner : undefined;
}

/**
 * A Character carries no `revealed` field, so it must resolve to `undefined`
 * (absent), never `false`: `canView` treats the two differently, and coercing
 * absent to `false` would let a later authz change silently hide characters.
 */
function revealedOf(payload: Record<string, unknown>): boolean | undefined {
  const value = payload["revealed"];
  return typeof value === "boolean" ? value : undefined;
}

/**
 * exactOptionalPropertyTypes: omit ownerUserId / revealed entirely rather than
 * pass undefined.
 */
function accessCtx(
  campaignId: string,
  userId: string,
  ownerUserId: string | undefined,
  revealed?: boolean
): EntityAccessContext {
  const ctx: EntityAccessContext = { campaignId, userId };
  if (ownerUserId !== undefined) {
    ctx.ownerUserId = ownerUserId;
  }
  if (revealed !== undefined) {
    ctx.revealed = revealed;
  }
  return ctx;
}

function toWire(envelope: EntityEnvelope): SyncEnvelope {
  return {
    id: envelope.id,
    campaignId: envelope.campaignId,
    type: envelope.type,
    payload: envelope.payload,
    rev: envelope.rev,
    seq: envelope.seq,
    updatedAt: envelope.updatedAt,
    updatedBy: envelope.updatedBy,
    deleted: envelope.deleted
  };
}

/**
 * Mounted at /api/sync/:campaignId. `POST` pushes an op batch, `GET` pulls
 * rows with seq > ?since=. Both are scoped by membership (404 for a
 * non-member, so a guessed campaign id is indistinguishable from a real one)
 * and filtered per row through the authz module: a hunter only ever sees or
 * edits characters they own (docs/SECURITY.md section 3, docs/SYNC.md).
 */
export function createSyncRouter(repo: EntitiesRepo, authz: Authz): Router {
  const router = Router({ mergeParams: true });

  function readableCampaignId(req: Request, res: Response): string | undefined {
    const idResult = UuidSchema.safeParse(req.params["campaignId"]);
    if (!idResult.success) {
      res.status(400).json({ errors: [{ path: "campaignId", message: "invalid campaign id" }] });
      return undefined;
    }
    if (!authz.canReadCampaign(idResult.data, req.user!.id)) {
      res.status(404).json(NOT_FOUND);
      return undefined;
    }
    return idResult.data;
  }

  router.get("/", (req, res) => {
    const campaignId = readableCampaignId(req, res);
    if (!campaignId) {
      return;
    }

    const since = Number(req.query["since"] ?? 0);
    if (!Number.isInteger(since) || since < 0) {
      res.status(400).json({ errors: [{ path: "since", message: "since must be a non-negative integer" }] });
      return;
    }

    const userId = req.user!.id;
    const rows = repo.listSince(campaignId, since);
    const visible = rows.filter((row) =>
      authz.canView(accessCtx(campaignId, userId, ownerOf(row.payload), revealedOf(row.payload)))
    );
    // Advance lastServerSeq past every scanned row, including ones filtered out
    // for visibility, so they are never re-scanned (invariant 4 keeps them out
    // of the payload; invariant 5 requires the client store this only after it
    // commits the upserts).
    const seq = rows.length > 0 ? rows[rows.length - 1]!.seq : since;
    res.json({ rows: visible.map(toWire), seq });
  });

  router.post("/", createSyncPushRateLimiter(), (req, res) => {
    const campaignId = readableCampaignId(req, res);
    if (!campaignId) {
      return;
    }

    if (hasDangerousKeys(req.body)) {
      res.status(400).json({ errors: [{ path: "", message: "payload contains disallowed keys" }] });
      return;
    }

    const parsed = SyncPushRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json(zodErrorResponse(parsed.error));
      return;
    }

    const userId = req.user!.id;
    const applied: string[] = [];
    const conflicts: SyncConflict[] = [];

    for (const op of parsed.data.ops) {
      if (repo.isOpApplied(campaignId, op.opId)) {
        applied.push(op.opId); // idempotent replay: already applied, drop it (step 5)
        continue;
      }

      const current = repo.getById(op.entityId);
      if (current && current.campaignId !== campaignId) {
        continue; // an id may only live in one campaign; never cross the boundary
      }
      if (current && current.type !== op.type) {
        continue; // an id may never change entity type
      }
      // Authorize touching the existing row by its current owner.
      if (current && !authz.canEdit(accessCtx(campaignId, userId, ownerOf(current.payload)))) {
        continue;
      }

      const ts = clampTs(op.ts, Date.now());
      const { payload, conflict } = op.deleted
        ? { payload: current ? current.payload : op.patch, conflict: false }
        : mergePatch(current?.payload, op.patch, ts, current?.updatedAt);

      const merged = { ...payload, id: op.entityId, campaignId };
      const validated = ENTITY_SCHEMAS[op.type].safeParse(merged);
      if (!validated.success) {
        continue; // a patch that does not yield a valid entity of this type is dropped
      }
      // Authorize the resulting row too, so a hunter cannot reassign a
      // character to (or away from) another user, or write a Keeper-only entity.
      if (!authz.canEdit(accessCtx(campaignId, userId, ownerOf(validated.data as Record<string, unknown>)))) {
        continue;
      }

      repo.commit({
        campaignId,
        id: op.entityId,
        type: op.type,
        payload: validated.data,
        baseRev: op.baseRev,
        currentRev: current?.rev,
        updatedAt: ts,
        updatedBy: userId,
        deleted: op.deleted,
        opId: op.opId
      });
      applied.push(op.opId);
      if (conflict && current) {
        conflicts.push({ opId: op.opId, serverPayload: current.payload });
      }
    }

    res.json({ applied, conflicts, newSeq: repo.maxSeq(campaignId) });
  });

  return router;
}
