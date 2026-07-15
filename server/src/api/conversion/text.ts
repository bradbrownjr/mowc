/**
 * Line-level predicates shared by the conversion splitter and move extractor.
 * All operate on reflowed, reading-order text (see reflow.ts). They are
 * deliberately strict: a false "yes" here is how text gets misplaced, which is
 * the exact failure mode the ADR's "flag, never guess" rule exists to prevent.
 */

import { RatingSchema, type Rating } from "@mowc/shared";

const RATING_WORDS: Rating[] = RatingSchema.options;

export function isBlank(line: string): boolean {
  return line.trim().length === 0;
}

/** Safe indexed access into a line array (empty string when out of range). */
export function at(lines: string[], idx: number): string {
  return lines[idx] ?? "";
}

/** A list item: •, -, *, ◦, ▪ (the glyphs pdftotext emits for bullets). */
export function isBullet(line: string): boolean {
  return /^\s*[•\-*◦▪]\s+/.test(line);
}

/**
 * A move outcome / result marker: "On a 10+", "On a 7-9", "On a 12+", "On a
 * miss", a bare "advanced:" line, or a "miss" line. Trigger text must stop
 * before these so outcome and bullet text never bleeds into it.
 */
export function isOutcomeMarker(line: string): boolean {
  return /^\s*(on a\s+(6|7|10|12)|advanced\b|on a miss\b|miss:)/i.test(line);
}

/**
 * A heading-like line: short, no terminal sentence punctuation, mostly
 * letters, and either Title Case (every significant word capitalised) or ALL
 * CAPS. Used to spot playbook names and move names. A trailing colon is
 * allowed and stripped by callers.
 */
export function isHeadingLike(line: string): boolean {
  const trimmed = line.trim().replace(/:$/, "");
  if (trimmed.length === 0 || trimmed.length > 50) {
    return false;
  }
  if (/[.!?]$/.test(trimmed)) {
    return false;
  }
  if (isBullet(line)) {
    return false;
  }
  // A run of 3+ internal spaces means two columns fused during reflow, not a
  // real heading (e.g. "b Pickup       b Truck"). Reject it.
  if (/\S {3,}\S/.test(trimmed)) {
    return false;
  }
  const words = trimmed.split(/\s+/);
  if (words.length > 7) {
    return false;
  }
  // Mostly alphabetic (allow spaces, hyphens, apostrophes, ampersands).
  if (!/^[A-Za-z][A-Za-z'&\- ]*$/.test(trimmed)) {
    return false;
  }
  if (trimmed === trimmed.toUpperCase() && /[A-Z]/.test(trimmed)) {
    return true; // ALL CAPS heading.
  }
  // Title Case: every word of 4+ letters starts uppercase (short joiner words
  // like "of", "the", "a" may be lowercase).
  const significant = words.filter((word) => word.length >= 4);
  if (significant.length === 0) {
    return false;
  }
  return significant.every((word) => /^[A-Z]/.test(word));
}

/**
 * A ratings-distribution line, the strongest signal that a playbook is near.
 * Matches a line naming at least three of the five ratings, e.g.
 * "Charm +1  Cool +2  Sharp -1  Tough +0  Weird =1".
 */
export function isRatingsLine(line: string): boolean {
  const lower = line.toLowerCase();
  const named = RATING_WORDS.filter((rating) => lower.includes(rating));
  return named.length >= 3 && /[+\-=]\s*\d/.test(line);
}

/** The roll trigger inside a move body: "roll +Cool" -> "cool". */
export function parseRollRating(text: string): Rating | null {
  const match = /\broll\s*\+\s*(charm|cool|sharp|tough|weird)\b/i.exec(text);
  return match?.[1] ? (match[1].toLowerCase() as Rating) : null;
}

/** A copyright/licence line, captured verbatim for a draft's `license`. */
export function findLicenseLine(lines: string[]): string | undefined {
  for (const line of lines) {
    const trimmed = line.trim();
    if (/copyright|©|\ball rights reserved\b/i.test(trimmed) && trimmed.length <= 300) {
      return trimmed;
    }
  }
  return undefined;
}

/**
 * Join wrapped body lines into one string, healing the hyphenation pdftotext
 * introduces at column wraps ("estab-\nlished" -> "established") while keeping
 * genuine spaces between words.
 */
export function joinWrapped(lines: string[]): string {
  let out = "";
  for (const raw of lines) {
    const line = raw.trim();
    if (line.length === 0) {
      continue;
    }
    if (out.length === 0) {
      out = line;
    } else if (/[A-Za-z]-$/.test(out)) {
      out = out.slice(0, -1) + line;
    } else {
      out += ` ${line}`;
    }
  }
  return out;
}

/** A URL-safe-ish slug for definition ids, kept non-empty. */
export function slugify(value: string): string {
  const slug = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  return slug.length > 0 ? slug : "item";
}
