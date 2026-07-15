/*
 * In-memory-only holder for the last admin PDF conversion result
 * (docs/adr/0001-admin-pdf-to-pack-conversion.md). Deliberately not synced
 * or persisted to IndexedDB/localStorage: the conversion endpoint is
 * stateless and a page refresh is meant to lose the drafts, same as the
 * server never writing them to disk. Mutated in place, same pattern as
 * session.svelte.ts's sessionState.
 */
import type { ConversionResult } from "@mowc/shared";

export const conversionState = $state<{ result: ConversionResult | null }>({
  result: null
});

export function setConversionResult(result: ConversionResult): void {
  conversionState.result = result;
}

export function clearConversionResult(): void {
  conversionState.result = null;
}
