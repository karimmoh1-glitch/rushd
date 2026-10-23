import * as z from "zod";
import { ASSESSMENT_TYPES } from "@/lib/syllabus/types";

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

// Generated practice questions (src/lib/learning/practice.ts). Validated before
// anything is stored; stored items are always labeled AI-generated and unverified.
export const GeneratedQuestionSchema = z.object({
  prompt: z.string().trim().min(5).max(1200),
  answer: z.string().trim().min(1).max(2000),
  explanation: z.string().trim().max(1500).nullable(),
  hints: z.array(z.string().trim().min(1).max(300)).max(3),
  difficulty: z.number().int().min(1).max(3),
});
export const GeneratedQuestionListSchema = z.object({
  questions: z.array(GeneratedQuestionSchema).min(1).max(5),
});
export type GeneratedQuestion = z.infer<typeof GeneratedQuestionSchema>;

// Syllabus extraction (src/lib/syllabus). Every item quotes the line it came
// from; src/lib/syllabus/normalize-ai.ts checks each quote against the real
// text before anything is shown, and drops course details it can't find.
const SyllabusQuote = z.string().trim().min(1).max(400);
const AiCourseField = z.object({ value: z.string().trim().min(1).max(200), source: SyllabusQuote }).nullable();
export const SyllabusAiSchema = z.object({
  course: z.object({
    title: AiCourseField,
    code: AiCourseField,
    instructor: AiCourseField,
    term: AiCourseField,
    termStart: AiCourseField,
    termEnd: AiCourseField,
  }),
  assessments: z
    .array(
      z.object({
        title: z.string().trim().min(1).max(160),
        type: z.enum(ASSESSMENT_TYPES),
        date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
        time: z.string().regex(/^\d{2}:\d{2}$/).nullable(),
        dateText: z.string().trim().max(80).nullable(),
        weight: z.number().min(0).max(100).nullable(),
        confidence: ConfidenceSchema,
        note: z.string().trim().max(200).nullable(),
        source: SyllabusQuote,
      }),
    )
    .max(120),
  topics: z
    .array(
      z.object({
        title: z.string().trim().min(1).max(120),
        parentTitle: z.string().trim().max(120).nullable(),
        week: z.number().int().min(1).max(60).nullable(),
        confidence: ConfidenceSchema,
        source: SyllabusQuote,
      }),
    )
    .max(120),
  objectives: z.array(z.object({ text: z.string().trim().min(1).max(300), source: SyllabusQuote })).max(40),
  grading: z.array(z.object({ label: z.string().trim().min(1).max(120), weight: z.number().min(0).max(100), source: SyllabusQuote })).max(30),
});
export type SyllabusAiResult = z.infer<typeof SyllabusAiSchema>;
