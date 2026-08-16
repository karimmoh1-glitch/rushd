import * as z from "zod";

export const ClassSchema = z.object({
  name: z.string().trim().min(1, "Enter a class name.").max(80, "Class name is too long (max 80 characters)."),
  teacher: z.string().trim().max(80, "Teacher name is too long (max 80 characters).").optional(),
  period: z.string().trim().max(40, "Period is too long (max 40 characters).").optional(),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/, "Invalid color."),
  priority: z.enum(["LOW", "MEDIUM", "HIGH"]),
});

export type ClassInput = z.infer<typeof ClassSchema>;
