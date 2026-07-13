#!/usr/bin/env node
/**
 * Reproducible PWA icon generator for MOWC.
 *
 * Draws an original "evidence tag" mark: a rectangle with one clipped
 * corner (the DESIGN.md --tag-clip motif) on the dark Midnight Unit
 * background, an amber accent border, a punched string hole, and the
 * letters "MOWC" in the accent. This is a trivial, original mark. It
 * contains NO Monster of the Week / Evil Hat text or imagery.
 *
 * Colors are the documented DESIGN.md dark-theme tokens:
 *   --bg     #12161c   background
 *   --accent #e8a33d   amber accent (border + letters)
 *   --ink    #e8e6e0   (unused here, kept for reference)
 *
 * Run: node client/scripts/gen-icons.mjs
 * Requires the root devDependency "sharp". Output PNGs are committed so
 * the app build itself does not depend on sharp.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const BG = "#12161c";
const ACCENT = "#e8a33d";

const outDir = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "static", "icons");
const rootStatic = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "static");

/**
 * Build the SVG mark at a 100x100 view box.
 *
 * @param {object} opts
 * @param {boolean} opts.maskable  Full-bleed background; keep art inside
 *                                 the central 80% safe zone.
 * @param {boolean} opts.transparentBg  Transparent page (favicon look).
 */
function markSvg({ maskable = false, transparentBg = false } = {}) {
  // Maskable icons must keep their content inside the central safe zone,
  // so the tag art is inset more and the background bleeds to the edge.
  const inset = maskable ? 24 : 12;
  const x = inset;
  const y = inset;
  const w = 100 - inset * 2;
  const h = 100 - inset * 2;
  const clip = w * 0.22; // clipped top-right corner
  const stroke = maskable ? 4 : 5;

  // Tag outline: rectangle with the top-right corner cut (evidence tag).
  const tag = [
    `M ${x} ${y}`,
    `L ${x + w - clip} ${y}`,
    `L ${x + w} ${y + clip}`,
    `L ${x + w} ${y + h}`,
    `L ${x} ${y + h}`,
    `Z`
  ].join(" ");

  // String hole near the clipped corner.
  const holeCx = x + w - clip * 0.55;
  const holeCy = y + clip * 0.75;
  const holeR = Math.max(2.2, w * 0.05);

  const fontSize = w * 0.26;
  const textY = y + h * 0.62;

  const pageBg = transparentBg
    ? ""
    : `<rect x="0" y="0" width="100" height="100" fill="${BG}"/>`;

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="100" height="100">
  ${pageBg}
  <path d="${tag}" fill="none" stroke="${ACCENT}" stroke-width="${stroke}" stroke-linejoin="round"/>
  <circle cx="${holeCx}" cy="${holeCy}" r="${holeR}" fill="none" stroke="${ACCENT}" stroke-width="2"/>
  <text x="50" y="${textY}" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-weight="700" font-size="${fontSize}" letter-spacing="1" fill="${ACCENT}">MOWC</text>
</svg>`;
}

async function png(svg, size, file) {
  const buf = await sharp(Buffer.from(svg)).resize(size, size).png({ compressionLevel: 9 }).toBuffer();
  writeFileSync(file, buf);
  console.log(`wrote ${path.relative(process.cwd(), file)} (${buf.length} bytes)`);
}

async function main() {
  mkdirSync(outDir, { recursive: true });

  const standard = markSvg();
  const maskable = markSvg({ maskable: true });
  const favicon = markSvg({ transparentBg: true });

  // Committed SVG source for the standard mark (documentation + reuse).
  writeFileSync(path.join(outDir, "icon.svg"), standard);
  console.log(`wrote ${path.relative(process.cwd(), path.join(outDir, "icon.svg"))}`);

  await png(standard, 192, path.join(outDir, "icon-192.png"));
  await png(standard, 512, path.join(outDir, "icon-512.png"));
  await png(maskable, 512, path.join(outDir, "icon-512-maskable.png"));
  await png(standard, 180, path.join(outDir, "apple-touch-icon.png"));
  await png(favicon, 48, path.join(rootStatic, "favicon.png"));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
