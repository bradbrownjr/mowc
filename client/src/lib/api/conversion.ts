import { ConversionResultSchema, type ConversionResult } from "@mowc/shared";
import { ApiError, throwApiError } from "./http.js";

export { ApiError as ConversionApiError };

/**
 * Admin PDF-to-content-pack conversion (docs/adr/0001). Posts the raw PDF
 * bytes to the stateless conversion endpoint and returns the in-memory
 * result; nothing is persisted server-side, so the caller owns the result
 * (see conversion.svelte.ts) until each draft is saved via createPack.
 */
export async function convertPdf(file: File): Promise<ConversionResult> {
  const res = await fetch("/api/admin/conversions", {
    method: "POST",
    headers: { "Content-Type": "application/pdf" },
    body: file
  });
  if (!res.ok) await throwApiError(res);

  const body: unknown = await res.json();
  const parsed = ConversionResultSchema.safeParse(body);
  if (!parsed.success) {
    throw new ApiError(res.status, [{ path: "", message: "server returned an invalid conversion result" }]);
  }
  return parsed.data;
}
