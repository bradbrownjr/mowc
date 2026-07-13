import { describe, expect, it } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";
import { ContentPackSchema } from "./contentPack.js";

describe("example-pack.mowcpack.json fixture", () => {
  it("loads and validates against ContentPackSchema", () => {
    const packPath = resolve("content-packs/example-pack.mowcpack.json");
    const fileContent = readFileSync(packPath, "utf-8");
    const packData = JSON.parse(fileContent);

    const result = ContentPackSchema.parse(packData);

    expect(result).toBeDefined();
    expect(result.id).toBe("550e8400-e29b-41d4-a716-446655440000");
    expect(result.name).toBe("Example Placeholder Pack");
    expect(result.author).toBe("MOWC Test Fixtures");
  });

  it("contains at least 2 playbooks with required structure", () => {
    const packPath = resolve("content-packs/example-pack.mowcpack.json");
    const fileContent = readFileSync(packPath, "utf-8");
    const packData = JSON.parse(fileContent);

    const result = ContentPackSchema.parse(packData);

    expect(result.playbooks).toHaveLength(2);
    result.playbooks.forEach((playbook) => {
      expect(playbook.id).toBeDefined();
      expect(playbook.name).toBeDefined();
      expect(playbook.ratingsLines.length).toBeGreaterThanOrEqual(2);
      expect(playbook.moves.length).toBeGreaterThanOrEqual(3);
      expect(playbook.improvements.length).toBeGreaterThanOrEqual(2);
      expect(playbook.advancedImprovements.length).toBeGreaterThanOrEqual(1);
      expect(playbook.extras.length).toBeGreaterThanOrEqual(1);
    });
  });

  it("contains at least 3 basic moves", () => {
    const packPath = resolve("content-packs/example-pack.mowcpack.json");
    const fileContent = readFileSync(packPath, "utf-8");
    const packData = JSON.parse(fileContent);

    const result = ContentPackSchema.parse(packData);

    expect(result.basicMoves.length).toBeGreaterThanOrEqual(3);
  });

  it("contains at least 2 monster types with required fields", () => {
    const packPath = resolve("content-packs/example-pack.mowcpack.json");
    const fileContent = readFileSync(packPath, "utf-8");
    const packData = JSON.parse(fileContent);

    const result = ContentPackSchema.parse(packData);

    expect(result.monsterTypes.length).toBeGreaterThanOrEqual(2);
    result.monsterTypes.forEach((monsterType) => {
      expect(monsterType.id).toBeDefined();
      expect(monsterType.name).toBeDefined();
      expect(monsterType.motivation).toBeDefined();
    });
  });

  it("contains at least 2 bystander types and 2 minion types", () => {
    const packPath = resolve("content-packs/example-pack.mowcpack.json");
    const fileContent = readFileSync(packPath, "utf-8");
    const packData = JSON.parse(fileContent);

    const result = ContentPackSchema.parse(packData);

    expect(result.bystanderTypes.length).toBeGreaterThanOrEqual(2);
    expect(result.minionTypes.length).toBeGreaterThanOrEqual(2);
  });

  it("contains at least 3 gear items", () => {
    const packPath = resolve("content-packs/example-pack.mowcpack.json");
    const fileContent = readFileSync(packPath, "utf-8");
    const packData = JSON.parse(fileContent);

    const result = ContentPackSchema.parse(packData);

    expect(result.gear.length).toBeGreaterThanOrEqual(3);
  });

  it("uses only obviously invented placeholder content", () => {
    const packPath = resolve("content-packs/example-pack.mowcpack.json");
    const fileContent = readFileSync(packPath, "utf-8");
    const packData = JSON.parse(fileContent);

    const result = ContentPackSchema.parse(packData);

    expect(result.author).toBe("MOWC Test Fixtures");
    expect(result.name).toContain("Placeholder");

    const playbook = result.playbooks[0];
    expect(playbook.name).toBe("The Placeholder");
    expect(playbook.moves.some((move) => move.name.includes("Glowstick") || move.name.includes("Widget"))).toBe(true);
  });
});
