<script lang="ts">
  import { onDestroy } from "svelte";
  import { resolve } from "$app/paths";
  import { page } from "$app/state";
  import { LayoutList, ClipboardList, Users, Globe, BookOpen, Settings } from "@lucide/svelte";
  import Icon from "$lib/Icon.svelte";
  import { sessionState } from "$lib/session.svelte";
  import { getCampaign } from "$lib/api/campaigns.js";
  import { campaignNav, setCampaignNav, clearCampaignNav } from "$lib/campaign-nav.svelte";
  import { db } from "$lib/db.js";
  import { pull } from "$lib/sync.js";
  import type { Character } from "@mowc/shared";
  import type { LayoutProps } from "./$types.js";

  let { data, children }: LayoutProps = $props();

  // Publish campaign context to the shared module (docs/DESIGN.md app shell):
  // the root layout's bottom tab bar and this rail both read it, so it is the
  // single source of truth (no duplicate local state). Overview and
  // Characters/World are shown to everyone; Mysteries, Dashboard, and
  // Settings are Keeper-only (docs/DESIGN.md "Campaign context rail").
  //
  // Keyed on data.id via $effect (not onMount): SvelteKit keeps this layout
  // mounted when navigating straight from one campaign to another, so the
  // fetch must re-run whenever the id changes or the rail goes stale. The
  // sessionState guard must be read synchronously (not inside the .then())
  // so it's a tracked dependency too: on a cold direct-navigation to a
  // nested campaign route, initSession() (root layout onMount) can still be
  // resolving when this effect first fires. Without the guard, isKeeper
  // gets computed once against a not-yet-populated sessionState.user and
  // never corrects itself, since data.id doesn't change on its own — the
  // Keeper-only rail rows (Mysteries/Dashboard/Settings) then silently stay
  // hidden for the Keeper until they navigate to a different campaign.
  $effect(() => {
    if (sessionState.status !== "ready" || !sessionState.user) return;
    const id = data.id;
    // Optimistic default so the rail/bottom bar have something to show
    // before the fetch resolves; corrected on success.
    setCampaignNav({ id, name: "Campaign", isKeeper: false, ownCharacterId: null });
    void getCampaign(id)
      .then(async (campaign) => {
        if (data.id !== id) return; // navigated away mid-flight
        const isKeeper = sessionState.user !== null && campaign.keeperUserId === sessionState.user.id;
        let ownCharacterId: string | null = null;
        if (!isKeeper && sessionState.user) {
          // Best-effort: the local mirror may not be populated yet if this
          // is the first page visited in the campaign, in which case the
          // bottom bar's "Sheet" tab falls back to the builder CTA until a
          // page pulls (docs/SYNC.md); a fresh pull here closes that gap on
          // the common case of entering straight from a campaign link.
          await pull(id).catch(() => {});
          const rows = await db.entities
            .where("[campaignId+type]")
            .equals([id, "character"])
            .and((row) => !row.deleted)
            .toArray();
          const mine = rows.find((row) => (row.payload as unknown as Character).ownerUserId === sessionState.user?.id);
          ownCharacterId = mine?.id ?? null;
        }
        if (data.id !== id) return; // navigated away mid-flight (post-await)
        setCampaignNav({ id, name: campaign.name, isKeeper, ownCharacterId });
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
  const charactersHref = $derived(resolve("/campaigns/[id]/characters", { id: data.id }));
  const mysteriesHref = $derived(resolve("/campaigns/[id]/mysteries", { id: data.id }));
  const worldHref = $derived(resolve("/campaigns/[id]/world", { id: data.id }));
  const dashboardHref = $derived(resolve("/campaigns/[id]/dashboard", { id: data.id }));
  const settingsHref = $derived(resolve("/campaigns/[id]/settings", { id: data.id }));
  const current = $derived(normalize(page.url.pathname));
</script>

<div class="campaign-shell">
  <nav class="context-rail" aria-label="Campaign sections">
    <a class="rail-row" class:active={current === normalize(overviewHref)} href={resolve("/campaigns/[id]", { id: data.id })}>
      <Icon icon={LayoutList} size={18} />
      <span>Overview</span>
    </a>
    <a class="rail-row" class:active={current === normalize(charactersHref)} href={resolve("/campaigns/[id]/characters", { id: data.id })}>
      <Icon icon={Users} size={18} />
      <span>Characters</span>
    </a>
    {#if isKeeper}
      <a class="rail-row" class:active={current === normalize(mysteriesHref)} href={resolve("/campaigns/[id]/mysteries", { id: data.id })}>
        <Icon icon={BookOpen} size={18} />
        <span>Mysteries</span>
      </a>
    {/if}
    <a class="rail-row" class:active={current === normalize(worldHref)} href={resolve("/campaigns/[id]/world", { id: data.id })}>
      <Icon icon={Globe} size={18} />
      <span>World</span>
    </a>
    {#if isKeeper}
      <a class="rail-row" class:active={current === normalize(dashboardHref)} href={resolve("/campaigns/[id]/dashboard", { id: data.id })}>
        <Icon icon={ClipboardList} size={18} />
        <span>Dashboard</span>
      </a>
      <a class="rail-row" class:active={current === normalize(settingsHref)} href={resolve("/campaigns/[id]/settings", { id: data.id })}>
        <Icon icon={Settings} size={18} />
        <span>Settings</span>
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
