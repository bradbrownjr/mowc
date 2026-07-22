import { describe, expect, it } from "vitest";
import type { Character, ContentPack, PlaybookDef } from "@mowc/shared";
import {
  DEFAULT_HARM_TRACK,
  DEFAULT_LUCK_MAX,
  findPackForPlaybook,
  packsContainPlaybook,
  resolveCharacterMoves,
  resolveCharacterPlaybook
} from "./character-sheet.js";

const PLAYBOOK: PlaybookDef = {
  id: "playbook-placeholder",
  name: "The Placeholder",
  blurb: "Test-only playbook.",
  ratingsLines: [{ charm: 1, cool: 1, sharp: 2, tough: 0, weird: -1 }],
  luckMax: 7,
  harmTrack: { max: 7, unstableAt: 4 },
  looks: [],
  moves: [
    { id: "move-1", name: "Move One", trigger: "When you...", rating: "cool", outcomes: null, tags: [] },
    { id: "move-2", name: "Move Two", trigger: "When you...", rating: "sharp", outcomes: null, tags: [] }
  ],
  movesToPick: 1,
  gearChoices: [],
  improvements: [],
  advancedImprovements: [],
  extras: []
};

const BASIC_MOVE = { id: "basic-1", name: "Basic Move", trigger: "When you...", rating: null, outcomes: null, tags: [] };

const PACK: ContentPack = {
  id: "pack-a",
  name: "Pack A",
  author: "Tester",
  version: "1.0.0",
  playbooks: [PLAYBOOK],
  basicMoves: [BASIC_MOVE],
  monsterTypes: [],
  bystanderTypes: [],
  minionTypes: [],
  locationTypes: [],
  gear: []
};

function makeCharacter(overrides: Partial<Character> = {}): Character {
  return {
    id: "char-1",
    campaignId: "camp-1",
    ownerUserId: "user-1",
    playbookId: "playbook-placeholder",
    name: "Test Hunter",
    look: "",
    ratings: { charm: 1, cool: 1, sharp: 2, tough: 0, weird: -1 },
    luckSpent: 0,
    harm: 0,
    unstable: false,
    experience: 0,
    moves: ["move-1"],
    improvements: [],
    gear: [],
    extrasState: {},
    notes: "",
    ...overrides
  };
}

describe("resolveCharacterPlaybook", () => {
  it("finds the matching playbook and its containing pack", () => {
    const character = makeCharacter();

    const result = resolveCharacterPlaybook(character, [PACK]);

    expect(result?.playbook.id).toBe("playbook-placeholder");
    expect(result?.pack.id).toBe("pack-a");
  });

  it("searches across multiple packs in order", () => {
    const otherPack: ContentPack = { ...PACK, id: "pack-b", playbooks: [] };
    const character = makeCharacter();

    const result = resolveCharacterPlaybook(character, [otherPack, PACK]);

    expect(result?.pack.id).toBe("pack-a");
  });

  it("returns null when no attached pack contains the playbook", () => {
    const character = makeCharacter({ playbookId: "missing-playbook" });

    expect(resolveCharacterPlaybook(character, [PACK])).toBeNull();
  });

  it("returns null when there are no packs at all", () => {
    expect(resolveCharacterPlaybook(makeCharacter(), [])).toBeNull();
  });
});

describe("resolveCharacterMoves", () => {
  it("combines the pack's basicMoves with the character's picked playbook moves", () => {
    const character = makeCharacter({ moves: ["move-1"] });
    const resolved = resolveCharacterPlaybook(character, [PACK]);

    const moves = resolveCharacterMoves(character, resolved, [PACK]);

    expect(moves.map((m) => m.id)).toEqual(["basic-1", "move-1"]);
  });

  it("excludes playbook moves the character never picked", () => {
    const character = makeCharacter({ moves: ["move-1"] });
    const resolved = resolveCharacterPlaybook(character, [PACK]);

    const moves = resolveCharacterMoves(character, resolved, [PACK]);

    expect(moves.some((m) => m.id === "move-2")).toBe(false);
  });

  it("returns an empty list when the playbook could not be resolved", () => {
    const character = makeCharacter();

    expect(resolveCharacterMoves(character, null, [PACK])).toEqual([]);
  });

  it("resolves a granted move from a DIFFERENT playbook in the same pack (addMove improvement grant)", () => {
    const otherPlaybook: PlaybookDef = {
      ...PLAYBOOK,
      id: "playbook-other",
      moves: [{ id: "move-other-1", name: "Other Move", trigger: "When you...", rating: "tough", outcomes: null, tags: [] }]
    };
    const pack: ContentPack = { ...PACK, playbooks: [PLAYBOOK, otherPlaybook] };
    const character = makeCharacter({ moves: ["move-1", "move-other-1"] });
    const resolved = resolveCharacterPlaybook(character, [pack]);

    const moves = resolveCharacterMoves(character, resolved, [pack]);

    expect(moves.map((m) => m.id)).toEqual(["basic-1", "move-1", "move-other-1"]);
  });

  it("resolves a granted move from a DIFFERENT pack entirely", () => {
    const otherPack: ContentPack = {
      ...PACK,
      id: "pack-b",
      basicMoves: [],
      playbooks: [
        {
          ...PLAYBOOK,
          id: "playbook-b",
          moves: [{ id: "move-b-1", name: "Pack B Move", trigger: "When you...", rating: "weird", outcomes: null, tags: [] }]
        }
      ]
    };
    const character = makeCharacter({ moves: ["move-1", "move-b-1"] });
    const resolved = resolveCharacterPlaybook(character, [PACK, otherPack]);

    const moves = resolveCharacterMoves(character, resolved, [PACK, otherPack]);

    expect(moves.map((m) => m.id)).toEqual(["basic-1", "move-1", "move-b-1"]);
  });
});

describe("packsContainPlaybook", () => {
  it("is true when some pack defines the playbook id", () => {
    expect(packsContainPlaybook([PACK], "playbook-placeholder")).toBe(true);
  });

  it("is false when no attached pack defines it (migrate destination lacks the pack)", () => {
    expect(packsContainPlaybook([PACK], "playbook-missing")).toBe(false);
  });

  it("is false when there are no packs at all", () => {
    expect(packsContainPlaybook([], "playbook-placeholder")).toBe(false);
  });
});

describe("findPackForPlaybook", () => {
  it("returns the pack defining the playbook id", () => {
    expect(findPackForPlaybook([PACK], "playbook-placeholder")).toBe(PACK);
  });

  it("returns null when no supplied pack defines it", () => {
    expect(findPackForPlaybook([PACK], "playbook-missing")).toBeNull();
  });

  it("returns null when there are no packs at all", () => {
    expect(findPackForPlaybook([], "playbook-placeholder")).toBeNull();
  });
});

describe("fallback defaults", () => {
  it("match PlaybookDefSchema/HarmTrackSchema's own zod defaults", () => {
    expect(DEFAULT_LUCK_MAX).toBe(7);
    expect(DEFAULT_HARM_TRACK).toEqual({ max: 7, unstableAt: 4 });
  });
});
