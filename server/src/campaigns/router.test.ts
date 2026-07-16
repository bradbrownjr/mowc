import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
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
  tempDir = mkdtempSync(path.join(tmpdir(), "mowc-campaigns-"));
  db = openDb(tempDir);
  runMigrations(db);
  return createApp("0.1.0-test", db);
}

/** Minimal pack row for attach-permission tests (invented content only). */
function insertPack(packId: string, ownerUserId: string, visibility: "private" | "shared" = "private"): void {
  const now = new Date().toISOString();
  db!
    .prepare(
      "INSERT INTO content_packs (id, owner_user_id, name, author, version, payload, visibility, created_at, updated_at) " +
        "VALUES (?, ?, 'The Placeholder Pack', 'Test Author', '1.0.0', '{}', ?, ?, ?)"
    )
    .run(packId, ownerUserId, visibility, now, now);
}

async function registerAgent(app: ReturnType<typeof createApp>, email: string) {
  const agent = request.agent(app);
  const res = await agent
    .post("/api/auth/register")
    .send({ email, password: "hunter2hunter", displayName: email });
  return { agent, userId: res.body.id as string };
}

/** Invite redemption lands in 0.3.3; seat a hunter directly for 403-path tests. */
function seatAsHunter(campaignId: string, userId: string): void {
  db!
    .prepare("INSERT INTO seats (campaign_id, user_id, role, created_at) VALUES (?, ?, 'hunter', ?)")
    .run(campaignId, userId, new Date().toISOString());
}

describe("auth requirement", () => {
  it("rejects an unauthenticated request with 401", async () => {
    const app = createTestApp();

    const res = await request(app).post("/api/campaigns").send({ name: "The Vermont Job" });

    expect(res.status).toBe(401);
  });
});

describe("POST /api/campaigns", () => {
  it("creates a campaign owned by the requester and seats them as keeper", async () => {
    const app = createTestApp();
    const { agent } = await registerAgent(app, "keeper@example.com");

    const res = await agent.post("/api/campaigns").send({ name: "The Vermont Job" });

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ name: "The Vermont Job", packIds: [], settings: {}, theme: "default" });
    expect(res.body.keeperUserId).toBeTruthy();

    const listRes = await agent.get("/api/campaigns");
    expect(listRes.body).toHaveLength(1);
    expect(listRes.body[0].id).toBe(res.body.id);
  });

  it("rejects a blank name", async () => {
    const app = createTestApp();
    const { agent } = await registerAgent(app, "keeper@example.com");

    const res = await agent.post("/api/campaigns").send({ name: "" });

    expect(res.status).toBe(400);
  });
});

describe("GET /api/campaigns/:id", () => {
  it("returns 404 for a campaign the requester is not a member of", async () => {
    const app = createTestApp();
    const { agent: keeper } = await registerAgent(app, "keeper@example.com");
    const { agent: outsider } = await registerAgent(app, "outsider@example.com");
    const created = await keeper.post("/api/campaigns").send({ name: "The Vermont Job" });

    const res = await outsider.get(`/api/campaigns/${created.body.id}`);

    expect(res.status).toBe(404);
  });

  it("returns the campaign for a member", async () => {
    const app = createTestApp();
    const { agent: keeper } = await registerAgent(app, "keeper@example.com");
    const created = await keeper.post("/api/campaigns").send({ name: "The Vermont Job" });

    const res = await keeper.get(`/api/campaigns/${created.body.id}`);

    expect(res.status).toBe(200);
    expect(res.body.id).toBe(created.body.id);
  });

  it("returns 404 for an unknown id", async () => {
    const app = createTestApp();
    const { agent: keeper } = await registerAgent(app, "keeper@example.com");

    const res = await keeper.get("/api/campaigns/00000000-0000-0000-0000-000000000000");

    expect(res.status).toBe(404);
  });
});

describe("PATCH /api/campaigns/:id", () => {
  it("lets the Keeper update name, theme, settings, and packIds", async () => {
    const app = createTestApp();
    const { agent: keeper, userId: keeperId } = await registerAgent(app, "keeper@example.com");
    const created = await keeper.post("/api/campaigns").send({ name: "The Vermont Job" });
    const packId = "00000000-0000-4000-8000-000000000001";
    insertPack(packId, keeperId);

    const res = await keeper
      .patch(`/api/campaigns/${created.body.id}`)
      .send({ name: "The Vermont Job, Redux", theme: "midnight", packIds: [packId], settings: { arc: 1 } });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      name: "The Vermont Job, Redux",
      theme: "midnight",
      packIds: [packId],
      settings: { arc: 1 }
    });
  });

  it("rejects attaching a pack id that does not exist", async () => {
    const app = createTestApp();
    const { agent: keeper } = await registerAgent(app, "keeper@example.com");
    const created = await keeper.post("/api/campaigns").send({ name: "The Vermont Job" });

    const res = await keeper
      .patch(`/api/campaigns/${created.body.id}`)
      .send({ packIds: ["00000000-0000-4000-8000-00000000dead"] });

    expect(res.status).toBe(400);
    expect(res.body.errors[0].path).toBe("packIds");
  });

  it("rejects attaching another user's private pack (no read-by-attachment)", async () => {
    const app = createTestApp();
    const { agent: keeper } = await registerAgent(app, "keeper@example.com");
    const { userId: strangerId } = await registerAgent(app, "stranger@example.com");
    const created = await keeper.post("/api/campaigns").send({ name: "The Vermont Job" });
    const packId = "00000000-0000-4000-8000-000000000002";
    insertPack(packId, strangerId, "private");

    const res = await keeper.patch(`/api/campaigns/${created.body.id}`).send({ packIds: [packId] });

    expect(res.status).toBe(400);
    expect(res.body.errors[0].path).toBe("packIds");
  });

  it("lets the Keeper attach a shared pack they do not own", async () => {
    const app = createTestApp();
    const { agent: keeper } = await registerAgent(app, "keeper@example.com");
    const { userId: adminId } = await registerAgent(app, "admin@example.com");
    const created = await keeper.post("/api/campaigns").send({ name: "The Vermont Job" });
    const packId = "00000000-0000-4000-8000-000000000003";
    insertPack(packId, adminId, "shared");

    const res = await keeper.patch(`/api/campaigns/${created.body.id}`).send({ packIds: [packId] });

    expect(res.status).toBe(200);
    expect(res.body.packIds).toEqual([packId]);
  });

  it("keeps an already-attached pack id patchable after the pack row is gone", async () => {
    const app = createTestApp();
    const { agent: keeper, userId: keeperId } = await registerAgent(app, "keeper@example.com");
    const created = await keeper.post("/api/campaigns").send({ name: "The Vermont Job" });
    const packId = "00000000-0000-4000-8000-000000000004";
    insertPack(packId, keeperId);
    await keeper.patch(`/api/campaigns/${created.body.id}`).send({ packIds: [packId] });
    db!.prepare("DELETE FROM content_packs WHERE id = ?").run(packId);

    const res = await keeper
      .patch(`/api/campaigns/${created.body.id}`)
      .send({ name: "Renamed", packIds: [packId] });

    expect(res.status).toBe(200);
    expect(res.body.packIds).toEqual([packId]);
  });

  it("returns 404 for a non-member", async () => {
    const app = createTestApp();
    const { agent: keeper } = await registerAgent(app, "keeper@example.com");
    const { agent: outsider } = await registerAgent(app, "outsider@example.com");
    const created = await keeper.post("/api/campaigns").send({ name: "The Vermont Job" });

    const res = await outsider.patch(`/api/campaigns/${created.body.id}`).send({ name: "Hijacked" });

    expect(res.status).toBe(404);
  });

  it("rejects an update from a seated hunter with 403", async () => {
    const app = createTestApp();
    const { agent: keeper } = await registerAgent(app, "keeper@example.com");
    const { agent: hunter, userId: hunterId } = await registerAgent(app, "hunter@example.com");
    const created = await keeper.post("/api/campaigns").send({ name: "The Vermont Job" });
    seatAsHunter(created.body.id, hunterId);

    const res = await hunter.patch(`/api/campaigns/${created.body.id}`).send({ name: "Hijacked" });

    expect(res.status).toBe(403);
  });
});

describe("DELETE /api/campaigns/:id", () => {
  it("lets the Keeper delete their campaign", async () => {
    const app = createTestApp();
    const { agent: keeper } = await registerAgent(app, "keeper@example.com");
    const created = await keeper.post("/api/campaigns").send({ name: "The Vermont Job" });

    const deleteRes = await keeper.delete(`/api/campaigns/${created.body.id}`);
    expect(deleteRes.status).toBe(204);

    const getRes = await keeper.get(`/api/campaigns/${created.body.id}`);
    expect(getRes.status).toBe(404);
  });

  it("returns 404 for a non-member", async () => {
    const app = createTestApp();
    const { agent: keeper } = await registerAgent(app, "keeper@example.com");
    const { agent: outsider } = await registerAgent(app, "outsider@example.com");
    const created = await keeper.post("/api/campaigns").send({ name: "The Vermont Job" });

    const res = await outsider.delete(`/api/campaigns/${created.body.id}`);

    expect(res.status).toBe(404);
  });

  it("rejects deletion by a seated hunter with 403", async () => {
    const app = createTestApp();
    const { agent: keeper } = await registerAgent(app, "keeper@example.com");
    const { agent: hunter, userId: hunterId } = await registerAgent(app, "hunter@example.com");
    const created = await keeper.post("/api/campaigns").send({ name: "The Vermont Job" });
    seatAsHunter(created.body.id, hunterId);

    const res = await hunter.delete(`/api/campaigns/${created.body.id}`);

    expect(res.status).toBe(403);
  });
});
