import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import request from "supertest";
import type Database from "better-sqlite3";
import type { ContentPack } from "@mowc/shared";
import { createApp } from "../app.js";
import { openDb } from "../db/index.js";
import { runMigrations } from "../db/migrate.js";

const EXAMPLE_PACK_PATH = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "..",
  "content-packs",
  "example-pack.mowcpack.json"
);

function loadExamplePack(): ContentPack {
  return JSON.parse(readFileSync(EXAMPLE_PACK_PATH, "utf-8")) as ContentPack;
}

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
  tempDir = mkdtempSync(path.join(tmpdir(), "mowc-content-packs-"));
  db = openDb(tempDir);
  runMigrations(db);
  return createApp("0.1.0-test", db);
}

/** Content-pack routes require auth; returns an agent carrying a session cookie. */
async function authedAgent(app: ReturnType<typeof createApp>) {
  const agent = request.agent(app);
  await agent
    .post("/api/auth/register")
    .send({ email: "packer@example.com", password: "hunter2hunter", displayName: "Packer" });
  return agent;
}

describe("auth requirement", () => {
  it("rejects an unauthenticated upload with 401", async () => {
    const app = createTestApp();
    const pack = loadExamplePack();

    const res = await request(app).post("/api/content-packs").send(pack);

    expect(res.status).toBe(401);
  });
});

describe("POST /api/content-packs", () => {
  it("accepts a valid pack and returns a summary", async () => {
    const app = createTestApp();
    const agent = await authedAgent(app);
    const pack = loadExamplePack();

    const res = await agent.post("/api/content-packs").send(pack);

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ id: pack.id, name: pack.name, author: pack.author, version: pack.version });
    expect(res.body.createdAt).toBeTruthy();
  });

  it("rejects a pack missing a required field with path-precise errors", async () => {
    const app = createTestApp();
    const agent = await authedAgent(app);
    const pack = loadExamplePack();
    const { name: _name, ...invalidPack } = pack;

    const res = await agent.post("/api/content-packs").send(invalidPack);

    expect(res.status).toBe(400);
    expect(res.body.errors).toEqual(
      expect.arrayContaining([expect.objectContaining({ path: "name" })])
    );
  });

  it("rejects unknown top-level keys", async () => {
    const app = createTestApp();
    const agent = await authedAgent(app);
    const pack = { ...loadExamplePack(), unexpectedField: "nope" };

    const res = await agent.post("/api/content-packs").send(pack);

    expect(res.status).toBe(400);
  });

  it("rejects a payload carrying a __proto__ key", async () => {
    const app = createTestApp();
    const agent = await authedAgent(app);
    // Sent as a raw string with an explicit content-type: supertest's
    // object-merge path for .send(obj) assigns keys with `target[key] =
    // value`, which for a literal "__proto__" key sets the object's actual
    // prototype instead of a data property, silently losing it before the
    // request is even made. A raw JSON string bypasses that merge and
    // reaches the server exactly as a hostile client's request body would.
    const rawJson = JSON.stringify(loadExamplePack()).replace(
      '"gear"',
      '"__proto__":{"polluted":true},"gear"'
    );

    const res = await agent
      .post("/api/content-packs")
      .set("Content-Type", "application/json")
      .send(rawJson);

    expect(res.status).toBe(400);
  });

  it("rejects a duplicate id with 409", async () => {
    const app = createTestApp();
    const agent = await authedAgent(app);
    const pack = loadExamplePack();

    await agent.post("/api/content-packs").send(pack);
    const res = await agent.post("/api/content-packs").send(pack);

    expect(res.status).toBe(409);
  });

  it("accepts a pack body larger than the global 1 MB limit but under the 5 MB pack limit", async () => {
    const app = createTestApp();
    const agent = await authedAgent(app);
    const pack = loadExamplePack();
    const paddedPack = { ...pack, playbooks: [{ ...pack.playbooks[0], blurb: "x".repeat(2 * 1024 * 1024) }] };

    const res = await agent.post("/api/content-packs").send(paddedPack);

    expect(res.status).toBe(201);
  });
});

describe("GET /api/content-packs", () => {
  it("lists uploaded packs as summaries", async () => {
    const app = createTestApp();
    const agent = await authedAgent(app);
    const pack = loadExamplePack();
    await agent.post("/api/content-packs").send(pack);

    const res = await agent.get("/api/content-packs");

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0]).toMatchObject({ id: pack.id, name: pack.name });
    expect(res.body[0].pack).toBeUndefined();
  });
});

describe("GET /api/content-packs/:id", () => {
  it("returns the full pack payload", async () => {
    const app = createTestApp();
    const agent = await authedAgent(app);
    const pack = loadExamplePack();
    await agent.post("/api/content-packs").send(pack);

    const res = await agent.get(`/api/content-packs/${pack.id}`);

    expect(res.status).toBe(200);
    expect(res.body.pack).toEqual(pack);
  });

  it("returns 404 for an unknown id", async () => {
    const app = createTestApp();
    const agent = await authedAgent(app);

    const res = await agent.get("/api/content-packs/00000000-0000-0000-0000-000000000000");

    expect(res.status).toBe(404);
  });

  it("returns 400 for a non-uuid id", async () => {
    const app = createTestApp();
    const agent = await authedAgent(app);

    const res = await agent.get("/api/content-packs/not-a-uuid");

    expect(res.status).toBe(400);
  });

  it("allows a campaign member to read a pack the Keeper attached, even though they don't own it", async () => {
    // docs/SECURITY.md section 7: packs are private to their campaign, not to
    // their uploader alone. The Keeper uploads the pack, attaches it to a
    // campaign via PATCH .../packIds, and a seated hunter must still be able
    // to fetch full playbook data for the builder wizard (0.4.3).
    const app = createTestApp();
    const keeper = await authedAgent(app);
    const pack = loadExamplePack();
    await keeper.post("/api/content-packs").send(pack);
    const campaignRes = await keeper.post("/api/campaigns").send({ name: "Shared Case" });
    const campaignId = campaignRes.body.id as string;
    await keeper.patch(`/api/campaigns/${campaignId}`).send({ packIds: [pack.id] });
    const inviteRes = await keeper.post(`/api/campaigns/${campaignId}/invites`);

    const hunter = request.agent(app);
    await hunter
      .post("/api/auth/register")
      .send({ email: "hunter@example.com", password: "hunter2hunter", displayName: "Hunter" });
    await hunter.post("/api/invites/redeem").send({ code: inviteRes.body.code });

    const res = await hunter.get(`/api/content-packs/${pack.id}`);

    expect(res.status).toBe(200);
    expect(res.body.pack).toEqual(pack);
  });

  it("returns 404 for a pack the user neither owns nor shares a campaign for", async () => {
    const app = createTestApp();
    const owner = await authedAgent(app);
    const pack = loadExamplePack();
    await owner.post("/api/content-packs").send(pack);

    const stranger = request.agent(app);
    await stranger
      .post("/api/auth/register")
      .send({ email: "stranger@example.com", password: "hunter2hunter", displayName: "Stranger" });

    const res = await stranger.get(`/api/content-packs/${pack.id}`);

    expect(res.status).toBe(404);
  });
});

describe("DELETE /api/content-packs/:id", () => {
  it("deletes an existing pack", async () => {
    const app = createTestApp();
    const agent = await authedAgent(app);
    const pack = loadExamplePack();
    await agent.post("/api/content-packs").send(pack);

    const deleteRes = await agent.delete(`/api/content-packs/${pack.id}`);
    expect(deleteRes.status).toBe(204);

    const getRes = await agent.get(`/api/content-packs/${pack.id}`);
    expect(getRes.status).toBe(404);
  });

  it("returns 404 deleting an unknown id", async () => {
    const app = createTestApp();
    const agent = await authedAgent(app);

    const res = await agent.delete("/api/content-packs/00000000-0000-0000-0000-000000000000");

    expect(res.status).toBe(404);
  });
});
