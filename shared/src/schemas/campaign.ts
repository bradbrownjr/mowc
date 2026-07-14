import { z } from "zod";
import { UserIdSchema, UuidSchema } from "./common.js";

export const CampaignSchema = z.object({
  id: UuidSchema,
  name: z.string().min(1).max(100),
  keeperUserId: UserIdSchema,
  packIds: z.array(UuidSchema).default([]),
  settings: z.record(z.string(), z.unknown()).default({}),
  theme: z.string().max(50).default("default")
});
export type Campaign = z.infer<typeof CampaignSchema>;

export const CampaignCreateInputSchema = z.object({
  name: z.string().min(1).max(100)
});
export type CampaignCreateInput = z.infer<typeof CampaignCreateInputSchema>;

export const CampaignUpdateInputSchema = z
  .object({
    name: z.string().min(1).max(100),
    packIds: z.array(UuidSchema),
    settings: z.record(z.string(), z.unknown()),
    theme: z.string().max(50)
  })
  .partial();
export type CampaignUpdateInput = z.infer<typeof CampaignUpdateInputSchema>;

export const SeatRoleSchema = z.enum(["keeper", "hunter"]);
export type SeatRole = z.infer<typeof SeatRoleSchema>;

export const SeatSchema = z.object({
  campaignId: UuidSchema,
  userId: UserIdSchema,
  role: SeatRoleSchema
});
export type Seat = z.infer<typeof SeatSchema>;
