import { z } from "zod";

/** 128-bit random invite code, hex-encoded (docs/SECURITY.md section 2). */
export const InviteCodeSchema = z.string().regex(/^[0-9a-f]{32}$/, "invalid invite code");

export const InviteRedeemInputSchema = z.object({
  code: InviteCodeSchema
});
export type InviteRedeemInput = z.infer<typeof InviteRedeemInputSchema>;
