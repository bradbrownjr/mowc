const STORAGE_KEY = "mowc-theme";

export type ThemePreference = "dark" | "light" | "system";

function systemPrefersLight(): boolean {
  return window.matchMedia("(prefers-color-scheme: light)").matches;
}

function resolvedTheme(preference: ThemePreference): "dark" | "light" {
  if (preference === "system") return systemPrefersLight() ? "light" : "dark";
  return preference;
}

function readStoredPreference(): ThemePreference {
  const stored = localStorage.getItem(STORAGE_KEY);
  return stored === "dark" || stored === "light" || stored === "system" ? stored : "system";
}

export const themeState = $state<{ preference: ThemePreference }>({ preference: "system" });

let initialized = false;

/**
 * Idempotent: call once from the root layout on mount. The visible theme
 * itself is already applied pre-hydration by the synchronous script
 * (client/static/theme-init.js, referenced from app.html) so this only
 * syncs the reactive state the account-menu toggle reads, and keeps a
 * "follow system" choice live if the OS preference changes mid-session.
 */
export function initTheme(): void {
  if (initialized) return;
  initialized = true;
  themeState.preference = readStoredPreference();

  window.matchMedia("(prefers-color-scheme: light)").addEventListener("change", () => {
    if (themeState.preference === "system") {
      document.documentElement.setAttribute("data-theme", resolvedTheme("system"));
    }
  });
}

export function setThemePreference(preference: ThemePreference): void {
  themeState.preference = preference;
  localStorage.setItem(STORAGE_KEY, preference);
  document.documentElement.setAttribute("data-theme", resolvedTheme(preference));
}
