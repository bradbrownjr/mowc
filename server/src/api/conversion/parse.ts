/**
 * Split a reflowed rulebook/playbook PDF into draft content packs.
 *
 * Contract (docs/adr/0001-admin-pdf-to-pack-conversion.md):
 *  - Each detected playbook becomes its own draft pack (one playbook each).
 *  - All non-playbook reference material becomes one "<title> reference" draft.
 *  - Every draft is independently valid against ContentPackSchema.
 *  - "Flag, never guess": text is only placed into a typed field when the
 *    parser is confident (a move via its roll trigger, an agenda bullet list).
 *    Anything else is attached verbatim in conversionNotes / document notes
 *    with a field path, never invented into a typed value and never dropped.
 *
 * Boundary detection is the risky part, so it is intentionally narrow: a
 * playbook boundary is anchored on a ratings-distribution line (the strongest
 * playbook signal) with a heading just above it. When no ratings lines exist,
 * no playbooks are emitted and the whole document is treated as reference.
 */

import { randomUUID } from "node:crypto";
import {
  CONVERSION_RESULT_FORMAT,
  type ContentPack,
  type ConversionResult,
  type MoveDef,
  formatConversionNote
} from "@mowc/shared";
import { segmentBlock } from "./moves.js";
import {
  at,
  findLicenseLine,
  isBullet,
  isHeadingLike,
  isRatingsLine,
  joinWrapped,
  slugify
} from "./text.js";

export interface ParseInput {
  /** Reflowed, reading-order text (see reflow.ts). */
  text: string;
  /** PDF metadata Title, if any. */
  title?: string | undefined;
  /** PDF metadata Author, if any. */
  author?: string | undefined;
  /** Fallback author when the PDF has no metadata author. */
  adminDisplayName: string;
}

// How far above a ratings line to look for the playbook's name heading.
const HEADER_LOOKBACK = 20;

// Reference sections that must never be mistaken for a playbook name and that
// switch region ownership back to the reference draft.
const REFERENCE_HEADINGS = [
  /^basic moves\b/i,
  /^hunter agenda\b/i,
  /^keeper agenda\b/i,
  /^keeper principles\b/i,
  /^keeper moves\b/i,
  /^mystery creation\b/i,
  /^always say\b/i
];

// Playbook-sheet sub-section labels. These sit right next to the ratings line
// but are never the playbook's name, so they must be skipped when naming a
// draft (otherwise every sheet gets called "Pronouns" or "Getting Started").
const SUBSECTION_HEADINGS = [
  /^pronouns?\b/i,
  /^getting started\b/i,
  /^ratings?\b/i,
  /^looks?\b/i,
  /^gear\b/i,
  /^moves?\b/i,
  /^improvements?\b/i,
  /^history\b/i,
  /^style\b/i,
  /^enemies\b/i,
  /^assets\b/i,
  /^team\b/i,
  /^experience\b/i,
  /^harm\b/i,
  /^luck\b/i,
  /^name\b/i,
  /^background\b/i
];

// Ratings lines closer together than this belong to the same playbook (a sheet
// offers several starting-ratings arrangements), so they yield one header.
const COALESCE_WINDOW = 25;

const NOTE_CHUNK = 4000;

function isReferenceHeading(line: string): boolean {
  const trimmed = line.trim();
  return REFERENCE_HEADINGS.some((re) => re.test(trimmed));
}

function isSubsectionHeading(line: string): boolean {
  const trimmed = line.trim();
  return SUBSECTION_HEADINGS.some((re) => re.test(trimmed));
}

function headingText(line: string): string {
  return line.trim().replace(/:$/, "");
}

/**
 * Line indices that begin a playbook. Each ratings line anchors a playbook;
 * its name is the nearest heading above that is neither a reference section
 * nor a sheet sub-section label. Ratings lines within COALESCE_WINDOW of an
 * already-anchored playbook are treated as the same playbook (a sheet lists
 * several starting-ratings options), so they do not spawn duplicate drafts.
 */
function findPlaybookHeaders(lines: string[]): Set<number> {
  const headers = new Set<number>();
  let lastRatingsIdx = -Infinity;
  for (let idx = 0; idx < lines.length; idx++) {
    if (!isRatingsLine(at(lines, idx))) {
      continue;
    }
    if (idx - lastRatingsIdx <= COALESCE_WINDOW) {
      lastRatingsIdx = idx;
      continue; // Same playbook as the previous ratings line.
    }
    lastRatingsIdx = idx;
    const lowest = Math.max(0, idx - HEADER_LOOKBACK);
    for (let up = idx - 1; up >= lowest; up--) {
      const line = at(lines, up);
      if (!isHeadingLike(line) || isReferenceHeading(line) || isSubsectionHeading(line)) {
        continue;
      }
      headers.add(up);
      break;
    }
  }
  return headers;
}

interface Region {
  name: string;
  lines: string[];
}

interface Partition {
  playbooks: Region[];
  reference: string[];
}

/** Assign every line to a playbook region or the shared reference bucket. */
function partition(lines: string[]): Partition {
  const headers = findPlaybookHeaders(lines);
  const playbooks: Region[] = [];
  const reference: string[] = [];
  let current: Region | null = null;

  for (let idx = 0; idx < lines.length; idx++) {
    const line = at(lines, idx);
    if (headers.has(idx)) {
      current = { name: headingText(line), lines: [] };
      playbooks.push(current);
      continue; // The header names the draft; it is not body text.
    }
    if (isReferenceHeading(line)) {
      current = null;
      reference.push(line);
      continue;
    }
    if (current) {
      current.lines.push(line);
    } else {
      reference.push(line);
    }
  }

  return { playbooks, reference };
}

function chunkNotes(fieldPath: string, message: string, source: string, into: string[]): void {
  const trimmed = source.trim();
  if (trimmed.length === 0) {
    return;
  }
  for (let start = 0; start < trimmed.length; start += NOTE_CHUNK) {
    into.push(formatConversionNote(fieldPath, message, trimmed.slice(start, start + NOTE_CHUNK)));
  }
}

function moveId(name: string): string {
  return `${slugify(name)}-${randomUUID().slice(0, 8)}`;
}

function toMove(name: string, trigger: string, rating: MoveDef["rating"]): MoveDef {
  return { id: moveId(name), name, trigger, rating, outcomes: null, tags: [] };
}

/** Pack-level default fields (author/version/license), each flagged. */
function applyDefaults(
  pack: ContentPack,
  regionLines: string[],
  input: ParseInput,
  notes: string[]
): void {
  const licenseLine = findLicenseLine(regionLines);
  if (licenseLine) {
    pack.license = licenseLine;
    notes.push(formatConversionNote("pack", "license taken from a detected line; verify it", licenseLine));
  } else {
    notes.push(
      formatConversionNote("pack", "no license detected; record the source book and its terms (docs/LICENSING.md)")
    );
  }

  if (input.author) {
    notes.push(formatConversionNote("pack", "author taken from PDF metadata; verify it", input.author));
  } else {
    notes.push(formatConversionNote("pack", "no author in PDF metadata; defaulted to your account name; verify it"));
  }

  notes.push(formatConversionNote("pack", "version defaulted to 0.1.0; set it before saving"));
}

/** Build one draft pack for a single playbook region. */
function buildPlaybookDraft(region: Region, input: ParseInput): ContentPack {
  const notes: string[] = [];
  const segments = segmentBlock(region.lines);

  const moves: MoveDef[] = [];
  let blurb = "";
  let blurbTaken = false;

  segments.forEach((segment) => {
    if (segment.kind === "move") {
      moves.push(toMove(segment.name, segment.trigger, segment.rating));
      const moveIndex = moves.length - 1;
      if (segment.outcomeSource.length > 0) {
        chunkNotes(
          `playbooks[0].moves[${moveIndex}].outcomes`,
          "outcome text detected but not parsed; enter the 10+/7-9/miss results manually",
          segment.outcomeSource,
          notes
        );
      }
      return;
    }
    // First prose text segment becomes the blurb; the rest is flagged.
    if (!blurbTaken && /[a-z]/.test(segment.text) && segment.text.length > 20) {
      blurb = segment.text.replace(/\s+/g, " ").trim().slice(0, 2000);
      blurbTaken = true;
      return;
    }
    chunkNotes(
      "playbooks[0]",
      "unstructured playbook content not sorted into fields (ratings, looks, gear, improvements, extras)",
      segment.text,
      notes
    );
  });

  notes.push(
    formatConversionNote("playbooks[0].movesToPick", "starting moves-to-pick count not detected; defaulted to 0")
  );

  const pack: ContentPack = {
    id: randomUUID(),
    name: region.name,
    author: input.author ?? input.adminDisplayName,
    version: "0.1.0",
    $format: "mowc-content-pack/v1",
    conversionNotes: notes,
    playbooks: [
      {
        id: slugify(region.name),
        name: region.name,
        blurb,
        ratingsLines: [],
        luckMax: 7,
        harmTrack: { max: 7, unstableAt: 4 },
        looks: [],
        moves,
        movesToPick: 0,
        gearChoices: [],
        improvements: [],
        advancedImprovements: [],
        extras: []
      }
    ],
    basicMoves: [],
    monsterTypes: [],
    bystanderTypes: [],
    minionTypes: [],
    locationTypes: [],
    gear: []
  };

  applyDefaults(pack, region.lines, input, notes);
  return pack;
}

/** Pull a bullet list immediately following a matching heading. */
function extractBulletList(lines: string[], headingRe: RegExp): string[] | undefined {
  const headingIdx = lines.findIndex((line) => headingRe.test(line.trim()));
  if (headingIdx === -1) {
    return undefined;
  }
  const items: string[] = [];
  let current: string[] = [];
  for (let idx = headingIdx + 1; idx < lines.length; idx++) {
    const line = lines[idx] ?? "";
    if (line.trim().length === 0) {
      if (items.length > 0 || current.length > 0) {
        break; // Blank line after the list ends it.
      }
      continue;
    }
    if (isBullet(line)) {
      if (current.length > 0) {
        items.push(joinWrapped(current));
      }
      current = [line.replace(/^\s*[•\-*◦▪]\s+/, "")];
    } else if (current.length > 0 && !isHeadingLike(line)) {
      current.push(line); // Wrapped continuation of the current bullet.
    } else {
      break; // Non-bullet, non-continuation line ends the list.
    }
  }
  if (current.length > 0) {
    items.push(joinWrapped(current));
  }
  return items.length > 0 ? items.map((item) => item.slice(0, 500)) : undefined;
}

/** Build the single reference draft from all non-playbook material. */
function buildReferenceDraft(reference: string[], input: ParseInput): ContentPack {
  const notes: string[] = [];
  const name = `${input.title ?? "Untitled"} reference`;

  const hunterAgenda = extractBulletList(reference, /^hunter agenda\b/i);
  const keeperAgenda = extractBulletList(reference, /^keeper agenda\b/i);

  const basicMoves: MoveDef[] = [];
  segmentBlock(reference).forEach((segment) => {
    if (segment.kind === "move") {
      basicMoves.push(toMove(segment.name, segment.trigger, segment.rating));
      const moveIndex = basicMoves.length - 1;
      if (segment.outcomeSource.length > 0) {
        chunkNotes(
          `basicMoves[${moveIndex}].outcomes`,
          "outcome text detected but not parsed; enter the 10+/7-9/miss results manually",
          segment.outcomeSource,
          notes
        );
      }
      return;
    }
    chunkNotes(
      "pack",
      "reference text not sorted into fields (agendas, principles, keeper moves, guidance)",
      segment.text,
      notes
    );
  });

  const pack: ContentPack = {
    id: randomUUID(),
    name,
    author: input.author ?? input.adminDisplayName,
    version: "0.1.0",
    $format: "mowc-content-pack/v1",
    conversionNotes: notes,
    playbooks: [],
    basicMoves,
    monsterTypes: [],
    bystanderTypes: [],
    minionTypes: [],
    locationTypes: [],
    gear: [],
    ...(hunterAgenda ? { hunterAgenda } : {}),
    ...(keeperAgenda ? { keeperAgenda } : {})
  };

  applyDefaults(pack, reference, input, notes);
  return pack;
}

export function parseConversion(input: ParseInput): ConversionResult {
  const lines = input.text.split("\n");
  const { playbooks, reference } = partition(lines);

  const drafts: ContentPack[] = playbooks.map((region) => buildPlaybookDraft(region, input));

  const notes: string[] = [];
  const referenceHasContent = reference.join("").trim().length > 0;
  if (referenceHasContent) {
    drafts.push(buildReferenceDraft(reference, input));
  }

  if (playbooks.length === 0) {
    notes.push(
      formatConversionNote(
        "document",
        "no playbooks detected (no ratings lines found); the whole document was treated as reference"
      )
    );
  }

  return { $format: CONVERSION_RESULT_FORMAT, drafts, notes };
}
