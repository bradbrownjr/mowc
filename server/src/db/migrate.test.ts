import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type Database from "better-sqlite3";
import { openDb } from "./index.js";
import { runMigrations } from "./migrate.js";

interface MigrationRow {
  version: string;
}

interface TableRow {
  name: string;
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

describe("runMigrations", () => {
  it("applies migrations and is a no-op on re-run", () => {
    tempDir = mkdtempSync(path.join(tmpdir(), "mowc-migrate-"));
    db = openDb(tempDir);

    runMigrations(db);
    const firstRun = db.prepare("SELECT version FROM schema_migrations ORDER BY version").all() as MigrationRow[];

    expect(firstRun.length).toBeGreaterThan(0);
    expect(firstRun.map((row) => row.version)).toContain("0001_init.sql");

    runMigrations(db);
    const secondRun = db.prepare("SELECT version FROM schema_migrations ORDER BY version").all() as MigrationRow[];

    expect(secondRun).toEqual(firstRun);
  });

  it("creates the sync-envelope and content-pack tables and tracks the migration", () => {
    tempDir = mkdtempSync(path.join(tmpdir(), "mowc-migrate-"));
    db = openDb(tempDir);

    runMigrations(db);

    const versions = (
      db.prepare("SELECT version FROM schema_migrations").all() as MigrationRow[]
    ).map((row) => row.version);
    expect(versions).toContain("0002_sync_envelope.sql");

    const tables = (
      db
        .prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name")
        .all() as TableRow[]
    ).map((row) => row.name);
    expect(tables).toEqual(expect.arrayContaining(["entities", "applied_ops", "content_packs"]));

    const indexes = (
      db
        .prepare("SELECT name FROM sqlite_master WHERE type = 'index' ORDER BY name")
        .all() as TableRow[]
    ).map((row) => row.name);
    expect(indexes).toEqual(
      expect.arrayContaining([
        "idx_entities_campaign_seq",
        "idx_entities_campaign_type",
        "idx_applied_ops_applied_at",
        "idx_content_packs_owner"
      ])
    );
  });

  it("gives entities the envelope columns and applied_ops a per-campaign key", () => {
    tempDir = mkdtempSync(path.join(tmpdir(), "mowc-migrate-"));
    db = openDb(tempDir);

    runMigrations(db);

    const entityCols = (
      db.prepare("PRAGMA table_info(entities)").all() as { name: string }[]
    ).map((row) => row.name);
    expect(entityCols).toEqual([
      "id",
      "campaign_id",
      "type",
      "payload",
      "rev",
      "seq",
      "updated_at",
      "updated_by",
      "deleted"
    ]);

    // Same opId in different campaigns is allowed; a duplicate within a
    // campaign is rejected by the composite primary key (idempotency).
    const insert = db.prepare(
      "INSERT INTO applied_ops (campaign_id, op_id, applied_at) VALUES (?, ?, ?)"
    );
    insert.run("c1", "op1", "2026-07-13T00:00:00.000Z");
    insert.run("c2", "op1", "2026-07-13T00:00:00.000Z");
    expect(() => insert.run("c1", "op1", "2026-07-13T00:00:01.000Z")).toThrow();
  });
});
