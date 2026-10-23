import * as z from "zod";
import { isValidTimeZone } from "@/lib/validation/time-zone";
import { LEVEL_VALUES } from "@/lib/courses/catalog/levels";
import { ClassSchema } from "@/lib/validation/classes";
import { ACADEMIC_CHALLENGES } from "@/lib/validation/onboarding";

// What finishing onboarding sends. Kept apart from validation/onboarding.ts
// (challenge options used by Settings) so Settings doesn't load the course
// catalog that ClassSchema checks catalog ids against.

/** Most courses and work items one onboarding can add. */
export const ONBOARDING_MAX_COURSES = 20;
export const ONBOARDING_MAX_WORK = 30;

const OnboardingWorkSchema = z.object({
  kind: z.enum(["assignment", "exam"]),
  title: z.string().trim().min(1, "Every item needs a title.").max(160, "Item titles can be at most 160 characters."),
  /** Index into `courses`. */
  courseIndex: z.number().int().min(0),
  dueAt: z.iso.datetime(),
  minutes: z.number().int().min(5).max(600),
});

export const OnboardingSchema = z
  .object({
    // Only the level and (unless skipped) one course matter; everything else is optional.
    displayName: z.string().trim().max(60, "Name is too long (max 60 characters).").optional().default(""),
    studyLevel: z.enum(LEVEL_VALUES).nullable().optional().default(null),
    grade: z.number().int().min(9, "Grade must be between 9 and 12.").max(12, "Grade must be between 9 and 12.").nullable().optional().default(null),
    school: z.string().trim().max(120, "School name is too long (max 120 characters).").optional(),
    timezone: z.string().refine(isValidTimeZone, { error: "Unrecognized timezone." }),
    goals: z.string().trim().max(500, "Goals are too long (max 500 characters).").optional(),
    primaryChallenge: z.enum(ACADEMIC_CHALLENGES).nullable().optional().default(null),
    availability: z
      .array(
        z.object({
          dayOfWeek: z.number().int().min(0).max(6),
          startMinute: z.number().int().min(0).max(1439),
          endMinute: z.number().int().min(1).max(1440),
        }),
      )
      .max(40, "Too many availability windows."),
    /** Each course is validated like one added from the Courses page (ClassSchema). */
    courses: z.array(ClassSchema).max(ONBOARDING_MAX_COURSES, "Too many courses at once. Add the rest after setup.").default([]),
    work: z.array(OnboardingWorkSchema).max(ONBOARDING_MAX_WORK, "That's a lot at once. Add the rest from Today.").default([]),
    preferredSessionMinutes: z.union([z.literal(30), z.literal(45), z.literal(60), z.literal(90)]).optional(),
    emailReminders: z.boolean().optional().default(false),
  })
  .refine((data) => data.work.every((item) => item.courseIndex < data.courses.length), {
    message: "Every item needs one of your courses.",
    path: ["work"],
  });

export type OnboardingInput = z.input<typeof OnboardingSchema>;
export type OnboardingData = z.output<typeof OnboardingSchema>;
