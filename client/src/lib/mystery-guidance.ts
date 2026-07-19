/**
 * Flattens the `mysteryCreation.steps` of every attached content pack into a
 * single list, for the mystery builder's guidance panel
 * (campaigns/[id]/mysteries/new/+page.svelte). A pack may carry zero, one, or
 * several steps; multiple packs may each carry their own `mysteryCreation`.
 * This is a pure helper (no Svelte) so it is unit-testable without a browser.
 */
import type { ContentPack, MysteryCreation } from "@mowc/shared";

export function flattenMysteryCreation(packs: ContentPack[]): MysteryCreation["steps"] {
  return packs.flatMap((pack) => pack.mysteryCreation?.steps ?? []);
}
