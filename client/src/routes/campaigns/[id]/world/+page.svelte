<script lang="ts">
  import { goto } from "$app/navigation";
  import { resolve } from "$app/paths";
  import type { Minion, Bystander, Location, Monster } from "@mowc/shared";
  import { sessionState } from "$lib/session.svelte";
  import { getCampaign } from "$lib/api/campaigns.js";
  import { db } from "$lib/db.js";
  import { pull } from "$lib/sync.js";
  import EvidenceTag from "$lib/EvidenceTag.svelte";
  import EmptyState from "$lib/EmptyState.svelte";
  import FieldNote from "$lib/FieldNote.svelte";
  import { GLOSS } from "$lib/glossary.js";
  import type { PageProps } from "./$types.js";

  let { data }: PageProps = $props();

  let loadError = $state<string | null>(null);
  let isKeeper = $state(false);

  let monsters = $state<Monster[]>([]);
  let minions = $state<Minion[]>([]);
  let bystanders = $state<Bystander[]>([]);
  let locations = $state<Location[]>([]);

  async function loadMonsters(): Promise<void> {
    const rows = await db.entities
      .where("[campaignId+type]")
      .equals([data.id, "monster"])
      .and((row) => !row.deleted)
      .toArray();
    monsters = rows.map((row) => row.payload as unknown as Monster).sort((a, b) => a.name.localeCompare(b.name));
  }

  async function loadMinions(): Promise<void> {
    const rows = await db.entities
      .where("[campaignId+type]")
      .equals([data.id, "minion"])
      .and((row) => !row.deleted)
      .toArray();
    minions = rows.map((row) => row.payload as unknown as Minion).sort((a, b) => a.name.localeCompare(b.name));
  }

  async function loadBystanders(): Promise<void> {
    const rows = await db.entities
      .where("[campaignId+type]")
      .equals([data.id, "bystander"])
      .and((row) => !row.deleted)
      .toArray();
    bystanders = rows.map((row) => row.payload as unknown as Bystander).sort((a, b) => a.name.localeCompare(b.name));
  }

  async function loadLocations(): Promise<void> {
    const rows = await db.entities
      .where("[campaignId+type]")
      .equals([data.id, "location"])
      .and((row) => !row.deleted)
      .toArray();
    locations = rows.map((row) => row.payload as unknown as Location).sort((a, b) => a.name.localeCompare(b.name));
  }

  $effect(() => {
    if (sessionState.status !== "ready") return;
    if (!sessionState.user) {
      void goto(resolve("/login"));
      return;
    }

    getCampaign(data.id)
      .then((campaign) => {
        loadError = null;
        isKeeper = campaign.keeperUserId === sessionState.user?.id;
      })
      .catch(() => {
        loadError = "Campaign not found.";
      });

    // Offline-first (AGENTS.md rule 2): a hunter's local rows are already
    // revealed-gated server-side on pull (docs/SYNC.md), so no client-side
    // visibility filtering is needed here.
    pull(data.id)
      .catch(() => {})
      .finally(() => {
        void loadMonsters();
        void loadMinions();
        void loadBystanders();
        void loadLocations();
      });
  });
</script>

<main class="page page--wide">
  <a class="back-link" href={resolve("/campaigns/[id]", { id: data.id })}>Back to overview</a>
  <h1 class="title">World</h1>
  <FieldNote>
    {#if isKeeper}
      Monsters, minions, bystanders, and locations are only created by the {GLOSS.keeper}; toggle "Revealed" on each one
      when your hunters should see it.
    {:else}
      This shows only what your {GLOSS.keeper} has revealed so far.
    {/if}
  </FieldNote>

  {#if loadError}
    <p class="error">{loadError}</p>
  {:else}
    <section class="panel">
      <h2 class="section-title">Monsters</h2>
      {#if monsters.length > 0}
        {#if isKeeper}
          <a class="submit-button" href={resolve("/campaigns/[id]/monsters/new", { id: data.id })}>Create a monster</a>
        {/if}
        <ul class="entity-list">
          {#each monsters as monster (monster.id)}
            <li class="entity-row">
              <a class="entity-link" href={resolve("/campaigns/[id]/monsters/[monsterId]", { id: data.id, monsterId: monster.id })}>
                {monster.name}
              </a>
              {#if isKeeper && monster.revealed}<EvidenceTag label="Revealed" />{/if}
            </li>
          {/each}
        </ul>
      {:else}
        <EmptyState
          what="A monster (the case's antagonist) is the threat your hunters are tracking."
          why="Create one to give this mystery something to hunt."
          ctaLabel={isKeeper ? "Create a monster" : undefined}
          ctaHref={isKeeper ? resolve("/campaigns/[id]/monsters/new", { id: data.id }) : undefined}
        >
          {#if !isKeeper}Your Keeper reveals monsters here as you discover them.{/if}
        </EmptyState>
      {/if}
    </section>

    <section class="panel">
      <h2 class="section-title">Minions</h2>
      {#if minions.length > 0}
        {#if isKeeper}
          <a class="submit-button" href={resolve("/campaigns/[id]/minions/new", { id: data.id })}>Create a minion</a>
        {/if}
        <ul class="entity-list">
          {#each minions as minion (minion.id)}
            <li class="entity-row">
              <a class="entity-link" href={resolve("/campaigns/[id]/minions/[minionId]", { id: data.id, minionId: minion.id })}>
                {minion.name}
              </a>
              {#if isKeeper && minion.revealed}<EvidenceTag label="Revealed" />{/if}
            </li>
          {/each}
        </ul>
      {:else}
        <EmptyState
          what="A minion (a monster's underling) does its master's dirty work."
          why="Create one to give the monster hands to work through."
          ctaLabel={isKeeper ? "Create a minion" : undefined}
          ctaHref={isKeeper ? resolve("/campaigns/[id]/minions/new", { id: data.id }) : undefined}
        >
          {#if !isKeeper}Your Keeper reveals minions here as you discover them.{/if}
        </EmptyState>
      {/if}
    </section>

    <section class="panel">
      <h2 class="section-title">Bystanders</h2>
      {#if bystanders.length > 0}
        {#if isKeeper}
          <a class="submit-button" href={resolve("/campaigns/[id]/bystanders/new", { id: data.id })}>Create a bystander</a>
        {/if}
        <ul class="entity-list">
          {#each bystanders as bystander (bystander.id)}
            <li class="entity-row">
              <a class="entity-link" href={resolve("/campaigns/[id]/bystanders/[bystanderId]", { id: data.id, bystanderId: bystander.id })}>
                {bystander.name}
              </a>
              {#if isKeeper && bystander.revealed}<EvidenceTag label="Revealed" />{/if}
            </li>
          {/each}
        </ul>
      {:else}
        <EmptyState
          what="A bystander is a person caught up in the case who isn't a hunter or a monster."
          why="Create one for anyone the party needs to talk to, protect, or suspect."
          ctaLabel={isKeeper ? "Create a bystander" : undefined}
          ctaHref={isKeeper ? resolve("/campaigns/[id]/bystanders/new", { id: data.id }) : undefined}
        >
          {#if !isKeeper}Your Keeper reveals bystanders here as you meet them.{/if}
        </EmptyState>
      {/if}
    </section>

    <section class="panel">
      <h2 class="section-title">Locations</h2>
      {#if locations.length > 0}
        {#if isKeeper}
          <a class="submit-button" href={resolve("/campaigns/[id]/locations/new", { id: data.id })}>Create a location</a>
        {/if}
        <ul class="entity-list">
          {#each locations as location (location.id)}
            <li class="entity-row">
              <a class="entity-link" href={resolve("/campaigns/[id]/locations/[locationId]", { id: data.id, locationId: location.id })}>
                {location.name}
              </a>
              {#if isKeeper && location.revealed}<EvidenceTag label="Revealed" />{/if}
            </li>
          {/each}
        </ul>
      {:else}
        <EmptyState
          what="A location is a place in the case: a scene, a lair, a haunt."
          why="Create one to give the party somewhere to investigate."
          ctaLabel={isKeeper ? "Create a location" : undefined}
          ctaHref={isKeeper ? resolve("/campaigns/[id]/locations/new", { id: data.id }) : undefined}
        >
          {#if !isKeeper}Your Keeper reveals locations here as you discover them.{/if}
        </EmptyState>
      {/if}
    </section>
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
</style>
