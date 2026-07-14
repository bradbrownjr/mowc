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
