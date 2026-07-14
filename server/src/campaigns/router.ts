import { Router } from "express";
import { CampaignCreateInputSchema, CampaignUpdateInputSchema, UuidSchema } from "@mowc/shared";
import { zodErrorResponse } from "../http/validation.js";
import type { CampaignsRepo } from "./repo.js";

const NOT_FOUND = { errors: [{ path: "id", message: "campaign not found" }] } as const;
const KEEPER_ONLY = { errors: [{ path: "", message: "only the campaign's Keeper can do this" }] } as const;

export function createCampaignsRouter(repo: CampaignsRepo): Router {
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
    if (!repo.hasSeat(idResult.data, req.user!.id)) {
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

    const campaign = repo.findById(idResult.data);
    if (!campaign || !repo.hasSeat(idResult.data, req.user!.id)) {
      res.status(404).json(NOT_FOUND);
      return;
    }
    if (campaign.keeperUserId !== req.user!.id) {
      res.status(403).json(KEEPER_ONLY);
      return;
    }

    const result = CampaignUpdateInputSchema.strict().safeParse(req.body);
    if (!result.success) {
      res.status(400).json(zodErrorResponse(result.error));
      return;
    }

    res.json(repo.update(idResult.data, result.data));
  });

  router.delete("/:id", (req, res) => {
    const idResult = UuidSchema.safeParse(req.params.id);
    if (!idResult.success) {
      res.status(400).json({ errors: [{ path: "id", message: "invalid campaign id" }] });
      return;
    }

    const campaign = repo.findById(idResult.data);
    if (!campaign || !repo.hasSeat(idResult.data, req.user!.id)) {
      res.status(404).json(NOT_FOUND);
      return;
    }
    if (campaign.keeperUserId !== req.user!.id) {
      res.status(403).json(KEEPER_ONLY);
      return;
    }

    repo.remove(idResult.data);
    res.status(204).send();
  });

  return router;
}
