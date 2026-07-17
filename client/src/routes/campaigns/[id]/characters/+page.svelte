<script lang="ts">
  import { goto } from "$app/navigation";
  import { resolve } from "$app/paths";
  import type { Character } from "@mowc/shared";
  import { sessionState } from "$lib/session.svelte";
  import { getCampaign } from "$lib/api/campaigns.js";
  import { db } from "$lib/db.js";
  import { pull } from "$lib/sync.js";
  import EmptyState from "$lib/EmptyState.svelte";
  import FieldNote from "$lib/FieldNote.svelte";
  import type { PageProps } from "./$types.js";

  let { data }: PageProps = $props();

  let loadError = $state<string | null>(null);
  let characters = $state<Character[]>([]);

  /**
   * Reads this campaign's characters from local IndexedDB. Pull already
   * filters visibility server-side (a hunter only ever receives their own
   * character rows, a Keeper receives everyone's, see
   * server/src/entities/router.ts), so no extra client-side ownership
   * filtering is needed here.
   */
  async function loadCharacters(): Promise<void> {
    const rows = await db.entities
      .where("[campaignId+type]")
      .equals([data.id, "character"])
      .and((row) => !row.deleted)
      .toArray();
    characters = rows.map((row) => row.payload as unknown as Character).sort((a, b) => a.name.localeCompare(b.name));
  }

  $effect(() => {
    if (sessionState.status !== "ready") return;
    if (!sessionState.user) {
      void goto(resolve("/login"));
      return;
    }

    getCampaign(data.id)
      .then(() => {
        loadError = null;
      })
      .catch(() => {
        loadError = "Campaign not found.";
      });

    pull(data.id)
      .catch(() => {})
      .finally(() => {
        void loadCharacters();
      });
  });
</script>

<main class="page page--wide">
  <a class="back-link" href={resolve("/campaigns/[id]", { id: data.id })}>Back to overview</a>
  <h1 class="title">Characters</h1>
  <FieldNote>Everyone in the campaign can see this list. A hunter creates their own character here after joining.</FieldNote>

  {#if loadError}
    <p class="error">{loadError}</p>
  {:else}
    {#if characters.length > 0}
      <a class="submit-button" href={resolve("/campaigns/[id]/characters/new", { id: data.id })}>Create a character</a>
      <ul class="entity-list">
        {#each characters as character (character.id)}
          <li class="entity-row">
            <a class="entity-link" href={resolve("/campaigns/[id]/characters/[characterId]", { id: data.id, characterId: character.id })}>
              {character.name}
            </a>
          </li>
        {/each}
      </ul>
    {:else}
      <EmptyState
        what="A character (a hunter's playbook sheet) is who you play as when you take on the monsters."
        why="Create one to join the case."
        ctaLabel="Create a character"
        ctaHref={resolve("/campaigns/[id]/characters/new", { id: data.id })}
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
</style>
