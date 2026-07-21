import { Router, type Request, type Response } from "express";
import { MigrationRequestCreateSchema, UuidSchema, type PlaybookDef } from "@mowc/shared";
import { zodErrorResponse } from "../http/validation.js";
import { hasDangerousKeys } from "../http/proto.js";
import type { Authz } from "../authz/index.js";
import { requireKeeper } from "../authz/guard.js";
import {
  createMigrationDecisionRateLimiter,
  createMigrationRequestRateLimiter
} from "../auth/rateLimit.js";
import type { EntitiesRepo } from "./repo.js";
import { toMigrationRequestWire, type MigrationRequestsRepo } from "./migrationRequests.js";

/**
 * HTTP surface for Keeper-approved pack transfer on migration
 * (docs/adr/0003-pack-transfer-approval.md). Additive and distinct from the
 * direct `/migrate` endpoint (ADR 0002), which stays byte-compatible: a 200 there
 * always means "moved, now", while these routes model a durable pending request.
 *
 * Owner-facing (mounted at /api/characters, behind requireAuth):
 *   POST /:characterId/migrate-requests            create a held request
 *   GET  /:characterId/migrate-requests/latest     hunter poll for the outcome
 *   POST /:characterId/migrate-requests/:migrationId/cancel   owner withdrawal
 *
 * Keeper-facing (mounted at /api/campaigns/:campaignId/migrate-requests):
 *   GET  /                                          enriched pending list
 *   POST /:migrationId/approve                      attach pack + complete move
 *   POST /:migrationId/deny                          flip status only
 */

const CHARACTER_NOT_FOUND = {
  errors: [{ path: "characterId", message: "character not found" }]
} as const;

const REQUEST_NOT_FOUND = {
  errors: [{ path: "migrationId", message: "migration request not found" }]
} as const;

const CAMPAIGN_NOT_FOUND = { errors: [{ path: "campaignId", message: "campaign not found" }] } as const;

const FORBIDDEN = {
  errors: [{ path: "", message: "not allowed to move this character" }]
} as const;

const NOT_PENDING = { errors: [{ path: "", message: "request is not pending" }] } as const;

function ownerOf(payload: Record<string, unknown>): string | undefined {
  const owner = payload["ownerUserId"];
  return typeof owner === "string" ? owner : undefined;
}

export function createOwnerMigrationRequestsRouter(
  requests: MigrationRequestsRepo,
  entitiesRepo: EntitiesRepo,
  authz: Authz
): Router {
  const router = Router();

  router.post("/:characterId/migrate-requests", createMigrationRequestRateLimiter(), (req, res) => {
    const idResult = UuidSchema.safeParse(req.params["characterId"]);
    if (!idResult.success) {
      res.status(400).json({ errors: [{ path: "characterId", message: "invalid character id" }] });
      return;
    }
    if (hasDangerousKeys(req.body)) {
      res.status(400).json({ errors: [{ path: "", message: "payload contains disallowed keys" }] });
      return;
    }
    const parsed = MigrationRequestCreateSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json(zodErrorResponse(parsed.error));
      return;
    }
    const characterId = idResult.data;
    const { migrationId, destinationCampaignId, pack } = parsed.data;
    const userId = req.user!.id;

    requests.sweepExpired();

    // Idempotent replay: same migrationId returns the stored row untouched, never
    // a 409 (ADR 0003 section 4). A DIFFERENT id while one is pending 409s below.
    const existing = requests.findById(migrationId);
    if (existing) {
      res.status(200).json(toMigrationRequestWire(existing));
      return;
    }

    const current = entitiesRepo.getById(characterId);
    if (!current || current.deleted || current.type !== "character") {
      res.status(404).json(CHARACTER_NOT_FOUND);
      return;
    }
    // Owner-only plus a destination seat: identical to ADR 0002's direct-migrate
    // authz (ADR 0003 section 4/8).
    if (ownerOf(current.payload) !== userId) {
      res.status(403).json(FORBIDDEN);
      return;
    }
    if (!authz.canReadCampaign(destinationCampaignId, userId)) {
      res.status(403).json(FORBIDDEN);
      return;
    }
    const sourceBucket = current.campaignId;
    if (destinationCampaignId === sourceBucket) {
      res.status(400).json({
        errors: [{ path: "destinationCampaignId", message: "destination is the same as the source" }]
      });
      return;
    }
    // Never trust the client's claim: re-check the carried pack actually defines
    // this character's playbook (ADR 0003 section 3).
    const playbookId = current.payload["playbookId"];
    if (!pack.playbooks.some((playbook: PlaybookDef) => playbook.id === playbookId)) {
      res.status(400).json({
        errors: [{ path: "pack", message: "pack does not define this character's playbook" }]
      });
      return;
    }

    // At most one pending request per character (ADR 0003 section 2).
    if (requests.findPendingForSource(characterId)) {
      res.status(409).json({
        errors: [{ path: "", message: "a move is already pending for this character" }]
      });
      return;
    }

    const record = requests.create({
      migrationId,
      sourceId: characterId,
      sourceBucket,
      destinationCampaignId,
      requestedBy: userId,
      pack,
      createdAt: new Date().toISOString()
    });
    res.status(201).json(toMigrationRequestWire(record));
  });

  router.get("/:characterId/migrate-requests/latest", (req, res) => {
    const idResult = UuidSchema.safeParse(req.params["characterId"]);
    if (!idResult.success) {
      res.status(400).json({ errors: [{ path: "characterId", message: "invalid character id" }] });
      return;
    }
    const characterId = idResult.data;
    const userId = req.user!.id;
    requests.sweepExpired();
    const request = requests.findLatestForCharacter(characterId);
    const current = entitiesRepo.getById(characterId);
    // The source is a tombstone after approval, but its payload still carries the
    // owner, so the owner can still poll for the outcome. Fall back to the
    // request's requestedBy when the character row is gone entirely.
    const ownerId = (current ? ownerOf(current.payload) : undefined) ?? request?.requestedBy;
    // Owner-only, 404 (not 403) so a probed id is indistinguishable.
    if (!ownerId || ownerId !== userId) {
      res.status(404).json(CHARACTER_NOT_FOUND);
      return;
    }
    res.json(request ? toMigrationRequestWire(request) : null);
  });

  router.post(
    "/:characterId/migrate-requests/:migrationId/cancel",
    createMigrationDecisionRateLimiter(),
    (req, res) => {
      const idResult = UuidSchema.safeParse(req.params["characterId"]);
      const migResult = UuidSchema.safeParse(req.params["migrationId"]);
      if (!idResult.success || !migResult.success) {
        res.status(400).json({ errors: [{ path: "", message: "invalid id" }] });
        return;
      }
      const userId = req.user!.id;
      requests.sweepExpired();
      const row = requests.findById(migResult.data);
      // Owner-only: the requester withdraws their own pending request.
      if (!row || row.sourceId !== idResult.data || row.requestedBy !== userId) {
        res.status(404).json(REQUEST_NOT_FOUND);
        return;
      }
      if (!requests.setDenied(migResult.data, userId, new Date().toISOString())) {
        res.status(409).json(NOT_PENDING);
        return;
      }
      res.json(toMigrationRequestWire(requests.findById(migResult.data)!));
    }
  );

  return router;
}

export function createKeeperMigrationRequestsRouter(
  requests: MigrationRequestsRepo,
  authz: Authz
): Router {
  const router = Router({ mergeParams: true });

  function keeperGuard(req: Request, res: Response): string | undefined {
    const idResult = UuidSchema.safeParse(req.params["campaignId"]);
    if (!idResult.success) {
      res.status(400).json({ errors: [{ path: "campaignId", message: "invalid campaign id" }] });
      return undefined;
    }
    if (!requireKeeper(authz, idResult.data, req.user!.id, res, CAMPAIGN_NOT_FOUND)) {
      return undefined;
    }
    return idResult.data;
  }

  router.get("/", (req, res) => {
    const campaignId = keeperGuard(req, res);
    if (!campaignId) {
      return;
    }
    requests.sweepExpired();
    res.json(requests.listPendingForCampaign(campaignId));
  });

  router.post("/:migrationId/approve", createMigrationDecisionRateLimiter(), (req, res) => {
    const campaignId = keeperGuard(req, res);
    if (!campaignId) {
      return;
    }
    const migResult = UuidSchema.safeParse(req.params["migrationId"]);
    if (!migResult.success) {
      res.status(400).json({ errors: [{ path: "migrationId", message: "invalid migration id" }] });
      return;
    }
    const result = requests.approve({
      migrationId: migResult.data,
      campaignId,
      keeper: req.user!,
      nowIso: new Date().toISOString()
    });
    if (result.kind === "ok") {
      res.json(result.response);
      return;
    }
    if (result.kind === "notFound") {
      res.status(404).json(REQUEST_NOT_FOUND);
      return;
    }
    if (result.kind === "notPending") {
      res.status(409).json(NOT_PENDING);
      return;
    }
    // gone: the character moved or was deleted while the request sat pending.
    res.status(409).json({
      errors: [
        { path: "", message: "the character is no longer available to move; deny this request to close it" }
      ]
    });
  });

  router.post("/:migrationId/deny", createMigrationDecisionRateLimiter(), (req, res) => {
    const campaignId = keeperGuard(req, res);
    if (!campaignId) {
      return;
    }
    const migResult = UuidSchema.safeParse(req.params["migrationId"]);
    if (!migResult.success) {
      res.status(400).json({ errors: [{ path: "migrationId", message: "invalid migration id" }] });
      return;
    }
    requests.sweepExpired();
    const row = requests.findById(migResult.data);
    if (!row || row.destinationCampaignId !== campaignId) {
      res.status(404).json(REQUEST_NOT_FOUND);
      return;
    }
    if (!requests.setDenied(migResult.data, req.user!.id, new Date().toISOString())) {
      res.status(409).json(NOT_PENDING);
      return;
    }
    res.json({ migrationId: migResult.data, status: "denied" });
  });

  return router;
}
