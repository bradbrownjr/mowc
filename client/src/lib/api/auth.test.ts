import { afterEach, describe, expect, it, vi } from "vitest";
import { AuthApiError, login, logout, me, register } from "./auth.js";

const USER = { id: "550e8400-e29b-41d4-a716-446655440000", email: "hunter@example.com", displayName: "Hunter" };

function mockFetch(response: Partial<Response> & { jsonBody?: unknown }): void {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({
      ok: response.ok ?? true,
      status: response.status ?? 200,
      json: () => Promise.resolve(response.jsonBody)
    })
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("register", () => {
  it("posts the register payload and returns the created user", async () => {
    mockFetch({ status: 201, jsonBody: USER });

    const result = await register({ email: USER.email, password: "hunter2024", displayName: USER.displayName });

    expect(result).toEqual(USER);
    const [url, init] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/auth/register");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body as string)).toEqual({ email: USER.email, password: "hunter2024", displayName: USER.displayName });
  });

  it("throws AuthApiError with server validation errors on a 409", async () => {
    mockFetch({ ok: false, status: 409, jsonBody: { errors: [{ path: "email", message: "an account with this email already exists" }] } });

    await expect(register({ email: USER.email, password: "hunter2024", displayName: USER.displayName })).rejects.toMatchObject({
      errors: [{ path: "email", message: "an account with this email already exists" }]
    });
  });
});

describe("login", () => {
  it("posts credentials and returns the logged-in user", async () => {
    mockFetch({ jsonBody: USER });

    const result = await login({ email: USER.email, password: "hunter2024" });

    expect(result).toEqual(USER);
  });

  it("throws AuthApiError on a 401", async () => {
    mockFetch({ ok: false, status: 401, jsonBody: { errors: [{ path: "", message: "invalid email or password" }] } });

    await expect(login({ email: USER.email, password: "wrong" })).rejects.toThrow(AuthApiError);
  });
});

describe("logout", () => {
  it("resolves on a 204 response", async () => {
    mockFetch({ status: 204, jsonBody: undefined });

    await expect(logout()).resolves.toBeUndefined();
    expect(fetch).toHaveBeenCalledWith("/api/auth/logout", { method: "POST" });
  });
});

describe("me", () => {
  it("returns the current user when logged in", async () => {
    mockFetch({ jsonBody: USER });

    const result = await me();

    expect(result).toEqual(USER);
  });

  it("throws AuthApiError on a 401 when logged out", async () => {
    mockFetch({ ok: false, status: 401, jsonBody: { errors: [{ path: "", message: "authentication required" }] } });

    await expect(me()).rejects.toThrow(AuthApiError);
  });
});
