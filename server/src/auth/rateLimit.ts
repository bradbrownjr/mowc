import rateLimit, { type Options } from "express-rate-limit";
import type { Request, Response } from "express";

/** docs/SECURITY.md section 4: log every 429 with the client IP. */
function loggedHandler(req: Request, res: Response): void {
  console.warn(`429 rate limit exceeded ip=${req.ip} path=${req.path}`);
  res.status(429).json({ errors: [{ path: "", message: "too many requests" }] });
}

function limiter(options: Pick<Options, "windowMs" | "limit">): ReturnType<typeof rateLimit> {
  return rateLimit({
    ...options,
    standardHeaders: true,
    legacyHeaders: false,
    handler: loggedHandler
  });
}

/**
 * Factories, not shared instances: each carries its own in-memory counter,
 * and createApp() must call these fresh per app so independent app
 * instances (notably one per test) don't share rate-limit state.
 */

/** Global bucket: 300 requests/min/IP. */
export function createGlobalRateLimiter(): ReturnType<typeof rateLimit> {
  return limiter({ windowMs: 60_000, limit: 300 });
}

/** Login/register bucket: 10 requests/min/IP. */
export function createAuthRateLimiter(): ReturnType<typeof rateLimit> {
  return limiter({ windowMs: 60_000, limit: 10 });
}

/** Invite redemption bucket: 10 requests/min/IP. */
export function createInviteRateLimiter(): ReturnType<typeof rateLimit> {
  return limiter({ windowMs: 60_000, limit: 10 });
}

/**
 * Sync push bucket: 60 requests/min per authenticated user (docs/SECURITY.md
 * section 4). Keyed by user id (the route is behind requireAuth) rather than
 * IP, so several players behind one NAT are not throttled together. The 500-op
 * batch cap is enforced separately by SyncPushRequestSchema.
 */
export function createSyncPushRateLimiter(): ReturnType<typeof rateLimit> {
  return rateLimit({
    windowMs: 60_000,
    limit: 60,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req: Request) => req.user?.id ?? "anonymous",
    handler: loggedHandler
  });
}

/**
 * Character migration bucket: 30 migrations/hour per authenticated user
 * (docs/SECURITY.md section 4, ADR 0002). Keyed by user id (the route is behind
 * requireAuth). Each call writes two rows across two buckets, so it gets its own
 * strict bucket separate from ordinary sync push.
 */
export function createMigrationRateLimiter(): ReturnType<typeof rateLimit> {
  return rateLimit({
    windowMs: 60 * 60_000,
    limit: 30,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req: Request) => req.user?.id ?? "anonymous",
    handler: loggedHandler
  });
}

/**
 * PDF conversion bucket: 10 conversions/hour per authenticated user
 * (docs/SECURITY.md section 4, ADR 0001). Keyed by user id (admin-only route
 * behind requireAuth). Single-flight concurrency is enforced separately in the
 * router.
 */
export function createConversionRateLimiter(): ReturnType<typeof rateLimit> {
  return rateLimit({
    windowMs: 60 * 60_000,
    limit: 10,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req: Request) => req.user?.id ?? "anonymous",
    handler: loggedHandler
  });
}
