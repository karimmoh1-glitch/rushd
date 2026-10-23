"use server";

import { requireUserOrThrow } from "@/lib/auth/dal";
import type { OnboardingInput } from "@/lib/validation/onboarding-setup";
import { logEvent } from "@/lib/analytics/log-event";
import { isCourseLevel } from "@/lib/courses/catalog/levels";
import { completeOnboardingFor } from "@/lib/onboarding/service";
import { regeneratePlanSnapshot } from "@/server/actions/plans";

export type OnboardingResult =
  | { error: string }
  | { success: true; courseCount: number; workCount: number; availabilityWindowCount: number };

export async function completeOnboarding(input: OnboardingInput): Promise<OnboardingResult> {
  const user = await requireUserOrThrow();
  const outcome = await completeOnboardingFor(user.id, input);
  if (!outcome.ok) return { error: outcome.error };
  // The first plan, so Today opens on a real next step.
  if (!outcome.alreadyDone) await regeneratePlanSnapshot(user.id);
  return {
    success: true,
    courseCount: outcome.courseCount,
    workCount: outcome.workCount,
    availabilityWindowCount: outcome.availabilityWindowCount,
  };
}

/** Records which level a student picked, so drop-off after this step is measurable. */
export async function recordOnboardingLevel(level: string): Promise<void> {
  const user = await requireUserOrThrow();
  if (user.onboardingCompletedAt || !isCourseLevel(level)) return;
  await logEvent(user.id, "onboarding_level_selected", { level });
}
