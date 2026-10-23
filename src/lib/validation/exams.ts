import * as z from "zod";

export const ExamSchema = z.object({
  classId: z.string().min(1, "Choose a class."),
  title: z.string().trim().min(1, "Enter a title.").max(160, "Title is too long (max 160 characters)."),
  examAt: z.iso.datetime({ error: "Enter a valid exam date." }),
  prepMinutes: z
    .number()
    .int()
    .min(15, "Estimate at least 15 minutes.")
    .max(3000, "Estimate 3000 minutes or less."),
  priority: z.enum(["LOW", "MEDIUM", "HIGH"]),
  /** Share of the course grade, in percent, when the student knows it. */
  weightPercent: z
    .number()
    .int("Use a whole percent.")
    .min(1, "Weight is at least 1%.")
    .max(100, "Weight is at most 100%.")
    .nullable()
    .optional(),
  notes: z.string().trim().max(2000, "Notes are too long (max 2000 characters).").optional(),
});

export type ExamInput = z.infer<typeof ExamSchema>;
