<script lang="ts">
  import { goto } from "$app/navigation";
  import { resolve } from "$app/paths";
  import type { Campaign, PlaybookDef } from "@mowc/shared";
  import { sessionState } from "$lib/session.svelte";
  import { CampaignApiError, getCampaign } from "$lib/api/campaigns.js";
  import { getPack, type PackDetail } from "$lib/api/contentPacks.js";
  import { GLOSS } from "$lib/glossary.js";
  import { flattenPlaybooks } from "$lib/character-builder.js";
  import CharacterBuilder from "$lib/CharacterBuilder.svelte";
  import type { PageProps } from "./$types.js";

  let { data }: PageProps = $props();

  let campaign = $state<Campaign | null>(null);
  let loadError = $state<string | null>(null);
  let availablePlaybooks = $state<PlaybookDef[]>([]);

  $effect(() => {
    if (sessionState.status !== "ready") return;
    if (!sessionState.user) {
      void goto(resolve("/login"));
      return;
    }

    getCampaign(data.id)
      .then(async (result) => {
        campaign = result;
        loadError = null;
        const packs = await Promise.all(result.packIds.map((id) => getPack(id).catch(() => null)));
        const loaded = packs.filter((p): p is PackDetail => p !== null);
        availablePlaybooks = flattenPlaybooks(loaded.map((p) => p.pack));
      })
      .catch((err) => {
        loadError = err instanceof CampaignApiError ? err.message : "Campaign not found.";
      });
  });
</script>

<main class="page">
  <a class="back-link" href={resolve("/campaigns/[id]", { id: data.id })}>Back to campaign</a>

  {#if loadError}
    <p class="error">{loadError}</p>
  {:else if !campaign}
    <p class="meta">Loading...</p>
  {:else if availablePlaybooks.length === 0}
    <h1 class="title">New character</h1>
    <p class="meta">Ask your {GLOSS.keeper} to attach a content pack with playbooks.</p>
  {:else}
    <CharacterBuilder
      campaignId={data.id}
      ownerUserId={sessionState.user?.id ?? ""}
      playbooks={availablePlaybooks}
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

  .error {
    margin: 0;
    color: var(--danger);
    font-family: var(--font-body);
    font-size: var(--text-sm);
  }
</style>
