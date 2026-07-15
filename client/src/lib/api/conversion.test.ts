import { afterEach, describe, expect, it, vi } from "vitest";
import type { ConversionResult } from "@mowc/shared";
import { ConversionApiError, convertPdf } from "./conversion.js";

const RESULT: ConversionResult = {
  $format: "mowc-conversion-result/v1",
  drafts: [],
  notes: []
};

function mockFetch(response: Partial<Response> & { jsonBody?: unknown }): void {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({
      ok: response.ok ?? true,
      status: response.status ?? 200,
      json: () => Promise.resolve(response.jsonBody)
    })
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("convertPdf", () => {
  it("posts the raw file with the pdf content type and returns the parsed result", async () => {
    mockFetch({ jsonBody: RESULT });
    const file = new File([new Uint8Array([1, 2, 3])], "book.pdf", { type: "application/pdf" });

    const result = await convertPdf(file);

    expect(result).toEqual(RESULT);
    const [url, init] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/admin/conversions");
    expect(init.method).toBe("POST");
    expect((init.headers as Record<string, string>)["Content-Type"]).toBe("application/pdf");
    expect(init.body).toBe(file);
  });

  it("throws ConversionApiError on a 403 (non-admin)", async () => {
    mockFetch({ ok: false, status: 403, jsonBody: { errors: [{ path: "", message: "admin only" }] } });
    const file = new File([new Uint8Array([1])], "book.pdf", { type: "application/pdf" });

    await expect(convertPdf(file)).rejects.toThrow(ConversionApiError);
  });

  it("throws ConversionApiError when the response body fails schema validation", async () => {
    mockFetch({ jsonBody: { $format: "wrong", drafts: [], notes: [] } });
    const file = new File([new Uint8Array([1])], "book.pdf", { type: "application/pdf" });

    await expect(convertPdf(file)).rejects.toThrow(ConversionApiError);
  });
});
