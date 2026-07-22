import { describe, expect, it } from "vitest";
import type { MigrationRequestSummary } from "@mowc/shared";
import { describeMigrationRequest } from "./migration-requests.js";

function summary(overrides: Partial<MigrationRequestSummary> = {}): MigrationRequestSummary {
  return {
    migrationId: "550e8400-e29b-41d4-a716-446655440000",
    sourceId: "550e8400-e29b-41d4-a716-446655440001",
    destinationCampaignId: "550e8400-e29b-41d4-a716-446655440002",
    status: "pending",
    packId: "550e8400-e29b-41d4-a716-446655440003",
    packName: "The Placeholder Pack",
    requestedBy: "user-1",
    createdAt: "2026-07-21T00:00:00.000Z",
    decidedAt: null,
    characterName: "Test Hunter",
    requestedByDisplayName: "Placeholder Player",
    ...overrides
  };
}

describe("describeMigrationRequest", () => {
  it("names the character, requester, and carried pack", () => {
    const text = describeMigrationRequest(summary());
    expect(text).toBe(
      'Test Hunter (played by Placeholder Player) wants to move into this campaign, bringing the content pack "The Placeholder Pack".'
    );
  });

  it("reflects a different character/requester/pack combination", () => {
    const text = describeMigrationRequest(
      summary({ characterName: "Another Hunter", requestedByDisplayName: "Someone Else", packName: "Second Pack" })
    );
    expect(text).toBe(
      'Another Hunter (played by Someone Else) wants to move into this campaign, bringing the content pack "Second Pack".'
    );
  });
});
