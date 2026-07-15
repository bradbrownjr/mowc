import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";
import { PdfExtractionError, extractPdfMetadata, extractPdfText, isPdf } from "./pdftotext.js";
import { makePlaceholderPdf } from "./pdfFixture.js";

function hasPoppler(command: string): boolean {
  const probe = spawnSync(command, ["-v"], { stdio: "ignore" });
  return probe.error === undefined;
}

const havePdftotext = hasPoppler("pdftotext");
const havePdfinfo = hasPoppler("pdfinfo");

describe("isPdf", () => {
  it("accepts a buffer starting with %PDF-", () => {
    expect(isPdf(Buffer.from("%PDF-1.7\n..."))).toBe(true);
  });

  it("rejects non-PDF and too-short buffers", () => {
    expect(isPdf(Buffer.from("not a pdf"))).toBe(false);
    expect(isPdf(Buffer.from("%PDF"))).toBe(false);
    expect(isPdf(Buffer.alloc(0))).toBe(false);
  });
});

describe.skipIf(!havePdftotext)("extractPdfText", () => {
  it("returns the text of a placeholder PDF", async () => {
    const pdf = makePlaceholderPdf(["The Placeholder", "An invented test line."]);
    const text = await extractPdfText(pdf);
    expect(text).toContain("The Placeholder");
    expect(text).toContain("An invented test line.");
  });

  it("rejects a non-PDF payload with a nonzero-exit error", async () => {
    await expect(extractPdfText(Buffer.from("this is not a pdf"))).rejects.toBeInstanceOf(
      PdfExtractionError
    );
  });
});

describe.skipIf(!havePdfinfo)("extractPdfMetadata", () => {
  it("reads Title and Author from the info dictionary", async () => {
    const pdf = makePlaceholderPdf(["The Placeholder"], {
      title: "Placeholder Rulebook",
      author: "Test Fixtures"
    });
    const meta = await extractPdfMetadata(pdf);
    expect(meta.title).toBe("Placeholder Rulebook");
    expect(meta.author).toBe("Test Fixtures");
  });

  it("returns empty metadata for garbage rather than throwing", async () => {
    const meta = await extractPdfMetadata(Buffer.from("garbage"));
    expect(meta).toEqual({});
  });
});
