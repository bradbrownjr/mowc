<script lang="ts">
  import { goto } from "$app/navigation";
  import { resolve } from "$app/paths";
  import { page } from "$app/state";
  import type { Campaign } from "@mowc/shared";
  import { sessionState } from "$lib/session.svelte";
  import { CampaignApiError, createCampaign, listCampaigns, redeemInvite } from "$lib/api/campaigns.js";
  import { GLOSS } from "$lib/glossary.js";
  import FieldNote from "$lib/FieldNote.svelte";
  import EmptyState from "$lib/EmptyState.svelte";

  let campaigns = $state<Campaign[]>([]);
  let loaded = $state(false);
  let loadError = $state<string | null>(null);

  let newCampaignName = $state("");
  let creating = $state(false);
  let createError = $state<string | null>(null);

  let inviteCode = $state("");
  let joining = $state(false);
  let joinError = $state<string | null>(null);

  const joinFirst = $derived(page.url.searchParams.get("intent") === "join");

  async function refresh(): Promise<void> {
    try {
      campaigns = await listCampaigns();
      loadError = null;
    } catch {
      // Offline-first carve-out (AGENTS.md): campaign browsing degrades to
      // a message rather than caching the list locally.
      loadError = "You're offline. Reconnect to see your campaigns.";
    } finally {
      loaded = true;
    }
  }

  $effect(() => {
    if (sessionState.status !== "ready") return;
    if (!sessionState.user) {
      void goto(resolve("/login"));
      return;
    }
    void refresh();
  });

  function roleOf(campaign: Campaign): string {
    return sessionState.user && campaign.keeperUserId === sessionState.user.id ? "Keeper" : "Hunter";
  }

  async function onCreate(e: SubmitEvent): Promise<void> {
    e.preventDefault();
    creating = true;
    createError = null;
    try {
      await createCampaign({ name: newCampaignName });
      newCampaignName = "";
      await refresh();
    } catch (err) {
      createError = err instanceof CampaignApiError ? err.message : "Could not create the campaign.";
    } finally {
      creating = false;
    }
  }

  async function onJoin(e: SubmitEvent): Promise<void> {
    e.preventDefault();
    joining = true;
    joinError = null;
    try {
      const { campaignId } = await redeemInvite(inviteCode.trim());
      inviteCode = "";
      await goto(resolve("/campaigns/[id]", { id: campaignId }));
    } catch (err) {
      joinError = err instanceof CampaignApiError ? err.message : "Could not redeem that code.";
    } finally {
      joining = false;
    }
  }
</script>

<main class="page">
  <h1 class="title">My campaigns</h1>

  {#if loadError}
    <p class="error">{loadError}</p>
  {:else if loaded && campaigns.length === 0}
    <EmptyState
      what="A campaign is your ongoing Monster of the Week game: its mysteries, its world, and everyone playing in it."
      why="Create one below if you're running the game, or join one with an invite code if someone else is."
    />
  {:else if campaigns.length > 0}
    <FieldNote>
      {GLOSS.keeper} builds and runs a campaign; {GLOSS.hunter} plays through it. Each row below shows which one you are
      there.
    </FieldNote>
    <ul class="campaign-list">
      {#each campaigns as campaign (campaign.id)}
        <li class="campaign-row">
          <a class="campaign-link" href={resolve("/campaigns/[id]", { id: campaign.id })}>
            <span class="campaign-name">{campaign.name}</span>
            <span class="campaign-meta">{roleOf(campaign)}</span>
          </a>
        </li>
      {/each}
    </ul>
  {/if}

  <div class="action-panels" style:flex-direction={joinFirst ? "column-reverse" : "column"}>
    <section class="panel">
      <h2 class="section-title">Create a campaign</h2>
      <form onsubmit={onCreate}>
        <label class="field">
          <span class="field-label">Campaign name</span>
          <input type="text" bind:value={newCampaignName} required maxlength="100" />
        </label>
        {#if createError}
          <p class="error">{createError}</p>
        {/if}
        <button type="submit" class="submit-button" disabled={creating}>
          {creating ? "Creating..." : "Create campaign"}
        </button>
      </form>
    </section>

    <section class="panel">
      <h2 class="section-title">Join with invite code</h2>
      <FieldNote>Ask your {GLOSS.keeper} for the invite code they sent you.</FieldNote>
      <form onsubmit={onJoin}>
        <label class="field">
          <span class="field-label">Invite code</span>
          <input type="text" bind:value={inviteCode} required maxlength="32" autocomplete="off" />
        </label>
        {#if joinError}
          <p class="error">{joinError}</p>
        {/if}
        <button type="submit" class="submit-button" disabled={joining}>
          {joining ? "Joining..." : "Join campaign"}
        </button>
      </form>
    </section>
  </div>
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

  .error {
    margin: 0;
    color: var(--danger);
    font-family: var(--font-body);
    font-size: var(--text-sm);
  }

  .campaign-list {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    list-style: none;
    margin: 0;
    padding: 0;
  }

  .campaign-row {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius-md);
  }

  .campaign-link {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-2);
    min-height: var(--tap-min);
    padding: var(--space-3);
    color: var(--ink);
    text-decoration: none;
  }

  .campaign-name {
    font-family: var(--font-body);
    font-size: var(--text-base);
  }

  .campaign-meta {
    font-family: var(--font-meta);
    font-size: var(--text-xs);
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--ink-muted);
  }

  .action-panels {
    display: flex;
    gap: var(--space-4);
  }

  .panel {
    display: flex;
    flex-direction: column;
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

  form {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
  }

  .field {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
  }

  .field-label {
    font-family: var(--font-meta);
    font-size: var(--text-xs);
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--ink-muted);
  }

  input {
    min-height: var(--tap-min);
    padding: var(--space-2) var(--space-3);
    background: var(--surface-2);
    color: var(--ink);
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    font-family: var(--font-body);
    font-size: var(--text-base);
  }

  input:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
  }

  .submit-button {
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
  }

  .submit-button:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  .submit-button:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
  }
</style>
