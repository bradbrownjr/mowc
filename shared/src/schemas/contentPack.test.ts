import { describe, expect, it } from "vitest";
import {
  ContentPackSchema,
  ExtraDefSchema,
  GearChoiceSchema,
  GearDefSchema,
  ImprovementDefSchema,
  MonsterTypeDefSchema,
  MoveDefSchema,
  NamedDefSchema,
  PlaybookDefSchema
} from "./contentPack.js";

const validMove = {
  id: "move-test-1",
  name: "Test Move",
  trigger: "When you test the placeholder, roll.",
  rating: "cool" as const,
  outcomes: {
    full: "Placeholder full success.",
    mixed: "Placeholder mixed result.",
    miss: "Placeholder miss."
  },
  tags: []
};

const validGear = {
  id: "gear-test-1",
  name: "Test Widget",
  harm: 2,
  armor: null,
  tags: ["placeholder"]
};

const validPlaybook = {
  id: "playbook-test-1",
  name: "The Placeholder",
  blurb: "An obviously invented playbook for tests.",
  ratingsLines: [{ charm: 1, cool: 1, sharp: 2, tough: 0, weird: -1 }],
  moves: [validMove],
  movesToPick: 1
};

describe("MoveDefSchema", () => {
  it("parses a valid rolled move", () => {
    expect(MoveDefSchema.parse(validMove)).toEqual(validMove);
  });

  it("parses a no-roll move with null rating and outcomes", () => {
    const move = MoveDefSchema.parse({
      id: "move-test-2",
      name: "Test Passive Move",
      trigger: "You always count as a placeholder.",
      rating: null,
      outcomes: null
    });
    expect(move.rating).toBeNull();
    expect(move.tags).toEqual([]);
  });

  it("rejects an unknown rating", () => {
    expect(() => MoveDefSchema.parse({ ...validMove, rating: "luck" })).toThrow();
  });
});

describe("GearDefSchema", () => {
  it("parses valid gear", () => {
    expect(GearDefSchema.parse(validGear)).toEqual(validGear);
  });

  it("rejects a non-integer harm value", () => {
    expect(() => GearDefSchema.parse({ ...validGear, harm: 1.5 })).toThrow();
  });
});

describe("NamedDefSchema", () => {
  it("parses and defaults description", () => {
    const def = NamedDefSchema.parse({ id: "type-test-1", name: "Test Bystander Type" });
    expect(def.description).toBe("");
  });

  it("rejects an empty name", () => {
    expect(() => NamedDefSchema.parse({ id: "type-test-1", name: "" })).toThrow();
  });
});

describe("MonsterTypeDefSchema", () => {
  it("parses a valid monster type", () => {
    const def = MonsterTypeDefSchema.parse({
      id: "monster-type-test-1",
      name: "Test Archetype",
      motivation: "to placeholder"
    });
    expect(def.name).toBe("Test Archetype");
  });

  it("rejects a missing motivation", () => {
    expect(() =>
      MonsterTypeDefSchema.parse({ id: "monster-type-test-1", name: "Test Archetype" })
    ).toThrow();
  });
});

describe("GearChoiceSchema", () => {
  it("parses a valid gear choice", () => {
    const choice = GearChoiceSchema.parse({
      id: "choice-test-1",
      label: "Test loadout",
      pick: 2,
      options: [validGear]
    });
    expect(choice.options).toHaveLength(1);
  });

  it("rejects pick of zero", () => {
    expect(() =>
      GearChoiceSchema.parse({ id: "choice-test-1", label: "Test loadout", pick: 0, options: [] })
    ).toThrow();
  });
});

describe("ImprovementDefSchema", () => {
  it("parses each effect kind", () => {
    const bump = ImprovementDefSchema.parse({
      id: "imp-test-1",
      text: "Get +1 placeholder rating",
      effect: { kind: "ratingBump", rating: "weird", amount: 1 }
    });
    const addMove = ImprovementDefSchema.parse({
      id: "imp-test-2",
      text: "Take a test move",
      effect: { kind: "addMove", moveId: null }
    });
    const custom = ImprovementDefSchema.parse({
      id: "imp-test-3",
      text: "Do a placeholder thing",
      effect: { kind: "custom", description: "Keeper adjudicates." }
    });
    expect(bump.effect.kind).toBe("ratingBump");
    expect(addMove.effect.kind).toBe("addMove");
    expect(custom.effect.kind).toBe("custom");
  });

  it("rejects an unknown effect kind", () => {
    expect(() =>
      ImprovementDefSchema.parse({
        id: "imp-test-4",
        text: "Broken",
        effect: { kind: "teleport" }
      })
    ).toThrow();
  });
});

describe("ExtraDefSchema", () => {
  it("parses each extra kind", () => {
    const checklist = ExtraDefSchema.parse({
      kind: "checklist",
      id: "extra-test-1",
      title: "Test Checklist",
      items: ["placeholder item"]
    });
    const counter = ExtraDefSchema.parse({
      kind: "counter",
      id: "extra-test-2",
      title: "Test Counter",
      max: 5
    });
    const text = ExtraDefSchema.parse({
      kind: "text",
      id: "extra-test-3",
      title: "Test Notes Block"
    });
    expect(checklist.kind).toBe("checklist");
    expect(counter.kind).toBe("counter");
    expect(text.kind).toBe("text");
  });

  it("rejects a checklist without items", () => {
    expect(() =>
      ExtraDefSchema.parse({ kind: "checklist", id: "extra-test-4", title: "Broken" })
    ).toThrow();
  });
});

describe("PlaybookDefSchema", () => {
  it("parses a minimal playbook and applies defaults", () => {
    const playbook = PlaybookDefSchema.parse(validPlaybook);
    expect(playbook.luckMax).toBe(7);
    expect(playbook.harmTrack).toEqual({ max: 7, unstableAt: 4 });
    expect(playbook.looks).toEqual([]);
    expect(playbook.improvements).toEqual([]);
  });

  it("rejects a playbook without ratings lines", () => {
    const { ratingsLines: _ratingsLines, ...rest } = validPlaybook;
    expect(() => PlaybookDefSchema.parse(rest)).toThrow();
  });
});

describe("ContentPackSchema", () => {
  it("parses a minimal pack and defaults the def arrays", () => {
    const pack = ContentPackSchema.parse({
      id: "00000000-0000-4000-8000-000000000001",
      name: "Test Pack",
      author: "Test Author",
      version: "1.0.0"
    });
    expect(pack.playbooks).toEqual([]);
    expect(pack.basicMoves).toEqual([]);
    expect(pack.gear).toEqual([]);
  });

  it("parses a populated pack", () => {
    const pack = ContentPackSchema.parse({
      id: "00000000-0000-4000-8000-000000000001",
      name: "Test Pack",
      author: "Test Author",
      version: "1.0.0",
      playbooks: [validPlaybook],
      basicMoves: [validMove],
      monsterTypes: [
        { id: "monster-type-test-1", name: "Test Archetype", motivation: "to placeholder" }
      ],
      bystanderTypes: [{ id: "bystander-type-test-1", name: "Test Bystander Type" }],
      minionTypes: [{ id: "minion-type-test-1", name: "Test Minion Type" }],
      gear: [validGear]
    });
    expect(pack.playbooks[0].name).toBe("The Placeholder");
  });

  it("rejects a non-uuid pack id", () => {
    expect(() =>
      ContentPackSchema.parse({ id: "pack-1", name: "Test Pack", author: "A", version: "1" })
    ).toThrow();
  });
});
