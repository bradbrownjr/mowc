import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createApp } from "./app.js";
import { config } from "./config.js";
import { openDb } from "./db/index.js";
import { runMigrations } from "./db/migrate.js";

const pkg = JSON.parse(
  readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "package.json"), "utf-8")
) as { version: string };

const db = openDb(config.dataDir);
runMigrations(db);

const app = createApp(pkg.version, db, config.adminEmail);

app.listen(config.port, () => {
  console.log(`MOWC server listening on port ${config.port}`);
});
