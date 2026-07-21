import { randomUUID } from "node:crypto";
import { Router, type Request, type Response } from "express";
import type { ZodTypeAny } from "zod";
import {
  BystanderSchema,
  CharacterMigrateRequestSchema,
  CharacterSchema,
  LocationSchema,
  MinionSchema,
  MonsterSchema,
  MysterySchema,
  SyncPushRequestSchema,
  UuidSchema,
  type SyncConflict,
  type SyncEntityType,
  type SyncEnvelope,
  type SyncOp
} from "@mowc/shared";
import { zodErrorResponse } from "../http/validation.js";
import { hasDangerousKeys } from "../http/proto.js";
import type { Authz, EntityAccessContext } from "../authz/index.js";
import { createMigrationRateLimiter, createSyncPushRateLimiter } from "../auth/rateLimit.js";
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
 * A sync scope is one bucket of rows that share a `seq`/`applied_ops` partition:
 * a campaign (bucket = campaignId, role-based authz) or a user's standalone
 * space (bucket = the owner's userId, owner-only authz). Both drive the same
 * push/pull core below, so the hard-won op ordering, merge, and idempotency
 * logic exists in exactly one place.
 */
interface SyncScope {
  bucketId: string;
  userId: string;
  /** Forced onto every merged row's `campaignId`: the bucket id for a campaign, null for standalone. */
  payloadCampaignId: string | null;
  /** The strict schema for a pushed op's type, or undefined if this scope forbids that type. */
  schemaFor(type: SyncEntityType): ZodTypeAny | undefined;
  canView(ownerUserId: string | undefined, revealed: boolean | undefined): boolean;
  canEdit(ownerUserId: string | undefined): boolean;
}

function parseSince(req: Request, res: Response): number | undefined {
  const since = Number(req.query["since"] ?? 0);
  if (!Number.isInteger(since) || since < 0) {
    res.status(400).json({ errors: [{ path: "since", message: "since must be a non-negative integer" }] });
    return undefined;
  }
  return since;
}

function pullRows(repo: EntitiesRepo, scope: SyncScope, since: number): { rows: SyncEnvelope[]; seq: number } {
  const rows = repo.listSince(scope.bucketId, since);
  const visible = rows.filter((row) => scope.canView(ownerOf(row.payload), revealedOf(row.payload)));
  // Advance the cursor past every scanned row, including ones filtered out for
  // visibility, so they are never re-scanned (docs/SYNC.md invariants 4 and 5).
  const seq = rows.length > 0 ? rows[rows.length - 1]!.seq : since;
  return { rows: visible.map(toWire), seq };
}

function parsePushOps(req: Request, res: Response): SyncOp[] | undefined {
  if (hasDangerousKeys(req.body)) {
    res.status(400).json({ errors: [{ path: "", message: "payload contains disallowed keys" }] });
    return undefined;
  }
  const parsed = SyncPushRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json(zodErrorResponse(parsed.error));
    return undefined;
  }
  return parsed.data.ops;
}

function applyPushOps(
  repo: EntitiesRepo,
  scope: SyncScope,
  ops: SyncOp[]
): { applied: string[]; conflicts: SyncConflict[] } {
  const applied: string[] = [];
  const conflicts: SyncConflict[] = [];

  // The client's oplog is a Dexie table keyed by opId (a random uuid), so
  // toArray() order is arbitrary, not chronological. Without this sort, a
  // create immediately followed by an edit (both queued in the same 2s
  // debounce window, docs/SYNC.md "When sync runs") can arrive with the
  // edit's partial patch ahead of the create: `current` is still undefined,
  // the patch alone fails the type's strict schema (missing required
  // fields), and the edit is dropped silently and permanently (it is never
  // added to `applied`, but nothing re-queues a retry either). Sorting by
  // `ts` ascending, the same field already used as the LWW key, guarantees
  // every entity's ops are applied in the order they were actually written.
  const orderedOps = [...ops].sort((a, b) => a.ts.localeCompare(b.ts));

  for (const op of orderedOps) {
    if (repo.isOpApplied(scope.bucketId, op.opId)) {
      applied.push(op.opId); // idempotent replay: already applied, drop it (step 5)
      continue;
    }

    const schema = scope.schemaFor(op.type);
    if (!schema) {
      continue; // this scope does not accept this entity type (e.g. only characters are standalone)
    }

    const current = repo.getById(op.entityId);
    if (current && current.campaignId !== scope.bucketId) {
      continue; // an id may only live in one bucket; never cross the boundary
    }
    if (current && current.type !== op.type) {
      continue; // an id may never change entity type
    }
    // Authorize touching the existing row by its current owner.
    if (current && !scope.canEdit(ownerOf(current.payload))) {
      continue;
    }
    // Tombstones are terminal (ADR 0002 open risk 1): once a row is deleted, a
    // later non-delete op (e.g. a second offline device that edited the
    // character before it pulled the tombstone) must NOT resurrect it. Ack the
    // op so the client drops it from its oplog, but never commit it. Without
    // this, a migrate's source tombstone could be un-deleted, leaving the
    // character in both the source and destination buckets. A delete op onto an
    // existing tombstone still falls through to the normal path (idempotent).
    if (current && current.deleted && !op.deleted) {
      applied.push(op.opId);
      continue;
    }

    const ts = clampTs(op.ts, Date.now());
    const { payload, conflict } = op.deleted
      ? { payload: current ? current.payload : op.patch, conflict: false }
      : mergePatch(current?.payload, op.patch, ts, current?.updatedAt);

    // Force this scope's campaignId onto the row so a standalone op can never
    // smuggle a real campaign id (or a campaign op a null) past validation.
    const merged = { ...payload, id: op.entityId, campaignId: scope.payloadCampaignId };
    const validated = schema.safeParse(merged);
    if (!validated.success) {
      continue; // a patch that does not yield a valid entity of this type is dropped
    }
    // Authorize the resulting row too, so a hunter cannot reassign a
    // character to (or away from) another user, or write a Keeper-only entity.
    if (!scope.canEdit(ownerOf(validated.data as Record<string, unknown>))) {
      continue;
    }

    repo.commit({
      campaignId: scope.bucketId,
      id: op.entityId,
      type: op.type,
      payload: validated.data,
      baseRev: op.baseRev,
      currentRev: current?.rev,
      updatedAt: ts,
      updatedBy: scope.userId,
      deleted: op.deleted,
      opId: op.opId
    });
    applied.push(op.opId);
    if (conflict && current) {
      conflicts.push({ opId: op.opId, serverPayload: current.payload });
    }
  }

  return { applied, conflicts };
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

  function scopeFor(req: Request, res: Response): SyncScope | undefined {
    const idResult = UuidSchema.safeParse(req.params["campaignId"]);
    if (!idResult.success) {
      res.status(400).json({ errors: [{ path: "campaignId", message: "invalid campaign id" }] });
      return undefined;
    }
    const campaignId = idResult.data;
    const userId = req.user!.id;
    if (!authz.canReadCampaign(campaignId, userId)) {
      res.status(404).json(NOT_FOUND);
      return undefined;
    }
    return {
      bucketId: campaignId,
      userId,
      payloadCampaignId: campaignId,
      schemaFor: (type) => ENTITY_SCHEMAS[type],
      canView: (ownerUserId, revealed) => authz.canView(accessCtx(campaignId, userId, ownerUserId, revealed)),
      canEdit: (ownerUserId) => authz.canEdit(accessCtx(campaignId, userId, ownerUserId))
    };
  }

  router.get("/", (req, res) => {
    const scope = scopeFor(req, res);
    if (!scope) {
      return;
    }
    const since = parseSince(req, res);
    if (since === undefined) {
      return;
    }
    res.json(pullRows(repo, scope, since));
  });

  router.post("/", createSyncPushRateLimiter(), (req, res) => {
    const scope = scopeFor(req, res);
    if (!scope) {
      return;
    }
    const ops = parsePushOps(req, res);
    if (!ops) {
      return;
    }
    const { applied, conflicts } = applyPushOps(repo, scope, ops);
    res.json({ applied, conflicts, newSeq: repo.maxSeq(scope.bucketId) });
  });

  return router;
}

/**
 * Mounted at /api/sync/standalone. The owner-bucketed sync space for characters
 * that belong to no campaign (Character.campaignId === null). The bucket is the
 * authenticated user's own id, so `seq`/`applied_ops` partition per user and a
 * user only ever sees or edits their own standalone rows (owner-only authz, no
 * seats). Only `character` is allowed here; the five Keeper-owned world
 * entities are campaign-only by construction (docs/SYNC.md, docs/SECURITY.md).
 */
export function createStandaloneSyncRouter(repo: EntitiesRepo): Router {
  const router = Router();

  function scopeFor(req: Request): SyncScope {
    const userId = req.user!.id;
    return {
      bucketId: userId,
      userId,
      payloadCampaignId: null,
      schemaFor: (type) => (type === "character" ? ENTITY_SCHEMAS.character : undefined),
      canView: (ownerUserId) => ownerUserId === userId,
      canEdit: (ownerUserId) => ownerUserId === userId
    };
  }

  router.get("/", (req, res) => {
    const since = parseSince(req, res);
    if (since === undefined) {
      return;
    }
    res.json(pullRows(repo, scopeFor(req), since));
  });

  router.post("/", createSyncPushRateLimiter(), (req, res) => {
    const ops = parsePushOps(req, res);
    if (!ops) {
      return;
    }
    const scope = scopeFor(req);
    const { applied, conflicts } = applyPushOps(repo, scope, ops);
    res.json({ applied, conflicts, newSeq: repo.maxSeq(scope.bucketId) });
  });

  return router;
}

const CHARACTER_NOT_FOUND = {
  errors: [{ path: "characterId", message: "character not found" }]
} as const;

const MIGRATE_FORBIDDEN = {
  errors: [{ path: "", message: "not allowed to migrate this character" }]
} as const;

/**
 * The client storage key for an envelope bucket: a real campaign id, or the
 * literal "standalone" when the bucket is the owner's own user id (docs/SYNC.md
 * "Standalone characters"). A campaign id is a random uuid and never equals a
 * user id, so `bucket === userId` uniquely identifies the standalone space.
 */
function scopeForBucket(bucket: string, userId: string): string {
  return bucket === userId ? "standalone" : bucket;
}

/**
 * Mounted at /api/characters. `POST /:characterId/migrate` moves a character
 * between buckets in one transaction (ADR 0002): it tombstones the source row
 * and mints a fresh id in the destination bucket, never letting one id live in
 * two buckets. Owner-only, plus a destination-seat check for a campaign
 * destination; idempotent by the client-generated migrationId.
 */
export function createCharacterMigrationRouter(repo: EntitiesRepo, authz: Authz): Router {
  const router = Router();

  router.post("/:characterId/migrate", createMigrationRateLimiter(), (req, res) => {
    const idResult = UuidSchema.safeParse(req.params["characterId"]);
    if (!idResult.success) {
      res.status(400).json({ errors: [{ path: "characterId", message: "invalid character id" }] });
      return;
    }
    if (hasDangerousKeys(req.body)) {
      res.status(400).json({ errors: [{ path: "", message: "payload contains disallowed keys" }] });
      return;
    }
    const parsed = CharacterMigrateRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json(zodErrorResponse(parsed.error));
      return;
    }
    const characterId = idResult.data;
    const { migrationId, destinationCampaignId } = parsed.data;
    const userId = req.user!.id;

    // Idempotent replay: return the stored result, touch nothing.
    const existing = repo.findMigration(migrationId);
    if (existing) {
      res.json({
        newId: existing.newId,
        sourceId: existing.sourceId,
        sourceScope: scopeForBucket(existing.sourceBucket, existing.requestedBy),
        destScope: scopeForBucket(existing.destBucket, existing.requestedBy)
      });
      return;
    }

    const current = repo.getById(characterId);
    if (!current || current.deleted || current.type !== "character") {
      res.status(404).json(CHARACTER_NOT_FOUND);
      return;
    }
    // Owner-only: a Keeper may not migrate a hunter's character (ADR 0002 §3).
    if (ownerOf(current.payload) !== userId) {
      res.status(403).json(MIGRATE_FORBIDDEN);
      return;
    }

    // Source envelope bucket = the row's campaign_id column (the owner's user id
    // for a standalone row). Destination bucket = the target campaign id, or the
    // owner's user id when detaching to standalone.
    const sourceBucket = current.campaignId;
    const destBucket = destinationCampaignId === null ? userId : destinationCampaignId;

    // Destination-seat check for a campaign destination (any role). Standalone
    // needs no seat: it is the owner's own space.
    if (destinationCampaignId !== null && !authz.canReadCampaign(destinationCampaignId, userId)) {
      res.status(403).json(MIGRATE_FORBIDDEN);
      return;
    }
    if (destBucket === sourceBucket) {
      res.status(400).json({
        errors: [{ path: "destinationCampaignId", message: "destination is the same as the source" }]
      });
      return;
    }

    const newId = randomUUID();
    // Carry every field verbatim except id and campaignId, then validate the
    // merged row at the boundary before it is stored (ADR 0002 §4).
    const destPayload = { ...current.payload, id: newId, campaignId: destinationCampaignId };
    const validated = CharacterSchema.strict().safeParse(destPayload);
    if (!validated.success) {
      res.status(400).json(zodErrorResponse(validated.error));
      return;
    }

    const record = repo.migrateCharacter({
      migrationId,
      sourceId: characterId,
      sourceBucket,
      sourcePayload: current.payload,
      sourceRev: current.rev,
      newId,
      destBucket,
      destPayload: validated.data as Record<string, unknown>,
      requestedBy: userId,
      updatedAt: new Date().toISOString()
    });

    res.json({
      newId: record.newId,
      sourceId: record.sourceId,
      sourceScope: scopeForBucket(record.sourceBucket, userId),
      destScope: scopeForBucket(record.destBucket, userId)
    });
  });

  return router;
}
