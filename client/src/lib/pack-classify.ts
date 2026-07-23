import type { PackSummary } from "$lib/api/contentPacks.js";

/**
 * A ContentPack has no stored `type`; a pack's de-facto category is derived
 * from which arrays its payload populates (playbooks/basicMoves/hunterAgenda
 * for hunter-facing content, monster/minion/bystander/location types plus
 * keeper agenda/principles/always-say/moves/mystery-creation for Keeper
 * content). `label` matches the shared EvidenceTag chip motif this renders
 * with (docs/DESIGN.md "Evidence tags"); a pack can carry both badges.
 */
export interface PackBadge {
  label: string;
}

export function packBadges(summary: PackSummary): PackBadge[] {
  const badges: PackBadge[] = [];

  if (summary.playbookCount > 0) {
    badges.push({ label: "Playbook" });
  }

  const hasKeeperTypes =
    summary.monsterTypeCount > 0 ||
    summary.minionTypeCount > 0 ||
    summary.bystanderTypeCount > 0 ||
    summary.locationTypeCount > 0;
  if (hasKeeperTypes || summary.hasKeeperReference) {
    badges.push({ label: "Keeper reference" });
  }

  return badges;
}
