import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import request from "supertest";
import type Database from "better-sqlite3";
import { CONVERSION_RESULT_FORMAT } from "@mowc/shared";
import { createApp } from "../../app.js";
import { openDb } from "../../db/index.js";
import { runMigrations } from "../../db/migrate.js";
import { makePlaceholderPdf } from "./pdfFixture.js";

const havePdftotext = spawnSync("pdftotext", ["-v"], { stdio: "ignore" }).error === undefined;
const ADMIN_EMAIL = "admin@example.com";

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
  tempDir = mkdtempSync(path.join(tmpdir(), "mowc-conversion-"));
  db = openDb(tempDir);
  runMigrations(db);
  return createApp("0.1.0-test", db, ADMIN_EMAIL);
}

async function agentFor(app: ReturnType<typeof createApp>, email: string) {
  const agent = request.agent(app);
  await agent.post("/api/auth/register").send({ email, password: "hunter2hunter", displayName: "Person" });
  return agent;
}

function postPdf(req: request.Test, pdf: Buffer) {
  return req.set("Content-Type", "application/pdf").send(pdf);
}

describe("POST /api/admin/conversions", () => {
  it("rejects an unauthenticated request with 401", async () => {
    const app = createTestApp();
    const res = await postPdf(request(app).post("/api/admin/conversions"), makePlaceholderPdf(["x"]));
    expect(res.status).toBe(401);
  });

  it("rejects a non-admin authenticated user with 403", async () => {
    const app = createTestApp();
    const agent = await agentFor(app, "hunter@example.com");
    const res = await postPdf(agent.post("/api/admin/conversions"), makePlaceholderPdf(["x"]));
    expect(res.status).toBe(403);
  });

  it("rejects a non-PDF body from the admin with 400", async () => {
    const app = createTestApp();
    const agent = await agentFor(app, ADMIN_EMAIL);
    const res = await agent
      .post("/api/admin/conversions")
      .set("Content-Type", "application/pdf")
      .send(Buffer.from("this is not a pdf"));
    expect(res.status).toBe(400);
  });

  it.skipIf(!havePdftotext)("converts a placeholder PDF into a ConversionResult", async () => {
    const app = createTestApp();
    const agent = await agentFor(app, ADMIN_EMAIL);
    const pdf = makePlaceholderPdf(
      [
        "The Placeholder",
        "An invented playbook for tests only.",
        "Charm +1 Cool +2 Sharp -1 Tough +0 Weird =1",
        "Placeholder Strike",
        "When you strike the invented target, roll +weird."
      ],
      { title: "Placeholder Book" }
    );
    const res = await postPdf(agent.post("/api/admin/conversions"), pdf);
    expect(res.status).toBe(200);
    expect(res.body.$format).toBe(CONVERSION_RESULT_FORMAT);
    expect(Array.isArray(res.body.drafts)).toBe(true);
    expect(res.body.drafts.length).toBeGreaterThan(0);
  });
});
