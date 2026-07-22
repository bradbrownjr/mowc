<script lang="ts">
  /**
   * Keeper approval dialog for pack-transfer migration requests
   * (docs/adr/0003-pack-transfer-approval.md, ROADMAP 0.15.3). Rendered
   * Keeper-only on campaign access (the campaign Overview screen, the
   * Keeper's natural landing page). Fetches every pending request targeting
   * this campaign and renders one card per request rather than a single
   * dialog, so a busy Keeper with several hunters' requests pending at once
   * can act on each independently (ADR 0003 open risk 3); zero pending
   * requests means the panel renders nothing.
   *
   * Offline-tolerant like the rest of this flow: a failed list fetch is
   * swallowed (no banner, nothing rendered) so the campaign screen around it
   * is never blocked, matching the 0.14.5 pack-warning pattern this ADR
   * reuses throughout (docs/SYNC.md).
   */
  import {
    approveMigrationRequest,
    denyMigrationRequest,
    listMigrationRequests
  } from "$lib/api/migrationRequests.js";
  import { describeMigrationRequest } from "$lib/migration-requests.js";
  import { applyMigration, pull } from "$lib/sync.js";
  import type { MigrationRequestSummary } from "@mowc/shared";

  interface Props {
    campaignId: string;
    /** Called after a request is approved, so the caller can refresh its own
     * character list (the new row now lives in this campaign's bucket). */
    onApproved?: () => void;
  }

  let { campaignId, onApproved }: Props = $props();

  let requests = $state<MigrationRequestSummary[]>([]);
  let busyId = $state<string | null>(null);
  let rowErrors = $state<Record<string, string>>({});

  $effect(() => {
    listMigrationRequests(campaignId)
      .then((list) => {
        requests = list;
      })
      .catch(() => {
        // Offline or a transient failure: no pending-requests panel this
        // visit, never a blocking error on the rest of the campaign screen.
        requests = [];
      });
  });

  async function approve(request: MigrationRequestSummary): Promise<void> {
    if (busyId) return;
    busyId = request.migrationId;
    delete rowErrors[request.migrationId];
    try {
      const res = await approveMigrationRequest(campaignId, request.migrationId);
      // Re-point local storage the same way a direct migrate does (ADR 0002's
      // applyMigration); best-effort since the Keeper may have no local
      // mirror of the source campaign at all. Always re-pull this campaign
      // afterward so the newly-migrated character shows up here regardless.
      await applyMigration(res.sourceScope, res.sourceId, res.destScope).catch(() => {});
      await pull(campaignId).catch(() => {});
      requests = requests.filter((r) => r.migrationId !== request.migrationId);
      onApproved?.();
    } catch (e) {
      rowErrors[request.migrationId] = e instanceof Error ? e.message : "Could not approve this move.";
    } finally {
      busyId = null;
    }
  }

  async function deny(request: MigrationRequestSummary): Promise<void> {
    if (busyId) return;
    busyId = request.migrationId;
    delete rowErrors[request.migrationId];
    try {
      await denyMigrationRequest(campaignId, request.migrationId);
      requests = requests.filter((r) => r.migrationId !== request.migrationId);
    } catch (e) {
      rowErrors[request.migrationId] = e instanceof Error ? e.message : "Could not deny this move.";
    } finally {
      busyId = null;
    }
  }
</script>

{#if requests.length > 0}
  <section class="panel requests-panel">
    <h2 class="section-title">Pending character moves</h2>
    <p class="meta">
      A character's playbook needs a content pack this campaign doesn't have yet. Approve to attach the pack
      and complete the move, or deny it.
    </p>
    <ul class="request-list">
      {#each requests as request (request.migrationId)}
        <li class="request-row">
          <p class="request-copy">{describeMigrationRequest(request)}</p>
          <div class="request-actions">
            <button
              type="button"
              class="approve-button"
              disabled={busyId === request.migrationId}
              onclick={() => approve(request)}
            >
              {busyId === request.migrationId ? "Working..." : "Approve"}
            </button>
            <button
              type="button"
              class="deny-button"
              disabled={busyId === request.migrationId}
              onclick={() => deny(request)}
            >
              Deny
            </button>
          </div>
          {#if rowErrors[request.migrationId]}
            <p class="error">{rowErrors[request.migrationId]}</p>
          {/if}
        </li>
      {/each}
    </ul>
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

  .requests-panel {
    border-color: var(--accent);
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

  .request-list {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
    list-style: none;
    margin: 0;
    padding: 0;
    width: 100%;
  }

  .request-row {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    padding: var(--space-3);
    background: var(--surface-2);
    border: 1px solid var(--border);
    border-radius: var(--radius-md);
  }

  .request-copy {
    margin: 0;
    color: var(--ink);
    font-family: var(--font-body);
    font-size: var(--text-base);
    line-height: 1.4;
  }

  .request-actions {
    display: flex;
    gap: var(--space-2);
  }

  .approve-button,
  .deny-button {
    min-height: var(--tap-min);
    padding: var(--space-2) var(--space-4);
    background: var(--surface);
    border-radius: var(--radius-sm);
    font-family: var(--font-display);
    font-size: var(--text-sm);
    letter-spacing: 0.05em;
    text-transform: uppercase;
    cursor: pointer;
  }

  .approve-button {
    border: 2px solid var(--accent);
    color: var(--accent);
  }

  .deny-button {
    border: 2px solid var(--danger);
    color: var(--danger);
  }

  .approve-button:disabled,
  .deny-button:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .approve-button:focus-visible,
  .deny-button:focus-visible {
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
