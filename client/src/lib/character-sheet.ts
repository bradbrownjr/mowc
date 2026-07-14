/**
 * Pure logic for the read-only character sheet
 * (client/src/routes/campaigns/[id]/characters/[characterId]/+page.svelte).
 * Extracted so it's unit-testable without a browser (AGENTS.md: Svelte
 * component testing isn't established here).
 */
import type { Character, ContentPack, HarmTrack, MoveDef, PlaybookDef } from "@mowc/shared";

/**
 * PlaybookDefSchema / HarmTrackSchema's own zod defaults, used as a
 * fallback when a character's playbook can't be resolved (e.g. the pack
 * was detached from the campaign after the character was created).
 */
export const DEFAULT_LUCK_MAX = 7;
export const DEFAULT_HARM_TRACK: HarmTrack = { max: 7, unstableAt: 4 };

export interface ResolvedPlaybook {
  playbook: PlaybookDef;
  pack: ContentPack;
}

/**
 * Finds the PlaybookDef (and its containing pack, needed for basicMoves)
 * matching a character's playbookId across every content pack attached to
 * the campaign. Returns null if no attached pack contains it; callers must
 * render a graceful fallback rather than crash.
 */
export function resolveCharacterPlaybook(character: Character, packs: ContentPack[]): ResolvedPlaybook | null {
  for (const pack of packs) {
    const playbook = pack.playbooks.find((candidate) => candidate.id === character.playbookId);
    if (playbook) {
      return { playbook, pack };
    }
  }
  return null;
}

/**
 * The character's full move list: every basicMove from the resolved pack
 * (known implicitly by every hunter and never stored per-character, see
 * character-builder.ts's buildCharacterPayload) plus the playbook moves
 * actually picked (character.moves ids resolved against playbook.moves).
 * Returns an empty list when the playbook couldn't be resolved; callers
 * should fall back to character.moves raw ids in that case.
 */
export function resolveCharacterMoves(character: Character, resolved: ResolvedPlaybook | null): MoveDef[] {
  if (!resolved) return [];
  const picked = resolved.playbook.moves.filter((move) => character.moves.includes(move.id));
  return [...resolved.pack.basicMoves, ...picked];
}
