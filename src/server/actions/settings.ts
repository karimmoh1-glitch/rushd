"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireUserOrThrow } from "@/lib/auth/dal";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { deleteSession } from "@/lib/auth/session";
import {
  ProfileSettingsSchema,
  AvailabilitySettingsSchema,
  ChangePasswordSchema,
  type ProfileSettingsInput,
  type AvailabilitySettingsInput,
  type ChangePasswordInput,
} from "@/lib/validation/settings";
import { presetToWindows } from "@/lib/planning/availability-presets";
import { regeneratePlanSnapshot } from "@/server/actions/plans";

export type ActionResult = { error: string } | { success: true };

export async function updateProfile(
  input: ProfileSettingsInput,
): Promise<ActionResult> {
  const user = await requireUserOrThrow();
  const parsed = ProfileSettingsSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }
  const data = parsed.data;

  await db.profile.update({
    where: { userId: user.id },
    data: {
      displayName: data.displayName,
      grade: data.grade,
      school: data.school || null,
      timezone: data.timezone,
      goals: data.goals || null,
      primaryChallenge: data.primaryChallenge,
    },
  });

  revalidatePath("/settings");
  revalidatePath("/dashboard");
  revalidatePath("/profile");
  return { success: true };
}

export async function updateAvailability(
  input: AvailabilitySettingsInput,
): Promise<ActionResult> {
  const user = await requireUserOrThrow();
  const parsed = AvailabilitySettingsSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }

  const windows = parsed.data.presetIds.flatMap(presetToWindows);

  await db.$transaction([
    db.studyAvailability.deleteMany({ where: { userId: user.id } }),
    ...(windows.length > 0
      ? [
          db.studyAvailability.createMany({
            data: windows.map((w) => ({ userId: user.id, ...w })),
          }),
        ]
      : []),
  ]);

  await regeneratePlanSnapshot(user.id);
  revalidatePath("/settings");
  revalidatePath("/dashboard");
  return { success: true };
}

export async function changePassword(
  input: ChangePasswordInput,
): Promise<ActionResult> {
  const user = await requireUserOrThrow();
  const parsed = ChangePasswordSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }

  const record = await db.user.findUnique({
    where: { id: user.id },
    select: { passwordHash: true },
  });
  if (!record) return { error: "Account not found." };

  const valid = await verifyPassword(parsed.data.currentPassword, record.passwordHash);
  if (!valid) return { error: "Current password is incorrect." };

  const passwordHash = await hashPassword(parsed.data.newPassword);
  await db.user.update({ where: { id: user.id }, data: { passwordHash } });

  return { success: true };
}

export async function deleteAccount(confirmText: string): Promise<ActionResult> {
  const user = await requireUserOrThrow();
  if (confirmText !== "DELETE") {
    return { error: 'Type "DELETE" to confirm.' };
  }

  await db.user.delete({ where: { id: user.id } });
  await deleteSession();
  redirect("/");
}
