"use server";

import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { requireUserOrThrow } from "@/lib/auth/dal";
import { OnboardingSchema, type OnboardingInput } from "@/lib/validation/onboarding";
import { logEvent } from "@/lib/analytics/log-event";
import { regeneratePlanSnapshot } from "@/server/actions/plans";

export type OnboardingResult = { error: string } | { success: true };

export async function completeOnboarding(
  input: OnboardingInput,
): Promise<OnboardingResult> {
  const user = await requireUserOrThrow();

  const parsed = OnboardingSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }
  const data = parsed.data;

  await db.$transaction(async (tx) => {
    await tx.profile.upsert({
      where: { userId: user.id },
      create: {
        userId: user.id,
        displayName: data.displayName,
        grade: data.grade,
        school: data.school || null,
        timezone: data.timezone,
        goals: data.goals || null,
      },
      update: {
        displayName: data.displayName,
        grade: data.grade,
        school: data.school || null,
        timezone: data.timezone,
        goals: data.goals || null,
      },
    });

    if (data.availability.length > 0) {
      await tx.studyAvailability.createMany({
        data: data.availability.map((window) => ({
          userId: user.id,
          ...window,
        })),
      });
    }

    if (data.classes.length > 0) {
      await tx.class.createMany({
        data: data.classes.map((c) => ({
          userId: user.id,
          name: c.name,
          color: c.color,
          teacher: c.teacher || null,
        })),
      });
    }

    await tx.user.update({
      where: { id: user.id },
      data: { onboardingCompletedAt: new Date() },
    });
  });

  await logEvent(user.id, "onboarding_completed", {
    classCount: data.classes.length,
    availabilityWindowCount: data.availability.length,
  });
  await regeneratePlanSnapshot(user.id);

  redirect("/dashboard");
}
