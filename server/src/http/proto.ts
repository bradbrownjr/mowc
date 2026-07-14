/**
 * docs/SECURITY.md section 1: reject any JSON that could reach a merge or
 * property-assignment path and pollute a prototype. JSON.parse itself does not
 * trigger the __proto__ setter, but this is the documented contract, so we
 * check explicitly rather than relying on that nuance. Shared by the
 * content-pack upload path and the sync push path (both assign user JSON).
 */
const DANGEROUS_KEYS = new Set(["__proto__", "constructor", "prototype"]);

export function hasDangerousKeys(value: unknown, depth = 0): boolean {
  if (depth > 32) {
    return true;
  }
  if (Array.isArray(value)) {
    return value.some((item) => hasDangerousKeys(item, depth + 1));
  }
  if (value !== null && typeof value === "object") {
    for (const key of Object.keys(value)) {
      if (DANGEROUS_KEYS.has(key)) {
        return true;
      }
    }
    return Object.values(value).some((item) => hasDangerousKeys(item, depth + 1));
  }
  return false;
}
