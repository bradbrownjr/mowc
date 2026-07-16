import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type Database from "better-sqlite3";
import { openDb } from "../db/index.js";
import { runMigrations } from "../db/migrate.js";
import { createEntitiesRepo } from "./repo.js";

let tempDir: string;
let db: Database.Database;

beforeEach(() => {
  tempDir = mkdtempSync(path.join(tmpdir(), "mowc-repo-"));
  db = openDb(tempDir);
  runMigrations(db);
});

afterEach(() => {
  db.close();
  rmSync(tempDir, { recursive: true, force: true });
});

function insertOp(campaignId: string, opId: string, appliedAt: string): void {
  db.prepare("INSERT INTO applied_ops (campaign_id, op_id, applied_at) VALUES (?, ?, ?)").run(
    campaignId,
    opId,
    appliedAt
  );
}

function countOps(): number {
  return (db.prepare("SELECT COUNT(*) AS n FROM applied_ops").get() as { n: number }).n;
}

describe("pruneAppliedOps", () => {
  it("deletes rows older than the cutoff and keeps newer ones", () => {
    const repo = createEntitiesRepo(db);
    insertOp("c1", "old-1", "2026-01-01T00:00:00.000Z");
    insertOp("c1", "old-2", "2026-05-31T23:59:59.999Z");
    insertOp("c1", "keep-1", "2026-06-01T00:00:00.001Z");
    insertOp("c2", "keep-2", "2026-07-01T00:00:00.000Z");

    const removed = repo.pruneAppliedOps("2026-06-01T00:00:00.000Z");

    expect(removed).toBe(2);
    expect(countOps()).toBe(2);
  });

  it("removes nothing when every row is newer than the cutoff", () => {
    const repo = createEntitiesRepo(db);
    insertOp("c1", "keep-1", "2026-07-10T00:00:00.000Z");

    expect(repo.pruneAppliedOps("2026-01-01T00:00:00.000Z")).toBe(0);
    expect(countOps()).toBe(1);
  });
});
