import { z } from "zod";

export const RatingSchema = z.enum(["charm", "cool", "sharp", "tough", "weird"]);
export type Rating = z.infer<typeof RatingSchema>;

export const RatingsSchema = z.object({
  charm: z.number().int(),
  cool: z.number().int(),
  sharp: z.number().int(),
  tough: z.number().int(),
  weird: z.number().int()
});
export type Ratings = z.infer<typeof RatingsSchema>;

export const UuidSchema = z.string().uuid();

export const DefIdSchema = z.string().min(1);

export const UserIdSchema = z.string().min(1);
