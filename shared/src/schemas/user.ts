import { z } from "zod";
import { UserIdSchema } from "./common.js";

/** Public-safe user shape: never includes password_hash. */
export const UserSchema = z.object({
  id: UserIdSchema,
  email: z.string().email(),
  displayName: z.string().min(1).max(100)
});
export type User = z.infer<typeof UserSchema>;

// Response shape for auth endpoints only: isAdmin is computed per-request
// from MOWC_ADMIN_EMAIL (server/src/authz/admin.ts), never stored on the
// user row, so it stays out of the plain User type used internally
// (req.user, authz, campaigns).
export const AuthUserSchema = UserSchema.extend({
  isAdmin: z.boolean()
});
export type AuthUser = z.infer<typeof AuthUserSchema>;

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
