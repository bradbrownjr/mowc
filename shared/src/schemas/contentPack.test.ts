import { describe, expect, it } from "vitest";
import {
  ArchetypeDefSchema,
  ContentPackSchema,
  ExtraDefSchema,
  ExtraSectionSchema,
  GearChoiceSchema,
  GearDefSchema,
  ImprovementDefSchema,
  MoveDefSchema,
  PACK_FORMAT,
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

describe("ArchetypeDefSchema", () => {
  it("parses a valid archetype", () => {
    const def = ArchetypeDefSchema.parse({
      id: "monster-type-test-1",
      name: "Test Archetype",
      motivation: "to placeholder"
    });
    expect(def.motivation).toBe("to placeholder");
  });

  it("defaults a missing motivation to empty string", () => {
    const def = ArchetypeDefSchema.parse({ id: "type-test-1", name: "Test Bystander Type" });
    expect(def.motivation).toBe("");
  });

  it("rejects an empty name", () => {
    expect(() => ArchetypeDefSchema.parse({ id: "type-test-1", name: "" })).toThrow();
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

  it("parses a composite extra with pick and text sections", () => {
    const composite = ExtraDefSchema.parse({
      kind: "composite",
      id: "extra-test-5",
      title: "Test Destiny Widget",
      text: "A placeholder intro blurb for the widget.",
      sections: [
        {
          kind: "pick",
          id: "section-test-1",
          title: "Test Pick Section",
          pick: 2,
          options: ["Placeholder option A", "Placeholder option B", "Placeholder option C"]
        },
        {
          kind: "text",
          id: "section-test-2",
          title: "Test Text Section",
          prompt: "Describe your placeholder in a few words."
        }
      ]
    });
    expect(composite.kind).toBe("composite");
    if (composite.kind === "composite") {
      expect(composite.sections).toHaveLength(2);
      expect(composite.suggestions).toEqual([]);
    }
  });

  it("parses a composite extra with a prose pick rule and suggestions", () => {
    const composite = ExtraDefSchema.parse({
      kind: "composite",
      id: "extra-test-6",
      title: "Test Loadout Widget",
      sections: [
        {
          kind: "pick",
          id: "section-test-3",
          title: "Test Prose Pick",
          pick: "one base and one extra, or two bases",
          options: ["Base: test prod", "Extra: test glitter"]
        }
      ],
      suggestions: ["Test Combo: base test prod plus extra test glitter."]
    });
    if (composite.kind === "composite") {
      expect(composite.text).toBe("");
      expect(composite.suggestions).toHaveLength(1);
    }
  });

  it("rejects a composite extra whose section has an unknown kind", () => {
    expect(() =>
      ExtraDefSchema.parse({
        kind: "composite",
        id: "extra-test-7",
        title: "Broken Widget",
        sections: [{ kind: "slider", id: "section-test-4", title: "Broken" }]
      })
    ).toThrow();
  });
});

describe("ExtraSectionSchema", () => {
  it("rejects a pick section with pick of zero", () => {
    expect(() =>
      ExtraSectionSchema.parse({
        kind: "pick",
        id: "section-test-5",
        title: "Broken Pick",
        pick: 0,
        options: ["Placeholder option"]
      })
    ).toThrow();
  });

  it("rejects a text section without a prompt", () => {
    expect(() =>
      ExtraSectionSchema.parse({ kind: "text", id: "section-test-6", title: "Broken Text" })
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

  it("defaults the reference-content fields on a minimal pack", () => {
    const pack = ContentPackSchema.parse({
      id: "00000000-0000-4000-8000-000000000001",
      name: "Test Pack",
      author: "Test Author",
      version: "1.0.0"
    });
    expect(pack.$format).toBeUndefined();
    expect(pack.license).toBeUndefined();
    expect(pack.conversionNotes).toBeUndefined();
    expect(pack.locationTypes).toEqual([]);
    expect(pack.hunterAgenda).toBeUndefined();
    expect(pack.keeperAgenda).toBeUndefined();
    expect(pack.coreRules).toBeUndefined();
    expect(pack.keeperMoves).toBeUndefined();
    expect(pack.mysteryCreation).toBeUndefined();
    expect(pack.monsterGuidance).toBeUndefined();
  });

  it("parses a pack with format tag, license, and conversion notes", () => {
    const pack = ContentPackSchema.parse({
      id: "00000000-0000-4000-8000-000000000002",
      name: "Test Pack",
      author: "Test Author",
      version: "1.0.0",
      $format: PACK_FORMAT,
      license: "Placeholder license text for tests only.",
      conversionNotes: ["The placeholder gizmo's name was unreadable in the test source."]
    });
    expect(pack.$format).toBe("mowc-content-pack/v1");
    expect(pack.conversionNotes).toHaveLength(1);
  });

  it("rejects an unknown format tag", () => {
    expect(() =>
      ContentPackSchema.parse({
        id: "00000000-0000-4000-8000-000000000003",
        name: "Test Pack",
        author: "Test Author",
        version: "1.0.0",
        $format: "mowc-content-pack/v99"
      })
    ).toThrow();
  });

  it("parses hunter reference content (agenda and core rules)", () => {
    const pack = ContentPackSchema.parse({
      id: "00000000-0000-4000-8000-000000000004",
      name: "Test Rules Pack",
      author: "Test Author",
      version: "1.0.0",
      hunterAgenda: ["Be a placeholder.", "Test the placeholder."],
      coreRules: {
        roll: "Roll 2d6 plus a placeholder rating.",
        harm: { max: 7, unstableAt: 4, text: "Placeholder harm rules." },
        luck: { max: 7, text: "Placeholder luck rules." },
        recovery: "Placeholder recovery rules.",
        levelingUp: "Placeholder leveling rules.",
        endOfSession: "Placeholder end-of-session rules."
      }
    });
    expect(pack.hunterAgenda).toHaveLength(2);
    expect(pack.coreRules?.harm?.max).toBe(7);
    expect(pack.coreRules?.luck?.text).toBe("Placeholder luck rules.");
  });

  it("parses keeper reference content", () => {
    const pack = ContentPackSchema.parse({
      id: "00000000-0000-4000-8000-000000000005",
      name: "Test Keeper Pack",
      author: "Test Author",
      version: "1.0.0",
      keeperAgenda: ["Make the placeholder seem real"],
      keeperPrinciples: ["Test everything twice"],
      alwaysSay: ["What the test demands"],
      keeperMoves: {
        basic: ["Separate the placeholders"],
        monster: ["Hint at the test monster's presence"],
        minion: ["Send a test goon"],
        bystander: ["Get in the way"],
        location: ["Present a placeholder hazard"],
        harm: {
          note: "Every time a placeholder gets hurt, use one.",
          tiers: [
            { label: "0-harm or more", effects: ["Momentarily placeholdered"] },
            { label: "8-harm or more", effects: ["The test dummy is destroyed."] }
          ]
        }
      },
      mysteryCreation: {
        steps: [
          { step: "Test Concept", prompts: ["A placeholder from a test legend."] },
          {
            step: "Test Countdown",
            prompts: ["Break the test into events."],
            countdownSteps: ["Step one", "Step two"]
          }
        ]
      },
      monsterGuidance: "Name the test monster.",
      minionGuidance: "Name the test goon.",
      bystanderGuidance: "Name the test bystander.",
      locationTypes: [{ id: "location-type-test-1", name: "Test Lair", motivation: "to placeholder" }],
      locationGuidance: "Name the test location.",
      customMoveGuidance: "Describe the test move."
    });
    expect(pack.keeperMoves?.harm?.tiers).toHaveLength(2);
    expect(pack.mysteryCreation?.steps[1].countdownSteps).toEqual(["Step one", "Step two"]);
    expect(pack.locationTypes[0].motivation).toBe("to placeholder");
  });
});
