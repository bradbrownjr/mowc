import { describe, expect, it } from "vitest";
import { BystanderSchema, LocationSchema, MinionSchema, MonsterSchema } from "./world.js";

const campaignId = "00000000-0000-4000-8000-000000000010";

const validMonster = {
  id: "00000000-0000-4000-8000-000000000040",
  campaignId,
  name: "Test Monster",
  harmCapacity: 8
};

describe("MonsterSchema", () => {
  it("parses a minimal monster and applies defaults", () => {
    const monster = MonsterSchema.parse(validMonster);
    expect(monster.typeId).toBeNull();
    expect(monster.powers).toEqual([]);
    expect(monster.armor).toBe(0);
    expect(monster.harmTaken).toBe(0);
    expect(monster.revealed).toBe(false);
  });

  it("parses a populated monster", () => {
    const monster = MonsterSchema.parse({
      ...validMonster,
      typeId: "monster-type-test-1",
      motivation: "to placeholder",
      powers: ["placeholder power"],
      weaknesses: ["placeholder weakness"],
      attacks: [{ name: "Test Claw", harm: 2, tags: ["placeholder"] }],
      armor: 1,
      harmTaken: 3,
      customMoves: ["Placeholder custom move."],
      revealed: true
    });
    expect(monster.attacks[0].harm).toBe(2);
  });

  it("rejects a missing harmCapacity", () => {
    const { harmCapacity: _harmCapacity, ...rest } = validMonster;
    expect(() => MonsterSchema.parse(rest)).toThrow();
  });
});

describe("MinionSchema", () => {
  it("parses a minimal minion and applies defaults", () => {
    const minion = MinionSchema.parse({
      id: "00000000-0000-4000-8000-000000000041",
      campaignId,
      name: "Test Minion",
      harmCapacity: 4
    });
    expect(minion.typeId).toBeNull();
    expect(minion.attacks).toEqual([]);
    expect(minion.revealed).toBe(false);
  });

  it("rejects a negative harmTaken", () => {
    expect(() =>
      MinionSchema.parse({
        id: "00000000-0000-4000-8000-000000000041",
        campaignId,
        name: "Test Minion",
        harmCapacity: 4,
        harmTaken: -1
      })
    ).toThrow();
  });
});

describe("BystanderSchema", () => {
  it("parses a minimal bystander and applies defaults", () => {
    const bystander = BystanderSchema.parse({
      id: "00000000-0000-4000-8000-000000000042",
      campaignId,
      name: "Test Bystander"
    });
    expect(bystander.typeId).toBeNull();
    expect(bystander.notes).toBe("");
    expect(bystander.revealed).toBe(false);
  });

  it("rejects an empty name", () => {
    expect(() =>
      BystanderSchema.parse({
        id: "00000000-0000-4000-8000-000000000042",
        campaignId,
        name: ""
      })
    ).toThrow();
  });
});

describe("LocationSchema", () => {
  it("parses a minimal location and applies defaults", () => {
    const location = LocationSchema.parse({
      id: "00000000-0000-4000-8000-000000000043",
      campaignId,
      name: "Test Location"
    });
    expect(location.typeId).toBeNull();
    expect(location.description).toBe("");
    expect(location.mapNotes).toBe("");
    expect(location.revealed).toBe(false);
  });

  it("parses a location with a typeId set", () => {
    const location = LocationSchema.parse({
      id: "00000000-0000-4000-8000-000000000044",
      campaignId,
      name: "Test Location",
      typeId: "location-type-test-1"
    });
    expect(location.typeId).toBe("location-type-test-1");
  });

  it("rejects a non-uuid id", () => {
    expect(() =>
      LocationSchema.parse({ id: "location-1", campaignId, name: "Test Location" })
    ).toThrow();
  });
});
