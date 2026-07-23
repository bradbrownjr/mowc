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

// Shared shape for monster/minion/bystander/location archetypes. All four
// categories use "motivation" as the semantic concept in Monster of the Week
// (e.g. a monster wants "to placeholder"), so one schema serves them all.
export const ArchetypeDefSchema = z.object({
  id: DefIdSchema,
  name: z.string().min(1).max(100),
  motivation: z.string().max(500).default("")
});
export type ArchetypeDef = z.infer<typeof ArchetypeDefSchema>;

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

// A section inside a composite extra: either a pick-list or a free-text
// prompt. `pick` is intentionally int-or-string: source playbooks use counts
// ("pick 1") but also prose rules ("2+", "a Base and an extra, or two Bases")
// that cannot be reduced to a number without losing meaning.
export const ExtraSectionSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("pick"),
    id: DefIdSchema,
    title: z.string().min(1).max(100),
    pick: z.union([z.number().int().min(1), z.string().min(1).max(200)]),
    options: z.array(z.string().max(2000))
  }),
  z.object({
    kind: z.literal("text"),
    id: DefIdSchema,
    title: z.string().min(1).max(100),
    prompt: z.string().max(2000)
  })
]);
export type ExtraSection = z.infer<typeof ExtraSectionSchema>;

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
  }),
  // Multi-part playbook widget (fate, breed, background/heat/underworld):
  // an intro blurb plus ordered sections. Uses `title` like its siblings so
  // rendering code has one label field across every extra kind.
  z.object({
    kind: z.literal("composite"),
    id: DefIdSchema,
    title: z.string().min(1).max(100),
    text: z.string().max(5000).default(""),
    sections: z.array(ExtraSectionSchema),
    suggestions: z.array(z.string().max(2000)).default([])
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

// Player-facing reference text from the hunter sheets. Every field is
// optional: a playbook-only pack carries none of this.
export const CoreRulesSchema = z.object({
  roll: z.string().max(2000).optional(),
  harm: HarmTrackSchema.extend({ text: z.string().max(5000).default("") }).optional(),
  luck: z
    .object({
      max: z.number().int().min(0).default(7),
      text: z.string().max(5000).default("")
    })
    .optional(),
  recovery: z.string().max(5000).optional(),
  levelingUp: z.string().max(5000).optional(),
  endOfSession: z.string().max(5000).optional()
});
export type CoreRules = z.infer<typeof CoreRulesSchema>;

// Keeper move lists from the Keeper sheets. Harm moves are ordered tiers
// with presentational labels ("0-harm or more") kept as data, not object
// keys, so display order survives serialization.
export const KeeperMovesSchema = z.object({
  basic: z.array(z.string().max(500)).default([]),
  monster: z.array(z.string().max(500)).default([]),
  minion: z.array(z.string().max(500)).default([]),
  bystander: z.array(z.string().max(500)).default([]),
  location: z.array(z.string().max(500)).default([]),
  harm: z
    .object({
      note: z.string().max(2000).default(""),
      tiers: z.array(
        z.object({
          label: z.string().min(1).max(100),
          effects: z.array(z.string().max(500))
        })
      )
    })
    .optional()
});
export type KeeperMoves = z.infer<typeof KeeperMovesSchema>;

export const MysteryCreationSchema = z.object({
  steps: z.array(
    z.object({
      step: z.string().min(1).max(100),
      prompts: z.array(z.string().max(2000)).default([]),
      countdownSteps: z.array(z.string().max(100)).optional()
    })
  )
});
export type MysteryCreation = z.infer<typeof MysteryCreationSchema>;

export const PACK_FORMAT = "mowc-content-pack/v1";

export const ContentPackSchema = z.object({
  id: UuidSchema,
  name: z.string().min(1),
  author: z.string().min(1),
  version: z.string().min(1),
  // File-format tag; the only known version is v1. Optional so minimal
  // fixtures and pre-tag packs still validate.
  $format: z.literal(PACK_FORMAT).optional(),
  license: z.string().max(1000).optional(),
  // Free-text flags from a transcriber (human or automated PDF conversion)
  // for anything it could not confidently transcribe. Flag, never guess.
  conversionNotes: z.array(z.string().max(5000)).optional(),
  playbooks: z.array(PlaybookDefSchema).default([]),
  basicMoves: z.array(MoveDefSchema).default([]),
  monsterTypes: z.array(ArchetypeDefSchema).default([]),
  bystanderTypes: z.array(ArchetypeDefSchema).default([]),
  minionTypes: z.array(ArchetypeDefSchema).default([]),
  locationTypes: z.array(ArchetypeDefSchema).default([]),
  gear: z.array(GearDefSchema).default([]),
  // Reference/guidance text (agendas, principles, Keeper aids). Metadata,
  // not gameplay-critical; all optional (absent stays absent, unlike the
  // game-content arrays above, which default to []).
  hunterAgenda: z.array(z.string().max(500)).optional(),
  coreRules: CoreRulesSchema.optional(),
  keeperAgenda: z.array(z.string().max(500)).optional(),
  keeperPrinciples: z.array(z.string().max(500)).optional(),
  alwaysSay: z.array(z.string().max(500)).optional(),
  keeperMoves: KeeperMovesSchema.optional(),
  mysteryCreation: MysteryCreationSchema.optional(),
  monsterGuidance: z.string().max(5000).optional(),
  minionGuidance: z.string().max(5000).optional(),
  bystanderGuidance: z.string().max(5000).optional(),
  locationGuidance: z.string().max(5000).optional(),
  customMoveGuidance: z.string().max(5000).optional()
});
export type ContentPack = z.infer<typeof ContentPackSchema>;

// PATCH /api/content-packs/:id body: the only mutable field outside of
// re-upload is the owner's "disabled" toggle (pack-list management).
export const ContentPackDisabledUpdateSchema = z.object({
  disabled: z.boolean()
});
export type ContentPackDisabledUpdate = z.infer<typeof ContentPackDisabledUpdateSchema>;
