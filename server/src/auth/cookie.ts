import { parse, serialize } from "cookie";
import type { Request, Response } from "express";
import { isTls } from "../http/isTls.js";

export const SESSION_COOKIE_NAME = "mowc_session";

export function readSessionToken(req: Request): string | undefined {
  const header = req.headers.cookie;
  if (!header) {
    return undefined;
  }
  return parse(header)[SESSION_COOKIE_NAME];
}

/** httpOnly, SameSite=Lax, Secure when TLS (docs/SECURITY.md section 2). */
export function setSessionCookie(req: Request, res: Response, token: string, expiresAt: string): void {
  res.setHeader(
    "Set-Cookie",
    serialize(SESSION_COOKIE_NAME, token, {
      httpOnly: true,
      sameSite: "lax",
      secure: isTls(req),
      path: "/",
      expires: new Date(expiresAt)
    })
  );
}

export function clearSessionCookie(req: Request, res: Response): void {
  res.setHeader(
    "Set-Cookie",
    serialize(SESSION_COOKIE_NAME, "", {
      httpOnly: true,
      sameSite: "lax",
      secure: isTls(req),
      path: "/",
      maxAge: 0
    })
  );
}
