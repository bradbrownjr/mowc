/**
 * Pure logic for the "choose your improvement" picker shown on the
 * character sheet (client/src/routes/campaigns/[id]/characters/[characterId]/+page.svelte)
 * when a character reaches EXPERIENCE_MAX. Extracted so it's unit-testable
 * without a browser (AGENTS.md: Svelte component testing isn't established
 * here).
 */
import type { Character, ContentPack, ImprovementDef, MoveDef, PlaybookDef } from "@mowc/shared";

/**
 * Basic improvements a character can currently pick from their playbook.
 * Each ImprovementDef is takeable at most once: ImprovementDefSchema has no
 * "repeatable" flag, so once-each is the simplest correct default. Real
 * Monster of the Week text sometimes marks specific improvements as
 * repeatable, but we don't have that data in our schema and can't invent it
 * (AGENTS.md rule 1: no Evil Hat game text in this repo).
 */
export function eligibleImprovements(playbook: PlaybookDef, character: Character): ImprovementDef[] {
  return playbook.improvements.filter((improvement) => !character.improvements.includes(improvement.id));
}

/** Whether every basic improvement on the playbook has already been taken. */
export function allBasicImprovementsTaken(playbook: PlaybookDef, character: Character): boolean {
  return playbook.improvements.every((improvement) => character.improvements.includes(improvement.id));
}

/**
 * Advanced improvements a character can currently pick. They only unlock
 * once every basic improvement has been taken. This is a documented engine
 * default, not sourced game text: PlaybookDefSchema has no "unlock
 * condition" field, so "all basics taken" is the generic rule the engine
 * applies (AGENTS.md rule 1: we don't have the real rule text to consult).
 */
export function eligibleAdvancedImprovements(playbook: PlaybookDef, character: Character): ImprovementDef[] {
  if (!allBasicImprovementsTaken(playbook, character)) return [];
  return playbook.advancedImprovements.filter((improvement) => !character.improvements.includes(improvement.id));
}

/**
 * Every move a character could be granted by an `addMove` improvement with
 * `moveId: null` ("player picks a move"): any playbook move, from any
 * playbook in any attached pack, the character doesn't already know.
 * basicMoves are excluded outright rather than checked against
 * character.moves: they're implicit and never stored per-character (see
 * character-builder.ts's buildCharacterPayload comment), so every hunter
 * already effectively "knows" them and granting one via an improvement
 * would be a no-op at best, confusing at worst.
 */
export function pickableMoves(character: Character, packs: ContentPack[]): MoveDef[] {
  const basicMoveIds = new Set(packs.flatMap((pack) => pack.basicMoves.map((move) => move.id)));
  const seen = new Set<string>();
  const result: MoveDef[] = [];
  for (const pack of packs) {
    for (const playbook of pack.playbooks) {
      for (const move of playbook.moves) {
        if (basicMoveIds.has(move.id) || character.moves.includes(move.id) || seen.has(move.id)) continue;
        seen.add(move.id);
        result.push(move);
      }
    }
  }
  return result;
}

/**
 * The Character patch to apply for a chosen improvement, per
 * docs/DATA-MODEL.md's ImprovementEffect kinds:
 *  - ratingBump: bumps the rated stat by `amount`.
 *  - addMove with a fixed moveId: adds that move id to character.moves.
 *  - addMove with moveId: null ("player picks a move"): adds `chosenMoveId`
 *    instead, collected by the caller from a second picker over
 *    pickableMoves() before calling this.
 *  - custom: narrative-only, no automatic mutation beyond the bookkeeping
 *    below (expected; `description` is never parsed for engine effects).
 *
 * Every case adds the improvement's id to character.improvements and resets
 * experience to 0 (leveling up consumes the mark; the Experience track is
 * capped at EXPERIENCE_MAX anyway, so this is always a clean reset, no
 * banking overflow). Returned as a single patch so callers can apply the
 * whole level-up as one Character write.
 */
export function applyImprovement(character: Character, improvement: ImprovementDef, chosenMoveId?: string): Partial<Character> {
  const improvements = [...character.improvements, improvement.id];
  const base: Partial<Character> = { improvements, experience: 0 };

  switch (improvement.effect.kind) {
    case "ratingBump": {
      const { rating, amount } = improvement.effect;
      return { ...base, ratings: { ...character.ratings, [rating]: character.ratings[rating] + amount } };
    }
    case "addMove": {
      const moveId = improvement.effect.moveId ?? chosenMoveId;
      if (!moveId || character.moves.includes(moveId)) return base;
      return { ...base, moves: [...character.moves, moveId] };
    }
    case "custom":
      return base;
  }
}
