<script lang="ts">
  import { goto } from "$app/navigation";
  import { resolve } from "$app/paths";
  import { sessionState } from "$lib/session.svelte";
  import { listCampaigns } from "$lib/api/campaigns.js";
  import { db } from "$lib/db.js";
  import { pull } from "$lib/sync.js";
  import EmptyState from "$lib/EmptyState.svelte";
  import FieldNote from "$lib/FieldNote.svelte";
  import { groupOwnCharacters, type CharacterGroup } from "$lib/my-characters.js";

  let loading = $state(true);
  let groups = $state<CharacterGroup[]>([]);

  /**
   * Freshens every campaign the user is seated in (plus the standalone scope)
   * so a character created on another device shows up, then reads the user's
   * own characters from local IndexedDB and groups them for display. Falls back
   * to whatever is already local if the network is unavailable.
   */
  async function load(userId: string): Promise<void> {
    let campaignNames = new Map<string, string>();
    try {
      const campaigns = await listCampaigns();
      campaignNames = new Map(campaigns.map((c) => [c.id, c.name]));
      await Promise.all([
        ...campaigns.map((c) => pull(c.id).catch(() => {})),
        pull("standalone").catch(() => {})
      ]);
    } catch {
      // Offline or API error: render from local data below.
    }
    const entities = await db.entities.toArray();
    groups = groupOwnCharacters(entities, userId, campaignNames);
    loading = false;
  }

  $effect(() => {
    if (sessionState.status !== "ready") return;
    if (!sessionState.user) {
      void goto(resolve("/login"));
      return;
    }
    void load(sessionState.user.id);
  });
</script>

<main class="page page--wide">
  <h1 class="title">My characters</h1>
  <FieldNote>Every hunter you play, gathered from all your campaigns in one place.</FieldNote>

  {#if loading}
    <p class="meta">Loading...</p>
  {:else if groups.length === 0}
    <EmptyState
      what="A character (a hunter's playbook sheet) is who you play as when you take on the monsters."
      why="Create a standalone character, or join or start a campaign and create your hunter there."
      ctaLabel="New character"
      ctaHref={resolve("/characters/new")}
    />
  {:else}
    <a class="submit-button" href={resolve("/characters/new")}>New character</a>
    {#each groups as group (group.key)}
      <section class="group">
        <h2 class="group-label">{group.label}</h2>
        <ul class="entity-list">
          {#each group.characters as character (character.id)}
            <li class="entity-row">
              {#if group.campaignId}
                <a
                  class="entity-link"
                  href={resolve("/campaigns/[id]/characters/[characterId]", {
                    id: group.campaignId,
                    characterId: character.id
                  })}
                >
                  {character.name}
                </a>
              {:else}
                <a class="entity-link" href={resolve("/characters/[characterId]", { characterId: character.id })}>
                  {character.name}
                </a>
              {/if}
            </li>
          {/each}
        </ul>
      </section>
    {/each}
  {/if}
</main>

<style>
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

  .group {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    width: 100%;
  }

  .group-label {
    margin: 0;
    font-family: var(--font-display);
    font-size: var(--text-lg);
    letter-spacing: 0.02em;
    text-transform: uppercase;
    color: var(--ink);
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
