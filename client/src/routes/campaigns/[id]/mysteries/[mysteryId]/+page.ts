import type { PageLoad } from "./$types.js";

/**
 * Same convention as campaigns/[id]/monsters/[monsterId]/+page.ts: entity
 * ids are only known at runtime, so adapter-static cannot prerender them.
 */
export const prerender = false;

export const load: PageLoad = ({ params }) => {
  return { id: params.id, mysteryId: params.mysteryId };
};
