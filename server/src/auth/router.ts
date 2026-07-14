import { Router } from "express";
import { LoginInputSchema, RegisterInputSchema } from "@mowc/shared";
import { zodErrorResponse } from "../http/validation.js";
import type { AuthRepo } from "./repo.js";
import { hashPassword, verifyPassword } from "./security.js";
import { clearSessionCookie, readSessionToken, setSessionCookie } from "./cookie.js";
import { requireAuth } from "./middleware.js";
import { createAuthRateLimiter } from "./rateLimit.js";

export function createAuthRouter(repo: AuthRepo): Router {
  const router = Router();
  const authRateLimiter = createAuthRateLimiter();

  router.post("/register", authRateLimiter, async (req, res) => {
    const result = RegisterInputSchema.strict().safeParse(req.body);
    if (!result.success) {
      res.status(400).json(zodErrorResponse(result.error));
      return;
    }

    const email = result.data.email.toLowerCase();
    if (repo.findUserByEmail(email)) {
      res.status(409).json({ errors: [{ path: "email", message: "an account with this email already exists" }] });
      return;
    }

    const passwordHash = await hashPassword(result.data.password);
    const user = repo.createUser({ email, passwordHash, displayName: result.data.displayName });
    const session = repo.createSession(user.id);
    setSessionCookie(req, res, session.token, session.expiresAt);
    res.status(201).json(user);
  });

  router.post("/login", authRateLimiter, async (req, res) => {
    const result = LoginInputSchema.strict().safeParse(req.body);
    if (!result.success) {
      res.status(400).json(zodErrorResponse(result.error));
      return;
    }

    const email = result.data.email.toLowerCase();
    const found = repo.findUserByEmail(email);
    const valid = found ? await verifyPassword(found.passwordHash, result.data.password) : false;
    if (!found || !valid) {
      console.warn(`failed login attempt ip=${req.ip} email=${email}`);
      res.status(401).json({ errors: [{ path: "", message: "invalid email or password" }] });
      return;
    }

    const session = repo.createSession(found.user.id);
    setSessionCookie(req, res, session.token, session.expiresAt);
    res.status(200).json(found.user);
  });

  router.post("/logout", (req, res) => {
    const token = readSessionToken(req);
    if (token) {
      repo.deleteSession(token);
    }
    clearSessionCookie(req, res);
    res.status(204).send();
  });

  router.get("/me", requireAuth, (req, res) => {
    res.json(req.user);
  });

  return router;
}
