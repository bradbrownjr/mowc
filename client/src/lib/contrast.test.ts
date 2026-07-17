import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * docs/DESIGN.md Accessibility: "Both themes and all user themes pass WCAG
 * AA contrast; validation is code, not a checklist." This parses the actual
 * token values out of styles.css (not a hand-copied snapshot) so a future
 * token edit that regresses contrast fails here instead of only being
 * caught by eye.
 */

const STYLES_PATH = path.join(path.dirname(fileURLToPath(import.meta.url)), "styles.css");
const css = readFileSync(STYLES_PATH, "utf-8");

function extractBlock(selectorPattern: RegExp): Record<string, string> {
  const match = css.match(selectorPattern);
  if (!match) throw new Error(`could not find block matching ${selectorPattern}`);
  const block = match[0];
  const tokens: Record<string, string> = {};
  for (const tokenMatch of block.matchAll(/--([a-z0-9-]+):\s*(#[0-9a-fA-F]{6});/g)) {
    tokens[tokenMatch[1]] = tokenMatch[2];
  }
  return tokens;
}

const darkTokens = extractBlock(/:root\s*{[^}]*}/);
const lightTokens = extractBlock(/:root\[data-theme="light"\]\s*{[^}]*}/);

function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function srgbToLinear(c: number): number {
  const cs = c / 255;
  return cs <= 0.03928 ? cs / 12.92 : ((cs + 0.055) / 1.055) ** 2.4;
}

function relativeLuminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex).map(srgbToLinear);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrastRatio(hex1: string, hex2: string): number {
  const l1 = relativeLuminance(hex1);
  const l2 = relativeLuminance(hex2);
  const [lighter, darker] = l1 > l2 ? [l1, l2] : [l2, l1];
  return (lighter + 0.05) / (darker + 0.05);
}

// Text-role tokens need WCAG AA's 4.5:1 (normal text); --border is a UI
// boundary (1.4.11 non-text contrast), 3:1. Checked against every surface
// realistic content renders on: --surface-2 is consistently the hardest
// case (closest in luminance to ink/accent/danger/ok/border) but all three
// are asserted so a future surface tweak can't quietly break this.
const TEXT_TOKENS = ["ink", "ink-muted", "accent", "danger", "ok"];
const SURFACES = ["bg", "surface", "surface-2"];

describe.each([
  ["Midnight Unit (dark)", darkTokens],
  ["Field Notes (light)", lightTokens]
])("%s theme contrast", (_name, tokens) => {
  it.each(TEXT_TOKENS)("--%s meets 4.5:1 against every surface", (token) => {
    for (const surface of SURFACES) {
      const ratio = contrastRatio(tokens[token], tokens[surface]);
      expect(ratio, `--${token} on --${surface} (${tokens[token]} vs ${tokens[surface]})`).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("--border meets 3:1 against every surface", () => {
    for (const surface of SURFACES) {
      const ratio = contrastRatio(tokens.border, tokens[surface]);
      expect(ratio, `--border on --${surface} (${tokens.border} vs ${tokens[surface]})`).toBeGreaterThanOrEqual(3.0);
    }
  });
});
