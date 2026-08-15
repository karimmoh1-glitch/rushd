import * as z from "zod";

export const ClassSchema = z.object({
  name: z.string().trim().min(1, "Enter a class name.").max(80),
  teacher: z.string().trim().max(80).optional(),
  period: z.string().trim().max(40).optional(),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/, "Invalid color."),
  priority: z.enum(["LOW", "MEDIUM", "HIGH"]),
});

export type ClassInput = z.infer<typeof ClassSchema>;
