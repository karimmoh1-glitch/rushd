import * as z from "zod";

function isValidTimeZone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

export const ProfileSettingsSchema = z.object({
  displayName: z.string().trim().min(1, "Enter a name.").max(60),
  grade: z.number().int().min(9).max(12).nullable(),
  school: z.string().trim().max(120).optional(),
  timezone: z.string().refine(isValidTimeZone, { error: "Unrecognized timezone." }),
  goals: z.string().trim().max(500).optional(),
});
export type ProfileSettingsInput = z.infer<typeof ProfileSettingsSchema>;

export const AvailabilitySettingsSchema = z.object({
  presetIds: z.array(z.string()).max(10),
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
