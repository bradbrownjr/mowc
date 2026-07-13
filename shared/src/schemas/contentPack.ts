import { z } from "zod";
import { DefIdSchema, RatingSchema, RatingsSchema, UuidSchema } from "./common.js";

export const RatingsLineSchema = RatingsSchema;
export type RatingsLine = z.infer<typeof RatingsLineSchema>;

export const MoveDefSchema = z.object({
  id: DefIdSchema,
  name: z.string().min(1),
  trigger: z.string(),
  rating: RatingSchema.nullable(),
  outcomes: z
    .object({
      full: z.string(),
      mixed: z.string(),
      miss: z.string()
    })
    .nullable(),
  tags: z.array(z.string()).default([])
});
export type MoveDef = z.infer<typeof MoveDefSchema>;

export const GearDefSchema = z.object({
  id: DefIdSchema,
  name: z.string().min(1),
  harm: z.number().int().nullable(),
  armor: z.number().int().nullable(),
  tags: z.array(z.string()).default([])
});
export type GearDef = z.infer<typeof GearDefSchema>;

export const NamedDefSchema = z.object({
  id: DefIdSchema,
  name: z.string().min(1),
  description: z.string().default("")
});
export type NamedDef = z.infer<typeof NamedDefSchema>;

export const MonsterTypeDefSchema = z.object({
  id: DefIdSchema,
  name: z.string().min(1),
  motivation: z.string()
});
export type MonsterTypeDef = z.infer<typeof MonsterTypeDefSchema>;

export const GearChoiceSchema = z.object({
  id: DefIdSchema,
  label: z.string().min(1),
  pick: z.number().int().min(1),
  options: z.array(GearDefSchema)
});
export type GearChoice = z.infer<typeof GearChoiceSchema>;

export const ImprovementEffectSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("ratingBump"),
    rating: RatingSchema,
    amount: z.number().int()
  }),
  z.object({
    kind: z.literal("addMove"),
    moveId: DefIdSchema.nullable()
  }),
  z.object({
    kind: z.literal("custom"),
    description: z.string()
  })
]);
export type ImprovementEffect = z.infer<typeof ImprovementEffectSchema>;

export const ImprovementDefSchema = z.object({
  id: DefIdSchema,
  text: z.string().min(1),
  effect: ImprovementEffectSchema
});
export type ImprovementDef = z.infer<typeof ImprovementDefSchema>;

export const ExtraDefSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("checklist"),
    id: DefIdSchema,
    title: z.string().min(1),
    items: z.array(z.string())
  }),
  z.object({
    kind: z.literal("counter"),
    id: DefIdSchema,
    title: z.string().min(1),
    max: z.number().int().min(1)
  }),
  z.object({
    kind: z.literal("text"),
    id: DefIdSchema,
    title: z.string().min(1)
  })
]);
export type ExtraDef = z.infer<typeof ExtraDefSchema>;

export const HarmTrackSchema = z.object({
  max: z.number().int().min(1).default(7),
  unstableAt: z.number().int().min(1).default(4)
});
export type HarmTrack = z.infer<typeof HarmTrackSchema>;

export const PlaybookDefSchema = z.object({
  id: DefIdSchema,
  name: z.string().min(1),
  blurb: z.string().default(""),
  ratingsLines: z.array(RatingsLineSchema),
  luckMax: z.number().int().min(0).default(7),
  harmTrack: HarmTrackSchema.default({}),
  looks: z.array(z.array(z.string())).default([]),
  moves: z.array(MoveDefSchema),
  movesToPick: z.number().int().min(0),
  gearChoices: z.array(GearChoiceSchema).default([]),
  improvements: z.array(ImprovementDefSchema).default([]),
  advancedImprovements: z.array(ImprovementDefSchema).default([]),
  extras: z.array(ExtraDefSchema).default([])
});
export type PlaybookDef = z.infer<typeof PlaybookDefSchema>;

export const ContentPackSchema = z.object({
  id: UuidSchema,
  name: z.string().min(1),
  author: z.string().min(1),
  version: z.string().min(1),
  playbooks: z.array(PlaybookDefSchema).default([]),
  basicMoves: z.array(MoveDefSchema).default([]),
  monsterTypes: z.array(MonsterTypeDefSchema).default([]),
  bystanderTypes: z.array(NamedDefSchema).default([]),
  minionTypes: z.array(NamedDefSchema).default([]),
  gear: z.array(GearDefSchema).default([])
});
export type ContentPack = z.infer<typeof ContentPackSchema>;
