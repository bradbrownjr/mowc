import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import request from "supertest";
import type Database from "better-sqlite3";
import { createApp } from "../app.js";
import { openDb } from "../db/index.js";
import { runMigrations } from "../db/migrate.js";

let tempDir: string | undefined;
let db: Database.Database | undefined;

afterEach(() => {
  db?.close();
  db = undefined;
  if (tempDir) {
    rmSync(tempDir, { recursive: true, force: true });
    tempDir = undefined;
  }
});

function createTestApp() {
  tempDir = mkdtempSync(path.join(tmpdir(), "mowc-sync-"));
  db = openDb(tempDir);
  runMigrations(db);
  return createApp("0.1.0-test", db);
}

async function registerAgent(app: ReturnType<typeof createApp>, email: string) {
  const agent = request.agent(app);
  const res = await agent
    .post("/api/auth/register")
    .send({ email, password: "hunter2hunter", displayName: email });
  return { agent, userId: res.body.id as string };
}

function seatAsHunter(campaignId: string, userId: string): void {
  db!
    .prepare("INSERT INTO seats (campaign_id, user_id, role, created_at) VALUES (?, ?, 'hunter', ?)")
    .run(campaignId, userId, new Date().toISOString());
}

/** Full placeholder character payload (invented content only, per AGENTS.md). */
function character(campaignId: string, ownerUserId: string, overrides: Record<string, unknown> = {}) {
  return {
    id: randomUUID(),
    campaignId,
    ownerUserId,
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

/** Minimal valid placeholder Monster payload (invented content, per AGENTS.md). */
function monster(campaignId: string, overrides: Record<string, unknown> = {}) {
  return {
    id: randomUUID(),
    campaignId,
    name: "Test Monster",
    harmCapacity: 3,
    revealed: false,
    ...overrides
  };
}

/**
 * Minimal valid payload builders for the five Keeper-owned world entity types,
 * keyed by sync type. Invented placeholder content only (AGENTS.md rule 1).
 */
const worldPayloads: Record<string, (campaignId: string) => Record<string, unknown>> = {
  mystery: (campaignId) => ({ id: randomUUID(), campaignId, title: "Test Mystery" }),
  monster: (campaignId) => monster(campaignId),
  minion: (campaignId) => ({ id: randomUUID(), campaignId, name: "Test Minion", harmCapacity: 1 }),
  bystander: (campaignId) => ({ id: randomUUID(), campaignId, name: "Test Bystander" }),
  location: (campaignId) => ({ id: randomUUID(), campaignId, name: "Test Location" })
};

function op(entityId: string, patch: Record<string, unknown>, extra: Record<string, unknown> = {}) {
  return {
    opId: randomUUID(),
    entityId,
    type: "character",
    baseRev: 0,
    patch,
    deleted: false,
    ts: new Date().toISOString(),
    ...extra
  };
}

describe("auth requirement", () => {
  it("rejects an unauthenticated push with 401", async () => {
    const app = createTestApp();
    const res = await request(app)
      .post("/api/sync/00000000-0000-4000-8000-000000000001")
      .send({ ops: [] });
    expect(res.status).toBe(401);
  });
});

describe("non-member scoping", () => {
  it("returns 404 on pull for a campaign the user is not in", async () => {
    const app = createTestApp();
    const { agent: keeper } = await registerAgent(app, "keeper@example.com");
    const { agent: outsider } = await registerAgent(app, "outsider@example.com");
    const created = await keeper.post("/api/campaigns").send({ name: "The Vermont Job" });

    const res = await outsider.get(`/api/sync/${created.body.id}?since=0`);
    expect(res.status).toBe(404);
  });
});

describe("push then pull", () => {
  it("inserts a new character and returns it on pull", async () => {
    const app = createTestApp();
    const { agent: keeper, userId } = await registerAgent(app, "keeper@example.com");
    const created = await keeper.post("/api/campaigns").send({ name: "The Vermont Job" });
    const campaignId = created.body.id as string;
    const char = character(campaignId, userId);

    const push = await keeper.post(`/api/sync/${campaignId}`).send({ ops: [op(char.id, char)] });
    expect(push.status).toBe(200);
    expect(push.body.applied).toHaveLength(1);
    expect(push.body.newSeq).toBe(1);

    const pull = await keeper.get(`/api/sync/${campaignId}?since=0`);
    expect(pull.body.rows).toHaveLength(1);
    expect(pull.body.rows[0].payload.name).toBe("Test Hunter");
    expect(pull.body.rows[0].rev).toBe(1);
    expect(pull.body.seq).toBe(1);
  });
});

describe("idempotent replay", () => {
  it("applies the same opId only once", async () => {
    const app = createTestApp();
    const { agent: keeper, userId } = await registerAgent(app, "keeper@example.com");
    const created = await keeper.post("/api/campaigns").send({ name: "The Vermont Job" });
    const campaignId = created.body.id as string;
    const char = character(campaignId, userId);
    const theOp = op(char.id, char);

    const first = await keeper.post(`/api/sync/${campaignId}`).send({ ops: [theOp] });
    const second = await keeper.post(`/api/sync/${campaignId}`).send({ ops: [theOp] });

    expect(first.body.applied).toEqual([theOp.opId]);
    expect(second.body.applied).toEqual([theOp.opId]);
    // Replay must not bump rev/seq a second time.
    const pull = await keeper.get(`/api/sync/${campaignId}?since=0`);
    expect(pull.body.rows).toHaveLength(1);
    expect(pull.body.rows[0].rev).toBe(1);
    expect(pull.body.rows[0].seq).toBe(1);
  });
});

describe("per-field merge and LWW", () => {
  it("merges concurrent edits to different fields so both survive", async () => {
    const app = createTestApp();
    const { agent: keeper, userId } = await registerAgent(app, "keeper@example.com");
    const created = await keeper.post("/api/campaigns").send({ name: "The Vermont Job" });
    const campaignId = created.body.id as string;
    const char = character(campaignId, userId);

    // Create (rev 1), with the earliest timestamp.
    await keeper.post(`/api/sync/${campaignId}`).send({
      ops: [op(char.id, char, { ts: "2026-07-14T09:00:00.000Z" })]
    });

    // Device A ticks harm (based on rev 1).
    await keeper.post(`/api/sync/${campaignId}`).send({
      ops: [op(char.id, { harm: 1 }, { baseRev: 1, ts: "2026-07-14T10:00:00.000Z" })]
    });

    // Device B edits notes, also based on rev 1 (concurrent), later timestamp.
    const bPush = await keeper.post(`/api/sync/${campaignId}`).send({
      ops: [op(char.id, { notes: "found a clue" }, { baseRev: 1, ts: "2026-07-14T10:05:00.000Z" })]
    });
    // Different fields: nothing was overridden, so no conflict is reported.
    expect(bPush.body.conflicts).toHaveLength(0);

    const pull = await keeper.get(`/api/sync/${campaignId}?since=0`);
    expect(pull.body.rows[0].payload.harm).toBe(1);
    expect(pull.body.rows[0].payload.notes).toBe("found a clue");
  });

  it("resolves a same-field conflict last-write-wins and reports it", async () => {
    const app = createTestApp();
    const { agent: keeper, userId } = await registerAgent(app, "keeper@example.com");
    const created = await keeper.post("/api/campaigns").send({ name: "The Vermont Job" });
    const campaignId = created.body.id as string;
    const char = character(campaignId, userId);

    await keeper.post(`/api/sync/${campaignId}`).send({
      ops: [op(char.id, char, { ts: "2026-07-14T09:00:00.000Z" })]
    });

    // Newer write lands first (harm=5 @ 10:05).
    await keeper.post(`/api/sync/${campaignId}`).send({
      ops: [op(char.id, { harm: 5 }, { baseRev: 1, ts: "2026-07-14T10:05:00.000Z" })]
    });
    // Older write arrives after (harm=9 @ 10:00): it must lose the field and be
    // reported as a conflict so the client can warn.
    const loser = await keeper.post(`/api/sync/${campaignId}`).send({
      ops: [op(char.id, { harm: 9 }, { baseRev: 1, ts: "2026-07-14T10:00:00.000Z" })]
    });
    expect(loser.body.conflicts).toHaveLength(1);

    const pull = await keeper.get(`/api/sync/${campaignId}?since=0`);
    expect(pull.body.rows[0].payload.harm).toBe(5);
  });

  it("clamps a far-future op ts to the server clock so it cannot win LWW forever", async () => {
    const app = createTestApp();
    const { agent: keeper, userId } = await registerAgent(app, "keeper@example.com");
    const created = await keeper.post("/api/campaigns").send({ name: "The Vermont Job" });
    const campaignId = created.body.id as string;
    const char = character(campaignId, userId);

    // A poisoned clock: year 9999 would otherwise beat every future edit.
    const poisoned = await keeper.post(`/api/sync/${campaignId}`).send({
      ops: [op(char.id, char, { ts: "9999-01-01T00:00:00.000Z" })]
    });
    expect(poisoned.body.applied).toHaveLength(1);

    const pull = await keeper.get(`/api/sync/${campaignId}?since=0`);
    expect(new Date(pull.body.rows[0].updatedAt).getTime()).toBeLessThan(Date.now() + 10 * 60_000);

    // A normal, later edit must still win the merge.
    const followUp = await keeper.post(`/api/sync/${campaignId}`).send({
      ops: [op(char.id, { harm: 3 }, { baseRev: 1 })]
    });
    expect(followUp.body.applied).toHaveLength(1);
    expect(followUp.body.conflicts).toHaveLength(0);

    const pull2 = await keeper.get(`/api/sync/${campaignId}?since=0`);
    expect(pull2.body.rows[0].payload.harm).toBe(3);
  });
});

describe("visibility on pull", () => {
  it("hides another hunter's character from a hunter but shows it to the keeper", async () => {
    const app = createTestApp();
    const { agent: keeper } = await registerAgent(app, "keeper@example.com");
    const { agent: hunterA, userId: aId } = await registerAgent(app, "a@example.com");
    const { agent: hunterB, userId: bId } = await registerAgent(app, "b@example.com");
    const created = await keeper.post("/api/campaigns").send({ name: "The Vermont Job" });
    const campaignId = created.body.id as string;
    seatAsHunter(campaignId, aId);
    seatAsHunter(campaignId, bId);

    const charA = character(campaignId, aId);
    await hunterA.post(`/api/sync/${campaignId}`).send({ ops: [op(charA.id, charA)] });

    const bPull = await hunterB.get(`/api/sync/${campaignId}?since=0`);
    expect(bPull.body.rows).toHaveLength(0);

    const keeperPull = await keeper.get(`/api/sync/${campaignId}?since=0`);
    expect(keeperPull.body.rows).toHaveLength(1);
  });

  it("stops a hunter editing another hunter's character", async () => {
    const app = createTestApp();
    const { agent: keeper } = await registerAgent(app, "keeper@example.com");
    const { agent: hunterA, userId: aId } = await registerAgent(app, "a@example.com");
    const { agent: hunterB, userId: bId } = await registerAgent(app, "b@example.com");
    const created = await keeper.post("/api/campaigns").send({ name: "The Vermont Job" });
    const campaignId = created.body.id as string;
    seatAsHunter(campaignId, aId);
    seatAsHunter(campaignId, bId);

    const charA = character(campaignId, aId);
    await hunterA.post(`/api/sync/${campaignId}`).send({ ops: [op(charA.id, charA)] });

    // hunterB tries to overwrite hunterA's character.
    const bPush = await hunterB.post(`/api/sync/${campaignId}`).send({
      ops: [op(charA.id, { name: "Hijacked" }, { baseRev: 1 })]
    });
    expect(bPush.body.applied).toHaveLength(0);

    const keeperPull = await keeper.get(`/api/sync/${campaignId}?since=0`);
    expect(keeperPull.body.rows[0].payload.name).toBe("Test Hunter");
  });
});

describe("deletes", () => {
  it("pulls a tombstone after a soft-delete", async () => {
    const app = createTestApp();
    const { agent: keeper, userId } = await registerAgent(app, "keeper@example.com");
    const created = await keeper.post("/api/campaigns").send({ name: "The Vermont Job" });
    const campaignId = created.body.id as string;
    const char = character(campaignId, userId);

    await keeper.post(`/api/sync/${campaignId}`).send({ ops: [op(char.id, char)] });
    await keeper.post(`/api/sync/${campaignId}`).send({
      ops: [op(char.id, {}, { baseRev: 1, deleted: true })]
    });

    const pull = await keeper.get(`/api/sync/${campaignId}?since=0`);
    expect(pull.body.rows).toHaveLength(1);
    expect(pull.body.rows[0].deleted).toBe(true);
  });
});

describe("Keeper-owned entity authz (monster)", () => {
  it("drops a seated hunter's push of a brand-new monster", async () => {
    const app = createTestApp();
    const { agent: keeper } = await registerAgent(app, "keeper@example.com");
    const { agent: hunter, userId: hunterId } = await registerAgent(app, "hunter@example.com");
    const created = await keeper.post("/api/campaigns").send({ name: "The Vermont Job" });
    const campaignId = created.body.id as string;
    seatAsHunter(campaignId, hunterId);

    const mon = monster(campaignId);
    const push = await hunter
      .post(`/api/sync/${campaignId}`)
      .send({ ops: [op(mon.id, mon, { type: "monster" })] });
    expect(push.body.applied).toHaveLength(0);

    // Keeper sees nothing was written.
    const keeperPull = await keeper.get(`/api/sync/${campaignId}?since=0`);
    expect(keeperPull.body.rows).toHaveLength(0);
  });

  it("drops a seated hunter's edit of an existing Keeper-created monster", async () => {
    const app = createTestApp();
    const { agent: keeper } = await registerAgent(app, "keeper@example.com");
    const { agent: hunter, userId: hunterId } = await registerAgent(app, "hunter@example.com");
    const created = await keeper.post("/api/campaigns").send({ name: "The Vermont Job" });
    const campaignId = created.body.id as string;
    seatAsHunter(campaignId, hunterId);

    const mon = monster(campaignId);
    await keeper.post(`/api/sync/${campaignId}`).send({ ops: [op(mon.id, mon, { type: "monster" })] });

    const hunterEdit = await hunter.post(`/api/sync/${campaignId}`).send({
      ops: [op(mon.id, { name: "Hijacked" }, { type: "monster", baseRev: 1 })]
    });
    expect(hunterEdit.body.applied).toHaveLength(0);

    const keeperPull = await keeper.get(`/api/sync/${campaignId}?since=0`);
    expect(keeperPull.body.rows[0].payload.name).toBe("Test Monster");
  });

  it("applies the Keeper's own push of the same monster op", async () => {
    const app = createTestApp();
    const { agent: keeper } = await registerAgent(app, "keeper@example.com");
    const created = await keeper.post("/api/campaigns").send({ name: "The Vermont Job" });
    const campaignId = created.body.id as string;

    const mon = monster(campaignId);
    const theOp = op(mon.id, mon, { type: "monster" });
    const push = await keeper.post(`/api/sync/${campaignId}`).send({ ops: [theOp] });
    expect(push.body.applied).toEqual([theOp.opId]);

    const pull = await keeper.get(`/api/sync/${campaignId}?since=0`);
    expect(pull.body.rows).toHaveLength(1);
    expect(pull.body.rows[0].type).toBe("monster");
  });
});

describe("revealed-gated pull (invariant 4)", () => {
  it("hides an unrevealed monster from a hunter and reveals it after a revealed:true patch", async () => {
    const app = createTestApp();
    const { agent: keeper } = await registerAgent(app, "keeper@example.com");
    const { agent: hunter, userId: hunterId } = await registerAgent(app, "hunter@example.com");
    const created = await keeper.post("/api/campaigns").send({ name: "The Vermont Job" });
    const campaignId = created.body.id as string;
    seatAsHunter(campaignId, hunterId);

    const mon = monster(campaignId, { revealed: false });
    await keeper.post(`/api/sync/${campaignId}`).send({ ops: [op(mon.id, mon, { type: "monster" })] });

    // Unrevealed: hidden from the hunter, visible to the Keeper.
    const hunterPull = await hunter.get(`/api/sync/${campaignId}?since=0`);
    expect(hunterPull.body.rows).toHaveLength(0);
    const keeperPull = await keeper.get(`/api/sync/${campaignId}?since=0`);
    expect(keeperPull.body.rows).toHaveLength(1);

    // Keeper reveals it.
    await keeper.post(`/api/sync/${campaignId}`).send({
      ops: [op(mon.id, { revealed: true }, { type: "monster", baseRev: 1 })]
    });

    const hunterPull2 = await hunter.get(`/api/sync/${campaignId}?since=0`);
    expect(hunterPull2.body.rows).toHaveLength(1);
    expect(hunterPull2.body.rows[0].payload.revealed).toBe(true);
  });
});

describe("Keeper-owned world entities round-trip", () => {
  for (const type of ["mystery", "monster", "minion", "bystander", "location"] as const) {
    it(`round-trips a ${type}`, async () => {
      const app = createTestApp();
      const { agent: keeper } = await registerAgent(app, "keeper@example.com");
      const created = await keeper.post("/api/campaigns").send({ name: "The Vermont Job" });
      const campaignId = created.body.id as string;

      const payload = worldPayloads[type]!(campaignId);
      const theOp = op(payload["id"] as string, payload, { type });
      const push = await keeper.post(`/api/sync/${campaignId}`).send({ ops: [theOp] });
      expect(push.body.applied).toEqual([theOp.opId]);

      const pull = await keeper.get(`/api/sync/${campaignId}?since=0`);
      expect(pull.body.rows).toHaveLength(1);
      expect(pull.body.rows[0].type).toBe(type);
    });
  }
});

describe("per-type schema dispatch", () => {
  it("drops a monster op whose payload is missing a required field", async () => {
    const app = createTestApp();
    const { agent: keeper } = await registerAgent(app, "keeper@example.com");
    const created = await keeper.post("/api/campaigns").send({ name: "The Vermont Job" });
    const campaignId = created.body.id as string;

    // Missing harmCapacity: valid for no schema, must not fall back to Character.
    const entityId = randomUUID();
    const bad = { id: entityId, campaignId, name: "Test Monster" };
    const push = await keeper
      .post(`/api/sync/${campaignId}`)
      .send({ ops: [op(entityId, bad, { type: "monster" })] });
    expect(push.body.applied).toHaveLength(0);

    const pull = await keeper.get(`/api/sync/${campaignId}?since=0`);
    expect(pull.body.rows).toHaveLength(0);
  });

  it("applies the same monster opId only once (idempotent replay)", async () => {
    const app = createTestApp();
    const { agent: keeper } = await registerAgent(app, "keeper@example.com");
    const created = await keeper.post("/api/campaigns").send({ name: "The Vermont Job" });
    const campaignId = created.body.id as string;

    const mon = monster(campaignId);
    const theOp = op(mon.id, mon, { type: "monster" });
    const first = await keeper.post(`/api/sync/${campaignId}`).send({ ops: [theOp] });
    const second = await keeper.post(`/api/sync/${campaignId}`).send({ ops: [theOp] });

    expect(first.body.applied).toEqual([theOp.opId]);
    expect(second.body.applied).toEqual([theOp.opId]);

    const pull = await keeper.get(`/api/sync/${campaignId}?since=0`);
    expect(pull.body.rows).toHaveLength(1);
    expect(pull.body.rows[0].rev).toBe(1);
    expect(pull.body.rows[0].seq).toBe(1);
  });
});

describe("same-batch ops are applied in chronological order", () => {
  it("still applies a same-entity edit whose op sorts before its create op in the batch array", async () => {
    // Regresses a bug where the client's IndexedDB oplog (keyed by a random
    // opId) can hand the server a create and a same-entity edit in either
    // order. If the edit lands first in the array, `current` is still
    // undefined; a partial patch alone fails the strict schema and the edit
    // used to be dropped silently forever. Reproduces that exact array order
    // with a Location's create (full payload) and a `revealed: true` edit
    // (partial patch, later ts) queued in the same push.
    const app = createTestApp();
    const { agent: keeper } = await registerAgent(app, "keeper@example.com");
    const created = await keeper.post("/api/campaigns").send({ name: "The Vermont Job" });
    const campaignId = created.body.id as string;

    const loc = worldPayloads["location"]!(campaignId);
    const createOp = op(loc["id"] as string, loc, {
      type: "location",
      baseRev: 0,
      ts: "2026-07-16T20:46:56.102Z"
    });
    const revealOp = op(loc["id"] as string, { revealed: true }, {
      type: "location",
      baseRev: 1,
      ts: "2026-07-16T20:46:56.482Z"
    });

    // Edit ordered before its own create in the array, as Dexie's toArray()
    // can hand back to the client.
    const push = await keeper.post(`/api/sync/${campaignId}`).send({ ops: [revealOp, createOp] });
    expect(push.body.applied).toEqual(expect.arrayContaining([createOp.opId, revealOp.opId]));
    expect(push.body.applied).toHaveLength(2);

    const pull = await keeper.get(`/api/sync/${campaignId}?since=0`);
    expect(pull.body.rows).toHaveLength(1);
    expect(pull.body.rows[0].payload.revealed).toBe(true);
  });
});
