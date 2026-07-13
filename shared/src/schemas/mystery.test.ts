import { describe, expect, it } from "vitest";
import { CountdownSchema, CountdownStepSchema, MysterySchema } from "./mystery.js";

const validMystery = {
  id: "00000000-0000-4000-8000-000000000030",
  campaignId: "00000000-0000-4000-8000-000000000010",
  title: "Test Mystery"
};

describe("CountdownStepSchema", () => {
  it("parses a step and defaults done to false", () => {
    const step = CountdownStepSchema.parse({
      label: "Step One",
      text: "A placeholder thing happens."
    });
    expect(step.done).toBe(false);
  });

  it("rejects a non-boolean done", () => {
    expect(() =>
      CountdownStepSchema.parse({ label: "Step One", text: "x", done: "yes" })
    ).toThrow();
  });
});

describe("CountdownSchema", () => {
  it("defaults to empty steps", () => {
    expect(CountdownSchema.parse({}).steps).toEqual([]);
  });
});

describe("MysterySchema", () => {
  it("parses a minimal mystery and applies defaults", () => {
    const mystery = MysterySchema.parse(validMystery);
    expect(mystery.status).toBe("draft");
    expect(mystery.countdown).toEqual({ steps: [] });
    expect(mystery.locationIds).toEqual([]);
    expect(mystery.revealed).toBe(false);
  });

  it("parses a populated mystery", () => {
    const mystery = MysterySchema.parse({
      ...validMystery,
      concept: "A placeholder concept.",
      hook: "A placeholder hook.",
      status: "active",
      countdown: {
        steps: [{ label: "Step One", text: "Placeholder escalation.", done: true }]
      },
      monsterIds: ["00000000-0000-4000-8000-000000000040"],
      keeperNotes: "Placeholder notes.",
      revealed: true
    });
    expect(mystery.countdown.steps[0].done).toBe(true);
  });

  it("rejects an unknown status", () => {
    expect(() => MysterySchema.parse({ ...validMystery, status: "archived" })).toThrow();
  });
});
