/*
 * Client-only PWA lifecycle: service-worker registration, persistent
 * storage request (iOS eviction gotcha in AGENTS.md), and the install
 * prompt. All of this runs from bundled app code, never an inline script,
 * to satisfy the server CSP (default-src 'self').
 */

// Reactive flag the install affordance binds to. Mutated (not reassigned)
// so the exported reference stays stable across the module boundary.
export const installState = $state({ available: false });

let deferredPrompt: BeforeInstallPromptEvent | null = null;
let started = false;

/** Register the service worker and wire up install / persistence. Idempotent. */
export function initPwa(): void {
  if (started) return;
  started = true;

  // Dynamic import so this module stays safe during static prerender;
  // the virtual module only carries a real implementation in the browser
  // bundle (and is a no-op when devOptions.enabled is false).
  void import("virtual:pwa-register").then(({ registerSW }) => {
    // registerType: "autoUpdate" activates new workers and reloads for us.
    registerSW({ immediate: true });
  });

  void requestPersistentStorage();

  window.addEventListener("beforeinstallprompt", (event) => {
    // Suppress the default mini-infobar; surface our own affordance.
    event.preventDefault();
    deferredPrompt = event;
    installState.available = true;
  });

  window.addEventListener("appinstalled", () => {
    deferredPrompt = null;
    installState.available = false;
  });
}

/**
 * Ask the browser to keep IndexedDB from being evicted. Quietly logged;
 * no UI. Guards for browsers without the Storage API.
 */
async function requestPersistentStorage(): Promise<void> {
  if (!navigator.storage?.persist) return;
  try {
    const granted = await navigator.storage.persist();
    console.info(`[mowc] persistent storage ${granted ? "granted" : "not granted"}`);
  } catch {
    // Non-fatal: local data is reconstructable from the server for
    // signed-in users (AGENTS.md iOS eviction note).
  }
}

/** Trigger the stashed native install prompt, if one is available. */
export async function promptInstall(): Promise<void> {
  if (!deferredPrompt) return;
  const event = deferredPrompt;
  deferredPrompt = null;
  installState.available = false;
  await event.prompt();
}
