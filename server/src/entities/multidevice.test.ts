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

// Multi-device torture test (ROADMAP 0.7.3). Two simulated clients (A and B)
// sharing one campaign and one character diverge while offline, then reconnect
// and push/pull in interleaved order. Every scenario asserts CONVERGENCE (both
// clients end with the same last-write-wins state) rather than implementation
// details, driving the real push/pull core (server/src/entities/router.ts) end
// to end, exactly like the existing router.test.ts setup. Placeholder content
// only, never game text (AGENTS.md rule 1).

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
  tempDir = mkdtempSync(path.join(tmpdir(), "mowc-multidevice-"));
  db = openDb(tempDir);
  runMigrations(db);
  return createApp("0.1.0-test", db);
}

const CREDENTIALS = { email: "keeper@example.com", password: "hunter2hunter" };

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

/**
 * One simulated client (device). It keeps its own pull cursor and its own local
 * view of the entities, so two clients built over the same authenticated user
 * are genuinely independent: the server has no per-device state, and each
 * client only ever knows what it has pulled. Ops queued via `push` model an
 * offline device flushing its oplog on reconnect.
 */
class ClientSim {
  private since = 0;
  readonly local = new Map<string, { payload: Record<string, unknown>; deleted: boolean }>();

  constructor(
    private readonly agent: ReturnType<typeof request.agent>,
    private readonly campaignId: string
  ) {}

  async push(ops: ReturnType<typeof op>[]) {
    const res = await this.agent.post(`/api/sync/${this.campaignId}`).send({ ops });
    expect(res.status).toBe(200);
    return res.body as {
      applied: string[];
      conflicts: { opId: string; serverPayload: Record<string, unknown> }[];
      newSeq: number;
    };
  }

  async pull() {
    const res = await this.agent.get(`/api/sync/${this.campaignId}?since=${this.since}`);
    expect(res.status).toBe(200);
    for (const row of res.body.rows as {
      id: string;
      payload: Record<string, unknown>;
      deleted: boolean;
    }[]) {
      this.local.set(row.id, { payload: row.payload, deleted: row.deleted });
    }
    this.since = res.body.seq as number;
    return res.body;
  }

  view(id: string) {
    return this.local.get(id);
  }
}

/**
 * Registers the keeper on device A and logs the same credentials in again on
 * device B, so both clients are the same authenticated user on two devices
 * (independent cookie jars, one campaign, one owned character).
 */
async function twoDevices(app: ReturnType<typeof createApp>) {
  const deviceA = request.agent(app);
  const reg = await deviceA
    .post("/api/auth/register")
    .send({ ...CREDENTIALS, displayName: "Keeper" });
  const userId = reg.body.id as string;

  const created = await deviceA.post("/api/campaigns").send({ name: "The Vermont Job" });
  const campaignId = created.body.id as string;

  const deviceB = request.agent(app);
  const login = await deviceB.post("/api/auth/login").send(CREDENTIALS);
  expect(login.status).toBe(200);

  return {
    userId,
    campaignId,
    clientA: new ClientSim(deviceA, campaignId),
    clientB: new ClientSim(deviceB, campaignId)
  };
}

describe("multi-device torture test (0.7.3)", () => {
  it("converges when two devices edit different fields of the same character offline", async () => {
    const app = createTestApp();
    const { userId, campaignId, clientA, clientB } = await twoDevices(app);
    const char = character(campaignId, userId);

    // A creates the character (rev 1) and B pulls it, so both share a base.
    await clientA.push([op(char.id, char, { ts: "2026-07-14T09:00:00.000Z" })]);
    await clientB.pull();

    // Both go offline and edit DIFFERENT fields concurrently off rev 1.
    const aPush = await clientA.push([
      op(char.id, { harm: 2 }, { baseRev: 1, ts: "2026-07-14T10:00:00.000Z" })
    ]);
    const bPush = await clientB.push([
      op(char.id, { notes: "found a clue" }, { baseRev: 1, ts: "2026-07-14T10:05:00.000Z" })
    ]);

    // Different fields never collide, so neither push reports a conflict.
    expect(aPush.conflicts).toHaveLength(0);
    expect(bPush.conflicts).toHaveLength(0);

    // Both devices pull the converged row; both edits survive on each.
    await clientA.pull();
    await clientB.pull();
    for (const client of [clientA, clientB]) {
      expect(client.view(char.id)!.payload.harm).toBe(2);
      expect(client.view(char.id)!.payload.notes).toBe("found a clue");
    }
  });

  it("converges same-field edits last-write-wins and reports the loser a conflict", async () => {
    const app = createTestApp();
    const { userId, campaignId, clientA, clientB } = await twoDevices(app);
    const char = character(campaignId, userId);

    await clientA.push([op(char.id, char, { ts: "2026-07-14T09:00:00.000Z" })]);
    await clientB.pull();

    // Both edit the SAME field offline off rev 1. B has the later ts, so B wins.
    // B reconnects first (newer write lands), then A (older write) arrives after.
    const bPush = await clientB.push([
      op(char.id, { harm: 5 }, { baseRev: 1, ts: "2026-07-14T10:05:00.000Z" })
    ]);
    expect(bPush.conflicts).toHaveLength(0);

    const aPush = await clientA.push([
      op(char.id, { harm: 9 }, { baseRev: 1, ts: "2026-07-14T10:00:00.000Z" })
    ]);
    // A lost the field: its push is reported as a conflict carrying the server
    // payload that beat it, so a client UI could warn the user.
    expect(aPush.conflicts).toHaveLength(1);
    expect(aPush.conflicts[0]!.serverPayload.harm).toBe(5);

    // Both devices converge to the winning value.
    await clientA.pull();
    await clientB.pull();
    expect(clientA.view(char.id)!.payload.harm).toBe(5);
    expect(clientB.view(char.id)!.payload.harm).toBe(5);
  });

  it("converges a create and same-entity edit pushed in reverse ts order in one batch", async () => {
    // Guards the ts-sort regression (AGENTS.md "Sync push batches must be
    // applied in ts order"): a device's oplog can hand the server a create and
    // a later edit in the wrong array order; the edit's partial patch alone
    // fails the strict schema unless the create is applied first.
    const app = createTestApp();
    const { userId, campaignId, clientA, clientB } = await twoDevices(app);
    const char = character(campaignId, userId);

    const createOp = op(char.id, char, { baseRev: 0, ts: "2026-07-16T20:46:56.102Z" });
    const editOp = op(
      char.id,
      { name: "Renamed Hunter" },
      { baseRev: 1, ts: "2026-07-16T20:46:56.482Z" }
    );

    // Edit ordered BEFORE its own create in the array (Dexie toArray() order).
    const pushed = await clientA.push([editOp, createOp]);
    expect(pushed.applied).toEqual(
      expect.arrayContaining([createOp.opId, editOp.opId])
    );
    expect(pushed.applied).toHaveLength(2);

    await clientA.pull();
    await clientB.pull();
    expect(clientA.view(char.id)!.payload.name).toBe("Renamed Hunter");
    expect(clientB.view(char.id)!.payload.name).toBe("Renamed Hunter");
  });

  it("converges a delete tombstone from one device to the other", async () => {
    const app = createTestApp();
    const { userId, campaignId, clientA, clientB } = await twoDevices(app);
    const char = character(campaignId, userId);

    await clientA.push([op(char.id, char, { ts: "2026-07-14T09:00:00.000Z" })]);
    await clientB.pull();
    expect(clientB.view(char.id)!.deleted).toBe(false);

    // A deletes offline, then both reconnect.
    await clientA.push([
      op(char.id, {}, { baseRev: 1, deleted: true, ts: "2026-07-14T11:00:00.000Z" })
    ]);
    await clientA.pull();
    await clientB.pull();

    expect(clientA.view(char.id)!.deleted).toBe(true);
    expect(clientB.view(char.id)!.deleted).toBe(true);
  });

  it("is idempotent when a device re-pushes an already-applied op batch", async () => {
    const app = createTestApp();
    const { userId, campaignId, clientA, clientB } = await twoDevices(app);
    const char = character(campaignId, userId);

    const createOp = op(char.id, char, { ts: "2026-07-14T09:00:00.000Z" });
    const editOp = op(char.id, { harm: 3 }, { baseRev: 1, ts: "2026-07-14T10:00:00.000Z" });
    const batch = [createOp, editOp];

    const first = await clientA.push(batch);
    expect(first.applied).toEqual(expect.arrayContaining([createOp.opId, editOp.opId]));
    const seqAfterFirst = first.newSeq;

    // A flaky connection re-sends the identical batch: still reported applied
    // (idempotent by opId) but nothing is re-committed, so seq does not advance.
    const replay = await clientA.push(batch);
    expect(replay.applied).toEqual(expect.arrayContaining([createOp.opId, editOp.opId]));
    expect(replay.newSeq).toBe(seqAfterFirst);

    await clientA.pull();
    await clientB.pull();
    expect(clientA.view(char.id)!.payload.harm).toBe(3);
    expect(clientB.view(char.id)!.payload.harm).toBe(3);
  });

  it("does not resurrect a tombstoned row when a second device edits it after the delete", async () => {
    // Sticky tombstones (ADR 0002 open risk 1): once a row is deleted, a
    // non-delete op from a second offline device must NOT un-delete it,
    // otherwise a migrate's source tombstone could reappear alongside the
    // destination copy.
    const app = createTestApp();
    const { userId, campaignId, clientA, clientB } = await twoDevices(app);
    const char = character(campaignId, userId);

    await clientA.push([op(char.id, char, { ts: "2026-07-14T09:00:00.000Z" })]);
    await clientB.pull();

    // A deletes the character; B (which pulled before the delete) edits it
    // offline and pushes the edit AFTER the tombstone lands.
    await clientA.push([
      op(char.id, {}, { baseRev: 1, deleted: true, ts: "2026-07-14T11:00:00.000Z" })
    ]);
    const bEdit = op(char.id, { harm: 4 }, { baseRev: 1, ts: "2026-07-14T11:05:00.000Z" });
    const bPush = await clientB.push([bEdit]);
    // The edit is acknowledged (so B drops it from its oplog) but the row is
    // NOT revived.
    expect(bPush.applied).toContain(bEdit.opId);

    await clientA.pull();
    await clientB.pull();
    expect(clientA.view(char.id)!.deleted).toBe(true);
    expect(clientB.view(char.id)!.deleted).toBe(true);
  });
});

/**
 * Registers one user (device A) and creates two campaigns they Keeper, plus a
 * second user seated nowhere. Returns raw agents so migration tests can drive
 * the dedicated /api/characters/:id/migrate endpoint (not the sync core) and
 * pull each campaign independently.
 */
async function migrationFixture(app: ReturnType<typeof createApp>) {
  const owner = request.agent(app);
  const reg = await owner.post("/api/auth/register").send({ ...CREDENTIALS, displayName: "Owner" });
  const ownerId = reg.body.id as string;

  const first = await owner.post("/api/campaigns").send({ name: "First Table" });
  const campaignA = first.body.id as string;
  const second = await owner.post("/api/campaigns").send({ name: "Second Table" });
  const campaignB = second.body.id as string;

  const stranger = request.agent(app);
  const strangerReg = await stranger
    .post("/api/auth/register")
    .send({ email: "stranger@example.com", password: "hunter2hunter", displayName: "Stranger" });
  const strangerId = strangerReg.body.id as string;
  const strangerCampaign = (await stranger.post("/api/campaigns").send({ name: "Stranger Table" })).body
    .id as string;

  return { owner, ownerId, campaignA, campaignB, stranger, strangerId, strangerCampaign };
}

async function pullRows(agent: ReturnType<typeof request.agent>, scope: string) {
  const res = await agent.get(`/api/sync/${scope}?since=0`);
  expect(res.status).toBe(200);
  return res.body.rows as { id: string; payload: Record<string, unknown>; deleted: boolean }[];
}

describe("character migration (0.14.4, ADR 0002)", () => {
  it("carries full progress and tombstones the source in the source bucket's pull", async () => {
    const app = createTestApp();
    const { owner, ownerId, campaignA, campaignB } = await migrationFixture(app);
    const char = character(campaignA, ownerId, {
      name: "Progressed Hunter",
      harm: 3,
      luckSpent: 2,
      experience: 4,
      unstable: true,
      notes: "carried across",
      improvements: ["imp-1"],
      extrasState: { charges: 2 }
    });
    await owner.post(`/api/sync/${campaignA}`).send({ ops: [op(char.id, char)] });

    const res = await owner
      .post(`/api/characters/${char.id}/migrate`)
      .send({ migrationId: randomUUID(), destinationCampaignId: campaignB });
    expect(res.status).toBe(200);
    const { newId, sourceId, sourceScope, destScope } = res.body;
    expect(sourceId).toBe(char.id);
    expect(newId).not.toBe(char.id);
    expect(sourceScope).toBe(campaignA);
    expect(destScope).toBe(campaignB);

    // Source bucket: the old row is now a tombstone.
    const sourceRows = await pullRows(owner, campaignA);
    const sourceRow = sourceRows.find((row) => row.id === char.id);
    expect(sourceRow?.deleted).toBe(true);

    // Destination bucket: a fresh live row with every progress field intact and
    // campaignId re-pointed.
    const destRows = await pullRows(owner, campaignB);
    const destRow = destRows.find((row) => row.id === newId);
    expect(destRow?.deleted).toBe(false);
    expect(destRow?.payload).toMatchObject({
      id: newId,
      campaignId: campaignB,
      ownerUserId: ownerId,
      name: "Progressed Hunter",
      harm: 3,
      luckSpent: 2,
      experience: 4,
      unstable: true,
      notes: "carried across",
      improvements: ["imp-1"],
      extrasState: { charges: 2 }
    });
  });

  it("detaches a campaign character to the owner's standalone space", async () => {
    const app = createTestApp();
    const { owner, ownerId, campaignA } = await migrationFixture(app);
    const char = character(campaignA, ownerId);
    await owner.post(`/api/sync/${campaignA}`).send({ ops: [op(char.id, char)] });

    const res = await owner
      .post(`/api/characters/${char.id}/migrate`)
      .send({ migrationId: randomUUID(), destinationCampaignId: null });
    expect(res.status).toBe(200);
    expect(res.body.destScope).toBe("standalone");

    const standaloneRows = await pullRows(owner, "standalone");
    const moved = standaloneRows.find((row) => row.id === res.body.newId);
    expect(moved?.deleted).toBe(false);
    expect(moved?.payload.campaignId).toBeNull();
  });

  it("rejects a destination the owner is not seated in", async () => {
    const app = createTestApp();
    const { owner, ownerId, campaignA, strangerCampaign } = await migrationFixture(app);
    const char = character(campaignA, ownerId);
    await owner.post(`/api/sync/${campaignA}`).send({ ops: [op(char.id, char)] });

    const res = await owner
      .post(`/api/characters/${char.id}/migrate`)
      .send({ migrationId: randomUUID(), destinationCampaignId: strangerCampaign });
    expect(res.status).toBe(403);

    // The source row is untouched (still live in campaignA).
    const sourceRows = await pullRows(owner, campaignA);
    expect(sourceRows.find((row) => row.id === char.id)?.deleted).toBe(false);
  });

  it("rejects a non-owner (Keeper) migrating a hunter's character", async () => {
    const app = createTestApp();
    const { owner, campaignA, stranger, strangerId } = await migrationFixture(app);
    // Seat the stranger as a hunter in the owner's campaign and give them a
    // character there; the owner (Keeper) must not be able to migrate it.
    seatAsHunter(campaignA, strangerId);
    const hunterChar = character(campaignA, strangerId);
    await stranger.post(`/api/sync/${campaignA}`).send({ ops: [op(hunterChar.id, hunterChar)] });

    const res = await owner
      .post(`/api/characters/${hunterChar.id}/migrate`)
      .send({ migrationId: randomUUID(), destinationCampaignId: campaignA });
    // 403 (not owner) rather than 400 for same-bucket; owner check comes first.
    expect(res.status).toBe(403);
  });

  it("is idempotent: a replayed migrationId returns the same result and moves nothing new", async () => {
    const app = createTestApp();
    const { owner, ownerId, campaignA, campaignB } = await migrationFixture(app);
    const char = character(campaignA, ownerId);
    await owner.post(`/api/sync/${campaignA}`).send({ ops: [op(char.id, char)] });

    const migrationId = randomUUID();
    const first = await owner
      .post(`/api/characters/${char.id}/migrate`)
      .send({ migrationId, destinationCampaignId: campaignB });
    expect(first.status).toBe(200);

    const destBefore = (await pullRows(owner, campaignB)).length;

    // The client retries the identical request. The source is already a
    // tombstone; a naive handler would mint a SECOND destination row. Instead
    // the stored migration short-circuits and returns the first result.
    const replay = await owner
      .post(`/api/characters/${char.id}/migrate`)
      .send({ migrationId, destinationCampaignId: campaignB });
    expect(replay.status).toBe(200);
    expect(replay.body).toEqual(first.body);

    const destAfter = (await pullRows(owner, campaignB)).length;
    expect(destAfter).toBe(destBefore);
  });

  it("rejects migrating a character to the campaign it already lives in", async () => {
    const app = createTestApp();
    const { owner, ownerId, campaignA } = await migrationFixture(app);
    const char = character(campaignA, ownerId);
    await owner.post(`/api/sync/${campaignA}`).send({ ops: [op(char.id, char)] });

    const res = await owner
      .post(`/api/characters/${char.id}/migrate`)
      .send({ migrationId: randomUUID(), destinationCampaignId: campaignA });
    expect(res.status).toBe(400);
  });
});
