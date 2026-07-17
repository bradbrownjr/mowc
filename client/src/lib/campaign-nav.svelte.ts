/**
 * Shared campaign navigation context for the app shell (docs/DESIGN.md
 * "App shell"). The root layout renders viewport-fixed chrome (the mobile
 * bottom tab bar) that must switch destinations when the user is inside a
 * campaign, but the root layout cannot see the campaign or the user's role.
 *
 * The nested `campaigns/[id]/+layout.svelte` loads the campaign, derives
 * whether the current user is its Keeper, and publishes that here; the root
 * layout reads it to pick global vs campaign bottom-bar destinations. This
 * is the one exception to the "read params.id in the route's own +page.ts"
 * convention: the shell genuinely needs cross-route campaign context.
 */

export interface CampaignNavContext {
  id: string;
  name: string;
  isKeeper: boolean;
  /**
   * A hunter's own character id in this campaign, for the mobile bottom
   * bar's "Sheet" tab (docs/DESIGN.md "App shell"): null while unknown or
   * once confirmed the hunter has no character yet (the tab then falls
   * back to the character builder). Always null for a Keeper.
   */
  ownCharacterId: string | null;
}

export const campaignNav = $state<{ current: CampaignNavContext | null }>({
  current: null,
});

export function setCampaignNav(context: CampaignNavContext): void {
  campaignNav.current = context;
}

export function clearCampaignNav(): void {
  campaignNav.current = null;
}
