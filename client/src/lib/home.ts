import type { Campaign } from "@mowc/shared";

/**
 * Splits a user's campaigns for the signed-in home dashboard: the ones they
 * run (Keeper) vs the ones they are seated in as a player (hunter). Both
 * lists sort by name, same as the /campaigns list.
 */
export interface CampaignSplit {
  running: Campaign[];
  joined: Campaign[];
}

export function splitCampaignsByRole(campaigns: Campaign[], userId: string): CampaignSplit {
  const running: Campaign[] = [];
  const joined: Campaign[] = [];
  for (const campaign of campaigns) {
    if (campaign.keeperUserId === userId) {
      running.push(campaign);
    } else {
      joined.push(campaign);
    }
  }
  const byName = (a: Campaign, b: Campaign): number => a.name.localeCompare(b.name);
  running.sort(byName);
  joined.sort(byName);
  return { running, joined };
}
