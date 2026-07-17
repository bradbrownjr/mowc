<script lang="ts">
  import { goto } from "$app/navigation";
  import { resolve } from "$app/paths";
  import type { Campaign, Character, Mystery } from "@mowc/shared";
  import type { ResolvedPathname } from "$app/types";
  import { sessionState } from "$lib/session.svelte";
  import { getCampaign, listInvites } from "$lib/api/campaigns.js";
  import { db, type LocalEntity } from "$lib/db.js";
  import { pull } from "$lib/sync.js";
  import EmptyState from "$lib/EmptyState.svelte";
  import type { PageProps } from "./$types.js";

  let { data }: PageProps = $props();

  let campaign = $state<Campaign | null>(null);
  let loadError = $state<string | null>(null);

  let characters = $state<Character[]>([]);
  let mysteries = $state<Mystery[]>([]);
  let recentWorld = $state<LocalEntity[]>([]);
  let inviteCount = $state<number | null>(null);

  const isKeeper = $derived(campaign !== null && sessionState.user !== null && campaign.keeperUserId === sessionState.user.id);
  const ownCharacter = $derived(characters.find((c) => c.ownerUserId === sessionState.user?.id) ?? null);
  const checklistDone = $derived(
    campaign !== null && campaign.packIds.length > 0 && (inviteCount ?? 0) > 0 && mysteries.length > 0
  );

  const WORLD_TYPES = ["monster", "minion", "bystander", "location"] as const;
  const WORLD_LABELS: Record<(typeof WORLD_TYPES)[number], string> = {
    monster: "Monster",
    minion: "Minion",
    bystander: "Bystander",
    location: "Location"
  };

  function worldHref(type: (typeof WORLD_TYPES)[number], id: string): ResolvedPathname {
    switch (type) {
      case "monster":
        return resolve("/campaigns/[id]/monsters/[monsterId]", { id: data.id, monsterId: id });
      case "minion":
        return resolve("/campaigns/[id]/minions/[minionId]", { id: data.id, minionId: id });
      case "bystander":
        return resolve("/campaigns/[id]/bystanders/[bystanderId]", { id: data.id, bystanderId: id });
      case "location":
        return resolve("/campaigns/[id]/locations/[locationId]", { id: data.id, locationId: id });
    }
  }

  async function loadCharacters(): Promise<void> {
    const rows = await db.entities
      .where("[campaignId+type]")
      .equals([data.id, "character"])
      .and((row) => !row.deleted)
      .toArray();
    characters = rows.map((row) => row.payload as unknown as Character).sort((a, b) => a.name.localeCompare(b.name));
  }

  async function loadMysteries(): Promise<void> {
    const rows = await db.entities
      .where("[campaignId+type]")
      .equals([data.id, "mystery"])
      .and((row) => !row.deleted)
      .toArray();
    mysteries = rows.map((row) => row.payload as unknown as Mystery).sort((a, b) => a.title.localeCompare(b.title));
  }

  /**
   * Loads world entities (monster/minion/bystander/location) as raw local
   * rows (not just payload) so `updatedAt` is available for the Keeper's
   * "recent" summary; a hunter's local rows are already revealed-gated
   * server-side on pull, so this only ever reflects what they can see.
   */
  async function loadWorld(): Promise<void> {
    const rows = await Promise.all(
      WORLD_TYPES.map((type) =>
        db.entities
          .where("[campaignId+type]")
          .equals([data.id, type])
          .and((row) => !row.deleted)
          .toArray()
      )
    );
    recentWorld = rows
      .flat()
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      .slice(0, 5);
  }

  $effect(() => {
    if (sessionState.status !== "ready") return;
    if (!sessionState.user) {
      void goto(resolve("/login"));
      return;
    }

    getCampaign(data.id)
      .then((result) => {
        campaign = result;
        loadError = null;
        if (result.keeperUserId === sessionState.user?.id) {
          listInvites(data.id)
            .then((invites) => (inviteCount = invites.length))
            .catch(() => (inviteCount = 0));
        }
      })
      .catch(() => {
        loadError = "Campaign not found.";
      });

    // Offline-first (AGENTS.md rule 2): attempt a fresh pull on campaign
    // open (docs/SYNC.md), but always fall back to whatever's already
    // local if it fails or we're offline.
    pull(data.id)
      .catch(() => {})
      .finally(() => {
        void loadCharacters();
        void loadMysteries();
        void loadWorld();
      });
  });
</script>

<main class="page page--wide">
  <a class="back-link" href={resolve("/campaigns")}>Back to campaigns</a>

  {#if loadError}
    <p class="error">{loadError}</p>
  {:else if campaign}
    <h1 class="title">{campaign.name}</h1>
    <p class="meta">{isKeeper ? "Keeper" : "Hunter"}</p>

    {#if isKeeper}
      {#if !checklistDone}
        <section class="panel checklist">
          <h2 class="section-title">Get set up</h2>
          <ul class="checklist-list">
            <li class="checklist-item" class:done={campaign.packIds.length > 0}>
              <a href={resolve("/campaigns/[id]/settings", { id: data.id })}>Attach a content pack</a>
            </li>
            <li class="checklist-item" class:done={(inviteCount ?? 0) > 0}>
              <a href={resolve("/campaigns/[id]/settings", { id: data.id })}>Invite your players</a>
            </li>
            <li class="checklist-item" class:done={mysteries.length > 0}>
              <a href={resolve("/campaigns/[id]/mysteries/new", { id: data.id })}>Create your first mystery</a>
            </li>
          </ul>
        </section>
      {/if}

      <section class="panel">
        <h2 class="section-title">Mysteries</h2>
        <a class="submit-button" href={resolve("/campaigns/[id]/dashboard", { id: data.id })}>Open Keeper dashboard</a>
        {#if mysteries.length > 0}
          <ul class="entity-list">
            {#each mysteries.slice(0, 5) as mystery (mystery.id)}
              <li class="entity-row">
                <a class="entity-link" href={resolve("/campaigns/[id]/mysteries/[mysteryId]", { id: data.id, mysteryId: mystery.id })}>
                  {mystery.title}
                </a>
                <span class="entity-meta">{mystery.status}</span>
              </li>
            {/each}
          </ul>
          {#if mysteries.length > 5}
            <a class="see-all" href={resolve("/campaigns/[id]/mysteries", { id: data.id })}>See all mysteries</a>
          {/if}
        {:else}
          <EmptyState
            what="A mystery (one session's case) is the hook, countdown, cast, and locations your hunters investigate."
            why="Create one to give the party something to solve."
            ctaLabel="Create a mystery"
            ctaHref={resolve("/campaigns/[id]/mysteries/new", { id: data.id })}
          />
        {/if}
      </section>

      <section class="panel">
        <h2 class="section-title">Party</h2>
        <a class="submit-button" href={resolve("/campaigns/[id]/characters/new", { id: data.id })}>Create a character</a>
        {#if characters.length > 0}
          <ul class="entity-list">
            {#each characters as character (character.id)}
              <li class="entity-row">
                <a
                  class="entity-link"
                  href={resolve("/campaigns/[id]/characters/[characterId]", { id: data.id, characterId: character.id })}
                >
                  {character.name}
                </a>
              </li>
            {/each}
          </ul>
        {:else}
          <EmptyState
            what="A character (a hunter's playbook sheet) is who a player plays as when they take on the monsters."
            why="Your players create characters after joining with an invite code."
            ctaLabel="Create a character"
            ctaHref={resolve("/campaigns/[id]/characters/new", { id: data.id })}
          />
        {/if}
      </section>

      <section class="panel">
        <h2 class="section-title">Recent world entities</h2>
        <a class="submit-button" href={resolve("/campaigns/[id]/world", { id: data.id })}>Open World</a>
        {#if recentWorld.length > 0}
          <ul class="entity-list">
            {#each recentWorld as row (row.id)}
              <li class="entity-row">
                <!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- worldHref() always returns a resolve()d path, dispatched by row.type -->
                <a class="entity-link" href={worldHref(row.type as (typeof WORLD_TYPES)[number], row.id)}>
                  {(row.payload as { name: string }).name}
                </a>
                <span class="entity-meta">{WORLD_LABELS[row.type as (typeof WORLD_TYPES)[number]]}</span>
              </li>
            {/each}
          </ul>
        {:else}
          <EmptyState
            what="Monsters, minions, bystanders, and locations are the cast and scenery of your case."
            why="Create them from the World page as you build out the mystery."
            ctaLabel="Open World"
            ctaHref={resolve("/campaigns/[id]/world", { id: data.id })}
          />
        {/if}
      </section>
    {:else}
      <section class="panel">
        <h2 class="section-title">Your character</h2>
        {#if ownCharacter}
          <a class="entity-link" href={resolve("/campaigns/[id]/characters/[characterId]", { id: data.id, characterId: ownCharacter.id })}>
            {ownCharacter.name}
          </a>
        {:else}
          <EmptyState
            what="A character (your playbook sheet) is who you play as when you take on the monsters."
            why="Create one to join the case."
            ctaLabel="Create a character"
            ctaHref={resolve("/campaigns/[id]/characters/new", { id: data.id })}
          />
        {/if}
      </section>

      <section class="panel">
        <h2 class="section-title">World</h2>
        {#if recentWorld.length > 0}
          <ul class="entity-list">
            {#each recentWorld as row (row.id)}
              <li class="entity-row">
                <!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- worldHref() always returns a resolve()d path, dispatched by row.type -->
                <a class="entity-link" href={worldHref(row.type as (typeof WORLD_TYPES)[number], row.id)}>
                  {(row.payload as { name: string }).name}
                </a>
                <span class="entity-meta">{WORLD_LABELS[row.type as (typeof WORLD_TYPES)[number]]}</span>
              </li>
            {/each}
          </ul>
          <a class="see-all" href={resolve("/campaigns/[id]/world", { id: data.id })}>See everything revealed</a>
        {:else}
          <EmptyState
            what="Monsters, minions, bystanders, and locations are the cast and scenery of your case."
            why=""
            >Your Keeper reveals these here as you discover them.</EmptyState
          >
        {/if}
      </section>
    {/if}
  {:else}
    <p class="meta">Loading...</p>
  {/if}
</main>

<style>
  .back-link {
    align-self: flex-start;
    color: var(--ink-muted);
    font-family: var(--font-meta);
    font-size: var(--text-sm);
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }

  .title {
    margin: 0;
    font-family: var(--font-display);
    font-size: var(--text-2xl);
    letter-spacing: 0.02em;
    text-transform: uppercase;
    color: var(--ink);
  }

  .meta {
    margin: 0;
    font-family: var(--font-meta);
    font-size: var(--text-sm);
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--ink-muted);
  }

  .error {
    margin: 0;
    color: var(--danger);
    font-family: var(--font-body);
    font-size: var(--text-sm);
  }

  .panel {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: var(--space-3);
    padding: var(--space-4);
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius-lg);
  }

  .section-title {
    margin: 0;
    font-family: var(--font-display);
    font-size: var(--text-lg);
    letter-spacing: 0.02em;
    text-transform: uppercase;
    color: var(--ink);
  }

  .submit-button {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    align-self: flex-start;
    min-height: var(--tap-min);
    padding: var(--space-2) var(--space-4);
    background: var(--surface-2);
    color: var(--ink);
    border: 1px solid var(--border);
    border-radius: var(--radius-md);
    cursor: pointer;
    font-family: var(--font-meta);
    font-size: var(--text-sm);
    letter-spacing: 0.08em;
    text-transform: uppercase;
    text-decoration: none;
  }

  .entity-list {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    list-style: none;
    margin: 0;
    padding: 0;
    width: 100%;
  }

  .entity-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-2);
    padding: var(--space-2) var(--space-3);
    background: var(--surface-2);
    border: 1px solid var(--border);
    border-radius: var(--radius-md);
  }

  .entity-meta {
    font-family: var(--font-meta);
    font-size: var(--text-xs);
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--ink-muted);
  }

  .entity-link {
    min-height: var(--tap-min);
    display: flex;
    align-items: center;
    color: var(--ink);
    font-family: var(--font-body);
    font-size: var(--text-base);
    text-decoration: none;
  }

  .entity-link:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
  }

  .see-all {
    align-self: flex-start;
    color: var(--ink-muted);
    font-family: var(--font-meta);
    font-size: var(--text-xs);
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }

  .checklist {
    border-style: dashed;
  }

  .checklist-list {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    list-style: none;
    margin: 0;
    padding: 0;
    width: 100%;
  }

  .checklist-item a {
    color: var(--ink);
    font-family: var(--font-body);
    font-size: var(--text-base);
  }

  .checklist-item.done a {
    color: var(--ink-muted);
    text-decoration: line-through;
  }
</style>
