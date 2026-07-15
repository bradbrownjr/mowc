/**
 * Minimal PDF generator for tests only. Emits a single-page, single-column
 * PDF containing the supplied text lines so the conversion pipeline can be
 * exercised end-to-end against real poppler without shipping any book.
 *
 * AGENTS.md rule 1: callers pass invented placeholder content ("The
 * Placeholder" style) only. This helper never embeds game text; it just lays
 * out whatever lines it is given.
 */

interface PdfFixtureOptions {
  title?: string;
  author?: string;
}

function pdfString(value: string): string {
  // Escape the characters that terminate a PDF literal string.
  return value.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

/**
 * Build a valid single-page PDF whose text is `lines`, one per row, top to
 * bottom. Byte offsets in the xref table are computed exactly so poppler
 * parses it without falling back to reconstruction.
 */
export function makePlaceholderPdf(lines: string[], opts: PdfFixtureOptions = {}): Buffer {
  const startY = 740;
  const leading = 16;
  const content =
    "BT\n/F1 12 Tf\n" +
    `72 ${startY} Td\n${leading} TL\n` +
    lines.map((line, i) => `${i === 0 ? "" : "T*\n"}(${pdfString(line)}) Tj\n`).join("") +
    "ET";

  const objects: string[] = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
    `<< /Length ${Buffer.byteLength(content, "latin1")} >>\nstream\n${content}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>"
  ];

  const infoParts: string[] = [];
  if (opts.title !== undefined) {
    infoParts.push(`/Title (${pdfString(opts.title)})`);
  }
  if (opts.author !== undefined) {
    infoParts.push(`/Author (${pdfString(opts.author)})`);
  }
  const hasInfo = infoParts.length > 0;
  if (hasInfo) {
    objects.push(`<< ${infoParts.join(" ")} >>`);
  }

  const header = "%PDF-1.4\n";
  let body = header;
  const offsets: number[] = [];
  objects.forEach((obj, index) => {
    offsets.push(Buffer.byteLength(body, "latin1"));
    body += `${index + 1} 0 obj\n${obj}\nendobj\n`;
  });

  const xrefStart = Buffer.byteLength(body, "latin1");
  const count = objects.length + 1; // +1 for the free object 0.
  let xref = `xref\n0 ${count}\n0000000000 65535 f \n`;
  for (const offset of offsets) {
    xref += `${offset.toString().padStart(10, "0")} 00000 n \n`;
  }

  const infoRef = hasInfo ? ` /Info ${objects.length} 0 R` : "";
  const trailer =
    `trailer\n<< /Size ${count} /Root 1 0 R${infoRef} >>\nstartxref\n${xrefStart}\n%%EOF\n`;

  return Buffer.from(body + xref + trailer, "latin1");
}
