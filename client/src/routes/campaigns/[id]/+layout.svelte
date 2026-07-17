<script lang="ts">
  import { onDestroy } from "svelte";
  import { resolve } from "$app/paths";
  import { page } from "$app/state";
  import { LayoutList, ClipboardList } from "@lucide/svelte";
  import Icon from "$lib/Icon.svelte";
  import { sessionState } from "$lib/session.svelte";
  import { getCampaign } from "$lib/api/campaigns.js";
  import { campaignNav, setCampaignNav, clearCampaignNav } from "$lib/campaign-nav.svelte";
  import type { LayoutProps } from "./$types.js";

  let { data, children }: LayoutProps = $props();

  // Publish campaign context to the shared module (docs/DESIGN.md app shell):
  // the root layout's bottom tab bar and this rail both read it, so it is the
  // single source of truth (no duplicate local state). Overview is always
  // shown; the Keeper Dashboard row appears only for the Keeper. Entity-type
  // rows (Characters, World, Mysteries, Settings) land in 0.11.3 when they get
  // real destinations, so we do not render dead links here.
  //
  // Keyed on data.id via $effect (not onMount): SvelteKit keeps this layout
  // mounted when navigating straight from one campaign to another, so the
  // fetch must re-run whenever the id changes or the rail goes stale.
  $effect(() => {
    const id = data.id;
    // Optimistic default so the rail/bottom bar have something to show
    // before the fetch resolves; corrected on success.
    setCampaignNav({ id, name: "Campaign", isKeeper: false });
    void getCampaign(id)
      .then((campaign) => {
        if (data.id !== id) return; // navigated away mid-flight
        setCampaignNav({
          id,
          name: campaign.name,
          isKeeper: sessionState.user !== null && campaign.keeperUserId === sessionState.user.id
        });
      })
      .catch(() => {
        // Offline or unauthorized: keep the optimistic default (Overview
        // and a way back to the campaign list stay available).
      });
  });

  onDestroy(() => {
    clearCampaignNav();
  });

  function normalize(path: string): string {
    return path.replace(/\/+$/, "");
  }

  const isKeeper = $derived(campaignNav.current?.isKeeper ?? false);
  const overviewHref = $derived(resolve("/campaigns/[id]", { id: data.id }));
  const dashboardHref = $derived(resolve("/campaigns/[id]/dashboard", { id: data.id }));
  const current = $derived(normalize(page.url.pathname));
</script>

<div class="campaign-shell">
  <nav class="context-rail" aria-label="Campaign sections">
    <a class="rail-row" class:active={current === normalize(overviewHref)} href={resolve("/campaigns/[id]", { id: data.id })}>
      <Icon icon={LayoutList} size={18} />
      <span>Overview</span>
    </a>
    {#if isKeeper}
      <a class="rail-row" class:active={current === normalize(dashboardHref)} href={resolve("/campaigns/[id]/dashboard", { id: data.id })}>
        <Icon icon={ClipboardList} size={18} />
        <span>Dashboard</span>
      </a>
    {/if}
  </nav>

  <div class="campaign-content">
    {@render children()}
  </div>
</div>

<style>
  /* On mobile the rail is hidden; the root layout's bottom tab bar handles
     campaign navigation. Tablet/desktop show the sticky context rail as a
     left column (docs/DESIGN.md "Campaign context rail"). */
  .campaign-shell {
    display: block;
  }

  .context-rail {
    display: none;
  }

  .campaign-content {
    min-width: 0;
  }

  @media (min-width: 768px) {
    .campaign-shell {
      display: grid;
      grid-template-columns: var(--rail-w) 1fr;
      align-items: start;
    }

    .context-rail {
      display: flex;
      flex-direction: column;
      gap: var(--space-1);
      position: sticky;
      top: var(--space-6);
      padding: var(--space-6) var(--space-3);
    }
  }

  .rail-row {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    min-height: var(--tap-min);
    padding: var(--space-2) var(--space-3);
    border-left: 2px solid transparent;
    border-radius: 0 var(--radius-md) var(--radius-md) 0;
    color: var(--ink-muted);
    font-family: var(--font-meta);
    font-size: var(--text-sm);
    letter-spacing: 0.04em;
    text-decoration: none;
  }

  .rail-row:hover {
    color: var(--ink);
  }

  /* The "open folder" language shared with the top-bar tabs: the active
     section is raised onto --surface with an accent left rule. */
  .rail-row.active {
    color: var(--ink);
    background: var(--surface);
    border-left-color: var(--accent);
  }

  .rail-row:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
  }
</style>
