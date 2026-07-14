import { randomBytes, createHash } from "node:crypto";
import argon2 from "argon2";

/** docs/SECURITY.md section 2: Argon2id, package defaults. */
export function hashPassword(password: string): Promise<string> {
  return argon2.hash(password, { type: argon2.argon2id });
}

export function verifyPassword(hash: string, password: string): Promise<boolean> {
  return argon2.verify(hash, password);
}

/** Random 256-bit session token, hex-encoded. Never persisted raw. */
export function generateSessionToken(): string {
  return randomBytes(32).toString("hex");
}

export function hashSessionToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}
