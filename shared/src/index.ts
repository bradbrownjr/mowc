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

export * from "./schemas/common.js";
export * from "./schemas/user.js";
export * from "./schemas/contentPack.js";
export * from "./schemas/campaign.js";
export * from "./schemas/invite.js";
export * from "./schemas/character.js";
export * from "./schemas/mystery.js";
export * from "./schemas/world.js";
export * from "./schemas/sessionLog.js";
