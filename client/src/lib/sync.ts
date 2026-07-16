import type { SyncEntityType, SyncOp, SyncPullResponse, SyncPushResponse } from "@mowc/shared";
import { db, type OplogEntry } from "./db.js";
import { generateUuid } from "./uuid.js";

const DEBOUNCE_MS = 2000;
const BACKOFF_START_MS = 1000;
const BACKOFF_MAX_MS = 60_000;

export class SyncError extends Error {
  constructor(readonly status: number) {
    super(`sync failed with status ${status}`);
    this.name = "SyncError";
  }
}

function isSame(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/** The top-level fields that changed from `base` to `next` (all of them if new). */
export function computePatch(
  base: Record<string, unknown> | undefined,
  next: Record<string, unknown>
): Record<string, unknown> {
  if (!base) {
    return { ...next };
  }
  const patch: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(next)) {
    if (!isSame(base[key], value)) {
      patch[key] = value;
    }
  }
  return patch;
}

/**
 * Writes an entity to local storage and queues the change for sync. The UI
 * never awaits the network (AGENTS.md rule 2): this resolves once IndexedDB is
 * written, and the push is scheduled in the background.
 */
export async function writeEntity(
  type: SyncEntityType,
  campaignId: string,
  id: string,
  payload: Record<string, unknown>
): Promise<void> {
  await db.transaction("rw", db.entities, db.oplog, async () => {
    const existing = await db.entities.get(id);
    const baseRev = existing?.rev ?? 0;
    const patch = computePatch(existing?.payload, payload);
    const now = new Date().toISOString();
    await db.entities.put({
      id,
      campaignId,
      type,
      payload,
      rev: baseRev + 1,
      seq: existing?.seq ?? 0,
      updatedAt: now,
      deleted: false
    });
    if (Object.keys(patch).length > 0) {
      await db.oplog.put({ opId: generateUuid(), entityId: id, campaignId, type, baseRev, patch, deleted: false, ts: now });
    }
  });
  schedulePush(campaignId);
}

/** Soft-deletes an entity locally (tombstone) and queues the delete for sync. */
export async function deleteEntity(type: SyncEntityType, campaignId: string, id: string): Promise<void> {
  await db.transaction("rw", db.entities, db.oplog, async () => {
    const existing = await db.entities.get(id);
    const baseRev = existing?.rev ?? 0;
    const now = new Date().toISOString();
    if (existing) {
      await db.entities.update(id, { deleted: true, rev: baseRev + 1, updatedAt: now });
    }
    await db.oplog.put({ opId: generateUuid(), entityId: id, campaignId, type, baseRev, patch: {}, deleted: true, ts: now });
  });
  schedulePush(campaignId);
}

function toOp(entry: OplogEntry): SyncOp {
  return {
    opId: entry.opId,
    entityId: entry.entityId,
    type: entry.type,
    baseRev: entry.baseRev,
    patch: entry.patch,
    deleted: entry.deleted,
    ts: entry.ts
  };
}

/** Pushes this campaign's queued ops; removes the applied ones on success. */
export async function push(campaignId: string): Promise<SyncPushResponse | undefined> {
  const entries = await db.oplog.where("campaignId").equals(campaignId).toArray();
  if (entries.length === 0) {
    return undefined;
  }
  const res = await fetch(`/api/sync/${campaignId}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "same-origin",
    body: JSON.stringify({ ops: entries.map(toOp) })
  });
  if (!res.ok) {
    throw new SyncError(res.status);
  }
  const data = (await res.json()) as SyncPushResponse;
  await db.oplog.bulkDelete(data.applied);
  return data;
}

/**
 * Pulls rows with seq greater than the stored cursor and upserts them, but
 * never clobbers an entity with a pending local op (local-wins until push
 * resolves it). The cursor advances only after the upserts commit
 * (docs/SYNC.md invariant 5).
 */
export async function pull(campaignId: string): Promise<void> {
  const state = await db.syncState.get(campaignId);
  const since = state?.lastServerSeq ?? 0;
  const res = await fetch(`/api/sync/${campaignId}?since=${since}`, { credentials: "same-origin" });
  if (!res.ok) {
    throw new SyncError(res.status);
  }
  const data = (await res.json()) as SyncPullResponse;
  await db.transaction("rw", db.entities, db.oplog, db.syncState, async () => {
    // Load the campaign's pending entity ids once, not once per pulled row: a
    // large first sync would otherwise fire hundreds of indexed count queries
    // inside this transaction. An entity id lives in a single campaign, so
    // scoping the scan to this campaign covers every row we are about to upsert.
    const pending = new Set(
      (await db.oplog.where("campaignId").equals(campaignId).toArray()).map((entry) => entry.entityId)
    );
    for (const row of data.rows) {
      if (pending.has(row.id)) {
        continue; // local-wins until the pending op pushes
      }
      await db.entities.put({
        id: row.id,
        campaignId: row.campaignId,
        type: row.type,
        payload: row.payload as Record<string, unknown>,
        rev: row.rev,
        seq: row.seq,
        updatedAt: row.updatedAt,
        deleted: row.deleted
      });
    }
    await db.syncState.put({ campaignId, lastServerSeq: data.seq });
  });
}

/** Full sync for a campaign: pull first, then push any queued ops. */
export async function sync(campaignId: string): Promise<void> {
  await pull(campaignId);
  await push(campaignId);
}

const timers = new Map<string, ReturnType<typeof setTimeout>>();
const backoff = new Map<string, number>();

/** Debounced background push (2s), with capped-exponential retry on failure. */
export function schedulePush(campaignId: string, delay = DEBOUNCE_MS): void {
  const existing = timers.get(campaignId);
  if (existing) {
    clearTimeout(existing);
  }
  timers.set(
    campaignId,
    setTimeout(() => {
      void runScheduledPush(campaignId);
    }, delay)
  );
}

async function runScheduledPush(campaignId: string): Promise<void> {
  timers.delete(campaignId);
  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    return; // wait for the 'online' event rather than burning a retry
  }
  try {
    await push(campaignId);
    backoff.delete(campaignId);
  } catch {
    const prev = backoff.get(campaignId);
    const next = prev === undefined ? BACKOFF_START_MS : Math.min(prev * 2, BACKOFF_MAX_MS);
    backoff.set(campaignId, next);
    schedulePush(campaignId, next);
  }
}

/** Registers the browser 'online' listener that flushes every queued campaign. */
export function startSync(): void {
  if (typeof window === "undefined") {
    return;
  }
  window.addEventListener("online", () => {
    void flushAll();
  });
}

async function flushAll(): Promise<void> {
  const entries = await db.oplog.toArray();
  const campaignIds = new Set(entries.map((entry) => entry.campaignId));
  for (const campaignId of campaignIds) {
    schedulePush(campaignId, 0);
  }
}
