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
