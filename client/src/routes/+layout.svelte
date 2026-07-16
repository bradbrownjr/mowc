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
  import { initSession, logout, sessionState } from "$lib/session.svelte";
  import { initHealth } from "$lib/health.svelte";
  import { startSync } from "$lib/sync.js";

  let { children } = $props();

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
  {#if sessionState.user}
    <a class="nav-link" href={resolve("/campaigns")}>My campaigns</a>
    <a class="nav-link" href={resolve("/packs")}>Content packs</a>
    <button type="button" class="nav-link nav-logout" onclick={onLogout}>
      Log out ({sessionState.user.displayName})
    </button>
  {:else if sessionState.status === "ready"}
    <a class="nav-link" href={resolve("/login")}>Log in</a>
  {/if}
</nav>

{@render children()}
<Footer />
<InstallButton />

<style>
  .top-nav {
    display: flex;
    align-items: center;
    gap: var(--space-4);
    padding: var(--space-3) var(--space-6);
  }

  .nav-link {
    color: var(--accent);
    font-family: var(--font-meta);
    font-size: var(--text-sm);
    letter-spacing: 0.08em;
    text-transform: uppercase;
    text-decoration: none;
  }

  .nav-logout {
    margin-left: auto;
    min-height: var(--tap-min);
    background: none;
    border: none;
    cursor: pointer;
  }

  .nav-logout:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
  }
</style>
