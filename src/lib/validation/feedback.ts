import * as z from "zod";

export const FeedbackSchema = z.object({
  context: z.string().trim().min(1).max(40).default("general"),
  rating: z.number().int().min(1).max(5).nullable(),
  message: z.string().trim().max(2000).optional(),
});
export type FeedbackInput = z.infer<typeof FeedbackSchema>;
