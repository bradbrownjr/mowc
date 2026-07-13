export const prerender = true;

/**
 * Without this, a route with children (e.g. /packs plus /packs/new) makes
 * adapter-static emit both a packs.html file and a packs/ directory at the
 * same path. Express's static file server then resolves the directory
 * first and 301-redirects /packs to /packs/, which breaks every
 * page-relative asset URL on that page (see AGENTS.md if this regresses).
 * Always emitting <route>/index.html for every route removes the collision.
 */
export const trailingSlash = "always";
