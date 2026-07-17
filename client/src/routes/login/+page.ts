/**
 * Reads `page.url.searchParams` (the `intent` query param from the 0.11.6
 * onboarding flow) to forward it after login, which adapter-static cannot
 * evaluate at prerender time (there is no real request URL yet).
 */
export const prerender = false;
