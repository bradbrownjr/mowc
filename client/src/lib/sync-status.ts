import type { SyncConflict } from "@mowc/shared";
import { db } from "./db.js";

/**
 * Plain (non-runes) half of the sync-status feature. All the pure logic and a
 * light callback bridge live here so both `sync.ts` (which reports conflicts
 * and pending-count changes) and the vitest suite can import it WITHOUT pulling
 * in `$state`. The runes store (`sync-status.svelte.ts`) registers its
 * state-mutators here on init; nothing in this file imports the runes store or
 * `sync.ts`, so the dependency graph stays acyclic:
 *   sync.ts            -> sync-status.ts (this file)
 *   sync-status.svelte -> sync-status.ts + sync.ts
 *   sync-status.ts     -> db.ts only
 */

export interface ConflictNotice {
  /** The losing op's id, used to dedupe and to dismiss the toast. */
  opId: string;
  /** Human label for the entity whose local edit lost, from the winning payload. */
  label: string;
}

/** Most recent conflicts kept on screen at once; older ones fall off. */
export const CONFLICT_CAP = 5;

/**
 * Derives a display label from the server payload that won the merge. Every
 * synced entity carries a `name` (character/monster/minion/bystander/location)
 * or a `title` (mystery); if neither is present we fall back to a generic word
 * rather than showing an id.
 */
export function conflictLabel(serverPayload: unknown): string {
  if (serverPayload && typeof serverPayload === "object") {
    const record = serverPayload as Record<string, unknown>;
    const named = record["name"] ?? record["title"];
    if (typeof named === "string" && named.trim() !== "") {
      return named;
    }
  }
  return "an entry";
}

/** Maps raw server conflicts to display notices. */
export function toNotices(conflicts: SyncConflict[]): ConflictNotice[] {
  return conflicts.map((conflict) => ({ opId: conflict.opId, label: conflictLabel(conflict.serverPayload) }));
}

/**
 * Appends incoming notices to the existing queue, skipping any opId already
 * present (the same conflict can only be surfaced once), and caps the queue at
 * `cap` keeping the most recent.
 */
export function mergeConflicts(
  existing: ConflictNotice[],
  incoming: ConflictNotice[],
  cap = CONFLICT_CAP
): ConflictNotice[] {
  const seen = new Set(existing.map((notice) => notice.opId));
  const merged = [...existing];
  for (const notice of incoming) {
    if (!seen.has(notice.opId)) {
      seen.add(notice.opId);
      merged.push(notice);
    }
  }
  return merged.slice(-cap);
}

/** Count of queued local ops across every campaign (the pending-changes badge). */
export async function countPendingOps(): Promise<number> {
  return db.oplog.count();
}

/*
 * Light event bridge. The runes store registers sinks here; `sync.ts` calls the
 * report/refresh functions below without ever importing the runes module.
 */

type ConflictSink = (notices: ConflictNotice[]) => void;
type PendingSink = (count: number) => void;

let conflictSink: ConflictSink | null = null;
let pendingSink: PendingSink | null = null;

/** The runes store calls this once on init to receive future updates. */
export function registerSyncStatusSinks(sinks: { onConflicts: ConflictSink; onPending: PendingSink }): void {
  conflictSink = sinks.onConflicts;
  pendingSink = sinks.onPending;
}

/** Test-only: drops the registered sinks so a spec starts from a clean bridge. */
export function resetSyncStatusSinks(): void {
  conflictSink = null;
  pendingSink = null;
}

/** Called by `sync.ts` push() when the server reports one or more lost writes. */
export function reportConflicts(conflicts: SyncConflict[]): void {
  if (conflicts.length === 0 || !conflictSink) {
    return;
  }
  conflictSink(toNotices(conflicts));
}

/** Called by `sync.ts` after a write/push so the pending badge stays live. */
export async function refreshPendingCount(): Promise<void> {
  if (!pendingSink) {
    return;
  }
  pendingSink(await countPendingOps());
}
