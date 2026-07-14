import type { NextFunction, Request, Response } from "express";
import type { User } from "@mowc/shared";
import type { AuthRepo } from "./repo.js";
import { readSessionToken } from "./cookie.js";

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: User;
    }
  }
}

/** Attaches req.user when a valid session cookie is present; never rejects. */
export function attachUser(repo: AuthRepo) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const token = readSessionToken(req);
    if (token) {
      const user = repo.touchSession(token);
      if (user) {
        req.user = user;
      }
    }
    next();
  };
}

/** Rejects with 401 unless attachUser already found a valid session. */
export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  if (!req.user) {
    res.status(401).json({ errors: [{ path: "", message: "authentication required" }] });
    return;
  }
  next();
}

const UNSAFE_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

/**
 * docs/SECURITY.md section 2: state-changing routes verify the Origin
 * header matches the request's own host. Requests with no Origin/Referer
 * are allowed (non-browser callers cannot be tricked into a cookie-CSRF
 * flow; pattern copied from tangible). SameSite=Lax is the second layer.
 */
export function csrfOriginCheck(req: Request, res: Response, next: NextFunction): void {
  if (!UNSAFE_METHODS.has(req.method)) {
    next();
    return;
  }

  const origin = req.get("origin") ?? req.get("referer");
  if (!origin) {
    next();
    return;
  }

  let originHost: string;
  try {
    originHost = new URL(origin).hostname.toLowerCase();
  } catch {
    res.status(403).json({ errors: [{ path: "", message: "invalid Origin header" }] });
    return;
  }

  if (originHost === req.hostname.toLowerCase()) {
    next();
    return;
  }

  res.status(403).json({ errors: [{ path: "", message: "cross-origin request blocked" }] });
}
