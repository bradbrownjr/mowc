<script lang="ts">
  import { onMount } from "svelte";
  import { browser } from "$app/environment";
  import "@fontsource/big-shoulders";
  import "@fontsource/alegreya-sans";
  import "@fontsource/courier-prime";
  import "$lib/styles.css";
  import {
    House,
    Library,
    Package,
    CircleUser,
    LogOut,
    ChevronDown,
    LayoutList,
    BookOpen,
    Globe,
    ScrollText,
    Sun,
    Moon,
    Monitor
  } from "@lucide/svelte";
  import InstallButton from "$lib/InstallButton.svelte";
  import Footer from "$lib/Footer.svelte";
  import Icon from "$lib/Icon.svelte";
  import SyncStatus from "$lib/SyncStatus.svelte";
  import { initPwa } from "$lib/pwa.svelte";
  import { goto } from "$app/navigation";
  import { resolve } from "$app/paths";
  import { page } from "$app/state";
  import { initSession, logout, sessionState } from "$lib/session.svelte";
  import { initTheme, setThemePreference, themeState, type ThemePreference } from "$lib/theme.svelte";
  import { initHealth } from "$lib/health.svelte";
  import { startSync } from "$lib/sync.js";
  import { initSyncStatus } from "$lib/sync-status.svelte";
  import { campaignNav } from "$lib/campaign-nav.svelte";

  let { children } = $props();

  let accountOpen = $state(false);

  function isActive(path: string): boolean {
    return page.url.pathname === path || page.url.pathname.startsWith(`${path}/`);
  }

  const THEME_OPTIONS: { value: ThemePreference; label: string; icon: typeof Moon }[] = [
    { value: "dark", label: "Midnight Unit", icon: Moon },
    { value: "light", label: "Field Notes", icon: Sun },
    { value: "system", label: "Follow system", icon: Monitor }
  ];

  onMount(() => {
    if (browser) {
      initPwa();
      void initSession();
      void initHealth();
      initTheme();
      // Flush queued offline ops when the browser regains connectivity
      // (docs/SYNC.md); without this, edits made offline never push until
      // the next online write.
      startSync();
      // Sync-status store (online/offline badge, pending-op count, conflict
      // toasts). Registers its own online/offline listeners and the callback
      // bridge sync.ts reports through.
      void initSyncStatus();
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
      <a class="tab" class:active={isActive(resolve("/characters"))} href={resolve("/characters")}>My characters</a>
      <a class="tab" class:active={isActive(resolve("/packs"))} href={resolve("/packs")}>Content packs</a>
    {/if}
  </nav>

  <div class="shell-right">
    {#if sessionState.user}
      <SyncStatus />
    {/if}

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
          <p class="theme-label">Theme</p>
          <div class="theme-group" role="group" aria-label="Theme">
            {#each THEME_OPTIONS as option (option.value)}
              <button
                type="button"
                class="theme-option"
                class:selected={themeState.preference === option.value}
                onclick={() => setThemePreference(option.value)}
              >
                <Icon icon={option.icon} size={16} />
                <span>{option.label}</span>
              </button>
            {/each}
          </div>
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
  </div>
</header>

{@render children()}
<Footer />

{#if sessionState.user}
  <!-- Mobile bottom tab bar (docs/DESIGN.md "App shell"): destinations
       switch when inside a campaign (Overview, Sheet-or-Mysteries, World,
       Campaigns; four, with Account dropped since the top bar's account
       button stays reachable) vs outside (Home, Campaigns, Characters, Packs,
       Account; five). The top bar's account button stays reachable on mobile
       either way (never hidden below 768px). hrefs inline resolve() per the
       repo's navigation convention. -->
  <nav class="bottom-bar" aria-label="Primary">
    {#if campaignNav.current}
      <a class="bottom-tab" class:active={isActive(resolve("/campaigns/[id]", { id: campaignNav.current.id }))} href={resolve("/campaigns/[id]", { id: campaignNav.current.id })}>
        <Icon icon={LayoutList} size={20} />
        <span class="bottom-label">Overview</span>
      </a>
      {#if campaignNav.current.isKeeper}
        <a class="bottom-tab" class:active={isActive(resolve("/campaigns/[id]/mysteries", { id: campaignNav.current.id }))} href={resolve("/campaigns/[id]/mysteries", { id: campaignNav.current.id })}>
          <Icon icon={BookOpen} size={20} />
          <span class="bottom-label">Mysteries</span>
        </a>
      {:else if campaignNav.current.ownCharacterId}
        <a class="bottom-tab" class:active={isActive(resolve("/campaigns/[id]/characters/[characterId]", { id: campaignNav.current.id, characterId: campaignNav.current.ownCharacterId }))} href={resolve("/campaigns/[id]/characters/[characterId]", { id: campaignNav.current.id, characterId: campaignNav.current.ownCharacterId })}>
          <Icon icon={ScrollText} size={20} />
          <span class="bottom-label">Sheet</span>
        </a>
      {:else}
        <a class="bottom-tab" class:active={isActive(resolve("/campaigns/[id]/characters/new", { id: campaignNav.current.id }))} href={resolve("/campaigns/[id]/characters/new", { id: campaignNav.current.id })}>
          <Icon icon={ScrollText} size={20} />
          <span class="bottom-label">Sheet</span>
        </a>
      {/if}
      <a class="bottom-tab" class:active={isActive(resolve("/campaigns/[id]/world", { id: campaignNav.current.id }))} href={resolve("/campaigns/[id]/world", { id: campaignNav.current.id })}>
        <Icon icon={Globe} size={20} />
        <span class="bottom-label">World</span>
      </a>
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
      <a class="bottom-tab" class:active={isActive(resolve("/characters"))} href={resolve("/characters")}>
        <Icon icon={ScrollText} size={20} />
        <span class="bottom-label">Characters</span>
      </a>
      <a class="bottom-tab" class:active={isActive(resolve("/packs"))} href={resolve("/packs")}>
        <Icon icon={Package} size={20} />
        <span class="bottom-label">Packs</span>
      </a>
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
    {/if}
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

  /* Right-hand shell cluster: sync-status control + account menu, kept
     together and pushed to the far right at every tier. */
  .shell-right {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    margin-left: auto;
    margin-bottom: var(--space-2);
  }

  .account {
    position: relative;
    display: flex;
    align-items: center;
  }

  /* File-tab motif (docs/DESIGN.md): folder-shaped tabs (angled sides, like
     a manila folder), sitting behind the header's border line. The active
     tab overlaps that line (negative margin-bottom, no border-bottom of its
     own) so it reads as the open folder merging into the page below;
     inactive tabs stay a shade back on --surface-2 and flush with the
     line. */
  .tab {
    min-height: var(--tap-min);
    display: inline-flex;
    align-items: center;
    margin-bottom: -1px;
    padding: var(--space-2) var(--space-6);
    background: var(--surface-2);
    color: var(--ink-muted);
    border: 1px solid var(--border);
    border-bottom: 1px solid var(--border);
    clip-path: polygon(10px 0, calc(100% - 10px) 0, 100% 100%, 0 100%);
    cursor: pointer;
    font-family: var(--font-meta);
    font-size: var(--text-sm);
    letter-spacing: 0.08em;
    text-transform: uppercase;
    text-decoration: none;
  }

  .tab.active {
    z-index: 1;
    color: var(--ink);
    background: var(--surface);
    border-bottom-color: var(--surface);
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
    min-width: 12rem;
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

  .theme-label {
    margin: var(--space-1) var(--space-3) 0;
    color: var(--ink-muted);
    font-family: var(--font-meta);
    font-size: var(--text-xs);
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }

  .theme-group {
    display: flex;
    flex-direction: column;
    padding-bottom: var(--space-1);
    border-bottom: 1px solid var(--border);
  }

  .theme-option {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    width: 100%;
    min-height: var(--tap-min);
    padding: var(--space-2) var(--space-3);
    color: var(--ink-muted);
    background: none;
    border: none;
    border-radius: var(--radius-sm);
    cursor: pointer;
    font-family: var(--font-meta);
    font-size: var(--text-sm);
    text-align: left;
  }

  .theme-option.selected {
    color: var(--accent);
  }

  .theme-option:hover {
    background: var(--surface-2);
    color: var(--ink);
  }

  .theme-option.selected:hover {
    color: var(--accent);
  }

  .theme-option:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: -2px;
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
