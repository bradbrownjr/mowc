import type { PageLoad } from "./$types.js";

/**
 * Same convention as campaigns/[id]/+page.ts: campaign and character ids
 * are only known at runtime, so adapter-static cannot prerender them. Read
 * params here and re-fetch client-side (campaign from the API, character
 * from local IndexedDB after a pull).
 */
export const prerender = false;

export const load: PageLoad = ({ params }) => {
  return { id: params.id, characterId: params.characterId };
};
