import { describe, expect, it } from "vitest";
import { CharacterSchema } from "./character.js";

const validCharacter = {
  id: "00000000-0000-4000-8000-000000000020",
  campaignId: "00000000-0000-4000-8000-000000000010",
  ownerUserId: "user-hunter-1",
  playbookId: "playbook-test-1",
  name: "Test Hunter",
  ratings: { charm: 1, cool: 1, sharp: 2, tough: 0, weird: -1 }
};

describe("CharacterSchema", () => {
  it("parses a minimal character and applies defaults", () => {
    const character = CharacterSchema.parse(validCharacter);
    expect(character.luckSpent).toBe(0);
    expect(character.harm).toBe(0);
    expect(character.unstable).toBe(false);
    expect(character.experience).toBe(0);
    expect(character.moves).toEqual([]);
    expect(character.gear).toEqual([]);
    expect(character.extrasState).toEqual({});
    expect(character.notes).toBe("");
  });

  it("parses a character with gear and moves", () => {
    const character = CharacterSchema.parse({
      ...validCharacter,
      moves: ["move-test-1"],
      gear: [{ id: "gear-test-1", name: "Test Widget", harm: 2, armor: null, tags: [] }],
      extrasState: { "extra-test-2": 3 }
    });
    expect(character.gear[0].name).toBe("Test Widget");
  });

  it("accepts a null campaignId (standalone character)", () => {
    const character = CharacterSchema.parse({ ...validCharacter, campaignId: null });
    expect(character.campaignId).toBeNull();
  });

  it("rejects a missing ratings block", () => {
    const { ratings: _ratings, ...rest } = validCharacter;
    expect(() => CharacterSchema.parse(rest)).toThrow();
  });

  it("rejects a non-integer rating", () => {
    expect(() =>
      CharacterSchema.parse({
        ...validCharacter,
        ratings: { ...validCharacter.ratings, cool: 1.5 }
      })
    ).toThrow();
  });
});
