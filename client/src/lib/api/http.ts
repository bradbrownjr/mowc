/**
 * Shared fetch error handling for the client API wrappers
 * (client/src/lib/api/auth.ts, campaigns.ts). Mirrors the pattern
 * contentPacks.ts established first: a validation-error array from
 * zodErrorResponse (server/src/http/validation.ts) collapsed into a single
 * readable Error message.
 */

export interface ApiValidationError {
  path: string;
  message: string;
}

export class ApiError extends Error {
  status: number;
  errors: ApiValidationError[];

  constructor(status: number, errors: ApiValidationError[]) {
    super(errors.map((e) => `${e.path ? `${e.path}: ` : ""}${e.message}`).join("; ") || `request failed with status ${status}`);
    this.status = status;
    this.errors = errors;
  }
}

export async function throwApiError(res: Response): Promise<never> {
  let errors: ApiValidationError[] = [];
  try {
    const body: unknown = await res.json();
    if (body && typeof body === "object" && Array.isArray((body as { errors?: unknown }).errors)) {
      errors = (body as { errors: ApiValidationError[] }).errors;
    }
  } catch {
    // Non-JSON error body (e.g. a proxy error page); fall back to the status.
  }
  throw new ApiError(res.status, errors);
}
