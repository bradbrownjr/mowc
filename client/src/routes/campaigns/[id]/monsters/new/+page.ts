import type { PageLoad } from "./$types.js";

/**
 * Same convention as campaigns/[id]/characters/new/+page.ts: campaign ids
 * are only known at runtime, so adapter-static cannot prerender them. Read
 * params.id here and re-fetch client-side.
 */
export const prerender = false;

export const load: PageLoad = ({ params }) => {
  return { id: params.id };
};
