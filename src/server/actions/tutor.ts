"use server";

import { revalidatePath } from "next/cache";
import * as z from "zod";
import { requireUserOrThrow } from "@/lib/auth/dal";
import { checkRateLimit } from "@/lib/auth/rate-limit";
import { takeHint } from "@/lib/tutor/checks";
import { acceptPracticeOffer, acceptRevisionPlan } from "@/lib/tutor/offers";
import { pinBlock } from "./schedule";

// The student's own clicks on tutor cards. Each reads the session, validates
// input, and calls a service that re-checks ownership of every id (tested in
// src/lib/tutor/course-tutor.integration.test.ts).

const Id = z.string().min(1).max(64);
type Result<T = object> = ({ success: true } & T) | { error: string };

/** "Hint" on a check card: the next stored hint, no AI involved. */
export async function takeTutorHintAction(input: { checkId: string }): Promise<Result<{ n: number; hint: string | null; remaining: number }>> {
  const user = await requireUserOrThrow();
  const parsed = z.object({ checkId: Id }).safeParse(input);
  if (!parsed.success) return { error: "Invalid request." };
  const result = await takeHint(user.id, parsed.data.checkId, { via: "button" });
  if (!result.ok) return { error: result.error };
  return { success: true, n: result.n, hint: result.hint, remaining: result.remaining };
}

/** "Add these sessions to my plan" on a revision plan card, through the planner's own pinBlock. */
export async function acceptTutorRevisionPlanAction(input: { conversationId: string; messageId: string }): Promise<Result<{ added: number; skipped: number; errors: string[] }>> {
  const user = await requireUserOrThrow();
  const parsed = z.object({ conversationId: Id, messageId: Id }).safeParse(input);
  if (!parsed.success) return { error: "Invalid request." };
  const result = await acceptRevisionPlan(user.id, parsed.data, pinBlock);
  if (!result.ok) return { error: result.error };
  revalidatePath("/tutor");
  return { success: true, added: result.added, skipped: result.skipped, errors: result.errors };
}

/** "Generate questions" on a practice offer card, through learning-core's generator. */
export async function acceptTutorPracticeOfferAction(input: { conversationId: string; messageId: string }): Promise<Result<{ generated: number; classId: string }>> {
  const user = await requireUserOrThrow();
  const parsed = z.object({ conversationId: Id, messageId: Id }).safeParse(input);
  if (!parsed.success) return { error: "Invalid request." };
  // Shares the practice page's generation limit.
  const rate = await checkRateLimit(`practice-generate:${user.id}`, { max: 10 });
  if (!rate.allowed) return { error: "Generating too often. Try again in a few minutes." };
  const result = await acceptPracticeOffer(user.id, parsed.data);
  if (!result.ok) return { error: result.error };
  revalidatePath(`/courses/${result.classId}`, "layout");
  revalidatePath("/tutor");
  return { success: true, generated: result.generated, classId: result.classId };
}
