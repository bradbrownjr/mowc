import { describe, expect, it } from "vitest";
import type { LocalEntity } from "./db.js";
import { groupOwnCharacters } from "./my-characters.js";

function entity(overrides: Partial<LocalEntity> & { payload: Record<string, unknown> }): LocalEntity {
  return {
    id: overrides.id ?? "e1",
    campaignId: overrides.campaignId ?? "bucket",
    type: overrides.type ?? "character",
    payload: overrides.payload,
    rev: 1,
    seq: 1,
    updatedAt: "2026-07-19T00:00:00.000Z",
    deleted: overrides.deleted ?? false
  };
}

function character(name: string, ownerUserId: string, campaignId: string | null): Record<string, unknown> {
  return { id: `char-${name}`, name, ownerUserId, campaignId, playbookId: "pb" };
}

const NAMES = new Map([
  ["camp-b", "Beta Case"],
  ["camp-a", "Alpha Case"]
]);

describe("groupOwnCharacters", () => {
  it("groups by campaign, sorts campaigns by label, and puts Standalone last", () => {
    const entities = [
      entity({ id: "1", payload: character("Nadia", "me", "camp-b") }),
      entity({ id: "2", payload: character("Sol", "me", "camp-a") }),
      entity({ id: "3", payload: character("Rin", "me", null) })
    ];
    const groups = groupOwnCharacters(entities, "me", NAMES);
    expect(groups.map((g) => g.label)).toEqual(["Alpha Case", "Beta Case", "Standalone"]);
    expect(groups[2]!.campaignId).toBeNull();
  });

  it("excludes characters owned by other users and deleted rows", () => {
    const entities = [
      entity({ id: "1", payload: character("Mine", "me", "camp-a") }),
      entity({ id: "2", payload: character("Theirs", "other", "camp-a") }),
      entity({ id: "3", deleted: true, payload: character("Gone", "me", "camp-a") })
    ];
    const groups = groupOwnCharacters(entities, "me", NAMES);
    expect(groups).toHaveLength(1);
    expect(groups[0]!.characters.map((c) => c.name)).toEqual(["Mine"]);
  });

  it("ignores non-character entities and sorts characters within a group by name", () => {
    const entities = [
      entity({ id: "1", type: "monster", payload: character("Beast", "me", "camp-a") }),
      entity({ id: "2", payload: character("Zed", "me", "camp-a") }),
      entity({ id: "3", payload: character("Ada", "me", "camp-a") })
    ];
    const groups = groupOwnCharacters(entities, "me", NAMES);
    expect(groups).toHaveLength(1);
    expect(groups[0]!.characters.map((c) => c.name)).toEqual(["Ada", "Zed"]);
  });

  it("labels a campaign with no known name as Unknown campaign", () => {
    const entities = [entity({ id: "1", payload: character("Lost", "me", "camp-x") })];
    const groups = groupOwnCharacters(entities, "me", NAMES);
    expect(groups[0]!.label).toBe("Unknown campaign");
  });
});
