import * as z from "zod";
import { ASSESSMENT_TYPES } from "./types";
import { MAX_SYLLABUS_CHARS } from "./parse";

// What the review screen sends on Confirm: only the rows the student kept,
// as they edited them. Validated again on the server; nothing in it is trusted.

const DateKey = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Pick a date.");
const TimeOfDay = z.string().regex(/^\d{2}:\d{2}$/);

export const ConfirmSyllabusSchema = z.object({
  classId: z.string().min(1).max(64),
  text: z.string().min(20, "The syllabus text is missing.").max(MAX_SYLLABUS_CHARS + 1000),
  sourceName: z.string().trim().max(120).nullable(),
  method: z.enum(["rules", "ai"]),
  assessments: z
    .array(
      z.object({
        title: z.string().trim().min(1, "Every item needs a title.").max(160),
        type: z.enum(ASSESSMENT_TYPES),
        date: DateKey,
        time: TimeOfDay.nullable(),
        weight: z.number().min(0).max(100).nullable(),
        /** The student chose to add it even though it matches existing work. */
        allowDuplicate: z.boolean(),
        snippet: z.string().max(400).nullable(),
      }),
    )
    .max(150),
  topics: z.array(z.object({ title: z.string().trim().min(1).max(120), parentTitle: z.string().trim().max(120).nullable() })).max(150),
  objectives: z.array(z.string().trim().min(1).max(300)).max(60),
  grading: z.array(z.object({ label: z.string().trim().min(1).max(120), weight: z.number().min(0).max(100) })).max(30),
  /** Course details the student ticked to save; null means leave it as it is. */
  course: z.object({
    termStart: DateKey.nullable(),
    termEnd: DateKey.nullable(),
    code: z.string().trim().min(1).max(40).nullable(),
    instructor: z.string().trim().min(1).max(80).nullable(),
  }),
  /** How many rows the student left out, for the summary event (a count only). */
  excluded: z.number().int().min(0).max(1000),
});

export type ConfirmSyllabusInput = z.infer<typeof ConfirmSyllabusSchema>;
