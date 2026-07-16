import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import express, { type Express } from "express";
import type Database from "better-sqlite3";
import { HealthzResponseSchema } from "@mowc/shared";
import { securityHeaders } from "./http/securityHeaders.js";
import { createContentPacksRouter, createPackReadableCheck } from "./api/contentPacks.js";
import { createConversionRouter } from "./api/conversion/router.js";
import { attachUser, csrfOriginCheck, requireAdmin, requireAuth } from "./auth/middleware.js";
import { createAuthRepo } from "./auth/repo.js";
import { createAuthRouter } from "./auth/router.js";
import { createGlobalRateLimiter } from "./auth/rateLimit.js";
import { createCampaignsRepo } from "./campaigns/repo.js";
import { createCampaignsRouter } from "./campaigns/router.js";
import { createAuthz } from "./authz/index.js";
import { createInvitesRepo } from "./invites/repo.js";
import { createCampaignInvitesRouter, createInviteRedeemRouter } from "./invites/router.js";
import { createEntitiesRepo } from "./entities/repo.js";
import { createSyncRouter } from "./entities/router.js";

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
export function createApp(version: string, db: Database.Database, adminEmail?: string): Express {
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
  const entitiesRepo = createEntitiesRepo(db);
  const authz = createAuthz(campaignsRepo);

  app.use("/api/auth", createAuthRouter(authRepo, adminEmail));
  app.use("/api/content-packs", requireAuth, createContentPacksRouter(db, campaignsRepo, adminEmail));
  /**
   * The admin PDF conversion endpoint takes a raw PDF body (ADR 0001), not
   * JSON (the global JSON parser above only consumes application/json, so it
   * never touches the PDF bytes). The 25 MB raw parser sits AFTER requireAuth
   * and requireAdmin so an unauthenticated or non-admin request is rejected
   * before its body is ever buffered. An over-limit body makes express.raw
   * throw, which Express renders as 413.
   */
  app.use(
    "/api/admin/conversions",
    requireAuth,
    requireAdmin(adminEmail),
    express.raw({ type: "application/pdf", limit: "25mb" }),
    createConversionRouter(adminEmail)
  );
  app.use(
    "/api/campaigns/:campaignId/invites",
    requireAuth,
    createCampaignInvitesRouter(invitesRepo, authz)
  );
  app.use("/api/campaigns", requireAuth, createCampaignsRouter(campaignsRepo, authz, createPackReadableCheck(db)));
  app.use("/api/invites", requireAuth, createInviteRedeemRouter(campaignsRepo, invitesRepo));
  app.use("/api/sync/:campaignId", requireAuth, createSyncRouter(entitiesRepo, authz));

  if (existsSync(CLIENT_DIR)) {
    app.use(express.static(CLIENT_DIR));
    app.use((req, res, next) => {
      if (req.method !== "GET") {
        next();
        return;
      }
      // 200.html, not index.html: adapter-static's dedicated SPA fallback
      // uses absolute /_app/... asset paths (index.html's are relative,
      // correct only when served from the site root). A GET at any nested
      // route (e.g. a bookmarked /campaigns/:id) served index.html's
      // relative paths, which resolve wrong at depth and silently break
      // the whole client bundle.
      res.sendFile(path.join(CLIENT_DIR, "200.html"));
    });
  }

  return app;
}
