<script lang="ts">
  import { onMount } from "svelte";
  import { browser } from "$app/environment";
  import "@fontsource/big-shoulders";
  import "@fontsource/alegreya-sans";
  import "@fontsource/courier-prime";
  import "$lib/styles.css";
  import { House, Library, Package, CircleUser, LogOut, ChevronDown, LayoutList, ClipboardList } from "@lucide/svelte";
  import InstallButton from "$lib/InstallButton.svelte";
  import Footer from "$lib/Footer.svelte";
  import Icon from "$lib/Icon.svelte";
  import { initPwa } from "$lib/pwa.svelte";
  import { goto } from "$app/navigation";
  import { resolve } from "$app/paths";
  import { page } from "$app/state";
  import { initSession, logout, sessionState } from "$lib/session.svelte";
  import { initHealth } from "$lib/health.svelte";
  import { startSync } from "$lib/sync.js";
  import { campaignNav } from "$lib/campaign-nav.svelte";

  let { children } = $props();

  let accountOpen = $state(false);

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
    accountOpen = false;
    await logout();
    await goto(resolve("/login"));
  }
</script>

<header class="top-bar">
  <a class="brand" href={resolve("/")}>MOWC</a>

  <nav class="tabs" aria-label="Sections">
    {#if sessionState.user}
      <a class="tab" class:active={isActive(resolve("/campaigns"))} href={resolve("/campaigns")}>My campaigns</a>
      <a class="tab" class:active={isActive(resolve("/packs"))} href={resolve("/packs")}>Content packs</a>
    {/if}
  </nav>

  <div class="account">
    {#if sessionState.user}
      <button
        type="button"
        class="account-button"
        aria-haspopup="menu"
        aria-expanded={accountOpen}
        onclick={() => (accountOpen = !accountOpen)}
      >
        <Icon icon={CircleUser} size={18} />
        <span class="account-name">{sessionState.user.displayName}</span>
        <Icon icon={ChevronDown} size={16} />
      </button>
      {#if accountOpen}
        <button type="button" class="account-backdrop" aria-label="Close menu" onclick={() => (accountOpen = false)}></button>
        <div class="account-menu" role="menu">
          <button type="button" class="account-item" role="menuitem" onclick={onLogout}>
            <Icon icon={LogOut} size={16} />
            <span>Log out</span>
          </button>
        </div>
      {/if}
    {:else if sessionState.status === "ready"}
      <a class="tab" class:active={isActive(resolve("/login"))} href={resolve("/login")}>Log in</a>
    {/if}
  </div>
</header>

{@render children()}
<Footer />

{#if sessionState.user}
  <!-- Mobile bottom tab bar (docs/DESIGN.md "App shell"): destinations
       switch when inside a campaign. Sheet/World/Mysteries-list rows arrive
       with 0.11.3 once those routes exist; until then the campaign set uses
       only real destinations (Overview, Keeper Prep, back to Campaigns).
       hrefs inline resolve() per the repo's navigation convention. -->
  <nav class="bottom-bar" aria-label="Primary">
    {#if campaignNav.current}
      <a class="bottom-tab" class:active={isActive(resolve("/campaigns/[id]", { id: campaignNav.current.id }))} href={resolve("/campaigns/[id]", { id: campaignNav.current.id })}>
        <Icon icon={LayoutList} size={20} />
        <span class="bottom-label">Overview</span>
      </a>
      {#if campaignNav.current.isKeeper}
        <a class="bottom-tab" class:active={isActive(resolve("/campaigns/[id]/dashboard", { id: campaignNav.current.id }))} href={resolve("/campaigns/[id]/dashboard", { id: campaignNav.current.id })}>
          <Icon icon={ClipboardList} size={20} />
          <span class="bottom-label">Prep</span>
        </a>
      {:else}
        <a class="bottom-tab" class:active={isActive(resolve("/packs"))} href={resolve("/packs")}>
          <Icon icon={Package} size={20} />
          <span class="bottom-label">Packs</span>
        </a>
      {/if}
      <a class="bottom-tab" class:active={isActive(resolve("/campaigns"))} href={resolve("/campaigns")}>
        <Icon icon={Library} size={20} />
        <span class="bottom-label">Campaigns</span>
      </a>
    {:else}
      <a class="bottom-tab" class:active={page.url.pathname === resolve("/")} href={resolve("/")}>
        <Icon icon={House} size={20} />
        <span class="bottom-label">Home</span>
      </a>
      <a class="bottom-tab" class:active={isActive(resolve("/campaigns"))} href={resolve("/campaigns")}>
        <Icon icon={Library} size={20} />
        <span class="bottom-label">Campaigns</span>
      </a>
      <a class="bottom-tab" class:active={isActive(resolve("/packs"))} href={resolve("/packs")}>
        <Icon icon={Package} size={20} />
        <span class="bottom-label">Packs</span>
      </a>
    {/if}
    <button
      type="button"
      class="bottom-tab"
      class:active={accountOpen}
      aria-haspopup="menu"
      aria-expanded={accountOpen}
      onclick={() => (accountOpen = !accountOpen)}
    >
      <Icon icon={CircleUser} size={20} />
      <span class="bottom-label">Account</span>
    </button>
  </nav>
{/if}

<InstallButton />

<style>
  /* Top bar (all tiers): brand left, folder tabs (tablet/desktop) center,
     compact account menu right. One line, never wraps (docs/DESIGN.md). */
  .top-bar {
    display: flex;
    align-items: flex-end;
    gap: var(--space-4);
    padding: var(--space-3) var(--space-4) 0;
    border-bottom: 1px solid var(--border);
  }

  @media (min-width: 768px) {
    .top-bar {
      padding-inline: var(--space-6);
    }
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

  /* Folder tabs are a tablet/desktop affordance; mobile uses the bottom
     tab bar instead, so the top bar keeps only brand + account. */
  .tabs {
    display: none;
    align-items: flex-end;
    gap: var(--space-2);
    flex: 1;
  }

  @media (min-width: 768px) {
    .tabs {
      display: flex;
    }
  }

  .account {
    position: relative;
    display: flex;
    align-items: flex-end;
    margin-left: auto;
    margin-bottom: var(--space-2);
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

  .tab:focus-visible,
  .brand:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
  }

  /* Compact account menu: name button (ellipsis past 12rem) that opens a
     small panel. Replaces the old "Log out (name)" label that overflowed
     the bar (Phase 11 survey finding 4). */
  .account-button {
    display: inline-flex;
    align-items: center;
    gap: var(--space-2);
    min-height: var(--tap-min);
    max-width: 12rem;
    padding: var(--space-2) var(--space-3);
    color: var(--ink);
    background: none;
    border: 1px solid var(--border);
    border-radius: var(--radius-md);
    cursor: pointer;
    font-family: var(--font-meta);
    font-size: var(--text-sm);
  }

  .account-name {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .account-button:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
  }

  .account-backdrop {
    position: fixed;
    inset: 0;
    z-index: 10;
    border: none;
    background: none;
    cursor: default;
  }

  .account-menu {
    position: absolute;
    top: calc(100% + var(--space-1));
    right: 0;
    z-index: 11;
    min-width: 10rem;
    padding: var(--space-1);
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius-md);
  }

  /* On mobile the primary trigger is the bottom "Account" tab, so anchor the
     panel just above the bottom bar rather than up under the top bar. */
  @media (max-width: 767px) {
    .account-menu {
      position: fixed;
      top: auto;
      right: var(--space-4);
      bottom: calc(var(--bottombar-h) + env(safe-area-inset-bottom) + var(--space-1));
    }
  }

  .account-item {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    width: 100%;
    min-height: var(--tap-min);
    padding: var(--space-2) var(--space-3);
    color: var(--ink);
    background: none;
    border: none;
    border-radius: var(--radius-sm);
    cursor: pointer;
    font-family: var(--font-meta);
    font-size: var(--text-sm);
    text-align: left;
  }

  .account-item:hover {
    background: var(--surface-2);
  }

  .account-item:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: -2px;
  }

  /* Mobile bottom tab bar: fixed to the viewport bottom below 768px; the
     page container reserves matching bottom padding so content never hides
     behind it (docs/DESIGN.md "App shell"). */
  .bottom-bar {
    position: fixed;
    inset-inline: 0;
    bottom: 0;
    z-index: 9;
    display: flex;
    height: calc(var(--bottombar-h) + env(safe-area-inset-bottom));
    padding-bottom: env(safe-area-inset-bottom);
    background: var(--surface);
    border-top: 1px solid var(--border);
  }

  @media (min-width: 768px) {
    .bottom-bar {
      display: none;
    }
  }

  .bottom-tab {
    display: flex;
    flex: 1;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 2px;
    min-height: var(--bottombar-h);
    padding: var(--space-1) 0;
    color: var(--ink-muted);
    background: none;
    border: none;
    border-top: 2px solid transparent;
    cursor: pointer;
    text-decoration: none;
  }

  .bottom-tab.active {
    color: var(--accent);
    border-top-color: var(--accent);
  }

  .bottom-label {
    font-family: var(--font-meta);
    font-size: var(--text-xs);
    letter-spacing: 0.02em;
  }

  .bottom-tab:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: -2px;
  }
</style>
