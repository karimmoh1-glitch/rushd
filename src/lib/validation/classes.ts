import * as z from "zod";
import { LEVEL_VALUES } from "@/lib/courses/catalog/levels";
import { isCatalogId } from "@/lib/courses/catalog";

/** Optional free text: trimmed, with "" treated as "not given". */
function optionalText(max: number, label: string) {
  return z
    .string()
    .trim()
    .max(max, `${label} is too long (max ${max} characters).`)
    .optional()
    .transform((value) => (value ? value : undefined));
}

/** "YYYY-MM-DD" from a date input, between 2000 and 2100. */
const optionalDate = z
  .string()
  .trim()
  .optional()
  .transform((value) => (value ? value : undefined))
  .refine((value) => value === undefined || isRealDate(value), "Enter a real date.");

function isRealDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  if (year < 2000 || year > 2100) return false;
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

export const ClassSchema = z
  .object({
    name: z.string().trim().min(1, "Enter a class name.").max(80, "Class name is too long (max 80 characters)."),
    teacher: z.string().trim().max(80, "Teacher name is too long (max 80 characters).").optional(),
    period: z.string().trim().max(40, "Period is too long (max 40 characters).").optional(),
    color: z.string().regex(/^#[0-9a-fA-F]{6}$/, "Invalid color."),
    priority: z.enum(["LOW", "MEDIUM", "HIGH"]),
    // Course details: all optional.
    level: z.enum(LEVEL_VALUES).optional(),
    code: optionalText(30, "Course code").refine(
      (value) => value === undefined || /^[\p{L}\p{N} .\-/&:#]+$/u.test(value),
      "Course codes can use letters, numbers, spaces, and - . / & : #.",
    ),
    institution: optionalText(120, "School name"),
    subject: optionalText(60, "Subject"),
    termStart: optionalDate,
    termEnd: optionalDate,
    weeklyHours: z
      .number()
      .int("Use whole hours.")
      .min(1, "Weekly study time must be at least 1 hour.")
      .max(40, "Weekly study time can be at most 40 hours.")
      .optional(),
    // The catalog course this was picked from; absent for a custom course.
    catalogId: z
      .string()
      .optional()
      .transform((value) => (value ? value : undefined))
      .refine((value) => value === undefined || isCatalogId(value), "Unknown catalog course."),
  })
  .refine((course) => !course.termStart || !course.termEnd || course.termEnd >= course.termStart, {
    message: "The term can't end before it starts.",
    path: ["termEnd"],
  });

export type ClassInput = z.input<typeof ClassSchema>;
export type ClassData = z.output<typeof ClassSchema>;
