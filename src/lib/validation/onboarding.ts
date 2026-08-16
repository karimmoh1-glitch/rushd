import * as z from "zod";

function isValidTimeZone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

export const OnboardingSchema = z.object({
  displayName: z.string().trim().min(1, "Enter a name.").max(60, "Name is too long (max 60 characters)."),
  grade: z.number().int().min(9, "Grade must be between 9 and 12.").max(12, "Grade must be between 9 and 12.").nullable(),
  school: z.string().trim().max(120, "School name is too long (max 120 characters).").optional(),
  timezone: z.string().refine(isValidTimeZone, { error: "Unrecognized timezone." }),
  goals: z.string().trim().max(500, "Goals are too long (max 500 characters).").optional(),
  availability: z
    .array(
      z.object({
        dayOfWeek: z.number().int().min(0).max(6),
        startMinute: z.number().int().min(0).max(1439),
        endMinute: z.number().int().min(1).max(1440),
      }),
    )
    .max(40, "Too many availability windows."),
  classes: z
    .array(
      z.object({
        name: z.string().trim().min(1).max(80, "Class name is too long (max 80 characters)."),
        color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
        teacher: z.string().trim().max(80, "Teacher name is too long (max 80 characters).").optional(),
      }),
    )
    .max(20, "Too many classes at once — add the rest after onboarding."),
});

export type OnboardingInput = z.infer<typeof OnboardingSchema>;
