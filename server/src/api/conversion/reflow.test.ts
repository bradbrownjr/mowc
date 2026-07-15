import { describe, expect, it } from "vitest";
import { reflowLayout } from "./reflow.js";

// All fixtures use invented placeholder content (AGENTS.md rule 1). The text
// mimics the two-column geometry pdftotext -layout produces, not any real
// game text.

describe("reflowLayout", () => {
  it("de-columnizes a two-column page into reading order", () => {
    // Left column: "The Placeholder" playbook intro. Right column: a move.
    const layout = [
      "The Placeholder                          Placeholder Strike",
      "An invented playbook used only            When you do the invented thing,",
      "for tests.                                roll +weird.",
      "                                            On a 10+ it works.",
    ].join("\n");

    const out = reflowLayout(layout);
    const leftIdx = out.indexOf("An invented playbook");
    const rightIdx = out.indexOf("When you do the invented thing");
    // The whole left column must appear before the right column starts.
    expect(leftIdx).toBeGreaterThanOrEqual(0);
    expect(rightIdx).toBeGreaterThan(leftIdx);
    // Left-column lines stay contiguous, not interleaved with the right one.
    expect(out).toContain("An invented playbook used only\nfor tests.");
    // Right-column lines stay contiguous too (relative indentation is kept on
    // purpose, so normalize leading whitespace before comparing).
    const normalized = out.replace(/^[ \t]+/gm, "");
    expect(normalized).toContain("When you do the invented thing,\nroll +weird.");
  });

  it("passes a single-column page through unchanged in reading order", () => {
    const layout = ["Placeholder Heading", "First body line.", "Second body line."].join("\n");
    const out = reflowLayout(layout);
    expect(out).toBe("Placeholder Heading\nFirst body line.\nSecond body line.");
  });

  it("does not split a column on a one-space word gap", () => {
    const layout = [
      "Alpha one two three                      Beta one two three",
      "Alpha four five six                      Beta four five six",
    ].join("\n");
    const out = reflowLayout(layout);
    // "Alpha one two three" must survive whole (no split at internal spaces).
    expect(out).toContain("Alpha one two three");
    expect(out).toContain("Beta one two three");
    expect(out.indexOf("Alpha four")).toBeLessThan(out.indexOf("Beta one"));
  });

  it("processes each page independently on form feeds", () => {
    const page1 = ["Page one left col                       Page one right col"].join("\n");
    const page2 = ["Page two single column line"].join("\n");
    const out = reflowLayout(`${page1}\f${page2}`);
    expect(out).toContain("Page one left col");
    expect(out).toContain("Page one right col");
    expect(out).toContain("Page two single column line");
  });
});
