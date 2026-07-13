import { describe, expect, it } from "vitest";
import { SessionLogEntrySchema, SessionLogSchema } from "./sessionLog.js";

const validEntry = {
  ts: "2026-07-13T12:00:00.000Z",
  userId: "user-hunter-1",
  kind: "roll" as const,
  payload: { rating: "cool", total: 9 }
};

describe("SessionLogEntrySchema", () => {
  it("parses a valid entry", () => {
    expect(SessionLogEntrySchema.parse(validEntry)).toEqual(validEntry);
  });

  it("defaults payload to an empty object", () => {
    const entry = SessionLogEntrySchema.parse({
      ts: "2026-07-13T12:00:00Z",
      userId: "user-keeper-1",
      kind: "note"
    });
    expect(entry.payload).toEqual({});
  });

  it("rejects an unknown kind", () => {
    expect(() => SessionLogEntrySchema.parse({ ...validEntry, kind: "chat" })).toThrow();
  });

  it("rejects a non-ISO timestamp", () => {
    expect(() => SessionLogEntrySchema.parse({ ...validEntry, ts: "yesterday" })).toThrow();
  });
});

describe("SessionLogSchema", () => {
  it("parses a log and defaults entries", () => {
    const log = SessionLogSchema.parse({
      id: "00000000-0000-4000-8000-000000000050",
      campaignId: "00000000-0000-4000-8000-000000000010"
    });
    expect(log.entries).toEqual([]);
  });

  it("parses a log with entries", () => {
    const log = SessionLogSchema.parse({
      id: "00000000-0000-4000-8000-000000000050",
      campaignId: "00000000-0000-4000-8000-000000000010",
      entries: [validEntry]
    });
    expect(log.entries).toHaveLength(1);
  });
});
