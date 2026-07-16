import { describe, expect, it } from "vitest";
import {
  addCountdownStep,
  buildMysteryPayload,
  emptyMysteryWizardState,
  isCountdownStepComplete,
  isReviewStepComplete,
  isTitleStepComplete,
  moveCountdownStep,
  removeCountdownStep,
  toggleCastId,
  type MysteryWizardState
} from "./mystery-builder.js";

function completeState(): MysteryWizardState {
  return {
    title: "The Placeholder Mystery",
    concept: "Something placeholder is happening",
    hook: "The hunters get a placeholder phone call",
    countdownSteps: [{ label: "First sign", text: "A placeholder omen appears", done: false }],
    monsterIds: ["monster-1"],
    minionIds: ["minion-1"],
    bystanderIds: ["bystander-1"],
    locationIds: ["location-1"],
    status: "active"
  };
}

describe("isTitleStepComplete", () => {
  it("requires a non-blank title", () => {
    expect(isTitleStepComplete(emptyMysteryWizardState())).toBe(false);
    expect(isTitleStepComplete({ ...emptyMysteryWizardState(), title: "  " })).toBe(false);
    expect(isTitleStepComplete(completeState())).toBe(true);
  });
});

describe("isCountdownStepComplete", () => {
  it("is true with no steps", () => {
    expect(isCountdownStepComplete(emptyMysteryWizardState())).toBe(true);
  });

  it("requires every present step to have a non-blank label", () => {
    const state = { ...emptyMysteryWizardState(), countdownSteps: [{ label: "", text: "x", done: false }] };
    expect(isCountdownStepComplete(state)).toBe(false);
    expect(isCountdownStepComplete(completeState())).toBe(true);
  });
});

describe("addCountdownStep / removeCountdownStep / moveCountdownStep", () => {
  it("appends a blank step", () => {
    const result = addCountdownStep(emptyMysteryWizardState());
    expect(result.countdownSteps).toEqual([{ label: "", text: "", done: false }]);
  });

  it("removes a step by index", () => {
    const state = { ...emptyMysteryWizardState(), countdownSteps: [{ label: "A", text: "", done: false }, { label: "B", text: "", done: false }] };
    const result = removeCountdownStep(state, 0);
    expect(result.countdownSteps).toEqual([{ label: "B", text: "", done: false }]);
  });

  it("swaps a step with its neighbor", () => {
    const state = { ...emptyMysteryWizardState(), countdownSteps: [{ label: "A", text: "", done: false }, { label: "B", text: "", done: false }] };
    const result = moveCountdownStep(state, 0, 1);
    expect(result.countdownSteps.map((s) => s.label)).toEqual(["B", "A"]);
  });

  it("is a no-op when moving out of range", () => {
    const state = { ...emptyMysteryWizardState(), countdownSteps: [{ label: "A", text: "", done: false }] };
    expect(moveCountdownStep(state, 0, -1)).toBe(state);
    expect(moveCountdownStep(state, 0, 1)).toBe(state);
  });
});

describe("toggleCastId", () => {
  it("adds an absent id and removes a present one", () => {
    expect(toggleCastId([], "a")).toEqual(["a"]);
    expect(toggleCastId(["a"], "a")).toEqual([]);
    expect(toggleCastId(["a"], "b")).toEqual(["a", "b"]);
  });
});

describe("isReviewStepComplete", () => {
  it("is false until title is set, true once the wizard is complete", () => {
    expect(isReviewStepComplete(emptyMysteryWizardState())).toBe(false);
    expect(isReviewStepComplete(completeState())).toBe(true);
  });
});

describe("buildMysteryPayload", () => {
  it("returns null when the wizard state is incomplete", () => {
    expect(buildMysteryPayload({ id: "id-1", campaignId: "camp-1", state: emptyMysteryWizardState() })).toBeNull();
  });

  it("assembles the full Mystery payload from a completed wizard", () => {
    const payload = buildMysteryPayload({ id: "id-1", campaignId: "camp-1", state: completeState() });

    expect(payload).toEqual({
      id: "id-1",
      campaignId: "camp-1",
      title: "The Placeholder Mystery",
      concept: "Something placeholder is happening",
      hook: "The hunters get a placeholder phone call",
      status: "active",
      countdown: { steps: [{ label: "First sign", text: "A placeholder omen appears", done: false }] },
      locationIds: ["location-1"],
      monsterIds: ["monster-1"],
      minionIds: ["minion-1"],
      bystanderIds: ["bystander-1"],
      keeperNotes: "",
      revealed: false
    });
  });

  it("trims the title and countdown step text on submit", () => {
    const state = {
      ...completeState(),
      title: "  Trimmed  ",
      countdownSteps: [{ label: "  Step  ", text: "  text  ", done: true }]
    };

    const payload = buildMysteryPayload({ id: "id-1", campaignId: "camp-1", state });

    expect(payload?.title).toBe("Trimmed");
    expect(payload?.countdown.steps).toEqual([{ label: "Step", text: "text", done: true }]);
  });
});
