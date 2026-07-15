/*
 * Reactive session state, mutated in place (not reassigned) so the exported
 * reference stays stable across module boundaries, same pattern as
 * pwa.svelte.ts's installState. `status` distinguishes "haven't checked the
 * server yet" from "checked, logged out" so guarded routes don't redirect to
 * /login before the initial /api/auth/me call resolves.
 *
 * Convention for later campaign-scoped routes (Phase 4.3+ builder wizard
 * etc.): read sessionState.user for "who am I", and campaignId from the
 * route's own params (see client/src/routes/campaigns/[id]/+page.ts) rather
 * than a separate "active campaign" global.
 */
import type { AuthUser, LoginInput, RegisterInput } from "@mowc/shared";
import { login as apiLogin, logout as apiLogout, me as apiMe, register as apiRegister } from "./api/auth.js";

export const sessionState = $state<{ user: AuthUser | null; status: "loading" | "ready" }>({
  user: null,
  status: "loading"
});

let initStarted = false;

/** Idempotent: call once from the root layout on mount. */
export async function initSession(): Promise<void> {
  if (initStarted) return;
  initStarted = true;
  try {
    sessionState.user = await apiMe();
  } catch {
    sessionState.user = null;
  } finally {
    sessionState.status = "ready";
  }
}

export async function login(input: LoginInput): Promise<AuthUser> {
  const user = await apiLogin(input);
  sessionState.user = user;
  return user;
}

export async function register(input: RegisterInput): Promise<AuthUser> {
  const user = await apiRegister(input);
  sessionState.user = user;
  return user;
}

export async function logout(): Promise<void> {
  await apiLogout();
  sessionState.user = null;
}
