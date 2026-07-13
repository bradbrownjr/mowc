import { z } from "zod";
import { UserIdSchema, UuidSchema } from "./common.js";

export const CampaignSchema = z.object({
  id: UuidSchema,
  name: z.string().min(1),
  keeperUserId: UserIdSchema,
  packIds: z.array(UuidSchema).default([]),
  settings: z.record(z.string(), z.unknown()).default({}),
  theme: z.string().default("default")
});
export type Campaign = z.infer<typeof CampaignSchema>;

export const SeatRoleSchema = z.enum(["keeper", "hunter"]);
export type SeatRole = z.infer<typeof SeatRoleSchema>;

export const SeatSchema = z.object({
  campaignId: UuidSchema,
  userId: UserIdSchema,
  role: SeatRoleSchema
});
export type Seat = z.infer<typeof SeatSchema>;
