import * as z from "zod";

export const AssignmentSchema = z.object({
  classId: z.string().min(1, "Choose a class."),
  title: z.string().trim().min(1, "Enter a title.").max(160, "Title is too long (max 160 characters)."),
  dueAt: z.iso.datetime({ error: "Enter a valid due date." }),
  estimatedMinutes: z
    .number()
    .int()
    .min(5, "Estimate at least 5 minutes.")
    .max(1000, "Estimate 1000 minutes or less."),
  priority: z.enum(["LOW", "MEDIUM", "HIGH"]),
  /** Share of the course grade, in percent, when the student knows it. */
  weightPercent: z
    .number()
    .int("Use a whole percent.")
    .min(1, "Weight is at least 1%.")
    .max(100, "Weight is at most 100%.")
    .nullable()
    .optional(),
  status: z.enum(["NOT_STARTED", "IN_PROGRESS", "COMPLETED"]),
  notes: z.string().trim().max(2000, "Notes are too long (max 2000 characters).").optional(),
});

export type AssignmentInput = z.infer<typeof AssignmentSchema>;
