import { describe, expect, it } from "vitest";
import type { SeatRole } from "@mowc/shared";
import { createAuthz } from "./index.js";

const CAMPAIGN = "11111111-1111-4111-8111-111111111111";
const OTHER_CAMPAIGN = "22222222-2222-4222-8222-222222222222";
const KEEPER = "keeper-user";
const HUNTER = "hunter-user";
const OUTSIDER = "outsider-user";

/** Fake seat table: only roleOf is exercised by the authz module. */
function fakeCampaigns(seats: Record<string, SeatRole>) {
  return {
    roleOf(campaignId: string, userId: string): SeatRole | undefined {
      return seats[`${campaignId}:${userId}`];
    }
  };
}

function authzFixture() {
  return createAuthz(
    fakeCampaigns({
      [`${CAMPAIGN}:${KEEPER}`]: "keeper",
      [`${CAMPAIGN}:${HUNTER}`]: "hunter"
    })
  );
}

describe("roleFor", () => {
  it("resolves keeper, hunter, and non-member", () => {
    const authz = authzFixture();
    expect(authz.roleFor(CAMPAIGN, KEEPER)).toBe("keeper");
    expect(authz.roleFor(CAMPAIGN, HUNTER)).toBe("hunter");
    expect(authz.roleFor(CAMPAIGN, OUTSIDER)).toBe("none");
  });

  it("does not leak a role across campaigns", () => {
    const authz = authzFixture();
    expect(authz.roleFor(OTHER_CAMPAIGN, KEEPER)).toBe("none");
    expect(authz.roleFor(OTHER_CAMPAIGN, HUNTER)).toBe("none");
  });
});

describe("canReadCampaign", () => {
  it("allows any member and denies a non-member", () => {
    const authz = authzFixture();
    expect(authz.canReadCampaign(CAMPAIGN, KEEPER)).toBe(true);
    expect(authz.canReadCampaign(CAMPAIGN, HUNTER)).toBe(true);
    expect(authz.canReadCampaign(CAMPAIGN, OUTSIDER)).toBe(false);
  });
});

describe("canManageCampaign", () => {
  it("allows only the Keeper", () => {
    const authz = authzFixture();
    expect(authz.canManageCampaign(CAMPAIGN, KEEPER)).toBe(true);
    expect(authz.canManageCampaign(CAMPAIGN, HUNTER)).toBe(false);
    expect(authz.canManageCampaign(CAMPAIGN, OUTSIDER)).toBe(false);
  });
});

describe("canView", () => {
  it("lets the Keeper view every entity regardless of owner or revealed", () => {
    const authz = authzFixture();
    expect(
      authz.canView({ campaignId: CAMPAIGN, userId: KEEPER, ownerUserId: HUNTER, revealed: false })
    ).toBe(true);
  });

  it("lets a hunter view their own entity even when not revealed", () => {
    const authz = authzFixture();
    expect(
      authz.canView({ campaignId: CAMPAIGN, userId: HUNTER, ownerUserId: HUNTER, revealed: false })
    ).toBe(true);
  });

  it("lets a hunter view a revealed entity they do not own", () => {
    const authz = authzFixture();
    expect(
      authz.canView({ campaignId: CAMPAIGN, userId: HUNTER, ownerUserId: KEEPER, revealed: true })
    ).toBe(true);
  });

  it("denies a hunter an unrevealed entity they do not own", () => {
    const authz = authzFixture();
    expect(
      authz.canView({ campaignId: CAMPAIGN, userId: HUNTER, ownerUserId: KEEPER, revealed: false })
    ).toBe(false);
    expect(authz.canView({ campaignId: CAMPAIGN, userId: HUNTER, ownerUserId: KEEPER })).toBe(false);
  });

  it("denies a non-member everything", () => {
    const authz = authzFixture();
    expect(
      authz.canView({ campaignId: CAMPAIGN, userId: OUTSIDER, ownerUserId: OUTSIDER, revealed: true })
    ).toBe(false);
  });

  it("denies a hunter viewing an entity in another campaign", () => {
    const authz = authzFixture();
    expect(
      authz.canView({ campaignId: OTHER_CAMPAIGN, userId: HUNTER, ownerUserId: HUNTER, revealed: true })
    ).toBe(false);
  });
});

describe("canEdit", () => {
  it("lets the Keeper edit every entity", () => {
    const authz = authzFixture();
    expect(authz.canEdit({ campaignId: CAMPAIGN, userId: KEEPER, ownerUserId: HUNTER })).toBe(true);
  });

  it("lets a hunter edit only their own entity", () => {
    const authz = authzFixture();
    expect(authz.canEdit({ campaignId: CAMPAIGN, userId: HUNTER, ownerUserId: HUNTER })).toBe(true);
    expect(authz.canEdit({ campaignId: CAMPAIGN, userId: HUNTER, ownerUserId: KEEPER })).toBe(false);
  });

  it("does not let revealed grant a hunter edit rights", () => {
    const authz = authzFixture();
    expect(
      authz.canEdit({ campaignId: CAMPAIGN, userId: HUNTER, ownerUserId: KEEPER, revealed: true })
    ).toBe(false);
  });

  it("denies a hunter editing an ownerless Keeper entity", () => {
    const authz = authzFixture();
    expect(authz.canEdit({ campaignId: CAMPAIGN, userId: HUNTER })).toBe(false);
  });

  it("denies a non-member editing anything", () => {
    const authz = authzFixture();
    expect(authz.canEdit({ campaignId: CAMPAIGN, userId: OUTSIDER, ownerUserId: OUTSIDER })).toBe(false);
  });

  it("denies a keeper editing across campaigns", () => {
    const authz = authzFixture();
    expect(authz.canEdit({ campaignId: OTHER_CAMPAIGN, userId: KEEPER, ownerUserId: KEEPER })).toBe(false);
  });
});
