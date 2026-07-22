import type { ContentPack, MigrationRequest, MigrationRequestStatus, MigrationRequestSummary } from "@mowc/shared";
import { GLOSS } from "./glossary.js";
import { packsContainPlaybook } from "./character-sheet.js";

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

/**
 * The hunter-facing initiation fork (docs/adr/0003 Decision 1): whether
 * moving to `destinationCampaignId` should become a held, Keeper-approved
 * pack-transfer request instead of an immediate `/migrate` call. A
 * standalone destination (`null`) never requires approval, there is no
 * destination Keeper to ask, so this is always false for it regardless of
 * `destinationPacks`.
 */
export function requiresPackApproval(
  destinationCampaignId: string | null,
  destinationPacks: ContentPack[],
  playbookId: string
): boolean {
  return destinationCampaignId !== null && !packsContainPlaybook(destinationPacks, playbookId);
}

/** The 0.15.4 non-blocking notice shown once a destination is chosen, mirroring
 * the 0.14.5 pack-warning pattern but forked in wording by ADR 0003 Decision 1:
 * a campaign missing the pack now sends a request rather than moving sparse. */
export function destinationPackNotice(destinationIsStandalone: boolean): string {
  return destinationIsStandalone
    ? "Your standalone space doesn't have the content pack this character's playbook comes from, so parts of the sheet may look sparse until you add it."
    : `This campaign's ${GLOSS.keeper} doesn't have the content pack your playbook comes from yet. Moving here will send them a request to approve; once they approve it, the pack comes in with the character and the move completes.`;
}

/**
 * Maps a hunter's own migration request status to the status-banner variant
 * the character sheet should render (docs/adr/0003 Decision 7). `approved`
 * and `denied`/`expired` are collapsed to their own banner kind; `expired`
 * reads identically to `denied` since both are terminal and offer the same
 * deny fallback (docs/SYNC.md "Migration requiring Keeper-approved pack
 * transfer").
 */
export type MigrationBannerKind = "pending" | "approved" | "denied";

export function migrationBannerKind(status: MigrationRequestStatus): MigrationBannerKind {
  switch (status) {
    case "pending":
      return "pending";
    case "approved":
      return "approved";
    case "denied":
    case "expired":
      return "denied";
  }
}

/** Original-wording copy for each status-banner state (docs/adr/0003 Decision 7). */
export function pendingRequestMessage(request: MigrationRequest): string {
  return (
    `This character is waiting on the destination campaign's ${GLOSS.keeper} to approve bringing in ` +
    `"${request.packName}". It stays here, fully playable, until they decide.`
  );
}

export function approvedRequestMessage(request: MigrationRequest): string {
  return `Your Keeper approved bringing in "${request.packName}". Taking you to the character's new home...`;
}

export function deniedRequestMessage(request: MigrationRequest): string {
  return (
    `The destination campaign's Keeper couldn't bring in "${request.packName}" this time, so the move didn't ` +
    "happen. You can still move the character there without the pack: the sheet will show the playbook " +
    "layout, move names, and gear labels, but not the pack's full text until a pack defining the playbook is " +
    "attached there."
  );
}
