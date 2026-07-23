<script lang="ts">
  import { goto } from "$app/navigation";
  import { resolve } from "$app/paths";
  import type { Character, PlaybookDef } from "@mowc/shared";
  import { sessionState } from "$lib/session.svelte";
  import { getPack, listPacks, type PackDetail } from "$lib/api/contentPacks.js";
  import { listCampaigns } from "$lib/api/campaigns.js";
  import { flattenPlaybooks, type CampaignOption } from "$lib/character-builder.js";
  import CharacterBuilder from "$lib/CharacterBuilder.svelte";
  import EmptyState from "$lib/EmptyState.svelte";

  let loading = $state(true);
  let availablePlaybooks = $state<PlaybookDef[]>([]);
  let campaignOptions = $state<CampaignOption[]>([]);

  /**
   * Playbooks for the default (Standalone) scope come from every pack the
   * user can already read without a campaign: their own uploads plus
   * admin-shared packs (listPacks()'s existing scoping), unlike the
   * campaign builder which only offers packs attached to that campaign.
   *
   * The wizard also offers a campaign-picker step (0.14.2) so a character
   * built here can be attached to a seated campaign instead; campaignOptions
   * preloads every seated campaign's own attached-pack playbooks so
   * switching scope mid-wizard needs no further round trip.
   */
  async function load(): Promise<void> {
    const summaries = (await listPacks().catch(() => [])).filter((s) => !s.disabled);
    const details = await Promise.all(summaries.map((s) => getPack(s.id).catch(() => null)));
    const loaded = details.filter((d): d is PackDetail => d !== null);
    availablePlaybooks = flattenPlaybooks(loaded.map((d) => d.pack));

    const campaigns = await listCampaigns().catch(() => []);
    campaignOptions = await Promise.all(
      campaigns.map(async (campaign) => {
        const packs = await Promise.all(campaign.packIds.map((id) => getPack(id).catch(() => null)));
        const loadedPacks = packs.filter((p): p is PackDetail => p !== null);
        return { id: campaign.id, name: campaign.name, playbooks: flattenPlaybooks(loadedPacks.map((p) => p.pack)) };
      })
    );

    loading = false;
  }

  /** The wizard's own picker decides the final scope; a character created
   * here can end up campaign-scoped if the user picked one. */
  function onCreated(character: Character): void {
    const target = character.campaignId
      ? resolve("/campaigns/[id]/characters/[characterId]", { id: character.campaignId, characterId: character.id })
      : resolve("/characters/[characterId]", { characterId: character.id });
    void goto(target);
  }

  const hasAnyPlaybooks = $derived(
    availablePlaybooks.length > 0 || campaignOptions.some((c) => c.playbooks.length > 0)
  );

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
  {:else if !hasAnyPlaybooks}
    <h1 class="title">New character</h1>
    <EmptyState
      what="A playbook (a character template) sets your hunter's role, starting moves, and gear."
      why="Upload a content pack with playbooks, or ask someone to share one, before building a character here."
      ctaLabel="Go to content packs"
      ctaHref={resolve("/packs")}
    />
  {:else}
    <CharacterBuilder
      ownerUserId={sessionState.user?.id ?? ""}
      playbooks={availablePlaybooks}
      {campaignOptions}
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
