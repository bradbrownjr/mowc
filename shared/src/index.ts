import { z } from "zod";

/**
 * Placeholder schema for the pipeline. The server's real healthz route
 * (Express server skeleton, task 0.1.3) will return a value matching this
 * shape, and the client will validate it with this same schema.
 */
export const HealthzResponseSchema = z.object({
  status: z.literal("ok"),
  version: z.string()
});

export type HealthzResponse = z.infer<typeof HealthzResponseSchema>;
