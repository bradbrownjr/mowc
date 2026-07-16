import type { PageLoad } from "./$types.js";

/**
 * The campaign ID is only known at runtime, so adapter-static cannot
 * prerender this route. Always set prerender: false for dynamic routes.
 */
export const prerender = false;

export const load: PageLoad = ({ params }) => {
  return { id: params.id };
};
