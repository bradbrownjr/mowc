import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import http from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it } from "vitest";
import request from "supertest";
import type { Express } from "express";
import type Database from "better-sqlite3";
import { createApp } from "../app.js";
import { openDb } from "../db/index.js";
import { runMigrations } from "../db/migrate.js";

/**
 * ROADMAP 0.6.1: the per-campaign SSE stream. These tests drive the real
 * endpoint over a real socket (http.createServer + fetch), asserting the auth
 * gate, the seat gate, the event-stream headers + initial event, that a
 * committed push wakes a connected client, and the visibility invariant: the
 * wake carries no entity data, and the hunter's own authz-filtered pull still
 * excludes an unrevealed entity (docs/SYNC.md invariant 4). Invented
 * placeholder content only (AGENTS.md rule 1).
 */

let tempDir: string | undefined;
let db: Database.Database | undefined;
let server: http.Server | undefined;

afterEach(async () => {
  if (server) {
    await new Promise<void>((resolve) => server!.close(() => resolve()));
    server = undefined;
  }
  db?.close();
  db = undefined;
  if (tempDir) {
    rmSync(tempDir, { recursive: true, force: true });
    tempDir = undefined;
  }
});

function createTestApp(): Express {
  tempDir = mkdtempSync(path.join(tmpdir(), "mowc-sse-"));
  db = openDb(tempDir);
  runMigrations(db);
  return createApp("0.1.0-test", db);
}

async function listen(app: Express): Promise<string> {
  server = http.createServer(app);
  await new Promise<void>((resolve) => server!.listen(0, "127.0.0.1", () => resolve()));
  const { port } = server.address() as AddressInfo;
  return `http://127.0.0.1:${port}`;
}

/** Registers a user and returns a supertest agent plus its session Cookie header. */
async function register(app: Express, email: string) {
  const agent = request.agent(app);
  const res = await agent
    .post("/api/auth/register")
    .send({ email, password: "hunter2hunter", displayName: email });
  const setCookie = res.headers["set-cookie"] as unknown as string[] | undefined;
  const cookie = (setCookie ?? []).map((c) => c.split(";")[0]).join("; ");
  return { agent, userId: res.body.id as string, cookie };
}

function monster(campaignId: string, overrides: Record<string, unknown> = {}) {
  return { id: randomUUID(), campaignId, name: "Test Monster", harmCapacity: 3, revealed: false, ...overrides };
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
 * Reads the SSE stream until the next `event: sync` block, or throws on timeout.
 * Heartbeat comment lines (`: ping`) are skipped.
 */
async function nextSyncEvent(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  state: { buffer: string },
  timeoutMs = 3000
): Promise<string> {
  const decoder = new TextDecoder();
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    let idx: number;
    while ((idx = state.buffer.indexOf("\n\n")) !== -1) {
      const block = state.buffer.slice(0, idx);
      state.buffer = state.buffer.slice(idx + 2);
      if (block.includes("event: sync")) {
        return block;
      }
    }
    const remaining = deadline - Date.now();
    if (remaining <= 0) {
      throw new Error("timed out waiting for a sync event");
    }
    const chunk = await Promise.race([
      reader.read(),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), remaining))
    ]);
    if (!chunk || chunk.done) {
      throw new Error("stream ended before a sync event arrived");
    }
    state.buffer += decoder.decode(chunk.value, { stream: true });
  }
}

describe("SSE auth and seat gate", () => {
  it("rejects an unauthenticated connection with 401", async () => {
    const base = await listen(createTestApp());
    const res = await fetch(`${base}/api/campaigns/${randomUUID()}/events`);
    expect(res.status).toBe(401);
    await res.body?.cancel();
  });

  it("rejects a non-seated user with 403", async () => {
    const app = createTestApp();
    const base = await listen(app);
    const { agent: keeper } = await register(app, "keeper@example.com");
    const { cookie: outsiderCookie } = await register(app, "outsider@example.com");
    const created = await keeper.post("/api/campaigns").send({ name: "The Vermont Job" });

    const res = await fetch(`${base}/api/campaigns/${created.body.id}/events`, {
      headers: { Cookie: outsiderCookie }
    });
    expect(res.status).toBe(403);
    await res.body?.cancel();
  });
});

describe("SSE stream headers and initial event", () => {
  it("sends event-stream headers and an initial sync event on connect", async () => {
    const app = createTestApp();
    const base = await listen(app);
    const { agent: keeper, cookie } = await register(app, "keeper@example.com");
    const created = await keeper.post("/api/campaigns").send({ name: "The Vermont Job" });

    const controller = new AbortController();
    const res = await fetch(`${base}/api/campaigns/${created.body.id}/events`, {
      headers: { Cookie: cookie },
      signal: controller.signal
    });
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/event-stream");
    expect(res.headers.get("cache-control")).toContain("no-cache");
    expect(res.headers.get("x-accel-buffering")).toBe("no");

    const reader = res.body!.getReader();
    const initial = await nextSyncEvent(reader, { buffer: "" });
    expect(initial).toContain("event: sync");
    expect(initial).toMatch(/data: \{"seq":\d+\}/);

    controller.abort();
  });
});

describe("SSE wakes a connected client on a committed push", () => {
  it("delivers a sync event after a push, and the wake leaks no entity data to a hunter", async () => {
    const app = createTestApp();
    const base = await listen(app);
    const { agent: keeper } = await register(app, "keeper@example.com");
    const { agent: hunter, userId: hunterId, cookie: hunterCookie } = await register(app, "hunter@example.com");
    const created = await keeper.post("/api/campaigns").send({ name: "The Vermont Job" });
    const campaignId = created.body.id as string;
    db!
      .prepare("INSERT INTO seats (campaign_id, user_id, role, created_at) VALUES (?, ?, 'hunter', ?)")
      .run(campaignId, hunterId, new Date().toISOString());

    // Hunter opens the live stream and reads the initial connect event.
    const controller = new AbortController();
    const res = await fetch(`${base}/api/campaigns/${campaignId}/events`, {
      headers: { Cookie: hunterCookie },
      signal: controller.signal
    });
    const reader = res.body!.getReader();
    const state = { buffer: "" };
    await nextSyncEvent(reader, state);

    // Keeper commits an unrevealed monster via the ordinary sync push path.
    const mon = monster(campaignId);
    await keeper.post(`/api/sync/${campaignId}`).send({ ops: [op(mon.id, mon, { type: "monster" })] });

    // The hunter's stream wakes, but the event carries only a seq: no monster
    // name, no entity type, nothing that could leak an unrevealed row.
    const woke = await nextSyncEvent(reader, state);
    expect(woke).toMatch(/data: \{"seq":\d+\}/);
    expect(woke).not.toContain("Test Monster");
    expect(woke).not.toContain("monster");

    // And the hunter's own authz-filtered pull still excludes the unrevealed
    // monster (docs/SYNC.md invariant 4): the wake never widens visibility.
    const hunterPull = await hunter.get(`/api/sync/${campaignId}?since=0`);
    expect(hunterPull.body.rows).toHaveLength(0);

    controller.abort();
  });
});
