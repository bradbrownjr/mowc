import { Router } from "express";
import { CampaignCreateInputSchema, CampaignUpdateInputSchema, UuidSchema } from "@mowc/shared";
import { zodErrorResponse } from "../http/validation.js";
import type { Authz } from "../authz/index.js";
import { requireKeeper } from "../authz/guard.js";
import type { CampaignsRepo } from "./repo.js";

const NOT_FOUND = { errors: [{ path: "id", message: "campaign not found" }] } as const;

export function createCampaignsRouter(
  repo: CampaignsRepo,
  authz: Authz,
  isPackReadable: (packId: string, userId: string) => boolean
): Router {
  const router = Router();

  router.post("/", (req, res) => {
    const result = CampaignCreateInputSchema.strict().safeParse(req.body);
    if (!result.success) {
      res.status(400).json(zodErrorResponse(result.error));
      return;
    }

    const campaign = repo.create({ name: result.data.name, keeperUserId: req.user!.id });
    res.status(201).json(campaign);
  });

  router.get("/", (req, res) => {
    res.json(repo.listForUser(req.user!.id));
  });

  router.get("/:id", (req, res) => {
    const idResult = UuidSchema.safeParse(req.params.id);
    if (!idResult.success) {
      res.status(400).json({ errors: [{ path: "id", message: "invalid campaign id" }] });
      return;
    }

    // Membership scoping (docs/SECURITY.md section 3): 404, not 403, for a
    // non-member so a guessed UUID cannot be distinguished from a real one.
    if (!authz.canReadCampaign(idResult.data, req.user!.id)) {
      res.status(404).json(NOT_FOUND);
      return;
    }

    const campaign = repo.findById(idResult.data);
    if (!campaign) {
      res.status(404).json(NOT_FOUND);
      return;
    }

    res.json(campaign);
  });

  router.patch("/:id", (req, res) => {
    const idResult = UuidSchema.safeParse(req.params.id);
    if (!idResult.success) {
      res.status(400).json({ errors: [{ path: "id", message: "invalid campaign id" }] });
      return;
    }

    if (!requireKeeper(authz, idResult.data, req.user!.id, res, NOT_FOUND)) {
      return;
    }

    const result = CampaignUpdateInputSchema.strict().safeParse(req.body);
    if (!result.success) {
      res.status(400).json(zodErrorResponse(result.error));
      return;
    }

    // A Keeper may only attach packs they can read themselves (their own or
    // the admin's shared library). Without this, attaching an arbitrary pack
    // UUID would grant the whole campaign read access to a stranger's
    // private pack via the campaign-attached fallback in
    // GET /api/content-packs/:id (docs/SECURITY.md section 7). Ids already
    // attached are grandfathered so removals and reorders keep working even
    // if the pack's owner later deleted it.
    if (result.data.packIds) {
      const existing = repo.findById(idResult.data);
      const alreadyAttached = new Set(existing?.packIds ?? []);
      const denied = result.data.packIds.find(
        (packId) => !alreadyAttached.has(packId) && !isPackReadable(packId, req.user!.id)
      );
      if (denied) {
        res.status(400).json({
          errors: [{ path: "packIds", message: `pack ${denied} does not exist or is not yours to attach` }]
        });
        return;
      }
    }

    res.json(repo.update(idResult.data, result.data));
  });

  router.delete("/:id", (req, res) => {
    const idResult = UuidSchema.safeParse(req.params.id);
    if (!idResult.success) {
      res.status(400).json({ errors: [{ path: "id", message: "invalid campaign id" }] });
      return;
    }

    if (!requireKeeper(authz, idResult.data, req.user!.id, res, NOT_FOUND)) {
      return;
    }

    repo.remove(idResult.data);
    res.status(204).send();
  });

  return router;
}
