import { z } from "zod";
import { DefIdSchema, UuidSchema } from "./common.js";

export const MonsterAttackSchema = z.object({
  name: z.string().min(1),
  harm: z.number().int().min(0),
  tags: z.array(z.string()).default([])
});
export type MonsterAttack = z.infer<typeof MonsterAttackSchema>;

export const MonsterSchema = z.object({
  id: UuidSchema,
  campaignId: UuidSchema,
  name: z.string().min(1),
  typeId: DefIdSchema.nullable().default(null),
  motivation: z.string().default(""),
  powers: z.array(z.string()).default([]),
  weaknesses: z.array(z.string()).default([]),
  attacks: z.array(MonsterAttackSchema).default([]),
  armor: z.number().int().min(0).default(0),
  harmCapacity: z.number().int().min(0),
  harmTaken: z.number().int().min(0).default(0),
  customMoves: z.array(z.string()).default([]),
  revealed: z.boolean().default(false)
});
export type Monster = z.infer<typeof MonsterSchema>;

export const MinionSchema = z.object({
  id: UuidSchema,
  campaignId: UuidSchema,
  name: z.string().min(1),
  typeId: DefIdSchema.nullable().default(null),
  motivation: z.string().default(""),
  attacks: z.array(MonsterAttackSchema).default([]),
  armor: z.number().int().min(0).default(0),
  harmCapacity: z.number().int().min(0),
  harmTaken: z.number().int().min(0).default(0),
  revealed: z.boolean().default(false)
});
export type Minion = z.infer<typeof MinionSchema>;

export const BystanderSchema = z.object({
  id: UuidSchema,
  campaignId: UuidSchema,
  name: z.string().min(1),
  typeId: DefIdSchema.nullable().default(null),
  motivation: z.string().default(""),
  notes: z.string().default(""),
  revealed: z.boolean().default(false)
});
export type Bystander = z.infer<typeof BystanderSchema>;

export const LocationSchema = z.object({
  id: UuidSchema,
  campaignId: UuidSchema,
  name: z.string().min(1),
  typeId: DefIdSchema.nullable().default(null),
  description: z.string().default(""),
  mapNotes: z.string().default(""),
  revealed: z.boolean().default(false)
});
export type Location = z.infer<typeof LocationSchema>;
