import type { NextFunction, Request, Response } from "express";

/**
 * Global HTTP security headers required by docs/SECURITY.md section 5
 * (Phase 1 security gate). Applied before any route.
 *
 * The header CSP deliberately does not set default-src/script-src/style-src:
 * a header policy and a page's CSP <meta> tag both apply, and the browser
 * enforces their intersection per directive, so any header value here
 * (even via default-src's fallback) would win out over and block whatever
 * the meta tag allows. client/svelte.config.js's kit.csp (mode: "auto")
 * generates that meta tag per page with a hash matching its own inline
 * hydration/theme scripts, computed at build time, since adapter-static has
 * no per-request server to hand out a nonce. frame-ancestors can only be
 * set via a real header (meta tags ignore it), so it stays here.
 */
export function securityHeaders(req: Request, res: Response, next: NextFunction): void {
  res.setHeader("Content-Security-Policy", "frame-ancestors 'none'");
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
