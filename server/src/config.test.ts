import { describe, expect, it } from "vitest";
import { parseTrustProxy } from "./config.js";

describe("parseTrustProxy", () => {
  it("defaults to false when unset or explicitly off", () => {
    expect(parseTrustProxy(undefined)).toBe(false);
    expect(parseTrustProxy("")).toBe(false);
    expect(parseTrustProxy("0")).toBe(false);
    expect(parseTrustProxy("false")).toBe(false);
  });

  it("treats true as exactly one trusted hop, never trust-everything", () => {
    expect(parseTrustProxy("true")).toBe(1);
    expect(parseTrustProxy("TRUE")).toBe(1);
  });

  it("accepts a positive integer hop count", () => {
    expect(parseTrustProxy("1")).toBe(1);
    expect(parseTrustProxy("2")).toBe(2);
  });

  it("rejects garbage values as false rather than trusting the header", () => {
    expect(parseTrustProxy("-1")).toBe(false);
    expect(parseTrustProxy("1.5")).toBe(false);
    expect(parseTrustProxy("loopback, evil")).toBe(false);
  });
});
