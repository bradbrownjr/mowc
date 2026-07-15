import { z } from "zod";
import { ContentPackSchema } from "./contentPack.js";

/**
 * Result of the admin PDF-to-content-pack conversion endpoint
 * (docs/adr/0001-admin-pdf-to-pack-conversion.md). One uploaded PDF becomes
 * many draft packs: one per detected playbook plus a single reference draft.
 * The result is held in client memory only and never persisted server-side;
 * the admin edits and saves each draft through the existing content-pack
 * pipeline.
 */
export const CONVERSION_RESULT_FORMAT = "mowc-conversion-result/v1";

export const ConversionResultSchema = z.object({
  $format: z.literal(CONVERSION_RESULT_FORMAT),
  // Each draft is independently valid against ContentPackSchema with a fresh
  // uuid and $format set, ready to POST to /api/content-packs unchanged.
  drafts: z.array(ContentPackSchema),
  // Document-level flags for text the splitter could not attribute to any
  // draft, same grammar as ContentPack.conversionNotes (see below), path
  // "document". Attached verbatim, never silently dropped.
  notes: z.array(z.string().max(5000))
});
export type ConversionResult = z.infer<typeof ConversionResultSchema>;

/**
 * Grammar for a single conversionNote / document note (ADR section 4):
 *
 *   <fieldPath>: <message>
 *
 *   <verbatim source excerpt>
 *
 * `fieldPath` is a JSON path from the pack root (e.g.
 * `playbooks[0].moves[3].trigger`); pack-level notes use the literal `pack`,
 * document-level notes use `document`. The optional source excerpt follows a
 * blank line. The whole note is truncated to `max` characters (5000, the
 * conversionNotes field limit) so a long excerpt can never make a draft fail
 * validation. The note is the "flag, never guess" channel: uncertain text
 * lands here with its source rather than being placed into a typed field.
 */
export function formatConversionNote(
  fieldPath: string,
  message: string,
  source?: string,
  max = 5000
): string {
  const head = `${fieldPath}: ${message}`;
  if (!source || source.trim().length === 0) {
    return head.slice(0, max);
  }
  const full = `${head}\n\n${source}`;
  if (full.length <= max) {
    return full;
  }
  // Truncate the excerpt, never the message/path, and mark the cut so the
  // reviewer knows source was elided.
  const marker = "…";
  const budget = max - head.length - 2 - marker.length;
  if (budget <= 0) {
    return head.slice(0, max);
  }
  return `${head}\n\n${source.slice(0, budget)}${marker}`;
}
