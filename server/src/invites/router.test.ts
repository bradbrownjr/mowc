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
  tempDir = mkdtempSync(path.join(tmpdir(), "mowc-invites-"));
  db = openDb(tempDir);
  runMigrations(db);
  return createApp("0.1.0-test", db);
}

async function registerAgent(app: ReturnType<typeof createApp>, email: string) {
  const agent = request.agent(app);
  await agent.post("/api/auth/register").send({ email, password: "hunter2hunter", displayName: email });
  return agent;
}

async function createCampaign(keeper: ReturnType<typeof request.agent>) {
  const res = await keeper.post("/api/campaigns").send({ name: "The Vermont Job" });
  return res.body.id as string;
}

/** Seats an agent as a hunter in campaignId via a fresh Keeper-issued invite. */
async function seatAsHunter(
  keeper: ReturnType<typeof request.agent>,
  hunter: ReturnType<typeof request.agent>,
  campaignId: string
): Promise<void> {
  const invite = await keeper.post(`/api/campaigns/${campaignId}/invites`).send({});
  await hunter.post("/api/invites/redeem").send({ code: invite.body.code });
}

describe("POST /api/campaigns/:campaignId/invites", () => {
  it("lets the Keeper create an invite with a 128-bit code and 72h expiry", async () => {
    const app = createTestApp();
    const keeper = await registerAgent(app, "keeper@example.com");
    const campaignId = await createCampaign(keeper);

    const res = await keeper.post(`/api/campaigns/${campaignId}/invites`).send({});

    expect(res.status).toBe(201);
    expect(res.body.code).toMatch(/^[0-9a-f]{32}$/);
    expect(res.body.revoked).toBe(false);
    const hoursUntilExpiry = (new Date(res.body.expiresAt).getTime() - Date.now()) / (60 * 60 * 1000);
    expect(hoursUntilExpiry).toBeGreaterThan(71);
    expect(hoursUntilExpiry).toBeLessThan(73);
  });

  it("rejects a seated hunter with 403", async () => {
    const app = createTestApp();
    const keeper = await registerAgent(app, "keeper@example.com");
    const hunter = await registerAgent(app, "hunter@example.com");
    const campaignId = await createCampaign(keeper);
    await seatAsHunter(keeper, hunter, campaignId);

    const res = await hunter.post(`/api/campaigns/${campaignId}/invites`).send({});

    expect(res.status).toBe(403);
  });

  it("returns 404 for a non-member (not 403, to avoid confirming the campaign exists)", async () => {
    const app = createTestApp();
    const keeper = await registerAgent(app, "keeper@example.com");
    const outsider = await registerAgent(app, "outsider@example.com");
    const campaignId = await createCampaign(keeper);

    const res = await outsider.post(`/api/campaigns/${campaignId}/invites`).send({});

    expect(res.status).toBe(404);
  });

  it("returns 404 for an unknown campaign", async () => {
    const app = createTestApp();
    const keeper = await registerAgent(app, "keeper@example.com");

    const res = await keeper
      .post("/api/campaigns/00000000-0000-0000-0000-000000000000/invites")
      .send({});

    expect(res.status).toBe(404);
  });
});

describe("GET /api/campaigns/:campaignId/invites", () => {
  it("lists invites without exposing the raw code", async () => {
    const app = createTestApp();
    const keeper = await registerAgent(app, "keeper@example.com");
    const campaignId = await createCampaign(keeper);
    await keeper.post(`/api/campaigns/${campaignId}/invites`).send({});

    const res = await keeper.get(`/api/campaigns/${campaignId}/invites`);

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].code).toBeUndefined();
    expect(res.body[0].revoked).toBe(false);
  });

  it("rejects a seated hunter with 403", async () => {
    const app = createTestApp();
    const keeper = await registerAgent(app, "keeper@example.com");
    const hunter = await registerAgent(app, "hunter@example.com");
    const campaignId = await createCampaign(keeper);
    await seatAsHunter(keeper, hunter, campaignId);

    const res = await hunter.get(`/api/campaigns/${campaignId}/invites`);

    expect(res.status).toBe(403);
  });

  it("returns 404 for a non-member", async () => {
    const app = createTestApp();
    const keeper = await registerAgent(app, "keeper@example.com");
    const outsider = await registerAgent(app, "outsider@example.com");
    const campaignId = await createCampaign(keeper);

    const res = await outsider.get(`/api/campaigns/${campaignId}/invites`);

    expect(res.status).toBe(404);
  });
});

describe("DELETE /api/campaigns/:campaignId/invites/:inviteId", () => {
  it("lets the Keeper revoke an invite, after which it can no longer be redeemed", async () => {
    const app = createTestApp();
    const keeper = await registerAgent(app, "keeper@example.com");
    const hunter = await registerAgent(app, "hunter@example.com");
    const campaignId = await createCampaign(keeper);
    const created = await keeper.post(`/api/campaigns/${campaignId}/invites`).send({});

    const revokeRes = await keeper.delete(`/api/campaigns/${campaignId}/invites/${created.body.id}`);
    expect(revokeRes.status).toBe(204);

    const redeemRes = await hunter.post("/api/invites/redeem").send({ code: created.body.code });
    expect(redeemRes.status).toBe(404);
  });

  it("rejects revocation by a seated hunter with 403", async () => {
    const app = createTestApp();
    const keeper = await registerAgent(app, "keeper@example.com");
    const hunter = await registerAgent(app, "hunter@example.com");
    const campaignId = await createCampaign(keeper);
    const created = await keeper.post(`/api/campaigns/${campaignId}/invites`).send({});
    await seatAsHunter(keeper, hunter, campaignId);

    const res = await hunter.delete(`/api/campaigns/${campaignId}/invites/${created.body.id}`);

    expect(res.status).toBe(403);
  });
});

describe("POST /api/invites/redeem", () => {
  it("seats the redeemer as a hunter", async () => {
    const app = createTestApp();
    const keeper = await registerAgent(app, "keeper@example.com");
    const hunter = await registerAgent(app, "hunter@example.com");
    const campaignId = await createCampaign(keeper);
    const created = await keeper.post(`/api/campaigns/${campaignId}/invites`).send({});

    const res = await hunter.post("/api/invites/redeem").send({ code: created.body.code });

    expect(res.status).toBe(201);
    expect(res.body.campaignId).toBe(campaignId);

    const campaignRes = await hunter.get(`/api/campaigns/${campaignId}`);
    expect(campaignRes.status).toBe(200);
  });

  it("is idempotent for a user who already holds a seat", async () => {
    const app = createTestApp();
    const keeper = await registerAgent(app, "keeper@example.com");
    const hunter = await registerAgent(app, "hunter@example.com");
    const campaignId = await createCampaign(keeper);
    const created = await keeper.post(`/api/campaigns/${campaignId}/invites`).send({});

    await hunter.post("/api/invites/redeem").send({ code: created.body.code });
    const res = await hunter.post("/api/invites/redeem").send({ code: created.body.code });

    expect(res.status).toBe(200);
  });

  it("rejects an invalid code with 404", async () => {
    const app = createTestApp();
    const hunter = await registerAgent(app, "hunter@example.com");

    const res = await hunter.post("/api/invites/redeem").send({ code: "0".repeat(32) });

    expect(res.status).toBe(404);
  });

  it("rejects a malformed code with 400", async () => {
    const app = createTestApp();
    const hunter = await registerAgent(app, "hunter@example.com");

    const res = await hunter.post("/api/invites/redeem").send({ code: "not-a-valid-code" });

    expect(res.status).toBe(400);
  });

  it("requires authentication", async () => {
    const app = createTestApp();

    const res = await request(app).post("/api/invites/redeem").send({ code: "0".repeat(32) });

    expect(res.status).toBe(401);
  });
});
