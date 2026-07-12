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
});
