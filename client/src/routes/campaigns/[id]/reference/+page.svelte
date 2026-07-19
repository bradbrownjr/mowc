<script lang="ts">
  import { goto } from "$app/navigation";
  import { resolve } from "$app/paths";
  import { sessionState } from "$lib/session.svelte";
  import { CampaignApiError, getCampaign } from "$lib/api/campaigns.js";
  import { getPack, type PackDetail } from "$lib/api/contentPacks.js";
  import { collectKeeperReference, type KeeperReference } from "$lib/keeper-reference.js";
  import EmptyState from "$lib/EmptyState.svelte";
  import FieldNote from "$lib/FieldNote.svelte";
  import { GLOSS } from "$lib/glossary.js";
  import type { PageProps } from "./$types.js";

  let { data }: PageProps = $props();

  let loadError = $state<string | null>(null);
  let notKeeper = $state(false);
  let reference = $state<KeeperReference | null>(null);

  $effect(() => {
    if (sessionState.status !== "ready") return;
    if (!sessionState.user) {
      void goto(resolve("/login"));
      return;
    }

    getCampaign(data.id)
      .then(async (campaign) => {
        loadError = null;
        if (campaign.keeperUserId !== sessionState.user?.id) {
          notKeeper = true;
          return;
        }
        const packs = await Promise.all(campaign.packIds.map((id) => getPack(id).catch(() => null)));
        const loaded = packs.filter((p): p is PackDetail => p !== null);
        reference = collectKeeperReference(loaded.map((p) => p.pack));
      })
      .catch((err) => {
        loadError = err instanceof CampaignApiError ? err.message : "Campaign not found.";
      });
  });
</script>

<main class="page page--wide">
  <a class="back-link" href={resolve("/campaigns/[id]", { id: data.id })}>Back to overview</a>
  <h1 class="title">Keeper reference</h1>
  <FieldNote>
    This is at-the-table lookup for the {GLOSS.keeper} only: your agenda, principles, "always say" reminders, and move
    lists, pulled from the content packs attached to this campaign. Nothing here is editable; edit a pack to change it.
  </FieldNote>

  {#if loadError}
    <p class="error">{loadError}</p>
  {:else if notKeeper}
    <p class="error">Only the {GLOSS.keeper} can view Keeper reference.</p>
  {:else if !reference}
    <p class="meta">Loading...</p>
  {:else if reference.isEmpty}
    <EmptyState
      what="Keeper reference is agenda, principles, always-say reminders, and move lists for running the game at the table."
      why="Attach a content pack that carries a Keeper reference section (agenda, principles, keeper moves) to this campaign's Settings, and it appears here automatically."
    />
  {:else}
    {#if reference.agenda.length > 0}
      <section class="panel">
        <h2 class="section-title">Agenda</h2>
        <ul class="text-list">
          {#each reference.agenda as line, index (index)}
            <li>{line}</li>
          {/each}
        </ul>
      </section>
    {/if}

    {#if reference.principles.length > 0}
      <section class="panel">
        <h2 class="section-title">Principles</h2>
        <ul class="text-list">
          {#each reference.principles as line, index (index)}
            <li>{line}</li>
          {/each}
        </ul>
      </section>
    {/if}

    {#if reference.alwaysSay.length > 0}
      <section class="panel">
        <h2 class="section-title">Always say</h2>
        <ul class="text-list">
          {#each reference.alwaysSay as line, index (index)}
            <li>{line}</li>
          {/each}
        </ul>
      </section>
    {/if}

    {#if reference.keeperMoves.basic.length > 0 || reference.keeperMoves.monster.length > 0 || reference.keeperMoves.minion.length > 0 || reference.keeperMoves.bystander.length > 0 || reference.keeperMoves.location.length > 0 || reference.keeperMoves.harm}
      <section class="panel">
        <h2 class="section-title">Keeper moves</h2>

        {#if reference.keeperMoves.basic.length > 0}
          <h3 class="subsection-title">Basic</h3>
          <ul class="text-list">
            {#each reference.keeperMoves.basic as line, index (index)}
              <li>{line}</li>
            {/each}
          </ul>
        {/if}

        {#if reference.keeperMoves.monster.length > 0}
          <h3 class="subsection-title">Monster</h3>
          <ul class="text-list">
            {#each reference.keeperMoves.monster as line, index (index)}
              <li>{line}</li>
            {/each}
          </ul>
        {/if}

        {#if reference.keeperMoves.minion.length > 0}
          <h3 class="subsection-title">Minion</h3>
          <ul class="text-list">
            {#each reference.keeperMoves.minion as line, index (index)}
              <li>{line}</li>
            {/each}
          </ul>
        {/if}

        {#if reference.keeperMoves.bystander.length > 0}
          <h3 class="subsection-title">Bystander</h3>
          <ul class="text-list">
            {#each reference.keeperMoves.bystander as line, index (index)}
              <li>{line}</li>
            {/each}
          </ul>
        {/if}

        {#if reference.keeperMoves.location.length > 0}
          <h3 class="subsection-title">Location</h3>
          <ul class="text-list">
            {#each reference.keeperMoves.location as line, index (index)}
              <li>{line}</li>
            {/each}
          </ul>
        {/if}

        {#if reference.keeperMoves.harm}
          <h3 class="subsection-title">Harm</h3>
          {#if reference.keeperMoves.harm.note}
            <p class="harm-note">{reference.keeperMoves.harm.note}</p>
          {/if}
          {#each reference.keeperMoves.harm.tiers as tier, index (index)}
            <div class="harm-tier">
              <p class="harm-tier-label">{tier.label}</p>
              <ul class="text-list">
                {#each tier.effects as effect, effectIndex (effectIndex)}
                  <li>{effect}</li>
                {/each}
              </ul>
            </div>
          {/each}
        {/if}
      </section>
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
    gap: var(--space-2);
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

  .subsection-title {
    margin: var(--space-2) 0 0;
    font-family: var(--font-meta);
    font-size: var(--text-sm);
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--ink-muted);
  }

  .text-list {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
    margin: 0;
    padding-left: var(--space-4);
    color: var(--ink);
    font-family: var(--font-body);
    font-size: var(--text-base);
    line-height: 1.4;
  }

  .harm-note {
    margin: 0;
    white-space: pre-line;
    color: var(--ink);
    font-family: var(--font-body);
    font-size: var(--text-base);
    line-height: 1.4;
  }

  .harm-tier {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
  }

  .harm-tier-label {
    margin: 0;
    font-family: var(--font-body);
    font-weight: 700;
    color: var(--ink);
  }
</style>
