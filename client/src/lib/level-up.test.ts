import { describe, expect, it } from "vitest";
import type { Character, ContentPack, ImprovementDef, PlaybookDef } from "@mowc/shared";
import {
  allBasicImprovementsTaken,
  applyImprovement,
  eligibleAdvancedImprovements,
  eligibleImprovements,
  pickableMoves
} from "./level-up.js";

const RATING_BUMP: ImprovementDef = {
  id: "improvement-rating",
  text: "Get +1 to Charm, max 3",
  effect: { kind: "ratingBump", rating: "charm", amount: 1 }
};

const ADD_MOVE_FIXED: ImprovementDef = {
  id: "improvement-add-fixed",
  text: "Take a specific placeholder move",
  effect: { kind: "addMove", moveId: "move-other-1" }
};

const ADD_MOVE_PICK: ImprovementDef = {
  id: "improvement-add-pick",
  text: "Take a new placeholder move",
  effect: { kind: "addMove", moveId: null }
};

const CUSTOM: ImprovementDef = {
  id: "improvement-custom",
  text: "Mark extra experience",
  effect: { kind: "custom", description: "You gain an additional experience mark each session." }
};

const ADVANCED_BUMP: ImprovementDef = {
  id: "improvement-advanced",
  text: "Get +1 to Weird, max 3",
  effect: { kind: "ratingBump", rating: "weird", amount: 1 }
};

const PLAYBOOK: PlaybookDef = {
  id: "playbook-placeholder",
  name: "The Placeholder",
  blurb: "Test-only playbook.",
  ratingsLines: [{ charm: 1, cool: 1, sharp: 2, tough: 0, weird: -1 }],
  luckMax: 7,
  harmTrack: { max: 7, unstableAt: 4 },
  looks: [],
  moves: [{ id: "move-1", name: "Move One", trigger: "When you...", rating: "cool", outcomes: null, tags: [] }],
  movesToPick: 1,
  gearChoices: [],
  improvements: [RATING_BUMP, ADD_MOVE_FIXED, ADD_MOVE_PICK, CUSTOM],
  advancedImprovements: [ADVANCED_BUMP],
  extras: []
};

const OTHER_PLAYBOOK: PlaybookDef = {
  ...PLAYBOOK,
  id: "playbook-other",
  moves: [
    { id: "move-other-1", name: "Other Move", trigger: "When you...", rating: "tough", outcomes: null, tags: [] },
    { id: "move-other-2", name: "Second Other Move", trigger: "When you...", rating: "weird", outcomes: null, tags: [] }
  ],
  improvements: [],
  advancedImprovements: []
};

const BASIC_MOVE = { id: "basic-1", name: "Basic Move", trigger: "When you...", rating: null, outcomes: null, tags: [] };

const PACK: ContentPack = {
  id: "pack-a",
  name: "Pack A",
  author: "Tester",
  version: "1.0.0",
  playbooks: [PLAYBOOK, OTHER_PLAYBOOK],
  basicMoves: [BASIC_MOVE],
  monsterTypes: [],
  bystanderTypes: [],
  minionTypes: [],
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
    experience: 5,
    moves: ["move-1"],
    improvements: [],
    gear: [],
    extrasState: {},
    notes: "",
    ...overrides
  };
}

describe("eligibleImprovements", () => {
  it("returns every basic improvement when none are taken", () => {
    const character = makeCharacter();
    expect(eligibleImprovements(PLAYBOOK, character).map((i) => i.id)).toEqual([
      "improvement-rating",
      "improvement-add-fixed",
      "improvement-add-pick",
      "improvement-custom"
    ]);
  });

  it("excludes improvements already taken", () => {
    const character = makeCharacter({ improvements: ["improvement-rating"] });
    const ids = eligibleImprovements(PLAYBOOK, character).map((i) => i.id);
    expect(ids).not.toContain("improvement-rating");
    expect(ids).toContain("improvement-add-fixed");
  });

  it("returns an empty list once all basic improvements are taken", () => {
    const character = makeCharacter({
      improvements: ["improvement-rating", "improvement-add-fixed", "improvement-add-pick", "improvement-custom"]
    });
    expect(eligibleImprovements(PLAYBOOK, character)).toEqual([]);
  });
});

describe("allBasicImprovementsTaken / eligibleAdvancedImprovements", () => {
  it("reports advanced improvements as ineligible until every basic improvement is taken", () => {
    const character = makeCharacter({ improvements: ["improvement-rating"] });
    expect(allBasicImprovementsTaken(PLAYBOOK, character)).toBe(false);
    expect(eligibleAdvancedImprovements(PLAYBOOK, character)).toEqual([]);
  });

  it("unlocks advanced improvements once every basic improvement is taken", () => {
    const character = makeCharacter({
      improvements: ["improvement-rating", "improvement-add-fixed", "improvement-add-pick", "improvement-custom"]
    });
    expect(allBasicImprovementsTaken(PLAYBOOK, character)).toBe(true);
    expect(eligibleAdvancedImprovements(PLAYBOOK, character).map((i) => i.id)).toEqual(["improvement-advanced"]);
  });

  it("excludes advanced improvements already taken", () => {
    const character = makeCharacter({
      improvements: [
        "improvement-rating",
        "improvement-add-fixed",
        "improvement-add-pick",
        "improvement-custom",
        "improvement-advanced"
      ]
    });
    expect(eligibleAdvancedImprovements(PLAYBOOK, character)).toEqual([]);
  });
});

describe("pickableMoves", () => {
  it("lists moves from any playbook in any attached pack the character doesn't already know", () => {
    const character = makeCharacter({ moves: ["move-1"] });
    const ids = pickableMoves(character, [PACK]).map((m) => m.id);
    expect(ids).toEqual(["move-other-1", "move-other-2"]);
  });

  it("excludes moves the character already knows", () => {
    const character = makeCharacter({ moves: ["move-1", "move-other-1"] });
    const ids = pickableMoves(character, [PACK]).map((m) => m.id);
    expect(ids).toEqual(["move-other-2"]);
  });

  it("excludes basicMoves (implicit, never stored per-character)", () => {
    const character = makeCharacter({ moves: [] });
    const ids = pickableMoves(character, [PACK]).map((m) => m.id);
    expect(ids).not.toContain("basic-1");
  });
});

describe("applyImprovement", () => {
  it("produces a ratingBump patch that increments the rated stat and resets experience", () => {
    const character = makeCharacter({ experience: 5, ratings: { charm: 1, cool: 1, sharp: 2, tough: 0, weird: -1 } });

    const patch = applyImprovement(character, RATING_BUMP);

    expect(patch.ratings?.charm).toBe(2);
    expect(patch.experience).toBe(0);
    expect(patch.improvements).toEqual(["improvement-rating"]);
  });

  it("produces an addMove patch for a fixed moveId", () => {
    const character = makeCharacter();

    const patch = applyImprovement(character, ADD_MOVE_FIXED);

    expect(patch.moves).toEqual(["move-1", "move-other-1"]);
    expect(patch.experience).toBe(0);
    expect(patch.improvements).toEqual(["improvement-add-fixed"]);
  });

  it("uses chosenMoveId for an addMove improvement with moveId: null", () => {
    const character = makeCharacter();

    const patch = applyImprovement(character, ADD_MOVE_PICK, "move-other-2");

    expect(patch.moves).toEqual(["move-1", "move-other-2"]);
    expect(patch.improvements).toEqual(["improvement-add-pick"]);
  });

  it("does not add a move if moveId is null and no chosenMoveId was supplied", () => {
    const character = makeCharacter();

    const patch = applyImprovement(character, ADD_MOVE_PICK);

    expect(patch.moves).toBeUndefined();
    expect(patch.experience).toBe(0);
    expect(patch.improvements).toEqual(["improvement-add-pick"]);
  });

  it("does not duplicate a move the character already knows (patch omits moves entirely)", () => {
    const character = makeCharacter({ moves: ["move-1", "move-other-1"] });

    const patch = applyImprovement(character, ADD_MOVE_FIXED);

    expect(patch.moves).toBeUndefined();
    expect(patch.improvements).toEqual(["improvement-add-fixed"]);
  });

  it("produces a bookkeeping-only patch for a custom improvement (no automatic engine effect)", () => {
    const character = makeCharacter();

    const patch = applyImprovement(character, CUSTOM);

    expect(patch).toEqual({ improvements: ["improvement-custom"], experience: 0 });
  });

  it("always resets experience to 0 regardless of effect kind", () => {
    const character = makeCharacter({ experience: 5 });
    for (const improvement of [RATING_BUMP, ADD_MOVE_FIXED, ADD_MOVE_PICK, CUSTOM]) {
      expect(applyImprovement(character, improvement, "move-other-2").experience).toBe(0);
    }
  });
});
