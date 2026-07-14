import type { SeatRole } from "@mowc/shared";
import type { CampaignsRepo } from "../campaigns/repo.js";

/**
 * Single source of truth for "can user U see/edit entity E" (docs/SECURITY.md
 * section 3). Every route, and every Phase 4/5 entity handler and sync op,
 * resolves access through here instead of inlining role checks.
 *
 * Rules:
 *  - Keeper of a campaign sees and edits everything in it.
 *  - Hunter edits only entities they own (ownerUserId === their id) and reads
 *    entities that are revealed or that they own.
 *  - Non-member has no access. Callers map "none" to 404, not 403, so a guessed
 *    UUID cannot be distinguished from a real campaign the user is not in.
 *  - No cross-campaign access: the role is resolved per campaign from the seats
 *    table, so every decision is implicitly scoped by campaignId.
 *
 * canView/canEdit take exactly the access-relevant fields DATA-MODEL.md says
 * every campaign entity carries (campaignId, an optional ownerUserId, an
 * optional revealed flag), so Phase 4/5 handlers for Character, Mystery,
 * Monster, Location, etc. call straight in without this module changing shape.
 */
export type CampaignRole = SeatRole | "none";

export interface EntityAccessContext {
  campaignId: string;
  userId: string;
  ownerUserId?: string;
  revealed?: boolean;
}

export interface Authz {
  roleFor(campaignId: string, userId: string): CampaignRole;
  canReadCampaign(campaignId: string, userId: string): boolean;
  canManageCampaign(campaignId: string, userId: string): boolean;
  canView(ctx: EntityAccessContext): boolean;
  canEdit(ctx: EntityAccessContext): boolean;
}

export function createAuthz(campaigns: Pick<CampaignsRepo, "roleOf">): Authz {
  function roleFor(campaignId: string, userId: string): CampaignRole {
    return campaigns.roleOf(campaignId, userId) ?? "none";
  }

  return {
    roleFor,

    canReadCampaign(campaignId, userId) {
      return roleFor(campaignId, userId) !== "none";
    },

    canManageCampaign(campaignId, userId) {
      return roleFor(campaignId, userId) === "keeper";
    },

    canView({ campaignId, userId, ownerUserId, revealed }) {
      const role = roleFor(campaignId, userId);
      if (role === "none") {
        return false;
      }
      if (role === "keeper") {
        return true;
      }
      return revealed === true || ownerUserId === userId;
    },

    canEdit({ campaignId, userId, ownerUserId }) {
      const role = roleFor(campaignId, userId);
      if (role === "none") {
        return false;
      }
      if (role === "keeper") {
        return true;
      }
      return ownerUserId === userId;
    }
  };
}
