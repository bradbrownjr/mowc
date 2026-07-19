<script lang="ts">
  import { goto } from "$app/navigation";
  import { resolve } from "$app/paths";
  import type { Character, PlaybookDef } from "@mowc/shared";
  import { sessionState } from "$lib/session.svelte";
  import { getPack, listPacks, type PackDetail } from "$lib/api/contentPacks.js";
  import { flattenPlaybooks } from "$lib/character-builder.js";
  import CharacterBuilder from "$lib/CharacterBuilder.svelte";
  import EmptyState from "$lib/EmptyState.svelte";

  let loading = $state(true);
  let availablePlaybooks = $state<PlaybookDef[]>([]);

  /**
   * Playbooks for a standalone (campaign-less) character come from every
   * pack the user can already read without a campaign: their own uploads
   * plus admin-shared packs (listPacks()'s existing scoping), unlike the
   * campaign builder which only offers packs attached to that campaign.
   */
  async function load(): Promise<void> {
    const summaries = await listPacks().catch(() => []);
    const details = await Promise.all(summaries.map((s) => getPack(s.id).catch(() => null)));
    const loaded = details.filter((d): d is PackDetail => d !== null);
    availablePlaybooks = flattenPlaybooks(loaded.map((d) => d.pack));
    loading = false;
  }

  function onCreated(character: Character): void {
    void goto(resolve("/characters/[characterId]", { characterId: character.id }));
  }

  $effect(() => {
    if (sessionState.status !== "ready") return;
    if (!sessionState.user) {
      void goto(resolve("/login"));
      return;
    }
    void load();
  });
</script>

<main class="page">
  <a class="back-link" href={resolve("/characters")}>Back to my characters</a>

  {#if loading}
    <p class="meta">Loading...</p>
  {:else if availablePlaybooks.length === 0}
    <h1 class="title">New character</h1>
    <EmptyState
      what="A playbook (a character template) sets your hunter's role, starting moves, and gear."
      why="Upload a content pack with playbooks, or ask someone to share one, before building a character here."
      ctaLabel="Go to content packs"
      ctaHref={resolve("/packs")}
    />
  {:else}
    <CharacterBuilder
      campaignId={null}
      ownerUserId={sessionState.user?.id ?? ""}
      playbooks={availablePlaybooks}
      {onCreated}
    />
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
</style>
