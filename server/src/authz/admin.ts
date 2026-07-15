import type { User } from "@mowc/shared";

/**
 * The server-owner account, designated by the MOWC_ADMIN_EMAIL env var
 * (docs/SECURITY.md section 7). Not campaign-scoped, so it lives outside
 * createAuthz: it governs the shared content-pack library, not campaign
 * roles. Case-insensitive to match how email lookups already work in
 * server/src/auth/repo.ts.
 */
export function isAdmin(user: User, adminEmail: string | undefined): boolean {
  return adminEmail !== undefined && user.email.toLowerCase() === adminEmail.toLowerCase();
}
