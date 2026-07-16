<script lang="ts">
  import { onMount } from "svelte";
  import { browser } from "$app/environment";
  import "@fontsource/big-shoulders";
  import "@fontsource/alegreya-sans";
  import "@fontsource/courier-prime";
  import "$lib/styles.css";
  import InstallButton from "$lib/InstallButton.svelte";
  import Footer from "$lib/Footer.svelte";
  import { initPwa } from "$lib/pwa.svelte";
  import { goto } from "$app/navigation";
  import { resolve } from "$app/paths";
  import { page } from "$app/state";
  import { initSession, logout, sessionState } from "$lib/session.svelte";
  import { initHealth } from "$lib/health.svelte";
  import { startSync } from "$lib/sync.js";

  let { children } = $props();

  function isActive(path: string): boolean {
    return page.url.pathname === path || page.url.pathname.startsWith(`${path}/`);
  }

  onMount(() => {
    if (browser) {
      initPwa();
      void initSession();
      void initHealth();
      // Flush queued offline ops when the browser regains connectivity
      // (docs/SYNC.md); without this, edits made offline never push until
      // the next online write.
      startSync();
    }
  });

  async function onLogout(): Promise<void> {
    await logout();
    await goto(resolve("/login"));
  }
</script>

<nav class="top-nav">
  <a class="brand" href={resolve("/")}>MOWC</a>
  <div class="tabs">
    {#if sessionState.user}
      <a class="tab" class:active={isActive(resolve("/campaigns"))} href={resolve("/campaigns")}>My campaigns</a>
      <a class="tab" class:active={isActive(resolve("/packs"))} href={resolve("/packs")}>Content packs</a>
    {/if}
  </div>
  <div class="nav-actions">
    {#if sessionState.user}
      <button type="button" class="tab nav-logout" onclick={onLogout}>
        Log out ({sessionState.user.displayName})
      </button>
    {:else if sessionState.status === "ready"}
      <a class="tab" class:active={isActive(resolve("/login"))} href={resolve("/login")}>Log in</a>
    {/if}
  </div>
</nav>

{@render children()}
<Footer />
<InstallButton />

<style>
  .top-nav {
    display: flex;
    align-items: flex-end;
    gap: var(--space-4);
    padding: var(--space-3) var(--space-6) 0;
    border-bottom: 1px solid var(--border);
  }

  .brand {
    margin-bottom: var(--space-2);
    padding-bottom: var(--space-1);
    color: var(--ink);
    font-family: var(--font-display);
    font-size: var(--text-lg);
    letter-spacing: 0.04em;
    text-transform: uppercase;
    text-decoration: none;
  }

  .tabs {
    display: flex;
    align-items: flex-end;
    gap: var(--space-2);
    flex: 1;
  }

  .nav-actions {
    display: flex;
    align-items: flex-end;
    margin-left: auto;
  }

  /* File-tab motif (docs/DESIGN.md): the active section reads as the open
     folder, raised out of the border line; inactive tabs sit flush and
     muted so they no longer blend into each other. */
  .tab {
    min-height: var(--tap-min);
    display: inline-flex;
    align-items: center;
    padding: var(--space-2) var(--space-4);
    color: var(--ink-muted);
    background: none;
    border: 1px solid transparent;
    border-bottom: none;
    border-radius: var(--radius-md) var(--radius-md) 0 0;
    cursor: pointer;
    font-family: var(--font-meta);
    font-size: var(--text-sm);
    letter-spacing: 0.08em;
    text-transform: uppercase;
    text-decoration: none;
  }

  .tab.active {
    color: var(--ink);
    background: var(--surface);
    border-color: var(--border);
  }

  .tab:hover {
    color: var(--ink);
  }

  .nav-logout {
    margin-left: var(--space-2);
  }

  .tab:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
  }

  .brand:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
  }
</style>
