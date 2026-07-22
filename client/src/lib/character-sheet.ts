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
 * The ContentPack (if any) among the supplied packs that defines a given
 * playbook id. Used by the migrate control both to check pack presence
 * (`packsContainPlaybook`) and, when a Keeper-approved pack-transfer request
 * is needed (ADR 0003), to find the actual pack payload to carry along.
 */
export function findPackForPlaybook(packs: ContentPack[], playbookId: string): ContentPack | null {
  return packs.find((pack) => pack.playbooks.some((playbook) => playbook.id === playbookId)) ?? null;
}

/**
 * Whether a given playbook id is defined by any of the supplied packs. Used
 * by the migrate control to warn (never block) when a destination campaign or
 * the owner's standalone space lacks the pack a character's playbook comes
 * from, so the player is not surprised by a sparse sheet after the move
 * (ADR 0002 open risk 3).
 */
export function packsContainPlaybook(packs: ContentPack[], playbookId: string): boolean {
  return findPackForPlaybook(packs, playbookId) !== null;
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
 * character-builder.ts's buildCharacterPayload) plus every playbook move
 * whose id is in character.moves.
 *
 * Playbook moves are searched across EVERY attached pack's playbooks, not
 * just the character's own resolved playbook: a `addMove` improvement (see
 * level-up.ts) can grant a move from another hunter type entirely (e.g.
 * "take a move from another playbook"), and that move must still render
 * here once granted. Returns an empty list when the playbook couldn't be
 * resolved; callers should fall back to character.moves raw ids in that
 * case.
 */
export function resolveCharacterMoves(character: Character, resolved: ResolvedPlaybook | null, packs: ContentPack[]): MoveDef[] {
  if (!resolved) return [];
  const seen = new Set(resolved.pack.basicMoves.map((move) => move.id));
  const picked: MoveDef[] = [];
  for (const pack of packs) {
    for (const move of [...pack.basicMoves, ...pack.playbooks.flatMap((playbook) => playbook.moves)]) {
      if (!character.moves.includes(move.id) || seen.has(move.id)) continue;
      seen.add(move.id);
      picked.push(move);
    }
  }
  return [...resolved.pack.basicMoves, ...picked];
}
