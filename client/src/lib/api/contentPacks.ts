import type { ContentPack } from "@mowc/shared";

export interface PackSummary {
  id: string;
  name: string;
  author: string;
  version: string;
  createdAt: string;
  updatedAt: string;
}

export interface PackDetail extends PackSummary {
  pack: ContentPack;
}

export interface PackValidationError {
  path: string;
  message: string;
}

export class PackApiError extends Error {
  errors: PackValidationError[];

  constructor(status: number, errors: PackValidationError[]) {
    super(errors.map((e) => `${e.path ? `${e.path}: ` : ""}${e.message}`).join("; ") || `request failed with status ${status}`);
    this.errors = errors;
  }
}

async function throwApiError(res: Response): Promise<never> {
  let errors: PackValidationError[] = [];
  try {
    const body: unknown = await res.json();
    if (body && typeof body === "object" && Array.isArray((body as { errors?: unknown }).errors)) {
      errors = (body as { errors: PackValidationError[] }).errors;
    }
  } catch {
    // Non-JSON error body (e.g. a proxy error page); fall back to the status.
  }
  throw new PackApiError(res.status, errors);
}

export async function listPacks(): Promise<PackSummary[]> {
  const res = await fetch("/api/content-packs");
  if (!res.ok) await throwApiError(res);
  return res.json() as Promise<PackSummary[]>;
}

export async function getPack(id: string): Promise<PackDetail> {
  const res = await fetch(`/api/content-packs/${encodeURIComponent(id)}`);
  if (!res.ok) await throwApiError(res);
  return res.json() as Promise<PackDetail>;
}

export async function createPack(pack: ContentPack): Promise<PackSummary> {
  const res = await fetch("/api/content-packs", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(pack)
  });
  if (!res.ok) await throwApiError(res);
  return res.json() as Promise<PackSummary>;
}

export async function deletePack(id: string): Promise<void> {
  const res = await fetch(`/api/content-packs/${encodeURIComponent(id)}`, { method: "DELETE" });
  if (!res.ok) await throwApiError(res);
}
