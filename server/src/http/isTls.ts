import type { Request } from "express";

/** True if the request arrived over TLS, directly or via a reverse proxy. */
export function isTls(req: Request): boolean {
  return req.secure || req.get("x-forwarded-proto") === "https";
}
