/**
 * Pure state-assembly and step-completeness logic for the mystery builder
 * wizard (client/src/routes/campaigns/[id]/mysteries/new/+page.svelte).
 * Mirrors character-builder.ts/monster-builder.ts's shape so it's
 * unit-testable without a browser. Unlike those builders, cast and location
 * ids are not pack-sourced: they reference Monster/Minion/Bystander/Location
 * entities already created in this campaign (loaded from local IndexedDB by
 * the route), so there is no flatten-from-packs helper here.
 */
import type { CountdownStep, Mystery, MysteryStatus } from "@mowc/shared";

export interface MysteryWizardState {
  title: string;
  concept: string;
  hook: string;
  countdownSteps: CountdownStep[];
  monsterIds: string[];
  minionIds: string[];
  bystanderIds: string[];
  locationIds: string[];
  status: MysteryStatus;
}

export function emptyMysteryWizardState(): MysteryWizardState {
  return {
    title: "",
    concept: "",
    hook: "",
    countdownSteps: [],
    monsterIds: [],
    minionIds: [],
    bystanderIds: [],
    locationIds: [],
    status: "draft"
  };
}

export function isTitleStepComplete(state: MysteryWizardState): boolean {
  return state.title.trim().length > 0;
}

/** Concept and hook both default to "" (MysterySchema), so this step is optional. */
export function isConceptHookStepComplete(_state: MysteryWizardState): boolean {
  return true;
}

/** Countdown is optional (default []), but any step present must have a label. */
export function isCountdownStepComplete(state: MysteryWizardState): boolean {
  return state.countdownSteps.every((step) => step.label.trim().length > 0);
}

/** Cast id lists all default to []; picking cast members is optional. */
export function isCastStepComplete(_state: MysteryWizardState): boolean {
  return true;
}

/** locationIds defaults to []; picking locations is optional. */
export function isLocationsStepComplete(_state: MysteryWizardState): boolean {
  return true;
}

/** status defaults to "draft"; always complete. */
export function isStatusStepComplete(_state: MysteryWizardState): boolean {
  return true;
}

export function isReviewStepComplete(state: MysteryWizardState): boolean {
  return (
    isTitleStepComplete(state) &&
    isConceptHookStepComplete(state) &&
    isCountdownStepComplete(state) &&
    isCastStepComplete(state) &&
    isLocationsStepComplete(state) &&
    isStatusStepComplete(state)
  );
}

/** Appends a blank countdown step for the UI to fill in. */
export function addCountdownStep(state: MysteryWizardState): MysteryWizardState {
  return { ...state, countdownSteps: [...state.countdownSteps, { label: "", text: "", done: false }] };
}

export function removeCountdownStep(state: MysteryWizardState, index: number): MysteryWizardState {
  return { ...state, countdownSteps: state.countdownSteps.filter((_, i) => i !== index) };
}

/** Swaps a countdown step with its neighbor in `direction`; out-of-range is a no-op. */
export function moveCountdownStep(state: MysteryWizardState, index: number, direction: -1 | 1): MysteryWizardState {
  const target = index + direction;
  if (target < 0 || target >= state.countdownSteps.length) {
    return state;
  }
  const steps = [...state.countdownSteps];
  const moved = steps[index]!;
  steps[index] = steps[target]!;
  steps[target] = moved;
  return { ...state, countdownSteps: steps };
}

/** Toggles an id's membership in a cast/location id list (add if absent, remove if present). */
export function toggleCastId(ids: string[], id: string): string[] {
  return ids.includes(id) ? ids.filter((existing) => existing !== id) : [...ids, id];
}

/**
 * Assembles the full Mystery payload from completed wizard state, or
 * returns null if any required step is still incomplete (defense in depth;
 * the wizard's own step guards should never let this happen). Countdown step
 * text is trimmed on submit; keeperNotes starts empty (edited later from the
 * mystery sheet, not part of creation).
 */
export function buildMysteryPayload(params: {
  id: string;
  campaignId: string;
  state: MysteryWizardState;
}): Mystery | null {
  const { id, campaignId, state } = params;
  if (!isReviewStepComplete(state)) {
    return null;
  }

  return {
    id,
    campaignId,
    title: state.title.trim(),
    concept: state.concept.trim(),
    hook: state.hook.trim(),
    status: state.status,
    countdown: {
      steps: state.countdownSteps.map((step) => ({
        label: step.label.trim(),
        text: step.text.trim(),
        done: step.done
      }))
    },
    locationIds: state.locationIds,
    monsterIds: state.monsterIds,
    minionIds: state.minionIds,
    bystanderIds: state.bystanderIds,
    keeperNotes: "",
    revealed: false
  };
}
