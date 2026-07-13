import type { PageLoad } from "./$types.js";

// Pack ids are only known at runtime; adapter-static (strict mode) needs an
// explicit opt-out since it cannot enumerate every id to prerender.
export const prerender = false;

export const load: PageLoad = ({ params }) => {
  return { id: params.id };
};
