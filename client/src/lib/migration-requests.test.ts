import { describe, expect, it } from "vitest";
import type { ContentPack, MigrationRequest, MigrationRequestSummary, PlaybookDef } from "@mowc/shared";
import {
  approvedRequestMessage,
  deniedRequestMessage,
  describeMigrationRequest,
  destinationPackNotice,
  migrationBannerKind,
  pendingRequestMessage,
  requiresPackApproval
} from "./migration-requests.js";

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

const PLAYBOOK: PlaybookDef = {
  id: "playbook-placeholder",
  name: "The Placeholder",
  blurb: "Test-only playbook.",
  ratingsLines: [{ charm: 1, cool: 1, sharp: 2, tough: 0, weird: -1 }],
  luckMax: 7,
  harmTrack: { max: 7, unstableAt: 4 },
  looks: [],
  moves: [],
  movesToPick: 0,
  gearChoices: [],
  improvements: [],
  advancedImprovements: [],
  extras: []
};

const PACK: ContentPack = {
  id: "pack-a",
  name: "Pack A",
  author: "Tester",
  version: "1.0.0",
  playbooks: [PLAYBOOK],
  basicMoves: [],
  monsterTypes: [],
  bystanderTypes: [],
  minionTypes: [],
  locationTypes: [],
  gear: []
};

function request(overrides: Partial<MigrationRequest> = {}): MigrationRequest {
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

describe("requiresPackApproval", () => {
  it("is false for a standalone destination regardless of packs", () => {
    expect(requiresPackApproval(null, [], "playbook-placeholder")).toBe(false);
    expect(requiresPackApproval(null, [PACK], "playbook-missing")).toBe(false);
  });

  it("is false for a campaign destination whose packs already contain the playbook", () => {
    expect(requiresPackApproval("campaign-1", [PACK], "playbook-placeholder")).toBe(false);
  });

  it("is true for a campaign destination whose packs lack the playbook", () => {
    expect(requiresPackApproval("campaign-1", [PACK], "playbook-missing")).toBe(true);
  });

  it("is true for a campaign destination with no packs at all", () => {
    expect(requiresPackApproval("campaign-1", [], "playbook-placeholder")).toBe(true);
  });
});

describe("destinationPackNotice", () => {
  it("gives the sparse-sheet warning for a standalone destination", () => {
    expect(destinationPackNotice(true)).toMatch(/standalone space/);
  });

  it("gives the approval-required notice for a campaign destination, glossing Keeper", () => {
    const text = destinationPackNotice(false);
    expect(text).toContain("Keeper (the person running the game)");
    expect(text).toMatch(/request to approve/);
  });
});

describe("migrationBannerKind", () => {
  it("maps pending to pending", () => {
    expect(migrationBannerKind("pending")).toBe("pending");
  });

  it("maps approved to approved", () => {
    expect(migrationBannerKind("approved")).toBe("approved");
  });

  it("maps denied and expired both to denied", () => {
    expect(migrationBannerKind("denied")).toBe("denied");
    expect(migrationBannerKind("expired")).toBe("denied");
  });
});

describe("status banner copy", () => {
  it("pendingRequestMessage names the carried pack", () => {
    expect(pendingRequestMessage(request())).toMatch(/"The Placeholder Pack"/);
  });

  it("approvedRequestMessage names the carried pack", () => {
    expect(approvedRequestMessage(request({ status: "approved" }))).toMatch(/"The Placeholder Pack"/);
  });

  it("deniedRequestMessage names the carried pack and explains the move-without-pack fallback", () => {
    const text = deniedRequestMessage(request({ status: "denied" }));
    expect(text).toMatch(/"The Placeholder Pack"/);
    expect(text).toMatch(/without the pack/);
  });
});
