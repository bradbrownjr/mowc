import { describe, expect, it } from "vitest";
import type { ContentPack, PlaybookDef } from "@mowc/shared";
import {
  buildCharacterPayload,
  emptyWizardState,
  flattenPlaybooks,
  gearStepReason,
  isGearStepComplete,
  isLooksStepComplete,
  isMovesStepComplete,
  isReviewStepComplete,
  looksStepReason,
  movesStepReason,
  nameStepReason,
  playbookStepReason,
  ratingsStepReason,
  resolveScopePlaybooks,
  selectPlaybook,
  type CampaignOption,
  type WizardState
} from "./character-builder.js";

const PLAYBOOK: PlaybookDef = {
  id: "playbook-placeholder",
  name: "The Placeholder",
  blurb: "Test-only playbook.",
  ratingsLines: [{ charm: 1, cool: 1, sharp: 2, tough: 0, weird: -1 }],
  luckMax: 7,
  harmTrack: { max: 7, unstableAt: 4 },
  looks: [
    ["Option A", "Option B"],
    ["Detail 1", "Detail 2"]
  ],
  moves: [
    { id: "move-1", name: "Move One", trigger: "When you...", rating: "cool", outcomes: null, tags: [] },
    { id: "move-2", name: "Move Two", trigger: "When you...", rating: "sharp", outcomes: null, tags: [] },
    { id: "move-3", name: "Move Three", trigger: "When you...", rating: "tough", outcomes: null, tags: [] }
  ],
  movesToPick: 2,
  gearChoices: [
    {
      id: "gear-choice-1",
      label: "Choose your gear",
      pick: 1,
      options: [
        { id: "gear-1", name: "Glowstick", harm: null, armor: null, tags: [] },
        { id: "gear-2", name: "Gadget", harm: 1, armor: null, tags: [] }
      ]
    }
  ],
  improvements: [],
  advancedImprovements: [],
  extras: []
};

function completeState(): WizardState {
  return {
    playbook: PLAYBOOK,
    ratings: { charm: 1, cool: 1, sharp: 2, tough: 0, weird: -1 },
    lookChoices: ["Option A", "Detail 1"],
    moveIds: ["move-1", "move-2"],
    gearSelections: { "gear-choice-1": ["gear-1"] },
    name: "Test Hunter"
  };
}

describe("flattenPlaybooks", () => {
  it("flattens playbooks across every pack in order", () => {
    const packA: ContentPack = {
      id: "pack-a",
      name: "Pack A",
      author: "Tester",
      version: "1.0.0",
      playbooks: [PLAYBOOK],
      basicMoves: [],
      monsterTypes: [],
      bystanderTypes: [],
      minionTypes: [],
      locationTypes: [],
      gear: []
    };
    const packB: ContentPack = { ...packA, id: "pack-b", playbooks: [{ ...PLAYBOOK, id: "playbook-2" }] };

    expect(flattenPlaybooks([packA, packB]).map((p) => p.id)).toEqual(["playbook-placeholder", "playbook-2"]);
  });
});

describe("selectPlaybook", () => {
  it("resets downstream choices when a different playbook is picked", () => {
    const state = completeState();
    const otherPlaybook: PlaybookDef = { ...PLAYBOOK, id: "playbook-other" };

    const result = selectPlaybook(state, otherPlaybook);

    expect(result.playbook).toEqual(otherPlaybook);
    expect(result.ratings).toBeNull();
    expect(result.lookChoices).toEqual([]);
    expect(result.moveIds).toEqual([]);
    expect(result.gearSelections).toEqual({});
  });

  it("keeps existing state when the same playbook is re-picked", () => {
    const state = completeState();

    const result = selectPlaybook(state, PLAYBOOK);

    expect(result).toBe(state);
  });
});

describe("step completeness", () => {
  it("isLooksStepComplete requires a non-empty choice per look group", () => {
    const state = { ...completeState(), lookChoices: ["Option A"] };
    expect(isLooksStepComplete(state)).toBe(false);
    expect(isLooksStepComplete(completeState())).toBe(true);
  });

  it("isMovesStepComplete requires exactly movesToPick moves", () => {
    expect(isMovesStepComplete({ ...completeState(), moveIds: ["move-1"] })).toBe(false);
    expect(isMovesStepComplete({ ...completeState(), moveIds: ["move-1", "move-2", "move-3"] })).toBe(false);
    expect(isMovesStepComplete(completeState())).toBe(true);
  });

  it("isGearStepComplete requires exactly `pick` selections per gear choice", () => {
    expect(isGearStepComplete({ ...completeState(), gearSelections: {} })).toBe(false);
    expect(isGearStepComplete(completeState())).toBe(true);
  });

  it("isReviewStepComplete is false until every step is done", () => {
    expect(isReviewStepComplete(emptyWizardState())).toBe(false);
    expect(isReviewStepComplete(completeState())).toBe(true);
  });
});

describe("step-incomplete reasons", () => {
  it("playbookStepReason/ratingsStepReason/nameStepReason are null once picked", () => {
    expect(playbookStepReason(emptyWizardState())).toMatch(/playbook/i);
    expect(playbookStepReason(completeState())).toBeNull();
    expect(ratingsStepReason(emptyWizardState())).toMatch(/ratings/i);
    expect(ratingsStepReason(completeState())).toBeNull();
    expect(nameStepReason({ ...completeState(), name: "" })).toMatch(/name/i);
    expect(nameStepReason(completeState())).toBeNull();
  });

  it("looksStepReason counts remaining look choices", () => {
    expect(looksStepReason({ ...completeState(), lookChoices: [] })).toBe("Fill in 2 more look choices.");
    expect(looksStepReason({ ...completeState(), lookChoices: ["Option A"] })).toBe("Fill in 1 more look choice.");
    expect(looksStepReason(completeState())).toBeNull();
  });

  it("movesStepReason counts remaining moves", () => {
    expect(movesStepReason({ ...completeState(), moveIds: [] })).toBe("Pick 2 more moves.");
    expect(movesStepReason({ ...completeState(), moveIds: ["move-1"] })).toBe("Pick 1 more move.");
    expect(movesStepReason(completeState())).toBeNull();
  });

  it("gearStepReason counts remaining gear picks", () => {
    expect(gearStepReason({ ...completeState(), gearSelections: {} })).toBe("Pick 1 more gear item.");
    expect(gearStepReason(completeState())).toBeNull();
  });
});

describe("buildCharacterPayload", () => {
  it("returns null when the wizard state is incomplete", () => {
    expect(buildCharacterPayload({ id: "id-1", campaignId: "camp-1", ownerUserId: "user-1", state: emptyWizardState() })).toBeNull();
  });

  it("assembles the full Character payload from a completed wizard", () => {
    const payload = buildCharacterPayload({
      id: "id-1",
      campaignId: "camp-1",
      ownerUserId: "user-1",
      state: completeState()
    });

    expect(payload).toEqual({
      id: "id-1",
      campaignId: "camp-1",
      ownerUserId: "user-1",
      playbookId: "playbook-placeholder",
      name: "Test Hunter",
      look: "Option A, Detail 1",
      ratings: { charm: 1, cool: 1, sharp: 2, tough: 0, weird: -1 },
      luckSpent: 0,
      harm: 0,
      unstable: false,
      experience: 0,
      moves: ["move-1", "move-2"],
      improvements: [],
      gear: [{ id: "gear-1", name: "Glowstick", harm: null, armor: null, tags: [] }],
      extrasState: {},
      notes: ""
    });
  });

  it("trims the name and excludes basicMoves-style ids that were never picked", () => {
    const state = { ...completeState(), name: "  Trimmed  " };

    const payload = buildCharacterPayload({ id: "id-1", campaignId: "camp-1", ownerUserId: "user-1", state });

    expect(payload?.name).toBe("Trimmed");
    expect(payload?.moves).toEqual(["move-1", "move-2"]);
  });

  it("assembles a standalone (campaignId null) payload the same way", () => {
    const payload = buildCharacterPayload({ id: "id-1", campaignId: null, ownerUserId: "user-1", state: completeState() });

    expect(payload?.campaignId).toBeNull();
  });
});

describe("resolveScopePlaybooks", () => {
  const standalonePlaybooks: PlaybookDef[] = [PLAYBOOK];
  const campaignPlaybook: PlaybookDef = { ...PLAYBOOK, id: "playbook-campaign" };
  const campaignOptions: CampaignOption[] = [
    { id: "camp-1", name: "Campaign One", playbooks: [campaignPlaybook] },
    { id: "camp-2", name: "Campaign Two", playbooks: [] }
  ];

  it("always returns the base playbooks when locked, regardless of selectedCampaignId", () => {
    expect(
      resolveScopePlaybooks({
        isLocked: true,
        selectedCampaignId: "camp-1",
        playbooks: standalonePlaybooks,
        campaignOptions
      })
    ).toBe(standalonePlaybooks);
  });

  it("returns the base playbooks when unlocked and Standalone (null) is selected", () => {
    expect(
      resolveScopePlaybooks({
        isLocked: false,
        selectedCampaignId: null,
        playbooks: standalonePlaybooks,
        campaignOptions
      })
    ).toBe(standalonePlaybooks);
  });

  it("returns the matching campaign option's playbooks when unlocked and a campaign is selected", () => {
    expect(
      resolveScopePlaybooks({
        isLocked: false,
        selectedCampaignId: "camp-1",
        playbooks: standalonePlaybooks,
        campaignOptions
      })
    ).toEqual([campaignPlaybook]);
  });

  it("returns an empty array when unlocked and the selected campaign id has no matching option", () => {
    expect(
      resolveScopePlaybooks({
        isLocked: false,
        selectedCampaignId: "camp-missing",
        playbooks: standalonePlaybooks,
        campaignOptions
      })
    ).toEqual([]);
  });
});
