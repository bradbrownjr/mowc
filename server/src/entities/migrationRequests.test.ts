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

// Keeper-approved pack transfer on migration (ROADMAP 0.15.2, ADR 0003). Drives
// the real HTTP surface end to end: a hunter files a held migration request that
// carries a content pack, and the destination Keeper approves or denies it.
// Placeholder content only, never game text (AGENTS.md rule 1).

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
  tempDir = mkdtempSync(path.join(tmpdir(), "mowc-migreq-"));
  db = openDb(tempDir);
  runMigrations(db);
  return createApp("0.1.0-test", db);
}

function seatAsHunter(campaignId: string, userId: string): void {
  db!
    .prepare("INSERT INTO seats (campaign_id, user_id, role, created_at) VALUES (?, ?, 'hunter', ?)")
    .run(campaignId, userId, new Date().toISOString());
}

const PLAYBOOK_ID = "placeholder-playbook";

/** A standalone placeholder character (invented content only, per AGENTS.md). */
function standaloneCharacter(ownerUserId: string, overrides: Record<string, unknown> = {}) {
  return {
    id: randomUUID(),
    campaignId: null,
    ownerUserId,
    playbookId: PLAYBOOK_ID,
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

/** A minimal valid content pack whose one playbook matches the character's id. */
function pack(overrides: Record<string, unknown> = {}) {
  return {
    id: randomUUID(),
    name: "The Placeholder Pack",
    author: "Test Author",
    version: "1",
    playbooks: [
      {
        id: PLAYBOOK_ID,
        name: "The Placeholder",
        ratingsLines: [{ charm: 1, cool: 0, sharp: 0, tough: 0, weird: -1 }],
        moves: [],
        movesToPick: 0
      }
    ],
    basicMoves: [],
    ...overrides
  };
}

async function register(app: ReturnType<typeof createApp>, email: string, displayName: string) {
  const agent = request.agent(app);
  const reg = await agent.post("/api/auth/register").send({ email, password: "hunter2hunter", displayName });
  expect(reg.status).toBe(201);
  return { agent, id: reg.body.id as string };
}

/**
 * Keeper K runs campaign C (no matching pack). Hunter H is seated in C and owns a
 * standalone character. Returns everything a test needs to file/approve a request.
 */
async function fixture(app: ReturnType<typeof createApp>) {
  const keeper = await register(app, "keeper@example.com", "Keeper");
  const created = await keeper.agent.post("/api/campaigns").send({ name: "The Table" });
  const campaignId = created.body.id as string;

  const hunter = await register(app, "hunter@example.com", "Hunter");
  seatAsHunter(campaignId, hunter.id);

  const char = standaloneCharacter(hunter.id, { name: "Progressed Hunter", harm: 2, experience: 3 });
  await hunter.agent.post("/api/sync/standalone").send({ ops: [op(char.id, char)] });

  return { keeper, campaignId, hunter, char };
}

async function pullRows(agent: ReturnType<typeof request.agent>, scope: string) {
  const res = await agent.get(`/api/sync/${scope}?since=0`);
  expect(res.status).toBe(200);
  return res.body.rows as { id: string; payload: Record<string, unknown>; deleted: boolean }[];
}

function contentPackCount(id: string): number {
  return (db!.prepare("SELECT COUNT(*) AS n FROM content_packs WHERE id = ?").get(id) as { n: number }).n;
}

describe("Keeper-approved pack transfer (0.15.2, ADR 0003)", () => {
  it("creates a held request without moving the character", async () => {
    const app = createTestApp();
    const { campaignId, hunter, char } = await fixture(app);
    const p = pack();

    const res = await hunter.agent
      .post(`/api/characters/${char.id}/migrate-requests`)
      .send({ migrationId: randomUUID(), destinationCampaignId: campaignId, pack: p });
    expect(res.status).toBe(201);
    expect(res.body.status).toBe("pending");
    expect(res.body.packId).toBe(p.id);
    expect(res.body.packName).toBe("The Placeholder Pack");

    // Nothing moved: the character is still live in the hunter's standalone space.
    const rows = await pullRows(hunter.agent, "standalone");
    expect(rows.find((r) => r.id === char.id)?.deleted).toBe(false);
  });

  it("rejects a create from a non-owner and from an unseated destination", async () => {
    const app = createTestApp();
    const { keeper, campaignId, hunter, char } = await fixture(app);

    // The Keeper is not the character's owner: 403.
    const byKeeper = await keeper.agent
      .post(`/api/characters/${char.id}/migrate-requests`)
      .send({ migrationId: randomUUID(), destinationCampaignId: campaignId, pack: pack() });
    expect(byKeeper.status).toBe(403);

    // A campaign the hunter holds no seat in: 403.
    const otherCampaign = (await keeper.agent.post("/api/campaigns").send({ name: "Other" })).body.id as string;
    const unseated = await hunter.agent
      .post(`/api/characters/${char.id}/migrate-requests`)
      .send({ migrationId: randomUUID(), destinationCampaignId: otherCampaign, pack: pack() });
    expect(unseated.status).toBe(403);
  });

  it("rejects a pack that does not define the character's playbook", async () => {
    const app = createTestApp();
    const { campaignId, hunter, char } = await fixture(app);
    const wrongPack = pack({
      playbooks: [
        {
          id: "some-other-playbook",
          name: "Unrelated",
          ratingsLines: [{ charm: 0, cool: 0, sharp: 0, tough: 0, weird: 0 }],
          moves: [],
          movesToPick: 0
        }
      ]
    });
    const res = await hunter.agent
      .post(`/api/characters/${char.id}/migrate-requests`)
      .send({ migrationId: randomUUID(), destinationCampaignId: campaignId, pack: wrongPack });
    expect(res.status).toBe(400);
  });

  it("409s a second distinct pending request but replays the same migrationId", async () => {
    const app = createTestApp();
    const { campaignId, hunter, char } = await fixture(app);
    const migrationId = randomUUID();
    const first = await hunter.agent
      .post(`/api/characters/${char.id}/migrate-requests`)
      .send({ migrationId, destinationCampaignId: campaignId, pack: pack() });
    expect(first.status).toBe(201);

    // Same migrationId (network retry) is idempotent, returns the stored row.
    const replay = await hunter.agent
      .post(`/api/characters/${char.id}/migrate-requests`)
      .send({ migrationId, destinationCampaignId: campaignId, pack: pack() });
    expect(replay.status).toBe(200);
    expect(replay.body.migrationId).toBe(migrationId);

    // A different migrationId while one is pending is a conflict.
    const second = await hunter.agent
      .post(`/api/characters/${char.id}/migrate-requests`)
      .send({ migrationId: randomUUID(), destinationCampaignId: campaignId, pack: pack() });
    expect(second.status).toBe(409);
  });

  it("lets only the Keeper list pending requests, enriched with display data", async () => {
    const app = createTestApp();
    const { keeper, campaignId, hunter, char } = await fixture(app);
    await hunter.agent
      .post(`/api/characters/${char.id}/migrate-requests`)
      .send({ migrationId: randomUUID(), destinationCampaignId: campaignId, pack: pack() });

    // Hunter (seated, not Keeper) is forbidden.
    const asHunter = await hunter.agent.get(`/api/campaigns/${campaignId}/migrate-requests`);
    expect(asHunter.status).toBe(403);

    const asKeeper = await keeper.agent.get(`/api/campaigns/${campaignId}/migrate-requests`);
    expect(asKeeper.status).toBe(200);
    expect(asKeeper.body).toHaveLength(1);
    expect(asKeeper.body[0].characterName).toBe("Progressed Hunter");
    expect(asKeeper.body[0].requestedByDisplayName).toBe("Hunter");
  });

  it("approves: attaches the pack, tombstones the source, creates the destination with progress", async () => {
    const app = createTestApp();
    const { keeper, campaignId, hunter, char } = await fixture(app);
    const p = pack();
    const migrationId = randomUUID();
    await hunter.agent
      .post(`/api/characters/${char.id}/migrate-requests`)
      .send({ migrationId, destinationCampaignId: campaignId, pack: p });

    const approve = await keeper.agent.post(
      `/api/campaigns/${campaignId}/migrate-requests/${migrationId}/approve`
    );
    expect(approve.status).toBe(200);
    const { newId, sourceId, sourceScope, destScope } = approve.body;
    expect(sourceId).toBe(char.id);
    expect(newId).not.toBe(char.id);
    expect(sourceScope).toBe("standalone");
    expect(destScope).toBe(campaignId);

    // Pack attached to the destination campaign.
    const campaign = await keeper.agent.get(`/api/campaigns/${campaignId}`);
    expect(campaign.body.packIds).toContain(p.id);

    // Source tombstoned in the hunter's standalone space.
    const sourceRows = await pullRows(hunter.agent, "standalone");
    expect(sourceRows.find((r) => r.id === char.id)?.deleted).toBe(true);

    // Destination row present, progress carried, campaignId re-pointed.
    const destRows = await pullRows(keeper.agent, campaignId);
    const dest = destRows.find((r) => r.id === newId);
    expect(dest?.deleted).toBe(false);
    expect(dest?.payload).toMatchObject({
      id: newId,
      campaignId,
      ownerUserId: hunter.id,
      name: "Progressed Hunter",
      harm: 2,
      experience: 3
    });
  });

  it("approve is idempotent: a replay returns the same newId and moves nothing new", async () => {
    const app = createTestApp();
    const { keeper, campaignId, hunter, char } = await fixture(app);
    const migrationId = randomUUID();
    await hunter.agent
      .post(`/api/characters/${char.id}/migrate-requests`)
      .send({ migrationId, destinationCampaignId: campaignId, pack: pack() });

    const first = await keeper.agent.post(
      `/api/campaigns/${campaignId}/migrate-requests/${migrationId}/approve`
    );
    expect(first.status).toBe(200);
    const destCount = (await pullRows(keeper.agent, campaignId)).length;

    const replay = await keeper.agent.post(
      `/api/campaigns/${campaignId}/migrate-requests/${migrationId}/approve`
    );
    expect(replay.status).toBe(200);
    expect(replay.body).toEqual(first.body);
    expect((await pullRows(keeper.agent, campaignId)).length).toBe(destCount);
  });

  it("dedupes the pack when the Keeper already owns one with the same id", async () => {
    const app = createTestApp();
    const { keeper, campaignId, hunter, char } = await fixture(app);
    const p = pack();
    // Keeper uploads the pack first (owns it), then the hunter carries the same id.
    const upload = await keeper.agent.post("/api/content-packs").send(p);
    expect(upload.status).toBe(201);

    const migrationId = randomUUID();
    await hunter.agent
      .post(`/api/characters/${char.id}/migrate-requests`)
      .send({ migrationId, destinationCampaignId: campaignId, pack: p });
    const approve = await keeper.agent.post(
      `/api/campaigns/${campaignId}/migrate-requests/${migrationId}/approve`
    );
    expect(approve.status).toBe(200);

    // Deduped: still exactly one content_packs row with that id, and it is attached.
    expect(contentPackCount(p.id)).toBe(1);
    const campaign = await keeper.agent.get(`/api/campaigns/${campaignId}`);
    expect(campaign.body.packIds).toContain(p.id);
  });

  it("mints a fresh pack id when the carried id collides with a stranger's private pack", async () => {
    const app = createTestApp();
    const { keeper, campaignId, hunter, char } = await fixture(app);
    const stranger = await register(app, "stranger@example.com", "Stranger");
    const p = pack();
    // Stranger owns a private pack with this id; the Keeper cannot read it.
    expect((await stranger.agent.post("/api/content-packs").send(p)).status).toBe(201);

    const migrationId = randomUUID();
    await hunter.agent
      .post(`/api/characters/${char.id}/migrate-requests`)
      .send({ migrationId, destinationCampaignId: campaignId, pack: p });
    const approve = await keeper.agent.post(
      `/api/campaigns/${campaignId}/migrate-requests/${migrationId}/approve`
    );
    expect(approve.status).toBe(200);

    // A second, fresh-id row was minted for the Keeper; the stranger's is untouched.
    const campaign = await keeper.agent.get(`/api/campaigns/${campaignId}`);
    const attached = campaign.body.packIds as string[];
    expect(attached).toHaveLength(1);
    expect(attached[0]).not.toBe(p.id);
    const attachedId = attached[0]!;
    const owner = (
      db!.prepare("SELECT owner_user_id AS o FROM content_packs WHERE id = ?").get(attachedId) as {
        o: string;
      }
    ).o;
    expect(owner).toBe(keeper.id);
    expect(contentPackCount(p.id)).toBe(1); // stranger's original untouched
  });

  it("deny leaves the character in place and flips the status", async () => {
    const app = createTestApp();
    const { keeper, campaignId, hunter, char } = await fixture(app);
    const migrationId = randomUUID();
    await hunter.agent
      .post(`/api/characters/${char.id}/migrate-requests`)
      .send({ migrationId, destinationCampaignId: campaignId, pack: pack() });

    const deny = await keeper.agent.post(
      `/api/campaigns/${campaignId}/migrate-requests/${migrationId}/deny`
    );
    expect(deny.status).toBe(200);
    expect(deny.body.status).toBe("denied");

    // Character untouched; hunter's poll reports the denial.
    const rows = await pullRows(hunter.agent, "standalone");
    expect(rows.find((r) => r.id === char.id)?.deleted).toBe(false);
    const latest = await hunter.agent.get(`/api/characters/${char.id}/migrate-requests/latest`);
    expect(latest.body.status).toBe("denied");

    // A second deny (already decided) is a 409.
    const again = await keeper.agent.post(
      `/api/campaigns/${campaignId}/migrate-requests/${migrationId}/deny`
    );
    expect(again.status).toBe(409);
  });

  it("lets the owner cancel a pending request", async () => {
    const app = createTestApp();
    const { keeper, campaignId, hunter, char } = await fixture(app);
    const migrationId = randomUUID();
    await hunter.agent
      .post(`/api/characters/${char.id}/migrate-requests`)
      .send({ migrationId, destinationCampaignId: campaignId, pack: pack() });

    // A non-owner (the Keeper) cannot cancel via the owner route.
    const byKeeper = await keeper.agent.post(
      `/api/characters/${char.id}/migrate-requests/${migrationId}/cancel`
    );
    expect(byKeeper.status).toBe(404);

    const cancel = await hunter.agent.post(
      `/api/characters/${char.id}/migrate-requests/${migrationId}/cancel`
    );
    expect(cancel.status).toBe(200);
    expect(cancel.body.status).toBe("denied");

    // The Keeper's pending list is now empty.
    const list = await keeper.agent.get(`/api/campaigns/${campaignId}/migrate-requests`);
    expect(list.body).toHaveLength(0);
  });

  it("expires a pending request older than 72h on the next touch", async () => {
    const app = createTestApp();
    const { keeper, campaignId, hunter, char } = await fixture(app);
    const migrationId = randomUUID();
    await hunter.agent
      .post(`/api/characters/${char.id}/migrate-requests`)
      .send({ migrationId, destinationCampaignId: campaignId, pack: pack() });

    // Backdate the request past the 72h window.
    const old = new Date(Date.now() - 73 * 60 * 60 * 1000).toISOString();
    db!.prepare("UPDATE migration_requests SET created_at = ? WHERE migration_id = ?").run(old, migrationId);

    // The hunter's poll runs the lazy sweep first, so it now reads expired.
    const latest = await hunter.agent.get(`/api/characters/${char.id}/migrate-requests/latest`);
    expect(latest.body.status).toBe("expired");

    // Approving an expired request is a 409.
    const approve = await keeper.agent.post(
      `/api/campaigns/${campaignId}/migrate-requests/${migrationId}/approve`
    );
    expect(approve.status).toBe(409);

    // The freed unique index lets a fresh request be filed.
    const fresh = await hunter.agent
      .post(`/api/characters/${char.id}/migrate-requests`)
      .send({ migrationId: randomUUID(), destinationCampaignId: campaignId, pack: pack() });
    expect(fresh.status).toBe(201);
  });

  it("fails the approve when the character is gone at approval time", async () => {
    const app = createTestApp();
    const { keeper, campaignId, hunter, char } = await fixture(app);
    const migrationId = randomUUID();
    await hunter.agent
      .post(`/api/characters/${char.id}/migrate-requests`)
      .send({ migrationId, destinationCampaignId: campaignId, pack: pack() });

    // The hunter deletes the character (tombstone) while the request sits pending.
    await hunter.agent.post("/api/sync/standalone").send({
      ops: [op(char.id, {}, { baseRev: 1, deleted: true })]
    });

    const approve = await keeper.agent.post(
      `/api/campaigns/${campaignId}/migrate-requests/${migrationId}/approve`
    );
    expect(approve.status).toBe(409);

    // The request is still pending: the Keeper must explicitly deny to close it.
    const deny = await keeper.agent.post(
      `/api/campaigns/${campaignId}/migrate-requests/${migrationId}/deny`
    );
    expect(deny.status).toBe(200);
  });

  it("returns null from latest when the owner has no request", async () => {
    const app = createTestApp();
    const { hunter, char } = await fixture(app);
    const res = await hunter.agent.get(`/api/characters/${char.id}/migrate-requests/latest`);
    expect(res.status).toBe(200);
    expect(res.body).toBeNull();
  });
});
