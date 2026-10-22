import * as z from "zod";
import { ACADEMIC_CHALLENGES } from "@/lib/validation/onboarding";

function isValidTimeZone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

export const ProfileSettingsSchema = z.object({
  displayName: z.string().trim().min(1, "Enter a name.").max(60, "Name is too long (max 60 characters)."),
  grade: z.number().int().min(9, "Grade must be between 9 and 12.").max(12, "Grade must be between 9 and 12.").nullable(),
  school: z.string().trim().max(120, "School name is too long (max 120 characters).").optional(),
  timezone: z.string().refine(isValidTimeZone, { error: "Unrecognized timezone." }),
  goals: z.string().trim().max(500, "Goals are too long (max 500 characters).").optional(),
  primaryChallenge: z.enum(ACADEMIC_CHALLENGES).nullable(),
});
export type ProfileSettingsInput = z.infer<typeof ProfileSettingsSchema>;

export const AvailabilitySettingsSchema = z.object({
  presetIds: z.array(z.string()).max(10, "Too many availability windows."),
});
export type AvailabilitySettingsInput = z.infer<typeof AvailabilitySettingsSchema>;

export const ChangePasswordSchema = z.object({
  currentPassword: z.string().min(1, "Enter your current password."),
  newPassword: z
    .string()
    .min(8, "Use at least 8 characters.")
    .regex(/[a-zA-Z]/, "Include at least one letter.")
    .regex(/[0-9]/, "Include at least one number."),
});
export type ChangePasswordInput = z.infer<typeof ChangePasswordSchema>;

export const PlanningPreferencesSchema = z.object({
  preferredSessionMinutes: z.union([z.literal(30), z.literal(45), z.literal(60), z.literal(90)], {
    error: "Choose 30, 45, 60, or 90 minutes.",
  }),
  maxDailyMinutes: z
    .number()
    .int()
    .min(30, "Allow at least 30 minutes a day.")
    .max(720, "12 hours a day is the most Rushd will plan."),
});
export type PlanningPreferencesInput = z.infer<typeof PlanningPreferencesSchema>;
