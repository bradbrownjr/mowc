import { describe, expect, it } from "vitest";
import type { ContentPack } from "@mowc/shared";
import {
  buildBystanderPayload,
  buildLocationPayload,
  buildMinionPayload,
  bystanderFormReason,
  flattenBystanderTypes,
  flattenLocationTypes,
  flattenMinionTypes,
  locationFormReason,
  minionFormReason
} from "./world-entity-builder.js";

const MINION_TYPE = { id: "minion-type-1", name: "Test Minion Type", motivation: "to harm" };
const BYSTANDER_TYPE = { id: "bystander-type-1", name: "Test Bystander Type", motivation: "to escape" };
const LOCATION_TYPE = { id: "location-type-1", name: "Test Location Type", motivation: "to loom" };

describe("flattenMinionTypes", () => {
  it("flattens minion types across every pack in order", () => {
    const packA: ContentPack = {
      id: "pack-a",
      name: "Pack A",
      author: "Tester",
      version: "1.0.0",
      playbooks: [],
      basicMoves: [],
      minionTypes: [MINION_TYPE],
      bystanderTypes: [],
      locationTypes: [],
      gear: [],
      monsterTypes: []
    };
    const packB: ContentPack = {
      ...packA,
      id: "pack-b",
      minionTypes: [{ id: "minion-type-2", name: "Another Minion", motivation: "to spread" }]
    };

    expect(flattenMinionTypes([packA, packB]).map((m) => m.id)).toEqual(["minion-type-1", "minion-type-2"]);
  });
});

describe("flattenBystanderTypes", () => {
  it("flattens bystander types across every pack in order", () => {
    const packA: ContentPack = {
      id: "pack-a",
      name: "Pack A",
      author: "Tester",
      version: "1.0.0",
      playbooks: [],
      basicMoves: [],
      minionTypes: [],
      bystanderTypes: [BYSTANDER_TYPE],
      locationTypes: [],
      gear: [],
      monsterTypes: []
    };
    const packB: ContentPack = {
      ...packA,
      id: "pack-b",
      bystanderTypes: [{ id: "bystander-type-2", name: "Another Bystander", motivation: "to survive" }]
    };

    expect(flattenBystanderTypes([packA, packB]).map((b) => b.id)).toEqual(["bystander-type-1", "bystander-type-2"]);
  });
});

describe("flattenLocationTypes", () => {
  it("flattens location types across every pack in order", () => {
    const packA: ContentPack = {
      id: "pack-a",
      name: "Pack A",
      author: "Tester",
      version: "1.0.0",
      playbooks: [],
      basicMoves: [],
      minionTypes: [],
      bystanderTypes: [],
      locationTypes: [LOCATION_TYPE],
      gear: [],
      monsterTypes: []
    };
    const packB: ContentPack = {
      ...packA,
      id: "pack-b",
      locationTypes: [{ id: "location-type-2", name: "Another Location", motivation: "to hide" }]
    };

    expect(flattenLocationTypes([packA, packB]).map((l) => l.id)).toEqual(["location-type-1", "location-type-2"]);
  });
});

describe("buildMinionPayload", () => {
  it("assembles a minion payload with all fields", () => {
    const payload = buildMinionPayload({
      id: "minion-1",
      campaignId: "campaign-1",
      name: "  Test Minion  ",
      typeId: "minion-type-1",
      motivation: "  to destroy  ",
      attacks: [{ name: "Claw", harm: 2, tags: ["brutal"] }],
      armor: 1,
      harmCapacity: 5
    });

    expect(payload).toEqual({
      id: "minion-1",
      campaignId: "campaign-1",
      name: "Test Minion",
      typeId: "minion-type-1",
      motivation: "to destroy",
      attacks: [{ name: "Claw", harm: 2, tags: ["brutal"] }],
      armor: 1,
      harmCapacity: 5,
      harmTaken: 0,
      revealed: false
    });
  });

  it("trims whitespace from name and motivation", () => {
    const payload = buildMinionPayload({
      id: "minion-1",
      campaignId: "campaign-1",
      name: "   ",
      typeId: null,
      motivation: "   ",
      attacks: [],
      armor: 0,
      harmCapacity: 3
    });

    expect(payload.name).toBe("");
    expect(payload.motivation).toBe("");
  });

  it("ensures armor and harmCapacity are non-negative", () => {
    const payload = buildMinionPayload({
      id: "minion-1",
      campaignId: "campaign-1",
      name: "Test",
      typeId: null,
      motivation: "",
      attacks: [],
      armor: -5,
      harmCapacity: -10
    });

    expect(payload.armor).toBe(0);
    expect(payload.harmCapacity).toBe(0);
  });
});

describe("buildBystanderPayload", () => {
  it("assembles a bystander payload with all fields", () => {
    const payload = buildBystanderPayload({
      id: "bystander-1",
      campaignId: "campaign-1",
      name: "  Test Bystander  ",
      typeId: "bystander-type-1",
      motivation: "  to help  ",
      notes: "  Knows the secret  "
    });

    expect(payload).toEqual({
      id: "bystander-1",
      campaignId: "campaign-1",
      name: "Test Bystander",
      typeId: "bystander-type-1",
      motivation: "to help",
      notes: "Knows the secret",
      revealed: false
    });
  });

  it("handles empty optional fields", () => {
    const payload = buildBystanderPayload({
      id: "bystander-1",
      campaignId: "campaign-1",
      name: "Test",
      typeId: null,
      motivation: "",
      notes: ""
    });

    expect(payload.typeId).toBeNull();
    expect(payload.motivation).toBe("");
    expect(payload.notes).toBe("");
  });
});

describe("minionFormReason", () => {
  it("requires a name", () => {
    expect(minionFormReason("", 5)).toMatch(/name/i);
  });

  it("requires harm capacity greater than 0", () => {
    expect(minionFormReason("Ghoul", 0)).toMatch(/harm capacity/i);
    expect(minionFormReason("Ghoul", "")).toMatch(/harm capacity/i);
  });

  it("is null once both are set", () => {
    expect(minionFormReason("Ghoul", 5)).toBeNull();
  });
});

describe("bystanderFormReason", () => {
  it("requires a name, null once set", () => {
    expect(bystanderFormReason("")).toMatch(/name/i);
    expect(bystanderFormReason("Sister Mary")).toBeNull();
  });
});

describe("locationFormReason", () => {
  it("requires a name, null once set", () => {
    expect(locationFormReason("")).toMatch(/name/i);
    expect(locationFormReason("Old Town Hall")).toBeNull();
  });
});

describe("buildLocationPayload", () => {
  it("assembles a location payload with all fields", () => {
    const payload = buildLocationPayload({
      id: "location-1",
      campaignId: "campaign-1",
      name: "  Old Warehouse  ",
      typeId: "location-type-1",
      description: "  A decaying industrial building  ",
      mapNotes: "  Near the docks  "
    });

    expect(payload).toEqual({
      id: "location-1",
      campaignId: "campaign-1",
      name: "Old Warehouse",
      typeId: "location-type-1",
      description: "A decaying industrial building",
      mapNotes: "Near the docks",
      revealed: false
    });
  });

  it("trims all text fields", () => {
    const payload = buildLocationPayload({
      id: "location-1",
      campaignId: "campaign-1",
      name: "Test",
      typeId: null,
      description: "   ",
      mapNotes: "   "
    });

    expect(payload.description).toBe("");
    expect(payload.mapNotes).toBe("");
  });

  it("defaults typeId to null when not selected", () => {
    const payload = buildLocationPayload({
      id: "location-1",
      campaignId: "campaign-1",
      name: "Test",
      typeId: null,
      description: "",
      mapNotes: ""
    });

    expect(payload.typeId).toBeNull();
  });
});
