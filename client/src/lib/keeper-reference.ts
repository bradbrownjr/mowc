/**
 * Aggregates the Keeper-facing reference fields (agenda, principles, "always
 * say", and keeper move lists) across every attached content pack, for the
 * read-only Keeper reference screen
 * (client/src/routes/campaigns/[id]/reference/+page.svelte). All source
 * strings come from user-supplied packs at runtime (AGENTS.md rule 1); this
 * module contains no game text of its own.
 */
import type { ContentPack, KeeperMoves } from "@mowc/shared";

export interface KeeperReference {
  agenda: string[];
  principles: string[];
  alwaysSay: string[];
  keeperMoves: KeeperMoves;
  isEmpty: boolean;
}

/**
 * Concatenates each keeper move sub-list across packs in pack order. For the
 * harm tiers (an ordered list with no natural per-pack identity), the
 * simplest correct behavior is to also concatenate every pack's tiers rather
 * than pick only the first pack that defines one, so a Keeper with multiple
 * reference packs attached sees all of them rather than silently losing all
 * but one pack's harm guidance.
 */
function collectKeeperMoves(packs: ContentPack[]): KeeperMoves {
  const basic: string[] = [];
  const monster: string[] = [];
  const minion: string[] = [];
  const bystander: string[] = [];
  const location: string[] = [];
  const harmNotes: string[] = [];
  const harmTiers: NonNullable<KeeperMoves["harm"]>["tiers"] = [];

  for (const pack of packs) {
    const moves = pack.keeperMoves;
    if (!moves) continue;
    basic.push(...moves.basic);
    monster.push(...moves.monster);
    minion.push(...moves.minion);
    bystander.push(...moves.bystander);
    location.push(...moves.location);
    if (moves.harm) {
      if (moves.harm.note) harmNotes.push(moves.harm.note);
      harmTiers.push(...moves.harm.tiers);
    }
  }

  const harm = harmNotes.length > 0 || harmTiers.length > 0 ? { note: harmNotes.join("\n\n"), tiers: harmTiers } : undefined;

  return { basic, monster, minion, bystander, location, harm };
}

export function collectKeeperReference(packs: ContentPack[]): KeeperReference {
  const agenda = packs.flatMap((pack) => pack.keeperAgenda ?? []);
  const principles = packs.flatMap((pack) => pack.keeperPrinciples ?? []);
  const alwaysSay = packs.flatMap((pack) => pack.alwaysSay ?? []);
  const keeperMoves = collectKeeperMoves(packs);

  const isEmpty =
    agenda.length === 0 &&
    principles.length === 0 &&
    alwaysSay.length === 0 &&
    keeperMoves.basic.length === 0 &&
    keeperMoves.monster.length === 0 &&
    keeperMoves.minion.length === 0 &&
    keeperMoves.bystander.length === 0 &&
    keeperMoves.location.length === 0 &&
    !keeperMoves.harm;

  return { agenda, principles, alwaysSay, keeperMoves, isEmpty };
}
