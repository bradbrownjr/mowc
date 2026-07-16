import type { PageLoad } from "./$types.js";

/**
 * The campaign ID and location ID are only known at runtime, so
 * adapter-static cannot prerender this route. Always set prerender: false
 * for dynamic routes.
 */
export const prerender = false;

export const load: PageLoad = ({ params }) => {
  return { id: params.id, locationId: params.locationId };
};
