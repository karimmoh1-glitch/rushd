import * as z from "zod";

/** Structured shape both the AI parser and the deterministic fallback
 * parser must produce. AI output is validated against this before it's
 * ever shown to the user or written to the database — see docs/ARCHITECTURE.md
 * "AI is used only for two narrow, schema-validated tasks." */
export const QuickAddDraftSchema = z.object({
  kind: z.enum(["assignment", "exam"]),
  title: z.string().trim().min(1).max(160),
  classId: z.string().nullable(),
  dueAt: z.iso.datetime().nullable(),
  minutes: z.number().int().min(5).max(3000),
  priority: z.enum(["LOW", "MEDIUM", "HIGH"]),
});

export type QuickAddDraft = z.infer<typeof QuickAddDraftSchema>;
