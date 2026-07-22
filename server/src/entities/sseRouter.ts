import { Router, type Request, type Response } from "express";
import { UuidSchema } from "@mowc/shared";
import type { Authz } from "../authz/index.js";
import type { CampaignEventBus } from "./events.js";
import type { EntitiesRepo } from "./repo.js";

/**
 * Server-Sent Events stream for one campaign (ROADMAP 0.6.1,
 * docs/ARCHITECTURE.md). `GET /api/campaigns/:campaignId/events` holds a
 * long-lived `text/event-stream` connection open and emits a bare `sync` event
 * (carrying only the bucket's current `seq`) whenever a committed push or
 * migration advances that campaign's seq. The client reacts by running its
 * normal authz-filtered `pull`, so nothing here decides what a hunter may see;
 * an unrevealed entity can never leak through the stream because the stream
 * carries no entity data (docs/SYNC.md invariant 4).
 *
 * Auth is the session cookie only (docs/SECURITY.md section 2, "never via
 * query-string tokens"); the route sits behind requireAuth. A non-seated user
 * is refused with 403 before any stream is opened.
 */

/** docs/SECURITY.md section 4: at most 5 concurrent streams per user. */
const MAX_STREAMS_PER_USER = 5;
/** Keepalive comment interval so proxies do not drop an idle connection. */
const HEARTBEAT_MS = 30_000;

function writeEvent(res: Response, name: string, seq: number): void {
  // `id:` lets EventSource remember the last seq and send it back as
  // Last-Event-ID on reconnect; `data:` carries the current seq. The client
  // only needs the wake, so the value is informational.
  res.write(`id: ${seq}\nevent: ${name}\ndata: ${JSON.stringify({ seq })}\n\n`);
}

export function createCampaignEventsRouter(
  repo: EntitiesRepo,
  authz: Authz,
  bus: CampaignEventBus
): Router {
  const router = Router({ mergeParams: true });
  // Per-user open-connection tally, enforcing the per-user stream cap. Lives in
  // this factory's closure so it is created once per app (per test), like the
  // rate limiters.
  const openPerUser = new Map<string, number>();

  router.get("/", (req: Request, res: Response) => {
    const idResult = UuidSchema.safeParse(req.params["campaignId"]);
    if (!idResult.success) {
      res.status(400).json({ errors: [{ path: "campaignId", message: "invalid campaign id" }] });
      return;
    }
    const campaignId = idResult.data;
    const userId = req.user!.id;
    if (!authz.canReadCampaign(campaignId, userId)) {
      res.status(403).json({ errors: [{ path: "", message: "not a member of this campaign" }] });
      return;
    }

    const open = openPerUser.get(userId) ?? 0;
    if (open >= MAX_STREAMS_PER_USER) {
      res.status(429).json({ errors: [{ path: "", message: "too many open event streams" }] });
      return;
    }
    openPerUser.set(userId, open + 1);

    res.status(200);
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    // Disable proxy response buffering (this app runs behind a reverse proxy per
    // MOWC_TRUST_PROXY); without this, nginx/etc. buffer the stream and events
    // never reach the client until the connection closes.
    res.setHeader("X-Accel-Buffering", "no");
    res.flushHeaders();

    // Emit an initial event on connect so the client always pulls to catch up on
    // whatever it missed while disconnected (docs/SYNC.md "on SSE reconnect").
    // EventSource resends Last-Event-ID on reconnect, but since we always nudge
    // on connect the client converges regardless of its value.
    writeEvent(res, "sync", repo.maxSeq(campaignId));

    const unsubscribe = bus.subscribe(campaignId, (seq) => writeEvent(res, "sync", seq));
    const heartbeat = setInterval(() => res.write(": ping\n\n"), HEARTBEAT_MS);

    let released = false;
    const cleanup = (): void => {
      if (released) {
        return;
      }
      released = true;
      clearInterval(heartbeat);
      unsubscribe();
      const remaining = (openPerUser.get(userId) ?? 1) - 1;
      if (remaining <= 0) {
        openPerUser.delete(userId);
      } else {
        openPerUser.set(userId, remaining);
      }
    };
    req.on("close", cleanup);
  });

  return router;
}
