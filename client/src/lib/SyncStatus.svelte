<script lang="ts">
  /**
   * The "Sync status" app-shell control and conflict toasts (docs/DESIGN.md
   * "Sync status"). A compact online/offline indicator plus a pending-changes
   * count and a manual "Sync now" button, rendered in the top bar; and a stack
   * of dismissible conflict toasts warning when a local edit lost a merge
   * (docs/SYNC.md push step 3). Reads the sync-status store; the button flushes
   * queued ops through the existing push path (no new API).
   */
  import { Cloud, CloudOff, RefreshCw, TriangleAlert, X } from "@lucide/svelte";
  import Icon from "$lib/Icon.svelte";
  import { dismissConflict, syncNow, syncStatus } from "$lib/sync-status.svelte";

  let syncing = $state(false);

  async function onSyncNow(): Promise<void> {
    syncing = true;
    try {
      await syncNow();
    } finally {
      syncing = false;
    }
  }
</script>

<div class="sync-status">
  <span class="indicator" class:offline={!syncStatus.online} title={syncStatus.online ? "Online" : "Offline"}>
    <Icon icon={syncStatus.online ? Cloud : CloudOff} size={16} />
    <span class="sr-only">{syncStatus.online ? "Online" : "Offline"}</span>
  </span>
  {#if syncStatus.pendingCount > 0}
    <span class="pending" aria-label="{syncStatus.pendingCount} unsynced changes">{syncStatus.pendingCount}</span>
  {/if}
  <button
    type="button"
    class="sync-now"
    onclick={onSyncNow}
    disabled={!syncStatus.online || syncStatus.pendingCount === 0 || syncing}
    aria-label="Sync now"
    title="Sync now"
  >
    <span class="spin" class:spinning={syncing}><Icon icon={RefreshCw} size={16} /></span>
  </button>
</div>

{#if syncStatus.conflicts.length > 0}
  <div class="toast-stack" role="status" aria-live="polite">
    {#each syncStatus.conflicts as conflict (conflict.opId)}
      <div class="toast">
        <span class="toast-icon"><Icon icon={TriangleAlert} size={18} /></span>
        <p class="toast-text">Your edit to <strong>{conflict.label}</strong> was overridden by a newer change.</p>
        <button type="button" class="toast-close" aria-label="Dismiss" onclick={() => dismissConflict(conflict.opId)}>
          <Icon icon={X} size={16} />
        </button>
      </div>
    {/each}
  </div>
{/if}

<style>
  .sync-status {
    display: inline-flex;
    align-items: center;
    gap: var(--space-1);
  }

  .indicator {
    display: inline-flex;
    align-items: center;
    color: var(--ink-muted);
  }

  .indicator.offline {
    color: var(--danger);
  }

  .pending {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 1.25rem;
    padding: 0 var(--space-1);
    background: var(--surface-2);
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    color: var(--ink);
    font-family: var(--font-meta);
    font-size: var(--text-xs);
  }

  .sync-now {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: var(--tap-min);
    min-height: var(--tap-min);
    padding: var(--space-2);
    color: var(--ink);
    background: none;
    border: 1px solid var(--border);
    border-radius: var(--radius-md);
    cursor: pointer;
  }

  .sync-now:disabled {
    color: var(--ink-muted);
    cursor: default;
    opacity: 0.6;
  }

  .sync-now:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
  }

  .spin {
    display: inline-flex;
  }

  @media (prefers-reduced-motion: no-preference) {
    .spin.spinning {
      animation: spin 800ms linear infinite;
    }
  }

  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }

  .sr-only {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    white-space: nowrap;
    border: 0;
  }

  /* Conflict toasts: a stack anchored bottom-right, clear of the mobile bottom
     bar and its safe-area inset. Bordered card in the danger color (a lost
     write is a real, if recoverable, data event), Courier heading tone. */
  .toast-stack {
    position: fixed;
    right: var(--space-4);
    bottom: calc(var(--bottombar-h) + env(safe-area-inset-bottom) + var(--space-4));
    z-index: 12;
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    width: min(22rem, calc(100vw - 2 * var(--space-4)));
  }

  @media (min-width: 768px) {
    .toast-stack {
      bottom: var(--space-4);
    }
  }

  .toast {
    display: flex;
    align-items: flex-start;
    gap: var(--space-2);
    padding: var(--space-3);
    background: var(--surface);
    border: 2px solid var(--danger);
    border-radius: var(--radius-md);
  }

  .toast-icon {
    display: inline-flex;
    color: var(--danger);
  }

  .toast-text {
    flex: 1;
    margin: 0;
    color: var(--ink);
    font-family: var(--font-body);
    font-size: var(--text-sm);
  }

  .toast-close {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    padding: var(--space-1);
    color: var(--ink-muted);
    background: none;
    border: none;
    cursor: pointer;
  }

  .toast-close:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
  }
</style>
