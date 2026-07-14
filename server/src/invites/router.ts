import { Router, type Request, type Response } from "express";
import { InviteRedeemInputSchema } from "@mowc/shared";
import { zodErrorResponse } from "../http/validation.js";
import type { CampaignsRepo } from "../campaigns/repo.js";
import type { InvitesRepo } from "./repo.js";
import { createInviteRateLimiter } from "../auth/rateLimit.js";

const CAMPAIGN_NOT_FOUND = { errors: [{ path: "campaignId", message: "campaign not found" }] } as const;
const KEEPER_ONLY = { errors: [{ path: "", message: "only the campaign's Keeper can do this" }] } as const;

/** Mounted at /api/campaigns/:campaignId/invites; Keeper-only management. */
export function createCampaignInvitesRouter(campaigns: CampaignsRepo, invites: InvitesRepo): Router {
  const router = Router({ mergeParams: true });

  /**
   * 404 for a non-member, 403 for a seated non-Keeper (docs/SECURITY.md
   * section 3): a stranger probing UUIDs can't tell a real campaign they
   * aren't in from one that doesn't exist, mirroring campaigns/router.ts.
   */
  function requireKeeper(req: Request, res: Response): string | undefined {
    const campaignId = req.params["campaignId"] as string;
    const campaign = campaigns.findById(campaignId);
    if (!campaign || !campaigns.hasSeat(campaignId, req.user!.id)) {
      res.status(404).json(CAMPAIGN_NOT_FOUND);
      return undefined;
    }
    if (campaign.keeperUserId !== req.user!.id) {
      res.status(403).json(KEEPER_ONLY);
      return undefined;
    }
    return campaignId;
  }

  router.post("/", (req, res) => {
    const campaignId = requireKeeper(req, res);
    if (!campaignId) {
      return;
    }

    const { invite, code } = invites.create(campaignId, req.user!.id);
    res.status(201).json({ ...invite, code });
  });

  router.get("/", (req, res) => {
    const campaignId = requireKeeper(req, res);
    if (!campaignId) {
      return;
    }

    res.json(invites.listForCampaign(campaignId));
  });

  router.delete("/:inviteId", (req, res) => {
    const campaignId = requireKeeper(req, res);
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
