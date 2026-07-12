import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import express, { type Express } from "express";
import { HealthzResponseSchema } from "@mowc/shared";
import { securityHeaders } from "./http/securityHeaders.js";

/**
 * The built SvelteKit client is expected as a sibling of this package:
 * <repo-root>/client/build. This holds whether app.ts runs uncompiled
 * (src/app.ts, dev) or compiled (dist/app.js, Docker image), since both
 * sit two directories below <repo-root>. The Docker image must preserve
 * this layout (server/dist and client/build as siblings under the same
 * root) or this path needs an explicit override added later.
 */
const CLIENT_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "client", "build");

/**
 * Builds the Express app without binding a port, so tests can exercise it
 * directly (e.g. with supertest).
 */
export function createApp(version: string): Express {
  const app = express();

  app.use(securityHeaders);
  app.use(express.json({ limit: "1mb" }));

  app.get("/healthz", (_req, res) => {
    res.json(HealthzResponseSchema.parse({ status: "ok", version }));
  });

  if (existsSync(CLIENT_DIR)) {
    app.use(express.static(CLIENT_DIR));
    app.use((req, res, next) => {
      if (req.method !== "GET") {
        next();
        return;
      }
      res.sendFile(path.join(CLIENT_DIR, "index.html"));
    });
  }

  return app;
}
