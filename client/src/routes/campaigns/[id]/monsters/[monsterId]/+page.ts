import type { PageLoad } from "./$types.js";

/**
 * Same convention as campaigns/[id]/characters/[characterId]/+page.ts:
 * campaign and monster ids are only known at runtime, so adapter-static
 * cannot prerender them. Read params here and re-fetch client-side
 * (campaign from the API, monster from local IndexedDB after a pull).
 */
export const prerender = false;

export const load: PageLoad = ({ params }) => {
  return { id: params.id, monsterId: params.monsterId };
};
