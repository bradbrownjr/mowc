import {
  MigrationRequestSchema,
  MigrationRequestSummarySchema,
  CharacterMigrateResponseSchema,
  type MigrationRequestCreate,
  type MigrationRequest,
  type MigrationRequestSummary,
  type CharacterMigrateResponse
} from "@mowc/shared";
import { ApiError, throwApiError } from "./http.js";

export { ApiError as MigrationRequestApiError };

/**
 * Client wrapper for Keeper-approved pack transfer on migration
 * (docs/adr/0003-pack-transfer-approval.md, docs/SYNC.md "Migration requiring
 * Keeper-approved pack transfer"). All six endpoints are exposed here even
 * though the Keeper approval dialog (0.15.3) only drives the three
 * Keeper-facing ones (list/approve/deny): the hunter-facing create/latest/
 * cancel calls are built complete so the hunter-side create flow and
 * deny-fallback (0.15.4) import this module rather than duplicating it.
 *
 * These are plain foreground REST calls, never oplog ops: a migration
 * request cannot be usefully acted on offline by either party (docs/SYNC.md),
 * matching AGENTS.md rule 2's Keeper-admin-online-only carve-out.
 */

/** Duck-typed against zod's ZodType so this module never needs to import
 * "zod" directly (client has no direct zod dependency; only @mowc/shared
 * does) while still validating every response the same way conversion.ts's
 * convertPdf does. */
interface SafeParseable<T> {
  safeParse(data: unknown): { success: true; data: T } | { success: false; error: unknown };
}

function parse<T>(schema: SafeParseable<T>, body: unknown, status: number): T {
  const result = schema.safeParse(body);
  if (!result.success) {
    throw new ApiError(status, [{ path: "", message: "server returned an unexpected response" }]);
  }
  return result.data;
}

/** No shared schema exists for this shape (server-only inline literal in
 * migrationRequestRouter.ts); validated by hand instead of importing zod. */
export interface MigrationRequestDenyResponse {
  migrationId: string;
  status: "denied";
}

function parseDenyResponse(body: unknown, status: number): MigrationRequestDenyResponse {
  if (
    typeof body === "object" &&
    body !== null &&
    typeof (body as Record<string, unknown>).migrationId === "string" &&
    (body as Record<string, unknown>).status === "denied"
  ) {
    return body as MigrationRequestDenyResponse;
  }
  throw new ApiError(status, [{ path: "", message: "server returned an unexpected response" }]);
}

/** Owner-facing: create a held request when the destination lacks the
 * character's playbook pack. 201 on a new request, 200 on a same-migrationId
 * replay (ADR 0003 section 4); both return the stored row. */
export async function createMigrationRequest(
  characterId: string,
  input: MigrationRequestCreate
): Promise<MigrationRequest> {
  const res = await fetch(`/api/characters/${encodeURIComponent(characterId)}/migrate-requests`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input)
  });
  if (!res.ok) await throwApiError(res);
  return parse(MigrationRequestSchema, await res.json(), res.status);
}

/** Owner-facing: the hunter's poll for the outcome of their most recent
 * request (any status), or null if none exists. */
export async function getLatestMigrationRequest(characterId: string): Promise<MigrationRequest | null> {
  const res = await fetch(`/api/characters/${encodeURIComponent(characterId)}/migrate-requests/latest`);
  if (!res.ok) await throwApiError(res);
  return parse(MigrationRequestSchema.nullable(), await res.json(), res.status);
}

/** Owner-facing: withdraw a pending request. */
export async function cancelMigrationRequest(
  characterId: string,
  migrationId: string
): Promise<MigrationRequest> {
  const res = await fetch(
    `/api/characters/${encodeURIComponent(characterId)}/migrate-requests/${encodeURIComponent(migrationId)}/cancel`,
    { method: "POST" }
  );
  if (!res.ok) await throwApiError(res);
  return parse(MigrationRequestSchema, await res.json(), res.status);
}

/** Keeper-facing: every pending request targeting this campaign, enriched
 * with characterName/requestedByDisplayName. */
export async function listMigrationRequests(campaignId: string): Promise<MigrationRequestSummary[]> {
  const res = await fetch(`/api/campaigns/${encodeURIComponent(campaignId)}/migrate-requests`);
  if (!res.ok) await throwApiError(res);
  return parse(MigrationRequestSummarySchema.array(), await res.json(), res.status);
}

/** Keeper-facing: attach the carried pack and complete the move, in one
 * server transaction. Returns the same shape as the direct `/migrate`
 * endpoint (ADR 0002), so `applyMigration` (client/src/lib/sync.ts) can
 * re-point local storage without a new response shape. */
export async function approveMigrationRequest(
  campaignId: string,
  migrationId: string
): Promise<CharacterMigrateResponse> {
  const res = await fetch(
    `/api/campaigns/${encodeURIComponent(campaignId)}/migrate-requests/${encodeURIComponent(migrationId)}/approve`,
    { method: "POST" }
  );
  if (!res.ok) await throwApiError(res);
  return parse(CharacterMigrateResponseSchema, await res.json(), res.status);
}

/** Keeper-facing: flip the request to denied. The character is never
 * touched (docs/adr/0003 section 6). */
export async function denyMigrationRequest(
  campaignId: string,
  migrationId: string
): Promise<MigrationRequestDenyResponse> {
  const res = await fetch(
    `/api/campaigns/${encodeURIComponent(campaignId)}/migrate-requests/${encodeURIComponent(migrationId)}/deny`,
    { method: "POST" }
  );
  if (!res.ok) await throwApiError(res);
  return parseDenyResponse(await res.json(), res.status);
}
