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
  displayName: z.string().trim().min(1, "Enter a name.").max(60),
  grade: z.number().int().min(9).max(12).nullable(),
  school: z.string().trim().max(120).optional(),
  timezone: z.string().refine(isValidTimeZone, { error: "Unrecognized timezone." }),
  goals: z.string().trim().max(500).optional(),
  availability: z
    .array(
      z.object({
        dayOfWeek: z.number().int().min(0).max(6),
        startMinute: z.number().int().min(0).max(1439),
        endMinute: z.number().int().min(1).max(1440),
      }),
    )
    .max(40),
  classes: z
    .array(
      z.object({
        name: z.string().trim().min(1).max(80),
        color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
        teacher: z.string().trim().max(80).optional(),
      }),
    )
    .max(20),
});

export type OnboardingInput = z.infer<typeof OnboardingSchema>;
