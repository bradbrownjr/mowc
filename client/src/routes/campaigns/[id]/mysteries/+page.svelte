<script lang="ts">
  import { goto } from "$app/navigation";
  import { resolve } from "$app/paths";
  import type { Mystery } from "@mowc/shared";
  import { sessionState } from "$lib/session.svelte";
  import { CampaignApiError, getCampaign } from "$lib/api/campaigns.js";
  import { db } from "$lib/db.js";
  import { pull } from "$lib/sync.js";
  import EmptyState from "$lib/EmptyState.svelte";
  import FieldNote from "$lib/FieldNote.svelte";
  import type { PageProps } from "./$types.js";

  let { data }: PageProps = $props();

  let loadError = $state<string | null>(null);
  let notKeeper = $state(false);
  let mysteries = $state<Mystery[]>([]);

  async function loadMysteries(): Promise<void> {
    const rows = await db.entities
      .where("[campaignId+type]")
      .equals([data.id, "mystery"])
      .and((row) => !row.deleted)
      .toArray();
    mysteries = rows.map((row) => row.payload as unknown as Mystery).sort((a, b) => a.title.localeCompare(b.title));
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
        notKeeper = campaign.keeperUserId !== sessionState.user?.id;
      })
      .catch((err) => {
        loadError = err instanceof CampaignApiError ? err.message : "Campaign not found.";
      });

    pull(data.id)
      .catch(() => {})
      .finally(() => {
        void loadMysteries();
      });
  });
</script>

<main class="page page--wide">
  <a class="back-link" href={resolve("/campaigns/[id]", { id: data.id })}>Back to overview</a>
  <h1 class="title">Mysteries</h1>
  <FieldNote>Mysteries are Keeper-only to build; your hunters experience them through play, not this list.</FieldNote>

  {#if loadError}
    <p class="error">{loadError}</p>
  {:else if notKeeper}
    <p class="error">Only the Keeper (the person running the game) can see mysteries.</p>
  {:else}
    <a class="submit-button" href={resolve("/campaigns/[id]/dashboard", { id: data.id })}>Open Keeper dashboard</a>

    {#if mysteries.length > 0}
      <a class="submit-button" href={resolve("/campaigns/[id]/mysteries/new", { id: data.id })}>Create a mystery</a>
      <ul class="entity-list">
        {#each mysteries as mystery (mystery.id)}
          <li class="entity-row">
            <a class="entity-link" href={resolve("/campaigns/[id]/mysteries/[mysteryId]", { id: data.id, mysteryId: mystery.id })}>
              {mystery.title}
            </a>
            <span class="entity-meta">{mystery.status}</span>
          </li>
        {/each}
      </ul>
    {:else}
      <EmptyState
        what="A mystery (one session's case) is the hook, countdown, cast, and locations your hunters investigate."
        why="Create one to give the party something to solve."
        ctaLabel="Create a mystery"
        ctaHref={resolve("/campaigns/[id]/mysteries/new", { id: data.id })}
      />
    {/if}
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

  .entity-meta {
    font-family: var(--font-meta);
    font-size: var(--text-xs);
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--ink-muted);
  }
</style>
