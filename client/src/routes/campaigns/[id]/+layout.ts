import type { LayoutLoad } from "./$types.js";

/**
 * Campaign ids are only known at runtime; adapter-static (strict mode)
 * cannot enumerate them to prerender (same reasoning as the campaign
 * +page.ts). This layout wraps every /campaigns/[id]/... route so the
 * context rail and campaign-aware bottom bar have the id.
 */
export const prerender = false;

export const load: LayoutLoad = ({ params }) => {
  return { id: params.id };
};
