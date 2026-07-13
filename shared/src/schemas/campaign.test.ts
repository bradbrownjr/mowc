import { describe, expect, it } from "vitest";
import { CampaignSchema, SeatSchema } from "./campaign.js";

const campaignId = "00000000-0000-4000-8000-000000000010";
const packId = "00000000-0000-4000-8000-000000000001";

describe("CampaignSchema", () => {
  it("parses a minimal campaign and applies defaults", () => {
    const campaign = CampaignSchema.parse({
      id: campaignId,
      name: "Test Campaign",
      keeperUserId: "user-keeper-1"
    });
    expect(campaign.packIds).toEqual([]);
    expect(campaign.settings).toEqual({});
    expect(campaign.theme).toBe("default");
  });

  it("parses a campaign with pack ids and settings", () => {
    const campaign = CampaignSchema.parse({
      id: campaignId,
      name: "Test Campaign",
      keeperUserId: "user-keeper-1",
      packIds: [packId],
      settings: { placeholderOption: true },
      theme: "midnight"
    });
    expect(campaign.packIds).toEqual([packId]);
  });

  it("rejects a non-uuid pack id", () => {
    expect(() =>
      CampaignSchema.parse({
        id: campaignId,
        name: "Test Campaign",
        keeperUserId: "user-keeper-1",
        packIds: ["not-a-uuid"]
      })
    ).toThrow();
  });
});

describe("SeatSchema", () => {
  it("parses keeper and hunter seats", () => {
    const keeper = SeatSchema.parse({
      campaignId,
      userId: "user-keeper-1",
      role: "keeper"
    });
    const hunter = SeatSchema.parse({
      campaignId,
      userId: "user-hunter-1",
      role: "hunter"
    });
    expect(keeper.role).toBe("keeper");
    expect(hunter.role).toBe("hunter");
  });

  it("rejects an unknown role", () => {
    expect(() =>
      SeatSchema.parse({ campaignId, userId: "user-1", role: "spectator" })
    ).toThrow();
  });
});
