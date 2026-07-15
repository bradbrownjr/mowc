/**
 * Conservative move extraction from a block of reflowed, reading-order lines.
 *
 * A move is only recognised when a heading-like name line is followed shortly
 * by a roll trigger ("... roll +Cool"). The name and trigger are extracted
 * with confidence; the roll rating is parsed from the trigger. Outcome text
 * (the 10+/7-9/miss results and their bullet lists) is NOT parsed into typed
 * fields, because that split is exactly where a prior manual conversion
 * misplaced text. Instead outcomes are returned verbatim as `outcomeSource`
 * for the caller to flag.
 *
 * Crucially, the trigger stops at the first bullet, outcome marker, or blank
 * line, so a following gear/list bleed can never contaminate it.
 */

import type { Rating } from "@mowc/shared";
import {
  at,
  isBlank,
  isBullet,
  isHeadingLike,
  isOutcomeMarker,
  joinWrapped,
  parseRollRating
} from "./text.js";

export interface MoveSegment {
  kind: "move";
  name: string;
  trigger: string;
  rating: Rating | null;
  /** Raw outcome/body text after the trigger, unparsed. Empty if none. */
  outcomeSource: string;
}

export interface TextSegment {
  kind: "text";
  text: string;
}

export type Segment = MoveSegment | TextSegment;

// How many non-blank lines after a heading may be scanned for a roll trigger
// before giving up on it being a move.
const ROLL_LOOKAHEAD = 3;

/** Does a move begin at `idx`: a heading line with a roll trigger just below? */
function isMoveStart(lines: string[], idx: number): boolean {
  if (!isHeadingLike(at(lines, idx))) {
    return false;
  }
  let seen = 0;
  for (let j = idx + 1; j < lines.length && seen < ROLL_LOOKAHEAD; j++) {
    const line = at(lines, j);
    if (isBlank(line)) {
      continue;
    }
    if (isHeadingLike(line)) {
      return false; // Another heading before any roll: not a move name.
    }
    seen++;
    if (parseRollRating(line) !== null) {
      return true;
    }
  }
  return false;
}

/**
 * Segment a block into ordered move and free-text runs. Free text is any run
 * of lines not consumed by a recognised move, returned intact so the caller
 * can flag it with its source.
 */
export function segmentBlock(lines: string[]): Segment[] {
  const segments: Segment[] = [];
  let textBuffer: string[] = [];

  const flushText = () => {
    const text = textBuffer.join("\n").trim();
    if (text.length > 0) {
      segments.push({ kind: "text", text });
    }
    textBuffer = [];
  };

  let i = 0;
  while (i < lines.length) {
    if (!isMoveStart(lines, i)) {
      textBuffer.push(at(lines, i));
      i++;
      continue;
    }

    flushText();
    const name = at(lines, i).trim().replace(/:$/, "");

    // Collect the move body: everything until the next move start.
    const body: string[] = [];
    let j = i + 1;
    while (j < lines.length && !isMoveStart(lines, j)) {
      body.push(at(lines, j));
      j++;
    }

    // Trigger: leading body lines up to the first bullet, outcome marker, or
    // blank line. Everything after is outcome source, left unparsed.
    const triggerLines: string[] = [];
    let k = 0;
    while (k < body.length) {
      const line = body[k] ?? "";
      if (isBlank(line) || isBullet(line) || isOutcomeMarker(line)) {
        break;
      }
      triggerLines.push(line);
      k++;
    }

    const trigger = joinWrapped(triggerLines);
    const rating = parseRollRating(trigger);
    const outcomeSource = body
      .slice(k)
      .join("\n")
      .replace(/^\n+|\n+$/g, "")
      .trim();

    segments.push({ kind: "move", name, trigger, rating, outcomeSource });
    i = j;
  }

  flushText();
  return segments;
}
