import { describe, expect, it } from "vitest";
import {
  notesForBasicMove,
  notesForMove,
  notesForPackFields,
  notesForPlaybookGeneral,
  unclaimedNotes
} from "./conversion-notes.js";

const NOTES = [
  "pack: license taken from a detected line; verify it",
  "playbooks[0]: unstructured playbook content not sorted into fields",
  "playbooks[0].movesToPick: starting moves-to-pick count not detected; defaulted to 0",
  "playbooks[0].moves[0].outcomes: outcome text detected but not parsed",
  "playbooks[0].moves[2].outcomes: outcome text detected but not parsed",
  "basicMoves[1].outcomes: outcome text detected but not parsed",
  "document: no playbooks detected"
];

describe("notesForPackFields", () => {
  it("matches only the exact pack path", () => {
    expect(notesForPackFields(NOTES)).toEqual(["pack: license taken from a detected line; verify it"]);
  });
});

describe("notesForPlaybookGeneral", () => {
  it("matches playbooks[0] and non-move playbooks[0].* paths, excluding moves", () => {
    expect(notesForPlaybookGeneral(NOTES)).toEqual([
      "playbooks[0]: unstructured playbook content not sorted into fields",
      "playbooks[0].movesToPick: starting moves-to-pick count not detected; defaulted to 0"
    ]);
  });
});

describe("notesForMove", () => {
  it("matches only the requested move index, not other indices", () => {
    expect(notesForMove(NOTES, 0)).toEqual(["playbooks[0].moves[0].outcomes: outcome text detected but not parsed"]);
    expect(notesForMove(NOTES, 1)).toEqual([]);
    expect(notesForMove(NOTES, 2)).toEqual(["playbooks[0].moves[2].outcomes: outcome text detected but not parsed"]);
  });
});

describe("notesForBasicMove", () => {
  it("matches the requested basicMoves index", () => {
    expect(notesForBasicMove(NOTES, 1)).toEqual(["basicMoves[1].outcomes: outcome text detected but not parsed"]);
    expect(notesForBasicMove(NOTES, 0)).toEqual([]);
  });
});

describe("unclaimedNotes", () => {
  it("returns only notes not covered by any known bucket for the given move counts", () => {
    expect(unclaimedNotes(NOTES, 3, 2)).toEqual(["document: no playbooks detected"]);
  });

  it("treats a note as unclaimed if its move index is out of range for the draft", () => {
    // playbooks[0].movesToPick is playbook-general (claimed regardless of
    // moveCount); only the out-of-range move/basicMove notes and the
    // document-level note are unclaimed.
    expect(unclaimedNotes(NOTES, 1, 0)).toEqual([
      "playbooks[0].moves[2].outcomes: outcome text detected but not parsed",
      "basicMoves[1].outcomes: outcome text detected but not parsed",
      "document: no playbooks detected"
    ]);
  });
});
