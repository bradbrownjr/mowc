import { Router, type Request, type Response } from "express";
import { InviteRedeemInputSchema } from "@mowc/shared";
import { zodErrorResponse } from "../http/validation.js";
import type { CampaignsRepo } from "../campaigns/repo.js";
import type { Authz } from "../authz/index.js";
import { requireKeeper } from "../authz/guard.js";
import type { InvitesRepo } from "./repo.js";
import { createInviteRateLimiter } from "../auth/rateLimit.js";

const CAMPAIGN_NOT_FOUND = { errors: [{ path: "campaignId", message: "campaign not found" }] } as const;

/** Mounted at /api/campaigns/:campaignId/invites; Keeper-only management. */
export function createCampaignInvitesRouter(invites: InvitesRepo, authz: Authz): Router {
  const router = Router({ mergeParams: true });

  function keeperCampaignId(req: Request, res: Response): string | undefined {
    const campaignId = req.params["campaignId"] as string;
    return requireKeeper(authz, campaignId, req.user!.id, res, CAMPAIGN_NOT_FOUND) ? campaignId : undefined;
  }

  router.post("/", (req, res) => {
    const campaignId = keeperCampaignId(req, res);
    if (!campaignId) {
      return;
    }

    const { invite, code } = invites.create(campaignId, req.user!.id);
    res.status(201).json({ ...invite, code });
  });

  router.get("/", (req, res) => {
    const campaignId = keeperCampaignId(req, res);
    if (!campaignId) {
      return;
    }

    res.json(invites.listForCampaign(campaignId));
  });

  router.delete("/:inviteId", (req, res) => {
    const campaignId = keeperCampaignId(req, res);
    if (!campaignId) {
      return;
    }

    const revoked = invites.revoke(campaignId, req.params["inviteId"] as string);
    if (!revoked) {
      res.status(404).json({ errors: [{ path: "inviteId", message: "invite not found" }] });
      return;
    }
    res.status(204).send();
  });

  return router;
}

/** Mounted at /api/invites; any authenticated user may redeem a code. */
export function createInviteRedeemRouter(campaigns: CampaignsRepo, invites: InvitesRepo): Router {
  const router = Router();

  router.post("/redeem", createInviteRateLimiter(), (req, res) => {
    const result = InviteRedeemInputSchema.strict().safeParse(req.body);
    if (!result.success) {
      res.status(400).json(zodErrorResponse(result.error));
      return;
    }

    const campaignId = invites.campaignForCode(result.data.code);
    if (!campaignId) {
      res.status(404).json({ errors: [{ path: "code", message: "invalid or expired invite code" }] });
      return;
    }

    const alreadySeated = campaigns.hasSeat(campaignId, req.user!.id);
    campaigns.addHunterSeat(campaignId, req.user!.id);
    res.status(alreadySeated ? 200 : 201).json({ campaignId });
  });

  return router;
}
