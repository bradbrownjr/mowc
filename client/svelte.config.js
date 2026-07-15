import adapter from "@sveltejs/adapter-static";

/** @type {import('@sveltejs/kit').Config} */
const config = {
  compilerOptions: {
    runes: true
  },
  kit: {
    adapter: adapter({
      pages: "build",
      assets: "build",
      fallback: "200.html",
      precompress: false,
      strict: true
    }),
    /**
     * adapter-static serves prerendered HTML with no per-request server, so
     * SvelteKit's own hydration bootstrap script (and the theme-detection
     * script in app.html) has to run inline. "auto" mode makes SvelteKit
     * compute a sha256 hash for each page's own inline scripts/styles at
     * build time and emit them via a <meta http-equiv="Content-Security-
     * Policy"> tag in that page's <head>, instead of requiring 'unsafe-
     * inline'. The HTTP-header CSP in securityHeaders.ts intentionally
     * leaves script-src/style-src unset so it doesn't override this with a
     * stricter, hash-less policy (headers and meta tags combine as the
     * intersection of both).
     *
     * style-src carries 'unsafe-inline' because both app.html's static
     * wrapper div (`style="display: contents"`) and Svelte 5's own
     * compiled hydration-boundary template use inline style="" attributes,
     * which neither hashes nor nonces can cover (browsers ignore hashes for
     * style attributes without 'unsafe-hashes', and the runtime-generated
     * one has no fixed value to hash across builds). See docs/SECURITY.md
     * section 5. script-src stays hash-only, no 'unsafe-inline'.
     */
    csp: {
      mode: "auto",
      directives: {
        "default-src": ["self"],
        "script-src": ["self"],
        "style-src": ["self", "unsafe-inline"],
        "img-src": ["self", "data:"],
        "connect-src": ["self"]
      }
    }
  }
};

export default config;
