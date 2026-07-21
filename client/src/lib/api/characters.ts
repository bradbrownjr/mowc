import type { CharacterMigrateRequest, CharacterMigrateResponse } from "@mowc/shared";
import { throwApiError } from "./http.js";

/**
 * Moves a character to another bucket (ADR 0002). NOT a sync op: this is a
 * foreground request the UI awaits. `input.destinationCampaignId` is null to
 * detach to the owner's standalone space, or a campaign id the owner is seated
 * in. The response carries the fresh id and both client scope keys so the caller
 * can re-point local storage (see `applyMigration` in sync.ts).
 */
export async function migrateCharacter(
  characterId: string,
  input: CharacterMigrateRequest
): Promise<CharacterMigrateResponse> {
  const res = await fetch(`/api/characters/${encodeURIComponent(characterId)}/migrate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input)
  });
  if (!res.ok) await throwApiError(res);
  return res.json() as Promise<CharacterMigrateResponse>;
}
