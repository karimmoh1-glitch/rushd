"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import * as z from "zod";
import { db } from "@/lib/db";
import { Prisma } from "@/generated/prisma/client";
import { requireUserOrThrow } from "@/lib/auth/dal";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { createSession, deleteSession } from "@/lib/auth/session";
import {
  ProfileSettingsSchema,
  AvailabilitySettingsSchema,
  ChangePasswordSchema,
  PlanningPreferencesSchema,
  type PlanningPreferencesInput,
  type ProfileSettingsInput,
  type AvailabilitySettingsInput,
  type ChangePasswordInput,
} from "@/lib/validation/settings";
import { presetToWindows } from "@/lib/planning/availability-presets";
import { regeneratePlanSnapshot } from "@/server/actions/plans";
import { MAX_INSTRUCTIONS, TutorPreferencesSchema, sanitizeInstructions } from "@/lib/tutor/preferences";

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

  // Replace all of the student's windows in one transaction.
  const steps: Prisma.PrismaPromise<Prisma.BatchPayload>[] = [
    db.studyAvailability.deleteMany({ where: { userId: user.id } }),
  ];
  if (windows.length > 0) {
    const rows = windows.map((window) => ({ userId: user.id, ...window }));
    steps.push(db.studyAvailability.createMany({ data: rows }));
  }
  await db.$transaction(steps);

  await regeneratePlanSnapshot(user.id);
  revalidatePath("/settings");
  revalidatePath("/dashboard");
  return { success: true };
}

export async function updatePlanningPreferences(
  input: PlanningPreferencesInput,
): Promise<ActionResult> {
  const user = await requireUserOrThrow();
  const parsed = PlanningPreferencesSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }
  await db.profile.update({
    where: { userId: user.id },
    data: parsed.data,
  });
  await regeneratePlanSnapshot(user.id);
  revalidatePath("/settings");
  revalidatePath("/dashboard");
  revalidatePath("/plan");
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
  // Bumping the session version signs out every other device; this one gets
  // a fresh token under the new version.
  const updated = await db.user.update({
    where: { id: user.id },
    data: { passwordHash, sessionVersion: { increment: 1 } },
    select: { sessionVersion: true },
  });
  await createSession(user.id, updated.sessionVersion);

  return { success: true };
}

export async function signOutEverywhere(): Promise<void> {
  const user = await requireUserOrThrow();
  await db.user.update({ where: { id: user.id }, data: { sessionVersion: { increment: 1 } } });
  await deleteSession();
  redirect("/login");
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

const TutorSettingsInput = z.object({
  instructions: z.string().max(MAX_INSTRUCTIONS, `Keep it under ${MAX_INSTRUCTIONS} characters.`),
  preferences: TutorPreferencesSchema,
});

export async function updateTutorPreferences(input: z.input<typeof TutorSettingsInput>): Promise<ActionResult> {
  const user = await requireUserOrThrow();
  const parsed = TutorSettingsInput.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input." };
  await db.profile.update({
    where: { userId: user.id },
    data: {
      tutorInstructions: sanitizeInstructions(parsed.data.instructions) || null,
      tutorPreferences: parsed.data.preferences,
    },
  });
  revalidatePath("/settings");
  return { success: true };
}

export async function resetTutorPreferences(): Promise<ActionResult> {
  const user = await requireUserOrThrow();
  await db.profile.update({ where: { userId: user.id }, data: { tutorInstructions: null, tutorPreferences: Prisma.DbNull } });
  revalidatePath("/settings");
  return { success: true };
}

export async function setEmailReminders(on: boolean): Promise<ActionResult> {
  const user = await requireUserOrThrow();
  await db.profile.updateMany({ where: { userId: user.id }, data: { emailReminders: on === true } });
  revalidatePath("/settings");
  return { success: true };
}
