import { describe, expect, it } from "vitest";
import { mergePatch } from "./merge.js";

describe("mergePatch", () => {
  it("takes the patch as the full payload when there is no current row", () => {
    const result = mergePatch(undefined, { harm: 1, notes: "x" }, "2026-07-14T10:00:00.000Z", undefined);
    expect(result).toEqual({ payload: { harm: 1, notes: "x" }, conflict: false });
  });

  it("preserves fields the patch does not mention", () => {
    const current = { harm: 1, notes: "kept", name: "Ana" };
    const result = mergePatch(current, { harm: 2 }, "2026-07-14T10:05:00.000Z", "2026-07-14T10:00:00.000Z");
    expect(result.payload).toEqual({ harm: 2, notes: "kept", name: "Ana" });
    expect(result.conflict).toBe(false);
  });

  it("keeps the current value and flags a conflict when the op is older", () => {
    const current = { harm: 5 };
    const result = mergePatch(current, { harm: 9 }, "2026-07-14T10:00:00.000Z", "2026-07-14T10:05:00.000Z");
    expect(result.payload).toEqual({ harm: 5 });
    expect(result.conflict).toBe(true);
  });

  it("does not flag a conflict when the patch value already matches", () => {
    const current = { harm: 3 };
    const result = mergePatch(current, { harm: 3 }, "2026-07-14T10:00:00.000Z", "2026-07-14T10:05:00.000Z");
    expect(result).toEqual({ payload: { harm: 3 }, conflict: false });
  });
});
