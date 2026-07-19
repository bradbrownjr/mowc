/*
 * Reactive sync-status state (online/offline, pending-op count, unresolved
 * conflict toasts), same module-with-$state-plus-idempotent-init pattern as
 * session.svelte.ts and health.svelte.ts. The pure logic and the callback
 * bridge live in the plain sync-status.ts sibling so sync.ts and the test suite
 * can use them without importing this runes module.
 */
import { db } from "./db.js";
import { push } from "./sync.js";
import {
  mergeConflicts,
  refreshPendingCount,
  registerSyncStatusSinks,
  type ConflictNotice
} from "./sync-status.js";

export const syncStatus = $state<{ online: boolean; pendingCount: number; conflicts: ConflictNotice[] }>({
  online: true,
  pendingCount: 0,
  conflicts: []
});

let initStarted = false;

/** Idempotent: call once from the root layout on mount. */
export async function initSyncStatus(): Promise<void> {
  if (initStarted) return;
  initStarted = true;

  registerSyncStatusSinks({
    onConflicts: (notices) => {
      syncStatus.conflicts = mergeConflicts(syncStatus.conflicts, notices);
    },
    onPending: (count) => {
      syncStatus.pendingCount = count;
    }
  });

  if (typeof navigator !== "undefined") {
    syncStatus.online = navigator.onLine;
  }
  if (typeof window !== "undefined") {
    window.addEventListener("online", () => {
      syncStatus.online = true;
      void syncNow(); // flush whatever queued while offline
    });
    window.addEventListener("offline", () => {
      syncStatus.online = false;
    });
  }

  await refreshPendingCount();
}

/** Dismisses one conflict toast (the toast is dismissible, docs/SYNC.md). */
export function dismissConflict(opId: string): void {
  syncStatus.conflicts = syncStatus.conflicts.filter((notice) => notice.opId !== opId);
}

/**
 * Manual "Sync now": pushes every scope that currently has queued ops, through
 * the same push path a debounced background push uses (no new API). Pushing
 * itself refreshes the pending count via sync.ts; the final refresh covers the
 * no-op case where nothing was queued.
 */
export async function syncNow(): Promise<void> {
  const entries = await db.oplog.toArray();
  // Distinct scopes without a Set: svelte/prefer-svelte-reactivity bans a plain
  // Set in a .svelte.ts file, and this collection is not reactive state.
  const scopes: string[] = [];
  for (const entry of entries) {
    if (!scopes.includes(entry.campaignId)) {
      scopes.push(entry.campaignId);
    }
  }
  for (const scope of scopes) {
    try {
      await push(scope);
    } catch {
      // A failed push leaves the ops queued; the badge stays non-zero and the
      // existing backoff loop keeps retrying. Nothing to surface here.
    }
  }
  await refreshPendingCount();
}
