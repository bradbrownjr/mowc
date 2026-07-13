import { sveltekit } from "@sveltejs/kit/vite";
import { SvelteKitPWA } from "@vite-pwa/sveltekit";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [
    sveltekit(),
    SvelteKitPWA({
      // autoUpdate: a new service worker takes over and reloads clients
      // automatically. We deliberately avoid a custom update prompt to keep
      // the service-worker lifecycle simple (no skipWaiting UI to maintain).
      registerType: "autoUpdate",
      // Registration is done from bundled app code (src/lib/pwa.svelte.ts), not an
      // injected inline snippet, so it satisfies the server CSP
      // (default-src 'self' blocks inline scripts).
      injectRegister: null,
      manifest: {
        name: "MOWC",
        short_name: "MOWC",
        description: "Companion app for tabletop hunters.",
        start_url: "/",
        scope: "/",
        display: "standalone",
        // DESIGN.md dark-theme tokens (--bg near-black blue-charcoal).
        background_color: "#12161c",
        theme_color: "#12161c",
        icons: [
          { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
          {
            src: "/icons/icon-512-maskable.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable"
          }
        ]
      },
      workbox: {
        // Precache the app shell: built JS/CSS/HTML, fonts, and icons.
        globPatterns: ["**/*.{js,css,html,ico,png,svg,webmanifest,woff,woff2}"],
        // Offline navigations resolve to the SPA fallback the adapter emits.
        navigateFallback: "/200.html",
        // Never treat live server calls as navigations to cache; offline
        // they must fail so the page can show its offline state.
        navigateFallbackDenylist: [/^\/healthz/, /^\/api\//],
        cleanupOutdatedCaches: true
      },
      devOptions: {
        // Keep the dev server free of the service worker; it is a
        // production-only concern and would interfere with HMR.
        enabled: false
      }
    })
  ],
  server: {
    proxy: {
      "/healthz": "http://localhost:7120"
    }
  }
});
