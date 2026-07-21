import type { MigrationRequestSummary } from "@mowc/shared";

/**
 * Pure copy helper for the Keeper approval dialog (docs/adr/0003-pack-transfer-approval.md,
 * ROADMAP 0.15.3). Extracted so the wording is unit-tested without mounting the
 * Svelte component. Original wording only (AGENTS.md rule 1): never game text.
 */
export function describeMigrationRequest(request: MigrationRequestSummary): string {
  return (
    `${request.characterName} (played by ${request.requestedByDisplayName}) wants to move into ` +
    `this campaign, bringing the content pack "${request.packName}".`
  );
}
