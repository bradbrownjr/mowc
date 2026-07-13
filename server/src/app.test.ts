import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import request from "supertest";
import type Database from "better-sqlite3";
import { HealthzResponseSchema } from "@mowc/shared";
import { createApp } from "./app.js";
import { openDb } from "./db/index.js";
import { runMigrations } from "./db/migrate.js";

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

function createTestApp(version: string) {
  tempDir = mkdtempSync(path.join(tmpdir(), "mowc-app-"));
  db = openDb(tempDir);
  runMigrations(db);
  return createApp(version, db);
}

describe("GET /healthz", () => {
  it("returns status ok and the given version", async () => {
    const app = createTestApp("0.1.0-test");

    const res = await request(app).get("/healthz");

    expect(res.status).toBe(200);
    const body = HealthzResponseSchema.parse(res.body);
    expect(body.status).toBe("ok");
    expect(body.version).toBe("0.1.0-test");
  });
});
