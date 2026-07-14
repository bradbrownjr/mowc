import type { LoginInput, RegisterInput, User } from "@mowc/shared";
import { ApiError, throwApiError } from "./http.js";

export { ApiError as AuthApiError };

async function postJson<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  if (!res.ok) await throwApiError(res);
  return res.json() as Promise<T>;
}

export async function register(input: RegisterInput): Promise<User> {
  return postJson<User>("/api/auth/register", input);
}

export async function login(input: LoginInput): Promise<User> {
  return postJson<User>("/api/auth/login", input);
}

export async function logout(): Promise<void> {
  const res = await fetch("/api/auth/logout", { method: "POST" });
  if (!res.ok) await throwApiError(res);
}

export async function me(): Promise<User> {
  const res = await fetch("/api/auth/me");
  if (!res.ok) await throwApiError(res);
  return res.json() as Promise<User>;
}
