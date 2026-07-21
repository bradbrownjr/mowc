import { describe, expect, it } from "vitest";
import type { Campaign } from "@mowc/shared";
import { splitCampaignsByRole } from "./home.js";

function campaign(name: string, keeperUserId: string): Campaign {
  return {
    id: `camp-${name}`,
    name,
    keeperUserId,
    packIds: [],
    settings: {},
    theme: "default"
  };
}

describe("splitCampaignsByRole", () => {
  it("puts campaigns the user runs in running and the rest in joined", () => {
    const campaigns = [campaign("Beta Case", "me"), campaign("Alpha Case", "other"), campaign("Gamma Case", "me")];
    const { running, joined } = splitCampaignsByRole(campaigns, "me");
    expect(running.map((c) => c.name)).toEqual(["Beta Case", "Gamma Case"]);
    expect(joined.map((c) => c.name)).toEqual(["Alpha Case"]);
  });

  it("sorts each list by name", () => {
    const campaigns = [campaign("Zed Case", "me"), campaign("Ada Case", "me")];
    const { running } = splitCampaignsByRole(campaigns, "me");
    expect(running.map((c) => c.name)).toEqual(["Ada Case", "Zed Case"]);
  });

  it("returns empty lists when there are no campaigns", () => {
    const { running, joined } = splitCampaignsByRole([], "me");
    expect(running).toEqual([]);
    expect(joined).toEqual([]);
  });
});
