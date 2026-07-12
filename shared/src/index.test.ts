import { describe, expect, it } from "vitest";
import { HealthzResponseSchema } from "./index.js";

describe("HealthzResponseSchema", () => {
  it("parses a valid healthz response", () => {
    const result = HealthzResponseSchema.parse({ status: "ok", version: "0.1.0" });
    expect(result).toEqual({ status: "ok", version: "0.1.0" });
  });

  it("rejects an invalid status value", () => {
    expect(() => HealthzResponseSchema.parse({ status: "down", version: "0.1.0" })).toThrow();
  });
});
