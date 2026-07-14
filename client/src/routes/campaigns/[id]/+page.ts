import type { PageLoad } from "./$types.js";

/**
 * Campaign ids are only known at runtime; adapter-static (strict mode)
 * cannot enumerate them to prerender, same reasoning as
 * client/src/routes/packs/[id]/+page.ts. This is the campaign-scoped route
 * convention: read params.id here and re-fetch the campaign client-side.
 * Later Phase 4/5 routes nested under /campaigns/[id]/... (character
 * builder, sheet, Keeper dashboard) should copy this pattern rather than
 * introducing a separate "active campaign" store.
 */
export const prerender = false;

export const load: PageLoad = ({ params }) => {
  return { id: params.id };
};
