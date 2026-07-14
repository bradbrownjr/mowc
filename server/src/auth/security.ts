import { randomBytes, createHash } from "node:crypto";
import argon2 from "argon2";

/** docs/SECURITY.md section 2: Argon2id, package defaults. */
export function hashPassword(password: string): Promise<string> {
  return argon2.hash(password, { type: argon2.argon2id });
}

export function verifyPassword(hash: string, password: string): Promise<boolean> {
  return argon2.verify(hash, password);
}

/**
 * Random hex-encoded bearer token (session cookies, invite codes). Never
 * persisted raw; callers store hashToken(token) and compare hashes.
 */
export function generateToken(bytes = 32): string {
  return randomBytes(bytes).toString("hex");
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}
