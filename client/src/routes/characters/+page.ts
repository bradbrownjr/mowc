// Reads the session and local IndexedDB at runtime, so it cannot be prerendered
// at build time (same convention as /campaigns and the [id] routes). Served
// through the 200.html SPA fallback.
export const prerender = false;
