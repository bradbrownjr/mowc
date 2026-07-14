import type { ZodError } from "zod";

/** Shared shape for every zod-rejection response (docs/SECURITY.md section 1). */
export function zodErrorResponse(error: ZodError): { errors: { path: string; message: string }[] } {
  return {
    errors: error.issues.map((issue) => ({ path: issue.path.join("."), message: issue.message }))
  };
}
