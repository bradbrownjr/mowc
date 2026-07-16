import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createApp } from "./app.js";
import { config } from "./config.js";
import { openDb } from "./db/index.js";
import { runMigrations } from "./db/migrate.js";
import { createEntitiesRepo } from "./entities/repo.js";

/** applied_ops idempotency rows expire this many days after they are recorded. */
const APPLIED_OPS_RETENTION_DAYS = 30;

const pkg = JSON.parse(
  readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "package.json"), "utf-8")
) as { version: string };

const db = openDb(config.dataDir);
runMigrations(db);

// Bound the applied_ops idempotency table on startup: rows past the retention
// window can never match a replayed batch, so dropping them is safe and keeps
// long-running campaigns from accumulating them forever (docs/SYNC.md).
const retentionCutoff = new Date(Date.now() - APPLIED_OPS_RETENTION_DAYS * 24 * 60 * 60 * 1000).toISOString();
createEntitiesRepo(db).pruneAppliedOps(retentionCutoff);

const app = createApp(pkg.version, db, config.adminEmail);
if (config.trustProxy !== false) {
  app.set("trust proxy", config.trustProxy);
}

app.listen(config.port, () => {
  console.log(`MOWC server listening on port ${config.port}`);
});
