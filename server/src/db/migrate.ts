import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type Database from "better-sqlite3";

/**
 * Migration .sql files live in ./migrations, next to this file. tsc does
 * not copy non-TS assets, so the "build" script in server/package.json
 * copies src/db/migrations to dist/db/migrations after compiling. Because
 * the copy lands at the same path relative to this file ("migrations"
 * next to migrate.ts / migrate.js), resolving the directory via
 * import.meta.url works unchanged whether this runs uncompiled (tsx, dev)
 * or compiled (dist, Docker image).
 */
const MIGRATIONS_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), "migrations");

interface MigrationRow {
  version: string;
}

/**
 * Applies every *.sql file in migrationsDir, in filename order, that is
 * not already recorded in schema_migrations. Each migration runs inside a
 * transaction with its bookkeeping insert, so a re-run is a no-op.
 */
export function runMigrations(db: Database.Database, migrationsDir: string = MIGRATIONS_DIR): void {
  db.exec(
    "CREATE TABLE IF NOT EXISTS schema_migrations (" +
      "version TEXT PRIMARY KEY, " +
      "applied_at TEXT NOT NULL" +
      ")"
  );

  const applied = new Set(
    (db.prepare("SELECT version FROM schema_migrations").all() as MigrationRow[]).map((row) => row.version)
  );

  const files = readdirSync(migrationsDir)
    .filter((name) => name.endsWith(".sql"))
    .sort();

  const recordApplied = db.prepare("INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)");

  for (const file of files) {
    if (applied.has(file)) {
      continue;
    }
    const sql = readFileSync(path.join(migrationsDir, file), "utf-8");
    const applyMigration = db.transaction(() => {
      db.exec(sql);
      recordApplied.run(file, new Date().toISOString());
    });
    applyMigration();
  }
}
