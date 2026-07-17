import { describe, expect, it } from "vitest";
import type { ArchetypeDef, ContentPack } from "@mowc/shared";
import {
  armorHarmStepReason,
  attacksStepReason,
  buildMonsterPayload,
  emptyMonsterWizardState,
  flattenMonsterTypes,
  isArmorHarmStepComplete,
  isAttacksStepComplete,
  isReviewStepComplete,
  nameStepReason,
  selectMonsterType,
  type MonsterWizardState
} from "./monster-builder.js";

const MONSTER_TYPE: ArchetypeDef = {
  id: "type-placeholder",
  name: "Test Monster",
  motivation: "To placeholder"
};

function completeState(): MonsterWizardState {
  return {
    type: MONSTER_TYPE,
    motivation: "To placeholder",
    powers: ["Placeholder power"],
    weaknesses: ["Placeholder weakness"],
    attacks: [{ name: "Placeholder claw", harm: 2, tags: ["placeholder-tag"] }],
    armor: 1,
    harmCapacity: 8,
    customMoves: ["When the Test Monster placeholders, roll +weird."],
    name: "The Test Monster"
  };
}

function makePack(overrides: Partial<ContentPack> = {}): ContentPack {
  return {
    id: "pack-a",
    name: "Pack A",
    author: "Tester",
    version: "1.0.0",
    playbooks: [],
    basicMoves: [],
    monsterTypes: [MONSTER_TYPE],
    bystanderTypes: [],
    minionTypes: [],
    locationTypes: [],
    gear: [],
    ...overrides
  };
}

describe("flattenMonsterTypes", () => {
  it("flattens monster types across every pack in order", () => {
    const packA = makePack();
    const packB = makePack({ id: "pack-b", monsterTypes: [{ ...MONSTER_TYPE, id: "type-2" }] });

    expect(flattenMonsterTypes([packA, packB]).map((t) => t.id)).toEqual(["type-placeholder", "type-2"]);
  });
});

describe("selectMonsterType", () => {
  it("prefills motivation from the type when a different type is picked", () => {
    const state = { ...emptyMonsterWizardState(), motivation: "Custom text" };
    const result = selectMonsterType(state, MONSTER_TYPE);

    expect(result.type).toEqual(MONSTER_TYPE);
    expect(result.motivation).toBe("To placeholder");
  });

  it("keeps existing state (including edited motivation) when the same type is re-picked", () => {
    const state = { ...completeState(), motivation: "Edited by the Keeper" };
    const result = selectMonsterType(state, MONSTER_TYPE);

    expect(result).toBe(state);
    expect(result.motivation).toBe("Edited by the Keeper");
  });
});

describe("isAttacksStepComplete", () => {
  it("is true with no attacks", () => {
    expect(isAttacksStepComplete(emptyMonsterWizardState())).toBe(true);
  });

  it("requires a non-empty name and a non-negative integer harm on every attack row", () => {
    expect(isAttacksStepComplete({ ...completeState(), attacks: [{ name: "", harm: 1, tags: [] }] })).toBe(false);
    expect(isAttacksStepComplete({ ...completeState(), attacks: [{ name: "Claw", harm: -1, tags: [] }] })).toBe(false);
    expect(isAttacksStepComplete(completeState())).toBe(true);
  });
});

describe("isArmorHarmStepComplete", () => {
  it("requires harmCapacity to be set (no schema default)", () => {
    expect(isArmorHarmStepComplete({ ...completeState(), harmCapacity: null })).toBe(false);
    expect(isArmorHarmStepComplete(completeState())).toBe(true);
  });

  it("rejects negative armor or harmCapacity", () => {
    expect(isArmorHarmStepComplete({ ...completeState(), armor: -1 })).toBe(false);
    expect(isArmorHarmStepComplete({ ...completeState(), harmCapacity: -1 })).toBe(false);
  });
});

describe("isReviewStepComplete", () => {
  it("is false until name and armor/harm are set, true once the wizard is complete", () => {
    expect(isReviewStepComplete(emptyMonsterWizardState())).toBe(false);
    expect(isReviewStepComplete({ ...completeState(), name: "" })).toBe(false);
    expect(isReviewStepComplete(completeState())).toBe(true);
  });
});

describe("step-incomplete reasons", () => {
  it("attacksStepReason flags malformed rows only", () => {
    expect(attacksStepReason({ ...completeState(), attacks: [{ name: "", harm: 1, tags: [] }] })).toMatch(/attack/i);
    expect(attacksStepReason(completeState())).toBeNull();
  });

  it("armorHarmStepReason explains what's missing or invalid", () => {
    expect(armorHarmStepReason({ ...completeState(), harmCapacity: null })).toMatch(/harm capacity/i);
    expect(armorHarmStepReason({ ...completeState(), armor: -1 })).toMatch(/armor/i);
    expect(armorHarmStepReason(completeState())).toBeNull();
  });

  it("nameStepReason is null once named", () => {
    expect(nameStepReason({ ...completeState(), name: "" })).toMatch(/name/i);
    expect(nameStepReason(completeState())).toBeNull();
  });
});

describe("buildMonsterPayload", () => {
  it("returns null when the wizard state is incomplete", () => {
    expect(buildMonsterPayload({ id: "id-1", campaignId: "camp-1", state: emptyMonsterWizardState() })).toBeNull();
  });

  it("assembles the full Monster payload from a completed wizard", () => {
    const payload = buildMonsterPayload({ id: "id-1", campaignId: "camp-1", state: completeState() });

    expect(payload).toEqual({
      id: "id-1",
      campaignId: "camp-1",
      name: "The Test Monster",
      typeId: "type-placeholder",
      motivation: "To placeholder",
      powers: ["Placeholder power"],
      weaknesses: ["Placeholder weakness"],
      attacks: [{ name: "Placeholder claw", harm: 2, tags: ["placeholder-tag"] }],
      armor: 1,
      harmCapacity: 8,
      harmTaken: 0,
      customMoves: ["When the Test Monster placeholders, roll +weird."],
      revealed: false
    });
  });

  it("trims the name and drops blank entries from freeform lists", () => {
    const state = {
      ...completeState(),
      name: "  Trimmed  ",
      powers: ["Power one", "  ", ""],
      weaknesses: [" Weakness one "],
      customMoves: ["", "Custom move"]
    };

    const payload = buildMonsterPayload({ id: "id-1", campaignId: "camp-1", state });

    expect(payload?.name).toBe("Trimmed");
    expect(payload?.powers).toEqual(["Power one"]);
    expect(payload?.weaknesses).toEqual(["Weakness one"]);
    expect(payload?.customMoves).toEqual(["Custom move"]);
  });

  it("defaults typeId to null when no type was picked", () => {
    const state = { ...completeState(), type: null };
    const payload = buildMonsterPayload({ id: "id-1", campaignId: "camp-1", state });

    expect(payload?.typeId).toBeNull();
  });
});
