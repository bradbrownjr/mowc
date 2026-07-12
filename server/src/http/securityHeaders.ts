import type { NextFunction, Request, Response } from "express";

/**
 * Global HTTP security headers required by docs/SECURITY.md section 5
 * (Phase 1 security gate). Applied before any route.
 */
export function securityHeaders(req: Request, res: Response, next: NextFunction): void {
  res.setHeader("Content-Security-Policy", "default-src 'self'; img-src 'self' data:; connect-src 'self'");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");

  const isTls = req.secure || req.get("x-forwarded-proto") === "https";
  if (isTls) {
    res.setHeader("Strict-Transport-Security", "max-age=63072000; includeSubDomains");
  }

  next();
}
