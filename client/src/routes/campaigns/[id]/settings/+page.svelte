<script lang="ts">
  import { goto } from "$app/navigation";
  import { resolve } from "$app/paths";
  import type { Campaign } from "@mowc/shared";
  import { sessionState } from "$lib/session.svelte";
  import {
    CampaignApiError,
    createInvite,
    getCampaign,
    listInvites,
    revokeInvite,
    updateCampaign,
    type InviteSummary
  } from "$lib/api/campaigns.js";
  import { listPacks, type PackSummary } from "$lib/api/contentPacks.js";
  import FieldNote from "$lib/FieldNote.svelte";
  import type { PageProps } from "./$types.js";

  let { data }: PageProps = $props();

  let campaign = $state<Campaign | null>(null);
  let loadError = $state<string | null>(null);
  let notKeeper = $state(false);

  let invites = $state<InviteSummary[]>([]);
  let newInviteCode = $state<string | null>(null);
  let inviteError = $state<string | null>(null);
  let creatingInvite = $state(false);

  let packs = $state<PackSummary[]>([]);
  let packsError = $state<string | null>(null);
  let togglingPackId = $state<string | null>(null);

  async function refreshInvites(): Promise<void> {
    try {
      invites = await listInvites(data.id);
    } catch {
      inviteError = "Could not load invites.";
    }
  }

  async function refreshPacks(): Promise<void> {
    try {
      packs = await listPacks();
    } catch {
      packsError = "Could not load content packs.";
    }
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
        if (result.keeperUserId !== sessionState.user?.id) {
          notKeeper = true;
          return;
        }
        void refreshInvites();
        void refreshPacks();
      })
      .catch(() => {
        loadError = "Campaign not found.";
      });
  });

  async function onTogglePack(packId: string): Promise<void> {
    if (!campaign) return;
    const attached = campaign.packIds.includes(packId);
    const packIds = attached ? campaign.packIds.filter((id) => id !== packId) : [...campaign.packIds, packId];
    togglingPackId = packId;
    packsError = null;
    try {
      campaign = await updateCampaign(data.id, { packIds });
    } catch (err) {
      packsError = err instanceof CampaignApiError ? err.message : "Could not update content packs.";
    } finally {
      togglingPackId = null;
    }
  }

  async function onCreateInvite(): Promise<void> {
    creatingInvite = true;
    inviteError = null;
    try {
      const invite = await createInvite(data.id);
      newInviteCode = invite.code;
      await refreshInvites();
    } catch (err) {
      inviteError = err instanceof CampaignApiError ? err.message : "Could not create an invite.";
    } finally {
      creatingInvite = false;
    }
  }

  async function onRevoke(inviteId: string): Promise<void> {
    try {
      await revokeInvite(data.id, inviteId);
      await refreshInvites();
    } catch (err) {
      inviteError = err instanceof CampaignApiError ? err.message : "Could not revoke that invite.";
    }
  }
</script>

<main class="page page--wide">
  <a class="back-link" href={resolve("/campaigns/[id]", { id: data.id })}>Back to overview</a>
  <h1 class="title">Campaign settings</h1>
  <FieldNote>
    Content packs give you the playbooks and monster types to build from; invite codes are how your hunters join this
    campaign. Both are Keeper-only.
  </FieldNote>

  {#if loadError}
    <p class="error">{loadError}</p>
  {:else if notKeeper}
    <p class="error">Only the Keeper (the person running the game) can change campaign settings.</p>
  {:else if campaign}
    <section class="panel">
      <h2 class="section-title">Content packs</h2>
      {#if packsError}
        <p class="error">{packsError}</p>
      {/if}
      {#if packs.length > 0}
        <ul class="entity-list">
          {#each packs as pack (pack.id)}
            {@const attached = campaign.packIds.includes(pack.id)}
            <li class="entity-row">
              <span class="entity-meta">{pack.name} - {pack.author}</span>
              <button
                type="button"
                class="toggle-button"
                class:attached
                onclick={() => onTogglePack(pack.id)}
                disabled={togglingPackId === pack.id}
              >
                {attached ? "Detach" : "Attach"}
              </button>
            </li>
          {/each}
        </ul>
      {:else}
        <p class="entity-meta">No content packs uploaded yet. <a href={resolve("/packs/new")}>Upload one</a>.</p>
      {/if}
    </section>

    <section class="panel">
      <h2 class="section-title">Invite codes</h2>
      <button type="button" class="submit-button" onclick={onCreateInvite} disabled={creatingInvite}>
        {creatingInvite ? "Generating..." : "Generate invite code"}
      </button>

      {#if newInviteCode}
        <p class="invite-code">Code: <strong>{newInviteCode}</strong> (shown once, share it with your hunter)</p>
      {/if}
      {#if inviteError}
        <p class="error">{inviteError}</p>
      {/if}

      {#if invites.length > 0}
        <ul class="entity-list">
          {#each invites as invite (invite.id)}
            <li class="entity-row">
              <span class="entity-meta">
                {invite.revoked ? "Revoked" : `Expires ${new Date(invite.expiresAt).toLocaleString()}`}
              </span>
              {#if !invite.revoked}
                <button type="button" class="icon-button" onclick={() => onRevoke(invite.id)}>Revoke</button>
              {/if}
            </li>
          {/each}
        </ul>
      {:else}
        <p class="entity-meta">No invite codes yet.</p>
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

  .submit-button:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  .submit-button:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
  }

  .invite-code {
    margin: 0;
    color: var(--ink);
    font-family: var(--font-body);
    font-size: var(--text-sm);
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

  .icon-button {
    min-height: var(--tap-min);
    padding: var(--space-1) var(--space-3);
    background: var(--surface);
    color: var(--danger);
    border: 1px solid var(--border);
    border-radius: var(--radius-md);
    cursor: pointer;
    font-family: var(--font-meta);
    font-size: var(--text-xs);
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }

  .icon-button:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
  }

  .toggle-button {
    min-height: var(--tap-min);
    padding: var(--space-1) var(--space-3);
    background: var(--surface);
    color: var(--ink);
    border: 1px solid var(--border);
    border-radius: var(--radius-md);
    cursor: pointer;
    font-family: var(--font-meta);
    font-size: var(--text-xs);
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }

  .toggle-button.attached {
    color: var(--danger);
  }

  .toggle-button:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  .toggle-button:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
  }
</style>
