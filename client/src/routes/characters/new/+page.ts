// Reads the session at runtime (login guard), so it cannot be prerendered
// at build time (same convention as /campaigns and /characters). Served
// through the 200.html SPA fallback.
export const prerender = false;
