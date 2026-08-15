"use server";

import { db } from "@/lib/db";
import { requireUserOrThrow } from "@/lib/auth/dal";
import { FeedbackSchema, type FeedbackInput } from "@/lib/validation/feedback";
import { logEvent } from "@/lib/analytics/log-event";

export type ActionResult = { error: string } | { success: true };

export async function submitFeedback(input: FeedbackInput): Promise<ActionResult> {
  const user = await requireUserOrThrow();
  const parsed = FeedbackSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }
  const data = parsed.data;

  await db.feedback.create({
    data: {
      userId: user.id,
      context: data.context,
      rating: data.rating,
      message: data.message || null,
    },
  });

  await logEvent(user.id, "feedback_submitted", { context: data.context });
  return { success: true };
}
