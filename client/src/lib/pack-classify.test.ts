import { describe, expect, it } from "vitest";
import type { PackSummary } from "$lib/api/contentPacks.js";
import { packBadges } from "./pack-classify.js";

function makeSummary(overrides: Partial<PackSummary> = {}): PackSummary {
  return {
    id: "550e8400-e29b-41d4-a716-446655440000",
    ownerUserId: "user-1",
    visibility: "private",
    disabled: false,
    name: "The Placeholder Pack",
    author: "Test Fixtures",
    version: "1.0.0",
    playbookCount: 0,
    moveCount: 0,
    monsterTypeCount: 0,
    minionTypeCount: 0,
    bystanderTypeCount: 0,
    locationTypeCount: 0,
    hasKeeperReference: false,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides
  };
}

describe("packBadges", () => {
  it("returns no badges for a pack with neither hunter nor keeper content", () => {
    expect(packBadges(makeSummary())).toEqual([]);
  });

  it("returns only Playbook for a hunter-facing pack", () => {
    expect(packBadges(makeSummary({ playbookCount: 2 }))).toEqual([{ label: "Playbook" }]);
  });

  it("returns only Keeper reference for a pack with monster types", () => {
    expect(packBadges(makeSummary({ monsterTypeCount: 3 }))).toEqual([{ label: "Keeper reference" }]);
  });

  it("returns Keeper reference for a pack with only agenda/principles text (no archetypes)", () => {
    expect(packBadges(makeSummary({ hasKeeperReference: true }))).toEqual([{ label: "Keeper reference" }]);
  });

  it("returns both badges, Playbook first, for a mixed pack", () => {
    expect(packBadges(makeSummary({ playbookCount: 1, locationTypeCount: 1 }))).toEqual([
      { label: "Playbook" },
      { label: "Keeper reference" }
    ]);
  });
});
