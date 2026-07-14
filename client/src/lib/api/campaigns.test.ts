import { afterEach, describe, expect, it, vi } from "vitest";
import type { Campaign } from "@mowc/shared";
import {
  CampaignApiError,
  createCampaign,
  createInvite,
  getCampaign,
  listCampaigns,
  listInvites,
  redeemInvite,
  revokeInvite,
  updateCampaign
} from "./campaigns.js";

const CAMPAIGN: Campaign = {
  id: "550e8400-e29b-41d4-a716-446655440000",
  name: "The Placeholder Case",
  keeperUserId: "keeper-1",
  packIds: [],
  settings: {},
  theme: "default"
};

function mockFetch(response: Partial<Response> & { jsonBody?: unknown }): void {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({
      ok: response.ok ?? true,
      status: response.status ?? 200,
      json: () => Promise.resolve(response.jsonBody)
    })
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("listCampaigns", () => {
  it("returns the campaigns the user has a seat in", async () => {
    mockFetch({ jsonBody: [CAMPAIGN] });

    const result = await listCampaigns();

    expect(result).toEqual([CAMPAIGN]);
    expect(fetch).toHaveBeenCalledWith("/api/campaigns");
  });
});

describe("createCampaign", () => {
  it("posts the name and returns the created campaign", async () => {
    mockFetch({ status: 201, jsonBody: CAMPAIGN });

    const result = await createCampaign({ name: CAMPAIGN.name });

    expect(result).toEqual(CAMPAIGN);
    const [, init] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(init.body as string)).toEqual({ name: CAMPAIGN.name });
  });
});

describe("getCampaign", () => {
  it("fetches a campaign by id", async () => {
    mockFetch({ jsonBody: CAMPAIGN });

    const result = await getCampaign(CAMPAIGN.id);

    expect(result).toEqual(CAMPAIGN);
    expect(fetch).toHaveBeenCalledWith(`/api/campaigns/${CAMPAIGN.id}`);
  });

  it("throws CampaignApiError on a 404", async () => {
    mockFetch({ ok: false, status: 404, jsonBody: { errors: [{ path: "id", message: "campaign not found" }] } });

    await expect(getCampaign("missing")).rejects.toThrow(CampaignApiError);
  });
});

describe("updateCampaign", () => {
  it("patches the campaign and returns the updated result", async () => {
    const updated = { ...CAMPAIGN, packIds: ["550e8400-e29b-41d4-a716-446655440001"] };
    mockFetch({ jsonBody: updated });

    const result = await updateCampaign(CAMPAIGN.id, { packIds: updated.packIds });

    expect(result).toEqual(updated);
    const [url, init] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`/api/campaigns/${CAMPAIGN.id}`);
    expect(init.method).toBe("PATCH");
    expect(JSON.parse(init.body as string)).toEqual({ packIds: updated.packIds });
  });

  it("throws CampaignApiError when the caller is not the Keeper", async () => {
    mockFetch({ ok: false, status: 403, jsonBody: { errors: [{ path: "", message: "only the campaign's Keeper can do this" }] } });

    await expect(updateCampaign(CAMPAIGN.id, { packIds: [] })).rejects.toThrow(CampaignApiError);
  });
});

describe("createInvite", () => {
  it("posts to the campaign's invites route and returns the code once", async () => {
    mockFetch({ status: 201, jsonBody: { id: "invite-1", campaignId: CAMPAIGN.id, createdAt: "now", expiresAt: "later", revoked: false, code: "a".repeat(32) } });

    const result = await createInvite(CAMPAIGN.id);

    expect(result.code).toBe("a".repeat(32));
    expect(fetch).toHaveBeenCalledWith(`/api/campaigns/${CAMPAIGN.id}/invites`, { method: "POST" });
  });

  it("throws CampaignApiError when the caller is not the Keeper", async () => {
    mockFetch({ ok: false, status: 403, jsonBody: { errors: [{ path: "", message: "Keeper access required" }] } });

    await expect(createInvite(CAMPAIGN.id)).rejects.toThrow(CampaignApiError);
  });
});

describe("listInvites", () => {
  it("returns invite summaries without the raw code", async () => {
    mockFetch({ jsonBody: [{ id: "invite-1", campaignId: CAMPAIGN.id, createdAt: "now", expiresAt: "later", revoked: false }] });

    const result = await listInvites(CAMPAIGN.id);

    expect(result).toHaveLength(1);
    expect(result[0]).not.toHaveProperty("code");
  });
});

describe("revokeInvite", () => {
  it("resolves on a 204 response", async () => {
    mockFetch({ status: 204, jsonBody: undefined });

    await expect(revokeInvite(CAMPAIGN.id, "invite-1")).resolves.toBeUndefined();
    expect(fetch).toHaveBeenCalledWith(`/api/campaigns/${CAMPAIGN.id}/invites/invite-1`, { method: "DELETE" });
  });
});

describe("redeemInvite", () => {
  it("posts the code and returns the seated campaignId", async () => {
    mockFetch({ status: 200, jsonBody: { campaignId: CAMPAIGN.id } });

    const result = await redeemInvite("a".repeat(32));

    expect(result).toEqual({ campaignId: CAMPAIGN.id });
    const [url, init] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/invites/redeem");
    expect(JSON.parse(init.body as string)).toEqual({ code: "a".repeat(32) });
  });

  it("throws CampaignApiError on an invalid code", async () => {
    mockFetch({ ok: false, status: 404, jsonBody: { errors: [{ path: "code", message: "invalid or expired invite code" }] } });

    await expect(redeemInvite("bad")).rejects.toThrow(CampaignApiError);
  });
});
