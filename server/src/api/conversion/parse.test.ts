import { describe, expect, it } from "vitest";
import { ContentPackSchema } from "@mowc/shared";
import { parseConversion } from "./parse.js";

// All fixtures use invented placeholder content only (AGENTS.md rule 1). The
// structure mimics a MotW playbook sheet; none of the text is game text.

const ADMIN = "Admin Person";

describe("parseConversion", () => {
  it("emits a valid pack per playbook plus a reference draft", () => {
    const text = [
      "Basic Moves",
      "Placeholder Punch",
      "When you throw a placeholder punch, roll +tough.",
      "  On a 10+ it lands.",
      "",
      "The Placeholder",
      "An invented playbook for tests only.",
      "Charm +1  Cool +2  Sharp -1  Tough +0  Weird =1",
      "Placeholder Strike",
      "When you strike the invented target, roll +weird.",
      "  On a 7-9 something happens."
    ].join("\n");

    const result = parseConversion({ text, adminDisplayName: ADMIN });

    // One playbook draft + one reference draft.
    const playbookDraft = result.drafts.find((d) => d.playbooks.length === 1);
    const referenceDraft = result.drafts.find((d) => d.playbooks.length === 0);
    expect(playbookDraft?.name).toBe("The Placeholder");
    expect(referenceDraft?.name).toContain("reference");

    // Every draft validates against the content-pack schema (strict).
    for (const draft of result.drafts) {
      expect(ContentPackSchema.strict().safeParse(draft).success).toBe(true);
    }

    // The playbook move was extracted with name, trigger, and rating.
    const move = playbookDraft?.playbooks[0]?.moves[0];
    expect(move?.name).toBe("Placeholder Strike");
    expect(move?.trigger).toContain("strike the invented target");
    expect(move?.rating).toBe("weird");

    // The basic move landed in the reference draft, not a playbook.
    expect(referenceDraft?.basicMoves.some((m) => m.name === "Placeholder Punch")).toBe(true);
  });

  it("REGRESSION: a following bullet list never bleeds into a move trigger", () => {
    // A move whose trigger line does not end in a colon, immediately followed
    // by an unrelated gear bullet list. The prior manual conversion bug pulled
    // the gear text into the trigger; the parser must not.
    const text = [
      "The Placeholder",
      "An invented playbook.",
      "Charm +0  Cool +1  Sharp +2  Tough -1  Weird +1",
      "Placeholder Strike",
      "When you strike the invented target, roll +tough",
      "",
      "Gear",
      " • one placeholder blade",
      " • two placeholder charms"
    ].join("\n");

    const result = parseConversion({ text, adminDisplayName: ADMIN });
    const move = result.drafts[0]?.playbooks[0]?.moves[0];
    expect(move?.name).toBe("Placeholder Strike");
    expect(move?.trigger).toContain("strike the invented target");
    // The gear list must be nowhere in the trigger.
    expect(move?.trigger).not.toContain("placeholder blade");
    expect(move?.trigger).not.toContain("placeholder charms");
    expect(move?.trigger).not.toContain("Gear");

    // The gear text is not silently dropped: it surfaces in conversionNotes.
    const notes = (result.drafts[0]?.conversionNotes ?? []).join("\n");
    expect(notes).toContain("placeholder blade");
  });

  it("flags every invented default (author, version, license)", () => {
    const text = [
      "The Placeholder",
      "Charm +1  Cool +1  Sharp +1  Tough +0  Weird +0"
    ].join("\n");
    const result = parseConversion({ text, adminDisplayName: ADMIN });
    const notes = (result.drafts[0]?.conversionNotes ?? []).join("\n");
    expect(notes).toContain("version defaulted to 0.1.0");
    expect(notes).toContain("author");
    expect(notes).toContain("license");
    // Author defaulted to the admin name when metadata has none.
    expect(result.drafts[0]?.author).toBe(ADMIN);
  });

  it("treats a document with no ratings lines as reference only, with a note", () => {
    const text = ["Some Heading", "Just prose with no ratings anywhere."].join("\n");
    const result = parseConversion({ text, adminDisplayName: ADMIN });
    expect(result.drafts.every((d) => d.playbooks.length === 0)).toBe(true);
    expect(result.notes.join("\n")).toContain("no playbooks detected");
  });

  it("uses PDF metadata author and title when present", () => {
    const text = ["The Placeholder", "Charm +1 Cool +1 Sharp +1 Tough +0 Weird +0"].join("\n");
    const result = parseConversion({
      text,
      title: "Placeholder Book",
      author: "Metadata Author",
      adminDisplayName: ADMIN
    });
    expect(result.drafts[0]?.author).toBe("Metadata Author");
    const reference = result.drafts.find((d) => d.playbooks.length === 0);
    // Reference draft (if any) is named after the title.
    if (reference) {
      expect(reference.name).toBe("Placeholder Book reference");
    }
  });
});
