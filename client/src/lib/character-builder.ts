/**
 * Pure state-assembly and step-completeness logic for the character builder
 * wizard (client/src/routes/campaigns/[id]/characters/new/+page.svelte).
 * Extracted from the route so it can be unit-tested without a browser
 * (AGENTS.md: Svelte component testing isn't established here).
 */
import type { Character, ContentPack, GearDef, PlaybookDef, Ratings } from "@mowc/shared";

/** Selected option ids per gear-choice group, e.g. `{ "gear-choice-1": ["gear-1"] }`. */
export type GearSelections = Record<string, string[]>;

export interface WizardState {
  playbook: PlaybookDef | null;
  ratings: Ratings | null;
  /** One chosen (or typed) value per `PlaybookDef.looks[]` group, index-aligned. */
  lookChoices: string[];
  moveIds: string[];
  gearSelections: GearSelections;
  name: string;
}

export function emptyWizardState(): WizardState {
  return { playbook: null, ratings: null, lookChoices: [], moveIds: [], gearSelections: {}, name: "" };
}

/** All playbooks across every attached content pack, in pack order. */
export function flattenPlaybooks(packs: ContentPack[]): PlaybookDef[] {
  return packs.flatMap((pack) => pack.playbooks);
}

/**
 * Applies a playbook selection. Picking a different playbook than the one
 * already selected invalidates every downstream choice (ratings, looks,
 * moves, gear were all specific to the old playbook); re-picking the same
 * playbook is a no-op on the rest of the state.
 */
export function selectPlaybook(state: WizardState, playbook: PlaybookDef): WizardState {
  if (state.playbook?.id === playbook.id) {
    return state;
  }
  return { ...emptyWizardState(), playbook };
}

export function isPlaybookStepComplete(state: WizardState): boolean {
  return state.playbook !== null;
}

export function isRatingsStepComplete(state: WizardState): boolean {
  return state.ratings !== null;
}

export function isLooksStepComplete(state: WizardState): boolean {
  if (!state.playbook) return false;
  return state.playbook.looks.every((_, index) => (state.lookChoices[index] ?? "").trim().length > 0);
}

export function isMovesStepComplete(state: WizardState): boolean {
  if (!state.playbook) return false;
  return state.moveIds.length === state.playbook.movesToPick;
}

export function isGearStepComplete(state: WizardState): boolean {
  if (!state.playbook) return false;
  return state.playbook.gearChoices.every(
    (choice) => (state.gearSelections[choice.id] ?? []).length === choice.pick
  );
}

export function isNameStepComplete(state: WizardState): boolean {
  return state.name.trim().length > 0;
}

export function isReviewStepComplete(state: WizardState): boolean {
  return (
    isPlaybookStepComplete(state) &&
    isRatingsStepComplete(state) &&
    isLooksStepComplete(state) &&
    isMovesStepComplete(state) &&
    isGearStepComplete(state) &&
    isNameStepComplete(state)
  );
}

/** Resolves the picked gear option ids back to their full GearDef objects. */
function resolveGear(playbook: PlaybookDef, selections: GearSelections): GearDef[] {
  return playbook.gearChoices.flatMap((choice) => {
    const selectedIds = selections[choice.id] ?? [];
    return choice.options.filter((option) => selectedIds.includes(option.id));
  });
}

/**
 * Assembles the full Character payload from completed wizard state, or
 * returns null if any required step is still incomplete (defense in depth;
 * the wizard's own step guards should never let this happen).
 */
export function buildCharacterPayload(params: {
  id: string;
  campaignId: string;
  ownerUserId: string;
  state: WizardState;
}): Character | null {
  const { id, campaignId, ownerUserId, state } = params;
  if (!isReviewStepComplete(state) || !state.playbook || !state.ratings) {
    return null;
  }

  return {
    id,
    campaignId,
    ownerUserId,
    playbookId: state.playbook.id,
    name: state.name.trim(),
    look: state.lookChoices.join(", "),
    ratings: state.ratings,
    luckSpent: 0,
    harm: 0,
    unstable: false,
    experience: 0,
    // basicMoves are known implicitly by every hunter via the content pack
    // and are never stored per-character; only the playbook moves the
    // player picked at creation go in Character.moves.
    moves: state.moveIds,
    improvements: [],
    gear: resolveGear(state.playbook, state.gearSelections),
    extrasState: {},
    notes: ""
  };
}
