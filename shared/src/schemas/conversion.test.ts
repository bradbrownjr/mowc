import { describe, expect, it } from "vitest";
import {
  CONVERSION_RESULT_FORMAT,
  ConversionResultSchema,
  formatConversionNote
} from "./conversion.js";

describe("ConversionResultSchema", () => {
  it("accepts an empty result with the format tag", () => {
    const result = ConversionResultSchema.safeParse({
      $format: CONVERSION_RESULT_FORMAT,
      drafts: [],
      notes: []
    });
    expect(result.success).toBe(true);
  });

  it("rejects a missing or wrong format tag", () => {
    expect(
      ConversionResultSchema.safeParse({ drafts: [], notes: [] }).success
    ).toBe(false);
    expect(
      ConversionResultSchema.safeParse({ $format: "other", drafts: [], notes: [] }).success
    ).toBe(false);
  });

  it("validates each draft against the content-pack schema", () => {
    const bad = ConversionResultSchema.safeParse({
      $format: CONVERSION_RESULT_FORMAT,
      // name is required and min(1); an empty object must fail.
      drafts: [{}],
      notes: []
    });
    expect(bad.success).toBe(false);
  });
});

describe("formatConversionNote", () => {
  it("emits path and message with no source", () => {
    expect(formatConversionNote("pack", "verify the author")).toBe(
      "pack: verify the author"
    );
  });

  it("separates the source excerpt with a blank line", () => {
    expect(
      formatConversionNote("playbooks[0].moves", "could not parse", "raw text here")
    ).toBe("playbooks[0].moves: could not parse\n\nraw text here");
  });

  it("truncates only the source, never the message, and marks the cut", () => {
    const note = formatConversionNote("playbooks[0]", "flag", "x".repeat(200), 40);
    expect(note.length).toBeLessThanOrEqual(40);
    expect(note.startsWith("playbooks[0]: flag\n\n")).toBe(true);
    expect(note.endsWith("…")).toBe(true);
  });

  it("keeps the whole note within max when the source barely fits", () => {
    const note = formatConversionNote("document", "m", "abc", 5000);
    expect(note).toBe("document: m\n\nabc");
  });
});
