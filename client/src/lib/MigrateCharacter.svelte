<script lang="ts">
  /**
   * "Move to campaign" / "Detach to standalone" control (ADR 0002, 0.14.4).
   * Owner-only: rendered by the character-sheet routes only when the signed-in
   * user owns the character. Migration is a foreground server request (it spans
   * two sync buckets and so cannot be an oplog op), so unlike ordinary play this
   * control awaits the network and re-points local IndexedDB on success.
   */
  import { goto } from "$app/navigation";
  import { resolve } from "$app/paths";
  import { liveQuery } from "dexie";
  import type { Campaign } from "@mowc/shared";
  import { listCampaigns } from "$lib/api/campaigns.js";
  import { migrateCharacter } from "$lib/api/characters.js";
  import { db } from "$lib/db.js";
  import { applyMigration, pendingCountForScope, push } from "$lib/sync.js";
  import { generateUuid } from "$lib/uuid.js";

  interface Props {
    characterId: string;
    /** The character's current scope key: a campaign id, or "standalone". */
    sourceScope: string;
  }

  let { characterId, sourceScope }: Props = $props();

  // "standalone" sentinel for the detach option; a campaign id otherwise.
  const STANDALONE = "standalone";

  let campaigns = $state<Campaign[]>([]);
  let selected = $state("");
  let pending = $state(0);
  let busy = $state(false);
  let syncing = $state(false);
  let error = $state<string | null>(null);

  // Destinations: every campaign the owner is seated in except the current one,
  // plus "Standalone" unless the character is already standalone.
  const options = $derived([
    ...(sourceScope === STANDALONE ? [] : [{ value: STANDALONE, label: "Standalone (no campaign)" }]),
    ...campaigns
      .filter((campaign) => campaign.id !== sourceScope)
      .map((campaign) => ({ value: campaign.id, label: campaign.name }))
  ]);

  $effect(() => {
    listCampaigns()
      .then((list) => {
        campaigns = list;
      })
      .catch(() => {
        campaigns = [];
      });

    // Proactively flush this scope so a just-created (or just-edited) character
    // can be moved as soon as its ops reach the server, rather than waiting for
    // the 2s debounce or a manual sync (ADR 0002 SS6: push, then enable once the
    // oplog is clean). Offline is fine, the live count below keeps the gate honest.
    void push(sourceScope).catch(() => {});

    // Keep the pending count live off the oplog so the Move button re-enables the
    // moment the queue drains (a background push, a reconnect, or Sync now) with
    // no manual refresh. liveQuery re-runs whenever the oplog table changes.
    const subscription = liveQuery(() =>
      db.oplog.where("campaignId").equals(sourceScope).count()
    ).subscribe({
      next: (count) => {
        pending = count;
      }
    });
    return () => subscription.unsubscribe();
  });

  async function syncNow(): Promise<void> {
    syncing = true;
    error = null;
    try {
      await push(sourceScope);
    } catch {
      error = "Could not sync your latest changes. Check your connection and try again.";
    } finally {
      syncing = false;
    }
  }

  async function move(): Promise<void> {
    if (!selected || busy) return;
    busy = true;
    error = null;
    try {
      // Precondition (ADR 0002 §6): a migrate against a scope with pending local
      // ops would snapshot a stale server row and silently drop unsynced edits.
      // The live `pending` above already gates the button; this is the durable
      // guard in case an op was queued between the last render and the click.
      const count = await pendingCountForScope(sourceScope);
      if (count > 0) {
        error = "You have unsynced changes on this character. Sync first, then move.";
        return;
      }
      const destinationCampaignId = selected === STANDALONE ? null : selected;
      const res = await migrateCharacter(characterId, {
        migrationId: generateUuid(),
        destinationCampaignId
      });
      await applyMigration(res.sourceScope, res.sourceId, res.destScope);
      if (res.destScope === STANDALONE) {
        await goto(resolve("/characters/[characterId]", { characterId: res.newId }));
      } else {
        await goto(
          resolve("/campaigns/[id]/characters/[characterId]", { id: res.destScope, characterId: res.newId })
        );
      }
    } catch (e) {
      error = e instanceof Error ? e.message : "Could not move this character.";
    } finally {
      busy = false;
    }
  }
</script>

<section class="panel">
  <h2 class="section-title">Move character</h2>
  <p class="meta">
    Move this character to another campaign or detach it to your standalone space, carrying its full
    progress. Its harm, luck, and experience travel with it.
  </p>

  {#if options.length === 0}
    <p class="meta">No other place to move this character to yet. Join a campaign first.</p>
  {:else}
    <label class="field">
      <span class="field-label">Destination</span>
      <select class="select" bind:value={selected} disabled={busy}>
        <option value="">Choose a destination</option>
        {#each options as option (option.value)}
          <option value={option.value}>{option.label}</option>
        {/each}
      </select>
    </label>

    {#if pending > 0}
      <p class="warn">
        You have {pending} unsynced change{pending === 1 ? "" : "s"} on this character.
        <button type="button" class="text-button" onclick={syncNow} disabled={syncing}>
          {syncing ? "Syncing..." : "Sync now"}
        </button>
      </p>
    {/if}

    <button type="button" class="move-button" onclick={move} disabled={busy || !selected || pending > 0}>
      {busy ? "Moving..." : "Move character"}
    </button>
  {/if}

  {#if error}
    <p class="error">{error}</p>
  {/if}
</section>

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
    font-family: var(--font-meta);
    font-size: var(--text-sm);
    letter-spacing: 0.04em;
    color: var(--ink-muted);
  }

  .field {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
    width: 100%;
  }

  .field-label {
    font-family: var(--font-meta);
    font-size: var(--text-xs);
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--ink-muted);
  }

  .select {
    width: 100%;
    min-height: var(--tap-min);
    padding: var(--space-2) var(--space-3);
    color: var(--ink);
    background: var(--surface-2);
    border: 1px solid var(--border);
    border-radius: var(--radius-md);
    font-family: var(--font-body);
    font-size: var(--text-base);
  }

  .select:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
  }

  .warn {
    margin: 0;
    font-family: var(--font-meta);
    font-size: var(--text-sm);
    letter-spacing: 0.04em;
    color: var(--danger);
  }

  .text-button {
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

  .text-button:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
  }

  .move-button {
    min-height: var(--tap-min);
    padding: var(--space-2) var(--space-4);
    background: var(--surface);
    border: 2px solid var(--accent);
    border-radius: var(--radius-sm);
    color: var(--accent);
    font-family: var(--font-display);
    font-size: var(--text-sm);
    letter-spacing: 0.05em;
    text-transform: uppercase;
    cursor: pointer;
  }

  .move-button:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .move-button:focus-visible {
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
