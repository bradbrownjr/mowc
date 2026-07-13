import { z } from "zod";
import { UuidSchema } from "./common.js";

export const CountdownStepSchema = z.object({
  label: z.string(),
  text: z.string(),
  done: z.boolean().default(false)
});
export type CountdownStep = z.infer<typeof CountdownStepSchema>;

export const CountdownSchema = z.object({
  steps: z.array(CountdownStepSchema).default([])
});
export type Countdown = z.infer<typeof CountdownSchema>;

export const MysteryStatusSchema = z.enum(["draft", "active", "resolved"]);
export type MysteryStatus = z.infer<typeof MysteryStatusSchema>;

export const MysterySchema = z.object({
  id: UuidSchema,
  campaignId: UuidSchema,
  title: z.string().min(1),
  concept: z.string().default(""),
  hook: z.string().default(""),
  status: MysteryStatusSchema.default("draft"),
  countdown: CountdownSchema.default({}),
  locationIds: z.array(UuidSchema).default([]),
  monsterIds: z.array(UuidSchema).default([]),
  minionIds: z.array(UuidSchema).default([]),
  bystanderIds: z.array(UuidSchema).default([]),
  keeperNotes: z.string().default(""),
  revealed: z.boolean().default(false)
});
export type Mystery = z.infer<typeof MysterySchema>;
