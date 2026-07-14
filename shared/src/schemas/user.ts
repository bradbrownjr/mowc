import { z } from "zod";
import { UserIdSchema } from "./common.js";

/** Public-safe user shape: never includes password_hash. */
export const UserSchema = z.object({
  id: UserIdSchema,
  email: z.string().email(),
  displayName: z.string().min(1).max(100)
});
export type User = z.infer<typeof UserSchema>;

export const PasswordSchema = z.string().min(8).max(128);

export const RegisterInputSchema = z.object({
  email: z.string().email().max(254),
  password: PasswordSchema,
  displayName: z.string().min(1).max(100)
});
export type RegisterInput = z.infer<typeof RegisterInputSchema>;

export const LoginInputSchema = z.object({
  email: z.string().email().max(254),
  password: z.string().min(1).max(128)
});
export type LoginInput = z.infer<typeof LoginInputSchema>;
