/**
 * De-columnize the output of `pdftotext -layout`.
 *
 * `-layout` preserves the page's spatial layout: multi-column playbook sheets
 * come out with columns side by side on every line, so reading top-to-bottom
 * interleaves unrelated columns. Downstream splitting and move detection need
 * reading order, so we detect the vertical whitespace "rivers" between columns
 * and re-emit each column's text in full before moving to the next.
 *
 * This is deliberately conservative: when a page has no clear rivers it is
 * treated as a single column and passed through unchanged. Getting reflow
 * wrong would feed the parser scrambled text, so the bias is toward leaving
 * text alone rather than inventing column boundaries.
 */

// A column gap must be at least this many spaces wide on (almost) every line
// to count as a river. Prose word gaps are 1 space; column gutters are wider.
const MIN_RIVER_WIDTH = 3;

// Fraction of non-blank lines that must be whitespace at a position for it to
// be part of a river. Below 1.0 so a single stray long line does not erase a
// real gutter.
const RIVER_COVERAGE = 0.9;

// A detected column narrower than this is a sliver (e.g. a gutter that opened
// only a couple of characters into a real column). Merge it into its right
// neighbour instead of cutting, which is what caused mid-word splits in early
// prototypes.
const MIN_COLUMN_WIDTH = 12;

function reflowPage(page: string): string {
  const lines = page.split("\n").filter((line) => line.trim().length > 0);
  if (lines.length < 2) {
    return page.replace(/[ \t]+$/gm, "").trim();
  }

  const width = Math.max(...lines.map((line) => line.length));
  const threshold = lines.length * RIVER_COVERAGE;

  // blankCount[i] = how many lines are whitespace (or ended) at column i.
  const blankCount = new Array<number>(width).fill(0);
  for (const line of lines) {
    for (let i = 0; i < width; i++) {
      const ch = line[i];
      if (ch === undefined || ch === " " || ch === "\t") {
        blankCount[i] = (blankCount[i] ?? 0) + 1;
      }
    }
  }
  const isRiver = blankCount.map((count) => count >= threshold);

  // Column boundaries: the right edge of every river at least MIN_RIVER_WIDTH
  // wide. Build [start, end) bands between them.
  const boundaries: number[] = [];
  let i = 0;
  while (i < width) {
    if (isRiver[i]) {
      let j = i;
      while (j < width && isRiver[j]) {
        j++;
      }
      if (j - i >= MIN_RIVER_WIDTH) {
        boundaries.push(j);
      }
      i = j;
    } else {
      i++;
    }
  }

  if (boundaries.length === 0) {
    return lines.map((line) => line.replace(/[ \t]+$/, "")).join("\n");
  }

  // Turn boundaries into bands, merging any band narrower than a real column
  // into the next one so gutters inside a column do not fragment it.
  const stops = [0, ...boundaries, width];
  const bands: Array<[number, number]> = [];
  let start = 0;
  for (let k = 1; k < stops.length; k++) {
    const end = stops[k] ?? width;
    if (end - start >= MIN_COLUMN_WIDTH || k === stops.length - 1) {
      bands.push([start, end]);
      start = end;
    }
    // else: too narrow, extend the current band by not resetting start.
  }
  const last = bands[bands.length - 1];
  if (start < width && last) {
    last[1] = width;
  }

  if (bands.length <= 1) {
    return lines.map((line) => line.replace(/[ \t]+$/, "")).join("\n");
  }

  const columns: string[] = [];
  for (const [colStart, colEnd] of bands) {
    const colLines = lines
      .map((line) => line.slice(colStart, colEnd).replace(/[ \t]+$/, ""))
      .filter((cell) => cell.trim().length > 0);
    if (colLines.length > 0) {
      columns.push(colLines.join("\n"));
    }
  }
  return columns.join("\n\n");
}

/**
 * Reflow a whole document. Pages are split on the form feed pdftotext emits
 * (`\f`) and processed independently, since column geometry can change page to
 * page. Returns reading-order text with a blank line between reflowed pages.
 */
export function reflowLayout(text: string): string {
  return text
    .split("\f")
    .map(reflowPage)
    .filter((page) => page.trim().length > 0)
    .join("\n\n");
}
