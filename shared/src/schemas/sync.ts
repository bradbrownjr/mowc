import { z } from "zod";
import { UuidSchema } from "./common.js";

/**
 * Entity types that replicate through the sync envelope (docs/SYNC.md).
 * Character is hunter-owned; the five Keeper-owned world entities (mystery,
 * monster, minion, bystander, location) reuse the same push/pull machinery,
 * with per-type schema validation on the server.
 */
export const SyncEntityTypeSchema = z.enum([
  "character",
  "mystery",
  "monster",
  "minion",
  "bystander",
  "location"
]);
export type SyncEntityType = z.infer<typeof SyncEntityTypeSchema>;

/**
 * One queued local mutation pushed to the server. `patch` carries only the
 * changed top-level fields (the full payload for a brand-new entity), so the
 * server can apply it onto the current row and let two devices editing
 * different fields both survive (docs/SYNC.md invariant 1). `baseRev` is the
 * client rev the edit was based on; `ts` is the client write time, used as the
 * last-write-wins key for diverging fields.
 */
export const SyncOpSchema = z
  .object({
    opId: UuidSchema,
    entityId: UuidSchema,
    type: SyncEntityTypeSchema,
    baseRev: z.number().int().min(0),
    patch: z.record(z.string(), z.unknown()),
    deleted: z.boolean().default(false),
    ts: z.string().datetime()
  })
  .strict();
export type SyncOp = z.infer<typeof SyncOpSchema>;

/** Push body: a batch of ops, capped at 500 (docs/SECURITY.md section 4). */
export const SyncPushRequestSchema = z
  .object({
    ops: z.array(SyncOpSchema).max(500)
  })
  .strict();
export type SyncPushRequest = z.infer<typeof SyncPushRequestSchema>;

/**
 * A server envelope row as returned by pull. `payload` is left as unknown here;
 * the server validates it against the per-type schema for `type` (see the
 * server-side ENTITY_SCHEMAS map) before storing, and the client validates on
 * read.
 */
export const SyncEnvelopeSchema = z.object({
  id: UuidSchema,
  campaignId: UuidSchema,
  type: SyncEntityTypeSchema,
  payload: z.unknown(),
  rev: z.number().int(),
  seq: z.number().int(),
  updatedAt: z.string(),
  updatedBy: z.string(),
  deleted: z.boolean()
});
export type SyncEnvelope = z.infer<typeof SyncEnvelopeSchema>;

export const SyncConflictSchema = z.object({
  opId: UuidSchema,
  serverPayload: z.unknown()
});
export type SyncConflict = z.infer<typeof SyncConflictSchema>;

/**
 * Push response. `applied` opIds are removed from the client oplog; `conflicts`
 * report a concurrent server write so the UI can warn (Phase 7.4); `newSeq` is
 * the campaign's highest server seq after the batch.
 */
export const SyncPushResponseSchema = z.object({
  applied: z.array(UuidSchema),
  conflicts: z.array(SyncConflictSchema),
  newSeq: z.number().int()
});
export type SyncPushResponse = z.infer<typeof SyncPushResponseSchema>;

/** Pull response: visible rows with `seq > since`, and the new lastServerSeq. */
export const SyncPullResponseSchema = z.object({
  rows: z.array(SyncEnvelopeSchema),
  seq: z.number().int()
});
export type SyncPullResponse = z.infer<typeof SyncPullResponseSchema>;
