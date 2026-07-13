import { z } from "zod";
import { UserIdSchema, UuidSchema } from "./common.js";

export const SessionLogEntryKindSchema = z.enum([
  "roll",
  "harm",
  "luck",
  "reveal",
  "countdown",
  "note"
]);
export type SessionLogEntryKind = z.infer<typeof SessionLogEntryKindSchema>;

export const SessionLogEntrySchema = z.object({
  ts: z.string().datetime(),
  userId: UserIdSchema,
  kind: SessionLogEntryKindSchema,
  payload: z.record(z.string(), z.unknown()).default({})
});
export type SessionLogEntry = z.infer<typeof SessionLogEntrySchema>;

export const SessionLogSchema = z.object({
  id: UuidSchema,
  campaignId: UuidSchema,
  entries: z.array(SessionLogEntrySchema).default([])
});
export type SessionLog = z.infer<typeof SessionLogSchema>;
