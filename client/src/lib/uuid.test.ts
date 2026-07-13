import { describe, expect, it } from "vitest";
import { UuidSchema } from "@mowc/shared";
import { generateUuid } from "./uuid.js";

describe("generateUuid", () => {
  it("produces a valid v4 uuid", () => {
    expect(() => UuidSchema.parse(generateUuid())).not.toThrow();
  });

  it("produces distinct values across calls", () => {
    const ids = new Set(Array.from({ length: 100 }, () => generateUuid()));
    expect(ids.size).toBe(100);
  });
});
