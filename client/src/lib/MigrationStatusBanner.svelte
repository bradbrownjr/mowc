<script lang="ts">
  /**
   * Hunter-facing status surface for a Keeper-approved pack-transfer migration
   * request (docs/adr/0003-pack-transfer-approval.md Decision 7, ROADMAP
   * 0.15.4). Owner-only: rendered by the character-sheet routes alongside
   * `MigrateCharacter.svelte`, only when the signed-in user owns the
   * character. `request` is controlled by the parent route, which polls
   * `GET .../migrate-requests/latest` on load (the same offline-tolerant
   * "can't check right now, don't block" pattern the 0.14.5 pack-warning
   * check and the Keeper's own approval dialog already use, so a failed
   * fetch there simply means `request` stays null and this renders nothing)
   * and also seeds it directly from `MigrateCharacter`'s `onRequestCreated`
   * callback, without a second network round trip.
   *
   * Three terminal-ish states render, mapped from the request's status by
   * `migrationBannerKind` (client/src/lib/migration-requests.ts):
   * - pending: the move is awaiting the destination Keeper's decision; offers
   *   "Cancel request" (an owner-initiated withdrawal, byte-identical to a
   *   deny server-side per ADR 0003 Decision 6).
   * - approved: the server already completed the move. The new id is
   *   re-derived by replaying `POST /migrate` with the SAME migrationId,
   *   which hits ADR 0002's `findMigration` idempotency short-circuit and
   *   returns the stored result without moving anything a second time; this
   *   auto-fires once, then re-points local storage and navigates away, the
   *   same success path `MigrateCharacter.svelte` uses for a direct move.
   * - denied (also covers expired): the move never happened. Offers "Move
   *   without the pack" (the pre-0.15 direct migrate, now an explicit,
   *   informed choice) or "Cancel" (a local-only dismiss; ADR 0003 Decision 6
   *   needs no new endpoint for either choice since the request is already
   *   terminal). Note this dismiss is session-local only: the server has no
   *   "acknowledged" flag, so a fresh poll after a full reload will surface
   *   the same denied request again until the hunter acts or files a new one.
   */
  import { goto } from "$app/navigation";
  import { resolve } from "$app/paths";
  import type { MigrationRequest } from "@mowc/shared";
  import { migrateCharacter } from "$lib/api/characters.js";
  import { cancelMigrationRequest } from "$lib/api/migrationRequests.js";
  import {
    approvedRequestMessage,
    deniedRequestMessage,
    migrationBannerKind,
    pendingRequestMessage
  } from "$lib/migration-requests.js";
  import { applyMigration } from "$lib/sync.js";
  import { generateUuid } from "$lib/uuid.js";

  interface Props {
    characterId: string;
    request: MigrationRequest | null;
    onRequestChange: (request: MigrationRequest | null) => void;
  }

  let { characterId, request, onRequestChange }: Props = $props();

  const STANDALONE = "standalone";

  let busy = $state(false);
  let error = $state<string | null>(null);
  let attemptedRedirect = $state(false);

  const kind = $derived(request ? migrationBannerKind(request.status) : null);

  async function navigateToSheet(destScope: string, newId: string): Promise<void> {
    if (destScope === STANDALONE) {
      await goto(resolve("/characters/[characterId]", { characterId: newId }));
    } else {
      await goto(resolve("/campaigns/[id]/characters/[characterId]", { id: destScope, characterId: newId }));
    }
  }

  async function goToApprovedDestination(): Promise<void> {
    if (!request || busy) return;
    busy = true;
    error = null;
    try {
      const res = await migrateCharacter(characterId, {
        migrationId: request.migrationId,
        destinationCampaignId: request.destinationCampaignId
      });
      await applyMigration(res.sourceScope, res.sourceId, res.destScope);
      await navigateToSheet(res.destScope, res.newId);
    } catch (e) {
      error = e instanceof Error ? e.message : "Could not open the character at its new home.";
    } finally {
      busy = false;
    }
  }

  // Fires once as soon as an approved request is seen; a failure shows an
  // error plus a manual retry rather than looping.
  $effect(() => {
    if (kind === "approved" && !attemptedRedirect) {
      attemptedRedirect = true;
      void goToApprovedDestination();
    }
  });

  async function cancelRequest(): Promise<void> {
    if (!request || busy) return;
    busy = true;
    error = null;
    try {
      onRequestChange(await cancelMigrationRequest(characterId, request.migrationId));
    } catch (e) {
      error = e instanceof Error ? e.message : "Could not cancel the move request.";
    } finally {
      busy = false;
    }
  }

  async function moveWithoutPack(): Promise<void> {
    if (!request || busy) return;
    busy = true;
    error = null;
    try {
      const res = await migrateCharacter(characterId, {
        migrationId: generateUuid(),
        destinationCampaignId: request.destinationCampaignId
      });
      await applyMigration(res.sourceScope, res.sourceId, res.destScope);
      await navigateToSheet(res.destScope, res.newId);
    } catch (e) {
      error = e instanceof Error ? e.message : "Could not move this character.";
    } finally {
      busy = false;
    }
  }

  function dismiss(): void {
    onRequestChange(null);
  }
</script>

{#if kind === "pending" && request}
  <section class="panel status-panel">
    <h2 class="section-title">Move pending</h2>
    <p class="meta">{pendingRequestMessage(request)}</p>
    <button type="button" class="text-action" onclick={cancelRequest} disabled={busy}>
      {busy ? "Cancelling..." : "Cancel request"}
    </button>
    {#if error}<p class="error">{error}</p>{/if}
  </section>
{:else if kind === "approved" && request}
  <section class="panel status-panel status-panel--ok">
    <h2 class="section-title">Move approved</h2>
    <p class="meta">{approvedRequestMessage(request)}</p>
    {#if error}
      <p class="error">{error}</p>
      <button type="button" class="text-action" onclick={goToApprovedDestination} disabled={busy}>
        {busy ? "Trying..." : "Try again"}
      </button>
    {/if}
  </section>
{:else if kind === "denied" && request}
  <section class="panel status-panel status-panel--danger">
    <h2 class="section-title">Move declined</h2>
    <p class="meta">{deniedRequestMessage(request)}</p>
    <div class="status-actions">
      <button type="button" class="fallback-button" onclick={moveWithoutPack} disabled={busy}>
        {busy ? "Moving..." : "Move without the pack"}
      </button>
      <button type="button" class="text-action" onclick={dismiss} disabled={busy}>Cancel</button>
    </div>
    {#if error}<p class="error">{error}</p>{/if}
  </section>
{/if}

<style>
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

  .status-panel--ok {
    border-color: var(--ok);
  }

  .status-panel--danger {
    border-color: var(--danger);
  }

  .section-title {
    margin: 0;
    font-family: var(--font-display);
    font-size: var(--text-lg);
    letter-spacing: 0.02em;
    text-transform: uppercase;
    color: var(--ink);
  }

  .meta {
    margin: 0;
    font-family: var(--font-body);
    font-size: var(--text-base);
    line-height: 1.4;
    color: var(--ink);
  }

  .status-actions {
    display: flex;
    align-items: center;
    gap: var(--space-3);
  }

  .fallback-button {
    min-height: var(--tap-min);
    padding: var(--space-2) var(--space-4);
    background: var(--surface);
    border: 2px solid var(--danger);
    border-radius: var(--radius-sm);
    color: var(--danger);
    font-family: var(--font-display);
    font-size: var(--text-sm);
    letter-spacing: 0.05em;
    text-transform: uppercase;
    cursor: pointer;
  }

  .fallback-button:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .fallback-button:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
  }

  .text-action {
    padding: 0;
    background: none;
    border: none;
    color: var(--ink-muted);
    font-family: var(--font-meta);
    font-size: var(--text-xs);
    letter-spacing: 0.08em;
    text-transform: uppercase;
    text-decoration: underline;
    cursor: pointer;
  }

  .text-action:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .text-action:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
  }

  .error {
    margin: 0;
    color: var(--danger);
    font-family: var(--font-body);
    font-size: var(--text-sm);
  }
</style>
