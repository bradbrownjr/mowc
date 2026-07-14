import { randomUUID } from "node:crypto";
import type Database from "better-sqlite3";
import type { User } from "@mowc/shared";
import { generateSessionToken, hashSessionToken } from "./security.js";

/** 30 days, rolling (docs/SECURITY.md section 2). */
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

interface UserRow {
  id: string;
  email: string;
  password_hash: string;
  display_name: string;
  created_at: string;
  updated_at: string;
}

function toPublicUser(row: UserRow): User {
  return { id: row.id, email: row.email, displayName: row.display_name };
}

export interface AuthRepo {
  createUser(params: { email: string; passwordHash: string; displayName: string }): User;
  findUserByEmail(email: string): { user: User; passwordHash: string } | undefined;
  createSession(userId: string): { token: string; expiresAt: string };
  /** Returns the session's user and rolls the expiry forward, or undefined if absent/expired. */
  touchSession(token: string): User | undefined;
  deleteSession(token: string): void;
}

export function createAuthRepo(db: Database.Database): AuthRepo {
  const insertUser = db.prepare(
    "INSERT INTO users (id, email, password_hash, display_name, created_at, updated_at) " +
      "VALUES (@id, @email, @passwordHash, @displayName, @now, @now)"
  );
  const selectUserByEmail = db.prepare("SELECT * FROM users WHERE email = ?");
  const selectUserById = db.prepare("SELECT * FROM users WHERE id = ?");

  const insertSession = db.prepare(
    "INSERT INTO sessions (token_hash, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)"
  );
  const selectSession = db.prepare("SELECT user_id, expires_at FROM sessions WHERE token_hash = ?");
  const updateSessionExpiry = db.prepare("UPDATE sessions SET expires_at = ? WHERE token_hash = ?");
  const deleteSessionByHash = db.prepare("DELETE FROM sessions WHERE token_hash = ?");

  return {
    createUser({ email, passwordHash, displayName }) {
      const id = randomUUID();
      const now = new Date().toISOString();
      insertUser.run({ id, email, passwordHash, displayName, now });
      return { id, email, displayName };
    },

    findUserByEmail(email) {
      const row = selectUserByEmail.get(email) as UserRow | undefined;
      if (!row) {
        return undefined;
      }
      return { user: toPublicUser(row), passwordHash: row.password_hash };
    },

    createSession(userId) {
      const token = generateSessionToken();
      const expiresAt = new Date(Date.now() + SESSION_TTL_MS).toISOString();
      insertSession.run(hashSessionToken(token), userId, new Date().toISOString(), expiresAt);
      return { token, expiresAt };
    },

    touchSession(token) {
      const tokenHash = hashSessionToken(token);
      const row = selectSession.get(tokenHash) as { user_id: string; expires_at: string } | undefined;
      if (!row || new Date(row.expires_at).getTime() < Date.now()) {
        return undefined;
      }
      const userRow = selectUserById.get(row.user_id) as UserRow | undefined;
      if (!userRow) {
        return undefined;
      }
      const newExpiresAt = new Date(Date.now() + SESSION_TTL_MS).toISOString();
      updateSessionExpiry.run(newExpiresAt, tokenHash);
      return toPublicUser(userRow);
    },

    deleteSession(token) {
      deleteSessionByHash.run(hashSessionToken(token));
    }
  };
}
