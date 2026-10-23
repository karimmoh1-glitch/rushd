import * as z from "zod";

// What both the AI parser and the fallback parser produce. AI output is
// validated against this before it is shown or saved.
export const QuickAddDraftSchema = z.object({
  kind: z.enum(["assignment", "exam"]),
  title: z.string().trim().min(1).max(160),
  classId: z.string().nullable(),
  dueAt: z.iso.datetime().nullable(),
  minutes: z.number().int().min(5).max(3000),
  priority: z.enum(["LOW", "MEDIUM", "HIGH"]),
});

export type QuickAddDraft = z.infer<typeof QuickAddDraftSchema>;

const ConfidenceSchema = z.enum(["high", "medium", "low"]);

// One assignment read from a screenshot. Also validated before the app uses it.
const ExtractedAssignmentSchema = z.object({
  title: z.string().trim().min(1).max(160),
  kind: z.enum(["assignment", "exam"]),
  classId: z.string().nullable(),
  classNameGuess: z.string().trim().max(80).nullable(),
  dueAt: z.iso.datetime().nullable(),
  dueDateConfidence: ConfidenceSchema,
  estimatedMinutes: z.number().int().min(5).max(3000),
  effortConfidence: ConfidenceSchema,
  notes: z.string().trim().max(500).nullable(),
});

export const ExtractedAssignmentListSchema = z.object({
  assignments: z.array(ExtractedAssignmentSchema).max(40),
});
