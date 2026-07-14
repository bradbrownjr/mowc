import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import express, { type Express } from "express";
import type Database from "better-sqlite3";
import { HealthzResponseSchema } from "@mowc/shared";
import { securityHeaders } from "./http/securityHeaders.js";
import { createContentPacksRouter } from "./api/contentPacks.js";
import { attachUser, csrfOriginCheck, requireAuth } from "./auth/middleware.js";
import { createAuthRepo } from "./auth/repo.js";
import { createAuthRouter } from "./auth/router.js";
import { createGlobalRateLimiter } from "./auth/rateLimit.js";
import { createCampaignsRepo } from "./campaigns/repo.js";
import { createCampaignsRouter } from "./campaigns/router.js";
import { createInvitesRepo } from "./invites/repo.js";
import { createCampaignInvitesRouter, createInviteRedeemRouter } from "./invites/router.js";

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
export function createApp(version: string, db: Database.Database): Express {
  const app = express();
  const authRepo = createAuthRepo(db);

  app.use(securityHeaders);
  app.use("/api", createGlobalRateLimiter());
  /**
   * Content-pack uploads get a 5 MB body limit (docs/SECURITY.md section 7);
   * everything else stays at 1 MB. This router-specific parser must be
   * mounted before the general one below: body-parser skips re-parsing a
   * request whose body it already consumed, so registration order is what
   * makes the wider limit apply only to this path.
   */
  app.use("/api/content-packs", express.json({ limit: "5mb" }));
  app.use(express.json({ limit: "1mb" }));
  app.use(attachUser(authRepo));
  app.use(csrfOriginCheck);

  app.get("/healthz", (_req, res) => {
    res.json(HealthzResponseSchema.parse({ status: "ok", version }));
  });

  const campaignsRepo = createCampaignsRepo(db);
  const invitesRepo = createInvitesRepo(db);

  app.use("/api/auth", createAuthRouter(authRepo));
  app.use("/api/content-packs", requireAuth, createContentPacksRouter(db));
  app.use(
    "/api/campaigns/:campaignId/invites",
    requireAuth,
    createCampaignInvitesRouter(campaignsRepo, invitesRepo)
  );
  app.use("/api/campaigns", requireAuth, createCampaignsRouter(campaignsRepo));
  app.use("/api/invites", requireAuth, createInviteRedeemRouter(campaignsRepo, invitesRepo));

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
