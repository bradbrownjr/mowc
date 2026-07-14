import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "./db.js";
import { computePatch, pull, push, writeEntity, SyncError } from "./sync.js";

const CAMPAIGN = "00000000-0000-4000-8000-000000000001";
const ENTITY = "00000000-0000-4000-8000-0000000000aa";

function character(overrides: Record<string, unknown> = {}) {
  return {
    id: ENTITY,
    campaignId: CAMPAIGN,
    ownerUserId: "user-1",
    playbookId: "placeholder-playbook",
    name: "Test Hunter",
    look: "",
    ratings: { charm: 0, cool: 0, sharp: 0, tough: 0, weird: 0 },
    luckSpent: 0,
    harm: 0,
    unstable: false,
    experience: 0,
    moves: [],
    improvements: [],
    gear: [],
    extrasState: {},
    notes: "",
    ...overrides
  };
}

function mockFetch(jsonBody: unknown, ok = true, status = 200): void {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({ ok, status, json: () => Promise.resolve(jsonBody) })
  );
}

beforeEach(async () => {
  await db.entities.clear();
  await db.oplog.clear();
  await db.syncState.clear();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("computePatch", () => {
  it("returns the whole payload when there is no base", () => {
    expect(computePatch(undefined, { a: 1, b: 2 })).toEqual({ a: 1, b: 2 });
  });

  it("returns only the changed top-level fields", () => {
    expect(computePatch({ a: 1, b: 2 }, { a: 1, b: 3 })).toEqual({ b: 3 });
  });
});

describe("writeEntity", () => {
  it("stores the entity and queues a full-payload op for a new entity", async () => {
    await writeEntity("character", CAMPAIGN, ENTITY, character());

    const entity = await db.entities.get(ENTITY);
    expect(entity?.payload.name).toBe("Test Hunter");
    expect(entity?.rev).toBe(1);

    const ops = await db.oplog.toArray();
    expect(ops).toHaveLength(1);
    expect(ops[0]!.baseRev).toBe(0);
    expect(ops[0]!.patch.name).toBe("Test Hunter");
  });

  it("queues a minimal patch for a follow-up edit", async () => {
    await writeEntity("character", CAMPAIGN, ENTITY, character());
    await db.oplog.clear(); // simulate the first op already pushed
    await writeEntity("character", CAMPAIGN, ENTITY, character({ harm: 2 }));

    const ops = await db.oplog.toArray();
    expect(ops).toHaveLength(1);
    expect(ops[0]!.patch).toEqual({ harm: 2 });
    expect(ops[0]!.baseRev).toBe(1);

    const entity = await db.entities.get(ENTITY);
    expect(entity?.rev).toBe(2);
  });
});

describe("push", () => {
  it("removes applied ops from the oplog on success", async () => {
    await writeEntity("character", CAMPAIGN, ENTITY, character());
    const queued = await db.oplog.toArray();
    mockFetch({ applied: [queued[0]!.opId], conflicts: [], newSeq: 1 });

    await push(CAMPAIGN);

    expect(await db.oplog.count()).toBe(0);
  });

  it("keeps the oplog intact when the push fails", async () => {
    await writeEntity("character", CAMPAIGN, ENTITY, character());
    mockFetch({ errors: [] }, false, 503);

    await expect(push(CAMPAIGN)).rejects.toBeInstanceOf(SyncError);
    expect(await db.oplog.count()).toBe(1);
  });

  it("is a no-op when there is nothing queued (idempotent retry)", async () => {
    mockFetch({ applied: [], conflicts: [], newSeq: 0 });

    const result = await push(CAMPAIGN);

    expect(result).toBeUndefined();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("does not re-remove an op the server already applied on replay", async () => {
    await writeEntity("character", CAMPAIGN, ENTITY, character());
    const queued = await db.oplog.toArray();
    mockFetch({ applied: [queued[0]!.opId], conflicts: [], newSeq: 1 });

    await push(CAMPAIGN); // first push clears the oplog
    const second = await push(CAMPAIGN); // replay: nothing left to send

    expect(second).toBeUndefined();
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});

describe("pull", () => {
  it("upserts server rows and advances the cursor", async () => {
    mockFetch({
      rows: [
        {
          id: ENTITY,
          campaignId: CAMPAIGN,
          type: "character",
          payload: character({ name: "From Server" }),
          rev: 3,
          seq: 7,
          updatedAt: "2026-07-14T10:00:00.000Z",
          updatedBy: "user-1",
          deleted: false
        }
      ],
      seq: 7
    });

    await pull(CAMPAIGN);

    const entity = await db.entities.get(ENTITY);
    expect(entity?.payload.name).toBe("From Server");
    expect((await db.syncState.get(CAMPAIGN))?.lastServerSeq).toBe(7);
  });

  it("does not clobber an entity with a pending local op (local-wins)", async () => {
    await writeEntity("character", CAMPAIGN, ENTITY, character({ name: "Local Edit" }));
    mockFetch({
      rows: [
        {
          id: ENTITY,
          campaignId: CAMPAIGN,
          type: "character",
          payload: character({ name: "Stale Server" }),
          rev: 1,
          seq: 4,
          updatedAt: "2026-07-14T09:00:00.000Z",
          updatedBy: "user-1",
          deleted: false
        }
      ],
      seq: 4
    });

    await pull(CAMPAIGN);

    const entity = await db.entities.get(ENTITY);
    expect(entity?.payload.name).toBe("Local Edit");
    // Cursor still advances so the row is not re-fetched forever.
    expect((await db.syncState.get(CAMPAIGN))?.lastServerSeq).toBe(4);
  });
});
