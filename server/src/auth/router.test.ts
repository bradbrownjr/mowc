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
  tempDir = mkdtempSync(path.join(tmpdir(), "mowc-auth-"));
  db = openDb(tempDir);
  runMigrations(db);
  return createApp("0.1.0-test", db);
}

const CREDENTIALS = { email: "Hunter@Example.com", password: "hunter2hunter", displayName: "Hunter" };

describe("POST /api/auth/register", () => {
  it("creates an account, sets a session cookie, and returns the public user", async () => {
    const app = createTestApp();

    const res = await request(app).post("/api/auth/register").send(CREDENTIALS);

    expect(res.status).toBe(201);
    expect(res.body).toEqual({ id: expect.any(String), email: "hunter@example.com", displayName: "Hunter" });
    expect(res.body.passwordHash).toBeUndefined();
    expect(res.headers["set-cookie"]?.[0]).toMatch(/^mowc_session=/);
  });

  it("rejects a duplicate email (case-insensitively) with 409", async () => {
    const app = createTestApp();
    await request(app).post("/api/auth/register").send(CREDENTIALS);

    const res = await request(app)
      .post("/api/auth/register")
      .send({ ...CREDENTIALS, email: "hunter@example.com" });

    expect(res.status).toBe(409);
  });

  it("rejects a password shorter than 8 characters", async () => {
    const app = createTestApp();

    const res = await request(app).post("/api/auth/register").send({ ...CREDENTIALS, password: "short" });

    expect(res.status).toBe(400);
  });

  it("rejects an invalid email", async () => {
    const app = createTestApp();

    const res = await request(app).post("/api/auth/register").send({ ...CREDENTIALS, email: "not-an-email" });

    expect(res.status).toBe(400);
  });
});

describe("POST /api/auth/login", () => {
  it("logs in with correct credentials and sets a session cookie", async () => {
    const app = createTestApp();
    await request(app).post("/api/auth/register").send(CREDENTIALS);

    const res = await request(app)
      .post("/api/auth/login")
      .send({ email: CREDENTIALS.email, password: CREDENTIALS.password });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ id: expect.any(String), email: "hunter@example.com", displayName: "Hunter" });
    expect(res.headers["set-cookie"]?.[0]).toMatch(/^mowc_session=/);
  });

  it("rejects an unknown email with 401", async () => {
    const app = createTestApp();

    const res = await request(app)
      .post("/api/auth/login")
      .send({ email: "nobody@example.com", password: "irrelevant" });

    expect(res.status).toBe(401);
  });

  it("rejects a wrong password with 401", async () => {
    const app = createTestApp();
    await request(app).post("/api/auth/register").send(CREDENTIALS);

    const res = await request(app)
      .post("/api/auth/login")
      .send({ email: CREDENTIALS.email, password: "wrong-password" });

    expect(res.status).toBe(401);
  });
});

describe("GET /api/auth/me", () => {
  it("returns 401 without a session", async () => {
    const app = createTestApp();

    const res = await request(app).get("/api/auth/me");

    expect(res.status).toBe(401);
  });

  it("returns the current user with a valid session", async () => {
    const app = createTestApp();
    const agent = request.agent(app);
    await agent.post("/api/auth/register").send(CREDENTIALS);

    const res = await agent.get("/api/auth/me");

    expect(res.status).toBe(200);
    expect(res.body.email).toBe("hunter@example.com");
  });
});

describe("POST /api/auth/logout", () => {
  it("revokes the session so /me subsequently returns 401", async () => {
    const app = createTestApp();
    const agent = request.agent(app);
    await agent.post("/api/auth/register").send(CREDENTIALS);

    const logoutRes = await agent.post("/api/auth/logout");
    expect(logoutRes.status).toBe(204);

    const meRes = await agent.get("/api/auth/me");
    expect(meRes.status).toBe(401);
  });
});

describe("CSRF origin check", () => {
  it("blocks a state-changing request from a mismatched Origin", async () => {
    const app = createTestApp();

    const res = await request(app)
      .post("/api/auth/register")
      .set("Origin", "https://evil.example")
      .send(CREDENTIALS);

    expect(res.status).toBe(403);
  });

  it("allows a state-changing request with no Origin header", async () => {
    const app = createTestApp();

    const res = await request(app).post("/api/auth/register").send(CREDENTIALS);

    expect(res.status).toBe(201);
  });
});

describe("rate limiting", () => {
  it("returns 429 after 10 login attempts per minute", async () => {
    const app = createTestApp();
    const attempt = () =>
      request(app).post("/api/auth/login").send({ email: "nobody@example.com", password: "x" });

    for (let i = 0; i < 10; i += 1) {
      const res = await attempt();
      expect(res.status).toBe(401);
    }

    const res = await attempt();
    expect(res.status).toBe(429);
  });
});
