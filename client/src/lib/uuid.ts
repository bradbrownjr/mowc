/**
 * crypto.randomUUID() requires a secure context (HTTPS or localhost), but
 * docs/SECURITY.md explicitly supports plain-HTTP LAN deployment. This uses
 * crypto.getRandomValues(), which has no such restriction, to stay usable
 * in that scenario.
 */
export function generateUuid(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
