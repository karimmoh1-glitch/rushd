import * as z from "zod";

// Request bodies for /api/v1. Field rules match the web forms
// (src/lib/validation/assignments.ts), so both reject the same input.

const title = z.string().trim().min(1, "Enter a title.").max(160, "Title is too long (max 160 characters).");
const dueAt = z.iso.datetime({ offset: true, error: "Enter a valid due date (ISO 8601)." });
const estimatedMinutes = z
  .number()
  .int()
  .min(5, "Estimate at least 5 minutes.")
  .max(1000, "Estimate 1000 minutes or less.");
const priority = z.enum(["LOW", "MEDIUM", "HIGH"]);
const status = z.enum(["NOT_STARTED", "IN_PROGRESS", "COMPLETED"]);
const notes = z.string().trim().max(2000, "Notes are too long (max 2000 characters).");
const id = z.string().min(1).max(64);

export const CreateAssignmentBody = z.object({
  courseId: id,
  title,
  dueAt,
  estimatedMinutes: estimatedMinutes.default(30),
  priority: priority.default("MEDIUM"),
  notes: notes.optional(),
});

export const UpdateAssignmentBody = z
  .object({
    courseId: id.optional(),
    title: title.optional(),
    dueAt: dueAt.optional(),
    estimatedMinutes: estimatedMinutes.optional(),
    priority: priority.optional(),
    status: status.optional(),
    notes: notes.nullable().optional(),
  })
  .refine((body) => Object.keys(body).length > 0, { error: "Send at least one field to change." });

export const AssignmentListQuery = z.enum(["open", "completed", "all"]).default("open");

export const StartSessionBody = z.union([
  z.object({ assignmentId: id, source: z.enum(["PLANNED", "MANUAL"]).default("MANUAL") }).strict(),
  z.object({ examId: id, source: z.enum(["PLANNED", "MANUAL"]).default("MANUAL") }).strict(),
]);

export const CompleteSessionBody = z.object({
  actualMinutes: z.number().int().min(1, "Enter at least 1 minute.").max(1000, "Enter 1000 minutes or less."),
  difficulty: z.enum(["EASIER", "AS_EXPECTED", "HARDER"]).optional(),
});

export const AbandonSessionBody = z.object({
  reason: z
    .enum(["RAN_OUT_OF_TIME", "HARDER_THAN_EXPECTED", "GOT_DISTRACTED", "NEED_HELP", "SOMETHING_CAME_UP", "OTHER"])
    .optional(),
});
