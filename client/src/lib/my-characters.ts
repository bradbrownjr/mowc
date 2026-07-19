import type { Character } from "@mowc/shared";
import type { LocalEntity } from "./db.js";

/**
 * One group on the My Characters screen: a campaign (labelled by its name) or
 * the trailing "Standalone" group for characters that belong to no campaign
 * (Character.campaignId === null).
 */
export interface CharacterGroup {
  /** campaignId, or "standalone" for the campaign-less group. */
  key: string;
  label: string;
  campaignId: string | null;
  characters: Character[];
}

const STANDALONE_KEY = "standalone";

/**
 * Groups a user's own characters for the My Characters screen: one group per
 * campaign, plus a trailing "Standalone" group for null-campaign characters.
 * Only characters the user owns and that are not deleted are included (a Keeper
 * mirrors other players' character rows locally, so the owner filter matters
 * here even though a hunter only ever holds their own). Campaign groups sort by
 * label; the Standalone group always sorts last.
 */
export function groupOwnCharacters(
  entities: LocalEntity[],
  userId: string,
  campaignNames: Map<string, string>
): CharacterGroup[] {
  const groups = new Map<string, CharacterGroup>();
  for (const entity of entities) {
    if (entity.type !== "character" || entity.deleted) {
      continue;
    }
    const character = entity.payload as unknown as Character;
    if (character.ownerUserId !== userId) {
      continue;
    }
    const campaignId = character.campaignId;
    const key = campaignId ?? STANDALONE_KEY;
    let group = groups.get(key);
    if (!group) {
      group = {
        key,
        campaignId,
        label: campaignId ? (campaignNames.get(campaignId) ?? "Unknown campaign") : "Standalone",
        characters: []
      };
      groups.set(key, group);
    }
    group.characters.push(character);
  }
  for (const group of groups.values()) {
    group.characters.sort((a, b) => a.name.localeCompare(b.name));
  }
  return [...groups.values()].sort((a, b) => {
    if (a.campaignId === null) {
      return 1; // Standalone last
    }
    if (b.campaignId === null) {
      return -1;
    }
    return a.label.localeCompare(b.label);
  });
}
