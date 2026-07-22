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
import { createCampaignEventBus } from "./entities/events.js";
import { createCampaignEventsRouter } from "./entities/sseRouter.js";
import {
  createCharacterMigrationRouter,
  createStandaloneSyncRouter,
  createSyncRouter
} from "./entities/router.js";
import { createMigrationRequestsRepo } from "./entities/migrationRequests.js";
import {
  createKeeperMigrationRequestsRouter,
  createOwnerMigrationRequestsRouter
} from "./entities/migrationRequestRouter.js";

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
  /**
   * A migration request carries a full copied ContentPack (ADR 0003), so its
   * create body gets the same 5 MB limit content-pack uploads get, scoped to
   * this path and mounted (like the content-packs parser above) before the
   * general 1 MB parser so body-parser applies the wider limit only here.
   */
  app.use("/api/characters/:characterId/migrate-requests", express.json({ limit: "5mb" }));
  app.use(express.json({ limit: "1mb" }));
  app.use(attachUser(authRepo));
  app.use(csrfOriginCheck);

  app.get("/healthz", (_req, res) => {
    res.json(HealthzResponseSchema.parse({ status: "ok", version }));
  });

  const campaignsRepo = createCampaignsRepo(db);
  const invitesRepo = createInvitesRepo(db);
  const entitiesRepo = createEntitiesRepo(db);
  const migrationRequestsRepo = createMigrationRequestsRepo(db, entitiesRepo, adminEmail);
  const authz = createAuthz(campaignsRepo);
  // Live-play event bus (ROADMAP 0.6.1): a committed push or migration publishes
  // its bucket's new seq here; open SSE connections for that campaign wake and
  // pull. One instance per app so tests stay isolated.
  const eventBus = createCampaignEventBus();

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
  // Live table play (ROADMAP 0.6.1): a per-campaign SSE stream. Its own nested
  // base (like invites) so it is never parsed as the campaigns router's "/:id".
  // Auth via the session cookie only (docs/SECURITY.md section 2); a non-member
  // is refused before any stream opens.
  app.use(
    "/api/campaigns/:campaignId/events",
    requireAuth,
    createCampaignEventsRouter(entitiesRepo, authz, eventBus)
  );
  // Keeper-facing pack-transfer approval (ADR 0003): list/approve/deny pending
  // migration requests targeting this campaign. Mounted at its own nested base
  // (like invites) so it is never parsed as the campaigns router's "/:id".
  app.use(
    "/api/campaigns/:campaignId/migrate-requests",
    requireAuth,
    createKeeperMigrationRequestsRouter(migrationRequestsRepo, authz)
  );
  app.use("/api/campaigns", requireAuth, createCampaignsRouter(campaignsRepo, authz, createPackReadableCheck(db)));
  app.use("/api/invites", requireAuth, createInviteRedeemRouter(campaignsRepo, invitesRepo));
  // Character migration between buckets (ADR 0002): a dedicated, owner-only,
  // transactional move, NOT a sync/oplog op (it spans two buckets). Mounted
  // under /api/characters, clearly separate from the per-bucket sync core.
  app.use("/api/characters", requireAuth, createCharacterMigrationRouter(entitiesRepo, authz, eventBus));
  // Owner-facing pack-transfer approval (ADR 0003): create/poll/cancel a held
  // migration request. Distinct paths from /migrate above, so both routers at
  // /api/characters fall through cleanly.
  app.use(
    "/api/characters",
    requireAuth,
    createOwnerMigrationRequestsRouter(migrationRequestsRepo, entitiesRepo, authz)
  );
  // Standalone (campaign-less) character sync, bucketed by the owner's user id.
  // Mounted before the :campaignId route so "standalone" is never parsed as a
  // campaign id (docs/SYNC.md "Standalone characters").
  app.use("/api/sync/standalone", requireAuth, createStandaloneSyncRouter(entitiesRepo));
  app.use("/api/sync/:campaignId", requireAuth, createSyncRouter(entitiesRepo, authz, eventBus));

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
