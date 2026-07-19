import { describe, expect, it } from "vitest";
import type { ContentPack } from "@mowc/shared";
import { collectKeeperReference } from "./keeper-reference.js";

function basePack(overrides: Partial<ContentPack> = {}): ContentPack {
  return {
    id: "550e8400-e29b-41d4-a716-446655440000",
    name: "The Placeholder Pack",
    author: "Test Fixtures",
    version: "1.0.0",
    playbooks: [],
    basicMoves: [],
    monsterTypes: [],
    bystanderTypes: [],
    minionTypes: [],
    locationTypes: [],
    gear: [],
    ...overrides
  };
}

describe("collectKeeperReference", () => {
  it("aggregates agenda, principles, always-say, and keeper moves across packs in pack order", () => {
    const packA = basePack({
      keeperAgenda: ["Placeholder agenda A"],
      keeperPrinciples: ["Placeholder principle A"],
      alwaysSay: ["Placeholder line A"],
      keeperMoves: {
        basic: ["Placeholder basic A"],
        monster: ["Placeholder monster A"],
        minion: [],
        bystander: [],
        location: [],
        harm: { note: "Placeholder harm note A", tiers: [{ label: "Tier A", effects: ["Effect A"] }] }
      }
    });
    const packB = basePack({
      keeperAgenda: ["Placeholder agenda B"],
      keeperPrinciples: [],
      alwaysSay: ["Placeholder line B"],
      keeperMoves: {
        basic: ["Placeholder basic B"],
        monster: [],
        minion: ["Placeholder minion B"],
        bystander: [],
        location: [],
        harm: { note: "Placeholder harm note B", tiers: [{ label: "Tier B", effects: ["Effect B"] }] }
      }
    });

    const result = collectKeeperReference([packA, packB]);

    expect(result.agenda).toEqual(["Placeholder agenda A", "Placeholder agenda B"]);
    expect(result.principles).toEqual(["Placeholder principle A"]);
    expect(result.alwaysSay).toEqual(["Placeholder line A", "Placeholder line B"]);
    expect(result.keeperMoves.basic).toEqual(["Placeholder basic A", "Placeholder basic B"]);
    expect(result.keeperMoves.monster).toEqual(["Placeholder monster A"]);
    expect(result.keeperMoves.minion).toEqual(["Placeholder minion B"]);
    expect(result.keeperMoves.harm?.note).toBe("Placeholder harm note A\n\nPlaceholder harm note B");
    expect(result.keeperMoves.harm?.tiers).toEqual([
      { label: "Tier A", effects: ["Effect A"] },
      { label: "Tier B", effects: ["Effect B"] }
    ]);
    expect(result.isEmpty).toBe(false);
  });

  it("is empty when no attached pack carries any reference fields", () => {
    const result = collectKeeperReference([basePack(), basePack()]);

    expect(result.agenda).toEqual([]);
    expect(result.principles).toEqual([]);
    expect(result.alwaysSay).toEqual([]);
    expect(result.keeperMoves.basic).toEqual([]);
    expect(result.keeperMoves.harm).toBeUndefined();
    expect(result.isEmpty).toBe(true);
  });

  it("is empty for an empty pack list", () => {
    expect(collectKeeperReference([]).isEmpty).toBe(true);
  });
});
