type Payload = Record<string, unknown>;

export interface MergeResult {
  payload: Payload;
  /** True when a concurrent server write diverged from this op (docs/SYNC.md). */
  conflict: boolean;
}

function sameValue(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/**
 * Applies an op's patch onto the current server payload (docs/SYNC.md push
 * step 3). Fields the op does not mention are always preserved, so two devices
 * editing different fields both survive (invariant 1). For a field that diverges
 * from the current row, the op wins only when it is at least as recent as the
 * current row (last-write-wins by `updatedAt`); otherwise the current value is
 * kept and the op is flagged as a conflict so the client can warn.
 *
 * A brand-new entity (no current row) takes the patch as its full payload.
 */
export function mergeCharacterPatch(
  current: Payload | undefined,
  patch: Payload,
  opTs: string,
  currentUpdatedAt: string | undefined
): MergeResult {
  if (!current) {
    return { payload: { ...patch }, conflict: false };
  }

  const opIsNewer = currentUpdatedAt === undefined || opTs >= currentUpdatedAt;
  const merged: Payload = { ...current };
  let conflict = false;

  for (const [key, value] of Object.entries(patch)) {
    if (sameValue(merged[key], value)) {
      continue;
    }
    if (opIsNewer) {
      merged[key] = value;
    } else {
      conflict = true;
    }
  }

  return { payload: merged, conflict };
}
