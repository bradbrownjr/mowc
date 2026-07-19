import { describe, expect, it } from "vitest";
import type { ContentPack } from "@mowc/shared";
import { flattenMysteryCreation } from "./mystery-guidance.js";

/**
 * Invented placeholder pack fixtures only (AGENTS.md rule 1: no Evil Hat
 * game text in this repo, including tests).
 */
function placeholderPack(overrides: Partial<ContentPack> = {}): ContentPack {
  return {
    id: "00000000-0000-0000-0000-000000000000",
    name: "Placeholder Pack",
    author: "Placeholder Author",
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

describe("flattenMysteryCreation", () => {
  it("flattens steps across multiple packs, in pack order", () => {
    const packA = placeholderPack({
      mysteryCreation: {
        steps: [{ step: "Placeholder Step One", prompts: ["invented prompt one"] }]
      }
    });
    const packB = placeholderPack({
      mysteryCreation: {
        steps: [
          {
            step: "Placeholder Step Two",
            prompts: ["invented prompt two"],
            countdownSteps: ["invented countdown label"]
          }
        ]
      }
    });

    const steps = flattenMysteryCreation([packA, packB]);

    expect(steps).toHaveLength(2);
    expect(steps[0]).toEqual({ step: "Placeholder Step One", prompts: ["invented prompt one"] });
    expect(steps[1]).toEqual({
      step: "Placeholder Step Two",
      prompts: ["invented prompt two"],
      countdownSteps: ["invented countdown label"]
    });
  });

  it("returns an empty array when no pack has mysteryCreation", () => {
    const packs = [placeholderPack(), placeholderPack({ name: "Another Placeholder" })];

    expect(flattenMysteryCreation(packs)).toEqual([]);
  });

  it("returns an empty array for an empty pack list", () => {
    expect(flattenMysteryCreation([])).toEqual([]);
  });
});
