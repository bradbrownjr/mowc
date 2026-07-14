import type { Campaign, CampaignCreateInput, CampaignUpdateInput } from "@mowc/shared";
import { ApiError, throwApiError } from "./http.js";

export { ApiError as CampaignApiError };

export interface InviteSummary {
  id: string;
  campaignId: string;
  createdAt: string;
  expiresAt: string;
  revoked: boolean;
}

/** Only the create response carries the raw code; it is never shown again. */
export interface InviteWithCode extends InviteSummary {
  code: string;
}

export async function listCampaigns(): Promise<Campaign[]> {
  const res = await fetch("/api/campaigns");
  if (!res.ok) await throwApiError(res);
  return res.json() as Promise<Campaign[]>;
}

export async function createCampaign(input: CampaignCreateInput): Promise<Campaign> {
  const res = await fetch("/api/campaigns", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input)
  });
  if (!res.ok) await throwApiError(res);
  return res.json() as Promise<Campaign>;
}

export async function getCampaign(id: string): Promise<Campaign> {
  const res = await fetch(`/api/campaigns/${encodeURIComponent(id)}`);
  if (!res.ok) await throwApiError(res);
  return res.json() as Promise<Campaign>;
}

export async function updateCampaign(id: string, patch: CampaignUpdateInput): Promise<Campaign> {
  const res = await fetch(`/api/campaigns/${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(patch)
  });
  if (!res.ok) await throwApiError(res);
  return res.json() as Promise<Campaign>;
}

export async function createInvite(campaignId: string): Promise<InviteWithCode> {
  const res = await fetch(`/api/campaigns/${encodeURIComponent(campaignId)}/invites`, { method: "POST" });
  if (!res.ok) await throwApiError(res);
  return res.json() as Promise<InviteWithCode>;
}

export async function listInvites(campaignId: string): Promise<InviteSummary[]> {
  const res = await fetch(`/api/campaigns/${encodeURIComponent(campaignId)}/invites`);
  if (!res.ok) await throwApiError(res);
  return res.json() as Promise<InviteSummary[]>;
}

export async function revokeInvite(campaignId: string, inviteId: string): Promise<void> {
  const res = await fetch(`/api/campaigns/${encodeURIComponent(campaignId)}/invites/${encodeURIComponent(inviteId)}`, {
    method: "DELETE"
  });
  if (!res.ok) await throwApiError(res);
}

export async function redeemInvite(code: string): Promise<{ campaignId: string }> {
  const res = await fetch("/api/invites/redeem", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code })
  });
  if (!res.ok) await throwApiError(res);
  return res.json() as Promise<{ campaignId: string }>;
}
