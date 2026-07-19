import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { db } from "./db.js";
import {
  conflictLabel,
  countPendingOps,
  mergeConflicts,
  refreshPendingCount,
  registerSyncStatusSinks,
  reportConflicts,
  resetSyncStatusSinks,
  toNotices,
  type ConflictNotice
} from "./sync-status.js";

const CAMPAIGN = "00000000-0000-4000-8000-000000000001";

function oplogEntry(opId: string, entityId: string) {
  return { opId, entityId, campaignId: CAMPAIGN, type: "character" as const, baseRev: 0, patch: { a: 1 }, deleted: false, ts: "2026-07-19T00:00:00.000Z" };
}

beforeEach(async () => {
  await db.oplog.clear();
  resetSyncStatusSinks();
});

afterEach(() => {
  resetSyncStatusSinks();
});

describe("conflictLabel", () => {
  it("prefers name, then title, then a generic fallback", () => {
    expect(conflictLabel({ name: "Test Hunter" })).toBe("Test Hunter");
    expect(conflictLabel({ title: "The Placeholder Mystery" })).toBe("The Placeholder Mystery");
    expect(conflictLabel({ name: "  " })).toBe("an entry");
    expect(conflictLabel({})).toBe("an entry");
    expect(conflictLabel(null)).toBe("an entry");
  });
});

describe("mergeConflicts", () => {
  const a: ConflictNotice = { opId: "op-a", label: "A" };
  const b: ConflictNotice = { opId: "op-b", label: "B" };

  it("appends new notices", () => {
    expect(mergeConflicts([a], [b])).toEqual([a, b]);
  });

  it("dedupes by opId (a conflict is surfaced once)", () => {
    expect(mergeConflicts([a], [{ opId: "op-a", label: "A again" }, b])).toEqual([a, b]);
  });

  it("caps the queue at the most recent entries", () => {
    const many = Array.from({ length: 8 }, (_, i) => ({ opId: `op-${i}`, label: `L${i}` }));
    const result = mergeConflicts([], many, 5);
    expect(result).toHaveLength(5);
    expect(result[0]!.opId).toBe("op-3");
    expect(result[4]!.opId).toBe("op-7");
  });
});

describe("countPendingOps / refreshPendingCount", () => {
  it("counts queued ops across the oplog", async () => {
    expect(await countPendingOps()).toBe(0);
    await db.oplog.put(oplogEntry("op-1", "e-1"));
    await db.oplog.put(oplogEntry("op-2", "e-2"));
    expect(await countPendingOps()).toBe(2);
  });

  it("pushes the live count to a registered pending sink", async () => {
    let count = -1;
    registerSyncStatusSinks({ onConflicts: () => {}, onPending: (c) => (count = c) });
    await db.oplog.put(oplogEntry("op-1", "e-1"));
    await refreshPendingCount();
    expect(count).toBe(1);
  });
});

describe("reportConflicts bridge", () => {
  it("routes conflicts to a registered sink as notices", () => {
    const received: ConflictNotice[][] = [];
    registerSyncStatusSinks({ onConflicts: (n) => received.push(n), onPending: () => {} });

    reportConflicts([{ opId: "op-a", serverPayload: { name: "Winner" } }]);

    expect(received).toEqual([[{ opId: "op-a", label: "Winner" }]]);
  });

  it("is a no-op with an empty conflict list", () => {
    let calls = 0;
    registerSyncStatusSinks({ onConflicts: () => (calls += 1), onPending: () => {} });
    reportConflicts([]);
    expect(calls).toBe(0);
  });

  it("does nothing when no sink is registered (no throw)", () => {
    expect(() => reportConflicts([{ opId: "op-a", serverPayload: { name: "X" } }])).not.toThrow();
  });
});

/*
 * The runes store itself (online/offline $state + listeners) cannot be imported
 * under the root vitest run, which does not compile `$state`. Here we exercise
 * the exact sink-and-merge mechanism the store wires up, against a plain mock
 * that mirrors sync-status.svelte.ts's handlers, so the online/offline flush and
 * conflict-dedup behavior is covered end to end at the bridge boundary.
 */
describe("store wiring (mock of sync-status.svelte.ts handlers)", () => {
  it("keeps a deduped conflict queue and a live pending count across events", async () => {
    const store = { online: true, pendingCount: 0, conflicts: [] as ConflictNotice[] };
    registerSyncStatusSinks({
      onConflicts: (notices) => (store.conflicts = mergeConflicts(store.conflicts, notices)),
      onPending: (count) => (store.pendingCount = count)
    });

    // Going offline: a local write queues an op; the badge reflects it.
    store.online = false;
    await db.oplog.put(oplogEntry("op-1", "e-1"));
    await refreshPendingCount();
    expect(store.pendingCount).toBe(1);

    // A push loses a merge and the same op arrives once.
    reportConflicts([{ opId: "op-1", serverPayload: { name: "Server Copy" } }]);
    reportConflicts([{ opId: "op-1", serverPayload: { name: "Server Copy" } }]);
    expect(store.conflicts).toEqual([{ opId: "op-1", label: "Server Copy" }]);

    // Back online: the queue flushes, the badge returns to zero.
    store.online = true;
    await db.oplog.clear();
    await refreshPendingCount();
    expect(store.pendingCount).toBe(0);
  });
});

describe("toNotices", () => {
  it("maps raw conflicts to labelled notices", () => {
    expect(toNotices([{ opId: "op-a", serverPayload: { title: "T" } }])).toEqual([{ opId: "op-a", label: "T" }]);
  });
});
