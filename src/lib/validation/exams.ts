import * as z from "zod";

export const ExamSchema = z.object({
  classId: z.string().min(1, "Choose a class."),
  title: z.string().trim().min(1, "Enter a title.").max(160),
  examAt: z.iso.datetime({ error: "Enter a valid exam date." }),
  prepMinutes: z.number().int().min(15).max(3000),
  priority: z.enum(["LOW", "MEDIUM", "HIGH"]),
  notes: z.string().trim().max(2000).optional(),
});

export type ExamInput = z.infer<typeof ExamSchema>;
