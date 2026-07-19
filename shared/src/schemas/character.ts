import { z } from "zod";
import { DefIdSchema, RatingsSchema, UserIdSchema, UuidSchema } from "./common.js";
import { GearDefSchema } from "./contentPack.js";

export const CharacterSchema = z.object({
  id: UuidSchema,
  // null = a standalone character that belongs to no campaign (a player whose
  // Keeper runs from paper, or one trying the app solo). Standalone rows sync
  // under an owner-bucketed scope, not a campaign (docs/SYNC.md, docs/DATA-MODEL.md).
  campaignId: UuidSchema.nullable(),
  ownerUserId: UserIdSchema,
  playbookId: DefIdSchema,
  name: z.string().min(1).max(100),
  look: z.string().max(5000).default(""),
  ratings: RatingsSchema,
  luckSpent: z.number().int().min(0).default(0),
  harm: z.number().int().min(0).default(0),
  unstable: z.boolean().default(false),
  experience: z.number().int().min(0).default(0),
  moves: z.array(DefIdSchema).default([]),
  improvements: z.array(DefIdSchema).default([]),
  gear: z.array(GearDefSchema).default([]),
  extrasState: z.record(z.string(), z.unknown()).default({}),
  notes: z.string().max(5000).default("")
});
export type Character = z.infer<typeof CharacterSchema>;
