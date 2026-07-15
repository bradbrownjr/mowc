import { describe, expect, it } from "vitest";
import type { User } from "@mowc/shared";
import { isAdmin } from "./admin.js";

function user(email: string): User {
  return { id: "550e8400-e29b-41d4-a716-446655440000", email, displayName: "Test User" };
}

describe("isAdmin", () => {
  it("returns true when the user's email matches the configured admin email", () => {
    expect(isAdmin(user("admin@example.com"), "admin@example.com")).toBe(true);
  });

  it("is case-insensitive", () => {
    expect(isAdmin(user("admin@example.com"), "Admin@Example.com")).toBe(true);
  });

  it("returns false when no admin email is configured", () => {
    expect(isAdmin(user("admin@example.com"), undefined)).toBe(false);
  });

  it("returns false for a non-matching email", () => {
    expect(isAdmin(user("someone@example.com"), "admin@example.com")).toBe(false);
  });
});
