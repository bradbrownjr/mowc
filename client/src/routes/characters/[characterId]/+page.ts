import type { PageLoad } from "./$types.js";

/**
 * Same convention as campaigns/[id]/characters/[characterId]/+page.ts:
 * character ids are only known at runtime, so adapter-static cannot
 * prerender them. Read params here and re-fetch client-side (the character
 * from local IndexedDB after a pull of the "standalone" scope).
 */
export const prerender = false;

export const load: PageLoad = ({ params }) => {
  return { characterId: params.characterId };
};
