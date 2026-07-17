/**
 * Pure state-assembly and step-completeness logic for the monster builder
 * wizard (client/src/routes/campaigns/[id]/monsters/new/+page.svelte).
 * Mirrors character-builder.ts's shape so it's unit-testable without a
 * browser (AGENTS.md: Svelte component testing isn't established here).
 */
import type { ArchetypeDef, ContentPack, Monster, MonsterAttack } from "@mowc/shared";

export interface MonsterWizardState {
  type: ArchetypeDef | null;
  motivation: string;
  powers: string[];
  weaknesses: string[];
  attacks: MonsterAttack[];
  armor: number;
  /** No schema default (MonsterSchema.harmCapacity is required); null until set. */
  harmCapacity: number | null;
  customMoves: string[];
  name: string;
}

export function emptyMonsterWizardState(): MonsterWizardState {
  return {
    type: null,
    motivation: "",
    powers: [],
    weaknesses: [],
    attacks: [],
    armor: 0,
    harmCapacity: null,
    customMoves: [],
    name: ""
  };
}

/** All monster types (archetypes) across every attached content pack, in pack order. */
export function flattenMonsterTypes(packs: ContentPack[]): ArchetypeDef[] {
  return packs.flatMap((pack) => pack.monsterTypes);
}

/**
 * Applies a type selection, prefilling motivation from the type's own
 * motivation text (still editable afterward). Re-picking the already
 * selected type is a no-op so it never clobbers an in-progress edit to
 * motivation; picking a different type re-prefills motivation, since powers,
 * weaknesses, attacks, armor, etc. are freeform and not type-dependent.
 */
export function selectMonsterType(state: MonsterWizardState, type: ArchetypeDef): MonsterWizardState {
  if (state.type?.id === type.id) {
    return state;
  }
  return { ...state, type, motivation: type.motivation };
}

/** Type/motivation is optional: MonsterSchema.typeId is nullable, motivation defaults to "". */
export function isTypeStepComplete(_state: MonsterWizardState): boolean {
  return true;
}

/** Powers/weaknesses are optional freeform lists (both default to []). */
export function isPowersWeaknessesStepComplete(_state: MonsterWizardState): boolean {
  return true;
}

/** Attacks are optional (default []), but any row present must be well-formed. */
export function isAttacksStepComplete(state: MonsterWizardState): boolean {
  return state.attacks.every(
    (attack) => attack.name.trim().length > 0 && Number.isInteger(attack.harm) && attack.harm >= 0
  );
}

/** Armor defaults to 0; harmCapacity is REQUIRED with no default (MonsterSchema). */
export function isArmorHarmStepComplete(state: MonsterWizardState): boolean {
  return (
    Number.isInteger(state.armor) &&
    state.armor >= 0 &&
    state.harmCapacity !== null &&
    Number.isInteger(state.harmCapacity) &&
    state.harmCapacity >= 0
  );
}

/** Custom moves are an optional freeform list (defaults to []). */
export function isCustomMovesStepComplete(_state: MonsterWizardState): boolean {
  return true;
}

export function isNameStepComplete(state: MonsterWizardState): boolean {
  return state.name.trim().length > 0;
}

/**
 * One-line reasons a disabled Next button can't advance yet (docs/DESIGN.md
 * "Screen patterns"). Null once the step is complete. Type, Powers &
 * Weaknesses, and Custom Moves are always complete (optional steps), so
 * they have no reason function.
 */
export function attacksStepReason(state: MonsterWizardState): string | null {
  return isAttacksStepComplete(state) ? null : "Every attack needs a name and a harm of 0 or more.";
}

export function armorHarmStepReason(state: MonsterWizardState): string | null {
  if (state.harmCapacity === null) return "Set a harm capacity to continue.";
  if (!Number.isInteger(state.harmCapacity) || state.harmCapacity < 0) {
    return "Harm capacity must be a whole number, 0 or higher.";
  }
  if (!Number.isInteger(state.armor) || state.armor < 0) return "Armor must be a whole number, 0 or higher.";
  return null;
}

export function nameStepReason(state: MonsterWizardState): string | null {
  return state.name.trim() ? null : "Give this monster a name to continue.";
}

export function isReviewStepComplete(state: MonsterWizardState): boolean {
  return (
    isTypeStepComplete(state) &&
    isPowersWeaknessesStepComplete(state) &&
    isAttacksStepComplete(state) &&
    isArmorHarmStepComplete(state) &&
    isCustomMovesStepComplete(state) &&
    isNameStepComplete(state)
  );
}

/**
 * Assembles the full Monster payload from completed wizard state, or
 * returns null if any required step is still incomplete (defense in depth;
 * the wizard's own step guards should never let this happen). Freeform text
 * list entries are trimmed and blanks dropped on submit.
 */
export function buildMonsterPayload(params: {
  id: string;
  campaignId: string;
  state: MonsterWizardState;
}): Monster | null {
  const { id, campaignId, state } = params;
  if (!isReviewStepComplete(state) || state.harmCapacity === null) {
    return null;
  }

  return {
    id,
    campaignId,
    name: state.name.trim(),
    typeId: state.type?.id ?? null,
    motivation: state.motivation.trim(),
    powers: state.powers.map((p) => p.trim()).filter((p) => p.length > 0),
    weaknesses: state.weaknesses.map((w) => w.trim()).filter((w) => w.length > 0),
    attacks: state.attacks,
    armor: state.armor,
    harmCapacity: state.harmCapacity,
    harmTaken: 0,
    customMoves: state.customMoves.map((m) => m.trim()).filter((m) => m.length > 0),
    revealed: false
  };
}
